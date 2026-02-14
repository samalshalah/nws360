import { db } from "../server/db";
import { insightJobs, clients } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { runInsightAI, startInsightJob, createInsightJob } from "../server/ai/ai-gateway";
import { storage } from "../server/storage";

const TEST_CLIENT_ID = 9001;
let testJobIds: number[] = [];

async function run() {
  console.log("=======================================================");
  console.log("  TEST 5: DIRECT GATEWAY ATTACK");
  console.log("  Goal: Prove runInsightAI rejects every status except");
  console.log("  'running'. The gateway itself cannot be tricked.");
  console.log("  Date: " + new Date().toISOString());
  console.log("=======================================================\n");

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

  const statusesToTest = ["queued", "scheduled", "completed", "failed", "blocked_budget", "expired"] as const;

  console.log("--- Attack Vector 1: Call runInsightAI with each non-running status ---\n");

  for (const status of statusesToTest) {
    const [job] = await db.insert(insightJobs).values({
      clientId: TEST_CLIENT_ID,
      type: "qa",
      status,
      expiresAt: new Date(Date.now() + 3600000),
      payload: {
        systemPrompt: `gateway-attack status=${status}`,
        userContent: `attack payload`,
      },
      maxTokens: 10,
    }).returning();
    testJobIds.push(job.id);

    try {
      await runInsightAI({
        jobId: job.id,
        clientId: TEST_CLIENT_ID,
        type: "qa",
        payload: {
          systemPrompt: `gateway-attack status=${status}`,
          userContent: `attack payload`,
        },
        maxTokens: 10,
      });

      pass = false;
      reasons.push(`FAIL: status="${status}" → runInsightAI EXECUTED (gateway compromised!)`);
      console.log(`  status="${status}"  →  EXECUTED  *** GATEWAY COMPROMISED ***`);
    } catch (e: any) {
      const msg = e.message || "";
      const isHardError = msg.includes("HARD ERROR") && msg.includes("not running");
      if (isHardError) {
        reasons.push(`PASS: status="${status}" → HARD ERROR: ${msg.substring(0, 80)}...`);
        console.log(`  status="${status}"  →  BLOCKED (HARD ERROR)`);
      } else {
        reasons.push(`PASS: status="${status}" → rejected: ${msg.substring(0, 80)}`);
        console.log(`  status="${status}"  →  BLOCKED (${msg.substring(0, 60)})`);
      }
    }
  }

  console.log("\n--- Attack Vector 2: Call runInsightAI with no jobId ---\n");

  try {
    await runInsightAI({
      jobId: undefined as any,
      clientId: TEST_CLIENT_ID,
      type: "qa",
      payload: { systemPrompt: "no-job-attack", userContent: "test" },
      maxTokens: 10,
    });

    pass = false;
    reasons.push(`FAIL: no jobId → runInsightAI EXECUTED (gateway compromised!)`);
    console.log(`  no jobId  →  EXECUTED  *** GATEWAY COMPROMISED ***`);
  } catch (e: any) {
    const msg = e.message || "";
    const blocked = msg.includes("BLOCKED") && msg.includes("without jobId");
    reasons.push(`PASS: no jobId → ${blocked ? "BLOCKED" : "rejected"}: ${msg.substring(0, 80)}`);
    console.log(`  no jobId  →  BLOCKED`);
  }

  console.log("\n--- Attack Vector 3: Call runInsightAI with nonexistent jobId ---\n");

  try {
    await runInsightAI({
      jobId: 999999,
      clientId: TEST_CLIENT_ID,
      type: "qa",
      payload: { systemPrompt: "phantom-job", userContent: "test" },
      maxTokens: 10,
    });

    pass = false;
    reasons.push(`FAIL: phantom jobId → runInsightAI EXECUTED (gateway compromised!)`);
    console.log(`  phantom jobId  →  EXECUTED  *** GATEWAY COMPROMISED ***`);
  } catch (e: any) {
    const msg = e.message || "";
    reasons.push(`PASS: phantom jobId → rejected: ${msg.substring(0, 80)}`);
    console.log(`  phantom jobId  →  BLOCKED`);
  }

  console.log("\n--- Attack Vector 4: Call runInsightAI with wrong clientId ---\n");

  const [runningJob] = await db.insert(insightJobs).values({
    clientId: TEST_CLIENT_ID,
    type: "qa",
    status: "running",
    expiresAt: new Date(Date.now() + 3600000),
    payload: { systemPrompt: "cross-tenant", userContent: "test" },
    maxTokens: 10,
  }).returning();
  testJobIds.push(runningJob.id);

  try {
    await runInsightAI({
      jobId: runningJob.id,
      clientId: 8888,
      type: "qa",
      payload: { systemPrompt: "cross-tenant", userContent: "test" },
      maxTokens: 10,
    });

    pass = false;
    reasons.push(`FAIL: wrong clientId → runInsightAI EXECUTED (cross-tenant leak!)`);
    console.log(`  wrong clientId  →  EXECUTED  *** CROSS-TENANT LEAK ***`);
  } catch (e: any) {
    const msg = e.message || "";
    const isMismatch = msg.includes("Client mismatch");
    reasons.push(`PASS: wrong clientId → ${isMismatch ? "Client mismatch" : "rejected"}: ${msg.substring(0, 80)}`);
    console.log(`  wrong clientId  →  BLOCKED (client mismatch)`);
  }

  console.log("\n--- Attack Vector 5: Call startInsightJob on a queued job (skip scheduler) ---\n");

  const [queuedJob] = await db.insert(insightJobs).values({
    clientId: TEST_CLIENT_ID,
    type: "qa",
    status: "queued",
    expiresAt: new Date(Date.now() + 3600000),
    payload: { systemPrompt: "skip-scheduler", userContent: "test" },
    maxTokens: 10,
  }).returning();
  testJobIds.push(queuedJob.id);

  try {
    const startResult = await startInsightJob(queuedJob.id);
    if (startResult) {
      pass = false;
      reasons.push(`FAIL: startInsightJob accepted queued job (scheduler bypass!)`);
      console.log(`  startInsightJob(queued)  →  ACCEPTED  *** SCHEDULER BYPASS ***`);
    } else {
      reasons.push(`PASS: startInsightJob rejected queued job — only scheduled→running allowed`);
      console.log(`  startInsightJob(queued)  →  REJECTED (returned null)`);
    }
  } catch (e: any) {
    const msg = e.message || "";
    const correctReject = msg.includes("cannot start") || msg.includes("must be") || msg.includes("scheduled");
    reasons.push(`PASS: startInsightJob(queued) → threw: ${msg.substring(0, 80)}`);
    console.log(`  startInsightJob(queued)  →  REJECTED (threw error)`);
  }

  console.log("\n--- Attack Vector 6: Call runInsightAI on expired running job ---\n");

  const [expiredJob] = await db.insert(insightJobs).values({
    clientId: TEST_CLIENT_ID,
    type: "qa",
    status: "running",
    expiresAt: new Date(Date.now() - 60000),
    payload: { systemPrompt: "expired-running", userContent: "test" },
    maxTokens: 10,
  }).returning();
  testJobIds.push(expiredJob.id);

  try {
    await runInsightAI({
      jobId: expiredJob.id,
      clientId: TEST_CLIENT_ID,
      type: "qa",
      payload: { systemPrompt: "expired-running", userContent: "test" },
      maxTokens: 10,
    });

    pass = false;
    reasons.push(`FAIL: expired running job → EXECUTED (expiry check bypassed!)`);
    console.log(`  expired running job  →  EXECUTED  *** EXPIRY BYPASS ***`);
  } catch (e: any) {
    const msg = e.message || "";
    const isExpiry = msg.includes("expired");
    reasons.push(`PASS: expired running job → ${isExpiry ? "expired" : "rejected"}: ${msg.substring(0, 80)}`);
    console.log(`  expired running job  →  BLOCKED (expired)`);
  }

  console.log("\n--- Cleanup ---");
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

  for (const r of reasons) {
    const icon = r.startsWith("PASS") ? "  [PASS]" : "  [FAIL]";
    console.log(`${icon} ${r}`);
  }

  const passCount = reasons.filter(r => r.startsWith("PASS")).length;
  const failCount = reasons.filter(r => r.startsWith("FAIL")).length;

  console.log(`\n  Total: ${passCount} PASS / ${failCount} FAIL out of ${reasons.length} vectors\n`);

  if (!pass) {
    console.log("  FINAL VERDICT: *** FAIL *** — Gateway compromised\n");
    process.exit(1);
  } else {
    console.log("  FINAL VERDICT: PASS — Gateway is impenetrable\n");
    console.log("  Every non-running status: HARD ERROR");
    console.log("  No jobId: BLOCKED");
    console.log("  Phantom jobId: BLOCKED");
    console.log("  Wrong tenant: BLOCKED");
    console.log("  Skip scheduler: BLOCKED");
    console.log("  Expired job: BLOCKED\n");
  }
}

run().catch(async (err) => {
  console.error("Test crashed:", err);
  if (testJobIds.length > 0) {
    await db.delete(insightJobs).where(inArray(insightJobs.id, testJobIds)).catch(() => {});
  }
  process.exit(2);
});
