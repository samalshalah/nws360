import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import { buildDefaultWorkspaceProfile, evaluateWorkspaceRelevance, type ArticleRelevanceStatus } from "../shared/workspace-relevance";

type Args = {
  apply: boolean;
  confirmBackup: boolean;
  clientId?: number;
  sourceId?: number;
  articleId?: number;
  limit?: number;
  help: boolean;
};

type ArticleRow = {
  id: number;
  title: string | null;
  summary: string | null;
  content: string | null;
  content_clean: string | null;
  url: string | null;
  image_url: string | null;
  sub_source: string | null;
  source_name: string | null;
  source_category: string | null;
  source_country: string | null;
  relevance_status: string | null;
  relevance_method: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, confirmBackup: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [name, inlineValue] = token.includes("=") ? token.split(/=(.*)/s, 2) : [token, undefined];
    const readValue = () => inlineValue ?? argv[++index];
    if (name === "--apply") args.apply = true;
    else if (name === "--confirm-backup") args.confirmBackup = true;
    else if (name === "--client-id") args.clientId = Number(readValue());
    else if (name === "--source-id") args.sourceId = Number(readValue());
    else if (name === "--article-id") args.articleId = Number(readValue());
    else if (name === "--limit") args.limit = Number(readValue());
    else if (name === "--help" || name === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  for (const [name, value] of Object.entries(args)) {
    if (["clientId", "sourceId", "articleId", "limit"].includes(name) && value !== undefined && (!Number.isInteger(value) || Number(value) <= 0)) {
      throw new Error(`Invalid --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} value`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Workspace relevance backfill

Dry run, no writes:
  npm run backfill:workspace-relevance

Apply, only after a verified backup:
  npm run backfill:workspace-relevance -- --apply --confirm-backup

Optional filters:
  --client-id 1
  --source-id 25
  --article-id 123
  --limit 500
`);
}

function checksum(ids: number[]) {
  return crypto.createHash("sha256").update(ids.join(",")).digest("hex");
}

function increment(map: Map<string, number>, key: string | null | undefined) {
  const normalized = key || "null";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function mapToObject(map: Map<string, number>) {
  return Object.fromEntries(Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.apply && !args.confirmBackup) {
    throw new Error("--apply requires --confirm-backup. Create and verify a Neon backup before applying.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const where: string[] = ["a.relevance_method IS DISTINCT FROM 'manual'"];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (args.clientId) add("a.client_id = ?", args.clientId);
    if (args.sourceId) add("a.source_id = ?", args.sourceId);
    if (args.articleId) add("a.id = ?", args.articleId);

    const limitSql = args.limit ? `LIMIT ${args.limit}` : "";
    const result = await client.query<ArticleRow>(`
      SELECT
        a.id,
        a.title,
        a.summary,
        a.content,
        a.content_clean,
        a.url,
        a.image_url,
        a.sub_source,
        a.relevance_status,
        a.relevance_method,
        s.name as source_name,
        s.category as source_category,
        s.country as source_country
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE ${where.join(" AND ")}
      ORDER BY a.id ASC
      ${limitSql}
    `, values);

    const rows = result.rows;
    const currentCounts = new Map<string, number>();
    const proposedCounts = new Map<string, number>();
    const ids = rows.map((row) => Number(row.id));
    const updates: {
      id: number;
      status: ArticleRelevanceStatus;
      confidence: number;
      reason: string;
      matchedSignals: string[];
      previousStatus: string | null;
      title: string;
    }[] = [];

    for (const row of rows) {
      increment(currentCounts, row.relevance_status);
      const profile = {
        ...buildDefaultWorkspaceProfile({
          clientId: args.clientId,
          name: "Backfill Default Workspace",
          sourceCountry: row.source_country,
          sourceCategory: row.source_category,
        }),
        globalScope: !row.source_country && !row.source_category,
      };
      const relevance = evaluateWorkspaceRelevance({
        title: row.title,
        summary: row.summary,
        content: row.content_clean || row.content,
        url: row.url,
        imageTitle: row.image_url,
        sourceName: row.source_name,
        sourceCategory: row.source_category,
        subSource: row.sub_source,
      }, profile);
      increment(proposedCounts, relevance.relevanceStatus);
      if (row.relevance_status !== relevance.relevanceStatus || row.relevance_method !== relevance.relevanceMethod) {
        updates.push({
          id: Number(row.id),
          status: relevance.relevanceStatus,
          confidence: relevance.relevanceConfidence,
          reason: relevance.relevanceReason,
          matchedSignals: relevance.relevanceMatchedSignals,
          previousStatus: row.relevance_status,
          title: row.title || "",
        });
      }
    }

    const report = {
      mode: args.apply ? "apply" : "dry-run",
      writes: args.apply,
      filters: {
        clientId: args.clientId ?? null,
        sourceId: args.sourceId ?? null,
        articleId: args.articleId ?? null,
        limit: args.limit ?? null,
      },
      articleCount: rows.length,
      articleIdChecksum: checksum(ids),
      currentCounts: mapToObject(currentCounts),
      proposedCounts: mapToObject(proposedCounts),
      updatesRequired: updates.length,
      sampleUpdates: updates.slice(0, 25).map((update) => ({
        id: update.id,
        from: update.previousStatus,
        to: update.status,
        title: update.title.slice(0, 120),
        reason: update.reason,
        matchedSignals: update.matchedSignals,
      })),
    };

    if (!args.apply) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    await client.query("BEGIN");
    try {
      for (const update of updates) {
        await client.query(`
          UPDATE articles
          SET
            relevance_status = $2,
            relevance_confidence = $3,
            relevance_reason = $4,
            relevance_method = 'deterministic',
            relevance_matched_signals = $5,
            relevance_evaluated_at = NOW()
          WHERE id = $1 AND relevance_method IS DISTINCT FROM 'manual'
        `, [update.id, update.status, update.confidence, update.reason, update.matchedSignals]);
      }
      const after = await client.query<{ count: string; ids: string }>(`
        SELECT COUNT(*)::text as count, COALESCE(string_agg(id::text, ',' ORDER BY id), '') as ids
        FROM articles
        WHERE id = ANY($1::int[])
      `, [ids]);
      const afterCount = Number(after.rows[0]?.count || 0);
      const afterChecksum = crypto.createHash("sha256").update(after.rows[0]?.ids || "").digest("hex");
      if (afterCount !== rows.length || afterChecksum !== checksum(ids)) {
        throw new Error("Integrity check failed: article IDs/count changed during relevance backfill");
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({ ...report, appliedUpdates: updates.length }, null, 2));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});


