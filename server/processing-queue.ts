import { db } from "./db";
import { processingJobs, systemErrors } from "@shared/schema";
import { eq, and, lte, sql, desc, asc } from "drizzle-orm";

export type JobType =
  | "FETCH_SOURCE"
  | "FETCH_ALL_PRIORITY"
  | "COMPUTE_ANALYTICS"
  | "DATA_RETENTION"
  | "BACKFILL_IMAGES"
  | "EXTRACT_ARTICLE_CONTENT"
  | "ANALYZE_ARTICLE"
  | "TRANSLATE_ARTICLE"
  | "INTELLIGENCE_PIPELINE";

export const JOB_PRIORITIES: Record<string, number> = {
  DATA_RETENTION: 1,
  COMPUTE_ANALYTICS: 2,
  INTELLIGENCE_PIPELINE: 3,
  TRANSLATE_ARTICLE: 4,
  FETCH_SOURCE: 5,
  FETCH_ALL_PRIORITY: 5,
  BACKFILL_IMAGES: 5,
  EXTRACT_ARTICLE_CONTENT: 6,
  ANALYZE_ARTICLE: 5,
};

interface JobHandler {
  (payload: any): Promise<any>;
}

const handlers: Map<string, JobHandler> = new Map();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

export class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => void)[] = [];
  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get activeCount(): number { return this.running; }
  get waitingCount(): number { return this.queue.length; }
}

export const openaiLimiter = new ConcurrencyLimiter(3);

export async function enqueueJob(
  type: JobType,
  payload: any = {},
  options: { priority?: number; runAt?: Date; maxAttempts?: number } = {}
): Promise<number> {
  const [job] = await db.insert(processingJobs).values({
    type,
    status: "pending",
    priority: options.priority ?? JOB_PRIORITIES[type] ?? 5,
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

async function claimBatch(limit: number): Promise<(typeof processingJobs.$inferSelect)[]> {
  const now = new Date();
  const reservedSlots = 1;
  const maxAnalyze = Math.max(1, limit - reservedSlots);

  const analyzeJobs = await db
    .select()
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.status, "pending"),
        lte(processingJobs.runAt, now),
        sql`${processingJobs.type} = 'ANALYZE_ARTICLE'`
      )
    )
    .orderBy(asc(processingJobs.priority), asc(processingJobs.runAt))
    .limit(maxAnalyze);

  const nonAnalyzeLimit = Math.max(reservedSlots, limit - analyzeJobs.length);
  const nonAnalyzeJobs = await db
    .select()
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.status, "pending"),
        lte(processingJobs.runAt, now),
        sql`${processingJobs.type} != 'ANALYZE_ARTICLE'`
      )
    )
    .orderBy(asc(processingJobs.priority), asc(processingJobs.runAt))
    .limit(nonAnalyzeLimit);

  const selected = [...nonAnalyzeJobs, ...analyzeJobs]
    .sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5) || (a.runAt?.getTime() ?? 0) - (b.runAt?.getTime() ?? 0))
    .slice(0, limit);

  const claimed: (typeof processingJobs.$inferSelect)[] = [];
  for (const job of selected) {
    const [c] = await db
      .update(processingJobs)
      .set({ status: "running", startedAt: now, attempts: (job.attempts ?? 0) + 1 })
      .where(and(eq(processingJobs.id, job.id), eq(processingJobs.status, "pending")))
      .returning();
    if (c) claimed.push(c);
  }
  return claimed;
}

async function processLoop() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const batch = await claimBatch(6);
    if (batch.length === 0) return;

    const promises = batch.map(async (job) => {
      const handler = handlers.get(job.type);
      if (!handler) {
        await failJob(job.id, `No handler for job type: ${job.type}`, 1);
        return;
      }
      try {
        const result = await handler(job.payload);
        await completeJob(job.id, result);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : undefined;
        await failJob(job.id, errorMsg, job.maxAttempts ?? 3);
        await logSystemError("queue", `Job ${job.type} failed: ${errorMsg}`, "error", {
          stackTrace: stack,
          sourceId: (job.payload as any)?.sourceId,
        });
      }
    });

    await Promise.all(promises);
  } catch (e) {
    console.error("[Queue] Process loop error:", e);
  } finally {
    isProcessing = false;
  }
}

