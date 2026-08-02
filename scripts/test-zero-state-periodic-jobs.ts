import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluatePeriodicJobEligibility,
  runPeriodicJobWithEligibility,
  type PeriodicJobEligibilitySnapshot,
} from "../server/periodic-job-rules";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const zeroSnapshot: PeriodicJobEligibilitySnapshot = {
  activeClientCount: 0,
  activeWorkspaceCount: 0,
  activeArticleCount: 0,
  activeSourceCount: 0,
  dueBriefingCount: 0,
  retentionCandidateCount: 0,
};

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

async function testZeroClientsPreventTenantScheduling() {
  assert.strictEqual(evaluatePeriodicJobEligibility("COMPUTE_ANALYTICS", zeroSnapshot).eligible, false);
  assert.strictEqual(evaluatePeriodicJobEligibility("DELIVER_BRIEFINGS", zeroSnapshot).eligible, false);
  assert.strictEqual(evaluatePeriodicJobEligibility("INTELLIGENCE_PIPELINE", zeroSnapshot).eligible, false);
}

function testZeroWorkspacesPreventIntelligenceScheduling() {
  const result = evaluatePeriodicJobEligibility("INTELLIGENCE_PIPELINE", {
    ...zeroSnapshot,
    activeClientCount: 1,
    activeArticleCount: 5,
  });
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.reason, "no_eligible_monitoring_scope");
}

function testZeroArticlesPreventAnalyticsWork() {
  const result = evaluatePeriodicJobEligibility("COMPUTE_ANALYTICS", {
    ...zeroSnapshot,
    activeClientCount: 1,
    activeWorkspaceCount: 1,
  });
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.reason, "no_eligible_clients_or_articles");
}

function testNoDueBriefingsPreventDeliveryWork() {
  const result = evaluatePeriodicJobEligibility("DELIVER_BRIEFINGS", {
    ...zeroSnapshot,
    activeClientCount: 1,
    activeWorkspaceCount: 1,
  });
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.reason, "no_due_briefings");
}

function testDataRetentionHandlesZeroRecordsSafely() {
  const result = evaluatePeriodicJobEligibility("DATA_RETENTION", zeroSnapshot);
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.reason, "no_data_to_retain");
}

async function testDirectIntelligenceInvocationReturnsSkipped() {
  let called = false;
  const eligibility = evaluatePeriodicJobEligibility("INTELLIGENCE_PIPELINE", zeroSnapshot);
  const result = await runPeriodicJobWithEligibility(eligibility, async () => {
    called = true;
    return { status: "completed" };
  });
  assert.strictEqual(called, false);
  assert.deepStrictEqual(result, {
    status: "skipped",
    reason: "no_eligible_monitoring_scope",
    processed: 0,
  });
}

async function testSkippedConditionDoesNotCallErrorPath() {
  let errorLoggerCalled = false;
  const eligibility = evaluatePeriodicJobEligibility("DATA_RETENTION", zeroSnapshot);
  const result = await runPeriodicJobWithEligibility(eligibility, async () => {
    errorLoggerCalled = true;
    throw new Error("should not run");
  });
  assert.strictEqual(errorLoggerCalled, false);
  assert.strictEqual((result as any).status, "skipped");
}

async function testRealExceptionStillEscapesForQueueFailureHandling() {
  const eligibility = evaluatePeriodicJobEligibility("DATA_RETENTION", {
    ...zeroSnapshot,
    retentionCandidateCount: 1,
  });
  await assert.rejects(
    () => runPeriodicJobWithEligibility(eligibility, async () => {
      throw new Error("real failure");
    }),
    /real failure/,
  );

  const queue = read("server/processing-queue.ts");
  assert(queue.includes("await failJob(job.id, errorMsg"), "queue no longer fails actual exceptions");
  assert(queue.includes("await logSystemError(\"queue\""), "queue no longer logs actual exceptions");
}

function testActiveClientWithEligibleWorkSchedulesNormally() {
  const eligibleSnapshot: PeriodicJobEligibilitySnapshot = {
    activeClientCount: 1,
    activeWorkspaceCount: 1,
    activeArticleCount: 5,
    activeSourceCount: 2,
    dueBriefingCount: 1,
    retentionCandidateCount: 3,
  };
  for (const jobType of ["COMPUTE_ANALYTICS", "DELIVER_BRIEFINGS", "DATA_RETENTION", "INTELLIGENCE_PIPELINE"] as const) {
    assert.strictEqual(evaluatePeriodicJobEligibility(jobType, eligibleSnapshot).eligible, true, `${jobType} should schedule`);
  }
}

function testSchedulingEligibilityIsCentralized() {
  const queue = read("server/processing-queue.ts");
  assert(queue.includes("shouldSchedulePeriodicJob(config.type)"), "periodic scheduler does not use centralized eligibility");
  assert(!queue.includes("activeClientCount"), "periodic scheduler is duplicating eligibility rules");
}

function testPlatformAdminNullClientIsNotTenant() {
  const result = evaluatePeriodicJobEligibility("INTELLIGENCE_PIPELINE", {
    ...zeroSnapshot,
    activeClientCount: 0,
  });
  assert.strictEqual(result.eligible, false);
  assert.strictEqual(result.reason, "no_eligible_monitoring_scope");
}

function testNoDemoRecordsAreCreated() {
  const storage = read("server/storage.ts");
  const seedDefaultPermissions = storage.slice(storage.indexOf("async seedDefaultPermissions"));
  assert(!seedDefaultPermissions.includes("organizationType: \"demo\""), "startup seed still creates demo clients");
  assert(!seedDefaultPermissions.includes("SYSTEM and DEMO clients ensured"), "startup seed still recreates demo/system clients");
}

function testNoTenantDataCreationInSchedulingChanges() {
  for (const file of [
    "server/periodic-job-rules.ts",
    "server/periodic-job-eligibility.ts",
    "scripts/cleanup-zero-state-jobs.cjs",
  ]) {
    const contents = read(file);
    assert(!contents.includes(".insert(clients)"), `${file} inserts clients`);
    assert(!contents.includes(".insert(sources)"), `${file} inserts sources`);
    assert(!contents.includes(".insert(articles)"), `${file} inserts articles`);
    assert(!contents.includes(".insert(workspaces)"), `${file} inserts workspaces`);
  }
}

function testResetAuditRemainsIntact() {
  const cleanup = read("scripts/cleanup-zero-state-jobs.cjs");
  assert(cleanup.includes("platform_reset_audit"), "cleanup command does not anchor to reset audit");
  assert(!cleanup.includes("DELETE FROM public.platform_reset_audit"), "cleanup command deletes reset audit");
}

async function main() {
  await testZeroClientsPreventTenantScheduling();
  testZeroWorkspacesPreventIntelligenceScheduling();
  testZeroArticlesPreventAnalyticsWork();
  testNoDueBriefingsPreventDeliveryWork();
  testDataRetentionHandlesZeroRecordsSafely();
  await testDirectIntelligenceInvocationReturnsSkipped();
  await testSkippedConditionDoesNotCallErrorPath();
  await testRealExceptionStillEscapesForQueueFailureHandling();
  testActiveClientWithEligibleWorkSchedulesNormally();
  testSchedulingEligibilityIsCentralized();
  testPlatformAdminNullClientIsNotTenant();
  testNoDemoRecordsAreCreated();
  testNoTenantDataCreationInSchedulingChanges();
  testResetAuditRemainsIntact();
  console.log("PASS zero-state periodic jobs: centralized eligibility, safe skips, exception path, no demo/data creation, and reset audit preservation");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
