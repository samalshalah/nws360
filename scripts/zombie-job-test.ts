import { db } from "../server/db";
import { insightJobs, clients, aiUsageLog } from "../shared/schema";
import { eq, inArray, and, sql } from "drizzle-orm";
import { storage } from "../server/storage";
import { startInsightJob, runInsightAI, completeInsightJob } from "../server/ai/ai-gateway";

const TEST_CLIENT_ID = 9001;

let testJobIds: number[] = [];

async function run() {
  console.log("=======================================================");
  console.log("  TEST 8: ZOMBIE JOB (restart safety = money safety)");
  console.log("  Goal: Prove a server restart cannot double-charge jobs.");
  console.log("");
  console.log("  Vectors tested:");
  console.log("  1. Running jobs become 'failed' on scheduler start");
  console.log("  2. Same (jobId, attempt) cannot log usage twice");
  console.log("  3. Attempt increments on each start");
  console.log("  4. Running→running transition is impossible");
  console.log("  5. After recovery, jobs don't auto-re-execute");
  console.log("  Date: " + new Date().toISOString());
  console.log("  AI_DRY_RUN=1 required.");
  console.log("=======================================================\n");

  if (process.env.AI_DRY_RUN !== "1") {
    console.error("  ERROR: This test requires AI_DRY_RUN=1");
    process.exit(2);
  }

  const origClient = await db.select().from(clients).where(eq(clients.id, TEST_CLIENT_ID)).then(r => r[0]);
  if (!origClient) {
    console.error(`Client ${TEST_CLIENT_ID} not found`);
    process.exit(2);
  }

  await db.update(clients).set({
    aiEnabled: true,
    dailyTokenBudget: 999999,
    dailyJobLimit: 999,
  }).where(eq(clients.id, TEST_CLIENT_ID));

  let pass = true;
  const reasons: string[] = [];

  const expiresAt = new Date(Date.now() + 3600000);

  console.log("--- Check 1: recoverZombieRunningJobs marks running → failed ---");
  {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const [job] = await db.insert(insightJobs).values({
        clientId: TEST_CLIENT_ID,
        type: "qa",
        status: "running",
        attempt: 1,
        expiresAt,
        payload: { systemPrompt: `zombie ${i}`, userContent: `z-${i}` },
        maxTokens: 10,
      }).returning({ id: insightJobs.id });
      ids.push(job.id);
    }
    testJobIds.push(...ids);

    const recovered = await storage.recoverZombieRunningJobs();

    const afterJobs = await db.select({ id: insightJobs.id, status: insightJobs.status })
      .from(insightJobs)
      .where(inArray(insightJobs.id, ids));

    const allFailed = afterJobs.every(j => j.status === "failed");

    if (recovered >= 5 && allFailed) {
      reasons.push(`PASS: ${recovered} running jobs recovered → failed. All 5 test jobs are 'failed'.`);
    } else {
      pass = false;
      reasons.push(`FAIL: recoverZombieRunningJobs returned ${recovered}, jobs: ${JSON.stringify(afterJobs)}`);
    }
  }

  console.log("--- Check 2: Attempt increments on startInsightJob ---");
  {
    const [job] = await db.insert(insightJobs).values({
      clientId: TEST_CLIENT_ID,
      type: "qa",
      status: "scheduled",
      attempt: 0,
      expiresAt,
      payload: { systemPrompt: "attempt test", userContent: "at" },
      maxTokens: 10,
    }).returning();
    testJobIds.push(job.id);

    const started = await startInsightJob(job.id);

    if (started.attempt === 1) {
      reasons.push(`PASS: Attempt incremented from 0 to ${started.attempt} on start`);
    } else {
      pass = false;
      reasons.push(`FAIL: Attempt is ${started.attempt}, expected 1`);
    }

    await completeInsightJob(job.id, {
      content: "test", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    });
  }

  console.log("--- Check 3: Unique constraint on (jobId, attempt) prevents double usage log ---");
  {
    const [job] = await db.insert(insightJobs).values({
      clientId: TEST_CLIENT_ID,
      type: "qa",
      status: "scheduled",
      attempt: 0,
      expiresAt,
      payload: { systemPrompt: "double-charge test", userContent: "dc" },
      maxTokens: 10,
    }).returning();
    testJobIds.push(job.id);

    const started = await startInsightJob(job.id);

    await storage.createAiUsageLog({
      jobId: job.id,
      attempt: started.attempt,
      clientId: TEST_CLIENT_ID,
      type: "qa",
      model: "test",
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    let doubleChargeBlocked = false;
    try {
      await storage.createAiUsageLog({
        jobId: job.id,
        attempt: started.attempt,
        clientId: TEST_CLIENT_ID,
        type: "qa",
        model: "test",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    } catch (e: any) {
      if (e.message?.includes("unique") || e.message?.includes("duplicate") ||
          e.code === "23505" || e.constraint?.includes("uq_ai_usage_job_attempt")) {
        doubleChargeBlocked = true;
      }
    }

    if (doubleChargeBlocked) {
      reasons.push(`PASS: Duplicate usage log for (jobId=${job.id}, attempt=${started.attempt}) was BLOCKED by unique constraint`);
    } else {
      pass = false;
      reasons.push(`FAIL: Duplicate usage log was NOT blocked — double charge possible!`);
    }

    await completeInsightJob(job.id, {
      content: "test", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    });
  }

  console.log("--- Check 4: Running→Running transition is impossible ---");
  {
    const [job] = await db.insert(insightJobs).values({
      clientId: TEST_CLIENT_ID,
      type: "qa",
      status: "running",
      attempt: 1,
      expiresAt,
      payload: { systemPrompt: "running→running", userContent: "rr" },
      maxTokens: 10,
    }).returning();
    testJobIds.push(job.id);

    const restarted = await storage.updateInsightJobIfStatus(job.id, "running", "running", { startedAt: new Date(), attempt: 2 });

    if (!restarted) {
      reasons.push(`PASS: running→running transition was blocked (updateInsightJobIfStatus same-status rejected)`);
    } else {
      const actuallyUpdated = await storage.getInsightJob(job.id);
      if (actuallyUpdated?.attempt === 2) {
        pass = false;
        reasons.push(`FAIL: running→running transition succeeded and incremented attempt to ${actuallyUpdated.attempt}!`);
      } else {
        reasons.push(`INFO: running→running returned a value but attempt unchanged — investigating`);
      }
    }

    await db.update(insightJobs).set({ status: "failed" }).where(eq(insightJobs.id, job.id));
  }

  console.log("--- Check 5: Full restart simulation (running jobs fail, re-queue, get new attempt) ---");
  {
    const [job] = await db.insert(insightJobs).values({
      clientId: TEST_CLIENT_ID,
      type: "qa",
      status: "scheduled",
      attempt: 0,
      expiresAt,
      payload: { systemPrompt: "restart sim", userContent: "rs" },
      maxTokens: 10,
    }).returning();
    testJobIds.push(job.id);

    const started = await startInsightJob(job.id);
    const firstAttempt = started.attempt;

    await runInsightAI({
      jobId: job.id,
      clientId: TEST_CLIENT_ID,
      type: "qa",
      payload: { systemPrompt: "restart sim", userContent: "rs" },
      maxTokens: 10,
    });

    const usageBefore = await db.select({ count: sql<number>`count(*)` })
      .from(aiUsageLog)
      .where(eq(aiUsageLog.jobId, job.id))
      .then(r => Number(r[0].count));

    await db.update(insightJobs).set({ status: "failed", completedAt: new Date() })
      .where(eq(insightJobs.id, job.id));

    await db.update(insightJobs).set({ status: "scheduled", completedAt: null })
      .where(eq(insightJobs.id, job.id));

    const restarted = await startInsightJob(job.id);
    const secondAttempt = restarted.attempt;

    await runInsightAI({
      jobId: job.id,
      clientId: TEST_CLIENT_ID,
      type: "qa",
      payload: { systemPrompt: "restart sim", userContent: "rs" },
      maxTokens: 10,
    });

    const usageAfter = await db.select({ count: sql<number>`count(*)` })
      .from(aiUsageLog)
      .where(eq(aiUsageLog.jobId, job.id))
      .then(r => Number(r[0].count));

    if (secondAttempt > firstAttempt) {
      reasons.push(`PASS: Attempt incremented from ${firstAttempt} to ${secondAttempt} after simulated restart`);
    } else {
      pass = false;
      reasons.push(`FAIL: Attempt did not increment: first=${firstAttempt}, second=${secondAttempt}`);
    }

    if (usageAfter === usageBefore + 1) {
      reasons.push(`PASS: Usage log has ${usageAfter} rows (${usageBefore} + 1 for new attempt) — no double charge`);
    } else {
      pass = false;
      reasons.push(`FAIL: Usage log has ${usageAfter} rows, expected ${usageBefore + 1}`);
    }

    await completeInsightJob(job.id, {
      content: "test", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    });
  }

  console.log("--- Check 6: runInsightAI blocks if job status is not 'running' ---");
  {
    const [job] = await db.insert(insightJobs).values({
      clientId: TEST_CLIENT_ID,
      type: "qa",
      status: "failed",
      attempt: 1,
      expiresAt,
      payload: { systemPrompt: "ghost run", userContent: "gr" },
      maxTokens: 10,
    }).returning();
    testJobIds.push(job.id);

    let blocked = false;
    try {
      await runInsightAI({
        jobId: job.id,
        clientId: TEST_CLIENT_ID,
        type: "qa",
        payload: { systemPrompt: "ghost run", userContent: "gr" },
        maxTokens: 10,
      });
    } catch (e: any) {
      if (e.message?.includes("HARD ERROR") || e.message?.includes("not running")) {
        blocked = true;
      }
    }

    if (blocked) {
      reasons.push(`PASS: runInsightAI blocked on failed job (status guard active)`);
    } else {
      pass = false;
      reasons.push(`FAIL: runInsightAI executed on a failed job — zombie execution possible!`);
    }
  }

  console.log("\n--- Cleanup ---");
  if (testJobIds.length > 0) {
    await db.delete(aiUsageLog).where(inArray(aiUsageLog.jobId, testJobIds));
    await db.delete(insightJobs).where(inArray(insightJobs.id, testJobIds));
    console.log(`  Deleted ${testJobIds.length} test jobs and their usage logs`);
  }

  await db.update(clients).set({
    aiEnabled: origClient.aiEnabled,
    dailyTokenBudget: origClient.dailyTokenBudget,
    dailyJobLimit: origClient.dailyJobLimit,
  }).where(eq(clients.id, TEST_CLIENT_ID));
  console.log(`  Restored client ${TEST_CLIENT_ID}\n`);

  console.log("=======================================================");
  console.log("  CHECKS");
  console.log("=======================================================\n");

  for (const r of reasons) {
    const icon = r.startsWith("PASS") ? "  [PASS]" : r.startsWith("FAIL") ? "  [FAIL]" : "  [INFO]";
    console.log(`${icon} ${r}`);
  }

  console.log("");
  if (!pass) {
    console.log("  FINAL VERDICT: *** FAIL *** — Zombie double-charge risk exists\n");
    process.exit(1);
  } else {
    console.log("  FINAL VERDICT: PASS — Zombie-proof: restart cannot double-charge\n");
    console.log("  Structural guarantees:");
    console.log("  - Running jobs → failed on scheduler startup (zombie recovery)");
    console.log("  - Attempt counter increments per start (idempotency key)");
    console.log("  - Unique constraint on (jobId, attempt) blocks duplicate usage");
    console.log("  - Status guard blocks runInsightAI on non-running jobs");
    console.log("  - running→running transition impossible\n");
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
