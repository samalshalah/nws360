import { z } from "zod";
import type { PublisherChannelType } from "./publisher-catalog";

export const WORKSPACE_SOURCE_ASSIGNMENT_STATUSES = [
  "draft",
  "testing",
  "ready",
  "active",
  "paused",
  "archived",
] as const;

export const WORKSPACE_SOURCE_ASSIGNMENT_TEST_STATUSES = [
  "untested",
  "passed",
  "warning",
  "failed",
  "stale",
] as const;

export const WORKSPACE_SOURCE_ASSIGNMENT_PRIORITIES = [
  "critical",
  "high",
  "standard",
  "low",
] as const;

export const WORKSPACE_SOURCE_ROLES = [
  "primary",
  "official",
  "regional",
  "contextual",
  "specialist",
  "social",
  "collector",
  "other",
] as const;

export const WORKSPACE_SOURCE_ASSIGNMENT_TEST_TYPES = [
  "connectivity",
  "relevance",
  "full",
] as const;

export const WORKSPACE_SOURCE_ASSIGNMENT_RUN_STATUSES = [
  "running",
  "passed",
  "warning",
  "failed",
] as const;

export type WorkspaceSourceAssignmentStatus = typeof WORKSPACE_SOURCE_ASSIGNMENT_STATUSES[number];
export type WorkspaceSourceAssignmentTestStatus = typeof WORKSPACE_SOURCE_ASSIGNMENT_TEST_STATUSES[number];
export type WorkspaceSourceAssignmentPriority = typeof WORKSPACE_SOURCE_ASSIGNMENT_PRIORITIES[number];
export type WorkspaceSourceRole = typeof WORKSPACE_SOURCE_ROLES[number];
export type WorkspaceSourceAssignmentTestType = typeof WORKSPACE_SOURCE_ASSIGNMENT_TEST_TYPES[number];
export type WorkspaceSourceAssignmentRunStatus = typeof WORKSPACE_SOURCE_ASSIGNMENT_RUN_STATUSES[number];

const boundedString = (max = 500) => z.string().trim().max(max).optional().nullable();

export const sourceProvisionInputSchema = z.object({
  name: boundedString(240),
  url: boundedString(2000),
  type: boundedString(80),
  country: boundedString(32),
  category: boundedString(120),
  intervalMinutes: z.number().int().min(5).max(1440).optional(),
  maxArticlesPerFetch: z.number().int().min(1).max(100).optional(),
  retentionDays: z.number().int().min(1).max(90).optional(),
  refreshPriority: z.enum(["high", "medium", "low"]).optional(),
  collectorConfig: z.record(z.unknown()).optional().nullable(),
  filterConfig: z.record(z.unknown()).optional().nullable(),
  reuseExisting: z.boolean().optional().default(true),
});

export const workspaceSourceAssignmentInputSchema = z.object({
  publisherChannelId: z.number().int().positive(),
  existingSourceId: z.number().int().positive().optional().nullable(),
  source: sourceProvisionInputSchema.optional().nullable(),
  priority: z.enum(WORKSPACE_SOURCE_ASSIGNMENT_PRIORITIES).default("standard"),
  sourceRole: z.enum(WORKSPACE_SOURCE_ROLES).default("primary"),
  relevancePolicy: z.record(z.unknown()).optional().default({}),
  minimumDirectMatchRate: z.number().min(0).max(1).optional().default(0.5),
  maximumNoiseRate: z.number().min(0).max(1).optional().default(0.4),
  notes: boundedString(1000),
});

export const workspaceSourceAssignmentUpdateSchema = z.object({
  priority: z.enum(WORKSPACE_SOURCE_ASSIGNMENT_PRIORITIES).optional(),
  sourceRole: z.enum(WORKSPACE_SOURCE_ROLES).optional(),
  relevancePolicy: z.record(z.unknown()).optional(),
  minimumDirectMatchRate: z.number().min(0).max(1).optional(),
  maximumNoiseRate: z.number().min(0).max(1).optional(),
  notes: boundedString(1000),
});

