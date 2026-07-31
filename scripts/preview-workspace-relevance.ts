import "dotenv/config";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { previewSource } from "../server/feed-worker";
import { buildDefaultWorkspaceProfile, evaluateWorkspaceRelevance } from "../shared/workspace-relevance";

type Args = {
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
    if (name === "--source-id") args.sourceId = Number(readValue());
    else if (name === "--url") args.url = String(readValue());
    else if (name === "--type") args.type = String(readValue());
    else if (name === "--country") args.country = String(readValue());
    else if (name === "--limit") args.limit = Number(readValue());
    else if (name === "--help" || name === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
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
  npm run preview:workspace-relevance -- --source-id 25 --limit 20

By URL/type:
  npm run preview:workspace-relevance -- --url https://example.com/rss.xml --type rss --limit 20
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

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
    const profile = {
      ...buildDefaultWorkspaceProfile({
        name: "Preview Default Workspace",
        sourceCountry: source.country,
        sourceCategory: source.category,
      }),
      globalScope: !source.country && !source.category,
    };
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
      confidence: relevance.relevanceConfidence,
      title: article.title,
      url: article.url,
      reason: relevance.relevanceReason,
      matchedSignals: relevance.relevanceMatchedSignals,
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    writes: false,
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


