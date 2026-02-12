import { db } from "./db";
import { articles, sources, sourceFetchLogs, analyticsCache, systemErrors } from "@shared/schema";
import { eq, and, lte, isNotNull, sql, lt } from "drizzle-orm";
import { logSystemError } from "./processing-queue";

export async function runDataRetention() {
  console.log("[Retention] Starting data retention cycle...");
  const startTime = Date.now();
  let totalCleaned = 0;

  try {
    const allSources = await db.select().from(sources);

    for (const source of allSources) {
      const retentionDays = source.retentionDays ?? 30;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const result = await db
        .delete(articles)
        .where(
          and(
            eq(articles.sourceId, source.id),
            lte(articles.publishedAt, cutoff)
          )
        );

      const count = Number((result as any)?.rowCount ?? 0);
      if (count > 0) {
        console.log(`[Retention] Removed ${count} articles from ${source.name} (retention: ${retentionDays}d)`);
        totalCleaned += count;
      }
    }

    const defaultCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orphanResult = await db
      .delete(articles)
      .where(
        and(
          sql`${articles.sourceId} IS NULL`,
          lte(articles.publishedAt, defaultCutoff)
        )
      );
    const orphanCount = Number((orphanResult as any)?.rowCount ?? 0);
    if (orphanCount > 0) {
      console.log(`[Retention] Removed ${orphanCount} orphaned articles`);
      totalCleaned += orphanCount;
    }

    const logCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.delete(sourceFetchLogs).where(lte(sourceFetchLogs.fetchedAt, logCutoff));

    const errorCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await db.delete(systemErrors).where(lte(systemErrors.createdAt, errorCutoff));

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
    await db.delete(articles).where(eq(articles.sourceId, sourceId));
    await db.delete(sourceFetchLogs).where(eq(sourceFetchLogs.sourceId, sourceId));
    await db.delete(systemErrors).where(eq(systemErrors.sourceId, sourceId));

    console.log(`[Retention] Cleaned all data for source ${sourceId}`);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[Retention] Hard delete cleanup failed for source ${sourceId}:`, errorMsg);
    await logSystemError("data_retention", `Hard delete cleanup failed: ${errorMsg}`, "error", { sourceId });
  }
}