export const workspaceSourceAssignmentStatusInputSchema = z.object({
  status: z.enum(WORKSPACE_SOURCE_ASSIGNMENT_STATUSES),
});

export const workspaceSourceAssignmentWarningApprovalSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const workspaceSourceAssignmentRelevanceTestInputSchema = z.object({
  samples: z.array(z.object({
    headline: z.string().trim().min(1).max(500),
    url: z.string().trim().max(2000).optional().nullable(),
    content: z.string().trim().max(2000).optional().nullable(),
    language: z.string().trim().max(16).optional().nullable(),
    publishedAt: z.string().trim().max(80).optional().nullable(),
  })).max(25).optional().default([]),
});

export function buildWorkspaceSourceAssignmentKey(workspaceId: number, sourceId: number): string {
  return `workspace:${workspaceId}:source:${sourceId}`;
}

export function buildOperationalSourceIdentityKey(clientId: number, publisherChannelId: number): string {
  return `client:${clientId}:publisher-channel:${publisherChannelId}`;
}

export function mapPublisherChannelTypeToSourceType(channelType: string | null | undefined): string | null {
  switch (channelType) {
    case "website": return "website";
    case "rss": return "rss";
    case "facebook": return "facebook";
    case "x": return "twitter";
    case "youtube": return "youtube";
    case "instagram": return "instagram";
    case "telegram": return "telegram";
    case "newsletter": return "rss";
    case "api": return "rss";
    default: return null;
  }
}

export function isAutomatedChannelType(channelType: string | null | undefined): boolean {
  return Boolean(mapPublisherChannelTypeToSourceType(channelType));
}

export function isManualOnlyChannelType(channelType: string | null | undefined): boolean {
  return ["television", "radio", "podcast", "other"].includes(String(channelType || ""));
}

export function channelRequiresValidValidation(channelType: string | null | undefined): boolean {
  return ["website", "rss"].includes(String(channelType || ""));
}

export function channelIsSocial(channelType: string | null | undefined): boolean {
  return ["facebook", "x", "youtube", "instagram", "tiktok", "linkedin", "telegram"].includes(String(channelType || ""));
}

export function normalizeAssignmentThresholds(input: {
  minimumDirectMatchRate?: number | null;
  maximumNoiseRate?: number | null;
}) {
  return {
    minimumDirectMatchRate: clampRate(input.minimumDirectMatchRate ?? 0.5),
    maximumNoiseRate: clampRate(input.maximumNoiseRate ?? 0.4),
  };
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value)));
}

export type AssignmentSampleResult = {
  headline: string;
  normalizedUrl?: string | null;
  publicationTime?: string | null;
  language?: string | null;
  relevanceClassification: string;
  matchedSignals: string[];
  rejectionReason?: string | null;
};

export function summarizeAssignmentSample(value: AssignmentSampleResult): AssignmentSampleResult {
  return {
    headline: String(value.headline || "").slice(0, 240),
    normalizedUrl: value.normalizedUrl ? String(value.normalizedUrl).slice(0, 500) : null,
    publicationTime: value.publicationTime ? String(value.publicationTime).slice(0, 80) : null,
    language: value.language ? String(value.language).slice(0, 16) : null,
    relevanceClassification: String(value.relevanceClassification || "needs_review").slice(0, 80),
    matchedSignals: (value.matchedSignals || []).map((item) => String(item).slice(0, 120)).slice(0, 12),
    rejectionReason: value.rejectionReason ? String(value.rejectionReason).slice(0, 240) : null,
  };
}

