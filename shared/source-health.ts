import type { SourceFetchMetrics } from "./source-fetch-metrics";

export interface SourceHealthRejectedHistory {
  rejectedItemHistoryAvailable: boolean;
  rejectedItemCount: number | null;
  rejectedLast7d: number | null;
  notRelevantLast7d: number | null;
  needsReviewLast7d: number | null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "t";
}

function asNonNegativeCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

export function normalizeSourceHealthRejectedHistory(row: {
  rejectedItemHistoryAvailable?: unknown;
  rejectedItemCount?: unknown;
  rejectedLast7d?: unknown;
  notRelevantLast7d?: unknown;
  needsReviewLast7d?: unknown;
}): SourceHealthRejectedHistory {
  const available = asBoolean(row.rejectedItemHistoryAvailable);
  if (!available) {
    return {
      rejectedItemHistoryAvailable: false,
      rejectedItemCount: null,
      rejectedLast7d: null,
      notRelevantLast7d: null,
      needsReviewLast7d: null,
    };
  }

  const rejectedItemCount = asNonNegativeCount(row.rejectedItemCount ?? row.rejectedLast7d);
  return {
    rejectedItemHistoryAvailable: true,
    rejectedItemCount,
    rejectedLast7d: asNonNegativeCount(row.rejectedLast7d ?? rejectedItemCount),
    notRelevantLast7d: asNonNegativeCount(row.notRelevantLast7d),
    needsReviewLast7d: asNonNegativeCount(row.needsReviewLast7d),
  };
}

const ZERO_INSERT_MESSAGES: Record<string, string> = {
  no_raw_items: "No items were fetched from the source.",
  parser_produced_no_items: "The source responded, but no article items were parsed.",
  validation_rejected_all: "All parsed items failed basic validation.",
  retention_rejected_all: "All items were older than the source retention window.",
  source_filter_rejected_all: "All items were removed by source filters.",
  duplicates_skipped_all: "All eligible items were already present.",
  persistence_skipped_all: "Items reached insertion but no article was stored.",
  mixed_rejections: "Items were dropped across multiple ingestion gates.",
  unknown: "No inserted articles; the exact drop point is unknown.",
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function knownCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function sourceItemTotal(metrics: SourceFetchMetrics): number | null {
  return knownCount(metrics.normalizedItemCount)
    ?? knownCount(metrics.parsedItemCount)
    ?? knownCount(metrics.rawItemCount);
}

export function sourceHealthZeroInsertMessage(metrics: SourceFetchMetrics | null | undefined): string | null {
  if (!metrics || metrics.articleInsertions > 0) return null;

  const retentionRejected = knownCount(metrics.retentionRejectedCount);
  const retentionDays = knownCount(metrics.retentionDays);

  if (metrics.zeroInsertReason === "retention_rejected_all" && retentionRejected != null && retentionDays != null) {
    return `${pluralize(retentionRejected, "item")} were older than the ${retentionDays}-day retention window.`;
  }

  if (metrics.zeroInsertReason === "mixed_rejections") {
    const total = sourceItemTotal(metrics);
    const dropCounts: Array<number | null | undefined> = [
      metrics.invalidItemCount,
      metrics.retentionRejectedCount,
      metrics.sourceFilterRejectedCount,
      metrics.duplicateSkippedCount,
    ];
    const accounted = dropCounts.reduce<number>((sum, item) => sum + (knownCount(item) ?? 0), 0);
    const remaining = total == null ? null : Math.max(0, total - accounted);
    const details: string[] = [];

    if (retentionRejected != null && retentionRejected > 0 && retentionDays != null) {
      details.push(`${pluralize(retentionRejected, "item")} were outside the ${retentionDays}-day retention window`);
    }
    if (remaining != null && remaining > 0) {
      details.push(`${pluralize(remaining, "remaining item")} were removed by other ingestion gates`);
    }
    if (details.length === 0) return ZERO_INSERT_MESSAGES.mixed_rejections;
    return `No articles were inserted. ${details.join(", and ")}.`;
  }

  return ZERO_INSERT_MESSAGES[metrics.zeroInsertReason] || ZERO_INSERT_MESSAGES.unknown;
}
