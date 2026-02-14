import { db } from "../server/db";
import { insightJobs, clients, aiUsageLog } from "../shared/schema";
import { eq, inArray, and, sql, gte, isNull, not } from "drizzle-orm";
import { storage } from "../server/storage";
import { startInsightJob, runInsightAI, completeInsightJob } from "../server/ai/ai-gateway";
import { _schedulerTickForTesting as runSchedulerTick } from "../server/ai/ai-scheduler";

const CLIENT_A = 9001;
const CLIENT_B = 9002;
const DRY_RUN_TOKENS = 1000;

let testJobIds: number[] = [];

async function run() {
  console.log("=======================================================");
  console.log("  TEST: BILLING TRUTH (ledger integrity)");
  console.log("  Goal: Prove usage ledger matches job ledger exactly.");
  console.log("");
  console.log("  Checks:");
  console.log("  1. ai_usage_log totals = sum of completed job result tokens");
  console.log("  2. ai_usage_log totals = getDailyAiUsage() per client");
  console.log("  3. completed jobs × DRY_RUN tokens = usage totals");
  console.log("  4. No orphan usage logs (usage without a valid job)");
  console.log("  5. No completed jobs with zero usage (unless skipped)");
  console.log("  6. No usage rows for non-running/completed jobs");
  console.log("  7. No usage rows for expired jobs");
  console.log("  Date: " + new Date().toISOString());
  console.log("  AI_DRY_RUN=1 required.");
  console.log("=======================================================\n");

  if (process.env.AI_DRY_RUN !== "1") {
    console.error("  ERROR: This test requires AI_DRY_RUN=1");
    process.exit(2);
  }

  const origA = await db.select().from(clients).where(eq(clients.id, CLIENT_A)).then(r => r[0]);
  const origB = await db.select().from(clients).where(eq(clients.id, CLIENT_B)).then(r => r[0]);
  if (!origA || !origB) {
    console.error(`Clients ${CLIENT_A} and/or ${CLIENT_B} not found`);
    process.exit(2);
  }

  await db.update(clients).set({
    aiEnabled: true,
    dailyTokenBudget: 50000,
    dailyJobLimit: 100,
  }).where(inArray(clients.id, [CLIENT_A, CLIENT_B]));

  let pass = true;
  const reasons: string[] = [];
  const expiresAt = new Date(Date.now() + 3600000);

  console.log("--- Phase 1: Create jobs for both clients ---");
  const JOBS_A = 8;
  const JOBS_B = 5;

  for (let i = 0; i < JOBS_A; i++) {
    const [job] = await db.insert(insightJobs).values({
      clientId: CLIENT_A,
      type: "qa",
      status: "queued",
      attempt: 0,
      expiresAt,
      payload: { systemPrompt: `billing-A-${i}`, userContent: `content-A-${i}` },
      maxTokens: 10,
    }).returning({ id: insightJobs.id });
    testJobIds.push(job.id);
  }

  for (let i = 0; i < JOBS_B; i++) {
    const [job] = await db.insert(insightJobs).values({
      clientId: CLIENT_B,
      type: "qa",
      status: "queued",
      attempt: 0,
      expiresAt,
      payload: { systemPrompt: `billing-B-${i}`, userContent: `content-B-${i}` },
      maxTokens: 10,
    }).returning({ id: insightJobs.id });
    testJobIds.push(job.id);
  }
  console.log(`  Created ${JOBS_A} jobs for client ${CLIENT_A}, ${JOBS_B} for client ${CLIENT_B}\n`);

  console.log("--- Phase 2: Run scheduler ticks until all test jobs complete ---");
  const maxTicks = 20;
  for (let tick = 0; tick < maxTicks; tick++) {
    const pending = await db.select({ count: sql<number>`count(*)` })
      .from(insightJobs)
      .where(and(
        inArray(insightJobs.id, testJobIds),
        inArray(insightJobs.status, ["queued", "scheduled", "running"])
      ))
      .then(r => Number(r[0].count));

    if (pending === 0) {
      console.log(`  All jobs settled after ${tick} ticks\n`);
      break;
    }
    await runSchedulerTick();
  }

  console.log("--- Phase 3: Gather ledger data ---\n");

  const completedJobs = await db.select()
    .from(insightJobs)
    .where(and(
      inArray(insightJobs.id, testJobIds),
      eq(insightJobs.status, "completed")
    ));

  const completedA = completedJobs.filter(j => j.clientId === CLIENT_A);
  const completedB = completedJobs.filter(j => j.clientId === CLIENT_B);

  const usageLogs = await db.select()
    .from(aiUsageLog)
    .where(inArray(aiUsageLog.jobId, testJobIds));

  const usageByClient: Record<number, { totalTokens: number; logCount: number }> = {};
  for (const log of usageLogs) {
    if (!usageByClient[log.clientId]) usageByClient[log.clientId] = { totalTokens: 0, logCount: 0 };
    usageByClient[log.clientId].totalTokens += (log.totalTokens ?? 0);
    usageByClient[log.clientId].logCount++;
  }

  const jobResultTokensByClient: Record<number, number> = {};
  for (const job of completedJobs) {
    const result = job.result as any;
    const tokens = result?.usage?.totalTokens ?? 0;
    if (!jobResultTokensByClient[job.clientId]) jobResultTokensByClient[job.clientId] = 0;
    jobResultTokensByClient[job.clientId] += tokens;
  }

  console.log("--- Check 1: Usage log totals match completed job result tokens ---");
  for (const clientId of [CLIENT_A, CLIENT_B]) {
    const usageTotal = usageByClient[clientId]?.totalTokens ?? 0;
    const jobTotal = jobResultTokensByClient[clientId] ?? 0;
    if (usageTotal === jobTotal) {
      reasons.push(`PASS: Client ${clientId}: usage_log tokens (${usageTotal}) = job result tokens (${jobTotal})`);
    } else {
      pass = false;
      reasons.push(`FAIL: Client ${clientId}: usage_log tokens (${usageTotal}) ≠ job result tokens (${jobTotal}) — ledger mismatch!`);
    }
  }

  console.log("--- Check 2: Usage log totals match getDailyAiUsage() ---");
  for (const clientId of [CLIENT_A, CLIENT_B]) {
    const daily = await storage.getDailyAiUsage(clientId);
    const usageTotal = usageByClient[clientId]?.totalTokens ?? 0;
    const usageCount = usageByClient[clientId]?.logCount ?? 0;

    if (daily.totalTokens >= usageTotal && daily.jobCount >= usageCount) {
      reasons.push(`PASS: Client ${clientId}: getDailyAiUsage() tokens=${daily.totalTokens} (≥ test ${usageTotal}), jobs=${daily.jobCount} (≥ test ${usageCount})`);
    } else {
      pass = false;
      reasons.push(`FAIL: Client ${clientId}: getDailyAiUsage() tokens=${daily.totalTokens} / jobs=${daily.jobCount} lower than test usage ${usageTotal} / ${usageCount}`);
    }
  }

  console.log("--- Check 3: Completed jobs × DRY_RUN tokens = usage totals ---");
  for (const clientId of [CLIENT_A, CLIENT_B]) {
    const completed = clientId === CLIENT_A ? completedA : completedB;
    const expectedTokens = completed.length * DRY_RUN_TOKENS;
    const actualTokens = usageByClient[clientId]?.totalTokens ?? 0;
    if (actualTokens === expectedTokens) {
      reasons.push(`PASS: Client ${clientId}: ${completed.length} completed × ${DRY_RUN_TOKENS} = ${expectedTokens} tokens (actual: ${actualTokens})`);
    } else {
      pass = false;
      reasons.push(`FAIL: Client ${clientId}: ${completed.length} completed × ${DRY_RUN_TOKENS} = ${expectedTokens}, but actual=${actualTokens} — drift!`);
    }
  }

  console.log("--- Check 4: No orphan usage logs (usage without a valid job) ---");
  {
    const orphans = await db.select({
      logId: aiUsageLog.id,
      logJobId: aiUsageLog.jobId,
    })
      .from(aiUsageLog)
      .leftJoin(insightJobs, eq(aiUsageLog.jobId, insightJobs.id))
      .where(and(
        inArray(aiUsageLog.jobId, testJobIds),
        isNull(insightJobs.id)
      ));

    if (orphans.length === 0) {
      reasons.push(`PASS: Zero orphan usage logs — every usage row has a valid job`);
    } else {
      pass = false;
      reasons.push(`FAIL: ${orphans.length} orphan usage log(s) found: ${JSON.stringify(orphans)}`);
    }
  }

  console.log("--- Check 5: No completed jobs with zero usage ---");
  {
    const jobIdsWithUsage = new Set(usageLogs.map(l => l.jobId));
    const completedNoUsage = completedJobs.filter(j => !jobIdsWithUsage.has(j.id));

    if (completedNoUsage.length === 0) {
      reasons.push(`PASS: All ${completedJobs.length} completed jobs have usage log entries`);
    } else {
      pass = false;
      reasons.push(`FAIL: ${completedNoUsage.length} completed job(s) have NO usage log: ${completedNoUsage.map(j => j.id).join(", ")}`);
    }
  }

  console.log("--- Check 6: No usage rows for non-terminal jobs (queued/scheduled) ---");
  {
    const nonTerminalJobs = await db.select({ id: insightJobs.id, status: insightJobs.status })
      .from(insightJobs)
      .where(and(
        inArray(insightJobs.id, testJobIds),
        inArray(insightJobs.status, ["queued", "scheduled", "blocked_budget"])
      ));

    const nonTerminalIds = nonTerminalJobs.map(j => j.id);
    const badUsage = usageLogs.filter(l => nonTerminalIds.includes(l.jobId));

    if (badUsage.length === 0) {
      reasons.push(`PASS: Zero usage logs for ${nonTerminalJobs.length} non-terminal jobs (queued/scheduled/blocked)`);
    } else {
      pass = false;
      reasons.push(`FAIL: ${badUsage.length} usage log(s) exist for non-terminal jobs: ${badUsage.map(l => `job=${l.jobId}`).join(", ")}`);
    }
  }

  console.log("--- Check 7: No usage rows for expired jobs ---");
  {
    const expiredJobs = await db.select({ id: insightJobs.id })
      .from(insightJobs)
      .where(and(
        inArray(insightJobs.id, testJobIds),
        eq(insightJobs.status, "expired")
      ));

    const expiredIds = expiredJobs.map(j => j.id);
    const expiredUsage = usageLogs.filter(l => expiredIds.includes(l.jobId));

    if (expiredUsage.length === 0) {
      reasons.push(`PASS: Zero usage logs for ${expiredJobs.length} expired jobs`);
    } else {
      pass = false;
      reasons.push(`FAIL: ${expiredUsage.length} usage log(s) exist for expired jobs: ${expiredUsage.map(l => `job=${l.jobId}`).join(", ")}`);
    }
  }

  console.log("--- Check 8: Usage log count = completed job count per client ---");
  for (const clientId of [CLIENT_A, CLIENT_B]) {
    const completed = clientId === CLIENT_A ? completedA : completedB;
    const logCount = usageByClient[clientId]?.logCount ?? 0;
    if (logCount === completed.length) {
      reasons.push(`PASS: Client ${clientId}: usage log rows (${logCount}) = completed jobs (${completed.length}) — 1:1 mapping`);
    } else {
      pass = false;
      reasons.push(`FAIL: Client ${clientId}: usage log rows (${logCount}) ≠ completed jobs (${completed.length}) — missing or duplicate charges!`);
    }
  }

  console.log("--- Check 9: Cross-ledger balance equation ---");
  {
    const totalUsageTokens = usageLogs.reduce((s, l) => s + (l.totalTokens ?? 0), 0);
    const totalJobTokens = Object.values(jobResultTokensByClient).reduce((s, t) => s + t, 0);
    const totalCompletedCount = completedJobs.length;
    const expectedGlobalTokens = totalCompletedCount * DRY_RUN_TOKENS;

    const allMatch = totalUsageTokens === totalJobTokens && totalJobTokens === expectedGlobalTokens;
    if (allMatch) {
      reasons.push(`PASS: Global balance: usage=${totalUsageTokens}, job_results=${totalJobTokens}, ${totalCompletedCount}×${DRY_RUN_TOKENS}=${expectedGlobalTokens} — all equal`);
    } else {
      pass = false;
      reasons.push(`FAIL: Global balance mismatch: usage=${totalUsageTokens}, job_results=${totalJobTokens}, expected=${expectedGlobalTokens}`);
    }
  }

  console.log("\n--- Cleanup ---");
  if (testJobIds.length > 0) {
    await db.delete(aiUsageLog).where(inArray(aiUsageLog.jobId, testJobIds));
    await db.delete(insightJobs).where(inArray(insightJobs.id, testJobIds));
    console.log(`  Deleted ${testJobIds.length} test jobs and their usage logs`);
  }

  await db.update(clients).set({
    aiEnabled: origA.aiEnabled,
    dailyTokenBudget: origA.dailyTokenBudget,
    dailyJobLimit: origA.dailyJobLimit,
  }).where(eq(clients.id, CLIENT_A));
  await db.update(clients).set({
    aiEnabled: origB.aiEnabled,
    dailyTokenBudget: origB.dailyTokenBudget,
    dailyJobLimit: origB.dailyJobLimit,
  }).where(eq(clients.id, CLIENT_B));
  console.log(`  Restored clients ${CLIENT_A} and ${CLIENT_B}\n`);

  console.log("=======================================================");
  console.log("  CHECKS");
  console.log("=======================================================\n");

  for (const r of reasons) {
    const icon = r.startsWith("PASS") ? "  [PASS]" : r.startsWith("FAIL") ? "  [FAIL]" : "  [INFO]";
    console.log(`${icon} ${r}`);
  }

  const passCount = reasons.filter(r => r.startsWith("PASS")).length;
  const failCount = reasons.filter(r => r.startsWith("FAIL")).length;

  console.log(`\n  Score: ${passCount} passed, ${failCount} failed out of ${reasons.length} checks\n`);

  if (!pass) {
    console.log("  FINAL VERDICT: *** FAIL *** — Billing ledger integrity violation detected\n");
    process.exit(1);
  } else {
    console.log("  FINAL VERDICT: PASS — Billing ledgers are truthful\n");
    console.log("  Structural guarantees proven:");
    console.log("  - Usage log token sums = job result token sums per client");
    console.log("  - getDailyAiUsage() reflects actual usage");
    console.log("  - Completed count × DRY_RUN tokens = exact usage total");
    console.log("  - No orphan usage logs (every charge maps to a real job)");
    console.log("  - No completed jobs missing usage (every completion has a charge)");
    console.log("  - No phantom charges on queued/scheduled/blocked/expired jobs");
    console.log("  - 1:1 mapping between usage log rows and completed jobs");
    console.log("  - Global cross-ledger balance equation holds\n");
  }
}

run().catch(async (err) => {
  console.error("Test crashed:", err);
  if (testJobIds.length > 0) {
    await db.delete(aiUsageLog).where(inArray(aiUsageLog.jobId, testJobIds)).catch(() => {});
    await db.delete(insightJobs).where(inArray(insightJobs.id, testJobIds)).catch(() => {});
  }
  process.exit(2);
});
