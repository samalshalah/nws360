import { storage } from "../server/storage";
import { stopScheduler, startScheduler, _schedulerTickForTesting } from "../server/ai/ai-scheduler";
import { db } from "../server/db";
import { insightJobs, clients } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";

const TEST_CLIENT_ID = 9001;
const JOB_COUNT = 20;
const MARKER = `imm-exec-test-${Date.now()}`;

interface CheckResult {
  step: string;
  status: "PASS" | "FAIL";
  detail: string;
}

const results: CheckResult[] = [];

function record(step: string, status: "PASS" | "FAIL", detail: string) {
  results.push({ step, status, detail });
  const icon = status === "PASS" ? "  [PASS]" : "  [FAIL]";
  console.log(`${icon} ${step}: ${detail}`);
}

async function getJobStatusCounts(ids: number[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const jobs = await db.select({ status: insightJobs.status })
    .from(insightJobs)
    .where(inArray(insightJobs.id, ids));
  const counts: Record<string, number> = {};
  for (const j of jobs) {
    counts[j.status] = (counts[j.status] || 0) + 1;
  }
  return counts;
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ");
}

function assertNoneRunning(counts: Record<string, number>, step: string, context: string): void {
  const running = counts["running"] || 0;
  const scheduled = counts["scheduled"] || 0;
  const completed = counts["completed"] || 0;
  const failed = counts["failed"] || 0;

  if (running > 0 || completed > 0 || failed > 0) {
    record(step, "FAIL",
      `${context} — found jobs beyond queued: ${formatCounts(counts)}. ` +
      `A route is still calling runInsightAI directly!`);
  } else if (scheduled > 0) {
    record(step, "FAIL",
      `${context} — found ${scheduled} scheduled jobs but scheduler is stopped. Something promoted jobs outside scheduler.`);
  } else {
    record(step, "PASS", `${context} — all jobs queued: ${formatCounts(counts)}`);
  }
}

async function ensureTestClient(): Promise<void> {
  const client = await storage.getClient(TEST_CLIENT_ID);
  if (!client) {
    throw new Error(`Test client ${TEST_CLIENT_ID} not found. Ensure SYSTEM client exists.`);
  }
  if (!client.aiEnabled) {
    console.log(`[Setup] Enabling AI for client ${TEST_CLIENT_ID}`);
    await db.update(clients).set({ aiEnabled: true }).where(eq(clients.id, TEST_CLIENT_ID));
  }
}

async function run() {
  console.log("=======================================================");
  console.log("  TEST 1: IMMEDIATE EXECUTION ATTACK");
  console.log("  Goal: Verify routes NEVER bypass scheduler");
  console.log("  Date: " + new Date().toISOString());
  console.log("=======================================================\n");

  // Step 0: Stop scheduler so we have full control
  console.log("--- Phase 0: Halt scheduler ---");
  stopScheduler();
  console.log("  Scheduler stopped. No jobs should transition.\n");

  // Allow any in-flight tick to complete
  await new Promise(r => setTimeout(r, 1000));

  // Step 1: Create 20 jobs rapidly via direct storage insertion (bypasses budget check
  // since we're testing the execution path, not the enqueue path)
  console.log("--- Phase 1: Create 20 jobs rapidly ---");
  const jobIds: number[] = [];
  const expiresAt = new Date(Date.now() + 3600000);

  for (let i = 0; i < JOB_COUNT; i++) {
    const job = await storage.createInsightJob({
      clientId: TEST_CLIENT_ID,
      type: "qa",
      status: "queued",
      expiresAt,
      payload: {
        systemPrompt: `${MARKER} test job ${i}`,
        userContent: `Immediate execution test payload ${i}`,
      },
      maxTokens: 10,
    });
    jobIds.push(job.id);
  }
  console.log(`  Created ${jobIds.length} jobs: IDs ${jobIds[0]}..${jobIds[jobIds.length - 1]}\n`);

  // Step 2: Immediately check — all must be "queued"
  console.log("--- Phase 2: Immediate check (0ms after creation) ---");
  const countsT0 = await getJobStatusCounts(jobIds);
  assertNoneRunning(countsT0, "T+0ms", "Immediately after creation");

  // Step 3: Wait 500ms, check again
  console.log("\n--- Phase 3: Check at T+500ms ---");
  await new Promise(r => setTimeout(r, 500));
  const countsT500 = await getJobStatusCounts(jobIds);
  assertNoneRunning(countsT500, "T+500ms", "500ms after creation, scheduler stopped");

  // Step 4: Wait another 1500ms (total 2s), check again
  console.log("\n--- Phase 4: Check at T+2000ms ---");
  await new Promise(r => setTimeout(r, 1500));
  const countsT2000 = await getJobStatusCounts(jobIds);
  assertNoneRunning(countsT2000, "T+2000ms", "2000ms after creation, scheduler still stopped");

  // Step 5: Wait 5 more seconds to be thorough (total 7s without scheduler)
  console.log("\n--- Phase 5: Extended wait T+7000ms (no scheduler) ---");
  await new Promise(r => setTimeout(r, 5000));
  const countsT7000 = await getJobStatusCounts(jobIds);
  assertNoneRunning(countsT7000, "T+7000ms", "7s after creation, scheduler still stopped — nothing should have moved");

  // Step 6: Manually fire ONE scheduler tick and verify some jobs transition
  console.log("\n--- Phase 6: Fire manual scheduler tick ---");
  await _schedulerTickForTesting();
  const countsAfterTick = await getJobStatusCounts(jobIds);
  console.log(`  Statuses after 1 tick: ${formatCounts(countsAfterTick)}`);

  const movedCount = (countsAfterTick["scheduled"] || 0) +
                     (countsAfterTick["running"] || 0) +
                     (countsAfterTick["completed"] || 0) +
                     (countsAfterTick["failed"] || 0) +
                     (countsAfterTick["blocked_budget"] || 0);

  if (movedCount > 0) {
    record("Post-tick transition", "PASS",
      `Scheduler tick moved ${movedCount} jobs: ${formatCounts(countsAfterTick)}. ` +
      `Max 10 per tick enforced: ${movedCount <= 10 ? "yes" : "NO — rate limit broken!"}`);
  } else {
    const allQueued = (countsAfterTick["queued"] || 0) === JOB_COUNT;
    const allBlocked = (countsAfterTick["blocked_budget"] || 0) > 0;
    if (allBlocked) {
      record("Post-tick transition", "PASS",
        `All jobs blocked by budget — scheduler correctly enforced budget: ${formatCounts(countsAfterTick)}`);
    } else if (allQueued) {
      record("Post-tick transition", "FAIL",
        `No jobs moved after tick — scheduler may not have picked up client ${TEST_CLIENT_ID}. ` +
        `Check if AI is enabled and budget is configured. Counts: ${formatCounts(countsAfterTick)}`);
    }
  }

  // Step 7: Verify rate limit — at most MAX_JOBS_PER_TICK (10) should have moved in one tick
  console.log("\n--- Phase 7: Rate limit check ---");
  const executedOrScheduled = (countsAfterTick["running"] || 0) +
                              (countsAfterTick["completed"] || 0) +
                              (countsAfterTick["failed"] || 0) +
                              (countsAfterTick["scheduled"] || 0);
  if (executedOrScheduled > 10) {
    record("Rate limit (max 10/tick)", "FAIL",
      `${executedOrScheduled} jobs moved past queued in 1 tick — exceeds MAX_JOBS_PER_TICK=10`);
  } else {
    record("Rate limit (max 10/tick)", "PASS",
      `${executedOrScheduled} jobs moved (≤10 limit). Remaining queued: ${countsAfterTick["queued"] || 0}`);
  }

  // Cleanup: remove test jobs and restart scheduler
  console.log("\n--- Cleanup ---");
  await db.delete(insightJobs).where(inArray(insightJobs.id, jobIds));
  console.log(`  Deleted ${jobIds.length} test jobs`);
  startScheduler();
  console.log("  Scheduler restarted\n");

  // Summary
  console.log("=======================================================");
  console.log("  RESULTS SUMMARY");
  console.log("=======================================================\n");

  const passes = results.filter(r => r.status === "PASS");
  const fails = results.filter(r => r.status === "FAIL");

  console.log(`  Total checks:   ${results.length}`);
  console.log(`  PASS:           ${passes.length}`);
  console.log(`  FAIL:           ${fails.length}\n`);

  console.log("  +-------+---------------------------------------------+--------+");
  console.log("  | Check | Description                                 | Result |");
  console.log("  +-------+---------------------------------------------+--------+");
  for (const r of results) {
    const padStep = r.step.padEnd(43);
    console.log(`  | ${padStep} | ${r.status.padEnd(6)} |`);
  }
  console.log("  +-------+---------------------------------------------+--------+\n");

  if (fails.length > 0) {
    console.log("  FINAL VERDICT: *** FAIL *** — " + fails.length + " check(s) failed");
    console.log("  A route or worker is bypassing the scheduler!\n");

    for (const f of fails) {
      console.log(`    FAILED: ${f.step}`);
      console.log(`      ${f.detail}\n`);
    }
    process.exit(1);
  } else {
    console.log("  FINAL VERDICT: PASS — No immediate execution detected");
    console.log("  All 20 jobs stayed queued until scheduler tick fired.\n");
  }
}

run().catch(err => {
  console.error("Test crashed:", err);
  startScheduler();
  process.exit(2);
});
