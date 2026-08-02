import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import {
  RELEVANCE_ENGINE_VERSION,
  evaluateWorkspaceRelevance,
  normalizeWorkspaceProfile,
  type ArticleRelevanceStatus,
  type WorkspaceProfile,
  type WorkspaceRelevanceResult,
} from "../shared/workspace-relevance";

type Args = {
  apply: boolean;
  dryRun: boolean;
  allWorkspaces: boolean;
  workspaceId?: number;
  batchSize: number;
  limit?: number;
  enableAi: boolean;
  help: boolean;
};

type WorkspaceRow = {
  id: number;
  client_id: number;
  name: string;
  description: string | null;
  purpose: string | null;
  scope_mode: string | null;
  global_scope: boolean | null;
  primary_country_codes: string[] | null;
  secondary_country_codes: string[] | null;
  region_codes: string[] | null;
  subnational_areas: string[] | null;
  preferred_languages: string[] | null;
  timezone: string | null;
  taxonomy_template_code: string | null;
  relevance_profile_code: string | null;
  reporting_template_code: string | null;
  active: boolean | null;
  profile_id: number | null;
  topics: string[] | null;
  subtopics: string[] | null;
  industries: string[] | null;
  entities: string[] | null;
  organizations: string[] | null;
  people: string[] | null;
  projects: string[] | null;
  events: string[] | null;
  multilingual_aliases: Record<string, string[]> | string[] | null;
  inclusion_terms: string[] | null;
  exclusion_terms: string[] | null;
  impact_terms: string[] | null;
  contextual_terms: string[] | null;
  minimum_confidence: number | null;
  include_contextual_by_default: boolean | null;
  contextual_label: string | null;
  profile_version: number | null;
  profile_active: boolean | null;
};

type ArticleRow = {
  id: number;
  client_id: number;
  source_id: number | null;
  title: string | null;
  summary: string | null;
  content: string | null;
  content_clean: string | null;
  url: string | null;
  image_url: string | null;
  sub_source: string | null;
  language: string | null;
  country: string | null;
  topics: string[] | null;
  keywords: string[] | null;
  source_name: string | null;
  source_category: string | null;
};

type ExistingRelevanceRow = {
  article_id: number;
  relevance_status: string;
  confidence: number;
  short_reason: string | null;
  matched_scope: unknown;
  principal_country_codes: string[] | null;
  materially_affected_country_codes: string[] | null;
  supporting_signals: unknown;
  evaluation_method: string;
  evaluator_version: string;
  manual_override: boolean;
};

const REQUIRED_TABLES = [
  "workspaces",
  "workspace_relevance_profiles",
  "article_workspace_relevance",
  "workspace_relevance_history",
  "articles",
  "sources",
];

const REQUIRED_WORKSPACE_COLUMNS = [
  "purpose",
  "scope_mode",
  "global_scope",
  "primary_country_codes",
  "secondary_country_codes",
  "region_codes",
  "subnational_areas",
  "preferred_languages",
  "timezone",
  "taxonomy_template_code",
  "relevance_profile_code",
  "reporting_template_code",
  "active",
  "updated_at",
];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    dryRun: true,
    allWorkspaces: false,
    batchSize: 500,
    enableAi: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [name, inlineValue] = token.includes("=") ? token.split(/=(.*)/s, 2) : [token, undefined];
    const readValue = () => inlineValue ?? argv[++index];
    if (name === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (name === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
    } else if (name === "--workspace-id") args.workspaceId = Number(readValue());
    else if (name === "--all-workspaces") args.allWorkspaces = true;
    else if (name === "--batch-size") args.batchSize = Number(readValue());
    else if (name === "--limit") args.limit = Number(readValue());
    else if (name === "--enable-ai") args.enableAi = true;
    else if (name === "--help" || name === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (args.workspaceId !== undefined && (!Number.isInteger(args.workspaceId) || args.workspaceId <= 0)) {
    throw new Error("Invalid --workspace-id value");
  }
  if (args.workspaceId && args.allWorkspaces) {
    throw new Error("Use either --workspace-id or --all-workspaces, not both");
  }
  if (!args.workspaceId && !args.allWorkspaces && !args.help) {
    throw new Error("Backfill requires --workspace-id <id> or --all-workspaces");
  }
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 5000) {
    throw new Error("Invalid --batch-size value. Use 1-5000.");
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error("Invalid --limit value");
  }
  return args;
}

