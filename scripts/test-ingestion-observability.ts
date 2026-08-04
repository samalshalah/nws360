import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deriveZeroInsertReason,
  maybeNormalizeSourceFetchMetrics,
  normalizeSourceFetchMetrics,
  type SourceFetchMetricsInput,
} from "../shared/source-fetch-metrics";

function fixtureMetrics(overrides: SourceFetchMetricsInput): SourceFetchMetricsInput {
  return {
    version: 1,
    rawItemCount: 3,
    parsedItemCount: 3,
    normalizedItemCount: 3,
    invalidItemCount: 0,
    missingPublicationTimeCount: 0,
    retentionRejectedCount: 0,
    sourceFilterRejectedCount: 0,
    eligibleItemCount: 3,
    duplicateSkippedCount: 0,
    insertionAttemptCount: 3,
    articleInsertions: 3,
    appearanceInsertions: 1,
    processingJobsCreated: 3,
    retentionDays: 7,
    retentionCutoff: "2026-07-27T00:00:00.000Z",
    oldestParsedPublicationTime: "2026-08-01T00:00:00.000Z",
    newestParsedPublicationTime: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

function assertReason(input: SourceFetchMetricsInput, expected: string) {
  assert.equal(deriveZeroInsertReason(input), expected);
  assert.equal(normalizeSourceFetchMetrics(input)?.zeroInsertReason, expected);
}

assertReason(fixtureMetrics({
  rawItemCount: 0,
  parsedItemCount: 0,
  normalizedItemCount: 0,
  eligibleItemCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
}), "no_raw_items");

assertReason(fixtureMetrics({
  rawItemCount: 8,
  parsedItemCount: 0,
  normalizedItemCount: 0,
  eligibleItemCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
}), "parser_produced_no_items");

assertReason(fixtureMetrics({
  rawItemCount: 4,
  parsedItemCount: 4,
  normalizedItemCount: 4,
  invalidItemCount: 4,
  eligibleItemCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
}), "validation_rejected_all");

assertReason(fixtureMetrics({
  rawItemCount: 5,
  parsedItemCount: 5,
  normalizedItemCount: 5,
  retentionRejectedCount: 5,
  eligibleItemCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
  appearanceInsertions: 0,
  processingJobsCreated: 0,
}), "retention_rejected_all");

assertReason(fixtureMetrics({
  rawItemCount: 5,
  parsedItemCount: 5,
  normalizedItemCount: 5,
  sourceFilterRejectedCount: 5,
  eligibleItemCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
  appearanceInsertions: 0,
  processingJobsCreated: 0,
}), "source_filter_rejected_all");

assertReason(fixtureMetrics({
  eligibleItemCount: 3,
  duplicateSkippedCount: 3,
  insertionAttemptCount: 0,
  articleInsertions: 0,
  appearanceInsertions: 2,
  processingJobsCreated: 0,
}), "duplicates_skipped_all");

assertReason(fixtureMetrics({
  eligibleItemCount: 3,
  duplicateSkippedCount: 0,
  insertionAttemptCount: 3,
  articleInsertions: 0,
  appearanceInsertions: 0,
  processingJobsCreated: 0,
}), "persistence_skipped_all");

assertReason(fixtureMetrics({
  rawItemCount: 6,
  parsedItemCount: 6,
  normalizedItemCount: 6,
  retentionRejectedCount: 2,
  sourceFilterRejectedCount: 2,
  eligibleItemCount: 2,
  duplicateSkippedCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
  appearanceInsertions: 0,
  processingJobsCreated: 0,
}), "mixed_rejections");

assertReason(fixtureMetrics({
  rawItemCount: 11,
  parsedItemCount: 11,
  normalizedItemCount: 11,
  retentionRejectedCount: 0,
  sourceFilterRejectedCount: 0,
  eligibleItemCount: 11,
  duplicateSkippedCount: 0,
  insertionAttemptCount: 11,
  articleInsertions: 4,
  appearanceInsertions: 4,
  processingJobsCreated: 4,
}), "not_zero");

const inaStaleFixture = normalizeSourceFetchMetrics(fixtureMetrics({
  rawItemCount: 12,
  parsedItemCount: 12,
  normalizedItemCount: 12,
  retentionRejectedCount: 12,
  eligibleItemCount: 0,
  insertionAttemptCount: 0,
  articleInsertions: 0,
  appearanceInsertions: 0,
  processingJobsCreated: 0,
  retentionCutoff: "2026-07-27T00:00:00.000Z",
  oldestParsedPublicationTime: "2025-02-01T08:00:00.000Z",
  newestParsedPublicationTime: "2025-02-07T08:00:00.000Z",
}));
assert.equal(inaStaleFixture?.zeroInsertReason, "retention_rejected_all");
assert.equal(inaStaleFixture?.retentionRejectedCount, 12);

const mixedBatchFixture = normalizeSourceFetchMetrics(fixtureMetrics({
  rawItemCount: 7,
  parsedItemCount: 7,
  normalizedItemCount: 6,
  invalidItemCount: 1,
  retentionRejectedCount: 2,
  sourceFilterRejectedCount: 1,
  eligibleItemCount: 3,
  duplicateSkippedCount: 1,
  insertionAttemptCount: 2,
  articleInsertions: 2,
  appearanceInsertions: 2,
  processingJobsCreated: 2,
}));
assert.equal(mixedBatchFixture?.zeroInsertReason, "not_zero");
assert.equal(mixedBatchFixture?.articleInsertions, 2);

assert.equal(maybeNormalizeSourceFetchMetrics({ version: 1, articleInsertions: 2, insertionAttemptCount: 1 }), null);
assert.equal(maybeNormalizeSourceFetchMetrics({ version: 1, rawItemCount: 1_000_001, articleInsertions: 0 }), null);

const concurrentFixtures = await Promise.all([
  Promise.resolve(normalizeSourceFetchMetrics(fixtureMetrics({ articleInsertions: 1, insertionAttemptCount: 1 }))),
  Promise.resolve(normalizeSourceFetchMetrics(fixtureMetrics({ rawItemCount: 0, parsedItemCount: 0, normalizedItemCount: 0, eligibleItemCount: 0, insertionAttemptCount: 0, articleInsertions: 0 }))),
  Promise.resolve(normalizeSourceFetchMetrics(fixtureMetrics({ eligibleItemCount: 2, duplicateSkippedCount: 2, insertionAttemptCount: 0, articleInsertions: 0 }))),
]);
assert.deepEqual(concurrentFixtures.map((item) => item?.zeroInsertReason), ["not_zero", "no_raw_items", "duplicates_skipped_all"]);

const workerSource = readFileSync("server/feed-worker.ts", "utf8");
assert.match(workerSource, /articlesFound:\s*result\.newArticles/);
assert.match(workerSource, /metrics:\s*result\.metrics/);
assert.match(workerSource, /createFetchLogWithOptionalMetrics/);
assert.match(workerSource, /retentionRejectedCount:\s*oldByRetentionCount \+ oldFacebookCount/);
assert.match(workerSource, /duplicateSkippedCount\+\+/);

const storageSource = readFileSync("server/storage.ts", "utf8");
assert.match(storageSource, /maybeNormalizeSourceFetchMetrics\(log\.metrics\)/);
assert.match(storageSource, /lastMetrics/);

console.log("ingestion observability tests passed");
