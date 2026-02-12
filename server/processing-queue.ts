import { db } from "./db";
import { processingJobs, systemErrors } from "@shared/schema";
import { eq, and, lte, sql, desc, asc } from "drizzle-orm";

export type JobType =
  | "FETCH_SOURCE"
  | "FETCH_ALL_PRIORITY"
  | "COMPUTE_ANALYTICS"
  | "DATA_RETENTION"
  | "BACKFILL_IMAGES";

interface JobHandler {
  (payload: any): Promise<any>;
}

const handlers: Map<string, JobHandler> = new Map();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueueJob(
  type: JobType,
  payload: any = {},
  options: { priority?: number; runAt?: Date; maxAttempts?: number } = {}
): Promise<number> {
  const [job] = await db.insert(processingJobs).values({
    type,
    status: "pending",
    priority: options.priority ?? 5,
    payload,
    runAt: options.runAt ?? new Date(),
    maxAttempts: options.maxAttempts ?? 3,
    attempts: 0,
  }).returning();
  return job.id;
}

async function claimJob(): Promise<typeof processingJobs.$inferSelect | null> {
  const now = new Date();
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.status, "pending"),
        lte(processingJobs.runAt, now)
      )
    )
    .orderBy(asc(processingJobs.priority), asc(processingJobs.runAt))
    .limit(1);

  if (!job) return null;

  const [claimed] = await db
    .update(processingJobs)
    .set({
      status: "running",
      startedAt: now,
      attempts: (job.attempts ?? 0) + 1,
    })
    .where(
      and(
        eq(processingJobs.id, job.id),
        eq(processingJobs.status, "pending")
      )
    )
    .returning();

  return claimed || null;
}

async function completeJob(id: number, result: any) {
  await db
    .update(processingJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      result,
    })
    .where(eq(processingJobs.id, id));
}

async function failJob(id: number, error: string, maxAttempts: number) {
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, id));

  if (!job) return;

  const attempts = job.attempts ?? 0;
  if (attempts < maxAttempts) {
    const backoffMs = Math.pow(2, attempts) * 2000;
    await db
      .update(processingJobs)
      .set({
        status: "pending",
        lastError: error.substring(0, 1000),
        runAt: new Date(Date.now() + backoffMs),
      })
      .where(eq(processingJobs.id, id));
  } else {
    await db
      .update(processingJobs)
      .set({
        status: "failed",
        lastError: error.substring(0, 1000),
        completedAt: new Date(),
      })
      .where(eq(processingJobs.id, id));
  }
}

export async function logSystemError(
  component: string,
  errorMessage: string,
  severity: "info" | "warning" | "error" | "critical" = "error",
  extra?: { stackTrace?: string; sourceId?: number }
) {
  try {
    await db.insert(systemErrors).values({
      component,
      errorMessage: errorMessage.substring(0, 2000),
      stackTrace: extra?.stackTrace?.substring(0, 5000),
      severity,
      sourceId: extra?.sourceId,
    });
  } catch (e) {
    console.error("[SystemError] Failed to log error:", e);
  }
}

async function processOne(): Promise<boolean> {
  const job = await claimJob();
  if (!job) return false;

  const handler = handlers.get(job.type);
  if (!handler) {
    await failJob(job.id, `No handler for job type: ${job.type}`, 1);
    await logSystemError("queue", `No handler for job type: ${job.type}`, "error");
    return true;
  }

  try {
    const result = await handler(job.payload);
    await completeJob(job.id, result);
    return true;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    await failJob(job.id, errorMsg, job.maxAttempts ?? 3);
    await logSystemError("queue", `Job ${job.type} failed: ${errorMsg}`, "error", {
      stackTrace: stack,
      sourceId: (job.payload as any)?.sourceId,
    });
    return true;
  }
}

let queueInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

async function processLoop() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    let processed = 0;
    while (processed < 10) {
      const hadWork = await processOne();
      if (!hadWork) break;
      processed++;
    }
  } catch (e) {
    console.error("[Queue] Process loop error:", e);
  } finally {
    isProcessing = false;
  }
}

export function startQueueProcessor(intervalMs = 5000) {
  if (queueInterval) clearInterval(queueInterval);
  console.log(`[Queue] Starting processor, poll interval: ${intervalMs}ms`);
  queueInterval = setInterval(processLoop, intervalMs);
}

export function stopQueueProcessor() {
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
  }
}

export async function getQueueStats() {
  const [stats] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${processingJobs.status} = 'pending')`,
      running: sql<number>`count(*) filter (where ${processingJobs.status} = 'running')`,
      completed: sql<number>`count(*) filter (where ${processingJobs.status} = 'completed')`,
      failed: sql<number>`count(*) filter (where ${processingJobs.status} = 'failed')`,
    })
    .from(processingJobs)
    .where(lte(processingJobs.createdAt, new Date()));

  const recentFailed = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.status, "failed"))
    .orderBy(desc(processingJobs.completedAt))
    .limit(5);

  return {
    pending: Number(stats?.pending ?? 0),
    processing: Number(stats?.running ?? 0),
    completed: Number(stats?.completed ?? 0),
    failed: Number(stats?.failed ?? 0),
    total: Number(stats?.pending ?? 0) + Number(stats?.running ?? 0) + Number(stats?.completed ?? 0) + Number(stats?.failed ?? 0),
    recentFailures: recentFailed.map(j => ({
      id: j.id,
      type: j.type,
      error: j.lastError,
      failedAt: j.completedAt,
    })),
  };
}

export async function cleanupOldJobs(daysOld = 7) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(processingJobs)
    .where(
      and(
        sql`${processingJobs.status} IN ('completed', 'failed')`,
        lte(processingJobs.createdAt, cutoff)
      )
    );
}
