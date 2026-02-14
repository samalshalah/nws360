import { db } from "../server/db";
import { insightJobs, clients, articles } from "../shared/schema";
import { eq, inArray, and, gte, sql } from "drizzle-orm";
import { _schedulerTickForTesting } from "../server/ai/ai-scheduler";
import { enqueueAIJob } from "../server/ai/ai-gateway";

const TEST_CLIENT_ID = 9001;
const BURST_SIZE = 30;

let testJobIds: number[] = [];

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

function fmt(counts: Record<string, number>): string {
  const order = ["queued", "scheduled", "running", "completed", "failed", "blocked_budget", "expired"];
  return order
    .filter(s => (counts[s] || 0) > 0)
    .map(s => `${s}=${counts[s]}`)
    .join("  ");
}

async function run() {
  console.log("=======================================================");
  console.log("  TEST 4: ADMIN PRIVILEGE ATTACK");
  console.log("  Goal: Prove even global admin cannot bypass scheduler.");
  console.log("  Admin bulk-enqueues 30 AI jobs — they must queue,");
  console.log("  not execute instantly.");
  console.log("  Date: " + new Date().toISOString());
  console.log("=======================================================\n");

  const origClient = await db.select().from(clients).where(eq(clients.id, TEST_CLIENT_ID)).then(r => r[0]);
  if (!origClient) {
    console.error(`Client ${TEST_CLIENT_ID} not found`);
    process.exit(2);
  }

  console.log("--- Phase 1: Setup admin with high budget ---");
  await db.update(clients).set({
    aiEnabled: true,
    dailyTokenBudget: 999999,
    dailyJobLimit: 999,
  }).where(eq(clients.id, TEST_CLIENT_ID));
  console.log(`  Client ${TEST_CLIENT_ID} (${origClient.name}): budget=999999, limit=999\n`);

  console.log("--- Phase 2: Admin bulk-enqueues 30 jobs via enqueueAIJob ---");
  console.log("  Simulating: admin clicks 'Reanalyze All Articles'");
  console.log("  Each article triggers enqueueAIJob() which MUST return");
  console.log("  a queued job — not an executed result.\n");

  const enqueueStart = Date.now();
  let anyInstant = false;

  for (let i = 0; i < BURST_SIZE; i++) {
    const job = await enqueueAIJob(TEST_CLIENT_ID, "classification", {
      systemPrompt: `admin-attack-test article ${i}`,
      userContent: `Simulated article content for reanalysis test ${i}. This is a test of the scheduler's rate limiting under admin privilege.`,
    }, 10);

    testJobIds.push(job.id);

    if (job.status !== "queued") {
      console.log(`  *** ALERT: Job ${job.id} returned status="${job.status}" instead of "queued"!`);
      anyInstant = true;
    }
  }
  const enqueueMs = Date.now() - enqueueStart;
  console.log(`  Enqueued ${testJobIds.length} jobs in ${enqueueMs}ms`);
  console.log(`  IDs: ${testJobIds[0]}..${testJobIds[testJobIds.length - 1]}\n`);

  console.log("--- Phase 3: Verify ALL jobs are queued (none executed) ---");
  const counts0 = await getJobStatusCounts(testJobIds);
  console.log(`  Immediate status: ${fmt(counts0)}`);

  const queuedCount = counts0["queued"] || 0;
  const instantExec = (counts0["running"] || 0) + (counts0["completed"] || 0);
  console.log(`  Queued: ${queuedCount}/${BURST_SIZE}`);
  console.log(`  Instantly executing: ${instantExec}`);

  if (instantExec > 0) {
    console.log(`  *** BACKDOOR DETECTED: ${instantExec} jobs executed immediately!\n`);
  } else {
    console.log(`  No instant execution — all jobs waiting for scheduler.\n`);
  }

  console.log("--- Phase 4: Fire scheduler ticks — observe gradual execution ---");
  const tickResults: { tick: number; leftQueue: number; counts: Record<string, number> }[] = [];

  for (let tick = 1; tick <= 8; tick++) {
    const pre = await getJobStatusCounts(testJobIds);
    const preQueued = pre["queued"] || 0;

    if (preQueued === 0 && (pre["scheduled"] || 0) === 0 && (pre["running"] || 0) === 0) {
      console.log(`  tick=${tick}: All jobs in terminal state — stopping.\n`);
      break;
    }

    const tickStart = Date.now();
    await _schedulerTickForTesting();
    const tickMs = Date.now() - tickStart;

    const post = await getJobStatusCounts(testJobIds);
    const leftQueue = preQueued - (post["queued"] || 0);
    tickResults.push({ tick, leftQueue, counts: post });

    console.log(`  tick=${tick}  (${tickMs}ms)  left_queue=${leftQueue}  → ${fmt(post)}`);
  }

  const finalCounts = await getJobStatusCounts(testJobIds);
  console.log(`\n  Final: ${fmt(finalCounts)}\n`);

  console.log("--- Cleanup ---");
  await db.delete(insightJobs).where(inArray(insightJobs.id, testJobIds));
  console.log(`  Deleted ${testJobIds.length} test jobs`);

  await db.update(clients).set({
    aiEnabled: origClient.aiEnabled,
    dailyTokenBudget: origClient.dailyTokenBudget,
    dailyJobLimit: origClient.dailyJobLimit,
  }).where(eq(clients.id, TEST_CLIENT_ID));
  console.log(`  Restored client ${TEST_CLIENT_ID}\n`);

  console.log("=======================================================");
  console.log("  CHECKS");
  console.log("=======================================================\n");

  let pass = true;
  const reasons: string[] = [];

  if (anyInstant) {
    pass = false;
    reasons.push(`FAIL: enqueueAIJob returned non-queued status — hidden backdoor`);
  } else {
    reasons.push(`PASS: All ${BURST_SIZE} enqueueAIJob calls returned status="queued"`);
  }

  if (instantExec > 0) {
    pass = false;
    reasons.push(`FAIL: ${instantExec} jobs executed instantly before any scheduler tick`);
  } else {
    reasons.push(`PASS: Zero jobs running/completed before scheduler tick — no instant execution`);
  }

  let maxLeftPerTick = 0;
  for (const r of tickResults) {
    if (r.leftQueue > maxLeftPerTick) maxLeftPerTick = r.leftQueue;
  }

  if (maxLeftPerTick > 20) {
    pass = false;
    reasons.push(`FAIL: Max ${maxLeftPerTick} jobs left queue in one tick (expected ≤20 with possible live server)`);
  } else {
    reasons.push(`PASS: Max ${maxLeftPerTick} jobs left queue per tick — gradual execution enforced`);
  }

  const ticksNeeded = tickResults.length;
  if (ticksNeeded < 2) {
    pass = false;
    reasons.push(`FAIL: All ${BURST_SIZE} jobs completed in ${ticksNeeded} tick — no time-spreading`);
  } else {
    reasons.push(`PASS: Jobs spread across ${ticksNeeded} ticks — admin privilege did NOT bypass rate limit`);
  }

  const terminalFinal = (finalCounts["completed"] || 0) + (finalCounts["failed"] || 0);
  if (terminalFinal >= BURST_SIZE * 0.8) {
    reasons.push(`PASS: ${terminalFinal}/${BURST_SIZE} jobs reached terminal state`);
  } else {
    reasons.push(`INFO: Only ${terminalFinal}/${BURST_SIZE} terminal — some may still be in-flight from live server`);
  }

  console.log("");
  for (const r of reasons) {
    const icon = r.startsWith("PASS") ? "  [PASS]" : r.startsWith("FAIL") ? "  [FAIL]" : "  [INFO]";
    console.log(`${icon} ${r}`);
  }

  console.log("");
  if (!pass) {
    console.log("  FINAL VERDICT: *** FAIL *** — Admin privilege attack succeeded\n");
    process.exit(1);
  } else {
    console.log("  FINAL VERDICT: PASS — Admin cannot cheat physics\n");
    console.log("  Even with max budget and system admin privileges,");
    console.log("  30 jobs queued → gradual execution via scheduler ticks.");
    console.log("  No hidden backdoor. No instant execution.\n");
  }
}

run().catch(async (err) => {
  console.error("Test crashed:", err);
  if (testJobIds.length > 0) {
    await db.delete(insightJobs).where(inArray(insightJobs.id, testJobIds)).catch(() => {});
  }
  process.exit(2);
});