export function calculateAssignmentTestRates(counts: {
  sampleCount: number;
  directScopeMatchCount: number;
  materialScopeImpactCount: number;
  contextualCount: number;
  notRelevantCount: number;
  needsReviewCount: number;
}) {
  const denominator = Math.max(1, counts.sampleCount);
  const relevantCount = counts.directScopeMatchCount + counts.materialScopeImpactCount;
  return {
    directMatchRate: counts.directScopeMatchCount / denominator,
    relevantRate: relevantCount / denominator,
    noiseRate: counts.notRelevantCount / denominator,
  };
}

export function evaluateAssignmentTestOutcome(input: {
  sampleCount: number;
  directScopeMatchCount: number;
  materialScopeImpactCount: number;
  contextualCount: number;
  notRelevantCount: number;
  needsReviewCount: number;
  minimumDirectMatchRate: number;
  maximumNoiseRate: number;
  fatalError?: boolean;
}) {
  if (input.fatalError) return { status: "failed" as const, reason: "fatal_connectivity_or_configuration_error" };
  if (input.sampleCount === 0) return { status: "failed" as const, reason: "no_usable_items" };
  const rates = calculateAssignmentTestRates(input);
  if (rates.noiseRate > input.maximumNoiseRate) return { status: "failed" as const, reason: "noise_rate_exceeded" };
  if (rates.directMatchRate < input.minimumDirectMatchRate && rates.relevantRate < input.minimumDirectMatchRate) {
    return { status: "warning" as const, reason: "relevance_below_direct_threshold" };
  }
  if (input.sampleCount < 3) return { status: "warning" as const, reason: "small_sample" };
  if (input.contextualCount > input.directScopeMatchCount + input.materialScopeImpactCount) {
    return { status: "warning" as const, reason: "contextual_coverage_dominates" };
  }
  if (input.needsReviewCount / Math.max(1, input.sampleCount) > 0.3) {
    return { status: "warning" as const, reason: "needs_review_rate_elevated" };
  }
  return { status: "passed" as const, reason: "thresholds_met" };
}

export type ProvisionabilityResult = {
  provisionable: boolean;
  manualOnly: boolean;
  reason: string | null;
  requiredConfiguration: string[];
};

export function evaluateChannelProvisionability(input: {
  channelType: PublisherChannelType | string | null | undefined;
  url?: string | null;
  normalizedUrl?: string | null;
  validationStatus?: string | null;
  verificationStatus?: string | null;
  lifecycleStatus?: string | null;
  sourceUrl?: string | null;
  hasManualValidationOverride?: boolean;
}): ProvisionabilityResult {
  const channelType = String(input.channelType || "");
  if (input.lifecycleStatus === "archived") {
    return { provisionable: false, manualOnly: false, reason: "channel_archived", requiredConfiguration: [] };
  }
  if (isManualOnlyChannelType(channelType)) {
    return { provisionable: false, manualOnly: true, reason: "manual_only_channel", requiredConfiguration: ["supported_stream_or_feed"] };
  }
  if (!isAutomatedChannelType(channelType)) {
    return { provisionable: false, manualOnly: false, reason: "unsupported_channel", requiredConfiguration: ["supported_connector"] };
  }
  if (channelRequiresValidValidation(channelType)) {
    const validationOk = input.validationStatus === "valid" || input.hasManualValidationOverride === true;
    if (!validationOk) {
      return { provisionable: false, manualOnly: false, reason: "channel_validation_required", requiredConfiguration: ["valid_channel_validation_or_manual_override"] };
    }
  }
  if (channelIsSocial(channelType)) {
    const hasOperationalFeed = Boolean(input.sourceUrl || input.url || input.normalizedUrl);
    if (!hasOperationalFeed) {
      return { provisionable: false, manualOnly: false, reason: "social_feed_configuration_required", requiredConfiguration: ["rss_app_feed_or_supported_connector"] };
    }
  }
  if (!input.sourceUrl && !input.url && !input.normalizedUrl) {
    return { provisionable: false, manualOnly: false, reason: "source_url_required", requiredConfiguration: ["source_url"] };
  }
  return { provisionable: true, manualOnly: false, reason: null, requiredConfiguration: [] };
}