function printHelp() {
  console.log(`
Workspace relevance backfill

Dry run:
  npm run backfill:workspace-relevance -- --dry-run --workspace-id 1
  npm run backfill:workspace-relevance -- --dry-run --all-workspaces

Apply:
  npm run backfill:workspace-relevance -- --apply --workspace-id 1
  npm run backfill:workspace-relevance -- --apply --all-workspaces

Options:
  --batch-size 500
  --limit 1000
  --enable-ai   Reserved for a future AI-assisted pass. The deterministic backfill never calls AI by default.
`);
}

function checksum(values: number[]) {
  return crypto.createHash("sha256").update(values.join(",")).digest("hex");
}

function increment(map: Map<string, number>, key: string | null | undefined) {
  const normalized = key || "null";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function mapToObject(map: Map<string, number>) {
  return Object.fromEntries(Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

function workspaceProfile(row: WorkspaceRow): WorkspaceProfile {
  return normalizeWorkspaceProfile({
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    description: row.description,
    purpose: row.purpose,
    scopeMode: row.scope_mode,
    globalScope: row.global_scope,
    primaryCountryCodes: row.primary_country_codes || [],
    secondaryCountryCodes: row.secondary_country_codes || [],
    regionCodes: row.region_codes || [],
    subnationalAreas: row.subnational_areas || [],
    preferredLanguages: row.preferred_languages || [],
    timezone: row.timezone,
    taxonomyTemplateCode: row.taxonomy_template_code,
    relevanceProfileCode: row.relevance_profile_code,
    reportingTemplateCode: row.reporting_template_code,
    active: row.active !== false,
    topics: row.topics || [],
    subtopics: row.subtopics || [],
    industries: row.industries || [],
    entities: row.entities || [],
    organizations: row.organizations || [],
    people: row.people || [],
    projects: row.projects || [],
    events: row.events || [],
    multilingualAliases: row.multilingual_aliases || [],
    inclusionTerms: row.inclusion_terms || [],
    exclusionTerms: row.exclusion_terms || [],
    impactTerms: row.impact_terms || [],
    contextualTerms: row.contextual_terms || [],
    minimumConfidence: row.minimum_confidence ?? 60,
    includeContextualByDefault: row.include_contextual_by_default ?? false,
    contextualLabel: row.contextual_label || "Strategic Context",
    profileVersion: row.profile_version ?? 1,
  });
}

async function inspectSchema(client: pg.Client) {
  const tables = await client.query<{ table_name: string }>(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
  `, [REQUIRED_TABLES]);
  const existingTables = new Set(tables.rows.map((row) => row.table_name));
  const columns = await client.query<{ column_name: string }>(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'workspaces'
       AND column_name = ANY($1::text[])
  `, [REQUIRED_WORKSPACE_COLUMNS]);
  const existingWorkspaceColumns = new Set(columns.rows.map((row) => row.column_name));
  const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.has(table));
  const missingWorkspaceColumns = REQUIRED_WORKSPACE_COLUMNS.filter((column) => !existingWorkspaceColumns.has(column));
  return {
    schemaReady: missingTables.length === 0 && missingWorkspaceColumns.length === 0,
    missingTables,
    missingWorkspaceColumns,
  };
}

async function loadWorkspaces(client: pg.Client, args: Args): Promise<WorkspaceRow[]> {
  const params: unknown[] = [];
  const where = ["w.active IS NOT FALSE"];
  if (args.workspaceId) {
    params.push(args.workspaceId);
    where.push(`w.id = $${params.length}`);
  }
  const result = await client.query<WorkspaceRow>(`
    SELECT
      w.id,
      w.client_id,
      w.name,
      w.description,
      w.purpose,
      w.scope_mode,
      w.global_scope,
      w.primary_country_codes,
      w.secondary_country_codes,
      w.region_codes,
      w.subnational_areas,
      w.preferred_languages,
      w.timezone,
      w.taxonomy_template_code,
      w.relevance_profile_code,
      w.reporting_template_code,
      w.active,
      p.id as profile_id,
      p.topics,
      p.subtopics,
      p.industries,
      p.entities,
      p.organizations,
      p.people,
      p.projects,
      p.events,
      p.multilingual_aliases,
      p.inclusion_terms,
      p.exclusion_terms,
      p.impact_terms,
      p.contextual_terms,
      p.minimum_confidence,
      p.include_contextual_by_default,
      p.contextual_label,
      p.profile_version,
      p.active as profile_active
    FROM workspaces w
    LEFT JOIN workspace_relevance_profiles p ON p.workspace_id = w.id
    WHERE ${where.join(" AND ")}
    ORDER BY w.id ASC
  `, params);
  return result.rows;
}

async function loadArticleBatch(client: pg.Client, workspace: WorkspaceRow, afterId: number, limit: number): Promise<ArticleRow[]> {
  const result = await client.query<ArticleRow>(`
    SELECT
      a.id,
      a.client_id,
      a.source_id,
      a.title,
      a.summary,
      a.content,
      a.content_clean,
      a.url,
      a.image_url,
      a.sub_source,
      a.language,
      a.country,
      a.topics,
      a.keywords,
      s.name as source_name,
      s.category as source_category
    FROM articles a
    LEFT JOIN sources s ON s.id = a.source_id
    WHERE a.client_id = $1
      AND a.id > $2
    ORDER BY a.id ASC
    LIMIT $3
  `, [workspace.client_id, afterId, limit]);
  return result.rows;
}

async function loadExistingRelevance(
  client: pg.Client,
  workspaceId: number,
  articleIds: number[],
): Promise<Map<number, ExistingRelevanceRow>> {
  if (articleIds.length === 0) return new Map<number, ExistingRelevanceRow>();
  const result = await client.query<ExistingRelevanceRow>(`
    SELECT
      article_id,
      relevance_status,
      confidence,
      short_reason,
      matched_scope,
      principal_country_codes,
      materially_affected_country_codes,
      supporting_signals,
      evaluation_method,
      evaluator_version,
      manual_override
      FROM article_workspace_relevance
     WHERE workspace_id = $1
       AND article_id = ANY($2::int[])
  `, [workspaceId, articleIds]);
  return new Map<number, ExistingRelevanceRow>(result.rows.map((row) => [Number(row.article_id), row]));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function relevanceNeedsUpdate(current: ExistingRelevanceRow | null | undefined, relevance: WorkspaceRelevanceResult): boolean {
  if (!current) return true;
  return current.relevance_status !== relevance.relevanceStatus ||
    Number(current.confidence) !== relevance.confidence ||
    (current.short_reason || "") !== (relevance.shortReason || "") ||
    current.evaluation_method !== relevance.evaluationMethod ||
    current.evaluator_version !== relevance.evaluatorVersion ||
    stableJson(current.matched_scope || {}) !== stableJson(relevance.matchedScope || {}) ||
    stableJson(current.principal_country_codes || []) !== stableJson(relevance.principalCountryCodes || []) ||
    stableJson(current.materially_affected_country_codes || []) !== stableJson(relevance.materiallyAffectedCountryCodes || []) ||
    stableJson(current.supporting_signals || []) !== stableJson(relevance.supportingSignals || []);
}

async function upsertRelevance(
  client: pg.Client,
  workspace: WorkspaceRow,
  article: ArticleRow,
  relevance: WorkspaceRelevanceResult,
  current: ExistingRelevanceRow | null | undefined,
) {
  await client.query(`
    INSERT INTO article_workspace_relevance (
      client_id,
      workspace_id,
      article_id,
      relevance_status,
      confidence,
      short_reason,
      matched_scope,
      principal_country_codes,
      materially_affected_country_codes,
      supporting_signals,
      evaluation_method,
      evaluator_version,
      evaluated_at,
      manual_override,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::jsonb, $8::text[], $9::text[], $10::jsonb, 'deterministic', $11, NOW(), false, NOW(), NOW()
    )
    ON CONFLICT (workspace_id, article_id) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      relevance_status = EXCLUDED.relevance_status,
      confidence = EXCLUDED.confidence,
      short_reason = EXCLUDED.short_reason,
      matched_scope = EXCLUDED.matched_scope,
      principal_country_codes = EXCLUDED.principal_country_codes,
      materially_affected_country_codes = EXCLUDED.materially_affected_country_codes,
      supporting_signals = EXCLUDED.supporting_signals,
      evaluation_method = EXCLUDED.evaluation_method,
      evaluator_version = EXCLUDED.evaluator_version,
      evaluated_at = EXCLUDED.evaluated_at,
      updated_at = NOW()
    WHERE article_workspace_relevance.manual_override IS NOT TRUE
  `, [
    workspace.client_id,
    workspace.id,
    article.id,
    relevance.relevanceStatus,
    relevance.confidence,
    relevance.shortReason,
    JSON.stringify(relevance.matchedScope || {}),
    relevance.principalCountryCodes || [],
    relevance.materiallyAffectedCountryCodes || [],
    JSON.stringify(relevance.supportingSignals || []),
    RELEVANCE_ENGINE_VERSION,
  ]);

  await client.query(`
    INSERT INTO workspace_relevance_history (
      client_id,
      workspace_id,
      article_id,
      previous_status,
      new_status,
      previous_confidence,
      new_confidence,
      evaluation_method,
      reason,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'deterministic', $8, NOW())
  `, [
    workspace.client_id,
    workspace.id,
    article.id,
    current?.relevance_status || null,
    relevance.relevanceStatus,
    current?.confidence ?? null,
    relevance.confidence,
    relevance.shortReason,
  ]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (args.enableAi) {
    console.warn("--enable-ai was supplied, but this backfill currently performs deterministic evaluation only.");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const schema = await inspectSchema(client);
    if (!schema.schemaReady) {
      const report = {
        command: "backfill:workspace-relevance",
        mode: args.apply ? "apply" : "dry-run",
        writes: false,
        schemaReady: false,
        missingTables: schema.missingTables,
        missingWorkspaceColumns: schema.missingWorkspaceColumns,
        requiredMigration: "npm run db:migrate:workspace-relevance -- --apply",
      };
      if (args.apply) {
        throw new Error(JSON.stringify(report, null, 2));
      }
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const workspaces = await loadWorkspaces(client, args);
    const counts = new Map<ArticleRelevanceStatus | string, number>();
    const existingCounts = new Map<string, number>();
    const updates: Array<{
      workspaceId: number;
      articleId: number;
      from: string | null;
      to: ArticleRelevanceStatus;
      previousConfidence: number | null;
      newConfidence: number;
      previousEvaluatorVersion: string | null;
      newEvaluatorVersion: string;
      title: string;
      reason: string;
    }> = [];
    const articleIds: number[] = [];
    let evaluated = 0;
    let skippedManual = 0;
    let alreadyCurrent = 0;

    if (args.apply) await client.query("BEGIN");
    try {
      for (const workspace of workspaces) {
        const profile = workspaceProfile(workspace);
        let afterId = 0;
        let reachedLimit = false;
        while (!reachedLimit) {
          const remaining = args.limit ? Math.max(0, args.limit - evaluated) : args.batchSize;
          if (remaining === 0) break;
          const batch = await loadArticleBatch(client, workspace, afterId, Math.min(args.batchSize, remaining));
          if (batch.length === 0) break;
          afterId = Number(batch[batch.length - 1].id);
          const existing = await loadExistingRelevance(client, workspace.id, batch.map((row) => row.id));

          for (const article of batch) {
            const current = existing.get(article.id);
            if (current?.manual_override) {
              skippedManual += 1;
              continue;
            }
            const relevance = evaluateWorkspaceRelevance({
              title: article.title,
              summary: article.summary,
              content: article.content_clean || article.content,
              url: article.url,
              imageTitle: article.image_url,
              sourceName: article.source_name,
              sourceCategory: article.source_category,
              subSource: article.sub_source,
              language: article.language,
              topics: article.topics,
              keywords: article.keywords,
            }, profile);
            evaluated += 1;
            articleIds.push(article.id);
            increment(counts, relevance.relevanceStatus);
            increment(existingCounts, current?.relevance_status || null);

            if (!relevanceNeedsUpdate(current, relevance)) {
              alreadyCurrent += 1;
              continue;
            }

            updates.push({
              workspaceId: workspace.id,
              articleId: article.id,
              from: current?.relevance_status || null,
              to: relevance.relevanceStatus,
              previousConfidence: current?.confidence ?? null,
              newConfidence: relevance.confidence,
              previousEvaluatorVersion: current?.evaluator_version || null,
              newEvaluatorVersion: relevance.evaluatorVersion,
              title: article.title || "",
              reason: relevance.shortReason,
            });

            if (args.apply) {
              await upsertRelevance(client, workspace, article, relevance, current);
            }
          }
          reachedLimit = Boolean(args.limit && evaluated >= args.limit);
        }
      }

      if (args.apply) await client.query("COMMIT");
    } catch (error) {
      if (args.apply) await client.query("ROLLBACK");
      throw error;
    }

    console.log(JSON.stringify({
      command: "backfill:workspace-relevance",
      mode: args.apply ? "apply" : "dry-run",
      writes: args.apply,
      aiEnabled: false,
      schemaReady: true,
      filters: {
        workspaceId: args.workspaceId ?? null,
        allWorkspaces: args.allWorkspaces,
        batchSize: args.batchSize,
        limit: args.limit ?? null,
      },
      workspaceCount: workspaces.length,
      evaluatedArticleWorkspacePairs: evaluated,
      articleIdChecksum: checksum(articleIds),
      existingCounts: mapToObject(existingCounts),
      proposedCounts: mapToObject(counts),
      updatesRequired: updates.length,
      skippedManualOverrides: skippedManual,
      alreadyCurrent,
      appliedUpdates: args.apply ? updates.length : 0,
      sampleUpdates: updates.slice(0, 25),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
