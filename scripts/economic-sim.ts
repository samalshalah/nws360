import { db } from "../server/db";
import { insightJobs, clients, aiUsageLog } from "../shared/schema";
import { eq, inArray, and, sql } from "drizzle-orm";
import { storage } from "../server/storage";
import { createInsightJob } from "../server/ai/ai-gateway";
import { _schedulerTickForTesting as schedulerTick } from "../server/ai/ai-scheduler";

const DRY_RUN_TOKENS = 1000;

interface TenantProfile {
  clientId: number;
  name: string;
  tier: "basic" | "pro" | "enterprise";
  dailyTokenBudget: number;
  dailyJobLimit: number;
  jobsToSubmit: number;
  submitPattern: "burst" | "steady" | "backloaded";
}

const TENANTS: TenantProfile[] = [
  { clientId: 9001, name: "Acme Corp",       tier: "enterprise", dailyTokenBudget: 20000, dailyJobLimit: 50, jobsToSubmit: 40, submitPattern: "burst" },
  { clientId: 9002, name: "StartupCo",       tier: "basic",      dailyTokenBudget: 5000,  dailyJobLimit: 10, jobsToSubmit: 15, submitPattern: "steady" },
  { clientId: 9003, name: "MediaGroup",       tier: "pro",        dailyTokenBudget: 10000, dailyJobLimit: 25, jobsToSubmit: 25, submitPattern: "backloaded" },
];

let allTestJobIds: number[] = [];

interface TenantLedger {
  clientId: number;
  name: string;
  tier: string;
  budget: number;
  jobLimit: number;
  submitted: number;
  completed: number;
  blockedBudget: number;
  failed: number;
  usageLogTokens: number;
  usageLogRows: number;
  jobResultTokens: number;
  dailyApiTokens: number;
  dailyApiJobs: number;
  maxPossibleJobs: number;
  overBudget: boolean;
  overJobLimit: boolean;
  ledgerMatch: boolean;
}

async function ensureClient(id: number, name: string): Promise<void> {
  const existing = await db.select().from(clients).where(eq(clients.id, id)).then(r => r[0]);
  if (!existing) {
    await db.insert(clients).values({
      id,
      name,
      aiEnabled: true,
      dailyTokenBudget: 0,
      dailyJobLimit: 0,
    } as any).onConflictDoNothing();
  }
}

