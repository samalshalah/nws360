import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  normalizeSourceHealthRejectedHistory,
  sourceHealthZeroInsertMessage,
} from "../shared/source-health";

const missingHistory = normalizeSourceHealthRejectedHistory({
  rejectedItemHistoryAvailable: false,
  rejectedItemCount: 0,
  rejectedLast7d: 0,
  notRelevantLast7d: 0,
  needsReviewLast7d: 0,
});
assert.equal(missingHistory.rejectedItemHistoryAvailable, false);
assert.equal(missingHistory.rejectedItemCount, null);
assert.equal(missingHistory.rejectedLast7d, null);
assert.equal(missingHistory.notRelevantLast7d, null);
assert.equal(missingHistory.needsReviewLast7d, null);

const presentHistory = normalizeSourceHealthRejectedHistory({
  rejectedItemHistoryAvailable: "true",
  rejectedItemCount: "7",
  rejectedLast7d: "7",
  notRelevantLast7d: "5",
  needsReviewLast7d: "2",
});
assert.equal(presentHistory.rejectedItemHistoryAvailable, true);
assert.equal(presentHistory.rejectedItemCount, 7);
assert.equal(presentHistory.rejectedLast7d, 7);
assert.equal(presentHistory.notRelevantLast7d, 5);
assert.equal(presentHistory.needsReviewLast7d, 2);

const mixedMessage = sourceHealthZeroInsertMessage({
  version: 1,
  rawItemCount: 13,
  parsedItemCount: 13,
  normalizedItemCount: 13,
  invalidItemCount: 0,
  retentionRejectedCount: 10,
  sourceFilterRejectedCount: 0,
  eligibleItemCount: 0,
  duplicateSkippedCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
  appearanceInsertions: 0,
  processingJobsCreated: 0,
  retentionDays: 7,
  retentionCutoff: "2026-07-28T16:51:31.572Z",
  oldestParsedPublicationTime: "2026-05-06T18:38:00.000Z",
  newestParsedPublicationTime: "2026-05-06T22:28:00.000Z",
  zeroInsertReason: "mixed_rejections",
});
assert.equal(
  mixedMessage,
  "No articles were inserted. 10 items were outside the 7-day retention window, and 3 remaining items were removed by other ingestion gates.",
);

const retentionMessage = sourceHealthZeroInsertMessage({
  version: 1,
  rawItemCount: 10,
  parsedItemCount: 10,
  normalizedItemCount: 10,
  invalidItemCount: 0,
  retentionRejectedCount: 10,
  sourceFilterRejectedCount: 0,
  eligibleItemCount: 0,
  duplicateSkippedCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
  appearanceInsertions: 0,
  processingJobsCreated: 0,
  retentionDays: 7,
  retentionCutoff: "2026-07-28T16:51:31.572Z",
  oldestParsedPublicationTime: "2026-05-06T18:38:00.000Z",
  newestParsedPublicationTime: "2026-05-06T22:28:00.000Z",
  zeroInsertReason: "retention_rejected_all",
});
assert.equal(retentionMessage, "10 items were older than the 7-day retention window.");
assert.equal(sourceHealthZeroInsertMessage(null), null);

const storageSource = readFileSync("server/storage.ts", "utf8");
const getSourceHealthStart = storageSource.indexOf("async getSourceHealth");
const getSourceHealthEnd = storageSource.indexOf("async getUsers", getSourceHealthStart);
assert(getSourceHealthStart > 0 && getSourceHealthEnd > getSourceHealthStart, "getSourceHealth block must be found");
const getSourceHealthBlock = storageSource.slice(getSourceHealthStart, getSourceHealthEnd);
assert.match(storageSource, /to_regclass\('public\.rejected_ingestion_items'\)/);
assert.match(getSourceHealthBlock, /const rejectedHistoryAvailable = await rejectedIngestionHistoryAvailable\(\)/);
assert.match(getSourceHealthBlock, /rejectedHistoryAvailable\s+\?/);
assert.match(getSourceHealthBlock, /NULL::int/);
assert.match(getSourceHealthBlock, /rejectedItemHistoryAvailable/);
assert.match(getSourceHealthBlock, /rejectedItemCount/);
assert.match(getSourceHealthBlock, /normalizeSourceHealthRejectedHistory\(r\)/);
assert.doesNotMatch(getSourceHealthBlock, /catch\s*\(/, "storage must not suppress unrelated database errors");

const routesSource = readFileSync("server/routes.ts", "utf8");
const routeStart = routesSource.indexOf('app.get("/api/source-health"');
const routeEnd = routesSource.indexOf('app.get("/api/source-health/:sourceId/logs"', routeStart);
assert(routeStart > 0 && routeEnd > routeStart, "source health route block must be found");
const routeBlock = routesSource.slice(routeStart, routeEnd);
assert.match(routeBlock, /requireCapability\(CAPS\.SOURCE_HEALTH_VIEW\)/);
assert.match(routeBlock, /getUserSourceIds\(user, req\)/);
assert.match(routeBlock, /res\.status\(500\)\.json\(\{ message: "Source health unavailable" \}\)/);
assert.doesNotMatch(routeBlock, /err\.message|error\.message/, "route must not leak raw SQL details");
assert.doesNotMatch(routeBlock, /createAuditLog|createRejectedIngestionItem|fetchSourceFeed|testWorkspaceSourceAssignment/);

const getUserSourceIdsStart = routesSource.indexOf("async function getUserSourceIds");
const getUserSourceIdsEnd = routesSource.indexOf("export async function registerRoutes", getUserSourceIdsStart);
assert(getUserSourceIdsStart > 0 && getUserSourceIdsEnd > getUserSourceIdsStart, "getUserSourceIds block must be found");
const getUserSourceIdsBlock = routesSource.slice(getUserSourceIdsStart, getUserSourceIdsEnd);
assert.match(getUserSourceIdsBlock, /const clientId = resolveClientId\(user, req\)/);
assert.match(getUserSourceIdsBlock, /if \(!clientId\) return \[\]/);
assert.match(getUserSourceIdsBlock, /storage\.getSources\(clientId\)/);

const uiSource = readFileSync("client/src/pages/SourceHealth.tsx", "utf8");
assert.match(uiSource, /Rejected-item history unavailable/);
assert.match(uiSource, /sourceHealthZeroInsertMessage/);
assert.match(uiSource, /source\.rejectedItemHistoryAvailable \? metricValue\(source\.rejectedItemCount\) : "n\/a"/);
assert.match(uiSource, /metricValue\(source\.lastMetrics\.eligibleItemCount\)/);
assert.doesNotMatch(uiSource, /0 rejected items/i);

const changedFiles = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
assert(!changedFiles.includes("server/feed-worker.ts"), "feed-worker must not change");
assert(!changedFiles.includes("server/website-collector.ts"), "collector must not change");
assert(!changedFiles.includes("server/processing-queue.ts"), "processing queue must not change");

console.log("source health schema compatibility tests passed");
