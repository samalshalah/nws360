import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { articles, sources } from "../shared/schema";
import { classifyArticleCategory, classifyIraqProvince } from "../shared/article-classifier";

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.replace(/^--/, "").split("=");
  if (key) args.set(key, value || "true");
}

const clientId = args.has("clientId") ? Number(args.get("clientId")) : undefined;
const limit = args.has("limit") ? Number(args.get("limit")) : undefined;
const dryRun = args.get("dryRun") === "true";

if (clientId !== undefined && (!Number.isInteger(clientId) || clientId <= 0)) {
  throw new Error("--clientId must be a positive integer");
}
if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
  throw new Error("--limit must be a positive integer");
}

const conditions = [];
if (clientId) conditions.push(eq(articles.clientId, clientId));

const rows = await db
  .select({
    id: articles.id,
    title: articles.title,
    content: articles.content,
    contentClean: articles.contentClean,
    summary: articles.summary,
    url: articles.url,
    category: articles.category,
    province: articles.province,
    sourceName: sources.name,
    sourceCategory: sources.category,
  })
  .from(articles)
  .leftJoin(sources, eq(articles.sourceId, sources.id))
  .where(conditions.length > 0 ? and(...conditions) : undefined)
  .orderBy(sql`${articles.id} ASC`)
  .limit(limit || 100000);

const categoryCounts = new Map<string, number>();
const provinceCounts = new Map<string, number>();
let changed = 0;

for (const row of rows) {
  const category = classifyArticleCategory({
    title: row.title,
    summary: row.summary,
    content: row.contentClean || row.content,
    sourceName: row.sourceName,
    sourceCategory: row.sourceCategory,
    url: row.url,
  });
  const province = classifyIraqProvince({
    title: row.title,
    summary: row.summary,
    content: row.contentClean || row.content,
  });

  categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  if (province) provinceCounts.set(province, (provinceCounts.get(province) || 0) + 1);

  const updates: { category?: string; province?: string | null } = {};
  if (category !== row.category) updates.category = category;
  const nextProvince = province || null;
  if (nextProvince !== (row.province || null)) updates.province = nextProvince;
  if (Object.keys(updates).length === 0) continue;
  changed++;
  if (!dryRun) {
    await db.update(articles).set(updates).where(eq(articles.id, row.id));
  }
}

console.log(JSON.stringify({
  dryRun,
  clientId: clientId || null,
  scanned: rows.length,
  changed,
  categories: Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
  provinces: Array.from(provinceCounts.entries()).sort((a, b) => b[1] - a[1]).map(([province, count]) => ({ province, count })),
}, null, 2));

await pool.end();