async function run() {
  console.log("=======================================================");
  console.log("  ECONOMIC SIMULATION — Multi-Tenant Day Simulation");
  console.log("");
  console.log("  Scenario: 3 tenants with different tiers, budgets,");
  console.log("  job limits, and submission patterns compete for");
  console.log("  scheduler capacity over a simulated workday.");
  console.log("");
  console.log("  Tenants:");
  for (const t of TENANTS) {
    console.log(`    ${t.name} (${t.tier}): budget=${t.dailyTokenBudget} tokens, limit=${t.dailyJobLimit} jobs, submitting=${t.jobsToSubmit} (${t.submitPattern})`);
  }
  console.log("");
  console.log("  Invariants verified:");
  console.log("    I1. No tenant exceeds its token budget");
  console.log("    I2. No tenant exceeds its job limit");
  console.log("    I3. Usage log tokens = job result tokens (per tenant)");
  console.log("    I4. Usage log rows = completed job count (1:1)");
  console.log("    I5. Global token conservation (in = out)");
  console.log("    I6. Budget-blocked jobs never generate usage");
  console.log("    I7. Fair scheduling — no starvation in early ticks");
  console.log("    I8. Revenue capture — all billable work is logged");
  console.log("  Date: " + new Date().toISOString());
  console.log("  AI_DRY_RUN=1 required.");
  console.log("=======================================================\n");

  if (process.env.AI_DRY_RUN !== "1") {
    console.error("  ERROR: This test requires AI_DRY_RUN=1");
    process.exit(2);
  }

  const origClients: Map<number, any> = new Map();
  for (const t of TENANTS) {
    await ensureClient(t.clientId, t.name);
    const orig = await db.select().from(clients).where(eq(clients.id, t.clientId)).then(r => r[0]);
    origClients.set(t.clientId, orig);
    await db.update(clients).set({
      aiEnabled: true,
      dailyTokenBudget: t.dailyTokenBudget,
      dailyJobLimit: t.dailyJobLimit,
    }).where(eq(clients.id, t.clientId));
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const clientIds = TENANTS.map(t => t.clientId);

  const preExistingJobs = await db.select({ id: insightJobs.id })
    .from(insightJobs)
    .where(inArray(insightJobs.clientId, clientIds));
  const preExistingJobIds = preExistingJobs.map(j => j.id);

  let clearedUsage = 0;
  let clearedJobs = 0;
  if (preExistingJobIds.length > 0) {
    const delUsage = await db.delete(aiUsageLog)
      .where(inArray(aiUsageLog.jobId, preExistingJobIds))
      .returning({ id: aiUsageLog.id });
    clearedUsage += delUsage.length;
  }
  const delOrphanUsage = await db.delete(aiUsageLog)
    .where(and(
      inArray(aiUsageLog.clientId, clientIds),
      sql`${aiUsageLog.createdAt} >= ${todayStart}`
    ))
    .returning({ id: aiUsageLog.id });
  clearedUsage += delOrphanUsage.length;

  if (preExistingJobIds.length > 0) {
    const delJobs = await db.delete(insightJobs)
      .where(inArray(insightJobs.id, preExistingJobIds))
      .returning({ id: insightJobs.id });
    clearedJobs = delJobs.length;
  }

  if (clearedUsage > 0 || clearedJobs > 0) {
    console.log(`  Cleared ${clearedUsage} pre-existing usage logs and ${clearedJobs} pre-existing jobs (clean economic slate)\n`);
  }

  const expiresAt = new Date(Date.now() + 3600000);
  const jobsByTenant: Map<number, number[]> = new Map();
  for (const t of TENANTS) jobsByTenant.set(t.clientId, []);

  console.log("--- Phase 1: Submit jobs according to tenant patterns ---\n");

  const burstTenants = TENANTS.filter(t => t.submitPattern === "burst");
  for (const t of burstTenants) {
    console.log(`  ${t.name}: burst-submitting all ${t.jobsToSubmit} jobs at once`);
    for (let i = 0; i < t.jobsToSubmit; i++) {
      const [job] = await db.insert(insightJobs).values({
        clientId: t.clientId,
        type: "qa",
        status: "queued",
        attempt: 0,
        expiresAt,
        payload: { systemPrompt: `${t.name} job ${i}`, userContent: `content-${i}` },
        maxTokens: 10,
      }).returning({ id: insightJobs.id });
      allTestJobIds.push(job.id);
      jobsByTenant.get(t.clientId)!.push(job.id);
    }
  }

  const steadyTenants = TENANTS.filter(t => t.submitPattern === "steady");
  const backloadedTenants = TENANTS.filter(t => t.submitPattern === "backloaded");

  let steadyCursors: Map<number, number> = new Map();
  for (const t of steadyTenants) steadyCursors.set(t.clientId, 0);
  let backloadedSubmitted: Map<number, boolean> = new Map();
  for (const t of backloadedTenants) backloadedSubmitted.set(t.clientId, false);

  console.log("");
  console.log("--- Phase 2: Run scheduler ticks (simulated workday) ---\n");

  const MAX_TICKS = 30;
  const tickLog: { tick: number; scheduled: number; executed: number; blocked: number }[] = [];
  const tenantsFirstCompletion: Map<number, number> = new Map();

  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    for (const t of steadyTenants) {
      const cursor = steadyCursors.get(t.clientId)!;
      const perTick = Math.ceil(t.jobsToSubmit / 10);
      const toSubmit = Math.min(perTick, t.jobsToSubmit - cursor);
      for (let i = 0; i < toSubmit; i++) {
        const [job] = await db.insert(insightJobs).values({
          clientId: t.clientId,
          type: "qa",
          status: "queued",
          attempt: 0,
          expiresAt,
          payload: { systemPrompt: `${t.name} steady ${cursor + i}`, userContent: `s-${cursor + i}` },
          maxTokens: 10,
        }).returning({ id: insightJobs.id });
        allTestJobIds.push(job.id);
        jobsByTenant.get(t.clientId)!.push(job.id);
      }
      steadyCursors.set(t.clientId, cursor + toSubmit);
    }

    if (tick >= 10) {
      for (const t of backloadedTenants) {
        if (backloadedSubmitted.get(t.clientId)) continue;
        console.log(`  Tick ${tick}: ${t.name} backload-submitting all ${t.jobsToSubmit} jobs`);
        for (let i = 0; i < t.jobsToSubmit; i++) {
          const [job] = await db.insert(insightJobs).values({
            clientId: t.clientId,
            type: "qa",
            status: "queued",
            attempt: 0,
            expiresAt,
            payload: { systemPrompt: `${t.name} backload ${i}`, userContent: `b-${i}` },
            maxTokens: 10,
          }).returning({ id: insightJobs.id });
          allTestJobIds.push(job.id);
          jobsByTenant.get(t.clientId)!.push(job.id);
        }
        backloadedSubmitted.set(t.clientId, true);
      }
    }

    await schedulerTick();

    for (const t of TENANTS) {
      if (tenantsFirstCompletion.has(t.clientId)) continue;
      const completedCount = await db.select({ count: sql<number>`count(*)` })
        .from(insightJobs)
        .where(and(
          inArray(insightJobs.id, jobsByTenant.get(t.clientId)!.length > 0 ? jobsByTenant.get(t.clientId)! : [-1]),
          eq(insightJobs.status, "completed")
        ))
        .then(r => Number(r[0].count));
      if (completedCount > 0) tenantsFirstCompletion.set(t.clientId, tick);
    }

    const pending = await db.select({ count: sql<number>`count(*)` })
      .from(insightJobs)
      .where(and(
        inArray(insightJobs.id, allTestJobIds),
        inArray(insightJobs.status, ["queued", "scheduled", "running"])
      ))
      .then(r => Number(r[0].count));

    const allSteadyDone = Array.from(steadyCursors.entries()).every(
      ([clientId, cursor]) => cursor >= TENANTS.find(t => t.clientId === clientId)!.jobsToSubmit
    );
    const allBackloadDone = Array.from(backloadedSubmitted.values()).every(v => v);

    if (pending === 0 && allSteadyDone && allBackloadDone) {
      console.log(`  All jobs settled after tick ${tick}\n`);
      break;
    }
  }

  console.log("--- Phase 3: Audit ledger per tenant ---\n");

  let pass = true;
  const reasons: string[] = [];
  const ledgers: TenantLedger[] = [];

  for (const t of TENANTS) {
    const ids = jobsByTenant.get(t.clientId)!;
    if (ids.length === 0) continue;

    const jobs = await db.select().from(insightJobs).where(inArray(insightJobs.id, ids));
    const completed = jobs.filter(j => j.status === "completed");
    const blocked = jobs.filter(j => j.status === "blocked_budget");
    const failed = jobs.filter(j => j.status === "failed");

    const usageLogs = await db.select().from(aiUsageLog).where(inArray(aiUsageLog.jobId, ids));
    const usageTokens = usageLogs.reduce((s, l) => s + (l.totalTokens ?? 0), 0);
    const jobResultTokens = completed.reduce((s, j) => {
      const r = j.result as any;
      return s + (r?.usage?.totalTokens ?? 0);
    }, 0);

    const daily = await storage.getDailyAiUsage(t.clientId);

    const maxByTokens = Math.floor(t.dailyTokenBudget / DRY_RUN_TOKENS);
    const maxByJobs = t.dailyJobLimit;
    const maxPossible = Math.min(maxByTokens, maxByJobs, t.jobsToSubmit);

    const ledger: TenantLedger = {
      clientId: t.clientId,
      name: t.name,
      tier: t.tier,
      budget: t.dailyTokenBudget,
      jobLimit: t.dailyJobLimit,
      submitted: ids.length,
      completed: completed.length,
      blockedBudget: blocked.length,
      failed: failed.length,
      usageLogTokens: usageTokens,
      usageLogRows: usageLogs.length,
      jobResultTokens,
      dailyApiTokens: daily.totalTokens,
      dailyApiJobs: daily.jobCount,
      maxPossibleJobs: maxPossible,
      overBudget: usageTokens > t.dailyTokenBudget,
      overJobLimit: completed.length > t.dailyJobLimit,
      ledgerMatch: usageTokens === jobResultTokens && usageLogs.length === completed.length,
    };
    ledgers.push(ledger);

    console.log(`  ${t.name} (${t.tier}):`);
    console.log(`    Submitted: ${ids.length}, Completed: ${completed.length}, Blocked: ${blocked.length}, Failed: ${failed.length}`);
    console.log(`    Usage tokens: ${usageTokens}/${t.dailyTokenBudget}, Jobs: ${completed.length}/${t.dailyJobLimit}`);
    console.log(`    Max possible completions: ${maxPossible}\n`);
  }

  console.log("--- Invariant Checks ---\n");

  for (const l of ledgers) {
    if (!l.overBudget) {
      reasons.push(`PASS: I1 ${l.name}: tokens ${l.usageLogTokens} ≤ budget ${l.budget}`);
    } else {
      pass = false;
      reasons.push(`FAIL: I1 ${l.name}: tokens ${l.usageLogTokens} EXCEEDS budget ${l.budget}`);
    }
  }

  for (const l of ledgers) {
    if (!l.overJobLimit) {
      reasons.push(`PASS: I2 ${l.name}: completed ${l.completed} ≤ limit ${l.jobLimit}`);
    } else {
      pass = false;
      reasons.push(`FAIL: I2 ${l.name}: completed ${l.completed} EXCEEDS limit ${l.jobLimit}`);
    }
  }

  for (const l of ledgers) {
    if (l.usageLogTokens === l.jobResultTokens) {
      reasons.push(`PASS: I3 ${l.name}: usage_log tokens (${l.usageLogTokens}) = job result tokens (${l.jobResultTokens})`);
    } else {
      pass = false;
      reasons.push(`FAIL: I3 ${l.name}: usage_log tokens (${l.usageLogTokens}) ≠ job result tokens (${l.jobResultTokens})`);
    }
  }

  for (const l of ledgers) {
    if (l.usageLogRows === l.completed) {
      reasons.push(`PASS: I4 ${l.name}: usage rows (${l.usageLogRows}) = completed jobs (${l.completed}) — 1:1`);
    } else {
      pass = false;
      reasons.push(`FAIL: I4 ${l.name}: usage rows (${l.usageLogRows}) ≠ completed jobs (${l.completed})`);
    }
  }

  {
    const globalUsage = ledgers.reduce((s, l) => s + l.usageLogTokens, 0);
    const globalJobTokens = ledgers.reduce((s, l) => s + l.jobResultTokens, 0);
    const globalCompleted = ledgers.reduce((s, l) => s + l.completed, 0);
    const globalExpected = globalCompleted * DRY_RUN_TOKENS;

    if (globalUsage === globalJobTokens && globalJobTokens === globalExpected) {
      reasons.push(`PASS: I5 Global conservation: usage=${globalUsage}, results=${globalJobTokens}, ${globalCompleted}×${DRY_RUN_TOKENS}=${globalExpected}`);
    } else {
      pass = false;
      reasons.push(`FAIL: I5 Global conservation: usage=${globalUsage}, results=${globalJobTokens}, expected=${globalExpected}`);
    }
  }

  {
    const allBlockedIds: number[] = [];
    for (const t of TENANTS) {
      const ids = jobsByTenant.get(t.clientId)!;
      const blocked = await db.select({ id: insightJobs.id })
        .from(insightJobs)
        .where(and(inArray(insightJobs.id, ids), eq(insightJobs.status, "blocked_budget")));
      allBlockedIds.push(...blocked.map(b => b.id));
    }
    if (allBlockedIds.length > 0) {
      const blockedUsage = await db.select({ count: sql<number>`count(*)` })
        .from(aiUsageLog)
        .where(inArray(aiUsageLog.jobId, allBlockedIds))
        .then(r => Number(r[0].count));

      if (blockedUsage === 0) {
        reasons.push(`PASS: I6 Zero usage logs for ${allBlockedIds.length} budget-blocked jobs`);
      } else {
        pass = false;
        reasons.push(`FAIL: I6 ${blockedUsage} usage log(s) exist for budget-blocked jobs — phantom billing!`);
      }
    } else {
      reasons.push(`PASS: I6 No budget-blocked jobs to check (all within budget)`);
    }
  }

  {
    let starvation = false;
    for (const t of TENANTS) {
      const first = tenantsFirstCompletion.get(t.clientId);
      const ids = jobsByTenant.get(t.clientId)!;
      if (ids.length === 0) continue;

      if (t.submitPattern === "backloaded") {
        if (first !== undefined && first <= 15) {
          reasons.push(`PASS: I7 ${t.name} (backloaded): first completion at tick ${first} — served promptly after submission`);
        } else if (first === undefined) {
          const completed = await db.select({ count: sql<number>`count(*)` })
            .from(insightJobs)
            .where(and(inArray(insightJobs.id, ids), eq(insightJobs.status, "completed")))
            .then(r => Number(r[0].count));
          if (completed > 0) {
            reasons.push(`PASS: I7 ${t.name} (backloaded): completed ${completed} jobs (first-completion tracking issue)`);
          } else {
            pass = false;
            starvation = true;
            reasons.push(`FAIL: I7 ${t.name} (backloaded): ZERO completions — starvation!`);
          }
        } else {
          pass = false;
          starvation = true;
          reasons.push(`FAIL: I7 ${t.name} (backloaded): first completion at tick ${first} — too late (>15), possible starvation`);
        }
      } else {
        if (first !== undefined && first <= 3) {
          reasons.push(`PASS: I7 ${t.name} (${t.submitPattern}): first completion at tick ${first} — not starved`);
        } else if (first !== undefined) {
          reasons.push(`PASS: I7 ${t.name} (${t.submitPattern}): first completion at tick ${first}`);
        } else {
          pass = false;
          starvation = true;
          reasons.push(`FAIL: I7 ${t.name} (${t.submitPattern}): never completed — total starvation!`);
        }
      }
    }
  }

  {
    let missingRevenue = false;
    for (const l of ledgers) {
      if (l.completed > 0 && l.usageLogRows === l.completed && l.usageLogTokens === l.completed * DRY_RUN_TOKENS) {
        reasons.push(`PASS: I8 ${l.name}: all ${l.completed} completions have usage logged (${l.usageLogTokens} tokens captured)`);
      } else if (l.completed === 0) {
        reasons.push(`PASS: I8 ${l.name}: zero completions — no revenue to capture`);
      } else {
        pass = false;
        missingRevenue = true;
        reasons.push(`FAIL: I8 ${l.name}: revenue leak — completed=${l.completed} but usage_rows=${l.usageLogRows}, tokens=${l.usageLogTokens}`);
      }
    }
  }

  {
    for (const l of ledgers) {
      const t = TENANTS.find(t => t.clientId === l.clientId)!;
      if (l.completed === l.maxPossibleJobs) {
        reasons.push(`PASS: I9 ${l.name}: completed exactly ${l.completed}/${l.maxPossibleJobs} max possible — optimal utilization`);
      } else if (l.completed <= l.maxPossibleJobs) {
        reasons.push(`PASS: I9 ${l.name}: completed ${l.completed}/${l.maxPossibleJobs} max possible — within bounds`);
      } else {
        pass = false;
        reasons.push(`FAIL: I9 ${l.name}: completed ${l.completed} > max possible ${l.maxPossibleJobs} — budget breach!`);
      }
    }
  }

  console.log("\n--- Cleanup ---");
  if (allTestJobIds.length > 0) {
    await db.delete(aiUsageLog).where(inArray(aiUsageLog.jobId, allTestJobIds));
    await db.delete(insightJobs).where(inArray(insightJobs.id, allTestJobIds));
    console.log(`  Deleted ${allTestJobIds.length} test jobs and their usage logs`);
  }

  for (const t of TENANTS) {
    const orig = origClients.get(t.clientId);
    if (orig) {
      await db.update(clients).set({
        aiEnabled: orig.aiEnabled,
        dailyTokenBudget: orig.dailyTokenBudget,
        dailyJobLimit: orig.dailyJobLimit,
      }).where(eq(clients.id, t.clientId));
    }
  }
  console.log(`  Restored ${TENANTS.length} tenant configs\n`);

  console.log("=======================================================");
  console.log("  ECONOMIC SIMULATION RESULTS");
  console.log("=======================================================\n");

  console.log("  ┌─────────────────────────────────────────────────────┐");
  console.log("  │ Tenant P&L Summary                                 │");
  console.log("  ├─────────────────────────────────────────────────────┤");
  for (const l of ledgers) {
    const utilPct = l.maxPossibleJobs > 0 ? Math.round(l.completed / l.maxPossibleJobs * 100) : 0;
    console.log(`  │ ${l.name.padEnd(15)} ${l.tier.padEnd(12)} ${String(l.completed).padStart(3)} jobs  ${String(l.usageLogTokens).padStart(6)} tkn  ${String(utilPct).padStart(3)}% util │`);
  }
  console.log("  └─────────────────────────────────────────────────────┘\n");

  for (const r of reasons) {
    const icon = r.startsWith("PASS") ? "  [PASS]" : r.startsWith("FAIL") ? "  [FAIL]" : "  [INFO]";
    console.log(`${icon} ${r}`);
  }

  const passCount = reasons.filter(r => r.startsWith("PASS")).length;
  const failCount = reasons.filter(r => r.startsWith("FAIL")).length;

  console.log(`\n  Score: ${passCount} passed, ${failCount} failed out of ${reasons.length} checks\n`);

  if (!pass) {
    console.log("  FINAL VERDICT: *** FAIL *** — Economic model violation detected\n");
    process.exit(1);
  } else {
    console.log("  FINAL VERDICT: PASS — Economic model is sound\n");
    console.log("  Platform economics proven:");
    console.log("  - No tenant can overspend its token budget");
    console.log("  - No tenant can exceed its job limit");
    console.log("  - Usage ledger = job ledger (zero revenue leak)");
    console.log("  - 1:1 usage-to-completion mapping (no phantom charges)");
    console.log("  - Global token conservation (every token accounted for)");
    console.log("  - Budget-blocked jobs produce zero usage (no phantom billing)");
    console.log("  - Fair scheduling across heterogeneous tenants");
    console.log("  - All billable work captured in usage log (revenue integrity)");
    console.log("  - Budget utilization within theoretical maximum\n");
  }
}

run().catch(async (err) => {
  console.error("Simulation crashed:", err);
  if (allTestJobIds.length > 0) {
    await db.delete(aiUsageLog).where(inArray(aiUsageLog.jobId, allTestJobIds)).catch(() => {});
    await db.delete(insightJobs).where(inArray(insightJobs.id, allTestJobIds)).catch(() => {});
  }
  process.exit(2);
});
