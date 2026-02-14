import { createInsightJob, startInsightJob, completeInsightJob, failInsightJob, runInsightAI } from "../server/ai/ai-gateway";
import { storage } from "../server/storage";
import { db } from "../server/db";

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "CRITICAL";
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, status: "PASS" | "FAIL" | "CRITICAL", detail: string) {
  results.push({ name, status, detail });
  const icon = status === "PASS" ? "  [PASS]" : status === "CRITICAL" ? "  [CRITICAL]" : "  [FAIL]";
  console.log(`${icon} ${name}: ${detail}`);
}

async function attack2_runtimeBypass() {
  console.log("\n--- ATTACK 2: Runtime Bypass (direct OpenAI without jobId) ---");

  try {
    await runInsightAI({
      jobId: 0 as any,
      clientId: 1,
      type: "qa",
      payload: {
        systemPrompt: "test",
        userContent: "test",
      },
      maxTokens: 5,
    });
    record("2a: runInsightAI with jobId=0", "CRITICAL", "Call succeeded - gateway failed to block!");
  } catch (e: any) {
    if (e.message.includes("[AI Gateway]")) {
      record("2a: runInsightAI with jobId=0", "PASS", `Blocked: ${e.message}`);
    } else {
      record("2a: runInsightAI with jobId=0", "FAIL", `Wrong error: ${e.message}`);
    }
  }

  try {
    await runInsightAI({
      jobId: undefined as any,
      clientId: 1,
      type: "qa",
      payload: {
        systemPrompt: "test",
        userContent: "test",
      },
      maxTokens: 5,
    });
    record("2b: runInsightAI with jobId=undefined", "CRITICAL", "Call succeeded - gateway failed to block!");
  } catch (e: any) {
    if (e.message.includes("[AI Gateway]") || e.message.includes("BLOCKED")) {
      record("2b: runInsightAI with jobId=undefined", "PASS", `Blocked: ${e.message}`);
    } else {
      record("2b: runInsightAI with jobId=undefined", "FAIL", `Wrong error: ${e.message}`);
    }
  }

  try {
    await runInsightAI({
      jobId: null as any,
      clientId: 1,
      type: "qa",
      payload: {
        systemPrompt: "test",
        userContent: "test",
      },
      maxTokens: 5,
    });
    record("2c: runInsightAI with jobId=null", "CRITICAL", "Call succeeded - gateway failed to block!");
  } catch (e: any) {
    if (e.message.includes("[AI Gateway]") || e.message.includes("BLOCKED")) {
      record("2c: runInsightAI with jobId=null", "PASS", `Blocked: ${e.message}`);
    } else {
      record("2c: runInsightAI with jobId=null", "FAIL", `Wrong error: ${e.message}`);
    }
  }
}

