import { storage } from "../storage";
import { checkClientAiBudget, startInsightJob, runInsightAI, completeInsightJob, failInsightJob } from "./ai-gateway";
import type { InsightJob } from "@shared/schema";

const TICK_INTERVAL_MS = 5_000;
const MAX_JOBS_PER_TICK = 10;
const JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let schedulerRunning = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickInProgress = false;

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
  if (tickInProgress) return;
  tickInProgress = true;

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

    const promoted = await promoteAndExecute(metrics);

    metrics.queueDepth = await storage.getJobCountsByStatus();

    const hasActivity = metrics.jobsScheduled > 0 || metrics.jobsExecuted > 0 ||
      metrics.jobsBlocked > 0 || metrics.jobsExpired > 0 || metrics.jobsUnblocked > 0;
    if (hasActivity) {
      console.log(`[AI Scheduler] Tick: scheduled=${metrics.jobsScheduled} executed=${metrics.jobsExecuted} blocked=${metrics.jobsBlocked} expired=${metrics.jobsExpired} unblocked=${metrics.jobsUnblocked} tenants=${metrics.activeTenants} queue=${JSON.stringify(metrics.queueDepth)}`);
    }
  } catch (e) {
    console.error("[AI Scheduler] Tick failed:", e);
  } finally {
    tickInProgress = false;
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

async function promoteAndExecute(metrics: SchedulerTickMetrics): Promise<void> {
  const allClients = await storage.getClients();
  let tickBudget = MAX_JOBS_PER_TICK;
  const eligibleTenants = new Set<number>();
  const jobsToExecute: InsightJob[] = [];

  for (const client of allClients) {
    if (tickBudget <= 0) break;

    const budgetCheck = await checkClientAiBudget(client.id);

    if (!budgetCheck.allowed) {
      const blocked = await storage.bulkUpdateJobStatus("queued", "blocked_budget", client.id);
      metrics.jobsBlocked += blocked;
      continue;
    }

    const queuedJobs = await storage.getQueuedJobsByTenant(client.id, tickBudget);
    if (queuedJobs.length === 0) continue;

    console.log(`[AI Scheduler] DEBUG: client=${client.id} (${client.name}) has ${queuedJobs.length} queued, tickBudget=${tickBudget}, jobIds=[${queuedJobs.map(j => j.id).join(",")}]`);
    eligibleTenants.add(client.id);

    for (const job of queuedJobs) {
      if (tickBudget <= 0) break;

      const perJobBudget = await checkClientAiBudget(client.id);
      if (!perJobBudget.allowed) {
        await storage.updateInsightJobStatus(job.id, "blocked_budget");
        metrics.jobsBlocked++;
        break;
      }

      const promoted = await storage.updateInsightJobIfStatus(job.id, "queued", "scheduled");
      if (promoted) {
        jobsToExecute.push(promoted);
        tickBudget--;
        metrics.jobsScheduled++;
      }
    }
  }

  metrics.activeTenants = eligibleTenants.size;

  if (jobsToExecute.length > MAX_JOBS_PER_TICK) {
    console.error(`[AI Scheduler] BUG: jobsToExecute.length=${jobsToExecute.length} exceeds MAX_JOBS_PER_TICK=${MAX_JOBS_PER_TICK}`);
  }

  for (const job of jobsToExecute) {
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

export function isTickInProgress(): boolean {
  return tickInProgress;
}

export { schedulerTick as _schedulerTickForTesting };
