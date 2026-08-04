import { z } from "zod";

export const SOURCE_FETCH_METRICS_VERSION = 1 as const;

export const ZERO_INSERT_REASONS = [
  "no_raw_items",
  "parser_produced_no_items",
  "validation_rejected_all",
  "retention_rejected_all",
  "source_filter_rejected_all",
  "duplicates_skipped_all",
  "persistence_skipped_all",
  "mixed_rejections",
  "not_zero",
  "unknown",
] as const;

export type ZeroInsertReason = typeof ZERO_INSERT_REASONS[number];

const boundedCount = z.number().int().min(0).max(1_000_000);
const nullableBoundedCount = boundedCount.nullable().optional();
const nullableIsoTimestamp = z.string().datetime({ offset: true }).nullable().optional();

export type SourceFetchMetricsInput = {
  version?: 1;
  rawItemCount?: number | null;
  parsedItemCount?: number | null;
  normalizedItemCount?: number | null;
  invalidItemCount?: number | null;
  missingPublicationTimeCount?: number | null;
  retentionRejectedCount?: number | null;
  sourceFilterRejectedCount?: number | null;
  eligibleItemCount?: number | null;
  duplicateSkippedCount?: number | null;
  insertionAttemptCount?: number | null;
  articleInsertions?: number;
  appearanceInsertions?: number;
  processingJobsCreated?: number;
  retentionDays?: number | null;
  retentionCutoff?: string | null;
  oldestParsedPublicationTime?: string | null;
  newestParsedPublicationTime?: string | null;
  zeroInsertReason?: ZeroInsertReason;
};

function knownCount(value: number | null | undefined): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : null;
}

function subtractKnown(value: number | null, ...subtract: Array<number | null | undefined>): number | null {
  if (value == null) return null;
  const total = subtract.reduce<number>((sum, item) => sum + (knownCount(item) ?? 0), 0);
  return Math.max(0, value - total);
}

export function deriveZeroInsertReason(metrics: SourceFetchMetricsInput): ZeroInsertReason {
  const articleInsertions = knownCount(metrics.articleInsertions) ?? 0;
  if (articleInsertions > 0) return "not_zero";

  const rawItemCount = knownCount(metrics.rawItemCount);
  if (rawItemCount === 0) return "no_raw_items";

  const parsedItemCount = knownCount(metrics.parsedItemCount);
  if (rawItemCount != null && rawItemCount > 0 && parsedItemCount === 0) {
    return "parser_produced_no_items";
  }

  const normalizedItemCount = knownCount(metrics.normalizedItemCount);
  const invalidItemCount = knownCount(metrics.invalidItemCount);
  if (normalizedItemCount != null && normalizedItemCount > 0 && invalidItemCount === normalizedItemCount) {
    return "validation_rejected_all";
  }

  const validationBase = normalizedItemCount ?? parsedItemCount ?? rawItemCount;
  const afterValidation = subtractKnown(validationBase, invalidItemCount);
  const retentionRejectedCount = knownCount(metrics.retentionRejectedCount);
  if (afterValidation != null && afterValidation > 0 && retentionRejectedCount === afterValidation) {
    return "retention_rejected_all";
  }

  const afterRetention = subtractKnown(afterValidation, retentionRejectedCount);
  const sourceFilterRejectedCount = knownCount(metrics.sourceFilterRejectedCount);
  if (afterRetention != null && afterRetention > 0 && sourceFilterRejectedCount === afterRetention) {
    return "source_filter_rejected_all";
  }

  const eligibleItemCount = knownCount(metrics.eligibleItemCount);
  const duplicateSkippedCount = knownCount(metrics.duplicateSkippedCount);
  if (eligibleItemCount != null && eligibleItemCount > 0 && duplicateSkippedCount === eligibleItemCount) {
    return "duplicates_skipped_all";
  }

  const insertionAttemptCount = knownCount(metrics.insertionAttemptCount);
  if (insertionAttemptCount != null && insertionAttemptCount > 0 && articleInsertions === 0) {
    return "persistence_skipped_all";
  }

  const rejectedTotal = [
    invalidItemCount,
    retentionRejectedCount,
    sourceFilterRejectedCount,
    duplicateSkippedCount,
  ].reduce<number>((sum, item) => sum + (item ?? 0), 0);
  if (rejectedTotal > 0) return "mixed_rejections";

  return "unknown";
}

const sourceFetchMetricsInputSchema = z.object({
  version: z.literal(SOURCE_FETCH_METRICS_VERSION).default(SOURCE_FETCH_METRICS_VERSION),
  rawItemCount: nullableBoundedCount,
  parsedItemCount: nullableBoundedCount,
  normalizedItemCount: nullableBoundedCount,
  invalidItemCount: nullableBoundedCount,
  missingPublicationTimeCount: nullableBoundedCount,
  retentionRejectedCount: nullableBoundedCount,
  sourceFilterRejectedCount: nullableBoundedCount,
  eligibleItemCount: nullableBoundedCount,
  duplicateSkippedCount: nullableBoundedCount,
  insertionAttemptCount: nullableBoundedCount,
  articleInsertions: boundedCount.default(0),
  appearanceInsertions: boundedCount.default(0),
  processingJobsCreated: boundedCount.default(0),
  retentionDays: boundedCount.nullable().optional(),
  retentionCutoff: nullableIsoTimestamp,
  oldestParsedPublicationTime: nullableIsoTimestamp,
  newestParsedPublicationTime: nullableIsoTimestamp,
  zeroInsertReason: z.enum(ZERO_INSERT_REASONS).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.insertionAttemptCount != null && value.articleInsertions > value.insertionAttemptCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["articleInsertions"],
      message: "articleInsertions cannot exceed insertionAttemptCount",
    });
  }
  if (value.zeroInsertReason === "retention_rejected_all") {
    const base = value.normalizedItemCount ?? value.parsedItemCount ?? value.rawItemCount;
    const afterValidation = subtractKnown(base ?? null, value.invalidItemCount);
    if (!afterValidation || value.retentionRejectedCount !== afterValidation || value.articleInsertions !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zeroInsertReason"],
        message: "retention_rejected_all requires all validated items to be rejected by retention",
      });
    }
  }
}).transform((value) => ({
  ...value,
  zeroInsertReason: value.zeroInsertReason ?? deriveZeroInsertReason(value),
}));

export const sourceFetchMetricsSchema = sourceFetchMetricsInputSchema;
export type SourceFetchMetrics = z.infer<typeof sourceFetchMetricsSchema>;

export function normalizeSourceFetchMetrics(value: unknown): SourceFetchMetrics | null {
  if (value == null) return null;
  return sourceFetchMetricsSchema.parse(value);
}

export function maybeNormalizeSourceFetchMetrics(value: unknown): SourceFetchMetrics | null {
  const parsed = sourceFetchMetricsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function dateToUtcIso(value: Date | null | undefined): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}
