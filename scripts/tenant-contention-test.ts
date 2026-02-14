import { db } from "../server/db";
import { insightJobs, clients, aiUsageLog } from "../shared/schema";
import { eq, inArray, and, gte, sql } from "drizzle-orm";
import { _schedulerTickForTesting } from "../server/ai/ai-scheduler";

const TENANT_A_ID = 9001;
const TENANT_B_ID = 9002;

const TENANT_A_JOBS = 100;
const TENANT_B_JOBS = 10;
const TENANT_A_BUDGET = 999_999;
const TENANT_A_LIMIT = 999;
const TENANT_B_BUDGET = 5000;
const TENANT_B_LIMIT = 10;
const SIM_TOKENS_PER_JOB = 1000;
const MAX_TICKS = 25;

let tenantAJobIds: number[] = [];
let tenantBJobIds: number[] = [];

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
  console.log("  TEST 7: MULTI-TENANT CONTENTION (no noisy neighbor)");
  console.log("  Goal: Tenant A (100 jobs, huge budget) must NOT");
  console.log("  starve Tenant B (10 jobs, small budget).");
  console.log("");
  console.log("  Setup:");
  console.log(`    Tenant A (${TENANT_A_ID}): ${TENANT_A_JOBS} jobs, budget=${TENANT_A_BUDGET}`);
  console.log(`    Tenant B (${TENANT_B_ID}): ${TENANT_B_JOBS} jobs, budget=${TENANT_B_BUDGET}`);
  console.log("    Scheduler tick limit = 10 jobs/tick");
  console.log("    AI_DRY_RUN=1 required.");
  console.log("  Date: " + new Date().toISOString());
  console.log("=======================================================\n");

  if (process.env.AI_DRY_RUN !== "1") {
    console.error("  ERROR: This test requires AI_DRY_RUN=1");
    process.exit(2);
  }

  const origA = await db.select().from(clients).where(eq(clients.id, TENANT_A_ID)).then(r => r[0]);
  let origB = await db.select().from(clients).where(eq(clients.id, TENANT_B_ID)).then(r => r[0]);
  const createdB = !origB;

  if (!origA) {
    console.error(`Client ${TENANT_A_ID} not found`);
    process.exit(2);
  }

  if (!origB) {
    console.log(`  Creating test tenant B (${TENANT_B_ID})...`);
    const [newB] = await db.insert(clients).values({
      id: TENANT_B_ID,
      name: "CONTENTION_TEST_B",
      aiEnabled: true,
      dailyTokenBudget: TENANT_B_BUDGET,
      dailyJobLimit: TENANT_B_LIMIT,
    }).returning();
    origB = newB;
  }

  console.log("--- Phase 0: Clear daily usage ---");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  await db.delete(aiUsageLog).where(and(
    eq(aiUsageLog.clientId, TENANT_A_ID),
    gte(aiUsageLog.createdAt, todayStart),
  ));
  await db.delete(aiUsageLog).where(and(
    eq(aiUsageLog.clientId, TENANT_B_ID),
    gte(aiUsageLog.createdAt, todayStart),
  ));
  console.log("  Cleared usage for both tenants.\n");

  console.log("--- Phase 1: Set budgets ---");
  await db.update(clients).set({
    aiEnabled: true,
    dailyTokenBudget: TENANT_A_BUDGET,
    dailyJobLimit: TENANT_A_LIMIT,
  }).where(eq(clients.id, TENANT_A_ID));

  await db.update(clients).set({
    aiEnabled: true,
    dailyTokenBudget: TENANT_B_BUDGET,
    dailyJobLimit: TENANT_B_LIMIT,
  }).where(eq(clients.id, TENANT_B_ID));
  console.log(`  Tenant A: budget=${TENANT_A_BUDGET}, limit=${TENANT_A_LIMIT}`);
  console.log(`  Tenant B: budget=${TENANT_B_BUDGET}, limit=${TENANT_B_LIMIT}\n`);

  console.log("--- Phase 2: Enqueue jobs ---");
  const expiresAt = new Date(Date.now() + 3600000);

  for (let i = 0; i < TENANT_A_JOBS; i++) {
    const [job] = await db.insert(insightJobs).values({
      clientId: TENANT_A_ID,
      type: "qa",
      status: "queued",
      expiresAt,
      payload: { systemPrompt: `tenantA job ${i}`, userContent: `A-${i}` },
      maxTokens: 10,
    }).returning({ id: insightJobs.id });
    tenantAJobIds.push(job.id);
  }

  for (let i = 0; i < TENANT_B_JOBS; i++) {
    const [job] = await db.insert(insightJobs).values({
      clientId: TENANT_B_ID,
      type: "qa",
      status: "queued",
      expiresAt,
      payload: { systemPrompt: `tenantB job ${i}`, userContent: `B-${i}` },
      maxTokens: 10,
    }).returning({ id: insightJobs.id });
    tenantBJobIds.push(job.id);
  }
  console.log(`  Tenant A: ${tenantAJobIds.length} jobs (IDs ${tenantAJobIds[0]}..${tenantAJobIds[tenantAJobIds.length - 1]})`);
  console.log(`  Tenant B: ${tenantBJobIds.length} jobs (IDs ${tenantBJobIds[0]}..${tenantBJobIds[tenantBJobIds.length - 1]})\n`);

  console.log("--- Phase 3: Run scheduler ticks ---");
  console.log("  tick | A-completed | B-completed | B-blocked");
  console.log("  -----+-------------+-------------+----------");

  let firstTickBCompleted: number | null = null;
  let bAllDoneTick: number | null = null;
  const tickHistory: { tick: number; aCompleted: number; bCompleted: number; bBlocked: number }[] = [];

  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    await _schedulerTickForTesting();

    const aCounts = await getJobStatusCounts(tenantAJobIds);
    const bCounts = await getJobStatusCounts(tenantBJobIds);
    const aCompleted = aCounts["completed"] || 0;
    const bCompleted = bCounts["completed"] || 0;
    const bBlocked = bCounts["blocked_budget"] || 0;

    tickHistory.push({ tick, aCompleted, bCompleted, bBlocked });
    console.log(`    ${String(tick).padStart(2)} |     ${String(aCompleted).padStart(3)}     |     ${String(bCompleted).padStart(3)}     |    ${String(bBlocked).padStart(2)}`);

    if (firstTickBCompleted === null && bCompleted > 0) {
      firstTickBCompleted = tick;
    }
    if (bAllDoneTick === null && (bCompleted + bBlocked) >= TENANT_B_JOBS) {
      bAllDoneTick = tick;
    }

    const aQueued = aCounts["queued"] || 0;
    const bQueued = bCounts["queued"] || 0;
    const aScheduled = aCounts["scheduled"] || 0;
    const bScheduled = bCounts["scheduled"] || 0;
    const aRunning = aCounts["running"] || 0;
    const bRunning = bCounts["running"] || 0;

    if (aQueued === 0 && bQueued === 0 && aScheduled === 0 && bScheduled === 0 && aRunning === 0 && bRunning === 0) {
      console.log(`  Stabilized at tick ${tick}.\n`);
      break;
    }
  }

  console.log("");

  console.log("--- Phase 4: Final states ---");
  const finalA = await getJobStatusCounts(tenantAJobIds);
  const finalB = await getJobStatusCounts(tenantBJobIds);
  console.log(`  Tenant A: ${fmt(finalA)}`);
  console.log(`  Tenant B: ${fmt(finalB)}\n`);

  console.log("--- Cleanup ---");
  await db.delete(insightJobs).where(inArray(insightJobs.id, [...tenantAJobIds, ...tenantBJobIds]));
  console.log(`  Deleted ${tenantAJobIds.length + tenantBJobIds.length} test jobs`);

  await db.update(clients).set({
    aiEnabled: origA.aiEnabled,
    dailyTokenBudget: origA.dailyTokenBudget,
    dailyJobLimit: origA.dailyJobLimit,
  }).where(eq(clients.id, TENANT_A_ID));

  if (createdB) {
    await db.delete(clients).where(eq(clients.id, TENANT_B_ID));
    console.log(`  Deleted test tenant B (${TENANT_B_ID})`);
  } else {
    await db.update(clients).set({
      aiEnabled: origB!.aiEnabled,
      dailyTokenBudget: origB!.dailyTokenBudget,
      dailyJobLimit: origB!.dailyJobLimit,
    }).where(eq(clients.id, TENANT_B_ID));
  }
  console.log(`  Restored tenants\n`);

  console.log("=======================================================");
  console.log("  CHECKS");
  console.log("=======================================================\n");

  let pass = true;
  const reasons: string[] = [];

  const bExpectedCompletions = Math.min(
    Math.floor(TENANT_B_BUDGET / SIM_TOKENS_PER_JOB),
    TENANT_B_LIMIT,
    TENANT_B_JOBS
  );

  if (firstTickBCompleted === null) {
    pass = false;
    reasons.push(`FAIL: Tenant B never completed any jobs — completely starved`);
  } else if (firstTickBCompleted <= 3) {
    reasons.push(`PASS: Tenant B got first completion at tick ${firstTickBCompleted} (within first 3 ticks — fair)`);
  } else {
    pass = false;
    reasons.push(`FAIL: Tenant B first completion at tick ${firstTickBCompleted} — too late, noisy neighbor starvation`);
  }

  if (bAllDoneTick !== null && bAllDoneTick <= 5) {
    reasons.push(`PASS: Tenant B fully processed (completed+blocked) by tick ${bAllDoneTick}`);
  } else if (bAllDoneTick !== null) {
    pass = false;
    reasons.push(`FAIL: Tenant B fully processed at tick ${bAllDoneTick} — should be ≤5`);
  } else {
    pass = false;
    reasons.push(`FAIL: Tenant B never fully processed within ${MAX_TICKS} ticks`);
  }

  const bCompleted = finalB["completed"] || 0;
  const bBlocked = finalB["blocked_budget"] || 0;
  if (bCompleted === bExpectedCompletions) {
    reasons.push(`PASS: Tenant B completed exactly ${bCompleted} jobs (budget allows ${bExpectedCompletions})`);
  } else if (bCompleted <= bExpectedCompletions) {
    reasons.push(`INFO: Tenant B completed ${bCompleted}/${bExpectedCompletions} expected (may be budget-limited by concurrent live scheduler)`);
  } else {
    pass = false;
    reasons.push(`FAIL: Tenant B completed ${bCompleted} — exceeds budget expectation of ${bExpectedCompletions}`);
  }

  let bStarvedWhileAProgressed = false;
  for (const h of tickHistory) {
    if (h.aCompleted > 10 && h.bCompleted === 0) {
      bStarvedWhileAProgressed = true;
      break;
    }
  }
  if (bStarvedWhileAProgressed) {
    pass = false;
    reasons.push(`FAIL: Tenant A completed >10 jobs while B had zero — single-tenant-until-empty behavior`);
  } else {
    reasons.push(`PASS: No starvation pattern — B progressed alongside A`);
  }

  const tick1 = tickHistory[0];
  if (tick1) {
    if (tick1.aCompleted > 0 && tick1.bCompleted > 0) {
      reasons.push(`PASS: Both tenants got slots in tick 1 (A=${tick1.aCompleted}, B=${tick1.bCompleted}) — true fair-share`);
    } else {
      pass = false;
      reasons.push(`FAIL: Tick 1 — A=${tick1.aCompleted}, B=${tick1.bCompleted}. Only one tenant served — single-tenant-per-tick, not fair-share`);
    }
  }

  console.log("");
  for (const r of reasons) {
    const icon = r.startsWith("PASS") ? "  [PASS]" : r.startsWith("FAIL") ? "  [FAIL]" : "  [INFO]";
    console.log(`${icon} ${r}`);
  }

  console.log("");
  if (!pass) {
    console.log("  FINAL VERDICT: *** FAIL *** — Noisy neighbor starvation detected\n");
    console.log("  FIX NEEDED: Add per-tenant fair-share allocation");
    console.log("  (round-robin slot distribution across tenants per tick)\n");
    process.exit(1);
  } else {
    console.log("  FINAL VERDICT: PASS — Fair multi-tenant scheduling\n");
    console.log(`  Tenant A (${TENANT_A_JOBS} jobs): completed ${finalA["completed"] || 0}`);
    console.log(`  Tenant B (${TENANT_B_JOBS} jobs): completed ${bCompleted}, blocked ${bBlocked}`);
    console.log(`  Both tenants received fair scheduler slots. No starvation.\n`);
  }
}

run().catch(async (err) => {
  console.error("Test crashed:", err);
  const allIds = [...tenantAJobIds, ...tenantBJobIds];
  if (allIds.length > 0) {
    await db.delete(insightJobs).where(inArray(insightJobs.id, allIds)).catch(() => {});
  }
  process.exit(2);
});
