import { db } from "./db";
import { articles, sources, analyticsCache } from "@shared/schema";
import { sql, and, gte, lte, eq, desc } from "drizzle-orm";
import { logSystemError } from "./processing-queue";

async function upsertCache(metricType: string, metricKey: string, data: any, periodStart: Date, periodEnd: Date) {
  const existing = await db
    .select()
    .from(analyticsCache)
    .where(
      and(
        eq(analyticsCache.metricType, metricType),
        eq(analyticsCache.metricKey, metricKey),
        eq(analyticsCache.periodStart, periodStart),
        eq(analyticsCache.periodEnd, periodEnd)
      )
    )
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
    });
  }
}

async function computeVolumeMetrics(periodStart: Date, periodEnd: Date) {
  const timeline = await db
    .select({
      date: sql<string>`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .where(and(gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)))
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
    .where(and(gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)))
    .groupBy(articles.sourceId, sources.name)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  await upsertCache("volume", "global", { timeline, bySource }, periodStart, periodEnd);
}

async function computeTrendingTopics(periodStart: Date, periodEnd: Date) {
  const topics = await db
    .select({
      topic: sql<string>`unnest(${articles.topics})`,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .where(and(gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)))
    .groupBy(sql`unnest(${articles.topics})`)
    .orderBy(desc(sql`count(*)`))
    .limit(30);

  const byCategory = await db
    .select({
      category: articles.category,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .where(and(gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)))
    .groupBy(articles.category)
    .orderBy(desc(sql`count(*)`));

  await upsertCache("trending_topics", "global", { topics, byCategory }, periodStart, periodEnd);
}

async function computeSentimentMetrics(periodStart: Date, periodEnd: Date) {
  const overall = await db
    .select({
      label: articles.sentimentLabel,
      count: sql<number>`count(*)`,
    })
    .from(articles)
    .where(and(gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)))
    .groupBy(articles.sentimentLabel);

  const timeline = await db
    .select({
      date: sql<string>`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`,
      positive: sql<number>`count(*) filter (where ${articles.sentimentLabel} = 'positive')`,
      negative: sql<number>`count(*) filter (where ${articles.sentimentLabel} = 'negative')`,
      neutral: sql<number>`count(*) filter (where ${articles.sentimentLabel} = 'neutral')`,
    })
    .from(articles)
    .where(and(gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)))
    .groupBy(sql`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${articles.publishedAt}, 'YYYY-MM-DD')`);

  await upsertCache("sentiment", "global", { overall, timeline }, periodStart, periodEnd);
}

async function computeKeywordMetrics(periodStart: Date, periodEnd: Date) {
  const topKeywords = await db
    .select({
      keyword: sql<string>`unnest(${articles.keywords})`,
      count: sql<number>`count(*)`,
      avgSentiment: sql<number>`avg(${articles.sentimentScore})`,
    })
    .from(articles)
    .where(and(gte(articles.publishedAt, periodStart), lte(articles.publishedAt, periodEnd)))
    .groupBy(sql`unnest(${articles.keywords})`)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  await upsertCache("keywords", "global", { topKeywords }, periodStart, periodEnd);
}

export async function runAnalyticsComputation() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  console.log("[Analytics] Computing cached metrics...");
  const startTime = Date.now();

  try {
    await computeVolumeMetrics(sevenDaysAgo, now);
    await computeTrendingTopics(sevenDaysAgo, now);
    await computeSentimentMetrics(sevenDaysAgo, now);
    await computeKeywordMetrics(sevenDaysAgo, now);

    await computeVolumeMetrics(thirtyDaysAgo, now);
    await computeTrendingTopics(thirtyDaysAgo, now);
    await computeSentimentMetrics(thirtyDaysAgo, now);
    await computeKeywordMetrics(thirtyDaysAgo, now);

    const duration = Date.now() - startTime;
    console.log(`[Analytics] Computation complete in ${duration}ms`);
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