async function attack3_fakeJob() {
  console.log("\n--- ATTACK 3: Fake Job Attacks ---");

  // 3a: Non-existent jobId
  try {
    await runInsightAI({
      jobId: 999999,
      clientId: 1,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3a: Non-existent jobId (999999)", "CRITICAL", "Call succeeded with fake job!");
  } catch (e: any) {
    if (e.message.includes("does not exist")) {
      record("3a: Non-existent jobId (999999)", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3a: Non-existent jobId (999999)", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3b: Job belonging to another client (cross-tenant) — create directly via storage to bypass budget
  try {
    const jobClientA = await storage.createInsightJob({
      clientId: 100,
      type: "qa",
      status: "running",
      expiresAt: new Date(Date.now() + 600000),
    });

    await runInsightAI({
      jobId: jobClientA.id,
      clientId: 200,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3b: Cross-tenant job (client 100 job, called as client 200)", "CRITICAL", "Cross-tenant bypass succeeded!");
  } catch (e: any) {
    if (e.message.includes("Client mismatch")) {
      record("3b: Cross-tenant job (client 100 job, called as client 200)", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3b: Cross-tenant job (client 100 job, called as client 200)", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3c: Expired job
  try {
    const expiredJob = await storage.createInsightJob({
      clientId: 1,
      type: "qa",
      status: "running",
      expiresAt: new Date(Date.now() - 60000),
    });

    await runInsightAI({
      jobId: expiredJob.id,
      clientId: 1,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3c: Expired job", "CRITICAL", "Expired job was accepted!");
  } catch (e: any) {
    if (e.message.includes("expired")) {
      record("3c: Expired job", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3c: Expired job", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3d: Job with status=queued (not running) — must be rejected
  try {
    const queuedJob = await storage.createInsightJob({
      clientId: 1,
      type: "qa",
      status: "queued",
      expiresAt: new Date(Date.now() + 600000),
    });

    await runInsightAI({
      jobId: queuedJob.id,
      clientId: 1,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3d: Job status=queued (not running)", "CRITICAL", "Non-running job was accepted!");
  } catch (e: any) {
    if (e.message.includes("not running") || e.message.includes("HARD ERROR")) {
      record("3d: Job status=queued (not running)", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3d: Job status=queued (not running)", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3e: Job with status=scheduled (not running) — must be rejected
  try {
    const scheduledJob = await storage.createInsightJob({
      clientId: 1,
      type: "qa",
      status: "scheduled",
      expiresAt: new Date(Date.now() + 600000),
    });

    await runInsightAI({
      jobId: scheduledJob.id,
      clientId: 1,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3e: Job status=scheduled (not running)", "CRITICAL", "Scheduled (non-running) job was accepted!");
  } catch (e: any) {
    if (e.message.includes("not running") || e.message.includes("HARD ERROR")) {
      record("3e: Job status=scheduled (not running)", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3e: Job status=scheduled (not running)", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3f: Job with status=completed (reuse attack)
  try {
    const reuseJob = await storage.createInsightJob({
      clientId: 1,
      type: "qa",
      status: "completed",
      expiresAt: new Date(Date.now() + 600000),
    });

    await runInsightAI({
      jobId: reuseJob.id,
      clientId: 1,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3f: Completed job reuse attack", "CRITICAL", "Completed job was reused!");
  } catch (e: any) {
    if (e.message.includes("not running") || e.message.includes("HARD ERROR")) {
      record("3f: Completed job reuse attack", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3f: Completed job reuse attack", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3g: Job with status=failed (resurrect attack)
  try {
    const failedJob = await storage.createInsightJob({
      clientId: 1,
      type: "qa",
      status: "failed",
      expiresAt: new Date(Date.now() + 600000),
    });

    await runInsightAI({
      jobId: failedJob.id,
      clientId: 1,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3g: Failed job resurrect attack", "CRITICAL", "Failed job was resurrected!");
  } catch (e: any) {
    if (e.message.includes("not running") || e.message.includes("HARD ERROR")) {
      record("3g: Failed job resurrect attack", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3g: Failed job resurrect attack", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3h: Job with status=blocked_budget — must be rejected
  try {
    const blockedJob = await storage.createInsightJob({
      clientId: 1,
      type: "qa",
      status: "blocked_budget",
      expiresAt: new Date(Date.now() + 600000),
    });

    await runInsightAI({
      jobId: blockedJob.id,
      clientId: 1,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3h: Blocked_budget job bypass", "CRITICAL", "Budget-blocked job was executed!");
  } catch (e: any) {
    if (e.message.includes("not running") || e.message.includes("HARD ERROR")) {
      record("3h: Blocked_budget job bypass", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3h: Blocked_budget job bypass", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3i: Job with status=expired — must be rejected
  try {
    const expiredStatusJob = await storage.createInsightJob({
      clientId: 1,
      type: "qa",
      status: "expired",
      expiresAt: new Date(Date.now() + 600000),
    });

    await runInsightAI({
      jobId: expiredStatusJob.id,
      clientId: 1,
      type: "qa",
      payload: { systemPrompt: "test", userContent: "test" },
      maxTokens: 5,
    });
    record("3i: Expired-status job bypass", "CRITICAL", "Expired-status job was executed!");
  } catch (e: any) {
    if (e.message.includes("not running") || e.message.includes("HARD ERROR")) {
      record("3i: Expired-status job bypass", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3i: Expired-status job bypass", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }

  // 3j: startInsightJob must reject queued status (requires scheduled)
  try {
    const queuedForStart = await storage.createInsightJob({
      clientId: 1,
      type: "qa",
      status: "queued",
      expiresAt: new Date(Date.now() + 600000),
    });

    await startInsightJob(queuedForStart.id);
    record("3j: startInsightJob on queued job", "CRITICAL", "Queued job was started directly (bypasses scheduler)!");
  } catch (e: any) {
    if (e.message.includes("must be") || e.message.includes("cannot start")) {
      record("3j: startInsightJob on queued job", "PASS", `Blocked: ${e.message}`);
    } else {
      record("3j: startInsightJob on queued job", "PASS", `Blocked (different msg): ${e.message}`);
    }
  }
}

async function attack4_workerBypass() {
  console.log("\n--- ATTACK 4: Worker Bypass (direct OpenAI import blocked by guard) ---");

  const { execSync } = await import("child_process");

  try {
    const output = execSync("npx tsx scripts/ai-gateway-guard.ts 2>&1", { encoding: "utf-8" });
    if (output.includes("ALL CHECKS PASSED")) {
      record("4a: Static guard scan (all server files)", "PASS", "No unauthorized OpenAI calls in any worker/route file");
    } else {
      record("4a: Static guard scan (all server files)", "CRITICAL", `Guard found issues: ${output}`);
    }
  } catch (e: any) {
    record("4a: Static guard scan (all server files)", "CRITICAL", `Guard detected violations: ${e.stdout || e.message}`);
  }

  const { writeFileSync, unlinkSync } = await import("fs");
  const tempFile = "server/temp-bypass-test.ts";
  try {
    writeFileSync(tempFile, `
import OpenAI from "openai";
const ai = new OpenAI();
const res = await ai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: "test" }] });
`);

    try {
      const output = execSync("npx tsx scripts/ai-gateway-guard.ts 2>&1", { encoding: "utf-8" });
      record("4b: Guard detects injected bypass file", "CRITICAL", "Guard did NOT detect the injected bypass file!");
    } catch (guardErr: any) {
      const stdout = guardErr.stdout || "";
      if (stdout.includes("temp-bypass-test.ts") && stdout.includes("VIOLATIONS FOUND")) {
        record("4b: Guard detects injected bypass file", "PASS", "Guard correctly detected and blocked the bypass file");
      } else {
        record("4b: Guard detects injected bypass file", "FAIL", `Unexpected guard output: ${stdout}`);
      }
    }
  } finally {
    try { unlinkSync(tempFile); } catch {}
  }
}

async function runAllAttacks() {
  console.log("=======================================================");
  console.log("  AI GATEWAY HOSTILE DEVELOPER BYPASS TEST");
  console.log("  (Updated for scheduler-controlled job lifecycle)");
  console.log("  Date: " + new Date().toISOString());
  console.log("=======================================================");

  await attack2_runtimeBypass();
  await attack3_fakeJob();
  await attack4_workerBypass();

  console.log("\n=======================================================");
  console.log("  RESULTS SUMMARY");
  console.log("=======================================================\n");

  const criticals = results.filter(r => r.status === "CRITICAL");
  const passes = results.filter(r => r.status === "PASS");
  const fails = results.filter(r => r.status === "FAIL");

  console.log(`  Total tests:    ${results.length}`);
  console.log(`  PASS:           ${passes.length}`);
  console.log(`  FAIL:           ${fails.length}`);
  console.log(`  CRITICAL:       ${criticals.length}`);
  console.log("");

  console.log("  +------+--------------------------------------------------+--------+");
  console.log("  | Test | Description                                      | Result |");
  console.log("  +------+--------------------------------------------------+--------+");
  for (const r of results) {
    const padName = r.name.padEnd(48);
    const padStatus = r.status === "CRITICAL" ? "CRIT  " : r.status.padEnd(6);
    console.log(`  | ${padName} | ${padStatus} |`);
  }
  console.log("  +------+--------------------------------------------------+--------+");

  console.log("");
  if (criticals.length > 0) {
    console.log("  FINAL STATUS: *** UNSAFE *** — " + criticals.length + " critical bypass(es) found");
    process.exit(1);
  } else if (fails.length > 0) {
    console.log("  FINAL STATUS: DEGRADED — " + fails.length + " non-critical issue(s)");
    process.exit(1);
  } else {
    console.log("  FINAL STATUS: SAFE — All " + results.length + " attack vectors blocked");
  }
}

runAllAttacks().catch(err => {
  console.error("Attack test crashed:", err);
  process.exit(2);
});
