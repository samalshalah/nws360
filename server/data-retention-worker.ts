import { db } from "./db";
import { articles, sources, sourceFetchLogs, analyticsCache, systemErrors, comments, annotations, timelineEvents, bookmarks } from "@shared/schema";
import { eq, and, lte, isNotNull, sql, lt, inArray } from "drizzle-orm";
import { logSystemError } from "./processing-queue";
import { runAnalyticsComputation } from "./analytics-worker";

async function cleanupArticleDependents(articleIds: number[]) {
  if (articleIds.length === 0) return;
  await db.delete(comments).where(and(eq(comments.targetType, "article"), inArray(comments.targetId, articleIds)));
  await db.delete(annotations).where(and(eq(annotations.targetType, "article"), inArray(annotations.targetId, articleIds)));
  await db.delete(timelineEvents).where(inArray(timelineEvents.articleId, articleIds));
  await db.delete(bookmarks).where(inArray(bookmarks.articleId, articleIds));
}

export async function runDataRetention() {
  console.log("[Retention] Starting data retention cycle...");
  const startTime = Date.now();
  let totalCleaned = 0;

  try {
    const allSources = await db.select().from(sources);

    for (const source of allSources) {
      const retentionDays = source.retentionDays ?? 30;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const expiredArticles = await db
        .select({ id: articles.id })
        .from(articles)
        .where(
          and(
            eq(articles.sourceId, source.id),
            lte(articles.publishedAt, cutoff)
          )
        );
      const expiredIds = expiredArticles.map(a => a.id);
      if (expiredIds.length === 0) continue;

      await cleanupArticleDependents(expiredIds);
      await db.delete(articles).where(inArray(articles.id, expiredIds));

      console.log(`[Retention] Removed ${expiredIds.length} articles from ${source.name} (retention: ${retentionDays}d)`);
      totalCleaned += expiredIds.length;
    }

    const defaultCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orphanArticles = await db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          sql`${articles.sourceId} IS NULL`,
          lte(articles.publishedAt, defaultCutoff)
        )
      );
    const orphanIds = orphanArticles.map(a => a.id);
    if (orphanIds.length > 0) {
      await cleanupArticleDependents(orphanIds);
      await db.delete(articles).where(inArray(articles.id, orphanIds));
      console.log(`[Retention] Removed ${orphanIds.length} orphaned articles`);
      totalCleaned += orphanIds.length;
    }

    const logCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.delete(sourceFetchLogs).where(lte(sourceFetchLogs.fetchedAt, logCutoff));

    const errorCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await db.delete(systemErrors).where(lte(systemErrors.createdAt, errorCutoff));

    if (totalCleaned > 0) {
      runAnalyticsComputation().catch(e => console.error("[Retention] Post-cleanup analytics recomputation error:", e));
    }

    const duration = Date.now() - startTime;
    console.log(`[Retention] Complete: cleaned ${totalCleaned} articles in ${duration}ms`);
    return { success: true, articlesRemoved: totalCleaned, duration };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[Retention] Failed:", errorMsg);
    await logSystemError("data_retention", errorMsg, "error", {
      stackTrace: e instanceof Error ? e.stack : undefined,
    });
    return { success: false, error: errorMsg };
  }
}

export async function onSourceHardDeleted(sourceId: number) {
  console.log(`[Retention] Hard delete cleanup for source ${sourceId}`);
  try {
    const sourceArticles = await db.select({ id: articles.id }).from(articles).where(eq(articles.sourceId, sourceId));
    const articleIds = sourceArticles.map(a => a.id);
    await cleanupArticleDependents(articleIds);
    await db.delete(articles).where(eq(articles.sourceId, sourceId));
    await db.delete(sourceFetchLogs).where(eq(sourceFetchLogs.sourceId, sourceId));
    await db.delete(systemErrors).where(eq(systemErrors.sourceId, sourceId));

    runAnalyticsComputation().catch(e => console.error("[Retention] Post-hard-delete analytics recomputation error:", e));

    console.log(`[Retention] Cleaned all data for source ${sourceId}`);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[Retention] Hard delete cleanup failed for source ${sourceId}:`, errorMsg);
    await logSystemError("data_retention", `Hard delete cleanup failed: ${errorMsg}`, "error", { sourceId });
  }
}
