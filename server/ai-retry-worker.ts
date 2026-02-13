import { db } from "./db";
import { articles } from "@shared/schema";
import { eq, and, lte, sql, or } from "drizzle-orm";
import { analyzeWithAI } from "./feed-worker";
import { logSystemError } from "./processing-queue";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [
  10 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];

export async function runAIRetryQueue() {
  const now = new Date();
  console.log("[AI-Retry] Scanning for failed articles to retry...");

  try {
    const failedArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        contentClean: articles.contentClean,
        aiRetryCount: articles.aiRetryCount,
        aiLastRetryAt: articles.aiLastRetryAt,
      })
      .from(articles)
      .where(
        and(
          or(
            eq(articles.aiAnalysisStatus, "failed"),
            eq(articles.aiAnalysisStatus, "pending_retry")
          ),
          sql`COALESCE(${articles.aiRetryCount}, 0) < ${MAX_RETRIES}`
        )
      )
      .limit(20);

    const eligible = failedArticles.filter(a => {
      const retryCount = a.aiRetryCount ?? 0;
      if (retryCount >= MAX_RETRIES) return false;
      const lastRetry = a.aiLastRetryAt;
      if (!lastRetry) return true;
      const delayMs = RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)];
      return now.getTime() - new Date(lastRetry).getTime() >= delayMs;
    });

    if (eligible.length === 0) {
      console.log("[AI-Retry] No articles eligible for retry");
      return { retried: 0, succeeded: 0, failed: 0 };
    }

    console.log(`[AI-Retry] Found ${eligible.length} articles eligible for retry`);

    let succeeded = 0;
    let failed = 0;

    for (const article of eligible) {
      const retryCount = (article.aiRetryCount ?? 0) + 1;
      const textContent = article.contentClean || article.content;

      await db
        .update(articles)
        .set({
          aiAnalysisStatus: "pending_retry",
          aiRetryCount: retryCount,
          aiLastRetryAt: now,
        })
        .where(eq(articles.id, article.id));

      const analysis = await analyzeWithAI(article.title, textContent);

      if (analysis.aiAnalysisStatus === "success") {
        await db
          .update(articles)
          .set({
            sentimentLabel: analysis.sentimentLabel,
            sentimentScore: analysis.sentimentScore,
            keywords: analysis.keywords,
            topics: analysis.topics,
            summary: analysis.summary,
            category: analysis.category,
            country: analysis.country,
            aiAnalysisStatus: "success",
            aiRetryCount: retryCount,
            aiLastRetryAt: now,
          })
          .where(eq(articles.id, article.id));
        succeeded++;
        console.log(`[AI-Retry] Article ${article.id} succeeded on retry ${retryCount}`);
      } else {
        const finalStatus = retryCount >= MAX_RETRIES ? "failed" : "failed";
        await db
          .update(articles)
          .set({
            aiAnalysisStatus: finalStatus,
            aiRetryCount: retryCount,
            aiLastRetryAt: now,
          })
          .where(eq(articles.id, article.id));
        failed++;
        console.log(`[AI-Retry] Article ${article.id} failed retry ${retryCount}/${MAX_RETRIES}`);
      }
    }

    console.log(`[AI-Retry] Complete: ${succeeded} succeeded, ${failed} failed out of ${eligible.length} retried`);
    return { retried: eligible.length, succeeded, failed };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[AI-Retry] Worker error:", errorMsg);
    await logSystemError("ai_retry_worker", errorMsg, "error", {
      stackTrace: e instanceof Error ? e.stack : undefined,
    });
    return { retried: 0, succeeded: 0, failed: 0 };
  }
}
