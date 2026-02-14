import { storage } from "../storage";
import { checkClientAiBudget, startInsightJob, runInsightAI, completeInsightJob, failInsightJob } from "./ai-gateway";
import type { InsightJob } from "@shared/schema";

const TICK_INTERVAL_MS = 5_000;
const MAX_JOBS_PER_TICK = 10;
const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let schedulerRunning = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;

export interface SchedulerTickMetrics {
  timestamp: string;
  jobsScheduled: number;
  jobsExecuted: number;
  jobsBlocked: number;
  jobsExpired: number;
  jobsUnblocked: number;
  activeTenants: number;
  queueDepth: Record<string, number>;
}

export function startScheduler(): void {
  if (schedulerRunning) {
    console.log("[AI Scheduler] Already running");
    return;
  }
  schedulerRunning = true;
  console.log("[AI Scheduler] Starting — tick interval:", TICK_INTERVAL_MS, "ms, max jobs/tick:", MAX_JOBS_PER_TICK);
  tickTimer = setInterval(() => schedulerTick().catch(e => console.error("[AI Scheduler] Tick error:", e)), TICK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  schedulerRunning = false;
  console.log("[AI Scheduler] Stopped");
}

async function schedulerTick(): Promise<void> {
  const metrics: SchedulerTickMetrics = {
    timestamp: new Date().toISOString(),
    jobsScheduled: 0,
    jobsExecuted: 0,
    jobsBlocked: 0,
    jobsExpired: 0,
    jobsUnblocked: 0,
    activeTenants: 0,
    queueDepth: {},
  };

  try {
    const expired = await storage.expireOldQueuedJobs(JOB_MAX_AGE_MS);
    metrics.jobsExpired = expired;

    await recheckBlockedJobs(metrics);

    await scheduleEligibleJobs(metrics);

    await executeScheduledJobs(metrics);

    metrics.queueDepth = await storage.getJobCountsByStatus();

    const hasActivity = metrics.jobsScheduled > 0 || metrics.jobsExecuted > 0 ||
      metrics.jobsBlocked > 0 || metrics.jobsExpired > 0 || metrics.jobsUnblocked > 0;
    if (hasActivity) {
      console.log(`[AI Scheduler] Tick: scheduled=${metrics.jobsScheduled} executed=${metrics.jobsExecuted} blocked=${metrics.jobsBlocked} expired=${metrics.jobsExpired} unblocked=${metrics.jobsUnblocked} tenants=${metrics.activeTenants} queue=${JSON.stringify(metrics.queueDepth)}`);
    }
  } catch (e) {
    console.error("[AI Scheduler] Tick failed:", e);
  }
}

async function recheckBlockedJobs(metrics: SchedulerTickMetrics): Promise<void> {
  const blockedCounts = await storage.getJobCountsByStatus();
  const blockedCount = blockedCounts["blocked_budget"] || 0;
  if (blockedCount === 0) return;

  const allClients = await storage.getClients();
  for (const client of allClients) {
    const budgetCheck = await checkClientAiBudget(client.id);
    if (budgetCheck.allowed) {
      const unblocked = await storage.bulkUpdateJobStatus("blocked_budget", "queued", client.id);
      metrics.jobsUnblocked += unblocked;
    }
  }
}

async function scheduleEligibleJobs(metrics: SchedulerTickMetrics): Promise<void> {
  const allClients = await storage.getClients();
  let totalScheduled = 0;
  const eligibleTenants = new Set<number>();

  for (const client of allClients) {
    if (totalScheduled >= MAX_JOBS_PER_TICK) break;

    const budgetCheck = await checkClientAiBudget(client.id);

    if (!budgetCheck.allowed) {
      const blocked = await storage.bulkUpdateJobStatus("queued", "blocked_budget", client.id);
      metrics.jobsBlocked += blocked;
      continue;
    }

    const remaining = MAX_JOBS_PER_TICK - totalScheduled;
    const queuedJobs = await storage.getQueuedJobsByTenant(client.id, remaining);
    if (queuedJobs.length === 0) continue;

    eligibleTenants.add(client.id);

    for (const job of queuedJobs) {
      if (totalScheduled >= MAX_JOBS_PER_TICK) break;

      const perJobBudget = await checkClientAiBudget(client.id);
      if (!perJobBudget.allowed) {
        await storage.updateInsightJobStatus(job.id, "blocked_budget");
        metrics.jobsBlocked++;
        break;
      }

      await storage.updateInsightJobIfStatus(job.id, "queued", "scheduled");
      totalScheduled++;
    }
  }

  metrics.jobsScheduled = totalScheduled;
  metrics.activeTenants = eligibleTenants.size;
}

async function executeScheduledJobs(metrics: SchedulerTickMetrics): Promise<void> {
  const scheduledJobs = await storage.getScheduledJobs(MAX_JOBS_PER_TICK);

  for (const job of scheduledJobs) {
    try {
      const started = await startInsightJob(job.id);
      if (!started) continue;

      if (!job.payload) {
        console.error(`[AI Scheduler] Job ${job.id} has no payload — marking failed`);
        await failInsightJob(job.id);
        continue;
      }

      const result = await runInsightAI({
        jobId: job.id,
        clientId: job.clientId,
        type: job.type as any,
        payload: job.payload,
        maxTokens: job.maxTokens || 500,
      });

      await completeInsightJob(job.id, result);
      metrics.jobsExecuted++;
    } catch (e) {
      console.error(`[AI Scheduler] Job ${job.id} execution failed:`, e);
      try { await failInsightJob(job.id); } catch {}
    }
  }
}

export { schedulerTick as _schedulerTickForTesting };
