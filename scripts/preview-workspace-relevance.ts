import "dotenv/config";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { previewSource } from "../server/feed-worker";
import { evaluateWorkspaceRelevance, normalizeWorkspaceProfile, type WorkspaceProfile } from "../shared/workspace-relevance";

type Args = {
  workspaceId?: number;
  sourceId?: number;
  url?: string;
  type?: string;
  country?: string;
  limit: number;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: 20, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [name, inlineValue] = token.includes("=") ? token.split(/=(.*)/s, 2) : [token, undefined];
    const readValue = () => inlineValue ?? argv[++index];
    if (name === "--workspace-id") args.workspaceId = Number(readValue());
    else if (name === "--source-id") args.sourceId = Number(readValue());
    else if (name === "--url") args.url = String(readValue());
    else if (name === "--type") args.type = String(readValue());
    else if (name === "--country") args.country = String(readValue());
    else if (name === "--limit") args.limit = Number(readValue());
    else if (name === "--help" || name === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!args.help && (!Number.isInteger(args.workspaceId) || Number(args.workspaceId) <= 0)) {
    throw new Error("Preview requires --workspace-id <id>");
  }
  if (args.sourceId !== undefined && (!Number.isInteger(args.sourceId) || args.sourceId <= 0)) {
    throw new Error("Invalid --source-id value");
  }
  if (!Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 100) {
    throw new Error("Invalid --limit value. Use 1-100.");
  }
  return args;
}

function printHelp() {
  console.log(`
Workspace relevance source preview

By source ID:
  npm run preview:workspace-relevance -- --workspace-id 1 --source-id 25 --limit 20

By URL/type:
  npm run preview:workspace-relevance -- --workspace-id 1 --url https://example.com/rss.xml --type rss --limit 20

The command fetches a sample and returns relevance counts. It does not insert articles, sources, clients, workspaces, analytics, alerts, or reports.
`);
}

async function buildWorkspaceProfile(workspaceId: number): Promise<WorkspaceProfile> {
  const workspace = await storage.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);
  const profile = await storage.getWorkspaceRelevanceProfile(workspace.id, workspace.clientId);
  return normalizeWorkspaceProfile({
    id: workspace.id,
    clientId: workspace.clientId,
    name: workspace.name,
    description: workspace.description,
    purpose: workspace.purpose,
    scopeMode: workspace.scopeMode,
    globalScope: workspace.globalScope,
    primaryCountryCodes: workspace.primaryCountryCodes || [],
    secondaryCountryCodes: workspace.secondaryCountryCodes || [],
    regionCodes: workspace.regionCodes || [],
    subnationalAreas: workspace.subnationalAreas || [],
    preferredLanguages: workspace.preferredLanguages || [],
    timezone: workspace.timezone,
    taxonomyTemplateCode: workspace.taxonomyTemplateCode,
    relevanceProfileCode: workspace.relevanceProfileCode,
    reportingTemplateCode: workspace.reportingTemplateCode,
    active: workspace.active,
    topics: profile?.topics || [],
    subtopics: profile?.subtopics || [],
    industries: profile?.industries || [],
    entities: profile?.entities || [],
    organizations: profile?.organizations || [],
    people: profile?.people || [],
    projects: profile?.projects || [],
    events: profile?.events || [],
    multilingualAliases: profile?.multilingualAliases || [],
    inclusionTerms: profile?.inclusionTerms || [],
    exclusionTerms: profile?.exclusionTerms || [],
    impactTerms: profile?.impactTerms || [],
    contextualTerms: profile?.contextualTerms || [],
    minimumConfidence: profile?.minimumConfidence ?? 60,
    includeContextualByDefault: profile?.includeContextualByDefault ?? false,
    contextualLabel: profile?.contextualLabel || "Strategic Context",
    profileVersion: profile?.profileVersion ?? 1,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const profile = await buildWorkspaceProfile(args.workspaceId!);
  let source = {
    id: 0,
    name: args.url || "ad-hoc source",
    url: args.url || "",
    type: args.type || "rss",
    country: args.country || undefined,
    category: undefined as string | undefined,
    collectorConfig: undefined as any,
    filterConfig: undefined as any,
  };

  if (args.sourceId) {
    const existing = await storage.getSource(args.sourceId);
    if (!existing) throw new Error(`Source ${args.sourceId} not found`);
    source = {
      id: existing.id,
      name: existing.name,
      url: existing.url,
      type: existing.type,
      country: existing.country || undefined,
      category: existing.category || undefined,
      collectorConfig: existing.collectorConfig,
      filterConfig: existing.filterConfig,
    };
  }

  if (!source.url || !source.type) throw new Error("Provide --source-id or both --url and --type");

  const preview = await previewSource(
    source.url,
    source.type,
    args.limit,
    source.country,
    source.collectorConfig,
    source.filterConfig,
  );

  const rows = preview.articles.map((article) => {
    const relevance = evaluateWorkspaceRelevance({
      title: article.title,
      summary: article.content,
      content: article.content,
      url: article.url,
      sourceName: source.name,
      sourceCategory: source.category,
    }, profile);
    return {
      status: relevance.relevanceStatus,
      confidence: relevance.confidence,
      title: article.title,
      url: article.url,
      reason: relevance.shortReason,
      matchedScope: relevance.matchedScope,
      supportingSignals: relevance.supportingSignals,
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    writes: false,
    workspace: {
      id: profile.id || null,
      name: profile.name || null,
      scopeMode: profile.scopeMode || null,
      primaryCountryCodes: profile.primaryCountryCodes || [],
      regionCodes: profile.regionCodes || [],
    },
    source: { id: source.id || null, name: source.name, type: source.type, url: source.url },
    preview: {
      success: preview.success,
      method: preview.method,
      feedUrl: preview.feedUrl,
      error: preview.error,
      warnings: preview.warnings || [],
    },
    counts,
    rows,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
