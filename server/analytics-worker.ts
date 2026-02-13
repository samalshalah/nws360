import { db } from "./db";
import { articles, sources, analyticsCache } from "@shared/schema";
import { sql, and, gte, lte, eq, desc } from "drizzle-orm";
import { logSystemError } from "./processing-queue";
import { storage } from "./storage";

async function upsertCache(metricType: string, metricKey: string, data: any, periodStart: Date, periodEnd: Date, clientId?: number | null) {
  const conditions = [
    eq(analyticsCache.metricType, metricType),
    eq(analyticsCache.metricKey, metricKey),
    eq(analyticsCache.periodStart, periodStart),
    eq(analyticsCache.periodEnd, periodEnd),
  ];
  if (clientId) {
    conditions.push(eq(analyticsCache.clientId, clientId));
  } else {
    conditions.push(sql`${analyticsCache.clientId} IS NULL`);
  }

  const existing = await db
    .select()
    .from(analyticsCache)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(analyticsCache)
      .set({ data, computedAt: new Date() })
      .where(eq(analyticsCache.id, existing[0].id));
  } else {
    await db.insert(analyticsCache).values({
      metricType,
      metricKey,
      data,
      periodStart,
      periodEnd,
      clientId: clientId ?? null,
    });
  }
}

function buildClientCondition(clientId?: number | null) {
  return clientId ? eq(articles.clientId, clientId) : undefined;
}

async function computeVolumeMetrics(periodStart: Date, periodEnd: Date, clientId?: number | null) {
  const conditions = [gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)];
  const cc = buildClientCondition(clientId);
  if (cc) conditions.push(cc);

  const timeline = await db
    .select({
      date: sql<string>`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .where(and(...conditions))
    .groupBy(sql`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`);

  const bySource = await db
    .select({
      sourceId: articles.sourceId,
      sourceName: sources.name,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .leftJoin(sources, eq(articles.sourceId, sources.id))
    .where(and(...conditions))
    .groupBy(articles.sourceId, sources.name)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const key = clientId ? `client_${clientId}` : "global";
  await upsertCache("volume", key, { timeline, bySource }, periodStart, periodEnd, clientId);
}

async function computeTrendingTopics(periodStart: Date, periodEnd: Date, clientId?: number | null) {
  const conditions = [gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)];
  const cc = buildClientCondition(clientId);
  if (cc) conditions.push(cc);

  const topics = await db
    .select({
      topic: sql<string>`unnest(${articles.topics})`,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .where(and(...conditions))
    .groupBy(sql`unnest(${articles.topics})`)
    .orderBy(desc(sql`count(*)`))
    .limit(30);

  const byCategory = await db
    .select({
      category: articles.category,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .where(and(...conditions))
    .groupBy(articles.category)
    .orderBy(desc(sql`count(*)`));

  const key = clientId ? `client_${clientId}` : "global";
  await upsertCache("trending_topics", key, { topics, byCategory }, periodStart, periodEnd, clientId);
}

async function computeSentimentMetrics(periodStart: Date, periodEnd: Date, clientId?: number | null) {
  const conditions = [gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)];
  const cc = buildClientCondition(clientId);
  if (cc) conditions.push(cc);

  const overall = await db
    .select({
      label: articles.sentimentLabel,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .where(and(...conditions))
    .groupBy(articles.sentimentLabel);

  const timeline = await db
    .select({
      date: sql<string>`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`,
      positive: sql<number>`count(*) filter (where ${articles.sentimentLabel} = 'positive')`,
      negative: sql<number>`count(*) filter (where ${articles.sentimentLabel} = 'negative')`,
      neutral: sql<number>`count(*) filter (where ${articles.sentimentLabel} = 'neutral')`,
    })
    .from(articles)
    .where(and(...conditions))
    .groupBy(sql`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`);

  const key = clientId ? `client_${clientId}` : "global";
  await upsertCache("sentiment", key, { overall, timeline }, periodStart, periodEnd, clientId);
}

async function computeKeywordMetrics(periodStart: Date, periodEnd: Date, clientId?: number | null) {
  const conditions = [gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)];
  const cc = buildClientCondition(clientId);
  if (cc) conditions.push(cc);

  const topKeywords = await db
    .select({
      keyword: sql<string>`unnest(${articles.keywords})`,
      count: sql<number>`count(*)`,
      avgSentiment: sql<number>`avg(${articles.sentimentScore})`,
    })
    .from(articles)
    .where(and(...conditions))
    .groupBy(sql`unnest(${articles.keywords})`)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  const key = clientId ? `client_${clientId}` : "global";
  await upsertCache("keywords", key, { topKeywords }, periodStart, periodEnd, clientId);
}

async function computeMetricsForClient(sevenDaysAgo: Date, thirtyDaysAgo: Date, now: Date, clientId?: number | null) {
  await computeVolumeMetrics(sevenDaysAgo, now, clientId);
  await computeTrendingTopics(sevenDaysAgo, now, clientId);
  await computeSentimentMetrics(sevenDaysAgo, now, clientId);
  await computeKeywordMetrics(sevenDaysAgo, now, clientId);

  await computeVolumeMetrics(thirtyDaysAgo, now, clientId);
  await computeTrendingTopics(thirtyDaysAgo, now, clientId);
  await computeSentimentMetrics(thirtyDaysAgo, now, clientId);
  await computeKeywordMetrics(thirtyDaysAgo, now, clientId);
}

export async function runAnalyticsComputation() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  console.log("[Analytics] Computing cached metrics...");
  const startTime = Date.now();

  try {
    await computeMetricsForClient(sevenDaysAgo, thirtyDaysAgo, now);

    const clientIds = await storage.getDistinctClientIds();
    for (const cId of clientIds) {
      await computeMetricsForClient(sevenDaysAgo, thirtyDaysAgo, now, cId);
    }

    const duration = Date.now() - startTime;
    console.log(`[Analytics] Computation complete in ${duration}ms (${clientIds.length} clients)`);
    return { success: true, duration };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[Analytics] Computation failed:", errorMsg);
    await logSystemError("analytics_worker", errorMsg, "error", {
      stackTrace: e instanceof Error ? e.stack : undefined,
    });
    return { success: false, error: errorMsg };
  }
}

export async function getCachedAnalytics(metricType: string, metricKey = "global") {
  const results = await db
    .select()
    .from(analyticsCache)
    .where(
      and(
        eq(analyticsCache.metricType, metricType),
        eq(analyticsCache.metricKey, metricKey)
      )
    )
    .orderBy(desc(analyticsCache.computedAt))
    .limit(1);

  return results[0] || null;
}

export async function cleanupOldCache(daysOld = 30) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  await db
    .delete(analyticsCache)
    .where(lte(analyticsCache.computedAt, cutoff));
}