export function startQueueProcessor(intervalMs = 3000) {
  if (queueInterval) clearInterval(queueInterval);
  console.log(`[Queue] Starting processor, poll interval: ${intervalMs}ms, OpenAI concurrency: ${openaiLimiter.activeCount}/${3}`);
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

  const byType = await db
    .select({
      type: processingJobs.type,
      pending: sql<number>`count(*) filter (where ${processingJobs.status} = 'pending')`,
      running: sql<number>`count(*) filter (where ${processingJobs.status} = 'running')`,
      completed: sql<number>`count(*) filter (where ${processingJobs.status} = 'completed')`,
      failed: sql<number>`count(*) filter (where ${processingJobs.status} = 'failed')`,
      avgDurationMs: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${processingJobs.completedAt} - ${processingJobs.startedAt})) * 1000) FILTER (WHERE ${processingJobs.completedAt} IS NOT NULL AND ${processingJobs.startedAt} IS NOT NULL), 0)::int`,
    })
    .from(processingJobs)
    .groupBy(processingJobs.type);

  return {
    pending: Number(stats?.pending ?? 0),
    processing: Number(stats?.running ?? 0),
    completed: Number(stats?.completed ?? 0),
    failed: Number(stats?.failed ?? 0),
    total: Number(stats?.pending ?? 0) + Number(stats?.running ?? 0) + Number(stats?.completed ?? 0) + Number(stats?.failed ?? 0),
    openaiConcurrency: { active: openaiLimiter.activeCount, waiting: openaiLimiter.waitingCount, max: 3 },
    byType: byType.map(t => ({
      type: t.type,
      pending: Number(t.pending),
      running: Number(t.running),
      completed: Number(t.completed),
      failed: Number(t.failed),
      avgDurationMs: Number(t.avgDurationMs),
    })),
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

interface PeriodicJobConfig {
  type: JobType;
  intervalMs: number;
  priority: number;
  maxAttempts: number;
}

const PERIODIC_JOBS: PeriodicJobConfig[] = [
  { type: "COMPUTE_ANALYTICS", intervalMs: 15 * 60 * 1000, priority: JOB_PRIORITIES.COMPUTE_ANALYTICS, maxAttempts: 1 },
  { type: "DATA_RETENTION", intervalMs: 24 * 60 * 60 * 1000, priority: JOB_PRIORITIES.DATA_RETENTION, maxAttempts: 1 },
  { type: "INTELLIGENCE_PIPELINE", intervalMs: 30 * 60 * 1000, priority: JOB_PRIORITIES.INTELLIGENCE_PIPELINE, maxAttempts: 1 },
];

async function hasActiveJob(type: JobType): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.type, type),
        sql`${processingJobs.status} IN ('pending', 'running')`
      )
    );
  return Number(row?.count ?? 0) > 0;
}

let periodicTimers: ReturnType<typeof setInterval>[] = [];

export function startPeriodicJobs() {
  stopPeriodicJobs();
  for (const config of PERIODIC_JOBS) {
    const scheduleOne = async () => {
      try {
        const active = await hasActiveJob(config.type);
        if (!active) {
          await enqueueJob(config.type, {}, {
            priority: config.priority,
            maxAttempts: config.maxAttempts,
          });
          console.log(`[Scheduler] Enqueued periodic job: ${config.type}`);
        }
      } catch (e) {
        console.error(`[Scheduler] Failed to enqueue ${config.type}:`, e);
      }
    };

    scheduleOne();

    const timer = setInterval(scheduleOne, config.intervalMs);
    periodicTimers.push(timer);
    console.log(`[Scheduler] ${config.type} scheduled every ${Math.round(config.intervalMs / 60000)}min`);
  }
}

export function stopPeriodicJobs() {
  for (const timer of periodicTimers) {
    clearInterval(timer);
  }
  periodicTimers = [];
}
