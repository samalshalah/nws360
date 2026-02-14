import { db } from "../server/db";
import { insightJobs, clients, aiUsageLog } from "../shared/schema";
import { eq, inArray, and, gte, sql } from "drizzle-orm";
import { _schedulerTickForTesting } from "../server/ai/ai-scheduler";

const TEST_CLIENT_ID = 9001;
const JOB_COUNT = 20;
const BUDGET_TOKENS = 5000;
const JOB_LIMIT = 10;
const SIM_TOKENS_PER_JOB = 1000;

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
  console.log("  TEST 6: BUDGET DRIFT (silent leak killer)");
  console.log("  Goal: Prove tenant cannot exceed dailyTokenBudget");
  console.log("  or dailyJobLimit even with retries and long runs.");
  console.log("");
  console.log("  Setup: budget=5000 tokens, limit=10 jobs");
  console.log("  Sim tokens/job=1000 → expect exactly 5 complete");
  console.log("  (budget exhausted at 5×1000=5000)");
  console.log("  AI_DRY_RUN=1 required for simulated tokens.");
  console.log("  Date: " + new Date().toISOString());
  console.log("=======================================================\n");

  if (process.env.AI_DRY_RUN !== "1") {
    console.error("  ERROR: This test requires AI_DRY_RUN=1 to simulate token usage.");
    console.error("  Run with: AI_DRY_RUN=1 npx tsx scripts/budget-drift-test.ts");
    process.exit(2);
  }

  const origClient = await db.select().from(clients).where(eq(clients.id, TEST_CLIENT_ID)).then(r => r[0]);
  if (!origClient) {
    console.error(`Client ${TEST_CLIENT_ID} not found`);
    process.exit(2);
  }

  console.log("--- Phase 0: Clear daily usage baseline ---");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cleared = await db.delete(aiUsageLog).where(and(
    eq(aiUsageLog.clientId, TEST_CLIENT_ID),
    gte(aiUsageLog.createdAt, todayStart),
  ));
  console.log(`  Cleared today's usage log for client ${TEST_CLIENT_ID} (clean slate)`);

  const expectedByTokens = Math.floor(BUDGET_TOKENS / SIM_TOKENS_PER_JOB);
  const expectedCompletions = Math.min(expectedByTokens, JOB_LIMIT);
  console.log(`  Budget: ${BUDGET_TOKENS} tokens, Limit: ${JOB_LIMIT} jobs`);
  console.log(`  Expected completions: ${expectedCompletions} (${BUDGET_TOKENS}/${SIM_TOKENS_PER_JOB}=${expectedByTokens} by tokens, capped by limit=${JOB_LIMIT})\n`);

  console.log("--- Phase 1: Set tight budget ---");
  await db.update(clients).set({
    aiEnabled: true,
    dailyTokenBudget: BUDGET_TOKENS,
    dailyJobLimit: JOB_LIMIT,
  }).where(eq(clients.id, TEST_CLIENT_ID));
  console.log(`  Client ${TEST_CLIENT_ID}: budget=${BUDGET_TOKENS} tokens, limit=${JOB_LIMIT} jobs\n`);

  console.log("--- Phase 2: Enqueue 20 jobs ---");
  const expiresAt = new Date(Date.now() + 3600000);
  for (let i = 0; i < JOB_COUNT; i++) {
    const [job] = await db.insert(insightJobs).values({
      clientId: TEST_CLIENT_ID,
      type: "qa",
      status: "queued",
      expiresAt,
      payload: {
        systemPrompt: `budget-drift job ${i}`,
        userContent: `drift payload ${i}`,
      },
      maxTokens: 10,
    }).returning({ id: insightJobs.id });
    testJobIds.push(job.id);
  }
  console.log(`  Created ${testJobIds.length} jobs (IDs ${testJobIds[0]}..${testJobIds[testJobIds.length - 1]})\n`);

  console.log("--- Phase 3: Run scheduler ticks until stable ---");
  const MAX_TICKS = 10;
  let prevCounts = "";

  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    await _schedulerTickForTesting();
    const counts = await getJobStatusCounts(testJobIds);
    const countsStr = fmt(counts);
    console.log(`  tick=${tick}  → ${countsStr}`);

    const q = counts["queued"] || 0;
    const s = counts["scheduled"] || 0;
    const r = counts["running"] || 0;

    if (q === 0 && s === 0 && r === 0) {
      console.log(`  Stabilized at tick ${tick}.\n`);
      break;
    }

    if (countsStr === prevCounts) {
      console.log(`  No change — stabilized at tick ${tick}.\n`);
      break;
    }
    prevCounts = countsStr;
  }

  console.log("--- Phase 4: Measure actual usage ---");
  const testUsage = await db.select({
    totalTokens: sql<number>`coalesce(sum(${aiUsageLog.totalTokens}), 0)`,
    jobCount: sql<number>`count(*)`,
  }).from(aiUsageLog)
    .where(and(
      eq(aiUsageLog.clientId, TEST_CLIENT_ID),
      gte(aiUsageLog.createdAt, todayStart),
    )).then(r => r[0]);

  const testTokensUsed = Number(testUsage.totalTokens);
  const testJobsLogged = Number(testUsage.jobCount);

  const finalCounts = await getJobStatusCounts(testJobIds);
  const completed = finalCounts["completed"] || 0;
  const blocked = finalCounts["blocked_budget"] || 0;
  const failed = finalCounts["failed"] || 0;
  const queued = finalCounts["queued"] || 0;

  console.log(`  Test tokens used: ${testTokensUsed}`);
  console.log(`  Test jobs logged: ${testJobsLogged}`);
  console.log(`  Final job states: ${fmt(finalCounts)}\n`);

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

  if (testTokensUsed > BUDGET_TOKENS) {
    pass = false;
    reasons.push(`FAIL: Token drift! Used ${testTokensUsed} > budget ${BUDGET_TOKENS}`);
  } else {
    reasons.push(`PASS: Token usage ${testTokensUsed} ≤ budget ${BUDGET_TOKENS} — no drift`);
  }

  if (testJobsLogged > JOB_LIMIT) {
    pass = false;
    reasons.push(`FAIL: Job drift! Logged ${testJobsLogged} > limit ${JOB_LIMIT}`);
  } else {
    reasons.push(`PASS: Jobs logged ${testJobsLogged} ≤ limit ${JOB_LIMIT} — no drift`);
  }

  if (completed > expectedCompletions + 2) {
    pass = false;
    reasons.push(`FAIL: Completed ${completed} too many jobs — expected ~${expectedCompletions}`);
  } else {
    reasons.push(`PASS: Completed ${completed} jobs (expected ~${expectedCompletions})`);
  }

  if (blocked > 0) {
    reasons.push(`PASS: ${blocked} jobs in blocked_budget — correctly paused, not failed`);
  } else if (completed + failed < JOB_COUNT) {
    reasons.push(`INFO: ${queued} jobs still queued (may need more ticks or live server processed some)`);
  }

  if (queued > 0 && blocked === 0 && completed < expectedCompletions) {
    pass = false;
    reasons.push(`FAIL: ${queued} jobs stuck queued instead of blocked_budget — budget gating inconsistent`);
  } else if (queued === 0 || blocked > 0) {
    reasons.push(`PASS: No jobs stuck in queued — budget gating applied consistently`);
  }

  const totalAccountedFor = completed + blocked + failed;
  if (totalAccountedFor === JOB_COUNT) {
    reasons.push(`PASS: All ${JOB_COUNT} jobs accounted for (${completed} completed + ${blocked} blocked + ${failed} failed)`);
  } else {
    const inFlight = (finalCounts["running"] || 0) + (finalCounts["scheduled"] || 0) + queued;
    reasons.push(`INFO: ${totalAccountedFor}/${JOB_COUNT} in terminal/blocked state, ${inFlight} still in-flight`);
  }

  console.log("");
  for (const r of reasons) {
    const icon = r.startsWith("PASS") ? "  [PASS]" : r.startsWith("FAIL") ? "  [FAIL]" : "  [INFO]";
    console.log(`${icon} ${r}`);
  }

  console.log("");
  if (!pass) {
    console.log("  FINAL VERDICT: *** FAIL *** — Budget drift detected (silent leak)\n");
    process.exit(1);
  } else {
    console.log("  FINAL VERDICT: PASS — Zero budget drift\n");
    console.log(`  ${JOB_COUNT} jobs enqueued, ${completed} completed, ${blocked} blocked`);
    console.log(`  Tokens: ${testTokensUsed}/${BUDGET_TOKENS} used (zero leak)`);
    console.log(`  Jobs: ${testJobsLogged}/${JOB_LIMIT} logged`);
    console.log(`  No silent over-spending. Budget is airtight.\n`);
  }
}

run().catch(async (err) => {
  console.error("Test crashed:", err);
  if (testJobIds.length > 0) {
    await db.delete(insightJobs).where(inArray(insightJobs.id, testJobIds)).catch(() => {});
  }
  process.exit(2);
});
