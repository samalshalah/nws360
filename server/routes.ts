import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth, toPublicUser } from "./auth";
import { storage, assertTenant, TenantNotFoundError, safeNotFound, StorageBoundaryError } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { startFeedWorker, fetchSourceFeed, analyzeWithAI, registerArticleAnalysisHandler, previewSource } from "./feed-worker";
import { enqueueAIJob, awaitJobResult, checkClientAiBudget } from "./ai/ai-gateway";
import { startScheduler, stopScheduler, _schedulerTickForTesting } from "./ai/ai-scheduler";
import { db } from "./db";
import { buildClientEmbassyProfile } from "./embassy-profile";
import {
  adminAuditLogs,
  analyticsCache,
  articles,
  clients,
  clientSettings,
  processingJobs,
  workspaceRelevanceProfiles,
  workspaces,
  PLAN_LIMITS,
  SYSTEM_ROLES,
  CAPS,
  resolveEffectiveCaps,
  type AlertRule,
} from "@shared/schema";
import {
  normalizeClientEnrollment,
  stableEnrollmentJson,
  isDiplomaticOrganizationType,
  type NormalizedClientEnrollment,
} from "@shared/client-enrollment";
import { getCountry } from "@shared/country-registry";
import { isGoogleNewsEditionCode } from "@shared/google-news-regions";
import { isSourceCategoryCode } from "@shared/source-categories";
import {
  ARTICLE_CATEGORIES,
  ARTICLE_PRIORITIES,
  ARTICLE_WORKFLOW_STATUSES,
  IRAQ_PROVINCES,
  getArticleCategoryLabel,
  getArticlePriorityLabel,
  getArticleWorkflowStatusLabel,
  getIraqProvinceLabel,
  isArticleCategoryCode,
  isArticlePriorityCode,
  isArticleWorkflowStatusCode,
  isIraqProvinceCode,
} from "@shared/article-taxonomy";
import { normalizeWebsiteCollectorConfig, websiteCollectorConfigSchema } from "@shared/source-collector";
import { normalizeSourceFilterConfig, sourceFilterConfigSchema } from "@shared/source-filter";
import { classifyFeedImportRow, normalizeSourceImportKey, type ClassifiedFeedImportRow, type FeedImportInputRow } from "@shared/source-import";
import {
  ARTICLE_RELEVANCE_STATUSES,
  RELEVANCE_ENGINE_VERSION,
  WORKSPACE_PURPOSES,
  WORKSPACE_SCOPE_MODES,
  evaluateWorkspaceRelevance,
  normalizeWorkspaceProfile,
  isArticleRelevanceStatus,
  type ArticleRelevanceStatus,
  type WorkspaceProfile,
} from "@shared/workspace-relevance";
import {
  normalizeRelevanceStatusFilter,
  parseWorkspaceIdInput,
  resolveRelevanceStatusAccess,
  validateWorkspaceTenantAccess,
} from "@shared/workspace-query-scope";
import { discoverPublisherCategories, type DiscoveredPublisherCategory } from "./publisher-discovery";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import sanitizeHtml from "sanitize-html";
import { scrypt, randomBytes, createHash } from "crypto";
import { promisify } from "util";
import { startQueueProcessor, startPeriodicJobs, getQueueStats, logSystemError, enqueueJob, openaiLimiter, registerJobHandler, recordCompletedJob } from "./processing-queue";
import { runPeriodicJobIfEligible } from "./periodic-job-eligibility";
import { runAnalyticsComputation } from "./analytics-worker";
import { runDataRetention, onSourceHardDeleted } from "./data-retention-worker";
import { startLearningWorker } from "./learning-worker";
import { buildBriefingDeliveryPreview, deliverDueBriefings, getEmailProviderStatus } from "./briefing-delivery";
import { buildWorkspaceSourceAssignmentPublisherResponse } from "./source-assignment-publisher-dto";

const scryptAsync = promisify(scrypt);
const CONFIGURABLE_SOCIAL_FEED_SOURCE_TYPES = new Set(["facebook", "instagram", "twitter", "telegram", "youtube"]);
const DEFAULT_SOURCE_RETENTION_DAYS = 7;
const BULK_SOURCE_FETCH_CONCURRENCY = 3;
const MAX_ARTICLE_MANUAL_TAGS = 20;
const SYSTEM_SETTING_DEFAULTS: Record<string, string> = {
  feedRefreshMinutes: "5",
  rawArticleRetentionDays: "30",
  analyticsRetentionMonths: "12",
  defaultTargetLanguages: "en,ar",
  autoTranslationEnabled: "true",
  keywordSpikeThreshold: "150",
  sentimentShiftSensitivity: "30",
  maxArticlesPerSource: "1000",
  enableAutoFetch: "true",
  enableSentimentAnalysis: "true",
  enableBreakingNews: "true",
  maxConcurrentFetches: "3",
  workerIntervalSeconds: "300",
  feedLiveUpdateEnabled: "true",
  feedLiveUpdateIntervalSeconds: "60",
  feedLiveUpdateMode: "notify",
};

const CLIENT_SETTING_DEFAULTS = {
  feedLiveUpdateEnabled: true,
  feedLiveUpdateIntervalSeconds: 60,
  feedLiveUpdateMode: "notify",
  defaultFeedDateRange: "all",
  defaultArticleRetentionDays: 7,
  defaultSourceIntervalMinutes: 15,
  defaultMaxArticlesPerFetch: 10,
  autoTranslationEnabled: false,
  defaultTargetLanguage: "en",
  reportExportFormat: "txt",
  reportIncludeSummaries: true,
} as const;

const clientSettingsInputSchema = z.object({
  defaultLanguage: z.string().trim().min(2).max(12).optional(),
  feedLiveUpdateEnabled: z.boolean().optional(),
  feedLiveUpdateIntervalSeconds: z.coerce.number().int().min(15).max(300).optional(),
  feedLiveUpdateMode: z.enum(["notify", "auto_load"]).optional(),
  defaultFeedDateRange: z.enum(["all", "today", "week", "month"]).optional(),
  defaultArticleRetentionDays: z.coerce.number().int().min(1).max(30).optional(),
  defaultSourceIntervalMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  defaultMaxArticlesPerFetch: z.coerce.number().int().min(1).max(100).optional(),
  autoTranslationEnabled: z.boolean().optional(),
  defaultTargetLanguage: z.string().trim().min(2).max(12).optional(),
  reportExportFormat: z.enum(["txt", "csv"]).optional(),
  reportIncludeSummaries: z.boolean().optional(),
  homeCountryCode: z.string().trim().min(1).max(12).nullable().optional(),
  homeCountryName: z.string().trim().min(1).max(120).nullable().optional(),
  homeCountryAliases: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
  embassyAliases: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
  ambassadorAliases: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
  bilateralCategoryLabel: z.string().trim().min(1).max(160).nullable().optional(),
  representedCountryCode: z.string().trim().min(1).max(12).nullable().optional(),
  hostCountryCode: z.string().trim().min(1).max(12).nullable().optional(),
  headquartersCountryCode: z.string().trim().min(1).max(12).nullable().optional(),
  defaultTimezone: z.string().trim().min(2).max(80).nullable().optional(),
  defaultLanguages: z.array(z.string().trim().min(2).max(20)).max(20).optional(),
  websiteUrl: z.string().trim().max(500).nullable().optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  contactEmail: z.string().trim().email().max(254).nullable().optional(),
}).strict();

const articleWorkflowUpdateSchema = z.object({
  category: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  workflowStatus: z.string().nullable().optional(),
  manualTags: z.array(z.string()).max(MAX_ARTICLE_MANUAL_TAGS).optional(),
}).strict();

const articleRelevanceUpdateSchema = z.object({
  relevanceStatus: z.enum(ARTICLE_RELEVANCE_STATUSES),
  relevanceReason: z.string().trim().max(500).optional(),
  reviewNote: z.string().trim().max(500).optional(),
  reopen: z.boolean().optional(),
  workspaceId: z.coerce.number().int().positive(),
}).strict();

const workspaceRelevanceProfileInputSchema = z.object({
  topics: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
  subtopics: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
  industries: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
  entities: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  organizations: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  people: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  projects: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  events: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  multilingualAliases: z.union([z.record(z.array(z.string().trim().min(1).max(160))), z.array(z.string().trim().min(1).max(160))]).nullable().optional(),
  inclusionTerms: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  exclusionTerms: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  impactTerms: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  contextualTerms: z.array(z.string().trim().min(1).max(160)).max(300).optional(),
  minimumConfidence: z.coerce.number().int().min(0).max(100).optional(),
  includeContextualByDefault: z.boolean().optional(),
  contextualLabel: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
}).strict();

const workspaceRelevancePreviewSchema = z.object({
  title: z.string().trim().max(500).optional(),
  summary: z.string().trim().max(3000).optional(),
  content: z.string().trim().max(50000).optional(),
  url: z.string().trim().max(2000).optional(),
  imageTitle: z.string().trim().max(500).optional(),
  sourceName: z.string().trim().max(300).optional(),
  sourceCategory: z.string().trim().max(120).optional(),
  subSource: z.string().trim().max(300).optional(),
  language: z.string().trim().max(24).optional(),
  country: z.string().trim().max(80).optional(),
  topics: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
  keywords: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
}).strict();

const bulkArticleWorkflowUpdateSchema = articleWorkflowUpdateSchema.extend({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
});

const savedFeedViewFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  sourceId: z.string().regex(/^\d+$/).optional(),
  sourceName: z.string().max(200).optional(),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  category: z.string().max(80).optional(),
  priority: z.string().max(80).optional(),
  province: z.string().max(80).optional(),
  workflowStatus: z.string().max(80).optional(),
  manualTag: z.string().max(80).optional(),
  relevanceStatus: z.enum(ARTICLE_RELEVANCE_STATUSES).optional(),
  workspaceId: z.coerce.number().int().positive().optional(),
  includeContextual: z.boolean().optional(),
  includeNeedsReview: z.boolean().optional(),
  includeNotRelevant: z.boolean().optional(),
  sourceType: z.string().max(60).optional(),
  dateRange: z.enum(["all", "today", "week", "month"]).optional(),
  sort: z.enum(["newest", "oldest", "recently_added", "source_az", "title_az", "engagement"]).optional(),
}).strict();

const savedFeedViewInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  filters: savedFeedViewFiltersSchema,
  isShared: z.boolean().optional(),
}).strict();

const ALERT_RULE_TYPES = ["keyword", "source", "category", "province", "combined"] as const;
const ALERT_SEVERITIES = ["low", "medium", "high", "critical"] as const;

const optionalTrimmedText = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return value;
    const text = String(value).trim().replace(/\s+/g, " ");
    return text ? text : null;
  }, z.string().max(max).nullable().optional());

const optionalPositiveInt = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return null;
  return value;
}, z.coerce.number().int().positive().nullable().optional());

function booleanQuery(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return booleanQuery(value[0]);
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function relevanceQueryStatuses(value: unknown): ArticleRelevanceStatus[] | undefined {
  return normalizeRelevanceStatusFilter(value);
}

const alertRuleBaseInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: optionalTrimmedText(500),
  ruleType: z.enum(ALERT_RULE_TYPES).default("keyword"),
  searchTerm: optionalTrimmedText(160),
  sourceId: optionalPositiveInt,
  sourceType: optionalTrimmedText(60),
  category: optionalTrimmedText(80),
  province: optionalTrimmedText(80),
  severity: z.enum(ALERT_SEVERITIES).default("medium"),
  active: z.boolean().default(true),
  notifyInApp: z.boolean().default(true),
  matchWindowHours: z.coerce.number().int().min(1).max(720).default(24),
}).strict();

const alertRuleUpdateInputSchema = alertRuleBaseInputSchema.partial();

type AlertRuleInput = z.infer<typeof alertRuleBaseInputSchema>;
type AlertRuleUpdateInput = z.infer<typeof alertRuleUpdateInputSchema>;
const TASK_STATUSES = ["open", "in_progress", "resolved"] as const;
const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const TASK_TARGET_TYPES = ["article", "story", "report", "timeline", "workspace", "task"] as const;

const optionalTaskTargetType = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim();
}, z.enum(TASK_TARGET_TYPES).nullable().optional());

const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: optionalTrimmedText(1000),
  assignedTo: optionalPositiveInt,
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  dueDate: optionalTrimmedText(40),
  workspaceId: optionalPositiveInt,
  relatedTargetType: optionalTaskTargetType,
  relatedTargetId: optionalPositiveInt,
}).strict();

const taskUpdateInputSchema = taskInputSchema.extend({
  status: z.enum(TASK_STATUSES).optional(),
}).partial();

const REPORT_STATUSES = ["draft", "review", "published", "archived"] as const;
const BRIEFING_ITEM_TYPES = ["article", "note", "heading", "link"] as const;

const sharedReportInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  summary: optionalTrimmedText(2000),
  status: z.enum(REPORT_STATUSES).default("draft"),
  workspaceId: optionalPositiveInt,
}).strict();

const sharedReportUpdateInputSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  summary: optionalTrimmedText(2000),
  status: z.enum(REPORT_STATUSES).optional(),
  workspaceId: optionalPositiveInt,
}).strict();

const briefingItemInputSchema = z.object({
  itemType: z.enum(BRIEFING_ITEM_TYPES),
  itemRefId: optionalPositiveInt,
  content: optionalTrimmedText(5000),
  position: z.coerce.number().int().min(0).max(10000).default(0),
}).strict();

const TEMPLATE_ITEM_TYPES = ["heading", "note", "link"] as const;
const briefingTemplateSectionSchema = z.object({
  itemType: z.enum(TEMPLATE_ITEM_TYPES).default("heading"),
  content: z.string().trim().min(1).max(1000),
  position: z.coerce.number().int().min(0).max(10000).optional(),
}).strict();

const briefingTemplateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: optionalTrimmedText(1000),
  sections: z.array(briefingTemplateSectionSchema).min(1).max(30),
}).strict();

const briefingFromTemplateInputSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  title: z.string().trim().min(2).max(160).optional(),
  summary: optionalTrimmedText(2000),
}).strict();

const templateFromReportInputSchema = z.object({
  reportId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(120).optional(),
  description: optionalTrimmedText(1000),
}).strict();

const BRIEFING_DELIVERY_FREQUENCIES = ["realtime", "daily", "weekly", "monthly"] as const;

const normalizedTopicListSchema = z.preprocess((value) => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const raw of rawValues) {
    const topic = String(raw || "").trim().replace(/\s+/g, " ");
    const key = topic.toLowerCase();
    if (!topic || seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
  }
  return topics;
}, z.array(z.string().min(1).max(80)).max(30).default([]));

const normalizedEmailListSchema = z.preprocess((value) => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]+/)
      : [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const raw of rawValues) {
    const email = String(raw || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}, z.array(z.string().email().max(254)).max(50).optional());

const briefingScheduleConfigSchema = z.object({
  label: optionalTrimmedText(120),
  recipients: normalizedEmailListSchema,
  deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("08:00"),
  timezone: z.string().trim().min(2).max(80).default("Asia/Baghdad"),
  dayOfWeek: z.coerce.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  reportId: optionalPositiveInt,
  templateId: optionalPositiveInt,
  notes: optionalTrimmedText(1000),
}).strict();

const emailSubscriptionInputSchema = z.object({
  email: z.string().trim().email().max(254),
  topics: normalizedTopicListSchema,
  frequency: z.enum(BRIEFING_DELIVERY_FREQUENCIES).default("daily"),
  sendAlerts: z.boolean().default(true),
  sendBriefing: z.boolean().default(true),
  sendWeeklySummary: z.boolean().default(false),
  customSchedule: briefingScheduleConfigSchema.nullable().optional(),
  active: z.boolean().default(true),
}).strict();

const emailSubscriptionUpdateSchema = emailSubscriptionInputSchema.partial();
const briefingScheduleInputSchema = emailSubscriptionInputSchema.extend({
  sendAlerts: z.boolean().default(false),
  sendBriefing: z.boolean().default(true),
});
const briefingScheduleUpdateSchema = briefingScheduleInputSchema.partial();

type BriefingScheduleConfig = z.infer<typeof briefingScheduleConfigSchema>;

function withNormalizedScheduleRecipients<T extends { email?: string; customSchedule?: BriefingScheduleConfig | null }>(input: T): T {
  if (!input.email || !input.customSchedule) return input;
  const recipients = Array.from(new Set([
    input.email.trim().toLowerCase(),
    ...(input.customSchedule.recipients || []).map(email => email.trim().toLowerCase()),
  ].filter(Boolean)));
  return {
    ...input,
    customSchedule: {
      ...input.customSchedule,
      recipients,
    },
  };
}

async function validateBriefingScheduleTarget(config: BriefingScheduleConfig | null | undefined, clientId: number, res: Response): Promise<boolean> {
  if (!config) return true;
  if (config.reportId && config.templateId) {
    res.status(400).json({ message: "Choose either a briefing or a template, not both" });
    return false;
  }
  if (config.reportId) {
    const report = await storage.getSharedReport(config.reportId);
    if (!report || report.clientId !== clientId || report.status === "template") {
      safeNotFound(res);
      return false;
    }
  }
  if (config.templateId) {
    const template = await storage.getSharedReport(config.templateId);
    if (!template || template.clientId !== clientId || template.status !== "template") {
      safeNotFound(res);
      return false;
    }
  }
  return true;
}

function filterDeliveryResultsForClient(result: any, clientId: number) {
  const results = Array.isArray(result?.results)
    ? result.results.filter((item: any) => Number(item?.clientId) === clientId)
      .map((item: any) => {
        const recipients = Array.isArray(item?.recipients)
          ? item.recipients.map((email: unknown) => String(email || "").trim()).filter(Boolean)
          : [];
        const recipientCount = Number(item?.recipientCount) || recipients.length || (item?.email ? 1 : 0);
        return {
          scheduleId: Number(item?.scheduleId) || null,
          clientId,
          email: String(item?.email || ""),
          scheduleLabel: item?.scheduleLabel ? String(item.scheduleLabel) : null,
          recipients,
          recipientCount,
          status: String(item?.status || "unknown"),
          subject: item?.subject ? String(item.subject) : null,
          sourceType: item?.sourceType ? String(item.sourceType) : null,
          itemCount: Number(item?.itemCount) || 0,
          articleCount: Number(item?.articleCount) || 0,
          providerMessageId: item?.providerMessageId ? String(item.providerMessageId) : null,
          error: item?.error ? String(item.error).slice(0, 500) : null,
        };
      })
    : [];
  return {
    checked: results.length,
    sent: results.filter((item: any) => item.status === "sent").length,
    dryRun: results.filter((item: any) => item.status === "dry_run").length,
    skipped: results.filter((item: any) => item.status === "not_due").length,
    providerMissing: results.filter((item: any) => item.status === "provider_not_configured").length,
    failed: results.filter((item: any) => item.status === "failed").length,
    totalRecipients: results.reduce((total: number, item: any) => total + (Number(item.recipientCount) || 0), 0),
    totalItems: results.reduce((total: number, item: any) => total + (Number(item.itemCount) || 0), 0),
    totalArticles: results.reduce((total: number, item: any) => total + (Number(item.articleCount) || 0), 0),
    results,
  };
}

function formatDeliveryHistoryJob(job: typeof processingJobs.$inferSelect, clientId: number) {
  const payload = (job.payload || {}) as any;
  const rawResult = (job.result || {}) as any;
  const result = filterDeliveryResultsForClient(rawResult, clientId);
  const ownsPayload = Number(payload.clientId) === clientId;
  if (!ownsPayload && result.results.length === 0) return null;
  const scheduleIds = Array.from(new Set(result.results.map((item: any) => item.scheduleId).filter(Boolean)));
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : null;
  const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : null;

  return {
    id: job.id,
    status: job.status,
    dryRun: Boolean(payload.dryRun),
    force: Boolean(payload.force),
    manual: Boolean(payload.manual),
    scheduleId: payload.scheduleId || (scheduleIds.length === 1 ? scheduleIds[0] : null),
    scheduleIds,
    provider: rawResult.provider || null,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    runAt: job.runAt,
    durationMs: startedAt && completedAt ? Math.max(0, completedAt - startedAt) : null,
    error: job.lastError,
    summary: result,
  };
}

function parseTaskDueDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid due date");
  }
  return date;
}

function normalizeTaskPayload(input: z.infer<typeof taskInputSchema> | z.infer<typeof taskUpdateInputSchema>) {
  const dueDate = parseTaskDueDate(input.dueDate);
  const output: Record<string, unknown> = { ...input };
  if (dueDate !== undefined) output.dueDate = dueDate;
  if (output.relatedTargetType === null) output.relatedTargetType = null;
  if (output.relatedTargetId === null) output.relatedTargetId = null;
  return output;
}

function validateAlertRuleInput(input: Partial<AlertRuleInput>): string | null {
  if (input.category && !isArticleCategoryCode(input.category)) {
    return `Invalid category. Use one of: ${ARTICLE_CATEGORIES.map(item => item.code).join(", ")}`;
  }
  if (input.province && !isIraqProvinceCode(input.province)) {
    return `Invalid province. Use one of: ${IRAQ_PROVINCES.map(item => item.code).join(", ")}`;
  }
  if (!input.searchTerm && !input.sourceId && !input.sourceType && !input.category && !input.province) {
    return "At least one alert condition is required";
  }
  return null;
}

function buildAlertFeedUrl(rule: Pick<AlertRule, "searchTerm" | "sourceId" | "sourceType" | "category" | "province" | "matchWindowHours">): string {
  const params = new URLSearchParams();
  params.set("sort", "newest");
  params.set("startDate", new Date(Date.now() - rule.matchWindowHours * 60 * 60 * 1000).toISOString());
  if (rule.searchTerm) params.set("search", rule.searchTerm);
  if (rule.sourceId) params.set("sourceId", String(rule.sourceId));
  if (rule.sourceType) params.set("sourceType", rule.sourceType);
  if (rule.category) params.set("category", rule.category);
  if (rule.province) params.set("province", rule.province);
  return `/feed?${params.toString()}`;
}

function buildAlertArticleParams(rule: AlertRule, clientId: number, scopedSourceIds: number[] | undefined, limit: number) {
  return {
    search: rule.searchTerm || undefined,
    sourceId: rule.sourceId || undefined,
    sourceIds: scopedSourceIds,
    clientId,
    sort: "newest" as const,
    sourceType: rule.sourceType || undefined,
    category: rule.category || undefined,
    province: rule.province || undefined,
    startDate: new Date(Date.now() - rule.matchWindowHours * 60 * 60 * 1000).toISOString(),
    page: 1,
    limit,
  };
}

function normalizeManualTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawTag of tags) {
    const tag = String(rawTag || "").trim().replace(/\s+/g, " ");
    if (!tag || tag.length > 40) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }
  return normalized;
}

function buildArticleWorkflowUpdates(input: z.infer<typeof articleWorkflowUpdateSchema>): Record<string, any> {
  const updates: Record<string, any> = {};

  if ("category" in input) {
    const category = input.category?.trim();
    if (!category) {
      updates.category = "other";
    } else if (!isArticleCategoryCode(category)) {
      throw new Error(`Invalid category. Use one of: ${ARTICLE_CATEGORIES.map(item => item.code).join(", ")}`);
    } else {
      updates.category = category;
    }
  }

  if ("priority" in input) {
    const priority = input.priority?.trim() || "routine";
    if (!isArticlePriorityCode(priority)) {
      throw new Error(`Invalid priority. Use one of: ${ARTICLE_PRIORITIES.map(item => item.code).join(", ")}`);
    }
    updates.priority = priority;
  }

  if ("province" in input) {
    const province = input.province?.trim();
    if (!province || province === "none") {
      updates.province = null;
    } else if (!isIraqProvinceCode(province)) {
      throw new Error(`Invalid province. Use one of: ${IRAQ_PROVINCES.map(item => item.code).join(", ")}`);
    } else {
      updates.province = province;
    }
  }

  if ("workflowStatus" in input) {
    const workflowStatus = input.workflowStatus?.trim() || "new";
    if (!isArticleWorkflowStatusCode(workflowStatus)) {
      throw new Error(`Invalid workflow status. Use one of: ${ARTICLE_WORKFLOW_STATUSES.map(item => item.code).join(", ")}`);
    }
    updates.workflowStatus = workflowStatus;
  }

  if ("manualTags" in input) {
    updates.manualTags = normalizeManualTags(input.manualTags) || [];
  }

  return updates;
}

function normalizeSavedFeedViewFilters(input: z.infer<typeof savedFeedViewFiltersSchema>): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) filters[key] = trimmed;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      filters[key] = value;
    } else if (typeof value === "boolean") {
      filters[key] = value;
    }
  }

  if (typeof filters.category === "string" && !isArticleCategoryCode(filters.category)) {
    throw new Error(`Invalid category. Use one of: ${ARTICLE_CATEGORIES.map(item => item.code).join(", ")}`);
  }
  if (typeof filters.priority === "string" && !isArticlePriorityCode(filters.priority)) {
    throw new Error(`Invalid priority. Use one of: ${ARTICLE_PRIORITIES.map(item => item.code).join(", ")}`);
  }
  if (typeof filters.province === "string" && !isIraqProvinceCode(filters.province)) {
    throw new Error(`Invalid province. Use one of: ${IRAQ_PROVINCES.map(item => item.code).join(", ")}`);
  }
  if (typeof filters.workflowStatus === "string" && !isArticleWorkflowStatusCode(filters.workflowStatus)) {
    throw new Error(`Invalid workflow status. Use one of: ${ARTICLE_WORKFLOW_STATUSES.map(item => item.code).join(", ")}`);
  }

  return filters;
}

async function validateSavedFeedViewWorkspace(filters: Record<string, unknown>, clientId: number, res: any): Promise<boolean> {
  const workspaceId = typeof filters.workspaceId === "number"
    ? filters.workspaceId
    : typeof filters.workspaceId === "string"
      ? Number(filters.workspaceId)
      : null;
  if (!workspaceId) return true;
  return Boolean(await getWorkspaceForTenantOrNotFound(workspaceId, clientId, res));
}
const ALLOWED_SYSTEM_SETTING_KEYS = new Set(Object.keys(SYSTEM_SETTING_DEFAULTS));

function sourceTypeSupportsCollectorConfig(type: string): boolean {
  return type === "website" || CONFIGURABLE_SOCIAL_FEED_SOURCE_TYPES.has(type);
}

function buildImportedFeedCollectorConfig(classified: ClassifiedFeedImportRow) {
  const xmlUrl = classified.xmlUrl?.trim();
  if (!xmlUrl || !/^https?:\/\/rss\.app\/feeds\//i.test(xmlUrl)) return null;
  if (!sourceTypeSupportsCollectorConfig(classified.type)) return null;
  return normalizeWebsiteCollectorConfig({
    strategy: "rss",
    feedUrl: xmlUrl,
    renderJavascript: false,
  });
}

const workerMiddleware = (_req: any, _res: any, next: any) => next();
const apiLimiter = process.env.CF_WORKER === "1"
  ? workerMiddleware
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Too many requests, please try again later." },
    });

const authLimiter = process.env.CF_WORKER === "1"
  ? workerMiddleware
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Too many login attempts, please try again later." },
    });

function sanitizeInput(text: string | undefined): string {
  if (!text) return "";
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).trim();
}

function systemSettingsWithDefaults(settings: Record<string, string>): Record<string, string> {
  return { ...SYSTEM_SETTING_DEFAULTS, ...settings };
}

function booleanSetting(settings: Record<string, string>, key: string): boolean {
  return String(settings[key] ?? SYSTEM_SETTING_DEFAULTS[key] ?? "false").toLowerCase() === "true";
}

function numberSetting(settings: Record<string, string>, key: string, min: number, max: number): number {
  const fallback = Number(SYSTEM_SETTING_DEFAULTS[key] ?? min);
  const parsed = Number(settings[key] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function buildClientSettingsPayload(client: any, settings: any) {
  const embassyProfile = buildClientEmbassyProfile(client, settings);
  return {
    clientId: client.id,
    clientName: client.name,
    defaultLanguage: client.defaultLanguage || "en",
    feedLiveUpdateEnabled: settings?.feedLiveUpdateEnabled ?? CLIENT_SETTING_DEFAULTS.feedLiveUpdateEnabled,
    feedLiveUpdateIntervalSeconds: settings?.feedLiveUpdateIntervalSeconds ?? CLIENT_SETTING_DEFAULTS.feedLiveUpdateIntervalSeconds,
    feedLiveUpdateMode: settings?.feedLiveUpdateMode || CLIENT_SETTING_DEFAULTS.feedLiveUpdateMode,
    defaultFeedDateRange: settings?.defaultFeedDateRange || CLIENT_SETTING_DEFAULTS.defaultFeedDateRange,
    defaultArticleRetentionDays: settings?.defaultArticleRetentionDays ?? CLIENT_SETTING_DEFAULTS.defaultArticleRetentionDays,
    defaultSourceIntervalMinutes: settings?.defaultSourceIntervalMinutes ?? CLIENT_SETTING_DEFAULTS.defaultSourceIntervalMinutes,
    defaultMaxArticlesPerFetch: settings?.defaultMaxArticlesPerFetch ?? CLIENT_SETTING_DEFAULTS.defaultMaxArticlesPerFetch,
    autoTranslationEnabled: settings?.autoTranslationEnabled ?? CLIENT_SETTING_DEFAULTS.autoTranslationEnabled,
    defaultTargetLanguage: settings?.defaultTargetLanguage || client.defaultLanguage || CLIENT_SETTING_DEFAULTS.defaultTargetLanguage,
    reportExportFormat: settings?.reportExportFormat || CLIENT_SETTING_DEFAULTS.reportExportFormat,
    reportIncludeSummaries: settings?.reportIncludeSummaries ?? CLIENT_SETTING_DEFAULTS.reportIncludeSummaries,
    representedCountryCode: settings?.representedCountryCode ?? embassyProfile?.representedCountryCode ?? embassyProfile?.homeCountryCode ?? null,
    hostCountryCode: settings?.hostCountryCode ?? null,
    headquartersCountryCode: settings?.headquartersCountryCode ?? null,
    defaultTimezone: settings?.defaultTimezone ?? null,
    defaultLanguages: settings?.defaultLanguages ?? [],
    websiteUrl: settings?.websiteUrl ?? null,
    contactName: settings?.contactName ?? null,
    contactEmail: settings?.contactEmail ?? null,
    homeCountryCode: settings?.homeCountryCode ?? embassyProfile?.homeCountryCode ?? null,
    homeCountryName: settings?.homeCountryName ?? embassyProfile?.homeCountryName ?? null,
    homeCountryAliases: settings?.homeCountryAliases ?? embassyProfile?.homeCountryAliases ?? [],
    embassyAliases: settings?.embassyAliases ?? embassyProfile?.embassyAliases ?? [],
    ambassadorAliases: settings?.ambassadorAliases ?? embassyProfile?.ambassadorAliases ?? [],
    bilateralCategoryLabel: settings?.bilateralCategoryLabel ?? embassyProfile?.bilateralCategoryLabel ?? null,
    embassyProfile,
    updatedAt: settings?.updatedAt || null,
  };
}

function publicSystemSettings(settings: Record<string, string>, clientSettings?: any, client?: any) {
  const withDefaults = systemSettingsWithDefaults(settings);
  const rawMode = clientSettings?.feedLiveUpdateMode || withDefaults.feedLiveUpdateMode;
  const mode = rawMode === "auto_load" ? "auto_load" : "notify";
  const rawDateRange = clientSettings?.defaultFeedDateRange || CLIENT_SETTING_DEFAULTS.defaultFeedDateRange;
  const defaultFeedDateRange = ["all", "today", "week", "month"].includes(rawDateRange) ? rawDateRange : "all";
  const embassyProfile = buildClientEmbassyProfile(client, clientSettings);
  return {
    feedLiveUpdateEnabled: clientSettings?.feedLiveUpdateEnabled ?? booleanSetting(withDefaults, "feedLiveUpdateEnabled"),
    feedLiveUpdateIntervalSeconds: clientSettings?.feedLiveUpdateIntervalSeconds ?? numberSetting(withDefaults, "feedLiveUpdateIntervalSeconds", 15, 300),
    feedLiveUpdateMode: mode,
    defaultFeedDateRange,
    defaultSourceIntervalMinutes: clientSettings?.defaultSourceIntervalMinutes ?? CLIENT_SETTING_DEFAULTS.defaultSourceIntervalMinutes,
    defaultMaxArticlesPerFetch: clientSettings?.defaultMaxArticlesPerFetch ?? CLIENT_SETTING_DEFAULTS.defaultMaxArticlesPerFetch,
    defaultArticleRetentionDays: clientSettings?.defaultArticleRetentionDays ?? CLIENT_SETTING_DEFAULTS.defaultArticleRetentionDays,
    embassyProfile,
  };
}

const ROLE_HIERARCHY: Record<string, number> = {
  [SYSTEM_ROLES.SYSTEM_ADMIN]: 100,
  [SYSTEM_ROLES.CLIENT_ADMIN]: 50,
  [SYSTEM_ROLES.CLIENT_USER]: 20,
  [SYSTEM_ROLES.READONLY_USER]: 10,
};

function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

function getUserScope(user: any): "platform" | "tenant" {
  if (user?.userScope === "platform" || user?.user_scope === "platform") return "platform";
  if (user?.userScope === "tenant" || user?.user_scope === "tenant") return "tenant";
  return user?.role === SYSTEM_ROLES.SYSTEM_ADMIN && (user?.clientId === null || user?.client_id === null) ? "platform" : "tenant";
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isPlatformUser(user: any): boolean {
  return getUserScope(user) === "platform";
}

function isSystemAdmin(user: any): boolean {
  return isPlatformUser(user) && user.role === SYSTEM_ROLES.SYSTEM_ADMIN;
}

function isClientAdmin(user: any): boolean {
  return user.role === SYSTEM_ROLES.CLIENT_ADMIN;
}

function isReadonly(user: any): boolean {
  return user.role === SYSTEM_ROLES.READONLY_USER;
}

interface TenantContext {
  tenantId: number | null;
  effectiveUser: any;
  isImpersonating: boolean;
  originalUserId: number | null;
}

function resolveTenantContext(user: any, req: any): TenantContext {
  const impersonation = req.session?.impersonation;

  if (isSystemAdmin(user) && impersonation?.isImpersonating && impersonation.activeOrganizationId) {
    return {
      tenantId: impersonation.activeOrganizationId,
      effectiveUser: user,
      isImpersonating: true,
      originalUserId: impersonation.originalUserId || user.id,
    };
  }

  if (isSystemAdmin(user) && req.session?.selectedTenantId) {
    return {
      tenantId: req.session.selectedTenantId,
      effectiveUser: user,
      isImpersonating: false,
      originalUserId: null,
    };
  }

  if (isSystemAdmin(user)) {
    return {
      tenantId: null,
      effectiveUser: user,
      isImpersonating: false,
      originalUserId: null,
    };
  }

  return {
    tenantId: user.clientId || null,
    effectiveUser: user,
    isImpersonating: false,
    originalUserId: null,
  };
}

function resolveClientId(user: any, req?: any): number | null {
  const ctx = resolveTenantContext(user, req || {});
  return ctx.tenantId;
}

function requireRole(minRole: string) {
  return (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const userLevel = getRoleLevel(user.role);
    const requiredLevel = getRoleLevel(minRole);
    if (userLevel < requiredLevel) {
      return res.status(403).json({ message: "Insufficient role permissions" });
    }
    next();
  };
}

function requireSystemAdmin() {
  return (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!isSystemAdmin(user)) {
      return res.status(403).json({ message: "Platform admin access required" });
    }
    next();
  };
}

function requireTenantAccess() {
  return (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const ctx = resolveTenantContext(user, req);
    if (ctx.tenantId === null && !isSystemAdmin(user)) {
      return res.status(403).json({ message: "No organization assigned" });
    }
    (req as any).tenantContext = ctx;
    next();
  };
}

function requireWriteAccess() {
  return (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (isReadonly(user)) {
      return res.status(403).json({ message: "Read-only users cannot modify data" });
    }
    next();
  };
}

const PLATFORM_ADMIN_CAPS = [
  CAPS.ADMIN_SYSTEM_DASHBOARD,
  CAPS.ADMIN_TENANT_SWITCH,
  CAPS.ADMIN_IMPERSONATE,
  CAPS.ADMIN_AUDIT_LOGS,
  CAPS.ADMIN_OPERATIONS,
  CAPS.ADMIN_JOB_MONITOR,
  CAPS.ADMIN_PRODUCT_ANALYTICS,
  CAPS.INTEGRATION_MONITOR_VIEW,
  CAPS.SOURCE_HEALTH_VIEW,
];

async function resolveUserCaps(user: any): Promise<string[]> {
  if (isSystemAdmin(user)) {
    return PLATFORM_ADMIN_CAPS;
  }
  const client = user.clientId ? await storage.getClient(user.clientId) : null;
  const aiEnabled = client?.aiEnabled || false;
  const planTier = (client?.planTier as any) || "starter";
  return resolveEffectiveCaps(
    user.role,
    user.userType || "reader",
    planTier,
    aiEnabled,
    user.capabilities || [],
  );
}

async function canAccessRelevanceReview(user: any, req: Request): Promise<boolean> {
  if (isSystemAdmin(user)) {
    const ctx = resolveTenantContext(user, req);
    if (!ctx.tenantId) return true;
    return resolveEffectiveCaps(
      user.role,
      user.userType || null,
      "enterprise",
      true,
      user.capabilities || null,
    ).includes(CAPS.ARTICLE_EDIT);
  }
  const userCaps = await resolveUserCaps(user);
  return userCaps.includes(CAPS.ARTICLE_EDIT);
}

function requireCapability(...caps: string[]) {
  return async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      let userCaps: string[];
      if (isSystemAdmin(user)) {
        const ctx = resolveTenantContext(user, req);
        userCaps = ctx.tenantId
          ? resolveEffectiveCaps(
              user.role,
              user.userType || null,
              "enterprise",
              true,
              user.capabilities || null,
            )
          : PLATFORM_ADMIN_CAPS;
      } else {
        userCaps = await resolveUserCaps(user);
      }
      const hasRequired = caps.some(c => userCaps.includes(c));
      if (!hasRequired) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      next();
    } catch (e) {
      return res.status(500).json({ message: "Permission check failed" });
    }
  };
}

function requireAiEnabled() {
  return async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      const clientId = resolveClientId(user, req);
      const client = clientId ? await storage.getClient(clientId) : null;
      if (!client || !client.aiEnabled) {
        return res.status(400).json({ message: "AI features are not enabled for your organization" });
      }
      next();
    } catch (e) {
      return res.status(500).json({ message: "AI enablement check failed" });
    }
  };
}

function getSourceLogoUrl(sourceUrl: string, sourceName?: string): string | null {
  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
    const socialPlatforms = ["youtube.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "t.me", "telegram.org", "reddit.com", "linkedin.com", "tiktok.com"];
    const isSocial = socialPlatforms.some(p => hostname.includes(p));
    if (isSocial && sourceName) {
      const brandDomain = sourceName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
      return `https://www.google.com/s2/favicons?sz=128&domain=${brandDomain}`;
    }
    return `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`;
  } catch {
    return null;
  }
}

function requireClientId(user: any, req: any, res: any): number | false {
  const cid = resolveClientId(user, req);
  if (cid === null && !isSystemAdmin(user)) {
    res.status(403).json({ message: "No organization assigned" });
    return false;
  }
  return cid as number;
}

async function getUsersForTenantScope(user: any, req: any, includeSystemAdmins = false) {
  const clientId = resolveClientId(user, req);
  if (clientId) {
    const users = await storage.getUsersByClientId(clientId);
    return includeSystemAdmins ? users : users.filter((u: any) => !isPlatformUser(u));
  }
  if (isSystemAdmin(user)) {
    const users = await storage.getUsers();
    return users.filter((u: any) => isPlatformUser(u));
  }
  return [];
}

async function getScopedUserOrNotFound(targetUserId: number, currentUser: any, req: any, res: any) {
  const targetUser = await storage.getUser(targetUserId);
  if (!targetUser) {
    safeNotFound(res);
    return null;
  }

  const clientId = resolveClientId(currentUser, req);
  if (clientId && targetUser.clientId !== clientId) {
    safeNotFound(res);
    return null;
  }
  if (isSystemAdmin(currentUser) && !clientId && !isPlatformUser(targetUser)) {
    safeNotFound(res);
    return null;
  }
  if (!isSystemAdmin(currentUser) && isPlatformUser(targetUser)) {
    safeNotFound(res);
    return null;
  }
  if (!isSystemAdmin(currentUser) && (!clientId || targetUser.clientId !== clientId)) {
    safeNotFound(res);
    return null;
  }

  return targetUser;
}

async function getAdminManagedUserOrNotFound(targetUserId: number, res: any) {
  const targetUser = await storage.getUser(targetUserId);
  if (!targetUser) {
    safeNotFound(res);
    return null;
  }

  return targetUser;
}

function requireTenantContext(user: any, req: any, res: any): number | null {
  const clientId = resolveClientId(user, req);
  if (!clientId) {
    res.status(400).json({ message: "Tenant context required" });
    return null;
  }
  return clientId;
}

async function getWorkspaceForTenantOrNotFound(workspaceId: number | undefined, clientId: number, res: any) {
  if (!workspaceId) return null;
  const workspace = await storage.getWorkspace(workspaceId);
  if (!workspace || workspace.clientId !== clientId) {
    safeNotFound(res);
    return undefined;
  }
  return workspace;
}

async function getWorkspaceForAuthenticatedScope(workspaceId: number, user: any, req: any, res: any) {
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    res.status(400).json({ message: "Invalid workspace ID" });
    return null;
  }
  const workspace = await storage.getWorkspace(workspaceId);
  const clientId = resolveClientId(user, req);
  const access = validateWorkspaceTenantAccess({
    workspaceExists: Boolean(workspace),
    workspaceClientId: workspace?.clientId,
    clientId,
    isSystemAdmin: isSystemAdmin(user),
  });
  if (!access.allowed) {
    if (access.status === 403) {
      res.status(403).json({ message: access.reason });
    } else {
      safeNotFound(res);
    }
    return null;
  }
  return workspace;
}

type WorkspaceArticleQueryScope = {
  workspaceId?: number;
  relevanceStatuses?: ArticleRelevanceStatus[];
  includeContextual?: boolean;
};

function toWorkspaceAnalyticsScope(clientId: number | null, scope: WorkspaceArticleQueryScope | null | undefined) {
  if (!scope?.workspaceId) return undefined;
  return {
    clientId: clientId || undefined,
    workspaceId: scope.workspaceId,
    relevanceStatuses: scope.relevanceStatuses,
  };
}

async function resolveWorkspaceArticleQueryScope(
  user: any,
  req: any,
  res: any,
  options: { requireWorkspace?: boolean } = {},
): Promise<WorkspaceArticleQueryScope | null> {
  const rawWorkspaceId = req.query?.workspaceId ?? req.body?.workspaceId;
  const parsedWorkspaceId = parseWorkspaceIdInput(rawWorkspaceId);
  if (parsedWorkspaceId.error) {
    res.status(400).json({ message: parsedWorkspaceId.error });
    return null;
  }

  const includeContextual = booleanQuery(req.query?.includeContextual ?? req.body?.includeContextual) === true;
  const includeNeedsReview = booleanQuery(req.query?.includeNeedsReview ?? req.body?.includeNeedsReview) === true;
  const includeNotRelevant = booleanQuery(req.query?.includeNotRelevant ?? req.body?.includeNotRelevant) === true;
  const explicitStatuses = relevanceQueryStatuses(req.query?.relevanceStatuses ?? req.body?.relevanceStatuses);
  const singleStatus = isArticleRelevanceStatus(req.query?.relevanceStatus ?? req.body?.relevanceStatus)
    ? req.query?.relevanceStatus ?? req.body?.relevanceStatus
    : undefined;
  const requestedStatuses = explicitStatuses || (singleStatus ? [singleStatus] : undefined);
  const statusFilterRequested = Boolean(
    requestedStatuses?.length ||
    includeContextual ||
    includeNeedsReview ||
    includeNotRelevant
  );

  if (!parsedWorkspaceId.supplied) {
    if (options.requireWorkspace) {
      res.status(400).json({ message: "Valid workspaceId required" });
      return null;
    }
    if (!statusFilterRequested) return {};
  }

  const statusAccess = resolveRelevanceStatusAccess({
    requestedStatuses,
    includeContextual,
    includeNeedsReview,
    includeNotRelevant,
    isReviewer: await canAccessRelevanceReview(user, req),
  });
  if (!statusAccess.allowed) {
    res.status(statusAccess.status).json({ message: statusAccess.reason });
    return null;
  }

  if (!parsedWorkspaceId.supplied) {
    return {
      relevanceStatuses: statusAccess.statuses,
      includeContextual,
    };
  }

  const workspaceId = parsedWorkspaceId.workspaceId;
  if (!workspaceId) {
    res.status(400).json({ message: "workspaceId must be a positive integer" });
    return null;
  }
  const workspace = await getWorkspaceForAuthenticatedScope(workspaceId, user, req, res);
  if (!workspace) return null;

  return {
    workspaceId: workspace.id,
    relevanceStatuses: statusAccess.statuses,
    includeContextual,
  };
}

async function canReadWorkspaceRelevance(user: any, req: any): Promise<boolean> {
  if (isSystemAdmin(user)) return true;
  const userCaps = await resolveUserCaps(user);
  return userCaps.includes(CAPS.COLLAB_VIEW) || userCaps.includes(CAPS.ARTICLE_VIEW) || userCaps.includes(CAPS.SETTINGS_VIEW);
}

async function canManageWorkspaceRelevance(user: any, req: any): Promise<boolean> {
  if (isSystemAdmin(user)) return true;
  const userCaps = await resolveUserCaps(user);
  return userCaps.includes(CAPS.SETTINGS_MANAGE) || userCaps.includes(CAPS.ARTICLE_EDIT);
}

function workspaceRelevanceProfileFromRecords(workspace: any, profile?: any): WorkspaceProfile {
  return normalizeWorkspaceProfile({
    id: workspace.id,
    clientId: workspace.clientId,
    name: workspace.name,
    description: workspace.description,
    purpose: workspace.purpose,
    scopeMode: workspace.scopeMode,
    globalScope: workspace.globalScope,
    primaryCountryCodes: workspace.primaryCountryCodes || [],
    secondaryCountryCodes: workspace.secondaryCountryCodes || [],
    regionCodes: workspace.regionCodes || [],
    subnationalAreas: workspace.subnationalAreas || [],
    preferredLanguages: workspace.preferredLanguages || [],
    timezone: workspace.timezone,
    taxonomyTemplateCode: workspace.taxonomyTemplateCode,
    relevanceProfileCode: workspace.relevanceProfileCode,
    reportingTemplateCode: workspace.reportingTemplateCode,
    active: workspace.active,
    topics: profile?.topics || [],
    subtopics: profile?.subtopics || [],
    industries: profile?.industries || [],
    entities: profile?.entities || [],
    organizations: profile?.organizations || [],
    people: profile?.people || [],
    projects: profile?.projects || [],
    events: profile?.events || [],
    multilingualAliases: profile?.multilingualAliases || [],
    inclusionTerms: profile?.inclusionTerms || [],
    exclusionTerms: profile?.exclusionTerms || [],
    impactTerms: profile?.impactTerms || [],
    contextualTerms: profile?.contextualTerms || [],
    minimumConfidence: profile?.minimumConfidence ?? 60,
    includeContextualByDefault: profile?.includeContextualByDefault ?? false,
    contextualLabel: profile?.contextualLabel || "Strategic Context",
    profileVersion: profile?.profileVersion ?? 1,
  });
}

function enrollmentFingerprint(enrollment: NormalizedClientEnrollment): string {
  return createHash("sha256").update(stableEnrollmentJson(enrollment)).digest("hex");
}

function safeAuditDetails(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "string" && item.length > 500) return item.slice(0, 500);
    return item;
  });
}

function sendAdminStorageError(res: Response, err: unknown, fallback = "Admin operation failed") {
  if (err instanceof StorageBoundaryError) {
    return res.status(err.status).json({
      message: err.message,
      code: err.code,
      details: err.details,
    });
  }
  const anyErr = err as any;
  if (anyErr?.code === "23505") {
    const constraint = String(anyErr?.constraint || "");
    if (constraint.includes("clients_slug")) {
      return res.status(409).json({ message: "Client slug already exists", code: "duplicate_slug" });
    }
    if (constraint.includes("clients_enrollment_key")) {
      return res.status(409).json({ message: "Enrollment key already exists", code: "duplicate_enrollment_key" });
    }
    if (constraint.includes("workspaces_client_normalized_name")) {
      return res.status(409).json({ message: "Workspace name already exists for this client", code: "duplicate_workspace_name" });
    }
    if (constraint.includes("publisher_profiles_canonical_key")) {
      return res.status(409).json({ message: "Publisher already exists", code: "duplicate_publisher" });
    }
    if (constraint.includes("publisher_profiles_domain_scope_key")) {
      return res.status(409).json({ message: "Publisher primary domain already exists in this scope", code: "duplicate_publisher_domain" });
    }
    if (constraint.includes("publisher_channels_channel_key") || constraint.includes("publisher_channels_normalized_url")) {
      return res.status(409).json({ message: "Publisher channel already exists", code: "duplicate_publisher_channel" });
    }
    if (constraint.includes("client_publisher_selections_client_publisher")) {
      return res.status(409).json({ message: "Client publisher selection already exists", code: "duplicate_client_publisher_selection" });
    }
    if (constraint.includes("publisher_aliases_profile_alias_language")) {
      return res.status(409).json({ message: "Publisher alias already exists", code: "duplicate_publisher_alias" });
    }
    return res.status(409).json({ message: "Duplicate record", code: "duplicate_record" });
  }
  return res.status(500).json({ message: fallback });
}

function parsePositiveId(value: unknown): number | null {
  const text = String(value ?? "");
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

async function getClientOrNotFound(clientId: number, res: Response) {
  if (!Number.isInteger(clientId) || clientId <= 0) {
    res.status(400).json({ message: "Invalid client ID" });
    return null;
  }
  const client = await storage.getClient(clientId);
  if (!client) {
    safeNotFound(res);
    return null;
  }
  return client;
}

async function getAdminWorkspaceOrNotFound(clientId: number, workspaceId: number, res: Response) {
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    res.status(400).json({ message: "Invalid workspace ID" });
    return null;
  }
  const workspace = await storage.getWorkspace(workspaceId);
  if (!workspace || workspace.clientId !== clientId) {
    safeNotFound(res);
    return null;
  }
  return workspace;
}

function currentAssignmentIdentityMatches(assignment: any, profileVersion: number): boolean {
  const latestTest = assignment?.latestTest || null;
  if (!latestTest) return false;
  return latestTest.sourceValidationIdentity === assignment.sourceValidationIdentity
    && latestTest.assignmentConfigIdentity === assignment.assignmentConfigIdentity
    && latestTest.relevanceProfileVersion === profileVersion
    && assignment.relevanceProfileVersion === profileVersion;
}

function summarizeWorkspaceAssignmentReadiness(assignments: any[], profileVersion: number) {
  const activeAssignments = assignments.filter((assignment) => assignment.status !== "archived");
  const hasApprovedWarning = (assignment: any) => Boolean(assignment.warningApprovedAt && assignment.warningApprovalReason);
  const hasPassingResult = (assignment: any) => (
    assignment.testStatus === "passed"
    || (assignment.testStatus === "warning" && hasApprovedWarning(assignment))
  );
  const currentAssignments = activeAssignments.filter((assignment) => currentAssignmentIdentityMatches(assignment, profileVersion));
  const sourceAssignmentsConfigured = currentAssignments.filter((assignment) => (
    ["ready", "active"].includes(String(assignment.status))
    && assignment.sourceId
    && hasPassingResult(assignment)
  )).length;
  const sourceAssignmentTestsPassed = currentAssignments.filter((assignment) => (
    assignment.testStatus === "passed" || assignment.testStatus === "warning"
  )).length;
  const sourceAssignmentTestsStale = activeAssignments.filter((assignment) => (
    assignment.testStatus === "stale" || (assignment.latestTestRunId && !currentAssignmentIdentityMatches(assignment, profileVersion))
  )).length;
  const sourceAssignmentsBlocked = activeAssignments.filter((assignment) => (
    ["untested", "failed", "stale"].includes(String(assignment.testStatus))
    || (assignment.latestTestRunId && !currentAssignmentIdentityMatches(assignment, profileVersion))
    || (assignment.testStatus === "warning" && !hasApprovedWarning(assignment))
  )).length;
  return {
    sourceAssignmentsConfigured,
    sourceAssignmentTestsPassed,
    sourceAssignmentTestsStale,
    sourceAssignmentsBlocked,
  };
}

function buildTechnicalBlockers(input: {
  organizationConfigured: boolean;
  workspaceCount: number;
  relevanceProfilesConfigured: number;
  publisherProfilesConfigured: number;
  sourceChannelsConfigured: number;
  sourceAssignmentsConfigured: number;
  sourceAssignmentTestsPassed: number;
  sourceAssignmentTestsStale: number;
  sourceAssignmentsBlocked: number;
}) {
  return [
    !input.organizationConfigured ? "organization_missing" : null,
    input.workspaceCount === 0 ? "workspace_missing" : null,
    input.relevanceProfilesConfigured === 0 ? "relevance_profile_missing" : null,
    input.publisherProfilesConfigured === 0 ? "publisher_profiles_missing" : null,
    input.sourceChannelsConfigured === 0 ? "source_channels_missing" : null,
    input.sourceAssignmentsConfigured === 0 ? "source_assignments_missing" : null,
    input.sourceAssignmentTestsPassed === 0 ? "source_assignment_tests_missing" : null,
    input.sourceAssignmentTestsStale > 0 ? "source_assignment_tests_stale" : null,
    input.sourceAssignmentsBlocked > 0 ? "source_assignment_tests_failed" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
}

function uniqueBlockers(blockers: string[]) {
  return Array.from(new Set(blockers));
}

async function buildClientReadiness(clientId: number) {
  const [client, settings, workspaceRows] = await Promise.all([
    storage.getClient(clientId),
    storage.getClientSettings(clientId),
    storage.getWorkspaces(clientId),
  ]);
  const publisherCounts = await storage.getClientPublisherReadinessCounts(clientId);
  const profileRows = await Promise.all(workspaceRows.map((workspace) => storage.getWorkspaceRelevanceProfile(workspace.id, clientId)));
  const relevanceProfilesConfigured = profileRows.filter(Boolean).length;
  const organizationConfigured = Boolean(client && settings);
  const activeWorkspaceCount = workspaceRows.filter((workspace: any) => workspace.active !== false && workspace.status === "active").length;
  const activeClient = Boolean(client?.active !== false && client?.lifecycleStatus === "active");
  const workspaceActivationReadiness = await Promise.all(workspaceRows.map((workspace) => buildWorkspaceActivationReadiness(clientId, workspace.id)));
  const technicallyReadyWorkspaceCount = workspaceActivationReadiness.filter((item) => item.technicalReady).length;
  const baseTechnicalBlockers = [
    !organizationConfigured ? "organization_missing" : null,
    workspaceRows.length === 0 ? "workspace_missing" : null,
    publisherCounts.publisherProfilesConfigured === 0 ? "publisher_profiles_missing" : null,
    publisherCounts.sourceChannelsConfigured === 0 ? "source_channels_missing" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const workspaceTechnicalBlockers = workspaceRows.length > 0 && technicallyReadyWorkspaceCount === 0
    ? uniqueBlockers(workspaceActivationReadiness.flatMap((item) => item.technicalBlockers))
      .filter((blocker) => !baseTechnicalBlockers.includes(blocker) && blocker !== "organization_missing" && blocker !== "workspace_missing")
    : [];
  const technicalBlockers = uniqueBlockers([
    ...baseTechnicalBlockers,
    ...workspaceTechnicalBlockers,
    ...(workspaceRows.length > 0 && technicallyReadyWorkspaceCount === 0 && workspaceTechnicalBlockers.length === 0
      ? ["workspace_activation_not_ready"]
      : []),
  ]);
  const lifecycleBlockers = [
    !activeClient ? "client_inactive" : null,
    workspaceRows.length > 0 && activeWorkspaceCount === 0 ? "workspace_inactive" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const technicalReady = technicalBlockers.length === 0;
  const lifecycleReady = activeClient && activeWorkspaceCount > 0;
  const blockers = [...technicalBlockers, ...lifecycleBlockers];
  const clientActivationBlockers = technicalBlockers;
  const workspaceActivationBlockers = [
    ...technicalBlockers,
    ...lifecycleBlockers.filter((blocker) => blocker === "client_inactive"),
  ];
  return {
    organizationConfigured,
    workspaceCount: workspaceRows.length,
    activeWorkspaceCount,
    relevanceProfilesConfigured,
    technicallyReadyWorkspaceCount,
    clientActivationPolicy: "at_least_one_technically_ready_workspace",
    ...publisherCounts,
    technicalReady,
    lifecycleReady,
    monitoringReady: technicalReady && lifecycleReady,
    technicalBlockers,
    lifecycleBlockers,
    clientActivationReady: clientActivationBlockers.length === 0,
    clientActivationBlockers,
    canActivateClient: clientActivationBlockers.length === 0 && !activeClient,
    workspaceActivationReady: workspaceActivationBlockers.length === 0,
    workspaceActivationBlockers,
    blockers,
  };
}

async function buildWorkspaceActivationReadiness(clientId: number, workspaceId: number) {
  const [client, settings, workspaceRow, profile, assignments] = await Promise.all([
    storage.getClient(clientId),
    storage.getClientSettings(clientId),
    storage.getWorkspace(workspaceId),
    storage.getWorkspaceRelevanceProfile(workspaceId, clientId),
    storage.getWorkspaceSourceAssignments(clientId, workspaceId),
  ]);
  const workspace = workspaceRow?.clientId === clientId ? workspaceRow : null;
  const publisherCounts = await storage.getClientPublisherReadinessCounts(clientId);
  const activeClient = Boolean(client?.active !== false && client?.lifecycleStatus === "active");
  const profileVersion = profile?.profileVersion || 1;
  const assignmentCounts = summarizeWorkspaceAssignmentReadiness(assignments, profileVersion);
  const technicalBlockers = buildTechnicalBlockers({
    organizationConfigured: Boolean(client && settings),
    workspaceCount: workspace ? 1 : 0,
    relevanceProfilesConfigured: profile ? 1 : 0,
    publisherProfilesConfigured: publisherCounts.publisherProfilesConfigured,
    sourceChannelsConfigured: publisherCounts.sourceChannelsConfigured,
    ...assignmentCounts,
  });
  const lifecycleBlockers = [
    !activeClient ? "client_inactive" : null,
    workspace && (workspace.active === false || workspace.status !== "active") ? "workspace_inactive" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const workspaceActivationBlockers = [
    ...technicalBlockers,
    ...lifecycleBlockers.filter((blocker) => blocker === "client_inactive"),
  ];
  return {
    organizationConfigured: Boolean(client && settings),
    workspaceCount: workspace ? 1 : 0,
    activeWorkspaceCount: workspace && workspace.active !== false && workspace.status === "active" ? 1 : 0,
    relevanceProfilesConfigured: profile ? 1 : 0,
    publisherProfilesConfigured: publisherCounts.publisherProfilesConfigured,
    sourceChannelsConfigured: publisherCounts.sourceChannelsConfigured,
    ...assignmentCounts,
    technicalReady: technicalBlockers.length === 0,
    lifecycleReady: activeClient && Boolean(workspace && workspace.active !== false && workspace.status === "active"),
    monitoringReady: technicalBlockers.length === 0 && activeClient && Boolean(workspace && workspace.active !== false && workspace.status === "active"),
    technicalBlockers,
    lifecycleBlockers,
    clientActivationReady: false,
    clientActivationBlockers: ["workspace_lifecycle_endpoint_required"],
    canActivateClient: false,
    workspaceActivationReady: workspaceActivationBlockers.length === 0,
    workspaceActivationBlockers,
    canActivateWorkspace: workspaceActivationBlockers.length === 0 && Boolean(workspace && (workspace.active === false || workspace.status !== "active")),
    blockers: [...technicalBlockers, ...lifecycleBlockers],
  };
}

async function buildClientSetupPayload(clientId: number) {
  const [client, settings, workspaceRows, readiness] = await Promise.all([
    storage.getClient(clientId),
    storage.getClientSettings(clientId),
    storage.getWorkspaces(clientId),
    buildClientReadiness(clientId),
  ]);
  const workspacesWithProfiles = await Promise.all(workspaceRows.map(async (workspace) => ({
    ...workspace,
    relevanceProfile: await storage.getWorkspaceRelevanceProfile(workspace.id, clientId) || null,
    activationEligibility: await buildWorkspaceActivationReadiness(clientId, workspace.id),
  })));
  return {
    client,
    organizationProfile: settings || null,
    workspaces: workspacesWithProfiles,
    readiness,
  };
}

async function findClientByEnrollmentKey(enrollmentKey: string) {
  const [client] = await db.select().from(clients).where(eq(clients.enrollmentKey, enrollmentKey));
  return client;
}

async function findClientBySlug(slug: string) {
  const [client] = await db.select().from(clients).where(eq(clients.slug, slug));
  return client;
}

async function buildEnrollmentResult(clientId: number, idempotent = false) {
  const setup = await buildClientSetupPayload(clientId);
  const firstWorkspace = setup.workspaces[0] || null;
  return {
    idempotent,
    client: setup.client,
    organizationProfile: setup.organizationProfile,
    workspace: firstWorkspace,
    relevanceProfile: firstWorkspace?.relevanceProfile || null,
    readiness: setup.readiness,
  };
}

async function createEnrollmentTransaction(enrollment: NormalizedClientEnrollment, fingerprint: string, userId: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`nws360.enrollment.${enrollment.enrollmentKey}`}))`);
    const existingByKey = await tx.select().from(clients).where(eq(clients.enrollmentKey, enrollment.enrollmentKey)).limit(1);
    if (existingByKey[0]) {
      const existing = existingByKey[0];
      if (existing.enrollmentRequestFingerprint === fingerprint) {
        return { clientId: existing.id, idempotent: true };
      }
      const error: any = new Error("Enrollment key already exists for a different request");
      error.status = 409;
      throw error;
    }

    const existingSlug = await tx.select().from(clients).where(eq(clients.slug, enrollment.organization.slug)).limit(1);
    if (existingSlug[0]) {
      const error: any = new Error("Client slug already exists");
      error.status = 409;
      throw error;
    }

    const representedCountry = getCountry(enrollment.organizationContext.representedCountryCode);
    const legacyHomeCountryCode = isDiplomaticOrganizationType(enrollment.organization.organizationType)
      ? enrollment.organizationContext.representedCountryCode
      : null;

    const [client] = await tx.insert(clients).values({
      name: enrollment.organization.name,
      slug: enrollment.organization.slug,
      organizationType: enrollment.organization.organizationType,
      defaultLanguage: enrollment.organization.defaultLanguage,
      active: true,
      lifecycleStatus: "setup",
      enrollmentKey: enrollment.enrollmentKey,
      enrollmentRequestFingerprint: fingerprint,
      allowedRegions: null,
    }).returning();

    const [settings] = await tx.insert(clientSettings).values({
      clientId: client.id,
      representedCountryCode: enrollment.organizationContext.representedCountryCode,
      hostCountryCode: enrollment.organizationContext.hostCountryCode,
      headquartersCountryCode: enrollment.organizationContext.headquartersCountryCode,
      defaultTimezone: enrollment.organizationContext.defaultTimezone,
      defaultLanguages: enrollment.organizationContext.defaultLanguages,
      websiteUrl: enrollment.organization.websiteUrl,
      contactName: enrollment.organization.contactName,
      contactEmail: enrollment.organization.contactEmail,
      homeCountryCode: legacyHomeCountryCode,
      homeCountryName: legacyHomeCountryCode ? representedCountry?.name || legacyHomeCountryCode : null,
      bilateralCategoryLabel: legacyHomeCountryCode === "US" ? "U.S.-Iraq Relations" : null,
    }).returning();

    const [workspace] = await tx.insert(workspaces).values({
      clientId: client.id,
      name: enrollment.workspace.name,
      normalizedName: enrollment.workspace.normalizedName,
      description: enrollment.workspace.description,
      purpose: enrollment.workspace.purpose,
      scopeMode: enrollment.workspace.scopeMode,
      globalScope: enrollment.workspace.globalScope,
      primaryCountryCodes: enrollment.workspace.primaryCountryCodes,
      secondaryCountryCodes: enrollment.workspace.secondaryCountryCodes,
      regionCodes: enrollment.workspace.regionCodes,
      subnationalAreas: enrollment.workspace.subnationalAreas,
      preferredLanguages: enrollment.workspace.preferredLanguages,
      timezone: enrollment.workspace.timezone,
      taxonomyTemplateCode: enrollment.workspace.taxonomyTemplateCode,
      relevanceProfileCode: enrollment.workspace.relevanceProfileCode,
      reportingTemplateCode: enrollment.workspace.reportingTemplateCode,
      status: "draft",
      active: false,
      createdBy: userId,
    }).returning();

    const [profile] = await tx.insert(workspaceRelevanceProfiles).values({
      workspaceId: workspace.id,
      topics: enrollment.relevanceProfile.topics,
      subtopics: enrollment.relevanceProfile.subtopics,
      industries: enrollment.relevanceProfile.industries,
      entities: enrollment.relevanceProfile.entities,
      organizations: enrollment.relevanceProfile.organizations,
      people: enrollment.relevanceProfile.people,
      projects: enrollment.relevanceProfile.projects,
      events: enrollment.relevanceProfile.events,
      multilingualAliases: enrollment.relevanceProfile.multilingualAliases || [],
      inclusionTerms: enrollment.relevanceProfile.inclusionTerms,
      exclusionTerms: enrollment.relevanceProfile.exclusionTerms,
      impactTerms: enrollment.relevanceProfile.impactTerms,
      contextualTerms: enrollment.relevanceProfile.contextualTerms,
      minimumConfidence: enrollment.relevanceProfile.minimumConfidence,
      includeContextualByDefault: enrollment.relevanceProfile.includeContextualByDefault,
      contextualLabel: enrollment.relevanceProfile.contextualLabel,
      active: enrollment.relevanceProfile.active,
    }).returning();

    await tx.insert(adminAuditLogs).values({
      userId,
      action: "client_enrollment",
      entity: "client",
      entityId: client.id,
      clientId: client.id,
      details: safeAuditDetails({
        clientId: client.id,
        workspaceId: workspace.id,
        relevanceProfileId: profile.id,
        settingsId: settings.id,
        lifecycleStatus: "setup",
        workspaceStatus: "draft",
        monitoringActive: false,
      }),
    });

    return { clientId: client.id, idempotent: false };
  });
}

async function ensureUserInTenant(userId: number | undefined, clientId: number, res: any): Promise<boolean> {
  if (!userId) return true;
  const targetUser = await storage.getUser(userId);
  if (!targetUser || targetUser.clientId !== clientId) {
    safeNotFound(res);
    return false;
  }
  return true;
}

async function getUserSourceIds(user: any, req?: any): Promise<number[] | undefined> {
  const clientId = resolveClientId(user, req);
  if (!clientId) return [];
  const tenantSources = await storage.getSources(clientId);
  return tenantSources.map(s => s.id);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  if (process.env.NODE_ENV === "production") {
    app.use("/replit_integrations", (_req, res) => res.sendStatus(404));
    app.use("/api/replit_integrations", (_req, res) => res.sendStatus(404));
  }

  app.get("/api/settings/public", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const [settings, tenantSettings, client] = await Promise.all([
      storage.getSystemSettings(),
      clientId ? storage.getClientSettings(clientId) : Promise.resolve(undefined),
      clientId ? storage.getClient(clientId) : Promise.resolve(undefined),
    ]);
    res.json(publicSystemSettings(settings, tenantSettings, client));
  });

  app.get("/api/client/settings", requireCapability(CAPS.SETTINGS_VIEW), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;

    try {
      const [client, settings] = await Promise.all([
        storage.getClient(clientId),
        storage.getClientSettings(clientId),
      ]);
      if (!client) return safeNotFound(res);
      res.json(buildClientSettingsPayload(client, settings));
    } catch (err) {
      console.error("Client settings fetch failed:", err);
      res.status(500).json({ message: "Error fetching client settings" });
    }
  });

  app.put("/api/client/settings", requireCapability(CAPS.SETTINGS_MANAGE), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;

    try {
      const input = clientSettingsInputSchema.parse(req.body || {});
      const { defaultLanguage, ...settingsInput } = input;

      if (defaultLanguage) {
        await storage.updateClient(clientId, { defaultLanguage });
      }
      if (settingsInput.representedCountryCode && !settingsInput.homeCountryCode) {
        settingsInput.homeCountryCode = settingsInput.representedCountryCode;
        settingsInput.homeCountryName = getCountry(settingsInput.representedCountryCode)?.name || settingsInput.representedCountryCode;
      }
      const settings = await storage.upsertClientSettings(clientId, settingsInput);
      const client = await storage.getClient(clientId);
      if (!client) return safeNotFound(res);

      await storage.createAuditLog({
        userId: user.id,
        clientId,
        action: "update",
        entity: "client_settings",
        entityId: clientId,
        details: `Updated client settings: ${Object.keys(input).join(", ")}`,
      });

      res.json(buildClientSettingsPayload(client, settings));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid client settings" });
      }
      console.error("Client settings update failed:", err);
      res.status(500).json({ message: "Client settings update failed" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    app.get("/dev/ai-bypass-test", (_req, res) => {
      res.json({
        ok: false,
        blocked: true,
        reason: "OpenAI import is forbidden outside ai-gateway (guard enforced)",
      });
    });
  }

  app.use("/api/", apiLimiter);
  app.use("/api/login", authLimiter);
  app.use("/api/register", authLimiter);

  // === ENHANCED AUTH: /auth/me with permissions & impersonation ===
  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;

    try {
      const ctx = resolveTenantContext(user, req);
      const impersonation = req.session?.impersonation || null;

      let effectiveUser = user;
      if (impersonation?.isImpersonating && impersonation?.activeUserId) {
        effectiveUser = await storage.getUser(impersonation.activeUserId) || user;
      }

      const effectivePermissions = await storage.getEffectivePermissions(effectiveUser.id);

      let organization = null;
      if (ctx.tenantId) {
        organization = await storage.getClient(ctx.tenantId);
      }

      res.json({
        user: {
          id: effectiveUser.id,
          username: effectiveUser.username,
          role: effectiveUser.role,
          userScope: getUserScope(effectiveUser),
          clientId: effectiveUser.clientId,
          disabled: effectiveUser.disabled,
          createdAt: effectiveUser.createdAt,
        },
        originalUser: ctx.isImpersonating ? {
          id: user.id,
          username: user.username,
          role: user.role,
        } : null,
        organization: organization ? {
          id: organization.id,
          name: organization.name,
          organizationType: organization.organizationType,
          defaultLanguage: organization.defaultLanguage,
          active: organization.active,
        } : null,
        permissions: effectivePermissions,
        impersonation: impersonation ? {
          isImpersonating: impersonation.isImpersonating,
          activeOrganizationId: impersonation.activeOrganizationId,
          activeUserId: impersonation.activeUserId,
          originalUserId: impersonation.originalUserId,
        } : { isImpersonating: false, activeOrganizationId: null, activeUserId: null, originalUserId: null },
        tenantId: ctx.tenantId,
      });
    } catch (err: any) {
      console.error("[auth/me] Error:", err.message);
      res.status(500).json({ message: "Failed to load auth context" });
    }
  });

  // === IMPERSONATION ENDPOINTS ===
  app.post("/api/admin/impersonate/organization/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!isSystemAdmin(user)) return res.status(403).json({ message: "Platform admin access required" });

    const orgId = parseInt(req.params.id);
    const org = await storage.getClient(orgId);
    if (!org) return res.status(404).json({ message: "Organization not found" });

    req.session.impersonation = {
      activeOrganizationId: orgId,
      activeUserId: null,
      originalUserId: user.id,
      isImpersonating: true,
    };

    await storage.createImpersonationLog({
      adminUserId: user.id,
      targetOrganizationId: orgId,
      targetUserId: null,
      action: "impersonate_organization",
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });

    await storage.createAuditLog({
      userId: user.id,
      action: "impersonate_organization",
      entity: "organization",
      entityId: orgId,
      details: `Admin impersonating organization: ${org.name}`,
    });

    res.json({ message: "Now impersonating organization", organization: { id: org.id, name: org.name } });
  });

  app.post("/api/admin/impersonate/user/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!isSystemAdmin(user)) return res.status(403).json({ message: "Platform admin access required" });

    const targetUserId = parseInt(req.params.id);
    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    const targetOrgId = targetUser.clientId || null;

    req.session.impersonation = {
      activeOrganizationId: targetOrgId,
      activeUserId: targetUserId,
      originalUserId: user.id,
      isImpersonating: true,
    };

    await storage.createImpersonationLog({
      adminUserId: user.id,
      targetUserId: targetUserId,
      targetOrganizationId: targetOrgId,
      action: "impersonate_user",
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });

    await storage.createAuditLog({
      userId: user.id,
      action: "impersonate_user",
      entity: "user",
      entityId: targetUserId,
      details: `Admin impersonating user: ${targetUser.username}`,
    });

    res.json({ message: "Now impersonating user", user: { id: targetUser.id, username: targetUser.username } });
  });

  app.post("/api/admin/impersonate/exit", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;

    if (!req.session.impersonation?.isImpersonating) {
      return res.status(400).json({ message: "Not currently impersonating" });
    }

    await storage.createImpersonationLog({
      adminUserId: req.session.impersonation.originalUserId,
      targetUserId: req.session.impersonation.activeUserId,
      targetOrganizationId: req.session.impersonation.activeOrganizationId,
      action: "exit_impersonation",
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });

    req.session.impersonation = undefined;

    res.json({ message: "Exited impersonation mode" });
  });

  // === IMPERSONATION LOGS ===
  app.get("/api/admin/impersonation-logs", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!isSystemAdmin(user)) return res.status(403).json({ message: "Platform admin access required" });

    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await storage.getImpersonationLogs({ limit });
    res.json(logs);
  });

  // === TENANT SELECTION (SYSTEM_ADMIN only) ===
  app.post("/api/admin/select-tenant", requireSystemAdmin(), async (req, res) => {
    const { tenantId } = req.body;
    if (tenantId !== null && tenantId !== undefined) {
      const org = await storage.getClient(tenantId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      req.session.selectedTenantId = tenantId;
      res.json({ message: "Tenant selected", tenantId, organization: { id: org.id, name: org.name } });
    } else {
      req.session.selectedTenantId = undefined;
      res.json({ message: "Tenant selection cleared", tenantId: null });
    }
  });

  // === CAPABILITIES ENDPOINT ===
  app.get("/api/auth/capabilities", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const ctx = resolveTenantContext(user, req);

    const role = user.role;
    const sysAdmin = isSystemAdmin(user);

    let impersonatingUsername: string | null = null;
    let tenantName: string | null = null;
    let planTier = "enterprise";
    let aiEnabled = false;
    let aiTier = "none";

    if (ctx.isImpersonating && req.session?.impersonation?.activeUserId) {
      const impUser = await storage.getUser(req.session.impersonation.activeUserId);
      if (impUser) impersonatingUsername = impUser.username;
    }
    if (ctx.tenantId) {
      const tenant = await storage.getClient(ctx.tenantId);
      if (tenant) {
        tenantName = tenant.name;
        planTier = (tenant as any).planTier || "enterprise";
        aiEnabled = tenant.aiEnabled || false;
        aiTier = (tenant as any).aiTier || "none";
      }
    }

    const effectiveCaps = sysAdmin && !ctx.tenantId ? PLATFORM_ADMIN_CAPS : resolveEffectiveCaps(
      role,
      user.userType || null,
      sysAdmin ? "enterprise" : planTier,
      sysAdmin ? true : aiEnabled,
      user.capabilities || null,
    );

    res.json({
      role,
      userScope: getUserScope(user),
      userType: user.userType || null,
      tenantId: ctx.tenantId,
      tenantName,
      planTier,
      aiEnabled,
      aiTier,
      isImpersonating: ctx.isImpersonating,
      impersonatingUsername,
      capabilities: effectiveCaps,
      permissions: {
        feeds: effectiveCaps.includes(CAPS.FEED_VIEW),
        analytics: effectiveCaps.includes(CAPS.ANALYTICS_VIEW),
        intelligence: effectiveCaps.includes(CAPS.INTELLIGENCE_VIEW),
        sources: effectiveCaps.includes(CAPS.SOURCES_VIEW),
        users: effectiveCaps.includes(CAPS.USERS_VIEW),
        billing: effectiveCaps.includes(CAPS.BILLING_VIEW),
        systemAdmin: sysAdmin,
        collaboration: effectiveCaps.includes(CAPS.COLLAB_VIEW),
        integrations: effectiveCaps.includes(CAPS.INTEGRATIONS_VIEW),
        settings: sysAdmin || effectiveCaps.includes(CAPS.SETTINGS_VIEW) || effectiveCaps.includes(CAPS.PERMISSIONS_MANAGE),
        exports: effectiveCaps.includes(CAPS.ARTICLE_EXPORT) || effectiveCaps.includes(CAPS.ANALYTICS_EXPORT),
        readOnly: role === SYSTEM_ROLES.READONLY_USER,
        executive: effectiveCaps.includes(CAPS.EXECUTIVE_HOME),
        knowledgeMemory: effectiveCaps.includes(CAPS.KNOWLEDGE_VIEW),
        predictiveIntelligence: effectiveCaps.includes(CAPS.INTELLIGENCE_PREDICTIONS),
      },
    });
  });

  // === SOURCES ===
  app.get(api.sources.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json([]);
    const [sources, assignmentSummaries] = await Promise.all([
      storage.getSources(clientId || undefined),
      storage.getSourceAssignmentSummaries(clientId),
    ]);
    res.json(sources.filter((source) => !source.deletedAt).map((source) => ({
      ...source,
      assignmentSummary: assignmentSummaries[source.id] || null,
    })));
  });

  app.get("/feeds/:token.xml", apiLimiter, async (req, res) => {
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    if (!z.string().uuid().safeParse(token).success) return res.sendStatus(404);
    const source = await storage.getSourceByFeedToken(token);
    if (!source || source.deletedAt) return res.sendStatus(404);
    const { items } = await storage.getArticles({ sourceId: source.id, clientId: source.clientId, limit: 50 });
    const baseUrl = (process.env.PUBLIC_APP_URL || "https://nws360.com").replace(/\/$/, "");
    const entries = items.map((article) => `
      <item>
        <title>${escapeXml(article.title)}</title>
        <link>${escapeXml(article.url)}</link>
        <guid isPermaLink="true">${escapeXml(article.url)}</guid>
        <description>${escapeXml(article.summary || article.contentClean || article.content || "")}</description>
        <pubDate>${new Date(article.publishedAt || article.createdAt || Date.now()).toUTCString()}</pubDate>
        ${article.imageUrl && article.imageUrl !== "none" ? `<enclosure url="${escapeXml(article.imageUrl)}" type="image/jpeg" />` : ""}
      </item>`).join("");
    res.set({
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
    });
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>${escapeXml(source.name)}</title>
          <link>${escapeXml(source.url)}</link>
          <description>${escapeXml(`NWS360 collected feed for ${source.name}`)}</description>
          <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${escapeXml(`${baseUrl}/feeds/${source.feedToken}.xml`)}" rel="self" type="application/rss+xml" />
          ${entries}
        </channel>
      </rss>`);
  });

  const previewInputSchema = z.object({
    url: z.string().min(1, "URL is required").max(2000),
    type: z.enum(["website", "rss", "twitter", "youtube", "facebook", "instagram", "telegram", "google_news"]),
    country: z.string().trim().length(2).optional(),
    maxArticles: z.number().int().min(1).max(50).optional().default(10),
    collectorConfig: websiteCollectorConfigSchema.optional(),
    filterConfig: sourceFilterConfigSchema.optional(),
  }).superRefine((input, ctx) => {
    if (input.type === "google_news" && (!input.country || !isGoogleNewsEditionCode(input.country))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["country"], message: "A supported Google News region is required" });
    }
  });

  app.post("/api/sources/preview", requireCapability(CAPS.SOURCES_ADD, CAPS.SOURCES_EDIT), async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const input = previewInputSchema.parse(req.body);
      const result = await previewSource(input.url, input.type, input.maxArticles, input.country, input.collectorConfig, input.filterConfig);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, method: "none", articles: [], error: err.errors[0].message });
      }
      const msg = err instanceof Error ? err.message : "Preview failed";
      res.json({ success: false, method: "none", articles: [], error: msg });
    }
  });

  const sourceCreateInput = api.sources.create.input
    .omit({ clientId: true, userId: true, logoUrl: true, active: true, refreshPriority: true, feedToken: true })
    .extend({
      collectorConfig: websiteCollectorConfigSchema.nullable().optional(),
      filterConfig: sourceFilterConfigSchema.nullable().optional(),
    })
    .superRefine((input, ctx) => {
      if (input.type === "google_news" && (!input.country || !isGoogleNewsEditionCode(input.country))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["country"], message: "A supported Google News region is required" });
      }
      if (input.category && !isSourceCategoryCode(input.category)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["category"], message: "A supported source category is required" });
      }
    });

  app.post(api.sources.create.path, requireCapability(CAPS.SOURCES_ADD), async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const input = sourceCreateInput.parse(req.body);
      const clientId = resolveClientId(user, req);
      if (!clientId) return res.status(400).json({ message: "Tenant context required" });
      const tenantSettings = await storage.getClientSettings(clientId);
      const normalizedInput = {
        ...input,
        country: input.type === "google_news" ? input.country!.toUpperCase() : null,
        category: input.category && isSourceCategoryCode(input.category) ? input.category : null,
        collectorConfig: sourceTypeSupportsCollectorConfig(input.type) ? normalizeWebsiteCollectorConfig(input.collectorConfig) : null,
        filterConfig: normalizeSourceFilterConfig(input.filterConfig),
        intervalMinutes: input.intervalMinutes ?? tenantSettings?.defaultSourceIntervalMinutes ?? 15,
        maxArticlesPerFetch: input.maxArticlesPerFetch ?? tenantSettings?.defaultMaxArticlesPerFetch ?? 10,
        retentionDays: input.retentionDays ?? tenantSettings?.defaultArticleRetentionDays ?? DEFAULT_SOURCE_RETENTION_DAYS,
      };
      const logoUrl = getSourceLogoUrl(normalizedInput.url, normalizedInput.name);
      const source = await storage.createSource({...normalizedInput, userId: user.id, clientId, logoUrl});

      setTimeout(async () => {
        try {
          await fetchSourceFeed(source.id);
        } catch (e) {
          console.error(`[Worker] Failed initial fetch for ${source.name}:`, e);
        }
      }, 1000);

      res.status(201).json(source);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  const sourceUpdateInput = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    url: z.string().trim().min(1).max(2000).optional(),
    active: z.boolean().optional(),
    intervalMinutes: z.number().int().min(5).max(1440).optional(),
    maxArticlesPerFetch: z.number().int().min(1).max(50).optional(),
    retentionDays: z.number().int().min(1).max(30).optional(),
    country: z.string().trim().length(2).nullable().optional(),
    category: z.string().trim().nullable().optional(),
    collectorConfig: websiteCollectorConfigSchema.nullable().optional(),
    filterConfig: sourceFilterConfigSchema.nullable().optional(),
  }).strict();

  function normalizeSourceUpdatePayload(
    input: z.infer<typeof sourceUpdateInput>,
    existingSource: any,
    options: { allowEmpty?: boolean } = {},
  ): { cleanUpdates?: Record<string, any>; error?: string } {
    const cleanUpdates: Record<string, any> = { ...input };
    if (Object.keys(cleanUpdates).length === 0 && !options.allowEmpty) {
      return { error: "No valid fields to update" };
    }
    if (cleanUpdates.category !== undefined && cleanUpdates.category !== null && !isSourceCategoryCode(cleanUpdates.category)) {
      return { error: "A supported source category is required" };
    }
    if (existingSource.type === "google_news") {
      const country = cleanUpdates.country === undefined ? existingSource.country : cleanUpdates.country;
      if (!country || !isGoogleNewsEditionCode(country)) {
        return { error: "A supported Google News region is required" };
      }
      cleanUpdates.country = String(country).toUpperCase();
    } else if (cleanUpdates.country !== undefined) {
      cleanUpdates.country = null;
    }
    if (cleanUpdates.collectorConfig !== undefined) {
      cleanUpdates.collectorConfig = sourceTypeSupportsCollectorConfig(existingSource.type)
        ? normalizeWebsiteCollectorConfig(cleanUpdates.collectorConfig)
        : null;
    }
    if (cleanUpdates.filterConfig !== undefined) {
      cleanUpdates.filterConfig = normalizeSourceFilterConfig(cleanUpdates.filterConfig);
    }
    if (cleanUpdates.url || cleanUpdates.name) {
      cleanUpdates.logoUrl = getSourceLogoUrl(cleanUpdates.url || existingSource.url, cleanUpdates.name || existingSource.name);
    }
    return { cleanUpdates };
  }

  const legacyOperationalSourceTestFields = new Set([
    "type",
    "url",
    "intervalMinutes",
    "maxArticlesPerFetch",
    "retentionDays",
    "collectorConfig",
    "filterConfig",
    "refreshPriority",
    "active",
  ]);

  async function legacyOperationalSettingsWorkflowRequired(existingSource: any, clientId: number, input: Record<string, unknown>): Promise<boolean> {
    if (!existingSource.publisherChannelId) return false;
    if (!Object.keys(input).some((key) => legacyOperationalSourceTestFields.has(key))) return false;
    const assignmentSummaries = await storage.getSourceAssignmentSummaries(clientId);
    return (assignmentSummaries[existingSource.id]?.assignments.length || 0) > 0;
  }

  app.patch(api.sources.update.path, requireCapability(CAPS.SOURCES_EDIT), async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const id = parseInt(req.params.id);
      const clientId = resolveClientId(user, req);
      if (!clientId) return res.status(400).json({ message: "Tenant context required" });
      const existingSource = await storage.getSource(id, clientId);
      if (!existingSource) {
        return safeNotFound(res);
      }
      const input = sourceUpdateInput.parse(req.body);
      if (await legacyOperationalSettingsWorkflowRequired(existingSource, clientId, input)) {
        return res.status(409).json({
          message: "Use the guarded operational source settings workflow for assigned publisher-linked sources.",
          code: "operational_source_settings_workflow_required",
        });
      }
      const { cleanUpdates, error } = normalizeSourceUpdatePayload(input, existingSource);
      if (error || !cleanUpdates) return res.status(400).json({ message: error || "Invalid source settings" });
      const source = await storage.updateSource(id, cleanUpdates, clientId);
      if (!source) return res.status(404).json({ message: "Source not found" });
      if (input.category !== undefined) {
        await db.update(articles)
          .set({ category: input.category || "general" })
          .where(and(eq(articles.sourceId, id), eq(articles.clientId, clientId)));
      }
      res.json(source);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid source settings" });
      }
      res.status(400).json({ message: "Invalid source settings" });
    }
  });

  app.post("/api/sources/:id/rebuild", requireCapability(CAPS.SOURCES_EDIT), async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const id = parseInt(req.params.id);
      const clientId = resolveClientId(user, req);
      if (!clientId) return res.status(400).json({ message: "Tenant context required" });
      const existingSource = await storage.getSource(id, clientId);
      if (!existingSource) {
        return safeNotFound(res);
      }

      const input = sourceUpdateInput.parse(req.body || {});
      const { cleanUpdates, error } = normalizeSourceUpdatePayload(input, existingSource, { allowEmpty: true });
      if (error || !cleanUpdates) return res.status(400).json({ message: error || "Invalid source settings" });

      const source = Object.keys(cleanUpdates).length > 0
        ? await storage.updateSource(id, cleanUpdates, clientId)
        : existingSource;
      if (!source) return res.status(404).json({ message: "Source not found" });

      const deletedArticles = await storage.clearSourceArticles(id, clientId);
      try {
        const newArticles = await fetchSourceFeed(id);
        res.json({ success: true, source, deletedArticles, newArticles });
      } catch (fetchError) {
        const msg = fetchError instanceof Error ? fetchError.message : "Fetch failed";
        res.status(500).json({
          success: false,
          source,
          deletedArticles,
          newArticles: 0,
          message: `Source settings were saved and ${deletedArticles} old article(s) were cleared, but the fresh fetch failed: ${msg}`,
        });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid source settings" });
      }
      res.status(400).json({ message: "Invalid source rebuild request" });
    }
  });

  const sourceImportInput = z.object({
    rows: z.array(z.object({
      xmlUrl: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      sourceUrl: z.string().nullable().optional(),
    })).min(1).max(300),
    active: z.boolean().optional().default(false),
    fetchAfterImport: z.boolean().optional().default(false),
    intervalMinutes: z.number().int().min(5).max(1440).optional().default(30),
    maxArticlesPerFetch: z.number().int().min(1).max(50).optional().default(10),
    retentionDays: z.number().int().min(1).max(30).optional().default(DEFAULT_SOURCE_RETENTION_DAYS),
    category: z.string().trim().nullable().optional(),
  }).strict();

  app.post("/api/sources/import", requireCapability(CAPS.SOURCES_ADD), async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const clientId = resolveClientId(user, req);
      if (!clientId) return res.status(400).json({ message: "Tenant context required" });

      const input = sourceImportInput.parse(req.body);
      if (input.category && !isSourceCategoryCode(input.category)) {
        return res.status(400).json({ message: "A supported source category is required" });
      }

      const existingSources = await storage.getSources(clientId);
      const existingSourcesByKey = new Map(existingSources.map(source => [
        normalizeSourceImportKey(source.type, source.url, source.country),
        source,
      ]));
      const seen = new Set(existingSourcesByKey.keys());
      const results: Array<{
        rowIndex: number;
        name: string;
        type: string;
        url: string;
        status: "created" | "skipped" | "failed";
        sourceId?: number;
        reason?: string;
      }> = [];
      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (let index = 0; index < input.rows.length; index++) {
        const classified = classifyFeedImportRow(input.rows[index] as FeedImportInputRow, index);
        if (!classified.enabled || !classified.url) {
          skipped += 1;
          results.push({
            rowIndex: index,
            name: classified.name,
            type: classified.type,
            url: classified.url,
            status: "skipped",
            reason: classified.warnings[0] || "No importable URL found",
          });
          continue;
        }

        const country = classified.type === "google_news"
          ? (isGoogleNewsEditionCode(classified.country) ? classified.country!.toUpperCase() : "US")
          : null;
        const key = normalizeSourceImportKey(classified.type, classified.url, country);
        if (seen.has(key)) {
          const existingSource = existingSourcesByKey.get(key);
          const collectorConfig = buildImportedFeedCollectorConfig(classified);
          const currentFeedUrl = existingSource?.collectorConfig?.feedUrl?.trim();
          if (existingSource && collectorConfig && currentFeedUrl !== collectorConfig.feedUrl) {
            await storage.updateSource(existingSource.id, {
              collectorConfig: {
                ...normalizeWebsiteCollectorConfig(existingSource.collectorConfig),
                ...collectorConfig,
              },
            }, clientId);
            skipped += 1;
            results.push({
              rowIndex: index,
              name: existingSource.name,
              type: existingSource.type,
              url: existingSource.url,
              status: "skipped",
              sourceId: existingSource.id,
              reason: "Duplicate source updated with RSS.app feed URL",
            });
            continue;
          }
          skipped += 1;
          results.push({
            rowIndex: index,
            name: classified.name,
            type: classified.type,
            url: classified.url,
            status: "skipped",
            reason: "Duplicate source",
          });
          continue;
        }

        try {
          const source = await storage.createSource({
            name: sanitizeInput(classified.name).slice(0, 200) || "Imported source",
            url: classified.url,
            type: classified.type,
            active: input.active,
            intervalMinutes: input.intervalMinutes,
            maxArticlesPerFetch: input.maxArticlesPerFetch,
            retentionDays: input.retentionDays,
            country,
            category: input.category && isSourceCategoryCode(input.category) ? input.category : null,
            collectorConfig: buildImportedFeedCollectorConfig(classified),
            filterConfig: normalizeSourceFilterConfig(null),
            refreshPriority: "medium",
            userId: user.id,
            clientId,
            logoUrl: getSourceLogoUrl(classified.originalUrl || classified.url, classified.name),
          });
          seen.add(key);
          created += 1;
          results.push({ rowIndex: index, name: source.name, type: source.type, url: source.url, status: "created", sourceId: source.id });

          if (input.active && input.fetchAfterImport) {
            setTimeout(async () => {
              try {
                await fetchSourceFeed(source.id);
              } catch (e) {
                console.error(`[Worker] Failed import fetch for ${source.name}:`, e);
              }
            }, 1000 + created * 250);
          }
        } catch (e) {
          failed += 1;
          results.push({
            rowIndex: index,
            name: classified.name,
            type: classified.type,
            url: classified.url,
            status: "failed",
            reason: e instanceof Error ? e.message : "Create failed",
          });
        }
      }

      res.status(201).json({ created, skipped, failed, results });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid source import" });
      }
      res.status(400).json({ message: "Invalid source import" });
    }
  });

  app.delete(api.sources.delete.path, requireCapability(CAPS.SOURCES_DELETE), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });
    const existingSource = await storage.getSource(id, clientId);
    if (!existingSource) {
      return safeNotFound(res);
    }
    await storage.softDeleteSource(id, clientId);
    await storage.createAuditLog({ userId: user.id, action: "soft_delete", entity: "source", entityId: id, details: `Soft-deleted source #${id}` });
    runAnalyticsComputation().catch(e => console.error("[Analytics] Post-source-delete recomputation error:", e));
    res.sendStatus(204);
  });

  app.post("/api/sources/discover-channels", requireCapability(CAPS.SOURCES_ADD), async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ channels: {}, categories: [] });
      }

      let targetUrl = url.trim();
      if (!targetUrl.startsWith("http")) {
        targetUrl = `https://${targetUrl}`;
      }
      try {
        new URL(targetUrl);
      } catch {
        return res.json({ channels: {}, categories: [] });
      }

      const channels: Record<string, { url: string; confidence: string }> = {};
      let categories: DiscoveredPublisherCategory[] = [];

      try {
        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const cheerio = await import("cheerio");
        const $ = cheerio.load(html);
        const categoryDiscovery = discoverPublisherCategories(targetUrl, html);

        const socialPatterns: { type: string; patterns: RegExp[]; normalize: (url: string) => string }[] = [
          {
            type: "facebook",
            patterns: [/(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\/([A-Za-z0-9._-]+)\/?/i],
            normalize: (u: string) => {
              const m = u.match(/(?:facebook\.com|fb\.com)\/([A-Za-z0-9._-]+)/i);
              return m ? `https://facebook.com/${m[1]}` : u;
            },
          },
          {
            type: "twitter",
            patterns: [/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)\/?/i],
            normalize: (u: string) => {
              const m = u.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/i);
              return m ? `https://x.com/${m[1]}` : u;
            },
          },
          {
            type: "youtube",
            patterns: [/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:@|channel\/|user\/|c\/)?([A-Za-z0-9_-]+)\/?/i],
            normalize: (u: string) => {
              const m = u.match(/youtube\.com\/((?:@|channel\/|user\/|c\/)?[A-Za-z0-9_-]+)/i);
              return m ? `https://youtube.com/${m[1]}` : u;
            },
          },
          {
            type: "instagram",
            patterns: [/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._-]+)\/?/i],
            normalize: (u: string) => {
              const m = u.match(/instagram\.com\/([A-Za-z0-9._-]+)/i);
              return m ? `https://instagram.com/${m[1]}` : u;
            },
          },
          {
            type: "telegram",
            patterns: [/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)\/?/i],
            normalize: (u: string) => {
              const m = u.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
              return m ? `https://t.me/${m[1]}` : u;
            },
          },
        ];

        const skipPaths = new Set(["share", "sharer", "sharer.php", "intent", "dialog", "login", "help", "about", "policy", "privacy", "terms", "watch", "hashtag", "search", "explore"]);

        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;

          for (const sp of socialPatterns) {
            if (channels[sp.type]) continue;
            for (const pattern of sp.patterns) {
              const match = href.match(pattern);
              if (match) {
                const username = match[1]?.toLowerCase();
                if (username && !skipPaths.has(username)) {
                  channels[sp.type] = {
                    url: sp.normalize(href),
                    confidence: "high",
                  };
                }
                break;
              }
            }
          }
        });

        const metaSelectors = [
          'meta[property="og:see_also"]',
          'meta[name="twitter:site"]',
          'meta[name="twitter:creator"]',
          'link[rel="me"]',
        ];
        for (const sel of metaSelectors) {
          $(sel).each((_, el) => {
            const content = $(el).attr("content") || $(el).attr("href") || "";
            if (!content) return;
            for (const sp of socialPatterns) {
              if (channels[sp.type]) continue;
              for (const pattern of sp.patterns) {
                const match = content.match(pattern);
                if (match) {
                  const username = match[1]?.toLowerCase();
                  if (username && !skipPaths.has(username)) {
                    channels[sp.type] = { url: sp.normalize(content), confidence: "medium" };
                  }
                  break;
                }
              }
            }
          });
        }

        const twitterHandle = $('meta[name="twitter:site"]').attr("content");
        if (twitterHandle && !channels.twitter) {
          const handle = twitterHandle.replace(/^@/, "");
          if (handle && !skipPaths.has(handle.toLowerCase())) {
            channels.twitter = { url: `https://x.com/${handle}`, confidence: "high" };
          }
        }

        const jsonLd = $('script[type="application/ld+json"]');
        jsonLd.each((_, el) => {
          try {
            const data = JSON.parse($(el).html() || "{}");
            const collectSameAs = (obj: any): string[] => {
              const results: string[] = [];
              if (!obj || typeof obj !== "object") return results;
              if (obj.sameAs) {
                const sa = Array.isArray(obj.sameAs) ? obj.sameAs : [obj.sameAs];
                results.push(...sa.filter((s: any) => typeof s === "string"));
              }
              for (const key of ["publisher", "author", "creator", "organization", "sourceOrganization"]) {
                if (obj[key] && typeof obj[key] === "object") {
                  results.push(...collectSameAs(obj[key]));
                }
              }
              if (obj["@graph"] && Array.isArray(obj["@graph"])) {
                for (const item of obj["@graph"]) {
                  results.push(...collectSameAs(item));
                }
              }
              return results;
            };
            const urls = collectSameAs(data);
            for (const sUrl of urls) {
              for (const sp of socialPatterns) {
                if (channels[sp.type]) continue;
                for (const pattern of sp.patterns) {
                  const match = sUrl.match(pattern);
                  if (match) {
                    const username = match[1]?.toLowerCase();
                    if (username && !skipPaths.has(username)) {
                      channels[sp.type] = { url: sp.normalize(sUrl), confidence: "high" };
                    }
                    break;
                  }
                }
              }
            }
          } catch {}
        });

        categories = await categoryDiscovery;

      } catch (scrapeErr) {
        console.error("[Discover] Failed to scrape website for social links:", scrapeErr);
      }

      res.json({ channels, categories });
    } catch (err) {
      console.error("[Discover] Channel discovery error:", err);
      res.json({ channels: {}, categories: [] });
    }
  });

  // === WEBSITE SEARCH / DISCOVERY ===
  app.get("/api/search-websites", requireCapability(CAPS.SOURCES_ADD), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const query = (req.query.q as string || "").trim();
    if (!query || query.length < 2) {
      return res.json({ results: [] });
    }

    const results: { name: string; url: string; feedUrl: string | null; hasFeed: boolean }[] = [];

    try {
      const googleNewsRss = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " site news")}&hl=en&gl=US&ceid=US:en`;
      const feed = await new (await import("rss-parser")).default({
        timeout: 10000,
        headers: { "User-Agent": "NWS360/1.0 (RSS Reader)" },
      }).parseURL(googleNewsRss);

      const seenDomains = new Set<string>();

      for (const item of feed.items.slice(0, 15)) {
        if (!item.link) continue;
        try {
          const parsed = new URL(item.link);
          const domain = parsed.hostname.replace(/^www\./, "");
          if (seenDomains.has(domain)) continue;
          if (domain.includes("google.com")) continue;
          seenDomains.add(domain);

          const siteUrl = `${parsed.protocol}//${parsed.hostname}`;
          const siteName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);

          results.push({
            name: siteName,
            url: siteUrl,
            feedUrl: null,
            hasFeed: false,
          });
        } catch {}
      }

      const discoveryPromises = results.slice(0, 5).map(async (result) => {
        try {
          const { discoverRssFeedPublic } = await import("./feed-worker");
          const feedUrl = await discoverRssFeedPublic(result.url);
          if (feedUrl) {
            result.feedUrl = feedUrl;
            result.hasFeed = true;
          }
        } catch {}
      });
      await Promise.all(discoveryPromises);
    } catch (e) {
      console.error("[Search] Website search failed:", e);
    }

    res.json({ results: results.slice(0, 10) });
  });

  // === MANUAL FETCH ===
  app.post("/api/sources/:id/fetch", requireCapability(CAPS.SOURCES_EDIT), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const clientId = resolveClientId(user, req);
    const source = await storage.getSource(id, clientId || undefined);
    if (!source) return res.status(404).json({ message: "Source not found" });
    if (!isSystemAdmin(user) && source.clientId !== clientId) {
      return safeNotFound(res);
    }
    try {
      const newArticles = await fetchSourceFeed(id);
      res.json({ success: true, newArticles });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fetch failed";
      res.status(500).json({ success: false, message: msg });
    }
  });

  app.post("/api/fetch-all", requireCapability(CAPS.SOURCES_EDIT), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    console.log(`[Fetch-All] Fetch triggered by user for tenant ${clientId}`);
    try {
      const tenantSources = await storage.getSources(clientId);
      const activeSources = tenantSources.filter((source: any) => source.active);
      const results = await Promise.all(
        activeSources.map(async (source: any) => {
          try {
            const newArticles = await fetchSourceFeed(source.id);
            return { sourceId: source.id, newArticles };
          } catch (error) {
            console.error(`[Fetch-All] Failed source ${source.id}:`, error);
            return { sourceId: source.id, newArticles: 0, error: true };
          }
        })
      );
      const totalNew = results.reduce((sum: number, r: any) => sum + (r.newArticles || 0), 0);
      console.log(`[Fetch-All] Complete: ${totalNew} new articles from ${results.length} sources`);
      res.json({ success: true, totalNewArticles: totalNew, message: `Fetched ${totalNew} new articles from ${results.length} sources` });
    } catch (err) {
      console.error("[Fetch-All] Fetch failed:", err);
      res.status(500).json({ success: false, message: "Feed fetch failed" });
    }
  });

  const bulkSourceMaintenanceInput = z.object({
    retentionDays: z.number().int().min(1).max(30).optional().default(DEFAULT_SOURCE_RETENTION_DAYS),
    activeOnly: z.boolean().optional().default(false),
    updateSourceRetention: z.boolean().optional().default(true),
    deleteOldArticles: z.boolean().optional().default(true),
    fetchAfterCleanup: z.boolean().optional().default(false),
  }).strict();

  app.post("/api/sources/bulk-maintenance", requireCapability(CAPS.SOURCES_EDIT), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;

    try {
      const input = bulkSourceMaintenanceInput.parse(req.body || {});
      const tenantSources = await storage.getSources(clientId);
      const scopedSources = tenantSources.filter((source: any) => !input.activeOnly || source.active !== false);
      const sourceIds = scopedSources.map((source: any) => Number(source.id)).filter(Number.isFinite);
      const cutoff = new Date(Date.now() - input.retentionDays * 24 * 60 * 60 * 1000);

      let sourcesUpdated = 0;
      if (input.updateSourceRetention) {
        for (const sourceId of sourceIds) {
          const updated = await storage.updateSource(sourceId, { retentionDays: input.retentionDays }, clientId);
          if (updated) sourcesUpdated++;
        }
      }

      let deletedArticles = 0;
      if (input.deleteOldArticles && sourceIds.length > 0) {
        const oldArticleRows = await db
          .select({ id: articles.id })
          .from(articles)
          .where(and(
            eq(articles.clientId, clientId),
            inArray(articles.sourceId, sourceIds),
            sql`COALESCE(${articles.publishedAt}, ${articles.ingestedAt}) < ${cutoff}`,
          ));
        const articleIds = oldArticleRows.map((row) => row.id);
        for (let i = 0; i < articleIds.length; i += 500) {
          deletedArticles += await storage.deleteArticles(articleIds.slice(i, i + 500), clientId);
        }
      }

      const fetchResults: { sourceId: number; newArticles: number; error?: string }[] = [];
      if (input.fetchAfterCleanup) {
        const sourcesToFetch = scopedSources.filter((source: any) => source.active !== false);
        let nextIndex = 0;
        const workerCount = Math.min(BULK_SOURCE_FETCH_CONCURRENCY, sourcesToFetch.length);
        await Promise.all(Array.from({ length: workerCount }, async () => {
          while (nextIndex < sourcesToFetch.length) {
            const source = sourcesToFetch[nextIndex++];
            try {
              const newArticles = await fetchSourceFeed(source.id);
              fetchResults.push({ sourceId: source.id, newArticles });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Fetch failed";
              console.error(`[Bulk Maintenance] Failed source ${source.id}:`, error);
              fetchResults.push({ sourceId: source.id, newArticles: 0, error: message });
            }
          }
        }));
      }

      if (deletedArticles > 0 || fetchResults.length > 0) {
        await db.delete(analyticsCache).where(eq(analyticsCache.clientId, clientId));
        runAnalyticsComputation().catch(e => console.error("[Analytics] Post-bulk-maintenance recomputation error:", e));
      }

      const totalNewArticles = fetchResults.reduce((sum, result) => sum + result.newArticles, 0);
      const fetchErrors = fetchResults.filter((result) => result.error);
      res.json({
        success: true,
        retentionDays: input.retentionDays,
        sourceScope: input.activeOnly ? "active" : "all",
        cutoff: cutoff.toISOString(),
        sourcesMatched: sourceIds.length,
        sourcesUpdated,
        deletedArticles,
        fetchedSources: fetchResults.length,
        totalNewArticles,
        fetchErrors: fetchErrors.length,
        results: fetchResults,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: err.errors[0]?.message || "Invalid bulk maintenance request" });
      }
      console.error("[Bulk Maintenance] Failed:", err);
      res.status(500).json({ success: false, message: "Bulk source maintenance failed" });
    }
  });

  // === MONITORING WORKSPACE RELEVANCE ===
  app.get("/api/workspaces", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      if (!(await canReadWorkspaceRelevance(user, req))) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const clientId = resolveClientId(user, req);
      if (!clientId && !isSystemAdmin(user)) {
        return res.status(403).json({ message: "No organization assigned" });
      }
      const workspaces = await storage.getWorkspaces(clientId || undefined);
      res.json({ items: workspaces, total: workspaces.length });
    } catch (err) {
      console.error("Workspace list failed:", err);
      res.status(500).json({ message: "Error fetching workspaces" });
    }
  });

  app.get("/api/workspaces/:workspaceId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      if (!(await canReadWorkspaceRelevance(user, req))) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const workspace = await getWorkspaceForAuthenticatedScope(Number(req.params.workspaceId), user, req, res);
      if (!workspace) return;
      const profile = await storage.getWorkspaceRelevanceProfile(workspace.id, workspace.clientId);
      res.json({
        workspace,
        relevanceProfile: profile || null,
        effectiveProfile: workspaceRelevanceProfileFromRecords(workspace, profile),
      });
    } catch (err) {
      console.error("Workspace fetch failed:", err);
      res.status(500).json({ message: "Error fetching workspace" });
    }
  });

  app.get("/api/workspaces/:workspaceId/relevance-profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      if (!(await canReadWorkspaceRelevance(user, req))) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const workspace = await getWorkspaceForAuthenticatedScope(Number(req.params.workspaceId), user, req, res);
      if (!workspace) return;
      const profile = await storage.getWorkspaceRelevanceProfile(workspace.id, workspace.clientId);
      res.json({
        profile: profile || null,
        effectiveProfile: workspaceRelevanceProfileFromRecords(workspace, profile),
      });
    } catch (err) {
      console.error("Workspace relevance profile fetch failed:", err);
      res.status(500).json({ message: "Error fetching relevance profile" });
    }
  });

  app.put("/api/workspaces/:workspaceId/relevance-profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      if (!(await canManageWorkspaceRelevance(user, req))) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const workspace = await getWorkspaceForAuthenticatedScope(Number(req.params.workspaceId), user, req, res);
      if (!workspace) return;
      const parsed = workspaceRelevanceProfileInputSchema.parse(req.body);
      const existing = await storage.getWorkspaceRelevanceProfile(workspace.id, workspace.clientId);
      const profile = await storage.upsertWorkspaceRelevanceProfile({
        workspaceId: workspace.id,
        topics: parsed.topics ?? existing?.topics ?? [],
        subtopics: parsed.subtopics ?? existing?.subtopics ?? [],
        industries: parsed.industries ?? existing?.industries ?? [],
        entities: parsed.entities ?? existing?.entities ?? [],
        organizations: parsed.organizations ?? existing?.organizations ?? [],
        people: parsed.people ?? existing?.people ?? [],
        projects: parsed.projects ?? existing?.projects ?? [],
        events: parsed.events ?? existing?.events ?? [],
        multilingualAliases: parsed.multilingualAliases ?? existing?.multilingualAliases ?? [],
        inclusionTerms: parsed.inclusionTerms ?? existing?.inclusionTerms ?? [],
        exclusionTerms: parsed.exclusionTerms ?? existing?.exclusionTerms ?? [],
        impactTerms: parsed.impactTerms ?? existing?.impactTerms ?? [],
        contextualTerms: parsed.contextualTerms ?? existing?.contextualTerms ?? [],
        minimumConfidence: parsed.minimumConfidence ?? existing?.minimumConfidence ?? 60,
        includeContextualByDefault: parsed.includeContextualByDefault ?? existing?.includeContextualByDefault ?? false,
        contextualLabel: parsed.contextualLabel ?? existing?.contextualLabel ?? "Strategic Context",
        active: parsed.active ?? existing?.active ?? true,
      } as any, workspace.clientId);
      res.json({
        profile,
        effectiveProfile: workspaceRelevanceProfileFromRecords(workspace, profile),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid relevance profile" });
      }
      if (err instanceof TenantNotFoundError) return safeNotFound(res);
      console.error("Workspace relevance profile update failed:", err);
      res.status(500).json({ message: "Error updating relevance profile" });
    }
  });

  app.post("/api/workspaces/:workspaceId/relevance/preview", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      if (!(await canReadWorkspaceRelevance(user, req))) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const workspace = await getWorkspaceForAuthenticatedScope(Number(req.params.workspaceId), user, req, res);
      if (!workspace) return;
      const input = workspaceRelevancePreviewSchema.parse(req.body);
      if (!input.title && !input.summary && !input.content && !input.url) {
        return res.status(400).json({ message: "Preview requires at least a title, summary, content, or URL" });
      }
      const profile = await storage.getWorkspaceRelevanceProfile(workspace.id, workspace.clientId);
      const relevance = evaluateWorkspaceRelevance(input, workspaceRelevanceProfileFromRecords(workspace, profile));
      res.json({
        writes: false,
        workspaceId: workspace.id,
        relevance,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid preview article" });
      }
      console.error("Workspace relevance preview failed:", err);
      res.status(500).json({ message: "Error previewing relevance" });
    }
  });

  app.get("/api/workspaces/:workspaceId/relevance/review", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      if (!(await canAccessRelevanceReview(user, req))) {
        return res.status(403).json({ message: "Insufficient permissions for relevance review scope" });
      }
      const workspace = await getWorkspaceForAuthenticatedScope(Number(req.params.workspaceId), user, req, res);
      if (!workspace) return;
      const limit = req.query.limit ? Math.min(200, Math.max(1, parseInt(req.query.limit as string))) : 100;
      const includeContextual = booleanQuery(req.query.includeContextual);
      const items = await storage.getWorkspaceRelevanceReviewQueue(workspace.id, workspace.clientId, {
        includeContextual,
        limit,
      });
      const itemsWithHistory = await Promise.all(items.map(async (item: any) => ({
        ...item,
        history: await storage.getWorkspaceRelevanceHistory(workspace.id, item.articleId, workspace.clientId),
      })));
      res.json({ items: itemsWithHistory, total: itemsWithHistory.length });
    } catch (err) {
      console.error("Workspace relevance review queue failed:", err);
      res.status(500).json({ message: "Error fetching review queue" });
    }
  });

  app.patch("/api/workspaces/:workspaceId/articles/:articleId/relevance", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      if (!(await canAccessRelevanceReview(user, req))) {
        return res.status(403).json({ message: "Insufficient permissions for relevance review scope" });
      }
      const workspace = await getWorkspaceForAuthenticatedScope(Number(req.params.workspaceId), user, req, res);
      if (!workspace) return;
      const articleId = Number(req.params.articleId);
      if (!Number.isInteger(articleId) || articleId <= 0) {
        return res.status(400).json({ message: "Invalid article ID" });
      }
      const input = articleRelevanceUpdateSchema
        .omit({ workspaceId: true })
        .parse(req.body);
      const article = await storage.getArticle(articleId, workspace.clientId);
      if (!article) return safeNotFound(res);

      const updated = await storage.upsertArticleWorkspaceRelevance({
        articleId,
        workspaceId: workspace.id,
        clientId: workspace.clientId,
        relevanceStatus: input.relevanceStatus,
        confidence: 100,
        shortReason: input.relevanceReason || input.reviewNote || "Manually reviewed by analyst.",
        matchedScope: { manual_review: ["analyst_decision"] },
        principalCountryCodes: [],
        materiallyAffectedCountryCodes: [],
        supportingSignals: [{ type: "manual_review", field: "analyst", term: "decision" }],
        evaluationMethod: "manual",
        evaluatorVersion: RELEVANCE_ENGINE_VERSION,
        manualOverride: !input.reopen,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote || input.relevanceReason || null,
        reopenedAt: input.reopen ? new Date() : null,
        evaluatedAt: new Date(),
      } as any);
      const history = await storage.getWorkspaceRelevanceHistory(workspace.id, articleId, workspace.clientId);
      await db.delete(analyticsCache).where(eq(analyticsCache.clientId, workspace.clientId));
      runAnalyticsComputation().catch(e => console.error("[Analytics] Post-workspace-relevance-review recomputation error:", e));
      res.json({ relevance: updated, history });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid relevance update" });
      }
      console.error("Workspace article relevance update failed:", err);
      res.status(500).json({ message: "Article relevance update failed" });
    }
  });

  // === ARTICLES ===
  app.get(api.articles.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user as any;
      const clientId = resolveClientId(user, req);
      const scopedSourceIds = await getUserSourceIds(user, req);
      const sourceNameFilter = typeof req.query.sourceName === "string" ? req.query.sourceName : undefined;
      const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
      if (!workspaceScope) return;
      const sortParam = req.query.sort as string | undefined;
      const sort = sortParam && ["newest", "oldest", "recently_added", "source_az", "title_az", "engagement"].includes(sortParam)
        ? sortParam as any
        : "newest";
      const params = {
        search: req.query.search as string,
        sourceId: req.query.sourceId && !isNaN(parseInt(req.query.sourceId as string)) ? parseInt(req.query.sourceId as string) : undefined,
        sourceIds: scopedSourceIds,
        sourceName: sourceNameFilter,
        clientId: clientId || undefined,
        sort,
        sentiment: req.query.sentiment as string,
        category: req.query.category as string,
        priority: req.query.priority as string,
        province: req.query.province as string,
        relevanceStatus: isArticleRelevanceStatus(req.query.relevanceStatus) ? req.query.relevanceStatus : undefined,
        relevanceStatuses: relevanceQueryStatuses(req.query.relevanceStatuses),
        ...workspaceScope,
        includeContextual: booleanQuery(req.query.includeContextual),
        includeNeedsReview: booleanQuery(req.query.includeNeedsReview),
        includeNotRelevant: booleanQuery(req.query.includeNotRelevant),
        sourceType: req.query.sourceType as string,
        officialSources: booleanQuery(req.query.officialSources),
        country: req.query.country as string,
        topic: req.query.topic as string,
        lang: req.query.lang as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        page: req.query.page ? Math.max(1, parseInt(req.query.page as string)) : 1,
        limit: req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit as string))) : 20,
      };

      const result = await storage.getArticles(params);

      const targetLang = params.lang?.split("-")[0];
      if (targetLang && targetLang !== "en") {
        const articlesToTranslate = result.items.filter((article) => {
          const articleLang = (article.language || "en").split("-")[0].toLowerCase();
          return articleLang !== targetLang;
        });

        await Promise.all(articlesToTranslate.map(async (article) => {
          try {
            const articleClientId = article.clientId;
            const cached = await storage.getArticleTranslation(article.id, targetLang, clientId || undefined);
            if (cached && cached.status === "completed") {
              article.title = cached.translatedTitle || article.title;
              article.summary = cached.translatedSummary || article.summary;
            } else if (!cached || cached.status === "failed") {
              if (!cached) {
                await storage.createArticleTranslation({
                  articleId: article.id,
                  targetLanguage: targetLang,
                  status: "pending",
                  translatedTitle: null,
                  translatedContent: null,
                  translatedSummary: null,
                  clientId: articleClientId,
                });
              } else {
                await storage.updateArticleTranslation(cached.id, { status: "pending" }, clientId || undefined);
              }
              const { enqueueJob } = await import("./processing-queue");
              await enqueueJob("TRANSLATE_ARTICLE", { articleId: article.id, targetLanguage: targetLang }, { maxAttempts: 2 });
            }
          } catch (e) {
            console.error(`Translation lookup failed for article ${article.id}:`, e);
          }
        }));
      }

      res.json({
        items: result.items,
        total: result.total,
        page: params.page,
        limit: params.limit,
      });
    } catch (err) {
      res.status(500).json({ message: "Error fetching articles" });
    }
  });

  app.get("/api/articles/urgent", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user as any;
      const clientId = resolveClientId(user, req);
      const scopedSourceIds = await getUserSourceIds(user, req);
      if (Array.isArray(scopedSourceIds) && scopedSourceIds.length === 0) {
        return res.json([]);
      }
      const since = req.query.since as string;
      const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
      if (!workspaceScope) return;
      const result = await storage.getArticles({
        priorities: ["urgent", "critical"],
        sourceIds: scopedSourceIds,
        clientId: clientId || undefined,
        ...workspaceScope,
        startDate: since || new Date(Date.now() - 3600000).toISOString(),
        sort: "newest",
        limit: 10,
        page: 1,
      });
      res.json(result.items);
    } catch (err) {
      console.error("Error fetching urgent articles:", err);
      res.json([]);
    }
  });

  app.get("/api/articles/live-status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user as any;
      const clientId = resolveClientId(user, req);
      const scopedSourceIds = await getUserSourceIds(user, req);
      const sourceNameFilter = typeof req.query.sourceName === "string" ? req.query.sourceName : undefined;
      const sortParam = req.query.sort as string | undefined;
      const sort = sortParam && ["newest", "oldest", "recently_added", "source_az", "title_az", "engagement"].includes(sortParam)
        ? sortParam as any
        : "newest";
      const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
      if (!workspaceScope) return;
      const result = await storage.getArticles({
        search: req.query.search as string,
        sourceId: req.query.sourceId && !isNaN(parseInt(req.query.sourceId as string)) ? parseInt(req.query.sourceId as string) : undefined,
        sourceIds: scopedSourceIds,
        sourceName: sourceNameFilter,
        clientId: clientId || undefined,
        sort,
        sentiment: req.query.sentiment as string,
        category: req.query.category as string,
        priority: req.query.priority as string,
        province: req.query.province as string,
        workflowStatus: req.query.workflowStatus as string,
        manualTag: req.query.manualTag as string,
        sourceType: req.query.sourceType as string,
        officialSources: booleanQuery(req.query.officialSources),
        country: req.query.country as string,
        topic: req.query.topic as string,
        ...workspaceScope,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        page: 1,
        limit: 20,
      });
      res.json({
        total: result.total,
        items: result.items.map(article => ({
          id: article.id,
          publishedAt: article.publishedAt,
          ingestedAt: article.ingestedAt,
          createdAt: article.createdAt,
        })),
      });
    } catch (err) {
      console.error("Error checking live article status:", err);
      res.status(500).json({ message: "Error checking live article status" });
    }
  });

  app.get("/api/articles/export", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const scopedSourceIds = await getUserSourceIds(user, req);
    const sourceNameFilter = typeof req.query.sourceName === "string" ? req.query.sourceName : undefined;
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const sortParam = req.query.sort as string | undefined;
    const sort = sortParam && ["newest", "oldest", "recently_added", "source_az", "title_az", "engagement"].includes(sortParam)
      ? sortParam as any
      : "newest";
    const params = {
      search: req.query.search as string,
      sourceId: req.query.sourceId ? parseInt(req.query.sourceId as string) : undefined,
      sourceIds: scopedSourceIds,
      sourceName: sourceNameFilter,
      clientId: clientId || undefined,
      sort,
      sentiment: req.query.sentiment as string,
      category: req.query.category as string,
      priority: req.query.priority as string,
      province: req.query.province as string,
      workflowStatus: req.query.workflowStatus as string,
      manualTag: req.query.manualTag as string,
      sourceType: req.query.sourceType as string,
      officialSources: booleanQuery(req.query.officialSources),
      ...workspaceScope,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: 1,
      limit: 1000,
    };
    const result = await storage.getArticles(params);
    const csvHeader = "ID,Title,Source,Collected Via,Category,Priority,Province,Workflow Status,Manual Tags,Sentiment,Published,URL\n";
    const csvRows = result.items.map(a => {
      const title = `"${(a.title || "").replace(/"/g, '""')}"`;
      const source = `"${(a.subSource || a.source?.name || "").replace(/"/g, '""')}"`;
      const collectedVia = `"${(a.subSource ? a.source?.name || "" : "").replace(/"/g, '""')}"`;
      const cat = a.category || "other";
      const priority = (a as any).priority || "routine";
      const province = a.province || "";
      const workflowStatus = a.workflowStatus || "new";
      const manualTags = `"${((a.manualTags || []).join("; ")).replace(/"/g, '""')}"`;
      const sentiment = a.sentimentLabel || "neutral";
      const published = a.publishedAt ? new Date(a.publishedAt).toISOString() : "";
      const url = a.url || "";
      return `${a.id},${title},${source},${collectedVia},${cat},${priority},${province},${workflowStatus},${manualTags},${sentiment},${published},${url}`;
    }).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=nws360-articles.csv");
    res.send(csvHeader + csvRows);
  });

  async function buildReportBasketParams(req: any, res: any, user: any, limit: number) {
    const clientId = resolveClientId(user, req);
    const scopedSourceIds = await getUserSourceIds(user, req);
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) {
      return null;
    }
    const sourceNameFilter = typeof req.query.sourceName === "string" ? req.query.sourceName : undefined;

    const category = req.query.category as string | undefined;
    if (category && !isArticleCategoryCode(category)) {
      throw new Error(`Invalid category. Use one of: ${ARTICLE_CATEGORIES.map(item => item.code).join(", ")}`);
    }

    const priority = req.query.priority as string | undefined;
    if (priority && !isArticlePriorityCode(priority)) {
      throw new Error(`Invalid priority. Use one of: ${ARTICLE_PRIORITIES.map(item => item.code).join(", ")}`);
    }

    const province = req.query.province as string | undefined;
    if (province && !isIraqProvinceCode(province)) {
      throw new Error(`Invalid province. Use one of: ${IRAQ_PROVINCES.map(item => item.code).join(", ")}`);
    }

    const sortParam = req.query.sort as string | undefined;
    const sort = sortParam && ["newest", "oldest", "recently_added", "source_az", "title_az", "engagement"].includes(sortParam)
      ? sortParam as any
      : "newest";

    return {
      search: req.query.search as string,
      sourceName: sourceNameFilter,
      sourceIds: scopedSourceIds,
      clientId: clientId || undefined,
      sort,
      category,
      priority,
      province,
      sourceType: req.query.sourceType as string,
      ...workspaceScope,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      workflowStatus: "for_report",
      page: req.query.page ? Math.max(1, parseInt(req.query.page as string)) : 1,
      limit,
    };
  }

  function csvCell(value: unknown): string {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function reportArticleSummary(article: any): string {
    return String(article.summary || article.contentClean || article.content || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
  }

  app.get("/api/reports/basket", requireCapability(CAPS.ARTICLE_VIEW), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      const requestedLimit = parseInt(req.query.limit as string);
      const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
      const params = await buildReportBasketParams(req, res, user, limit);
      if (!params) return;
      const result = await storage.getArticles(params);
      res.json({
        items: result.items,
        total: result.total,
        page: params.page,
        limit: params.limit,
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid ")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Report basket fetch failed:", err);
      res.status(500).json({ message: "Error fetching report basket" });
    }
  });

  app.get("/api/reports/basket/export", requireCapability(CAPS.ARTICLE_EXPORT), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    try {
      const clientId = resolveClientId(user, req);
      const [tenantSettings, tenant] = await Promise.all([
        clientId ? storage.getClientSettings(clientId) : Promise.resolve(undefined),
        clientId ? storage.getClient(clientId) : Promise.resolve(undefined),
      ]);
      const embassyProfile = buildClientEmbassyProfile(tenant, tenantSettings);
      const params = await buildReportBasketParams(req, res, user, 1000);
      if (!params) return;
      const result = await storage.getArticles({ ...params, page: 1, limit: 1000 });
      const format = String(req.query.format || tenantSettings?.reportExportFormat || "txt").toLowerCase();
      const includeSummaries = req.query.includeSummaries === undefined
        ? tenantSettings?.reportIncludeSummaries !== false
        : String(req.query.includeSummaries).toLowerCase() !== "false";
      const dateLabel = new Date().toISOString().slice(0, 10);

      if (format === "csv") {
        const header = [
          "ID",
          "Title",
          "Source",
          "Collected Via",
          "Category",
          "Priority",
          "Province",
          "Workflow Status",
          "Manual Tags",
          "Published",
          "URL",
          "Summary",
        ].join(",");
        const rows = result.items.map((article: any) => {
          const source = article.subSource || article.source?.name || "";
          const collectedVia = article.subSource ? article.source?.name || "" : "";
          return [
            article.id,
            csvCell(article.title),
            csvCell(source),
            csvCell(collectedVia),
            csvCell(getArticleCategoryLabel(article.category || "other", embassyProfile)),
            csvCell(getArticlePriorityLabel(article.priority || "routine")),
            csvCell(getIraqProvinceLabel(article.province)),
            csvCell(getArticleWorkflowStatusLabel(article.workflowStatus || "for_report")),
            csvCell(Array.isArray(article.manualTags) ? article.manualTags.join("; ") : ""),
            csvCell(article.publishedAt ? new Date(article.publishedAt).toISOString() : ""),
            csvCell(article.url || ""),
            csvCell(includeSummaries ? reportArticleSummary(article) : ""),
          ].join(",");
        });
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=nws360-report-basket-${dateLabel}.csv`);
        return res.send([header, ...rows].join("\n"));
      }

      const lines: string[] = [
        "NWS360 Report Basket",
        `Generated: ${new Date().toISOString()}`,
        `Items: ${result.items.length}`,
        "",
      ];

      result.items.forEach((article: any, index: number) => {
        const source = article.subSource || article.source?.name || "Unknown";
        const collectedVia = article.subSource && article.source?.name ? ` via ${article.source.name}` : "";
        const tags = Array.isArray(article.manualTags) && article.manualTags.length > 0
          ? article.manualTags.join(", ")
          : "";

        lines.push(`${index + 1}. ${article.title || "Untitled"}`);
        lines.push(`Source: ${source}${collectedVia}`);
        lines.push(`Published: ${article.publishedAt ? new Date(article.publishedAt).toISOString() : "Unknown"}`);
        lines.push(`Category: ${getArticleCategoryLabel(article.category || "other", embassyProfile)}`);
        lines.push(`Priority: ${getArticlePriorityLabel(article.priority || "routine")}`);
        if (article.province) lines.push(`Province: ${getIraqProvinceLabel(article.province)}`);
        if (tags) lines.push(`Tags: ${tags}`);
        if (article.url) lines.push(`URL: ${article.url}`);
        const summary = includeSummaries ? reportArticleSummary(article) : "";
        if (summary) lines.push(`Summary: ${summary}`);
        lines.push("");
      });

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=nws360-report-basket-${dateLabel}.txt`);
      res.send(lines.join("\n"));
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid ")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Report basket export failed:", err);
      res.status(500).json({ message: "Report basket export failed" });
    }
  });

  app.get(api.articles.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid article ID" });
    const article = await storage.getArticle(id, clientId || undefined);
    if (!article) return res.status(404).json({ message: "Article not found" });
    res.json(article);
  });

  app.patch("/api/articles/:id/workflow", requireCapability(CAPS.ARTICLE_EDIT), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid article ID" });

    try {
      const input = articleWorkflowUpdateSchema.parse(req.body);
      const updates = buildArticleWorkflowUpdates(input);
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No article fields provided" });
      }

      const article = await storage.getArticle(id, clientId);
      if (!article) return safeNotFound(res);

      const scopedSourceIds = await getUserSourceIds(user, req);
      if (Array.isArray(scopedSourceIds) && article.sourceId && !scopedSourceIds.includes(article.sourceId)) {
        return safeNotFound(res);
      }

      const updated = await storage.updateArticle(id, updates as any);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid article update" });
      }
      if (err instanceof Error && err.message.startsWith("Invalid ")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Article workflow update failed:", err);
      res.status(500).json({ message: "Article update failed" });
    }
  });

  app.patch("/api/articles/:id/relevance", requireCapability(CAPS.ARTICLE_EDIT), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid article ID" });

    try {
      const input = articleRelevanceUpdateSchema.parse(req.body);
      const article = await storage.getArticle(id, clientId);
      if (!article) return safeNotFound(res);

      const scopedSourceIds = await getUserSourceIds(user, req);
      if (Array.isArray(scopedSourceIds) && article.sourceId && !scopedSourceIds.includes(article.sourceId)) {
        return safeNotFound(res);
      }

      const workspace = await storage.getWorkspace(input.workspaceId);
      if (!workspace || workspace.clientId !== clientId) return safeNotFound(res);

      const updated = await storage.upsertArticleWorkspaceRelevance({
        articleId: id,
        workspaceId: input.workspaceId,
        clientId,
        relevanceStatus: input.relevanceStatus,
        confidence: 100,
        shortReason: input.relevanceReason || input.reviewNote || "Manually reviewed by analyst.",
        matchedScope: { manual_review: ["analyst_decision"] },
        principalCountryCodes: [],
        materiallyAffectedCountryCodes: [],
        supportingSignals: [{ type: "manual_review", field: "analyst", term: "decision" }],
        evaluationMethod: "manual",
        evaluatorVersion: RELEVANCE_ENGINE_VERSION,
        manualOverride: !input.reopen,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote || input.relevanceReason || null,
        reopenedAt: input.reopen ? new Date() : null,
        evaluatedAt: new Date(),
      } as any);

      await db.delete(analyticsCache).where(eq(analyticsCache.clientId, clientId));
      runAnalyticsComputation().catch(e => console.error("[Analytics] Post-relevance-review recomputation error:", e));
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid relevance update" });
      }
      console.error("Article relevance update failed:", err);
      res.status(500).json({ message: "Article relevance update failed" });
    }
  });

  app.post("/api/articles/bulk-workflow", requireCapability(CAPS.ARTICLE_EDIT), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });

    try {
      const input = bulkArticleWorkflowUpdateSchema.parse(req.body);
      const { ids, ...workflowInput } = input;
      const updates = buildArticleWorkflowUpdates(workflowInput);
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No article fields provided" });
      }

      const uniqueIds = Array.from(new Set(ids));
      const scopedSourceIds = await getUserSourceIds(user, req);
      const scopedArticles = await storage.getArticlesByIds(uniqueIds, clientId);
      const allowedArticles = scopedArticles.filter((article) =>
        !Array.isArray(scopedSourceIds) || !article.sourceId || scopedSourceIds.includes(article.sourceId)
      );

      let updated = 0;
      for (const article of allowedArticles) {
        const result = await storage.updateArticle(article.id, updates as any);
        if (result) updated++;
      }

      if (updated > 0 && Object.prototype.hasOwnProperty.call(updates, "category")) {
        await db.delete(analyticsCache).where(eq(analyticsCache.clientId, clientId));
        runAnalyticsComputation().catch(e => console.error("[Analytics] Post-bulk-workflow recomputation error:", e));
      }

      res.json({ requested: uniqueIds.length, matched: allowedArticles.length, updated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid bulk article update" });
      }
      if (err instanceof Error && err.message.startsWith("Invalid ")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Bulk article workflow update failed:", err);
      res.status(500).json({ message: "Bulk article update failed" });
    }
  });

  app.get("/api/feed/views", requireCapability(CAPS.FEED_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });

    const views = await storage.getSavedFeedViews(clientId);
    res.json(views);
  });

  app.post("/api/feed/views", requireCapability(CAPS.FEED_FILTER), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });

    try {
      const input = savedFeedViewInputSchema.parse(req.body);
      const filters = normalizeSavedFeedViewFilters(input.filters);
      if (!(await validateSavedFeedViewWorkspace(filters, clientId, res))) return;
      const existing = (await storage.getSavedFeedViews(clientId))
        .find((view) => view.name.trim().toLowerCase() === input.name.toLowerCase());

      const payload = {
        name: input.name,
        filters,
        isShared: input.isShared ?? true,
        userId: user.id,
        clientId,
      };

      const view = existing
        ? await storage.updateSavedFeedView(existing.id, payload, clientId)
        : await storage.createSavedFeedView(payload);

      res.status(existing ? 200 : 201).json(view);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid saved view" });
      }
      if (err instanceof Error && err.message.startsWith("Invalid ")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Saved feed view create failed:", err);
      res.status(500).json({ message: "Saved view failed" });
    }
  });

  app.patch("/api/feed/views/:id", requireCapability(CAPS.FEED_FILTER), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid saved view ID" });

    try {
      const input = savedFeedViewInputSchema.partial().parse(req.body);
      const updates: Record<string, any> = {};
      if (input.name) updates.name = input.name;
      if (input.filters) {
        updates.filters = normalizeSavedFeedViewFilters(input.filters);
        if (!(await validateSavedFeedViewWorkspace(updates.filters, clientId, res))) return;
      }
      if (typeof input.isShared === "boolean") updates.isShared = input.isShared;
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No saved view fields provided" });

      const updated = await storage.updateSavedFeedView(id, updates, clientId);
      if (!updated) return safeNotFound(res);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid saved view" });
      }
      if (err instanceof Error && err.message.startsWith("Invalid ")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("Saved feed view update failed:", err);
      res.status(500).json({ message: "Saved view update failed" });
    }
  });

  app.delete("/api/feed/views/:id", requireCapability(CAPS.FEED_FILTER), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid saved view ID" });

    await storage.deleteSavedFeedView(id, clientId);
    res.sendStatus(204);
  });

  // === KEYWORDS (tenant-scoped) ===
  app.get(api.keywords.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json([]);
    const kws = await storage.getKeywords(clientId || undefined);
    res.json(kws);
  });

  app.post(api.keywords.create.path, requireCapability(CAPS.KEYWORDS_ADD), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });
    try {
      const input = api.keywords.create.input.parse(req.body);
      const keyword = await storage.createKeyword({ ...input, clientId });
      res.status(201).json(keyword);
    } catch (err) {
      res.status(400).json({ message: "Invalid Input" });
    }
  });

  app.delete(api.keywords.delete.path, requireCapability(CAPS.KEYWORDS_DELETE), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    await storage.deleteKeyword(id, clientId || undefined);
    res.sendStatus(204);
  });

  // === ARTICLE TRANSLATION (cached + async) ===
  app.post("/api/articles/:id/translate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid article ID" });
    const { targetLanguage } = req.body;

    if (!targetLanguage) {
      return res.status(400).json({ message: "targetLanguage is required" });
    }

    const article = await storage.getArticle(id, clientId || undefined);
    if (!article) return res.status(404).json({ message: "Article not found" });

    const cached = await storage.getArticleTranslation(id, targetLanguage, clientId || undefined);
    if (cached && cached.status === "completed") {
      return res.json({
        translatedTitle: cached.translatedTitle || article.title,
        translatedContent: cached.translatedContent || article.content,
        translatedSummary: cached.translatedSummary || article.summary,
        targetLanguage,
        cached: true,
      });
    }

    if (cached && cached.status === "pending") {
      return res.json({
        translatedTitle: article.title,
        translatedContent: article.content,
        translatedSummary: article.summary,
        targetLanguage,
        pending: true,
        message: "Translation is being processed",
      });
    }

    if (cached && cached.status === "failed") {
      await storage.updateArticleTranslation(cached.id, { status: "pending" }, clientId || undefined);
      const { enqueueJob } = await import("./processing-queue");
      await enqueueJob("TRANSLATE_ARTICLE", { articleId: id, targetLanguage }, { maxAttempts: 2 });
      return res.json({
        translatedTitle: article.title,
        translatedContent: article.content,
        translatedSummary: article.summary,
        targetLanguage,
        pending: true,
        message: "Translation retrying",
      });
    }

    try {
      await storage.createArticleTranslation({
        articleId: id,
        targetLanguage,
        status: "pending",
        translatedTitle: null,
        translatedContent: null,
        translatedSummary: null,
        clientId: article.clientId,
      });

      const { enqueueJob } = await import("./processing-queue");
      await enqueueJob("TRANSLATE_ARTICLE", { articleId: id, targetLanguage }, { maxAttempts: 2 });

      res.json({
        translatedTitle: article.title,
        translatedContent: article.content,
        translatedSummary: article.summary,
        targetLanguage,
        pending: true,
        message: "Translation queued",
      });
    } catch (e) {
      console.error("Translation enqueue failed:", e);
      res.status(500).json({ message: "Translation failed" });
    }
  });

  // === RE-ANALYZE ARTICLES ===
  app.post("/api/reanalyze", requireAiEnabled(), requireCapability(CAPS.INTELLIGENCE_RUN), async (req, res) => {

    try {
      const user = req.user as any;
      const clientId = resolveClientId(user, req);

      if (!clientId) return res.status(400).json({ success: false, message: "No client context" });

      const budgetCheck = await checkClientAiBudget(clientId);
      if (!budgetCheck.allowed) {
        return res.status(403).json({ success: false, message: `AI analysis blocked: ${budgetCheck.reason}` });
      }

      const scopedSourceIds = await getUserSourceIds(user, req);
      const allArticles = await storage.getArticles({ limit: 500, sourceIds: scopedSourceIds, clientId: clientId || undefined });
      const unanalyzed = allArticles.items.filter(
        a => a.aiAnalysisStatus === "skipped" || ((!a.sentimentLabel || a.sentimentLabel === "neutral") && a.sentimentScore === 0 && (!a.keywords || a.keywords.length === 0))
      );

      const toEnqueue = unanalyzed.slice(0, 100);
      const batchId = `reanalyze-${Date.now()}`;
      let enqueued = 0;

      for (const article of toEnqueue) {
        try {
          const innerBudget = await checkClientAiBudget(clientId);
          if (!innerBudget.allowed) {
            console.warn(`[Reanalyze] Budget exhausted mid-batch after ${enqueued} articles: ${innerBudget.reason}`);
            break;
          }
          await db.update(articles)
            .set({ aiAnalysisStatus: "pending" })
            .where(eq(articles.id, article.id));
          await enqueueJob("ANALYZE_ARTICLE", { articleId: article.id }, { maxAttempts: 3 });
          enqueued++;
        } catch (e) {
          console.error(`[Reanalyze] Failed to enqueue article ${article.id}:`, e);
        }
      }

      console.log(`[Reanalyze] Enqueued ${enqueued}/${toEnqueue.length} articles (batch: ${batchId})`);

      res.json({ success: true, batchId, enqueued, total: unanalyzed.length, message: "Articles queued for re-analysis. Check queue stats for progress." });
    } catch (err) {
      console.error("[Reanalyze] Error:", err);
      res.status(500).json({ success: false, message: "Re-analysis failed" });
    }
  });

  // === ANALYTICS ===
  app.get(api.analytics.stats.path, requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const stats = await storage.getStats(scopedSourceIds, toWorkspaceAnalyticsScope(clientId, workspaceScope));
    res.json(stats);
  });

  app.get(api.analytics.sentimentTrend.path, requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const trend = await storage.getSentimentTrend(scopedSourceIds, toWorkspaceAnalyticsScope(clientId, workspaceScope));
    res.json(trend);
  });

  app.get("/api/analytics/content-volume", requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const data = await storage.getContentVolume(startDate, endDate, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
    res.json(data);
  });

  app.get("/api/analytics/trending-topics", requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const data = await storage.getTrendingTopics(startDate, endDate, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
    res.json(data);
  });

  app.get("/api/analytics/keyword-analysis", requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const data = await storage.getKeywordAnalysis(startDate, endDate, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
    res.json(data);
  });

  app.get("/api/analytics/sentiment-reports", requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const data = await storage.getSentimentReports(startDate, endDate, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
    res.json(data);
  });

  app.get("/api/analytics/source-behavior", requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const data = await storage.getSourceBehavior(startDate, endDate, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
    res.json(data);
  });

  app.get("/api/analytics/narrative-comparison", requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const topic = req.query.topic as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) return res.status(400).json({ message: "topic is required" });
    if (!startDate || !endDate || isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) return res.status(400).json({ message: "valid startDate and endDate required" });
    try {
      const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
      if (!workspaceScope) return;
      const data = await storage.getNarrativeComparison(topic.trim(), startDate, endDate, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
      res.json(data);
    } catch (e: any) {
      console.error("Narrative comparison error:", e.message);
      res.status(500).json({ message: "Failed to fetch narrative comparison" });
    }
  });

  app.get("/api/analytics/daily-brief", requireAiEnabled(), requireCapability(CAPS.INTELLIGENCE_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
    if (isNaN(Date.parse(dateStr))) return res.status(400).json({ message: "valid date required" });
    try {
      const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
      if (!workspaceScope) return;
      const data = await storage.getAnalyticsDailyBrief(dateStr, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
      res.json(data);
    } catch (e: any) {
      console.error("Daily brief error:", e.message);
      res.status(500).json({ message: "Failed to fetch daily brief" });
    }
  });

  app.get("/api/analytics/keyword-detail", requireCapability(CAPS.ANALYTICS_VIEW), async (req, res) => {
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const clientId = resolveClientId(user, req);
    const keyword = req.query.keyword as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!keyword || typeof keyword !== "string" || keyword.trim().length === 0) return res.status(400).json({ message: "keyword is required" });
    if (!startDate || !endDate || isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) return res.status(400).json({ message: "valid startDate and endDate required" });
    try {
      const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
      if (!workspaceScope) return;
      const data = await storage.getKeywordDetail(keyword.trim(), startDate, endDate, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
      res.json(data);
    } catch (e: any) {
      console.error("Keyword detail error:", e.message);
      res.status(500).json({ message: "Failed to fetch keyword detail" });
    }
  });

  // === BOOKMARKS ===
  app.get("/api/bookmarks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).id;
    const articleIds = await storage.getBookmarks(userId);
    res.json(articleIds);
  });

  app.get("/api/bookmarks/articles", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const userId = user.id;
    try {
      const articleIds = await storage.getBookmarks(userId);
      if (articleIds.length === 0) return res.json([]);
      const bookmarkedArticles = await storage.getArticlesByIds(articleIds, clientId || undefined);
      res.json(bookmarkedArticles);
    } catch (err) {
      console.error("Error fetching bookmarked articles:", err);
      res.status(500).json({ message: "Error fetching bookmarked articles" });
    }
  });

  app.post("/api/bookmarks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const userId = user.id;
    const clientId = resolveClientId(user, req);
    const { articleId } = req.body;
    if (!articleId) return res.status(400).json({ message: "articleId required" });
    const article = await storage.getArticle(Number(articleId), clientId || undefined);
    if (!article) return safeNotFound(res);
    const bookmark = await storage.addBookmark(userId, articleId);
    res.status(201).json(bookmark);
  });

  app.delete("/api/bookmarks/:articleId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).id;
    const articleId = parseInt(req.params.articleId);
    await storage.removeBookmark(userId, articleId);
    res.sendStatus(204);
  });

  // === BULK ARTICLE OPERATIONS ===
  app.post("/api/articles/bulk-delete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!isSystemAdmin(user)) return res.status(403).json({ message: "Admin access required" });
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids array required" });
    const deleted = await storage.deleteArticles(ids, clientId);
    if (deleted > 0) {
      runAnalyticsComputation().catch(e => console.error("[Analytics] Post-article-delete recomputation error:", e));
    }
    res.json({ deleted });
  });

  app.post("/api/articles/delete-all", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!isSystemAdmin(user)) return res.status(403).json({ message: "Admin access required" });
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });
    const deleted = await storage.deleteAllArticles(clientId);
    if (deleted > 0) {
      runAnalyticsComputation().catch(e => console.error("[Analytics] Post-delete-all recomputation error:", e));
    }
    res.json({ deleted });
  });

  app.post("/api/articles/bulk-categorize", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!isSystemAdmin(user)) return res.status(403).json({ message: "Admin access required" });
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });
    const { ids, category } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !category) return res.status(400).json({ message: "ids and category required" });
    if (!isArticleCategoryCode(category)) {
      return res.status(400).json({ message: `Invalid category. Use one of: ${ARTICLE_CATEGORIES.map(item => item.code).join(", ")}` });
    }
    const updated = await storage.updateArticlesCategory(ids, category, clientId);
    res.json({ updated });
  });

  // === USER MANAGEMENT ===
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!resolveClientId(user, req)) return res.json([]);
    const allUsers = await getUsersForTenantScope(user, req);
    const safeUsers = allUsers.map(toPublicUser);
    res.json(safeUsers);
  });

  app.post("/api/users", requireCapability(CAPS.USERS_INVITE), async (req, res) => {
    const currentUser = req.user as any;
    const { username, password, role, clientId: bodyClientId, userType: bodyUserType } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password required" });

    let resolvedClientId = resolveClientId(currentUser, req);
    if (!resolvedClientId && isSystemAdmin(currentUser) && bodyClientId) {
      resolvedClientId = Number(bodyClientId);
    }
    if (!resolvedClientId) {
      return res.status(400).json({ message: "Please select a tenant/client to assign this user to" });
    }
    if (resolvedClientId) {
      const sub = await storage.getSubscription(resolvedClientId);
      if (sub) {
        const activeCount = await storage.getActiveUserCount(resolvedClientId);
        if (sub.maxUsers > 0 && activeCount >= sub.maxUsers) {
          return res.status(403).json({ message: `Seat limit reached (${activeCount}/${sub.maxUsers}). Upgrade your plan to add more users.` });
        }
      }
    }

    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) return res.status(400).json({ message: "Username already exists" });

    let assignedRole = SYSTEM_ROLES.CLIENT_USER;
    const tenantRoles = [SYSTEM_ROLES.CLIENT_ADMIN, SYSTEM_ROLES.CLIENT_USER, SYSTEM_ROLES.READONLY_USER];
    if (isSystemAdmin(currentUser) && role && tenantRoles.includes(role)) {
      assignedRole = role;
    }

    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    const hashedPassword = `${salt}:${buf.toString("hex")}`;

    const validUserTypes = ["reader", "analyst", "editor", "monitor", "executive", "integrations_manager"];
    const resolvedUserType = bodyUserType && validUserTypes.includes(bodyUserType) ? bodyUserType : "reader";

    const newUser = await storage.createUser({
      username,
      password: hashedPassword,
      role: assignedRole,
      userScope: "tenant",
      parentId: currentUser.id,
      clientId: resolvedClientId,
      userType: resolvedUserType,
    });

    res.status(201).json(toPublicUser(newUser));
  });

  app.patch("/api/users/:id/role", requireCapability(CAPS.USERS_ASSIGN_ROLES), async (req, res) => {
    const currentUser = req.user as any;
    const id = parseInt(req.params.id);
    if (id === currentUser.id) return res.status(400).json({ message: "Cannot change your own role" });

    const targetUser = await getScopedUserOrNotFound(id, currentUser, req, res);
    if (!targetUser) return;

    const { role } = req.body;
    const validRoles = Object.values(SYSTEM_ROLES);
    if (!role || !validRoles.includes(role)) return res.status(400).json({ message: "Invalid role" });
    const selectedClientId = resolveClientId(currentUser, req);
    if (selectedClientId && role === SYSTEM_ROLES.SYSTEM_ADMIN) {
      return res.status(400).json({ message: "Tenant staff cannot use platform admin role" });
    }
    if (!isSystemAdmin(currentUser) && role === SYSTEM_ROLES.SYSTEM_ADMIN) {
      return res.status(403).json({ message: "Cannot assign platform admin role" });
    }
    const updated = await storage.updateUserRole(id, role);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(toPublicUser(updated));
  });

  app.patch("/api/users/:id/user-type", requireCapability(CAPS.USERS_EDIT), async (req, res) => {
    const currentUser = req.user as any;
    const id = parseInt(req.params.id);
    if (id === currentUser.id) return res.status(400).json({ message: "Cannot change your own user type" });

    const targetUser = await getScopedUserOrNotFound(id, currentUser, req, res);
    if (!targetUser) return;

    const { userType } = req.body;
    const validUserTypes = ["reader", "analyst", "editor", "monitor", "executive", "integrations_manager"];
    if (!userType || !validUserTypes.includes(userType)) return res.status(400).json({ message: "Invalid user type" });

    const updated = await storage.updateUserType(id, userType);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(toPublicUser(updated));
  });

  app.patch("/api/users/:id/password", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const currentUser = req.user as any;
    if (!isSystemAdmin(currentUser)) {
      return res.status(403).json({ message: "Only system admins can reset passwords" });
    }
    const id = parseInt(req.params.id);
    if (id === currentUser.id) return res.status(400).json({ message: "Use your account settings to change your own password" });
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ message: "Password must be at least 4 characters" });
    const targetUser = await getScopedUserOrNotFound(id, currentUser, req, res);
    if (!targetUser) return;
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    const hashedPassword = `${salt}:${buf.toString("hex")}`;
    await storage.updateUserPassword(id, hashedPassword);
    res.json({ message: "Password updated successfully" });
  });

  app.delete("/api/users/:id", requireCapability(CAPS.USERS_DISABLE), async (req, res) => {
    const currentUser = req.user as any;
    const id = parseInt(req.params.id);
    if (id === currentUser.id) return res.status(400).json({ message: "Cannot delete yourself" });

    const targetUser = await getScopedUserOrNotFound(id, currentUser, req, res);
    if (!targetUser) return;

    await storage.deleteUser(id);
    res.sendStatus(204);
  });

  // === SOURCE HEALTH ===
  app.get("/api/source-health", requireCapability(CAPS.SOURCE_HEALTH_VIEW), async (req, res) => {
    try {
      const user = req.user as any;
      const scopedSourceIds = await getUserSourceIds(user, req);
      const health = await storage.getSourceHealth(scopedSourceIds);
      res.json(health);
    } catch (error) {
      console.error("[SourceHealth] Failed to load source health:", error);
      res.status(500).json({ message: "Source health unavailable" });
    }
  });

  app.get("/api/source-health/:sourceId/logs", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const sourceId = parseInt(req.params.sourceId);
    const scopedSourceIds = await getUserSourceIds(user, req);
    if (scopedSourceIds && !scopedSourceIds.includes(sourceId)) {
      return safeNotFound(res);
    }
    const logs = await storage.getFetchLogs(sourceId, 50);
    res.json(logs);
  });

  // === INGESTION LOGS ===
  app.get("/api/ingestion-logs", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req);
    const params = {
      from: req.query.from as string,
      to: req.query.to as string,
      sourceIds: scopedSourceIds,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    const result = await storage.getIngestionLogs(params);
    res.json(result);
  });

  // === ANALYTICS EXPORT CSV ===
  app.get("/api/analytics/export", requireCapability(CAPS.ANALYTICS_EXPORT), async (req, res) => {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const scopedSourceIds = await getUserSourceIds(user, req);
    const workspaceScope = await resolveWorkspaceArticleQueryScope(user, req, res);
    if (!workspaceScope) return;
    const sentimentData = await storage.getSentimentReports(startDate, endDate, scopedSourceIds, clientId || undefined, toWorkspaceAnalyticsScope(clientId, workspaceScope));
    const csvHeader = "Source,Positive,Negative,Neutral,Total\n";
    const csvRows = sentimentData.bySource.map(s => {
      const total = s.positive + s.negative + s.neutral;
      return `"${s.sourceName.replace(/"/g, '""')}",${s.positive},${s.negative},${s.neutral},${total}`;
    }).join("\n");
    const overallRow = `"Overall Total",${sentimentData.overall.positive},${sentimentData.overall.negative},${sentimentData.overall.neutral},${sentimentData.overall.positive + sentimentData.overall.negative + sentimentData.overall.neutral}`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=nws360-analytics.csv");
    res.send(csvHeader + csvRows + "\n" + overallRow);
  });

  // === ADMIN: SOURCES MANAGEMENT ===
  function requireAdmin(req: any, res: any): boolean {
    if (!req.isAuthenticated()) { res.sendStatus(401); return false; }
    if (!isSystemAdmin(req.user as any)) { res.status(403).json({ message: "Admin access required" }); return false; }
    return true;
  }

  app.get("/api/admin/sources", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const [allSources, assignmentSummaries] = await Promise.all([
      storage.getSources(clientId || undefined),
      storage.getSourceAssignmentSummaries(clientId),
    ]);
    res.json(allSources.map((source) => ({
      ...source,
      assignmentSummary: assignmentSummaries[source.id] || null,
    })));
  });

  app.get("/api/sources/article-counts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user, req) || [];
    try {
      let counts;
      if (scopedSourceIds.length > 0) {
        const sourceIdList = sql.join(scopedSourceIds.map(id => sql`${id}`), sql`, `);
        counts = await db.execute(sql`SELECT source_id, COUNT(*)::int as count FROM articles WHERE source_id IS NOT NULL AND source_id IN (${sourceIdList}) GROUP BY source_id`);
      } else {
        return res.json({});
      }
      const map: Record<number, number> = {};
      for (const row of counts.rows) {
        map[row.source_id as number] = row.count as number;
      }
      res.json(map);
    } catch (err) {
      res.json({});
    }
  });

  app.post("/api/admin/sources", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    try {
      const { name, url, type, active, intervalMinutes, maxArticlesPerFetch, retentionDays, country, refreshPriority } = req.body;
      if (!name || !url || !type) return res.status(400).json({ message: "name, url, and type are required" });
      const adminClientId = req.body.clientId || resolveClientId(user, req);
      if (!adminClientId) return res.status(400).json({ message: "Tenant context required" });
      const logoUrl = getSourceLogoUrl(url, name);
      const source = await storage.createSource({ name: sanitizeInput(name), url, type, active: active !== false, intervalMinutes: intervalMinutes || 15, maxArticlesPerFetch: maxArticlesPerFetch || 10, retentionDays: retentionDays || DEFAULT_SOURCE_RETENTION_DAYS, country: country || null, refreshPriority: refreshPriority || "medium", userId: user.id, clientId: adminClientId, logoUrl });
      await storage.createAuditLog({ userId: user.id, action: "create", entity: "source", entityId: source.id, details: `Created source: ${source.name}` });
      setTimeout(async () => { try { await fetchSourceFeed(source.id); } catch {} }, 1000);
      res.status(201).json(source);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put("/api/admin/sources/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid source ID" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const allowedFields = ['name', 'url', 'type', 'active', 'intervalMinutes', 'maxArticlesPerFetch', 'retentionDays', 'country', 'refreshPriority'] as const;
    const cleanUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in req.body && req.body[key] !== undefined) cleanUpdates[key] = req.body[key];
    }
    if (Object.keys(cleanUpdates).length === 0) return res.status(400).json({ message: "No valid fields to update" });
    const existingSource = await storage.getSource(id, clientId);
    if (!existingSource) return res.status(404).json({ message: "Source not found" });
    if (await legacyOperationalSettingsWorkflowRequired(existingSource, clientId, cleanUpdates)) {
      return res.status(409).json({
        message: "Use the guarded operational source settings workflow for assigned publisher-linked sources.",
        code: "operational_source_settings_workflow_required",
      });
    }
    const source = await storage.updateSource(id, cleanUpdates, clientId);
    if (!source) return res.status(404).json({ message: "Source not found" });
    await storage.createAuditLog({ userId: user.id, action: "update", entity: "source", entityId: id, details: `Updated source: ${JSON.stringify(cleanUpdates)}` });
    res.json(source);
  });

  app.delete("/api/admin/sources/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid source ID" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    await storage.softDeleteSource(id, clientId);
    await storage.createAuditLog({ userId: user.id, action: "soft_delete", entity: "source", entityId: id, details: `Soft-deleted source #${id}` });
    res.sendStatus(204);
  });

  app.post("/api/admin/sources/:id/restore", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid source ID" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    await storage.restoreSource(id, clientId);
    await storage.createAuditLog({ userId: user.id, action: "restore", entity: "source", entityId: id, details: `Restored source #${id}` });
    res.json({ success: true });
  });

  // === ADMIN: PUBLISHER CATALOG ===
  app.get("/api/admin/publishers", requireSystemAdmin(), async (req, res) => {
    const parsedOwnerClientId = req.query.ownerClientId ? parsePositiveId(req.query.ownerClientId) : null;
    if (req.query.ownerClientId && !parsedOwnerClientId) return res.status(400).json({ message: "Invalid owner client ID" });
    const ownerClientId = parsedOwnerClientId || undefined;
    const items = await storage.getPublisherProfiles({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      countryCode: typeof req.query.countryCode === "string" ? req.query.countryCode : undefined,
      organizationType: typeof req.query.organizationType === "string" ? req.query.organizationType : undefined,
      verificationStatus: typeof req.query.verificationStatus === "string" ? req.query.verificationStatus : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      scopeType: typeof req.query.scopeType === "string" ? req.query.scopeType : undefined,
      ownerClientId,
    });
    res.json({ items, total: items.length });
  });

  app.post("/api/admin/publishers/preview", requireSystemAdmin(), async (req, res) => {
    try {
      res.json(await storage.previewPublisherProfile(req.body || {}));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher preview failed");
    }
  });

  app.post("/api/admin/publishers", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    try {
      const result = await storage.createPublisherProfileAtomic(req.body || {}, user.id);
      res.status(201).json(result);
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher creation failed");
    }
  });

  app.get("/api/admin/publishers/:publisherId", requireSystemAdmin(), async (req, res) => {
    const publisherId = parsePositiveId(req.params.publisherId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    const detail = await storage.getPublisherProfileDetail(publisherId, { includePrivate: true });
    if (!detail) return safeNotFound(res);
    res.json(detail);
  });

  app.patch("/api/admin/publishers/:publisherId", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    try {
      res.json(await storage.updatePublisherProfile(publisherId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher update failed");
    }
  });

  app.patch("/api/admin/publishers/:publisherId/lifecycle", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    const status = String(req.body?.status || req.body?.lifecycleStatus || "");
    try {
      res.json(await storage.transitionPublisherLifecycle(publisherId, status, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher lifecycle update failed");
    }
  });

  app.get("/api/admin/publishers/:publisherId/aliases", requireSystemAdmin(), async (req, res) => {
    const publisherId = parsePositiveId(req.params.publisherId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    const profile = await storage.getPublisherProfile(publisherId, { includePrivate: true });
    if (!profile) return safeNotFound(res);
    const items = await storage.getPublisherAliases(publisherId);
    res.json({ items, total: items.length });
  });

  app.post("/api/admin/publishers/:publisherId/aliases", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    try {
      const result = await storage.createPublisherAlias(publisherId, req.body || {}, user.id);
      res.status(201).json(result);
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher alias creation failed");
    }
  });

  app.patch("/api/admin/publishers/:publisherId/aliases/:aliasId", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    const aliasId = parsePositiveId(req.params.aliasId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    if (!aliasId) return res.status(400).json({ message: "Invalid alias ID" });
    try {
      res.json(await storage.updatePublisherAlias(publisherId, aliasId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher alias update failed");
    }
  });

  app.delete("/api/admin/publishers/:publisherId/aliases/:aliasId", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    const aliasId = parsePositiveId(req.params.aliasId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    if (!aliasId) return res.status(400).json({ message: "Invalid alias ID" });
    try {
      await storage.archivePublisherAlias(publisherId, aliasId, user.id);
      res.sendStatus(204);
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher alias archive failed");
    }
  });

  app.get("/api/admin/publishers/:publisherId/channels", requireSystemAdmin(), async (req, res) => {
    const publisherId = parsePositiveId(req.params.publisherId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    const profile = await storage.getPublisherProfile(publisherId, { includePrivate: true });
    if (!profile) return safeNotFound(res);
    const items = await storage.getPublisherChannels(publisherId);
    res.json({ items, total: items.length });
  });

  app.post("/api/admin/publishers/:publisherId/channels/preview", requireSystemAdmin(), async (req, res) => {
    const publisherId = parsePositiveId(req.params.publisherId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    try {
      res.json(await storage.previewPublisherChannel(publisherId, req.body || {}));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher channel preview failed");
    }
  });

  app.post("/api/admin/publishers/:publisherId/channels", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    try {
      const result = await storage.createPublisherChannel(publisherId, req.body || {}, user.id);
      res.status(201).json(result);
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher channel creation failed");
    }
  });

  app.patch("/api/admin/publishers/:publisherId/channels/:channelId", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    const channelId = parsePositiveId(req.params.channelId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    if (!channelId) return res.status(400).json({ message: "Invalid channel ID" });
    try {
      res.json(await storage.updatePublisherChannel(publisherId, channelId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher channel update failed");
    }
  });

  app.patch("/api/admin/publishers/:publisherId/channels/:channelId/lifecycle", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    const channelId = parsePositiveId(req.params.channelId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    if (!channelId) return res.status(400).json({ message: "Invalid channel ID" });
    const status = String(req.body?.status || req.body?.lifecycleStatus || "");
    try {
      res.json(await storage.transitionPublisherChannelLifecycle(publisherId, channelId, status, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher channel lifecycle update failed");
    }
  });

  app.post("/api/admin/publishers/:publisherId/channels/:channelId/validate", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    const channelId = parsePositiveId(req.params.channelId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    if (!channelId) return res.status(400).json({ message: "Invalid channel ID" });
    try {
      res.json(await storage.validatePublisherChannel(publisherId, channelId, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher channel validation failed");
    }
  });

  app.post("/api/admin/publishers/:publisherId/channels/:channelId/validation-override", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const publisherId = parsePositiveId(req.params.publisherId);
    const channelId = parsePositiveId(req.params.channelId);
    if (!publisherId) return res.status(400).json({ message: "Invalid publisher ID" });
    if (!channelId) return res.status(400).json({ message: "Invalid channel ID" });
    try {
      res.json(await storage.overridePublisherChannelValidation(publisherId, channelId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Publisher channel validation override failed");
    }
  });

  app.get("/api/admin/clients/:clientId/publishers", requireSystemAdmin(), async (req, res) => {
    const clientId = parsePositiveId(req.params.clientId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const [selections, candidates, readiness] = await Promise.all([
      storage.getClientPublisherSelections(client.id),
      storage.getPublisherProfiles({ clientId: client.id }),
      storage.getClientPublisherReadinessCounts(client.id),
    ]);
    res.json({ client, selections, candidates, readiness });
  });

  app.post("/api/admin/clients/:clientId/publishers", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    try {
      const result = await storage.selectClientPublisherAtomic(clientId, req.body || {}, user.id);
      res.status(201).json(result);
    } catch (err) {
      return sendAdminStorageError(res, err, "Client publisher selection failed");
    }
  });

  app.patch("/api/admin/clients/:clientId/publishers/:selectionId", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const selectionId = parsePositiveId(req.params.selectionId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!selectionId) return res.status(400).json({ message: "Invalid selection ID" });
    try {
      res.json(await storage.updateClientPublisherSelection(clientId, selectionId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Client publisher selection update failed");
    }
  });

  // === ADMIN: CLIENTS MANAGEMENT ===
  app.get("/api/admin/clients", requireSystemAdmin(), async (req, res) => {
    const allClients = await storage.getClients();
    res.json(allClients);
  });

  app.post("/api/admin/client-enrollments/preview", requireSystemAdmin(), async (req, res) => {
    const preview = normalizeClientEnrollment(req.body || {});
    if (preview.normalized) {
      const [existingKey, existingSlug] = await Promise.all([
        findClientByEnrollmentKey(preview.normalized.enrollmentKey),
        findClientBySlug(preview.normalized.organization.slug),
      ]);
      if (existingKey) {
        preview.errors.push("enrollmentKey already exists");
      }
      if (existingSlug) {
        preview.errors.push("slug already exists");
      }
      preview.valid = preview.errors.length === 0;
    }
    res.status(preview.valid ? 200 : 400).json(preview);
  });

  app.post("/api/admin/client-enrollments", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const preview = normalizeClientEnrollment(req.body || {});
    if (!preview.valid || !preview.normalized) {
      return res.status(400).json(preview);
    }
    const fingerprint = enrollmentFingerprint(preview.normalized);
    try {
      const result = await createEnrollmentTransaction(preview.normalized, fingerprint, user.id);
      const payload = await buildEnrollmentResult(result.clientId, result.idempotent);
      res.status(result.idempotent ? 200 : 201).json({
        ...payload,
        enrollmentKey: preview.normalized.enrollmentKey,
        requestFingerprint: fingerprint,
      });
    } catch (err: any) {
      if (err?.status) {
        const code = err.status === 409 && String(err.message || "").includes("slug") ? "duplicate_slug"
          : err.status === 409 && String(err.message || "").includes("Enrollment key") ? "duplicate_enrollment_key"
            : "enrollment_conflict";
        return res.status(err.status).json({ message: err?.message || "Client enrollment failed", code });
      }
      return sendAdminStorageError(res, err, "Client enrollment failed");
    }
  });

  app.get("/api/admin/clients/:clientId/setup", requireSystemAdmin(), async (req, res) => {
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    res.json(await buildClientSetupPayload(client.id));
  });

  app.patch("/api/admin/clients/:clientId/setup", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = Number(req.params.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.status(400).json({ message: "Invalid client ID" });
    try {
      await storage.updateClientSetupAtomic(clientId, req.body || {}, user.id);
      res.json(await buildClientSetupPayload(clientId));
    } catch (err) {
      return sendAdminStorageError(res, err, "Client setup update failed");
    }
  });

  app.get("/api/admin/clients/:clientId/readiness", requireSystemAdmin(), async (req, res) => {
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    res.json(await buildClientReadiness(client.id));
  });

  app.patch("/api/admin/clients/:clientId/lifecycle", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = Number(req.params.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.status(400).json({ message: "Invalid client ID" });
    try {
      const readiness = await buildClientReadiness(clientId);
      const result = await storage.transitionClientLifecycleAtomic(clientId, req.body || {}, user.id, readiness);
      res.json({
        client: result.client,
        affectedWorkspaceIds: result.affectedWorkspaceIds,
        readiness: await buildClientReadiness(clientId),
      });
    } catch (err) {
      return sendAdminStorageError(res, err, "Client lifecycle update failed");
    }
  });

  app.get("/api/admin/clients/:clientId/workspaces", requireSystemAdmin(), async (req, res) => {
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const items = await storage.getWorkspaces(client.id);
    res.json({ items, total: items.length });
  });

  app.post("/api/admin/clients/:clientId/workspaces", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = Number(req.params.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.status(400).json({ message: "Invalid client ID" });
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const { relevanceProfile, ...workspaceInput } = body;
    try {
      const result = await storage.createWorkspaceSetupAtomic(clientId, workspaceInput, relevanceProfile || {}, user.id);
      res.status(201).json(result.workspace);
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace creation failed");
    }
  });

  app.get("/api/admin/clients/:clientId/workspaces/:workspaceId", requireSystemAdmin(), async (req, res) => {
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const workspace = await getAdminWorkspaceOrNotFound(client.id, Number(req.params.workspaceId), res);
    if (!workspace) return;
    const profile = await storage.getWorkspaceRelevanceProfile(workspace.id, client.id);
    res.json({ workspace, relevanceProfile: profile || null });
  });

  app.patch("/api/admin/clients/:clientId/workspaces/:workspaceId", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = Number(req.params.clientId);
    const workspaceId = Number(req.params.workspaceId);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.status(400).json({ message: "Invalid client ID" });
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) return res.status(400).json({ message: "Invalid workspace ID" });
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const readiness = "status" in body
        ? await buildWorkspaceActivationReadiness(clientId, workspaceId)
        : await buildClientReadiness(clientId);
      const result = await storage.updateWorkspaceSetupAtomic(clientId, workspaceId, body, user.id, readiness);
      res.json(result.workspace);
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace update failed");
    }
  });

  app.get("/api/admin/clients/:clientId/workspaces/:workspaceId/relevance-profile", requireSystemAdmin(), async (req, res) => {
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const workspace = await getAdminWorkspaceOrNotFound(client.id, Number(req.params.workspaceId), res);
    if (!workspace) return;
    const profile = await storage.getWorkspaceRelevanceProfile(workspace.id, client.id);
    res.json({ profile: profile || null, effectiveProfile: workspaceRelevanceProfileFromRecords(workspace, profile) });
  });

  app.put("/api/admin/clients/:clientId/workspaces/:workspaceId/relevance-profile", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const workspace = await getAdminWorkspaceOrNotFound(client.id, Number(req.params.workspaceId), res);
    if (!workspace) return;
    const parsed = workspaceRelevanceProfileInputSchema.parse(req.body);
    const existing = await storage.getWorkspaceRelevanceProfile(workspace.id, client.id);
    const profile = await storage.upsertWorkspaceRelevanceProfile({
      workspaceId: workspace.id,
      topics: parsed.topics ?? existing?.topics ?? [],
      subtopics: parsed.subtopics ?? existing?.subtopics ?? [],
      industries: parsed.industries ?? existing?.industries ?? [],
      entities: parsed.entities ?? existing?.entities ?? [],
      organizations: parsed.organizations ?? existing?.organizations ?? [],
      people: parsed.people ?? existing?.people ?? [],
      projects: parsed.projects ?? existing?.projects ?? [],
      events: parsed.events ?? existing?.events ?? [],
      multilingualAliases: parsed.multilingualAliases ?? existing?.multilingualAliases ?? [],
      inclusionTerms: parsed.inclusionTerms ?? existing?.inclusionTerms ?? [],
      exclusionTerms: parsed.exclusionTerms ?? existing?.exclusionTerms ?? [],
      impactTerms: parsed.impactTerms ?? existing?.impactTerms ?? [],
      contextualTerms: parsed.contextualTerms ?? existing?.contextualTerms ?? [],
      minimumConfidence: parsed.minimumConfidence ?? existing?.minimumConfidence ?? 60,
      includeContextualByDefault: parsed.includeContextualByDefault ?? existing?.includeContextualByDefault ?? false,
      contextualLabel: parsed.contextualLabel ?? existing?.contextualLabel ?? "Strategic Context",
      active: parsed.active ?? existing?.active ?? true,
    } as any, client.id);
    await storage.createAuditLog({ userId: user.id, clientId: client.id, action: "workspace_relevance_change", entity: "workspace", entityId: workspace.id, details: safeAuditDetails({ profileId: profile.id }) });
    res.json({ profile, effectiveProfile: workspaceRelevanceProfileFromRecords(workspace, profile) });
  });

  app.post("/api/admin/clients/:clientId/workspaces/:workspaceId/relevance/preview", requireSystemAdmin(), async (req, res) => {
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const workspace = await getAdminWorkspaceOrNotFound(client.id, Number(req.params.workspaceId), res);
    if (!workspace) return;
    const profile = await storage.getWorkspaceRelevanceProfile(workspace.id, client.id);
    const sample = workspaceRelevancePreviewSchema.parse(req.body || {});
    const relevance = evaluateWorkspaceRelevance(sample, workspaceRelevanceProfileFromRecords(workspace, profile));
    res.json({ writes: false, relevance });
  });

  app.get("/api/admin/clients/:clientId/workspaces/:workspaceId/relevance/review", requireSystemAdmin(), async (req, res) => {
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const workspace = await getAdminWorkspaceOrNotFound(client.id, Number(req.params.workspaceId), res);
    if (!workspace) return;
    const includeContextual = req.query.includeContextual === "true";
    const items = await storage.getWorkspaceRelevanceReviewQueue(workspace.id, client.id, { includeContextual });
    res.json({ items, total: items.length });
  });

  app.patch("/api/admin/clients/:clientId/workspaces/:workspaceId/articles/:articleId/relevance", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = Number(req.params.clientId);
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const workspace = await getAdminWorkspaceOrNotFound(client.id, Number(req.params.workspaceId), res);
    if (!workspace) return;
    const articleId = Number(req.params.articleId);
    if (!Number.isInteger(articleId) || articleId <= 0) return res.status(400).json({ message: "Invalid article ID" });
    const input = articleRelevanceUpdateSchema.omit({ workspaceId: true }).parse(req.body);
    const article = await storage.getArticle(articleId, client.id);
    if (!article) return safeNotFound(res);
    const updated = await storage.upsertArticleWorkspaceRelevance({
      articleId,
      workspaceId: workspace.id,
      clientId: client.id,
      relevanceStatus: input.relevanceStatus,
      confidence: 100,
      shortReason: input.relevanceReason || input.reviewNote || "Manually reviewed by platform admin.",
      matchedScope: { manual_review: ["platform_admin_decision"] },
      principalCountryCodes: [],
      materiallyAffectedCountryCodes: [],
      supportingSignals: [{ type: "manual_review", field: "platform_admin", term: "decision" }],
      evaluationMethod: "manual",
      evaluatorVersion: RELEVANCE_ENGINE_VERSION,
      manualOverride: !input.reopen,
      reviewedBy: user.id,
      reviewedAt: new Date(),
      reviewNote: input.reviewNote || input.relevanceReason || null,
      reopenedAt: input.reopen ? new Date() : null,
      evaluatedAt: new Date(),
    } as any);
    const history = await storage.getWorkspaceRelevanceHistory(workspace.id, articleId, client.id);
    await storage.createAuditLog({ userId: user.id, clientId: client.id, action: "workspace_relevance_review", entity: "article", entityId: articleId, details: safeAuditDetails({ workspaceId: workspace.id, relevanceStatus: input.relevanceStatus, reopen: Boolean(input.reopen) }) });
    res.json({ relevance: updated, history });
  });

  app.get("/api/admin/clients/:clientId/workspaces/:workspaceId/sources/:sourceId/settings", requireSystemAdmin(), async (req, res) => {
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const sourceId = parsePositiveId(req.params.sourceId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!sourceId) return res.status(400).json({ message: "Invalid source ID" });
    try {
      res.json(await storage.getOperationalSourceSettings(clientId, workspaceId, sourceId));
    } catch (err) {
      return sendAdminStorageError(res, err, "Operational source settings lookup failed");
    }
  });

  app.post("/api/admin/clients/:clientId/workspaces/:workspaceId/sources/:sourceId/settings/preview", requireSystemAdmin(), async (req, res) => {
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const sourceId = parsePositiveId(req.params.sourceId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!sourceId) return res.status(400).json({ message: "Invalid source ID" });
    try {
      res.json(await storage.previewOperationalSourceSettings(clientId, workspaceId, sourceId, req.body || {}));
    } catch (err) {
      return sendAdminStorageError(res, err, "Operational source settings preview failed");
    }
  });

  app.patch("/api/admin/clients/:clientId/workspaces/:workspaceId/sources/:sourceId/settings", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const sourceId = parsePositiveId(req.params.sourceId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!sourceId) return res.status(400).json({ message: "Invalid source ID" });
    try {
      res.json(await storage.updateOperationalSourceSettingsAtomic(
        clientId,
        workspaceId,
        sourceId,
        req.body?.settings,
        req.body?.previewFingerprint,
        req.body?.previewExpiresAt,
        user.id,
      ));
    } catch (err) {
      return sendAdminStorageError(res, err, "Operational source settings update failed");
    }
  });

  app.get("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments", requireSystemAdmin(), async (req, res) => {
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const client = await getClientOrNotFound(clientId, res);
    if (!client) return;
    const workspace = await getAdminWorkspaceOrNotFound(client.id, workspaceId, res);
    if (!workspace) return;
    const [assignments, publishers, sources, readiness, relevanceProfile] = await Promise.all([
      storage.getWorkspaceSourceAssignments(client.id, workspace.id),
      storage.getClientPublisherSelections(client.id),
      storage.getSources(client.id),
      buildClientReadiness(client.id),
      storage.getWorkspaceRelevanceProfile(workspace.id, client.id),
    ]);
    const publisherChannelRows = await Promise.all(publishers.map(async (selection: any) => ({
      selection,
      channels: selection.publisher?.id ? await storage.getPublisherChannels(selection.publisher.id) : [],
    })));
    const { approvedPublishers, publisherEligibilitySummary } = buildWorkspaceSourceAssignmentPublisherResponse(publisherChannelRows);
    res.json({ client, workspace, relevanceProfile: relevanceProfile || null, assignments, approvedPublishers, publisherEligibilitySummary, operationalSources: sources, readiness });
  });

  app.post("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/preview", requireSystemAdmin(), async (req, res) => {
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    try {
      res.json(await storage.previewWorkspaceSourceAssignment(clientId, workspaceId, req.body || {}));
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace source assignment preview failed");
    }
  });

  app.post("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    try {
      const result = await storage.createWorkspaceSourceAssignmentAtomic(clientId, workspaceId, req.body || {}, user.id);
      res.status(201).json(result);
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace source assignment creation failed");
    }
  });

  app.get("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId", requireSystemAdmin(), async (req, res) => {
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!assignmentId) return res.status(400).json({ message: "Invalid assignment ID" });
    const assignment = await storage.getWorkspaceSourceAssignment(clientId, workspaceId, assignmentId);
    if (!assignment) return safeNotFound(res);
    res.json(assignment);
  });

  app.patch("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!assignmentId) return res.status(400).json({ message: "Invalid assignment ID" });
    try {
      res.json(await storage.updateWorkspaceSourceAssignment(clientId, workspaceId, assignmentId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace source assignment update failed");
    }
  });

  app.patch("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId/status", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!assignmentId) return res.status(400).json({ message: "Invalid assignment ID" });
    try {
      res.json(await storage.transitionWorkspaceSourceAssignmentStatus(clientId, workspaceId, assignmentId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace source assignment status update failed");
    }
  });

  app.post("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId/test-connectivity", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!assignmentId) return res.status(400).json({ message: "Invalid assignment ID" });
    try {
      res.json(await storage.testWorkspaceSourceAssignmentConnectivity(clientId, workspaceId, assignmentId, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace source assignment connectivity test failed");
    }
  });

  app.post("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId/test-relevance", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!assignmentId) return res.status(400).json({ message: "Invalid assignment ID" });
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "samples")) {
      return res.status(400).json({ message: "Browser-supplied relevance samples are not allowed", code: "samples_not_allowed" });
    }
    try {
      res.json(await storage.testWorkspaceSourceAssignmentRelevance(clientId, workspaceId, assignmentId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace source assignment relevance test failed");
    }
  });

  app.post("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId/test-full", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!assignmentId) return res.status(400).json({ message: "Invalid assignment ID" });
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "samples")) {
      return res.status(400).json({ message: "Browser-supplied relevance samples are not allowed", code: "samples_not_allowed" });
    }
    try {
      res.json(await storage.testWorkspaceSourceAssignmentFull(clientId, workspaceId, assignmentId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace source assignment full test failed");
    }
  });

  app.post("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId/approve-warning", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!assignmentId) return res.status(400).json({ message: "Invalid assignment ID" });
    try {
      res.json(await storage.approveWorkspaceSourceAssignmentWarning(clientId, workspaceId, assignmentId, req.body || {}, user.id));
    } catch (err) {
      return sendAdminStorageError(res, err, "Workspace source assignment warning approval failed");
    }
  });

  app.get("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId/tests", requireSystemAdmin(), async (req, res) => {
    const clientId = parsePositiveId(req.params.clientId);
    const workspaceId = parsePositiveId(req.params.workspaceId);
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!clientId) return res.status(400).json({ message: "Invalid client ID" });
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    if (!assignmentId) return res.status(400).json({ message: "Invalid assignment ID" });
    const assignment = await storage.getWorkspaceSourceAssignment(clientId, workspaceId, assignmentId);
    if (!assignment) return safeNotFound(res);
    const tests = await storage.getWorkspaceSourceAssignmentTests(clientId, workspaceId, assignmentId);
    res.json({ items: tests, total: tests.length });
  });

  app.post("/api/admin/clients", requireSystemAdmin(), async (req, res) => {
    res.status(410).json({ message: "Use POST /api/admin/client-enrollments to create clients with a draft workspace and relevance profile." });
  });

  app.put("/api/admin/clients/:id", requireSystemAdmin(), async (req, res) => {
    res.status(410).json({
      message: "Legacy client update is retired. Use PATCH /api/admin/clients/:clientId/setup or PATCH /api/admin/clients/:clientId/lifecycle.",
      code: "legacy_client_update_retired",
    });
  });

  app.delete("/api/admin/clients/:id", requireSystemAdmin(), async (req, res) => {
    res.status(410).json({
      message: "Client deletion is retired. Use PATCH /api/admin/clients/:clientId/lifecycle with suspended or archived.",
      code: "client_delete_retired",
    });
  });

  // === ADMIN: CLIENT AI CONFIG ===
  app.put("/api/admin/clients/:id/ai-config", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid client ID" });

    const { aiEnabled, dailyTokenBudget, dailyJobLimit } = req.body;
    const updates: Record<string, any> = {};
    if (typeof aiEnabled === "boolean") updates.aiEnabled = aiEnabled;
    if (typeof dailyTokenBudget === "number" && dailyTokenBudget >= 0) updates.dailyTokenBudget = dailyTokenBudget;
    if (typeof dailyJobLimit === "number" && dailyJobLimit >= 0) updates.dailyJobLimit = dailyJobLimit;

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid AI config fields provided" });

    const client = await storage.updateClient(id, updates);
    if (!client) return res.status(404).json({ message: "Client not found" });

    await storage.createAuditLog({
      userId: user.id,
      action: "update",
      entity: "client",
      entityId: id,
      details: `AI config updated: ${JSON.stringify(updates)}`,
    });

    const budgetStatus = await checkClientAiBudget(id);
    res.json({
      client: { id: client.id, name: client.name, aiEnabled: client.aiEnabled, dailyTokenBudget: client.dailyTokenBudget, dailyJobLimit: client.dailyJobLimit },
      todayUsage: { totalTokens: budgetStatus.todayTokens, jobCount: budgetStatus.todayJobs },
      remainingTokens: budgetStatus.remainingTokens,
      remainingJobs: budgetStatus.remainingJobs,
    });
  });

  // === ADMIN: CLIENT KEYWORDS ===
  app.get("/api/admin/clients/:id/keywords", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ message: "Invalid client ID" });
    const kws = await storage.getClientKeywords(clientId);
    res.json(kws);
  });

  app.post("/api/admin/clients/:id/keywords", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ message: "Invalid client ID" });
    const { term, priority } = req.body;
    if (!term || typeof term !== "string" || term.trim().length === 0) return res.status(400).json({ message: "Keyword term is required" });
    const kw = await storage.addClientKeyword({ clientId, term: sanitizeInput(term), priority: priority || "primary" });
    await storage.createAuditLog({ userId: user.id, action: "add_keyword", entity: "client_keyword", entityId: kw.id, details: `Added keyword "${term}" to client #${clientId}` });
    res.status(201).json(kw);
  });

  app.delete("/api/admin/client-keywords/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid keyword ID" });
    await storage.removeClientKeyword(id);
    await storage.createAuditLog({ userId: user.id, action: "remove_keyword", entity: "client_keyword", entityId: id, details: `Removed client keyword #${id}` });
    res.sendStatus(204);
  });

  // === ADMIN: USERS MANAGEMENT ===
  app.get("/api/admin/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const requestedClientId = req.query.clientId !== undefined && req.query.clientId !== ""
      ? Number(req.query.clientId)
      : null;
    if (requestedClientId !== null && (!Number.isInteger(requestedClientId) || requestedClientId <= 0)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }
    if (requestedClientId !== null) {
      const client = await storage.getClient(requestedClientId);
      if (!client) return safeNotFound(res);
      const tenantUsers = await storage.getUsersByClientId(requestedClientId);
      return res.json(tenantUsers.map(toPublicUser));
    }
    const allUsers = await storage.getUsers();
    const safeUsers = allUsers.map(toPublicUser);
    res.json(safeUsers);
  });

  app.post("/api/admin/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const adminUser = req.user as any;
    const { username, password, role, clientId, userType: bodyUserType } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password required" });
    const requestedClientId = clientId !== undefined && clientId !== null && clientId !== "" ? Number(clientId) : null;
    if (requestedClientId !== null && (!Number.isInteger(requestedClientId) || requestedClientId <= 0)) {
      return res.status(400).json({ message: "Invalid client ID" });
    }
    const resolvedClientId = requestedClientId;
    if (resolvedClientId) {
      const client = await storage.getClient(resolvedClientId);
      if (!client) return safeNotFound(res);
    }
    if (resolvedClientId) {
      const sub = await storage.getSubscription(resolvedClientId);
      if (sub) {
        const activeCount = await storage.getActiveUserCount(resolvedClientId);
        if (sub.maxUsers > 0 && activeCount >= sub.maxUsers) {
          return res.status(403).json({ message: `Seat limit reached (${activeCount}/${sub.maxUsers}). Upgrade plan to add more users.` });
        }
      }
    }
    const validRoles = Object.values(SYSTEM_ROLES);
    const resolvedRole = resolvedClientId ? (role || SYSTEM_ROLES.CLIENT_USER) : SYSTEM_ROLES.SYSTEM_ADMIN;
    if (!validRoles.includes(resolvedRole)) return res.status(400).json({ message: "Invalid role" });
    if (!resolvedClientId && resolvedRole !== SYSTEM_ROLES.SYSTEM_ADMIN) {
      return res.status(400).json({ message: "Platform user must be an admin" });
    }
    if (resolvedClientId && resolvedRole === SYSTEM_ROLES.SYSTEM_ADMIN) {
      return res.status(400).json({ message: "Tenant staff cannot use platform admin role" });
    }
    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) return res.status(400).json({ message: "Username already exists" });
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    const hashedPassword = `${salt}:${buf.toString("hex")}`;
    const validUserTypes = ["reader", "analyst", "editor", "monitor", "executive", "integrations_manager"];
    const resolvedUserType = bodyUserType && validUserTypes.includes(bodyUserType) ? bodyUserType : "reader";
    const newUser = await storage.createUser({
      username: sanitizeInput(username),
      password: hashedPassword,
      role: resolvedRole,
      userScope: resolvedClientId ? "tenant" : "platform",
      parentId: adminUser.id,
      clientId: resolvedClientId,
      userType: resolvedUserType,
    });
    await storage.createAuditLog({ userId: adminUser.id, action: "create", entity: "user", entityId: newUser.id, details: `Created user: ${newUser.username} (${newUser.role})` });
    res.status(201).json(toPublicUser(newUser));
  });

  app.put("/api/admin/users/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const adminUser = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });
    if (id === adminUser.id) return res.status(400).json({ message: "Cannot modify your own account via admin" });
    const targetUser = await getAdminManagedUserOrNotFound(id, res);
    if (!targetUser) return;
    const allowedFields: Record<string, any> = {};
    const validRoles = Object.values(SYSTEM_ROLES);
    const requestedRole = typeof req.body.role === "string" ? req.body.role : undefined;
    if (requestedRole !== undefined) {
      if (!validRoles.includes(requestedRole)) return res.status(400).json({ message: "Invalid role" });
      allowedFields.role = requestedRole;
    }
    const validUserTypes = ["reader", "analyst", "editor", "monitor", "executive", "integrations_manager"];
    if (req.body.userType !== undefined) {
      if (typeof req.body.userType !== "string" || !validUserTypes.includes(req.body.userType)) {
        return res.status(400).json({ message: "Invalid user type" });
      }
      allowedFields.userType = req.body.userType;
    }
    const hasClientIdInput = req.body.clientId !== undefined;
    let requestedClientId: number | null = targetUser.clientId ?? null;
    if (req.body.clientId !== undefined) {
      requestedClientId = req.body.clientId !== null && req.body.clientId !== "" ? Number(req.body.clientId) : null;
      if (requestedClientId !== null && (!Number.isInteger(requestedClientId) || requestedClientId <= 0)) {
        return res.status(400).json({ message: "Invalid client ID" });
      }
      if (requestedClientId !== null) {
        const client = await storage.getClient(requestedClientId);
        if (!client) return safeNotFound(res);
      }
    }
    if (requestedRole !== undefined || hasClientIdInput) {
      const finalRole = requestedRole ?? targetUser.role;
      if (finalRole === SYSTEM_ROLES.SYSTEM_ADMIN) {
        if (requestedClientId !== null) {
          return res.status(400).json({ message: "Platform administrators cannot be assigned to a client" });
        }
        allowedFields.userScope = "platform";
        allowedFields.clientId = null;
      } else {
        if (requestedClientId === null) {
          return res.status(400).json({ message: "Client users require a client assignment" });
        }
        allowedFields.userScope = "tenant";
        allowedFields.clientId = requestedClientId;
      }
    }
    if (typeof req.body.disabled === "boolean") allowedFields.disabled = req.body.disabled;
    if (req.body.password && typeof req.body.password === "string" && req.body.password.length >= 4) {
      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(req.body.password, salt, 64)) as Buffer;
      allowedFields.password = `${salt}:${buf.toString("hex")}`;
    }
    if (Object.keys(allowedFields).length === 0) return res.status(400).json({ message: "No valid fields to update" });
    const updated = await storage.updateUser(id, allowedFields);
    if (!updated) return res.status(404).json({ message: "User not found" });
    await storage.createAuditLog({ userId: adminUser.id, action: "update", entity: "user", entityId: id, details: `Updated user #${id}: ${Object.keys(allowedFields).join(", ")}` });
    res.json(toPublicUser(updated));
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const adminUser = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });
    if (id === adminUser.id) return res.status(400).json({ message: "Cannot delete yourself" });
    const targetUser = await getAdminManagedUserOrNotFound(id, res);
    if (!targetUser) return;
    await storage.deleteUser(id);
    await storage.createAuditLog({ userId: adminUser.id, action: "delete", entity: "user", entityId: id, details: `Deleted user #${id}` });
    res.sendStatus(204);
  });

  // === ADMIN: SYSTEM SETTINGS ===
  app.get("/api/admin/settings", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const settings = await storage.getSystemSettings();
    res.json(systemSettingsWithDefaults(settings));
  });

  app.put("/api/admin/settings", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const updates = req.body;
    if (!updates || typeof updates !== "object") return res.status(400).json({ message: "Settings object required" });
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_SYSTEM_SETTING_KEYS.has(key) && ["string", "number", "boolean"].includes(typeof value)) {
        await storage.updateSystemSetting(key, String(value));
      }
    }
    await storage.createAuditLog({ userId: user.id, action: "update", entity: "system_settings", details: `Updated settings: ${Object.keys(updates).join(", ")}` });
    const settings = await storage.getSystemSettings();
    res.json(systemSettingsWithDefaults(settings));
  });

  // === ADMIN: LOGS & HEALTH ===
  app.get("/api/admin/system-health", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const [health, queueStats] = await Promise.all([
      storage.getSystemHealth(),
      getQueueStats(),
    ]);
    res.json({ ...health, queue: queueStats });
  });

  app.get("/api/admin/audit-logs", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const result = await storage.getAuditLogs({ limit, offset });
    res.json(result);
  });

  // === ADMIN: SYSTEM ERRORS ===
  app.get("/api/admin/system-errors", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const severity = req.query.severity as string;
    const component = req.query.component as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const result = await storage.getSystemErrors({ severity, component, limit, offset });
    res.json(result);
  });

  // === ADMIN: QUEUE STATS ===
  app.get("/api/admin/queue-stats", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const stats = await getQueueStats();
    res.json(stats);
  });

  // === ADMIN: TRIGGER ANALYTICS COMPUTATION ===
  app.post("/api/admin/compute-analytics", requireSystemAdmin(), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    console.log(`[Analytics] Manual computation triggered by user ${user.id}`);
    try {
      await storage.createAuditLog({ userId: user.id, action: "compute_analytics", entity: "analytics_cache", details: "Triggered analytics computation (background)", clientId: clientId || user.clientId || null });
    } catch (e) {}
    runAnalyticsComputation()
      .then(result => {
        console.log(`[Analytics] Manual computation complete: ${result.success ? "success" : "failed"}`);
      })
      .catch(err => {
        console.error("[Analytics] Manual computation failed:", err);
      });
    res.json({ success: true, message: "Analytics computation started in background." });
  });

  // === ADMIN: TRIGGER DATA RETENTION ===
  app.post("/api/admin/run-retention", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const result = await runDataRetention();
    await storage.createAuditLog({ userId: user.id, action: "run_retention", entity: "data_retention", details: `Triggered data retention: ${result.success ? `removed ${result.articlesRemoved} articles` : "failed"}` });
    res.json(result);
  });

  // === ADMIN: API KEYS MANAGEMENT ===
  app.get("/api/admin/api-keys", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const keys = await storage.getApiKeys();
    res.json(keys);
  });

  app.post("/api/admin/api-keys", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const { name, clientId, scopes, rateLimit: rl, expiresAt } = req.body;
    if (!name) return res.status(400).json({ message: "API key name is required" });

    const rawKey = `nws_${randomBytes(32).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.substring(0, 12);

    const apiKey = await storage.createApiKey({
      name: sanitizeInput(name),
      keyHash,
      keyPrefix,
      clientId: clientId || null,
      scopes: scopes || ["articles:read", "analytics:read"],
      rateLimit: rl || 100,
      active: true,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    await storage.createAuditLog({ userId: user.id, action: "create", entity: "api_key", entityId: apiKey.id, details: `Created API key: ${name}` });
    res.status(201).json({ ...apiKey, rawKey });
  });

  app.delete("/api/admin/api-keys/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid API key ID" });
    await storage.deactivateApiKey(id);
    await storage.createAuditLog({ userId: user.id, action: "deactivate", entity: "api_key", entityId: id, details: `Deactivated API key #${id}` });
    res.sendStatus(204);
  });

  // === PARTNER API (v1) ===
  async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "API key required. Use: Authorization: Bearer <key>" });
    }
    const rawKey = authHeader.substring(7);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const apiKey = await storage.getApiKeyByHash(keyHash);
    if (!apiKey) return res.status(401).json({ message: "Invalid API key" });
    if (!apiKey.active) return res.status(403).json({ message: "API key is deactivated" });
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return res.status(403).json({ message: "API key has expired" });
    }
    (req as any).apiKeyId = apiKey.id;
    (req as any).apiKeyClientId = apiKey.clientId;
    (req as any).apiKeyScopes = apiKey.scopes || [];
    (req as any).apiKeyRateLimit = apiKey.rateLimit || 100;
    await storage.updateApiKeyLastUsed(apiKey.id);
    next();
  }

  const partnerKeyBuckets = new Map<string, { count: number; resetAt: number }>();
  function partnerRateLimiter(req: Request, res: Response, next: NextFunction) {
    const keyId = (req as any).apiKeyId?.toString();
    if (!keyId) return res.status(401).json({ message: "Not authenticated" });
    const limit = (req as any).apiKeyRateLimit || 100;
    const now = Date.now();
    let bucket = partnerKeyBuckets.get(keyId);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 60000 };
      partnerKeyBuckets.set(keyId, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      return res.status(429).json({ message: "Rate limit exceeded" });
    }
    next();
  }

  app.use("/api/v1", authenticateApiKey, partnerRateLimiter);

  app.get("/api/v1/articles", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("articles:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const params = {
      search: req.query.search as string,
      sentiment: req.query.sentiment as string,
      category: req.query.category as string,
      priority: req.query.priority as string,
      country: req.query.country as string,
      topic: req.query.topic as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      clientId: partnerClientId || undefined,
      page: req.query.page ? Math.max(1, parseInt(req.query.page as string)) : 1,
      limit: req.query.limit ? Math.min(50, Math.max(1, parseInt(req.query.limit as string))) : 20,
    };
    const result = await storage.getArticles(params);
    res.json({
      items: result.items.map(a => ({
        id: a.id,
        title: a.title,
        summary: a.summary,
        url: a.url,
        source: a.subSource || a.source?.name || null,
        subSource: a.subSource || null,
        collectedVia: a.subSource ? a.source?.name || null : null,
        sourceType: a.source?.type || null,
        category: a.category,
        priority: (a as any).priority || "routine",
        sentimentLabel: a.sentimentLabel,
        sentimentScore: a.sentimentScore,
        keywords: a.keywords,
        topics: a.topics,
        country: a.country,
        publishedAt: a.publishedAt,
        imageUrl: a.imageUrl,
      })),
      total: result.total,
      page: params.page,
      limit: params.limit,
    });
  });

  app.get("/api/v1/trending-topics", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getTrendingTopics(sevenDaysAgo.toISOString(), now.toISOString(), undefined, partnerClientId || undefined);
    res.json(data);
  });

  app.get("/api/v1/sentiment", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getSentimentReports(sevenDaysAgo.toISOString(), now.toISOString(), undefined, partnerClientId || undefined);
    res.json(data);
  });

  app.get("/api/v1/keywords", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getKeywordAnalysis(sevenDaysAgo.toISOString(), now.toISOString(), undefined, partnerClientId || undefined);
    res.json(data);
  });

  // === HEALTH CHECK ENDPOINTS (unauthenticated for monitoring) ===
  const workerState = { lastRun: null as Date | null, isRunning: true, startedAt: new Date() };

  app.get("/api/status", async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      const queueStats = await getQueueStats();
      const dbHealthy = true;
      const queueHealthy = (queueStats.failed || 0) < 50;
      const workerHealthy = workerState.isRunning;
      const overall = dbHealthy && queueHealthy && workerHealthy ? "healthy" : "degraded";
      res.json({
        status: overall,
        uptime: Math.floor((Date.now() - workerState.startedAt.getTime()) / 1000),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        components: {
          database: dbHealthy ? "healthy" : "failed",
          workers: workerHealthy ? "healthy" : "degraded",
          queue: queueHealthy ? "healthy" : "degraded",
        },
      });
    } catch (e) {
      res.status(503).json({ status: "failed", error: "System health check failed" });
    }
  });

  app.get("/api/status/database", async (_req, res) => {
    try {
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      const latencyMs = Date.now() - start;
      const tableStats = await db.execute(sql`SELECT
        (SELECT count(*) FROM articles) as articles_count,
        (SELECT count(*) FROM sources) as sources_count,
        (SELECT count(*) FROM users) as users_count`);
      res.json({
        status: "healthy",
        latencyMs,
        tables: tableStats.rows?.[0] || {},
      });
    } catch (e) {
      res.status(503).json({ status: "failed", error: "Database unreachable" });
    }
  });

  app.get("/api/status/workers", async (_req, res) => {
    try {
      const health = await storage.getSystemHealth();
      res.json({
        status: workerState.isRunning ? "healthy" : "degraded",
        feedWorker: {
          lastRun: health.lastWorkerRun,
          avgProcessingTimeMs: health.avgProcessingTime,
          failedSources: health.failedSourcesCount,
        },
        uptime: Math.floor((Date.now() - workerState.startedAt.getTime()) / 1000),
      });
    } catch (e) {
      res.status(503).json({ status: "failed", error: "Worker status unavailable" });
    }
  });

  app.get("/api/status/queue", async (_req, res) => {
    try {
      const stats = await getQueueStats();
      const healthy = (stats.failed || 0) < 50;
      res.json({
        status: healthy ? "healthy" : "degraded",
        ...stats,
      });
    } catch (e) {
      res.status(503).json({ status: "failed", error: "Queue status unavailable" });
    }
  });

  // === ADMIN: FEATURE FLAGS ===
  app.get("/api/admin/feature-flags", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const flags = await storage.getFeatureFlags();
    res.json(flags);
  });

  const featureFlagSchema = z.object({
    key: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/, "Key must be alphanumeric with underscores, dots, or hyphens"),
    enabled: z.boolean().default(false),
    description: z.string().max(500).optional(),
  });

  app.post("/api/admin/feature-flags", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const parsed = featureFlagSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { key, enabled, description } = parsed.data;
    const flag = await storage.upsertFeatureFlag(sanitizeInput(key), enabled, description ? sanitizeInput(description) : undefined);
    await storage.createAuditLog({ userId: user.id, action: "upsert", entity: "feature_flag", entityId: flag.id, details: `Feature flag '${key}' set to ${enabled}` });
    res.json(flag);
  });

  app.delete("/api/admin/feature-flags/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.deleteFeatureFlag(id);
    await storage.createAuditLog({ userId: user.id, action: "delete", entity: "feature_flag", entityId: id, details: `Deleted feature flag #${id}` });
    res.sendStatus(204);
  });

  app.get("/api/feature-flags", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const flags = await storage.getFeatureFlags();
    const flagMap: Record<string, boolean> = {};
    for (const f of flags) flagMap[f.key] = f.enabled ?? false;
    res.json(flagMap);
  });

  // === ADMIN: USAGE METRICS ===
  app.get("/api/admin/usage-metrics", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const metrics = await storage.getUsageMetrics({
      event: req.query.event as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    });
    res.json(metrics);
  });

  app.get("/api/admin/usage-summary", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const summary = await storage.getUsageSummary(days);
    res.json(summary);
  });

  // === ADMIN: OPS DOCUMENTATION ===
  app.get("/api/admin/docs", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({
      architecture: {
        overview: "NWS360 is a full-stack news aggregation platform with AI-powered analysis.",
        stack: "React + Vite frontend, Express.js backend, PostgreSQL (Neon) database, OpenAI for AI analysis.",
        workers: [
          { name: "Feed Worker", schedule: "Priority-based (5/10/15 min)", file: "server/feed-worker.ts" },
          { name: "Analytics Worker", schedule: "Every 15 minutes", file: "server/analytics-worker.ts" },
          { name: "Data Retention Worker", schedule: "Every 24 hours", file: "server/data-retention-worker.ts" },
          { name: "Processing Queue", schedule: "5-second polling", file: "server/processing-queue.ts" },
        ],
      },
      ingestion: {
        pipeline: "FETCH → CLEAN → STRUCTURE → ANALYZE → STORE",
        supported: ["RSS/Atom feeds", "Websites (auto RSS discovery)", "YouTube", "Facebook", "Instagram", "Twitter/X", "Telegram", "Google News"],
        deduplication: "By article URL",
        retry: "Up to 3 retries with exponential backoff",
      },
      analytics: {
        types: ["Content Volume", "Trending Topics", "Sentiment Reports", "Source Behavior", "Keyword Analysis", "Narrative Comparison", "Daily Brief"],
        caching: "Pre-computed metrics for 7-day and 30-day periods, refreshed every 15 minutes",
      },
      recovery: {
        database: "Neon PostgreSQL provides automatic point-in-time recovery. Use Replit's checkpoint system for rollback.",
        workers: "Workers auto-restart on failure. Sources with 5+ consecutive failures are auto-paused.",
        queue: "Failed jobs retry with exponential backoff (max 3 attempts). Admin can requeue failed jobs.",
      },
      healthChecks: {
        endpoints: [
          { path: "/api/status", description: "Overall system health" },
          { path: "/api/status/database", description: "Database connectivity and stats" },
          { path: "/api/status/workers", description: "Worker health and metrics" },
          { path: "/api/status/queue", description: "Processing queue status" },
        ],
      },
      featureFlags: {
        description: "Toggle features without redeploying. Admin can create/update/delete flags via /api/admin/feature-flags.",
        usage: "Frontend fetches flags from /api/feature-flags and gates UI components.",
      },
    });
  });

  // ===================================================================
  // KNOWLEDGE MEMORY & HISTORICAL INTELLIGENCE ROUTES
  // ===================================================================

  // === STORY TIMELINES ===
  app.get("/api/knowledge/timelines", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const items = await storage.getStoryTimelines(clientId || undefined);
    res.json(items);
  });

  app.get("/api/knowledge/timelines/:id", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const timeline = await storage.getStoryTimeline(parseInt(req.params.id), clientId || undefined);
    if (!timeline) return res.status(404).json({ message: "Not found" });
    res.json(timeline);
  });

  app.post("/api/knowledge/timelines", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ mainTopic: z.string().min(1), summary: z.string().optional(), status: z.enum(["active", "dormant", "recurring"]).optional(), storyClusterId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createStoryTimeline({ ...parsed.data, clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/timelines/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const item = await storage.updateStoryTimeline(parseInt(req.params.id), req.body, clientId || undefined);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/knowledge/timelines/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    await storage.deleteStoryTimeline(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === TIMELINE EVENTS ===
  app.get("/api/knowledge/timelines/:id/events", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const timelineId = parseInt(req.params.id);
    const timeline = await storage.getStoryTimeline(timelineId, clientId || undefined);
    if (!timeline) return res.status(404).json({ message: "Not found" });
    const events = await storage.getTimelineEvents(timelineId);
    res.json(events);
  });

  app.post("/api/knowledge/timelines/:id/events", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const timelineId = parseInt(req.params.id);
    const timeline = await storage.getStoryTimeline(timelineId, clientId || undefined);
    if (!timeline) return res.status(404).json({ message: "Not found" });
    const schema = z.object({ label: z.string().min(1), description: z.string().optional(), articleId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createTimelineEvent({ ...parsed.data, timelineId });
    await storage.updateStoryTimeline(timelineId, { lastSeen: new Date() }, clientId || undefined);
    res.status(201).json(item);
  });

  app.delete("/api/knowledge/timeline-events/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const event = await storage.getTimelineEvent(parseInt(req.params.id));
    if (!event) return res.status(404).json({ message: "Not found" });
    const timeline = await storage.getStoryTimeline(event.timelineId, clientId || undefined);
    if (!timeline) return res.status(404).json({ message: "Not found" });
    await storage.deleteTimelineEvent(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === RECURRING PATTERNS ===
  app.get("/api/knowledge/patterns", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const items = await storage.getRecurringPatterns(clientId || undefined);
    res.json(items);
  });

  app.post("/api/knowledge/patterns", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ topic: z.string().min(1), recurrenceInterval: z.string().optional(), confidence: z.number().int().min(0).max(100).optional(), occurrenceCount: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createRecurringPattern({ ...parsed.data, clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/patterns/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const item = await storage.updateRecurringPattern(parseInt(req.params.id), req.body, clientId || undefined);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/knowledge/patterns/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    await storage.deleteRecurringPattern(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === ENTITY MEMORY ===
  app.get("/api/knowledge/entity-memory", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const items = await storage.getEntityMemories(clientId || undefined);
    res.json(items);
  });

  app.get("/api/knowledge/entity-memory/by-name/:name", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const item = await storage.getEntityMemoryByName(decodeURIComponent(req.params.name), clientId || undefined);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.post("/api/knowledge/entity-memory", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ entityName: z.string().min(1), entityType: z.string().optional(), biography: z.string().optional(), associatedTopics: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createEntityMemory({ ...parsed.data, clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/entity-memory/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const item = await storage.updateEntityMemory(parseInt(req.params.id), req.body, clientId || undefined);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/knowledge/entity-memory/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    await storage.deleteEntityMemory(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === NARRATIVE SHIFTS ===
  app.get("/api/knowledge/narrative-shifts", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const topic = req.query.topic as string | undefined;
    const items = await storage.getNarrativeShifts({ topic, clientId: clientId || undefined });
    res.json(items);
  });

  app.post("/api/knowledge/narrative-shifts", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ topic: z.string().min(1), framingTerms: z.array(z.string()).optional(), sentimentDelta: z.number().int().optional(), summary: z.string().optional(), storyClusterId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createNarrativeShift({ ...parsed.data, clientId });
    res.status(201).json(item);
  });

  app.delete("/api/knowledge/narrative-shifts/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    await storage.deleteNarrativeShift(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === INSTITUTIONAL / ORG NOTES ===
  app.get("/api/knowledge/org-notes", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const topic = req.query.topic as string | undefined;
    const items = await storage.getInstitutionalNotes(clientId || undefined, topic);
    res.json(items);
  });

  app.post("/api/knowledge/org-notes", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ relatedTopic: z.string().min(1), content: z.string().min(1), noteType: z.enum(["context", "policy", "decision", "reference"]).optional(), targetType: z.string().optional(), targetId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createInstitutionalNote({ ...parsed.data, userId: user.id, clientId });
    res.status(201).json(item);
  });

  app.delete("/api/knowledge/org-notes/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    await storage.deleteInstitutionalNote(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === HISTORICAL MATCHES ===
  app.get("/api/knowledge/historical-matches", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const items = await storage.getHistoricalMatches(clientId || undefined);
    res.json(items);
  });

  app.post("/api/knowledge/historical-matches", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ currentStoryId: z.number().int().optional(), pastStoryId: z.number().int().optional(), similarityScore: z.number().int().min(0).max(100).optional(), matchReason: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createHistoricalMatch({ ...parsed.data, clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/historical-matches/:id/acknowledge", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    await storage.acknowledgeHistoricalMatch(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === TREND LIFECYCLES ===
  app.get("/api/knowledge/trends", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const items = await storage.getTrendLifecycles(clientId || undefined);
    res.json(items);
  });

  app.post("/api/knowledge/trends", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ topic: z.string().min(1), stage: z.enum(["emergence", "growth", "peak", "decline", "dormant", "reactivation"]).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createTrendLifecycle({ ...parsed.data, clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/trends/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const item = await storage.updateTrendLifecycle(parseInt(req.params.id), req.body, clientId || undefined);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/knowledge/trends/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    await storage.deleteTrendLifecycle(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === LONG-RANGE BRIEFINGS ===
  app.get("/api/knowledge/briefings", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const periodType = req.query.periodType as string | undefined;
    const items = await storage.getLongRangeBriefings(clientId || undefined, periodType);
    res.json(items);
  });

  app.post("/api/knowledge/briefings", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ periodType: z.enum(["monthly", "quarterly", "yearly"]), summary: z.string().optional(), findings: z.any().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createLongRangeBriefing({ ...parsed.data, generatedBy: user.id, clientId });
    res.status(201).json(item);
  });

  app.delete("/api/knowledge/briefings/:id", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    await storage.deleteLongRangeBriefing(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === AI MEMORY ANSWERS ===
  app.get("/api/knowledge/ai-answers", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const items = await storage.getAiMemoryAnswers(clientId || undefined, 50);
    res.json(items);
  });

  app.post("/api/knowledge/ai-answers", requireAiEnabled(), requireCapability(CAPS.KNOWLEDGE_COMPUTE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({ query: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const timelines = await storage.getStoryTimelines(clientId || undefined);
      const patterns = await storage.getRecurringPatterns(clientId || undefined);
      const trends = await storage.getTrendLifecycles(clientId || undefined);
      const entityMems = await storage.getEntityMemories(clientId || undefined);
      const notes = await storage.getInstitutionalNotes(clientId || undefined);
      const matches = await storage.getHistoricalMatches(clientId || undefined);

      const contextSummary = [
        timelines.length > 0 ? `Active timelines: ${timelines.slice(0, 10).map(t => `${t.mainTopic} (${t.status})`).join(", ")}` : "",
        patterns.length > 0 ? `Recurring patterns: ${patterns.slice(0, 10).map(p => `${p.topic} (interval: ${p.recurrenceInterval}, confidence: ${p.confidence}%)`).join(", ")}` : "",
        trends.length > 0 ? `Trend lifecycles: ${trends.slice(0, 10).map(t => `${t.topic} (${t.stage})`).join(", ")}` : "",
        entityMems.length > 0 ? `Known entities: ${entityMems.slice(0, 10).map(e => `${e.entityName} (${e.entityType || "unknown"})`).join(", ")}` : "",
        notes.length > 0 ? `Org notes: ${notes.slice(0, 5).map(n => `[${n.relatedTopic}] ${n.content.substring(0, 100)}`).join("; ")}` : "",
        matches.length > 0 ? `Historical matches: ${matches.slice(0, 5).map(m => `story ${m.currentStoryId} ~ story ${m.pastStoryId} (${m.similarityScore}%)`).join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const memJob = await enqueueAIJob(clientId || 0, "qa", {
        systemPrompt: `You are a memory-enhanced intelligence analyst for a news platform. You have access to institutional knowledge including story timelines, recurring patterns, trend lifecycles, entity histories, organizational notes, and historical matches. Use this context to provide historically-aware, contextual answers. Always reference relevant past data when available.\n\nKnowledge Context:\n${contextSummary || "No historical data available yet."}`,
        userContent: parsed.data.query,
      }, 1000);

      const aiResult = await awaitJobResult(memJob.id);
      const answer = aiResult.content || "Unable to generate answer.";
      const saved = await storage.createAiMemoryAnswer({
        query: parsed.data.query,
        answer,
        contextRefs: { timelinesUsed: timelines.length, patternsUsed: patterns.length, trendsUsed: trends.length, entitiesUsed: entityMems.length },
        createdBy: user.id,
        clientId,
      });
      res.status(201).json(saved);
    } catch (err: any) {
      console.error("AI Memory answer error:", err.message);
      const saved = await storage.createAiMemoryAnswer({
        query: parsed.data.query,
        answer: "AI analysis is temporarily unavailable. Your question has been saved and can be re-analyzed later.",
        createdBy: user.id,
        clientId,
      });
      res.status(201).json(saved);
    }
  });

  // === PREDICTIVE INTELLIGENCE & FORECASTING ===

  // Topic Forecasts
  app.get("/api/forecast/topics", requireCapability(CAPS.FORECAST_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const forecasts = await storage.getTopicForecasts(clientId || undefined);
    res.json(forecasts);
  });

  app.post("/api/forecast/topics", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      topic: z.string().min(1),
      momentum: z.number().int().optional(),
      acceleration: z.number().int().optional(),
      mediaAmplification: z.number().int().optional(),
      actorExpansion: z.number().int().optional(),
      next24hProbability: z.number().int().min(0).max(100).optional(),
      next7dProbability: z.number().int().min(0).max(100).optional(),
      predictedStage: z.enum(["emerging", "escalating", "peaking", "declining"]).optional(),
      confidenceScore: z.number().int().min(0).max(100).optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const forecast = await storage.createTopicForecast({ ...parsed.data, clientId });
    res.status(201).json(forecast);
  });

  app.delete("/api/forecast/topics/:id", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    const forecasts = await storage.getTopicForecasts(clientId || undefined);
    if (!forecasts.find(f => f.id === id)) return safeNotFound(res);
    await storage.deleteTopicForecast(id);
    res.sendStatus(204);
  });

  // Early Signals
  app.get("/api/forecast/signals", requireCapability(CAPS.FORECAST_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const signals = await storage.getEarlySignals(clientId || undefined);
    res.json(signals);
  });

  app.post("/api/forecast/signals", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      signalType: z.string().min(1),
      relatedTopic: z.string().min(1),
      strength: z.number().int().min(0).max(100).optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const signal = await storage.createEarlySignal({ ...parsed.data, clientId });
    res.status(201).json(signal);
  });

  app.delete("/api/forecast/signals/:id", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    const signals = await storage.getEarlySignals(clientId || undefined);
    if (!signals.find(s => s.id === id)) return safeNotFound(res);
    await storage.deleteEarlySignal(id);
    res.sendStatus(204);
  });

  // Risk Scores
  app.get("/api/forecast/risks", requireCapability(CAPS.FORECAST_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const risks = await storage.getRiskScores(clientId || undefined);
    res.json(risks);
  });

  app.post("/api/forecast/risks", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      subject: z.string().min(1),
      subjectType: z.enum(["topic", "entity", "region"]).optional(),
      operationalRisk: z.number().int().min(0).max(100).optional(),
      reputationalRisk: z.number().int().min(0).max(100).optional(),
      escalationRisk: z.number().int().min(0).max(100).optional(),
      confidence: z.number().int().min(0).max(100).optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const risk = await storage.createRiskScore({ ...parsed.data, clientId });
    res.status(201).json(risk);
  });

  app.delete("/api/forecast/risks/:id", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    const risks = await storage.getRiskScores(clientId || undefined);
    if (!risks.find(r => r.id === id)) return safeNotFound(res);
    await storage.deleteRiskScore(id);
    res.sendStatus(204);
  });

  // Influence Graph
  app.get("/api/forecast/influence", requireCapability(CAPS.FORECAST_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const graph = await storage.getInfluenceGraph(clientId || undefined);
    res.json(graph);
  });

  app.post("/api/forecast/influence", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      sourceA: z.string().min(1),
      sourceB: z.string().min(1),
      influenceStrength: z.number().int().min(0).max(100).optional(),
      cascadeDelay: z.number().int().optional(),
      relationship: z.enum(["amplifies", "contradicts", "delays", "originates"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const entry = await storage.createInfluenceGraphEntry({ ...parsed.data, clientId });
    res.status(201).json(entry);
  });

  app.delete("/api/forecast/influence/:id", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    const entries = await storage.getInfluenceGraph(clientId || undefined);
    if (!entries.find(e => e.id === id)) return safeNotFound(res);
    await storage.deleteInfluenceGraphEntry(id);
    res.sendStatus(204);
  });

  // Attention Decay
  app.get("/api/forecast/attention", requireCapability(CAPS.FORECAST_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const decay = await storage.getAttentionDecay(clientId || undefined);
    res.json(decay);
  });

  app.post("/api/forecast/attention", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      topic: z.string().min(1),
      estimatedDaysRemaining: z.number().int().min(0).optional(),
      decayRate: z.number().int().min(0).max(100).optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const entry = await storage.createAttentionDecay({ ...parsed.data, clientId });
    res.status(201).json(entry);
  });

  app.delete("/api/forecast/attention/:id", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    const entries = await storage.getAttentionDecay(clientId || undefined);
    if (!entries.find(e => e.id === id)) return safeNotFound(res);
    await storage.deleteAttentionDecay(id);
    res.sendStatus(204);
  });

  // Alert Priority Scores
  app.get("/api/forecast/alert-priority", requireCapability(CAPS.FORECAST_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const scores = await storage.getAlertPriorityScores(clientId || undefined);
    res.json(scores);
  });

  app.post("/api/forecast/alert-priority", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      alertId: z.number().int().optional(),
      topic: z.string().optional(),
      score: z.number().int().min(0).max(100).optional(),
      acceleratingCoverage: z.boolean().optional(),
      multiRegionSpread: z.boolean().optional(),
      sentimentVolatility: z.boolean().optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const score = await storage.createAlertPriorityScore({ ...parsed.data, clientId });
    res.status(201).json(score);
  });

  // Forecast Results (Accuracy Tracking)
  app.get("/api/forecast/results", requireCapability(CAPS.FORECAST_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const results = await storage.getForecastResults(clientId || undefined);
    res.json(results);
  });

  app.post("/api/forecast/results", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      forecastId: z.number().int().optional(),
      forecastType: z.string().min(1),
      originalPrediction: z.string().optional(),
      outcome: z.string().optional(),
      accuracyScore: z.number().int().min(0).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const result = await storage.createForecastResult({ ...parsed.data, clientId });
    res.status(201).json(result);
  });

  // Future Briefings
  app.get("/api/forecast/future-briefings", requireCapability(CAPS.FORECAST_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const briefings = await storage.getFutureBriefings(clientId || undefined);
    res.json(briefings);
  });

  app.post("/api/forecast/future-briefings", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      date: z.string().min(1),
      possibleEscalations: z.array(z.object({ topic: z.string(), probability: z.number(), explanation: z.string() })).optional(),
      emergingActors: z.array(z.object({ name: z.string(), context: z.string() })).optional(),
      fadingTopics: z.array(z.object({ topic: z.string(), estimatedDaysLeft: z.number() })).optional(),
      summary: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const briefing = await storage.createFutureBriefing({ ...parsed.data, clientId });
    res.status(201).json(briefing);
  });

  app.delete("/api/forecast/future-briefings/:id", requireCapability(CAPS.FORECAST_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    const briefings = await storage.getFutureBriefings(clientId || undefined);
    if (!briefings.find(b => b.id === id)) return safeNotFound(res);
    await storage.deleteFutureBriefing(id);
    res.sendStatus(204);
  });

  // Scenario Simulation (AI-powered What-If Analysis)
  app.post("/api/forecast/simulate", requireAiEnabled(), requireCapability(CAPS.FORECAST_COMPUTE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const schema = z.object({
      topic: z.string().min(1),
      hypotheticalEvent: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const forecasts = await storage.getTopicForecasts(clientId || undefined);
      const risks = await storage.getRiskScores(clientId || undefined);
      const signals = await storage.getEarlySignals(clientId || undefined);

      const context = [
        forecasts.length > 0 ? `Current forecasts: ${forecasts.slice(0, 5).map(f => `${f.topic} (${f.predictedStage}, momentum: ${f.momentum})`).join(", ")}` : "",
        risks.length > 0 ? `Risk scores: ${risks.slice(0, 5).map(r => `${r.subject} (op: ${r.operationalRisk}%, rep: ${r.reputationalRisk}%, esc: ${r.escalationRisk}%)`).join(", ")}` : "",
        signals.length > 0 ? `Active signals: ${signals.slice(0, 5).map(s => `${s.signalType} on ${s.relatedTopic} (strength: ${s.strength}%)`).join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const simJob = await enqueueAIJob(clientId || 0, "prediction", {
        systemPrompt: `You are a predictive intelligence analyst for a news monitoring platform. Given a topic and a hypothetical event, estimate the likely outcomes based on the hypothetical scenario itself and general domain reasoning. Provide your analysis as JSON with these fields: coverageIncreaseLikelihood (0-100), sentimentImpact (string describing direction and magnitude), relatedTopicsActivation (array of topic strings), riskAssessment (string), timeframe (string), explanation (string). Be specific and data-driven. IMPORTANT: The following context contains prior AI-generated estimates (not verified facts). Use them only as background reference, not as evidence. Base your analysis on the hypothetical event itself.\n\nPrior estimates (AI-generated, not verified):\n${context || "No prior estimates available."}`,
        userContent: `Topic: ${parsed.data.topic}\nHypothetical Event: ${parsed.data.hypotheticalEvent}`,
        responseFormat: { type: "json_object" },
      }, 800);

      const simAiResult = await awaitJobResult(simJob.id);
      const result = JSON.parse(simAiResult.content || "{}");
      res.json(result);
    } catch (err: any) {
      console.error("Simulation error:", err.message);
      res.json({
        coverageIncreaseLikelihood: 50,
        sentimentImpact: "Unable to determine - AI analysis temporarily unavailable",
        relatedTopicsActivation: [],
        riskAssessment: "Analysis pending",
        timeframe: "Unknown",
        explanation: "AI simulation is temporarily unavailable. Please try again later.",
      });
    }
  });

  // === SCHEDULER CONTROL (for testing) ===
  app.post("/api/admin/scheduler/stop", requireSystemAdmin, (_req, res) => {
    stopScheduler();
    res.json({ ok: true, message: "Scheduler stopped" });
  });
  app.post("/api/admin/scheduler/start", requireSystemAdmin, async (_req, res) => {
    await startScheduler();
    res.json({ ok: true, message: "Scheduler started" });
  });
  app.post("/api/admin/scheduler/tick", requireSystemAdmin, async (_req, res) => {
    try {
      await _schedulerTickForTesting();
      res.json({ ok: true, message: "Tick completed" });
    } catch (e: any) {
      res.status(500).json({ ok: false, message: e.message });
    }
  });

  // === SEED & START WORKERS ===
  await seed();
  const isCloudflareWorker = process.env.CF_WORKER === "1";
  if (!isCloudflareWorker) {
    // registerArticleAnalysisHandler(); // AI disabled
    startFeedWorker();
    // await startScheduler(); // AI disabled
  }
  registerJobHandler("COMPUTE_ANALYTICS", async () =>
    runPeriodicJobIfEligible("COMPUTE_ANALYTICS", runAnalyticsComputation)
  );
  registerJobHandler("DATA_RETENTION", async () =>
    runPeriodicJobIfEligible("DATA_RETENTION", runDataRetention)
  );
  registerJobHandler("DELIVER_BRIEFINGS", async () =>
    runPeriodicJobIfEligible("DELIVER_BRIEFINGS", () => deliverDueBriefings())
  );

  // === AI INTELLIGENCE ROUTES ===
  const { answerIntelligenceQuery, runIntelligencePipeline, analyzeNarratives } = await import("./ai-intelligence");

  registerJobHandler("INTELLIGENCE_PIPELINE", async () =>
    runPeriodicJobIfEligible("INTELLIGENCE_PIPELINE", runIntelligencePipeline)
  );

  if (!isCloudflareWorker) {
    startQueueProcessor();
    startPeriodicJobs();
    // startLearningWorker(); // AI disabled

    setTimeout(() => {
      runAnalyticsComputation().catch(e => console.error("[Analytics] Initial computation error:", e));
    }, 30000);
  }

  app.get("/api/stories", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const clusters = await storage.getStoryClusters({ limit, offset, clientId: clientId || undefined });
    res.json(clusters);
  });

  app.get("/api/stories/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const cluster = await storage.getStoryCluster(id, clientId || undefined);
    if (!cluster) return res.status(404).json({ message: "Story not found" });
    const clusterArticles = await storage.getClusterArticles(id, clientId || undefined);
    res.json({ ...cluster, articles: clusterArticles });
  });

  app.post("/api/stories/:id/narratives", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const cluster = await storage.getStoryCluster(id, clientId || undefined);
    if (!cluster) return res.status(404).json({ message: "Story not found" });
    const result = await analyzeNarratives(id);
    if (!result) return res.status(404).json({ message: "Not enough data for narrative analysis" });
    res.json(result);
  });

  app.get("/api/briefs", requireAiEnabled(), requireCapability(CAPS.INTELLIGENCE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const briefs = await storage.getDailyBriefs(limit, clientId || undefined);
    res.json(briefs);
  });

  app.get("/api/briefs/:date", requireAiEnabled(), requireCapability(CAPS.INTELLIGENCE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const brief = await storage.getDailyBrief(req.params.date, clientId || undefined);
    if (!brief) return res.status(404).json({ message: "No brief for this date" });
    res.json(brief);
  });

  app.get("/api/events", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const events = await storage.getDetectedEvents({
      type: req.query.type as string,
      severity: req.query.severity as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      acknowledged: req.query.acknowledged === "true" ? true : req.query.acknowledged === "false" ? false : undefined,
      clientId: clientId || undefined,
    });
    res.json(events);
  });

  app.post("/api/events/:id/acknowledge", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.acknowledgeEvent(id, clientId || undefined);
    res.json({ success: true });
  });

  app.get("/api/entities", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const topEntities = await storage.getTopEntities({
      limit: req.query.limit ? parseInt(req.query.limit as string) : 30,
      days: req.query.days ? parseInt(req.query.days as string) : 7,
      entityType: req.query.type as string,
      clientId: clientId || undefined,
    });
    res.json(topEntities);
  });

  app.get("/api/entities/:name", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const name = decodeURIComponent(req.params.name);
    const mentions = await storage.getEntityMentions(name, {
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      clientId: clientId || undefined,
    });
    const timeline = await storage.getEntityTimeline(name, req.query.days ? parseInt(req.query.days as string) : 30, clientId || undefined);
    res.json({ entityName: name, mentions, timeline });
  });

  app.get("/api/predictions", requireAiEnabled(), requireCapability(CAPS.INTELLIGENCE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const predictions = await storage.getTrendPredictions({
      topic: req.query.topic as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      clientId: clientId || undefined,
    });
    res.json(predictions);
  });

  app.post("/api/ai/query", requireAiEnabled(), requireCapability(CAPS.INTELLIGENCE_RUN), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const { question } = req.body;
    if (!question || typeof question !== "string") return res.status(400).json({ message: "Question is required" });
    const result = await answerIntelligenceQuery(sanitizeInput(question), clientId || undefined);
    res.json(result);
  });

  app.get("/api/articles/:id/analysis", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const analysis = await storage.getArticleAiAnalysis(id, clientId || undefined);
    if (!analysis) return res.status(404).json({ message: "No AI analysis available" });
    res.json(analysis);
  });

  app.post("/api/admin/run-intelligence", requireSystemAdmin(), async (req, res) => {
    runIntelligencePipeline().catch(e => console.error("[Intelligence Pipeline] Error:", e));
    res.json({ message: "Intelligence pipeline started" });
  });

  app.get("/api/subscription", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json(null);
    const sub = await storage.getSubscription(clientId);
    const activeUsers = await storage.getActiveUserCount(clientId);
    res.json({ subscription: sub, activeUsers, planLimits: sub ? PLAN_LIMITS[sub.plan as keyof typeof PLAN_LIMITS] : PLAN_LIMITS.starter });
  });

  app.get("/api/subscription/usage", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json({ plan: "starter", seats: { used: 0, max: 0 }, keywords: { used: 0, max: 0 }, sources: { used: 0, max: 0 } });
    const sub = await storage.getSubscription(clientId);
    const limits = sub ? PLAN_LIMITS[sub.plan as keyof typeof PLAN_LIMITS] : PLAN_LIMITS.starter;
    const activeUsers = await storage.getActiveUserCount(clientId);
    const clientKws = await storage.getClientKeywords(clientId);
    const userSources = await storage.getSources(clientId);
    res.json({
      plan: sub?.plan || "starter",
      status: sub?.status || "trial",
      seats: { used: activeUsers, max: limits.maxUsers },
      keywords: { used: clientKws.length, max: limits.maxKeywords },
      sources: { used: userSources.length, max: limits.maxSources },
      analyticsLevel: limits.analyticsLevel,
      aiBriefLevel: limits.aiBriefLevel,
      apiAccess: limits.apiAccess,
    });
  });

  app.post("/api/billing/activate", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { clientId, plan } = req.body;
    if (!clientId || !plan) return res.status(400).json({ message: "Client ID and plan required" });
    if (!["starter", "pro", "enterprise"].includes(plan)) return res.status(400).json({ message: "Invalid plan" });
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    const existing = await storage.getSubscription(clientId);
    if (existing) {
      const updated = await storage.updateSubscription(clientId, { plan, status: "active", maxUsers: limits.maxUsers === -1 ? 999 : limits.maxUsers, maxKeywords: limits.maxKeywords === -1 ? 999 : limits.maxKeywords, maxSources: limits.maxSources === -1 ? 999 : limits.maxSources, analyticsLevel: limits.analyticsLevel, aiBriefLevel: limits.aiBriefLevel, apiAccess: limits.apiAccess });
      return res.json(updated);
    }
    const sub = await storage.createSubscription({ clientId, plan, status: "active", maxUsers: limits.maxUsers === -1 ? 999 : limits.maxUsers, maxKeywords: limits.maxKeywords === -1 ? 999 : limits.maxKeywords, maxSources: limits.maxSources === -1 ? 999 : limits.maxSources, analyticsLevel: limits.analyticsLevel, aiBriefLevel: limits.aiBriefLevel, apiAccess: limits.apiAccess });
    res.status(201).json(sub);
  });

  app.post("/api/billing/change-plan", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { clientId, plan } = req.body;
    if (!clientId || !plan) return res.status(400).json({ message: "Client ID and plan required" });
    if (!["starter", "pro", "enterprise"].includes(plan)) return res.status(400).json({ message: "Invalid plan" });
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    const updated = await storage.updateSubscription(clientId, { plan, maxUsers: limits.maxUsers === -1 ? 999 : limits.maxUsers, maxKeywords: limits.maxKeywords === -1 ? 999 : limits.maxKeywords, maxSources: limits.maxSources === -1 ? 999 : limits.maxSources, analyticsLevel: limits.analyticsLevel, aiBriefLevel: limits.aiBriefLevel, apiAccess: limits.apiAccess });
    if (!updated) return res.status(404).json({ message: "Subscription not found" });
    res.json(updated);
  });

  app.post("/api/billing/cancel", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ message: "Client ID required" });
    const updated = await storage.updateSubscription(clientId, { status: "suspended" });
    if (!updated) return res.status(404).json({ message: "Subscription not found" });
    res.json(updated);
  });

  app.get("/api/onboarding", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json(null);
    const state = await storage.getOnboardingState(clientId);
    res.json(state);
  });

  app.post("/api/onboarding", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "No client association" });
    const { currentStep, industry, countries, selectedKeywords, selectedSources, notificationPreferences, completed } = req.body;
    const state = await storage.upsertOnboardingState({
      clientId,
      currentStep: currentStep || 1,
      industry: industry ? sanitizeInput(industry) : undefined,
      countries: countries || undefined,
      selectedKeywords: selectedKeywords || undefined,
      selectedSources: selectedSources || undefined,
      notificationPreferences: notificationPreferences || undefined,
      completed: completed || false,
      completedAt: completed ? new Date() : undefined,
    });
    res.json(state);
  });

  app.get("/api/notifications/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const settings = await storage.getNotificationSettings(user.id);
    res.json(settings);
  });

  app.post("/api/notifications/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { channel, frequency, type, enabled, config } = req.body;
    if (!channel) return res.status(400).json({ message: "Channel required" });
    const setting = await storage.upsertNotificationSetting({ userId: user.id, channel: sanitizeInput(channel), frequency: frequency || "daily", type: type || "briefing", enabled: enabled !== false, config: config || null });
    res.json(setting);
  });

  app.delete("/api/notifications/settings/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.deleteNotificationSetting(id, user.id);
    res.sendStatus(204);
  });

  app.get("/api/white-label", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json(null);
    const settings = await storage.getWhiteLabelSettings(clientId);
    res.json(settings);
  });

  app.put("/api/white-label", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "No client association" });
    const { logoUrl, organizationName, customReportTitle, primaryColor } = req.body;
    const settings = await storage.upsertWhiteLabelSettings({ clientId, logoUrl: logoUrl || null, organizationName: organizationName ? sanitizeInput(organizationName) : null, customReportTitle: customReportTitle ? sanitizeInput(customReportTitle) : null, primaryColor: primaryColor || null });
    res.json(settings);
  });

  app.get("/api/support/tickets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const params: any = {};
    if (!isSystemAdmin(user)) params.userId = user.id;
    if (req.query.status) params.status = req.query.status as string;
    const tickets = await storage.getSupportTickets(params);
    res.json(tickets);
  });

  app.post("/api/support/tickets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { subject, message, priority } = req.body;
    if (!subject || !message) return res.status(400).json({ message: "Subject and message required" });
    const clientId = resolveClientId(user, req);
    const ticket = await storage.createSupportTicket({ userId: user.id, clientId: clientId || null, subject: sanitizeInput(subject), message: sanitizeInput(message), priority: priority || "normal" });
    res.status(201).json(ticket);
  });

  app.put("/api/support/tickets/:id/status", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "Status required" });
    await storage.updateSupportTicketStatus(id, status);
    res.sendStatus(204);
  });

  app.get("/api/executive/snapshot", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const scopedSourceIds = await getUserSourceIds(user, req);
    const articles = await storage.getArticles({ limit: 5, sourceIds: scopedSourceIds, clientId: clientId || undefined });
    const events = await storage.getDetectedEvents({ limit: 5, clientId: clientId || undefined });
    const briefs = await storage.getDailyBriefs(1, clientId || undefined);
    const entities = await storage.getTopEntities({ limit: 5, days: 1, clientId: clientId || undefined });
    const clusters = await storage.getStoryClusters({ limit: 3, clientId: clientId || undefined });
    res.json({
      topStory: clusters[0] || null,
      latestBrief: briefs[0] || null,
      alerts: events,
      topEntities: entities,
      recentArticles: articles.items.slice(0, 5),
      storyClusters: clusters,
    });
  });

  app.get("/api/demo/snapshot", async (_req, res) => {
    res.json({
      plan: "pro",
      topStory: { title: "Global Climate Summit 2026", mainTopic: "Climate Policy", articleCount: 24, sourceCount: 8, importanceScore: 92, avgSentiment: -15 },
      latestBrief: { date: new Date().toISOString().split("T")[0], content: "Today's intelligence overview highlights continued developments in climate policy discussions, with multiple world leaders announcing new commitments. Market volatility persists as central banks signal cautious approaches to monetary policy.", majorDevelopments: [{ title: "Climate Summit Progress", summary: "New emissions targets proposed by G20 nations" }, { title: "Market Watch", summary: "Tech sector leads recovery amid cautious optimism" }], emergingTopics: ["AI Regulation", "Supply Chain Resilience", "Digital Currency"], confidenceScore: 85 },
      alerts: [{ id: 1, type: "volume_spike", topic: "Climate Summit", severity: "high", explanation: "300% increase in coverage over 24 hours", acknowledged: false }, { id: 2, type: "sentiment_shift", topic: "Tech Regulation", severity: "medium", explanation: "Shift from neutral to negative coverage", acknowledged: false }],
      topEntities: [{ entityName: "United Nations", entityType: "organization", mentionCount: 45, avgSentiment: 8 }, { entityName: "European Union", entityType: "organization", mentionCount: 38, avgSentiment: 12 }],
      usage: { seats: { used: 5, max: 10 }, keywords: { used: 23, max: 50 }, sources: { used: 12, max: 20 }, articlesProcessed: 1247 },
    });
  });

  // === PRODUCT INTELLIGENCE: USER FEEDBACK ===
  app.post("/api/feedback", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { feature, targetId, targetType, rating, comment } = req.body;
    if (!feature || !rating) return res.status(400).json({ message: "Feature and rating required" });
    const feedback = await storage.createUserFeedback({ userId: user.id, feature, targetId, targetType, rating, comment });
    res.status(201).json(feedback);
  });

  app.get("/api/feedback", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const params: any = {};
    if (!isSystemAdmin(user)) params.userId = user.id;
    if (req.query.feature) params.feature = req.query.feature;
    const feedback = await storage.getUserFeedback(params);
    res.json(feedback);
  });

  // === PRODUCT INTELLIGENCE: INSIGHT ENGAGEMENT ===
  app.post("/api/engagement", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { insightType, insightId, opened, clicked, exported, dwellTimeSeconds } = req.body;
    if (!insightType || !insightId) return res.status(400).json({ message: "Insight type and ID required" });
    const engagement = await storage.upsertInsightEngagement({ userId: user.id, insightType, insightId, opened, clicked, exported, dwellTimeSeconds });
    res.json(engagement);
  });

  app.get("/api/engagement", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const params: any = { userId: user.id };
    if (req.query.insightType) params.insightType = req.query.insightType;
    res.json(await storage.getInsightEngagement(params));
  });

  // === PRODUCT INTELLIGENCE: AI CORRECTIONS ===
  app.post("/api/corrections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { articleId, field, oldValue, newValue } = req.body;
    if (!field || !newValue) return res.status(400).json({ message: "Field and new value required" });
    const correction = await storage.createAiCorrection({ articleId, userId: user.id, field, oldValue, newValue });
    res.status(201).json(correction);
  });

  app.get("/api/corrections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const params: any = {};
    if (!isSystemAdmin(user)) params.userId = user.id;
    if (req.query.status) params.status = req.query.status;
    if (req.query.articleId) params.articleId = parseInt(req.query.articleId as string);
    res.json(await storage.getAiCorrections(params));
  });

  app.patch("/api/corrections/:id/status", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!status || !["pending", "accepted", "rejected"].includes(status)) return res.status(400).json({ message: "Valid status required" });
    await storage.updateAiCorrectionStatus(id, status);
    res.json({ success: true });
  });

  // === PRODUCT INTELLIGENCE: ALERT PREFERENCES ===
  app.get("/api/alert-preferences", requireCapability(CAPS.ALERTS_VIEW), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json([]);
    res.json(await storage.getAlertPreferences(clientId));
  });

  app.post("/api/alert-preferences", requireCapability(CAPS.ALERTS_MANAGE), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Client context required" });
    try {
      const payload = Array.isArray(req.body) ? req.body : [req.body];
      if (payload.length === 0) return res.status(400).json({ message: "Alert preference required" });
      const prefs = await Promise.all(payload.map((item: any) => {
        if (!item?.alertType) throw new Error("Alert type required");
        const sensitivityScore = Number.isFinite(Number(item.sensitivityScore))
          ? Math.min(100, Math.max(0, Math.round(Number(item.sensitivityScore))))
          : 50;
        return storage.upsertAlertPreference({
          clientId,
          alertType: String(item.alertType),
          sensitivityScore,
          autoTuned: Boolean(item.autoTuned),
        });
      }));
      res.json(Array.isArray(req.body) ? prefs : prefs[0]);
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : "Invalid alert preference" });
    }
  });

  // === CLIENT ALERT RULES (tenant-scoped, non-AI) ===
  app.get("/api/alerts/rules", requireCapability(CAPS.ALERTS_VIEW), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;

    try {
      res.json(await storage.getAlertRules(clientId));
    } catch (err) {
      console.error("Alert rules fetch failed:", err);
      res.status(500).json({ message: "Error fetching alert rules" });
    }
  });

  app.get("/api/alerts/overview", requireCapability(CAPS.ALERTS_VIEW), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;

    try {
      const scopedSourceIds = await getUserSourceIds(user, req);
      const rules = await storage.getAlertRules(clientId);
      const activeRules = rules.filter(rule => rule.active !== false);
      const summaries = await Promise.all(activeRules.slice(0, 25).map(async (rule) => {
        const result = await storage.getArticles(buildAlertArticleParams(rule, clientId, scopedSourceIds, 5));
        return {
          ruleId: rule.id,
          count: result.total,
          feedUrl: buildAlertFeedUrl(rule),
          articles: result.items,
        };
      }));
      const matchedArticles = summaries.reduce((sum, item) => sum + item.count, 0);
      res.json({
        rules,
        summaries,
        totals: {
          rules: rules.length,
          activeRules: activeRules.length,
          matchedRules: summaries.filter(item => item.count > 0).length,
          matchedArticles,
          evaluatedRules: summaries.length,
        },
      });
    } catch (err) {
      console.error("Alert overview failed:", err);
      res.status(500).json({ message: "Error fetching alert overview" });
    }
  });

  app.post("/api/alerts/rules", requireCapability(CAPS.ALERTS_MANAGE), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;

    try {
      const input = alertRuleBaseInputSchema.parse(req.body || {});
      const validationError = validateAlertRuleInput(input);
      if (validationError) return res.status(400).json({ message: validationError });
      if (input.sourceId) {
        const source = await storage.getSource(input.sourceId, clientId);
        if (!source) return safeNotFound(res);
      }
      const rule = await storage.createAlertRule({ ...input, clientId, createdBy: user.id });
      await storage.createAuditLog({
        userId: user.id,
        clientId,
        action: "create",
        entity: "alert_rule",
        entityId: rule.id,
        details: `Created alert rule ${rule.name}`,
      });
      res.status(201).json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid alert rule" });
      }
      console.error("Alert rule create failed:", err);
      res.status(500).json({ message: "Alert rule create failed" });
    }
  });

  app.patch("/api/alerts/rules/:id", requireCapability(CAPS.ALERTS_MANAGE), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid alert rule id" });

    try {
      const existing = await storage.getAlertRule(id, clientId);
      if (!existing) return safeNotFound(res);
      const input = alertRuleUpdateInputSchema.parse(req.body || {});
      const merged = { ...existing, ...input };
      const validationError = validateAlertRuleInput(merged);
      if (validationError) return res.status(400).json({ message: validationError });
      if (input.sourceId) {
        const source = await storage.getSource(input.sourceId, clientId);
        if (!source) return safeNotFound(res);
      }
      const updated = await storage.updateAlertRule(id, input, clientId);
      if (!updated) return safeNotFound(res);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid alert rule update" });
      }
      console.error("Alert rule update failed:", err);
      res.status(500).json({ message: "Alert rule update failed" });
    }
  });

  app.delete("/api/alerts/rules/:id", requireCapability(CAPS.ALERTS_MANAGE), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid alert rule id" });

    try {
      const existing = await storage.getAlertRule(id, clientId);
      if (!existing) return safeNotFound(res);
      await storage.deleteAlertRule(id, clientId);
      res.sendStatus(204);
    } catch (err) {
      console.error("Alert rule delete failed:", err);
      res.status(500).json({ message: "Alert rule delete failed" });
    }
  });

  // === PRODUCT INTELLIGENCE: DASHBOARD PREFERENCES ===
  app.get("/api/dashboard-preferences", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const prefs = await storage.getDashboardPreferences(user.id);
    res.json(prefs || null);
  });

  app.post("/api/dashboard-preferences", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { pinnedTopics, favoriteEntities, preferredSources, recommendedPanels, frequentSearches } = req.body;
    const prefs = await storage.upsertDashboardPreferences({ userId: user.id, pinnedTopics, favoriteEntities, preferredSources, recommendedPanels, frequentSearches });
    res.json(prefs);
  });

  // === PRODUCT INTELLIGENCE: EXPERIMENTS (A/B TESTING) ===
  app.get("/api/experiments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const status = req.query.status as string | undefined;
    res.json(await storage.getExperiments({ status }));
  });

  app.post("/api/experiments", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { name, description, variants, targetPercentage, endDate } = req.body;
    if (!name || !variants) return res.status(400).json({ message: "Name and variants required" });
    const experiment = await storage.createExperiment({ name, description, variants, targetPercentage, endDate });
    res.status(201).json(experiment);
  });

  app.patch("/api/experiments/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id);
    const updated = await storage.updateExperiment(id, req.body);
    res.json(updated);
  });

  app.get("/api/experiments/my-assignments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    res.json(await storage.getUserExperiments(user.id));
  });

  app.post("/api/experiments/:id/assign", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const experimentId = parseInt(req.params.id);
    const existing = await storage.getExperimentAssignment(user.id, experimentId);
    if (existing) return res.json(existing);
    const experiment = await storage.getExperiments();
    const exp = experiment.find(e => e.id === experimentId);
    if (!exp || exp.status !== "active") return res.status(404).json({ message: "Active experiment not found" });
    const variantList = exp.variants as string[];
    const variant = variantList[Math.floor(Math.random() * variantList.length)];
    const assignment = await storage.createExperimentAssignment({ userId: user.id, experimentId, variant });
    res.status(201).json(assignment);
  });

  // === PRODUCT INTELLIGENCE: KNOWLEDGE BASE (tenant-scoped) ===
  app.get("/api/knowledge", requireCapability(CAPS.KNOWLEDGE_VIEW), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    res.json(await storage.getKnowledgeEntries({ search, limit }, clientId || undefined));
  });

  app.post("/api/knowledge", requireCapability(CAPS.KNOWLEDGE_MANAGE), async (req, res) => {
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });
    const { questionPattern, answerSummary } = req.body;
    if (!questionPattern || !answerSummary) return res.status(400).json({ message: "Question pattern and answer required" });
    const entry = await storage.upsertKnowledgeEntry({ questionPattern, answerSummary, clientId });
    res.json(entry);
  });

  // === PRODUCT INTELLIGENCE: VALUE REPORTS ===
  app.get("/api/value-reports", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json([]);
    res.json(await storage.getValueReports(clientId));
  });

  app.post("/api/value-reports/generate", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ message: "Client ID required" });
    const now = new Date();
    const reportMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const articleResult = await storage.getArticles({ clientId: clientId || undefined });
    const briefs = await storage.getDailyBriefs(30, clientId || undefined);
    const events = await storage.getDetectedEvents({ limit: 100, clientId: clientId || undefined });
    const report = await storage.createValueReport({
      clientId,
      reportMonth,
      alertsDetected: events.length,
      emergingTopicsCaught: briefs.reduce((sum: number, b: any) => sum + ((b.emergingTopics as any[])?.length || 0), 0),
      sentimentChanges: articleResult.items.filter((a: any) => a.sentimentLabel && a.sentimentLabel !== "neutral").length,
      estimatedTimeSavedMinutes: Math.round(articleResult.total * 2.5),
      articlesProcessed: articleResult.total,
      briefsGenerated: briefs.length,
      reportData: { generatedAt: now.toISOString(), period: reportMonth },
    });
    res.status(201).json(report);
  });

  // === PRODUCT INTELLIGENCE: ADMIN USAGE ANALYTICS ===
  app.get("/api/admin/product-analytics", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const feedback = await storage.getUserFeedback({});
    const corrections = await storage.getAiCorrections({});
    const engagement = await storage.getInsightEngagement({});
    const knowledgeBase = await storage.getKnowledgeEntries({});
    const featureCounts: Record<string, number> = {};
    feedback.forEach((f: any) => { featureCounts[f.feature] = (featureCounts[f.feature] || 0) + 1; });
    const ratingDistribution: Record<string, number> = {};
    feedback.forEach((f: any) => { ratingDistribution[f.rating] = (ratingDistribution[f.rating] || 0) + 1; });
    const engagementStats = {
      totalOpened: engagement.filter((e: any) => e.opened).length,
      totalClicked: engagement.filter((e: any) => e.clicked).length,
      totalExported: engagement.filter((e: any) => e.exported).length,
      totalEvents: engagement.length,
    };
    const correctionsByField: Record<string, number> = {};
    corrections.forEach((c: any) => { correctionsByField[c.field] = (correctionsByField[c.field] || 0) + 1; });
    res.json({
      feedback: { total: feedback.length, byFeature: featureCounts, byRating: ratingDistribution },
      engagement: engagementStats,
      corrections: { total: corrections.length, byField: correctionsByField, pendingCount: corrections.filter((c: any) => c.status === "pending").length },
      knowledgeBase: { totalEntries: knowledgeBase.length, topQueries: knowledgeBase.slice(0, 10).map((k: any) => ({ pattern: k.questionPattern, count: k.queryCount })) },
    });
  });

  // === INTEGRATION: WEBHOOKS ===
  app.get("/api/integrations/webhooks", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const webhooks = await storage.getWebhooks(clientId || undefined);
    res.json(webhooks);
  });

  app.post("/api/integrations/webhooks", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const { url, eventTypes, description } = req.body;
    if (!url || !eventTypes || !eventTypes.length) return res.status(400).json({ message: "URL and event types required" });
    const secret = randomBytes(32).toString("hex");
    const webhook = await storage.createWebhook({
      clientId: clientId || 0,
      url,
      secret,
      eventTypes,
      description,
      active: true,
    });
    res.status(201).json(webhook);
  });

  app.patch("/api/integrations/webhooks/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const webhook = await storage.updateWebhook(parseInt(req.params.id), req.body, clientId || undefined);
    res.json(webhook);
  });

  app.delete("/api/integrations/webhooks/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    await storage.deleteWebhook(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  app.get("/api/integrations/webhooks/:id/deliveries", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const webhook = await storage.getWebhook(parseInt(req.params.id), clientId || undefined);
    if (!webhook) return res.status(404).json({ message: "Not found" });
    const deliveries = await storage.getWebhookDeliveries(webhook.id, { limit: 50 });
    res.json(deliveries);
  });

  app.post("/api/integrations/webhooks/:id/test", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const webhook = await storage.getWebhook(parseInt(req.params.id), clientId || undefined);
    if (!webhook) return res.status(404).json({ message: "Not found" });
    const { deliverWebhookEvent } = await import("./webhook-worker");
    await deliverWebhookEvent(webhook, "test", { message: "Test delivery from NWS360", timestamp: new Date().toISOString() });
    res.json({ success: true, message: "Test webhook delivered" });
  });

  // === INTEGRATION: EMAIL SUBSCRIPTIONS ===
  app.get("/api/integrations/email-subscriptions", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const subs = await storage.getEmailSubscriptions({ userId: user.id, clientId });
    res.json(subs);
  });

  app.post("/api/integrations/email-subscriptions", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = emailSubscriptionInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    if (!(await validateBriefingScheduleTarget(parsed.data.customSchedule, clientId, res))) return;
    const data = withNormalizedScheduleRecipients(parsed.data);
    const sub = await storage.createEmailSubscription({ ...data, userId: user.id, clientId });
    res.status(201).json(sub);
  });

  app.patch("/api/integrations/email-subscriptions/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = emailSubscriptionUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    if ("customSchedule" in parsed.data && !(await validateBriefingScheduleTarget(parsed.data.customSchedule, clientId, res))) return;
    const data = withNormalizedScheduleRecipients(parsed.data);
    const sub = await storage.updateEmailSubscription(parseInt(req.params.id), data, { userId: user.id, clientId });
    if (!sub) return res.status(404).json({ message: "Not found" });
    res.json(sub);
  });

  app.delete("/api/integrations/email-subscriptions/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const id = parseInt(req.params.id);
    const existing = await storage.getEmailSubscriptions({ userId: user.id, clientId });
    if (!existing.some(subscription => subscription.id === id)) return res.status(404).json({ message: "Not found" });
    await storage.deleteEmailSubscription(id, { userId: user.id, clientId });
    res.json({ success: true });
  });

  // === INTEGRATION: COMMUNICATION (Slack/Teams) ===
  app.get("/api/integrations/communication", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const configs = await storage.getIntegrationConfigs(clientId || undefined);
    res.json(configs);
  });

  app.post("/api/integrations/communication", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const config = await storage.createIntegrationConfig({ ...req.body, clientId: clientId || 0 });
    res.status(201).json(config);
  });

  app.patch("/api/integrations/communication/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const config = await storage.updateIntegrationConfig(parseInt(req.params.id), req.body, clientId || undefined);
    res.json(config);
  });

  app.delete("/api/integrations/communication/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    await storage.deleteIntegrationConfig(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === INTEGRATION: EMBED WIDGETS ===
  app.get("/api/integrations/embeds", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const tokens = await storage.getEmbedTokens(clientId || undefined);
    res.json(tokens);
  });

  app.post("/api/integrations/embeds", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const token = randomBytes(24).toString("hex");
    const embed = await storage.createEmbedToken({
      clientId: clientId || 0,
      token,
      widgetType: req.body.widgetType,
      allowedDomains: req.body.allowedDomains || [],
      active: true,
      config: req.body.config || {},
    });
    res.status(201).json(embed);
  });

  app.delete("/api/integrations/embeds/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    await storage.deleteEmbedToken(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === PUBLIC EMBED ROUTES (unauthenticated, token-based) ===
  app.get("/embed/:token", async (req, res) => {
    const embedToken = await storage.getEmbedTokenByToken(req.params.token);
    if (!embedToken || !embedToken.active) return res.status(404).send("Widget not found");
    const origin = req.headers.origin || req.headers.referer;
    if (embedToken.allowedDomains && embedToken.allowedDomains.length > 0 && origin) {
      const allowed = embedToken.allowedDomains.some(d => origin.includes(d));
      if (!allowed) return res.status(403).send("Domain not allowed");
    }
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    let widgetData: any = {};
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const embedClientId = embedToken.clientId || undefined;
    if (embedToken.widgetType === "trending_topics") {
      widgetData = await storage.getTrendingTopics(sevenDaysAgo.toISOString(), now.toISOString(), undefined, embedClientId);
    } else if (embedToken.widgetType === "sentiment_overview") {
      widgetData = await storage.getSentimentReports(sevenDaysAgo.toISOString(), now.toISOString(), undefined, embedClientId);
    } else if (embedToken.widgetType === "entity_tracker") {
      widgetData = await storage.getTopEntities({ limit: 10, days: 7, clientId: embedClientId });
    } else if (embedToken.widgetType === "daily_briefing") {
      const today = now.toISOString().split("T")[0];
      widgetData = await storage.getDailyBrief(today, embedClientId);
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWS360 Widget</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e2e8f0;padding:16px}.widget{border:1px solid #1e293b;border-radius:8px;padding:16px;background:#111827}.title{font-size:14px;font-weight:600;margin-bottom:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em}.item{padding:8px 0;border-bottom:1px solid #1e293b;font-size:13px}.item:last-child{border-bottom:none}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}.positive{background:#065f46;color:#6ee7b7}.negative{background:#7f1d1d;color:#fca5a5}.neutral{background:#1e293b;color:#94a3b8}.powered{text-align:center;margin-top:12px;font-size:10px;color:#475569}a{color:#60a5fa;text-decoration:none}</style></head><body><div class="widget"><div class="title">${embedToken.widgetType.replace(/_/g, " ")}</div><div id="content">${renderWidgetContent(embedToken.widgetType, widgetData)}</div></div><div class="powered">Powered by NWS360</div></body></html>`;
    res.type("html").send(html);
  });

  // === INTEGRATION: EXPORTS ===
  app.post("/api/integrations/export", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const exportClientId = resolveClientId(user, req);
    const { exportType, format, filters } = req.body;
    if (!exportType || !format) return res.status(400).json({ message: "Export type and format required" });
    let resultData: any = null;
    if (exportType === "articles") {
      const result = await storage.getArticles({ ...(filters || {}), clientId: exportClientId || undefined });
      resultData = result.items.map(a => ({
        id: a.id, title: a.title, url: a.url, summary: a.summary,
        source: a.subSource || a.source?.name,
        subSource: a.subSource,
        collectedVia: a.subSource ? a.source?.name : null,
        category: a.category,
        sentiment: a.sentimentLabel, score: a.sentimentScore,
        keywords: a.keywords, topics: a.topics, country: a.country,
        publishedAt: a.publishedAt,
      }));
    } else if (exportType === "entities") {
      resultData = await storage.getTopEntities({ limit: 100, days: 30, clientId: exportClientId || undefined });
    } else if (exportType === "stories") {
      resultData = await storage.getStoryClusters({ limit: 100, clientId: exportClientId || undefined });
    } else if (exportType === "trends") {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      resultData = await storage.getTrendingTopics(thirtyDaysAgo.toISOString(), now.toISOString(), undefined, exportClientId || undefined);
    } else if (exportType === "briefings") {
      resultData = await storage.getDailyBriefs(30, exportClientId || undefined);
    }
    const job = await storage.createExportJob({
      userId: user.id,
      exportType,
      format,
      filters,
      status: "completed",
      resultData,
    });
    if (format === "csv" && Array.isArray(resultData) && resultData.length > 0) {
      const headers = Object.keys(resultData[0]);
      const csvRows = [headers.join(",")];
      resultData.forEach((row: any) => {
        csvRows.push(headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(","));
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=nws360-${exportType}-${Date.now()}.csv`);
      return res.send(csvRows.join("\n"));
    }
    res.json({ job, data: resultData });
  });

  app.get("/api/integrations/exports", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const jobs = await storage.getExportJobs(user.id);
    res.json(jobs);
  });

  // === INTEGRATION: SSO CONFIG ===
  app.get("/api/integrations/sso", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const configs = await storage.getSsoConfigs(clientId || undefined);
    res.json(configs);
  });

  app.post("/api/integrations/sso", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const config = await storage.createSsoConfig({ ...req.body, clientId: clientId || 0 });
    res.status(201).json(config);
  });

  app.patch("/api/integrations/sso/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const config = await storage.updateSsoConfig(parseInt(req.params.id), req.body, clientId || undefined);
    res.json(config);
  });

  app.delete("/api/integrations/sso/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    await storage.deleteSsoConfig(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === INTEGRATION: DATA IMPORT CONNECTORS ===
  app.get("/api/integrations/import-connectors", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const connectors = await storage.getImportConnectors(clientId || undefined);
    res.json(connectors);
  });

  app.post("/api/integrations/import-connectors", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const connector = await storage.createImportConnector({ ...req.body, clientId: clientId || 0 });
    if (connector.connectorType === "private_rss" && connector.url) {
      await storage.createSource({
        name: connector.name,
        url: connector.url,
        type: "rss",
        active: true,
        intervalMinutes: 30,
        userId: user.id,
      });
    }
    res.status(201).json(connector);
  });

  app.patch("/api/integrations/import-connectors/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    const connector = await storage.updateImportConnector(parseInt(req.params.id), req.body, clientId || undefined);
    res.json(connector);
  });

  app.delete("/api/integrations/import-connectors/:id", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const clientId = resolveClientId(user, req);
    await storage.deleteImportConnector(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  // === INTEGRATION: MOBILE NOTIFICATION PREFS ===
  app.get("/api/integrations/mobile-notifications", requireCapability(CAPS.INTEGRATIONS_VIEW), async (req, res) => {
    const user = (req as any).user;
    const prefs = await storage.getMobileNotificationPrefs(user.id);
    res.json(prefs || { criticalAlerts: true, briefingReady: true, entityChanges: false, severityLevel: "high" });
  });

  app.put("/api/integrations/mobile-notifications", requireCapability(CAPS.INTEGRATIONS_MANAGE), async (req, res) => {
    const user = (req as any).user;
    const prefs = await storage.upsertMobileNotificationPrefs({ ...req.body, userId: user.id });
    res.json(prefs);
  });

  // === EXTENDED PARTNER API: stories, entities, briefings ===
  app.get("/api/v1/stories", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const limit = req.query.limit ? Math.min(50, parseInt(req.query.limit as string)) : 20;
    const clusters = await storage.getStoryClusters({ limit, clientId: partnerClientId || undefined });
    res.json({ items: clusters, total: clusters.length });
  });

  app.get("/api/v1/entities", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const limit = req.query.limit ? Math.min(100, parseInt(req.query.limit as string)) : 20;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const entities = await storage.getTopEntities({ limit, days, clientId: partnerClientId || undefined });
    res.json({ items: entities, total: entities.length });
  });

  app.get("/api/v1/briefings", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const limit = req.query.limit ? Math.min(30, parseInt(req.query.limit as string)) : 7;
    const briefs = await storage.getDailyBriefs(limit, partnerClientId || undefined);
    res.json({ items: briefs, total: briefs.length });
  });

  app.get("/api/v1/trends", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const now = new Date();
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const data = await storage.getTrendingTopics(startDate.toISOString(), now.toISOString(), undefined, partnerClientId || undefined);
    res.json(data);
  });

  // === ADMIN: INTEGRATION MONITORING ===
  app.get("/api/admin/integration-monitoring", requireSystemAdmin(), async (req, res) => {
    const webhooks = await storage.getWebhooks();
    const deliveries = await storage.getWebhookDeliveries(undefined, { limit: 100 });
    const configs = await storage.getIntegrationConfigs();
    const embedTokens = await storage.getEmbedTokens();
    const exportJobs = await storage.getExportJobs();
    const importConnectors = await storage.getImportConnectors();
    const apiKeysAll = await storage.getApiKeys();
    const totalDeliveries = deliveries.length;
    const successfulDeliveries = deliveries.filter((d: any) => d.success).length;
    const failedDeliveries = deliveries.filter((d: any) => !d.success).length;
    const recentFailures = deliveries.filter((d: any) => !d.success && d.createdAt && (Date.now() - new Date(d.createdAt).getTime()) < 24 * 60 * 60 * 1000);
    res.json({
      webhooks: { total: webhooks.length, active: webhooks.filter((w: any) => w.active).length },
      deliveries: { total: totalDeliveries, successful: successfulDeliveries, failed: failedDeliveries, recentFailures: recentFailures.length },
      communication: { total: configs.length, active: configs.filter((c: any) => c.active).length, platforms: configs.reduce((acc: Record<string, number>, c: any) => { acc[c.platform] = (acc[c.platform] || 0) + 1; return acc; }, {}) },
      embeds: { total: embedTokens.length, active: embedTokens.filter((e: any) => e.active).length },
      exports: { total: exportJobs.length, recent: exportJobs.filter((j: any) => j.createdAt && (Date.now() - new Date(j.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000).length },
      importConnectors: { total: importConnectors.length, active: importConnectors.filter((c: any) => c.active).length },
      apiKeys: { total: apiKeysAll.length, active: apiKeysAll.filter((k: any) => k.active).length },
      recentDeliveries: deliveries.slice(0, 20),
    });
  });

  // === TEAM COLLABORATION: WORKSPACES ===
  app.get("/api/collaboration/workspaces", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json([]);
    const ws = await storage.getWorkspaces(clientId || undefined);
    res.json(ws);
  });

  app.post("/api/collaboration/workspaces", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const schema = z.object({ name: z.string().min(1).max(200), description: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const ws = await storage.createWorkspace({ ...parsed.data, clientId, createdBy: user.id });
    await storage.addWorkspaceMember({ workspaceId: ws.id, userId: user.id, role: "owner" });
    await storage.createActivityEvent({ workspaceId: ws.id, actorId: user.id, verb: "created_workspace", targetType: "workspace", targetId: ws.id, clientId });
    res.status(201).json(ws);
  });

  app.delete("/api/collaboration/workspaces/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    await storage.deleteWorkspace(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  app.get("/api/collaboration/workspaces/:id/members", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    const ws = await storage.getWorkspace(parseInt(req.params.id));
    if (!ws) return res.status(404).json({ message: "Not found" });
    try { assertTenant(ws.clientId, clientId); } catch { return res.status(404).json({ message: "Not found" }); }
    const members = await storage.getWorkspaceMembers(parseInt(req.params.id));
    res.json(members);
  });

  app.post("/api/collaboration/workspaces/:id/members", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    const ws = await storage.getWorkspace(parseInt(req.params.id));
    if (!ws) return res.status(404).json({ message: "Not found" });
    try { assertTenant(ws.clientId, clientId); } catch { return res.status(404).json({ message: "Not found" }); }
    if (!clientId) return res.status(400).json({ message: "Tenant context required" });
    const targetUserId = Number(req.body.userId);
    if (!targetUserId || Number.isNaN(targetUserId)) return res.status(400).json({ message: "Valid userId required" });
    if (!(await ensureUserInTenant(targetUserId, clientId, res))) return;
    const member = await storage.addWorkspaceMember({ workspaceId: parseInt(req.params.id), userId: targetUserId, role: req.body.role || "member" });
    res.status(201).json(member);
  });

  app.delete("/api/collaboration/workspaces/:wsId/members/:userId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    const ws = await storage.getWorkspace(parseInt(req.params.wsId));
    if (!ws) return res.status(404).json({ message: "Not found" });
    try { assertTenant(ws.clientId, clientId); } catch { return res.status(404).json({ message: "Not found" }); }
    await storage.removeWorkspaceMember(parseInt(req.params.wsId), parseInt(req.params.userId));
    res.json({ success: true });
  });

  async function verifyTargetOwnership(targetType: string, targetId: number, clientId: number): Promise<boolean> {
    if (!Number.isInteger(targetId) || targetId <= 0) return false;
    switch (targetType) {
      case "article": {
        const article = await storage.getArticle(targetId, clientId);
        return !!article;
      }
      case "report": {
        const report = await storage.getSharedReport(targetId);
        return !!report && report.clientId === clientId;
      }
      case "story": {
        const cluster = await storage.getStoryCluster(targetId, clientId);
        return !!cluster;
      }
      case "timeline": {
        const timeline = await storage.getStoryTimeline(targetId, clientId);
        return !!timeline;
      }
      case "workspace": {
        const ws = await storage.getWorkspace(targetId);
        return !!ws && ws.clientId === clientId;
      }
      case "task": {
        const task = await storage.getTask(targetId, clientId);
        return !!task && task.clientId === clientId;
      }
      default:
        return false;
    }
  }

  async function validateTaskRelations(input: { assignedTo?: number | null; workspaceId?: number | null; relatedTargetType?: string | null; relatedTargetId?: number | null }, clientId: number, res: any): Promise<boolean> {
    if (input.assignedTo && !(await ensureUserInTenant(input.assignedTo, clientId, res))) return false;
    if (input.workspaceId) {
      const workspace = await getWorkspaceForTenantOrNotFound(input.workspaceId, clientId, res);
      if (workspace === undefined) return false;
    }
    if (input.relatedTargetType || input.relatedTargetId) {
      if (!input.relatedTargetType || !input.relatedTargetId) {
        res.status(400).json({ message: "Related target type and id must be provided together" });
        return false;
      }
      const hasAccess = await verifyTargetOwnership(input.relatedTargetType, input.relatedTargetId, clientId);
      if (!hasAccess) {
        safeNotFound(res);
        return false;
      }
    }
    return true;
  }

  // === DISCUSSION COMMENTS ===
  app.get("/api/collaboration/comments/:targetType/:targetId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const targetType = req.params.targetType;
    const targetId = parseInt(req.params.targetId);
    const hasAccess = await verifyTargetOwnership(targetType, targetId, clientId);
    if (!hasAccess) return res.status(404).json({ message: "Not found" });
    const cmts = await storage.getComments(targetType, targetId, clientId || undefined);
    res.json(cmts);
  });

  app.post("/api/collaboration/comments", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const schema = z.object({ targetType: z.string().min(1), targetId: z.number().int(), message: z.string().min(1), parentId: z.number().int().optional(), workspaceId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    {
      const hasAccess = await verifyTargetOwnership(parsed.data.targetType, parsed.data.targetId, clientId);
      if (!hasAccess) return res.status(404).json({ message: "Not found" });
      if (parsed.data.workspaceId) {
        const workspace = await getWorkspaceForTenantOrNotFound(parsed.data.workspaceId, clientId, res);
        if (workspace === undefined) return;
      }
    }
    const cmt = await storage.createComment({ ...parsed.data, userId: user.id, clientId });
    await storage.createActivityEvent({ workspaceId: parsed.data.workspaceId, actorId: user.id, verb: "commented", targetType: parsed.data.targetType, targetId: parsed.data.targetId, clientId });
    res.status(201).json(cmt);
  });

  app.delete("/api/collaboration/comments/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteComment(parseInt(req.params.id), user.id);
    res.json({ success: true });
  });

  // === ANNOTATIONS & ANALYST NOTES ===
  app.get("/api/collaboration/annotations/:targetType/:targetId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const targetType = req.params.targetType;
    const targetId = parseInt(req.params.targetId);
    const hasAccess = await verifyTargetOwnership(targetType, targetId, clientId);
    if (!hasAccess) return res.status(404).json({ message: "Not found" });
    const notes = await storage.getAnnotations(targetType, targetId, clientId || undefined);
    res.json(notes);
  });

  app.post("/api/collaboration/annotations", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const schema = z.object({ targetType: z.string().min(1), targetId: z.number().int(), noteType: z.enum(["observation", "warning", "hypothesis", "conclusion"]), content: z.string().min(1), workspaceId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    {
      const hasAccess = await verifyTargetOwnership(parsed.data.targetType, parsed.data.targetId, clientId);
      if (!hasAccess) return res.status(404).json({ message: "Not found" });
      if (parsed.data.workspaceId) {
        const workspace = await getWorkspaceForTenantOrNotFound(parsed.data.workspaceId, clientId, res);
        if (workspace === undefined) return;
      }
    }
    const note = await storage.createAnnotation({ ...parsed.data, userId: user.id, clientId });
    await storage.createActivityEvent({ workspaceId: parsed.data.workspaceId, actorId: user.id, verb: "annotated", targetType: parsed.data.targetType, targetId: parsed.data.targetId, metadata: { noteType: parsed.data.noteType }, clientId });
    res.status(201).json(note);
  });

  app.delete("/api/collaboration/annotations/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteAnnotation(parseInt(req.params.id), user.id);
    res.json({ success: true });
  });

  // === SHARED REPORTS / BRIEFINGS ===
  app.get("/api/collaboration/briefing-schedules", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const subscriptions = await storage.getEmailSubscriptions({ clientId });
    res.json(subscriptions.filter(subscription => subscription.sendBriefing !== false));
  });

  app.get("/api/collaboration/briefing-delivery-status", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    res.json({
      provider: getEmailProviderStatus(),
      automaticDeliveryEnabled: getEmailProviderStatus().configured,
    });
  });

  app.get("/api/collaboration/briefing-delivery-history", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const rows = await db.select()
      .from(processingJobs)
      .where(eq(processingJobs.type, "DELIVER_BRIEFINGS"))
      .orderBy(desc(processingJobs.createdAt))
      .limit(150);
    const items = rows
      .map(row => formatDeliveryHistoryJob(row, clientId))
      .filter(Boolean)
      .slice(0, limit);
    res.json({ items, total: items.length });
  });

  app.post("/api/collaboration/briefing-schedules", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = briefingScheduleInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    if (!(await validateBriefingScheduleTarget(parsed.data.customSchedule, clientId, res))) return;
    const data = withNormalizedScheduleRecipients(parsed.data);
    const schedule = await storage.createEmailSubscription({
      ...data,
      sendBriefing: true,
      userId: user.id,
      clientId,
    });
    await storage.createActivityEvent({ actorId: user.id, verb: "created_briefing_schedule", targetType: "email_subscription", targetId: schedule.id, clientId });
    res.status(201).json(schedule);
  });

  app.patch("/api/collaboration/briefing-schedules/:id", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = briefingScheduleUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    if ("customSchedule" in parsed.data && !(await validateBriefingScheduleTarget(parsed.data.customSchedule, clientId, res))) return;
    const data = withNormalizedScheduleRecipients(parsed.data);
    const schedule = await storage.updateEmailSubscription(parseInt(req.params.id), {
      ...data,
      sendBriefing: true,
    }, { clientId });
    if (!schedule) return res.status(404).json({ message: "Not found" });
    await storage.createActivityEvent({ actorId: user.id, verb: "updated_briefing_schedule", targetType: "email_subscription", targetId: schedule.id, clientId });
    res.json(schedule);
  });

  app.delete("/api/collaboration/briefing-schedules/:id", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const id = parseInt(req.params.id);
    const existing = await storage.getEmailSubscriptions({ clientId });
    if (!existing.some(subscription => subscription.id === id && subscription.sendBriefing !== false)) return res.status(404).json({ message: "Not found" });
    await storage.deleteEmailSubscription(id, { clientId });
    await storage.createActivityEvent({ actorId: user.id, verb: "deleted_briefing_schedule", targetType: "email_subscription", targetId: id, clientId });
    res.json({ success: true });
  });

  app.post("/api/collaboration/briefing-schedules/:id/preview-delivery", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const id = parseInt(req.params.id);
    const schedules = await storage.getEmailSubscriptions({ clientId });
    const schedule = schedules.find(subscription => subscription.id === id && subscription.sendBriefing !== false);
    if (!schedule) return res.status(404).json({ message: "Not found" });
    const preview = await buildBriefingDeliveryPreview(schedule);
    res.json({
      ...preview,
      provider: getEmailProviderStatus(),
    });
  });

  app.post("/api/collaboration/briefing-schedules/:id/run-delivery", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const id = parseInt(req.params.id);
    const parsed = z.object({
      dryRun: z.boolean().default(true),
      force: z.boolean().default(true),
    }).strict().safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const schedules = await storage.getEmailSubscriptions({ clientId });
    const schedule = schedules.find(subscription => subscription.id === id && subscription.sendBriefing !== false);
    if (!schedule) return res.status(404).json({ message: "Not found" });
    const result = await deliverDueBriefings({
      clientId,
      scheduleId: id,
      dryRun: parsed.data.dryRun,
      force: parsed.data.force,
    });
    const jobId = await recordCompletedJob("DELIVER_BRIEFINGS", {
      actorId: user.id,
      clientId,
      scheduleId: id,
      dryRun: parsed.data.dryRun,
      force: parsed.data.force,
      manual: true,
    }, result);
    await storage.createActivityEvent({ actorId: user.id, verb: parsed.data.dryRun ? "tested_briefing_delivery" : "ran_briefing_delivery", targetType: "email_subscription", targetId: id, clientId });
    res.json({ ...result, jobId });
  });

  app.post("/api/collaboration/briefing-schedules/run-due", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = z.object({
      dryRun: z.boolean().default(true),
      force: z.boolean().default(false),
      scheduleId: z.coerce.number().int().positive().optional(),
    }).strict().safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    if (parsed.data.scheduleId) {
      const schedules = await storage.getEmailSubscriptions({ clientId });
      const schedule = schedules.find(subscription => subscription.id === parsed.data.scheduleId && subscription.sendBriefing !== false);
      if (!schedule) return res.status(404).json({ message: "Not found" });
    }
    const result = await deliverDueBriefings({
      clientId,
      scheduleId: parsed.data.scheduleId,
      dryRun: parsed.data.dryRun,
      force: parsed.data.force,
    });
    const jobId = await recordCompletedJob("DELIVER_BRIEFINGS", {
      actorId: user.id,
      clientId,
      scheduleId: parsed.data.scheduleId || null,
      dryRun: parsed.data.dryRun,
      force: parsed.data.force,
      manual: true,
      scope: "due",
    }, result);
    await storage.createActivityEvent({
      actorId: user.id,
      verb: parsed.data.dryRun ? "tested_due_briefing_delivery" : "ran_due_briefing_delivery",
      targetType: "email_subscription",
      targetId: parsed.data.scheduleId || null,
      metadata: { jobId, scheduleCount: result.checked },
      clientId,
    });
    res.json({ ...result, jobId });
  });

  app.get("/api/collaboration/reports", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const wId = req.query.workspaceId ? Number(req.query.workspaceId) : undefined;
    if (wId !== undefined && (!Number.isInteger(wId) || wId <= 0)) {
      return res.status(400).json({ message: "Valid workspaceId required" });
    }
    if (wId) {
      const workspace = await getWorkspaceForTenantOrNotFound(wId, clientId, res);
      if (workspace === undefined) return;
    }
    const reports = await storage.getSharedReports({ clientId, workspaceId: wId });
    res.json(reports.filter(report => report.status !== "template"));
  });

  app.post("/api/collaboration/reports", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = sharedReportInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    if (parsed.data.workspaceId) {
      const workspace = await getWorkspaceForTenantOrNotFound(parsed.data.workspaceId, clientId, res);
      if (workspace === undefined) return;
    }
    const crypto = await import("crypto");
    const shareToken = crypto.randomBytes(24).toString("hex");
    const report = await storage.createSharedReport({ ...parsed.data, createdBy: user.id, clientId, shareToken });
    await storage.createActivityEvent({ workspaceId: parsed.data.workspaceId || undefined, actorId: user.id, verb: "created_report", targetType: "report", targetId: report.id, clientId });
    res.status(201).json(report);
  });

  app.patch("/api/collaboration/reports/:id", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = sharedReportUpdateInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    if (parsed.data.workspaceId) {
      const workspace = await getWorkspaceForTenantOrNotFound(parsed.data.workspaceId, clientId, res);
      if (workspace === undefined) return;
    }
    const report = await storage.updateSharedReport(parseInt(req.params.id), parsed.data, clientId);
    if (!report) return res.status(404).json({ message: "Not found" });
    await storage.createChangeHistory({ userId: user.id, entityType: "report", entityId: report.id, changeType: "updated", details: parsed.data, clientId: report.clientId });
    res.json(report);
  });

  app.delete("/api/collaboration/reports/:id", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    await storage.deleteSharedReport(parseInt(req.params.id), clientId);
    res.json({ success: true });
  });

  app.get("/api/collaboration/reports/:id/items", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const report = await storage.getSharedReport(parseInt(req.params.id));
    if (!report) return res.status(404).json({ message: "Not found" });
    try { assertTenant(report.clientId, clientId); } catch { return res.status(404).json({ message: "Not found" }); }
    const items = await storage.getBriefingItems(parseInt(req.params.id));
    res.json(items);
  });

  app.post("/api/collaboration/reports/:id/items", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const reportId = parseInt(req.params.id);
    const report = await storage.getSharedReport(reportId);
    if (!report) return res.status(404).json({ message: "Not found" });
    try { assertTenant(report.clientId, clientId); } catch { return res.status(404).json({ message: "Not found" }); }
    const parsed = briefingItemInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    if (parsed.data.itemType === "article") {
      if (!parsed.data.itemRefId) return res.status(400).json({ message: "Article item requires itemRefId" });
      const article = await storage.getArticle(parsed.data.itemRefId, clientId);
      if (!article) return res.status(404).json({ message: "Not found" });
    } else if (!parsed.data.content) {
      return res.status(400).json({ message: "Content is required for non-article briefing items" });
    }
    const item = await storage.createBriefingItem({ ...parsed.data, reportId });
    res.status(201).json(item);
  });

  app.delete("/api/collaboration/reports/items/:id", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const item = await storage.getBriefingItem(parseInt(req.params.id));
    if (!item) return res.status(404).json({ message: "Not found" });
    const report = await storage.getSharedReport(item.reportId);
    if (!report || report.clientId !== clientId) return res.status(404).json({ message: "Not found" });
    await storage.deleteBriefingItem(parseInt(req.params.id), clientId);
    await storage.updateSharedReport(report.id, {}, clientId);
    res.json({ success: true });
  });

  async function buildBriefingTemplateResponse(report: any) {
    const items = await storage.getBriefingItems(report.id);
    return {
      id: report.id,
      name: report.title,
      description: report.summary,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      lastUpdated: report.lastUpdated,
      sections: items
        .filter(item => TEMPLATE_ITEM_TYPES.includes(item.itemType as any) && item.content)
        .map(item => ({
          id: item.id,
          itemType: item.itemType,
          content: item.content,
          position: item.position || 0,
        })),
    };
  }

  async function createBriefingTemplateFromSections(input: z.infer<typeof briefingTemplateInputSchema>, userId: number, clientId: number) {
    const template = await storage.createSharedReport({
      title: input.name,
      summary: input.description || null,
      status: "template" as any,
      createdBy: userId,
      clientId,
      shareToken: null,
    } as any);

    for (let index = 0; index < input.sections.length; index += 1) {
      const section = input.sections[index];
      await storage.createBriefingItem({
        reportId: template.id,
        itemType: section.itemType,
        content: section.content,
        position: section.position ?? index,
      } as any);
    }

    return buildBriefingTemplateResponse(template);
  }

  app.get("/api/collaboration/report-templates", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const reports = await storage.getSharedReports({ clientId });
    const templates = await Promise.all(
      reports
        .filter(report => report.status === "template")
        .map(report => buildBriefingTemplateResponse(report)),
    );
    res.json(templates);
  });

  app.post("/api/collaboration/report-templates", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = briefingTemplateInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const template = await createBriefingTemplateFromSections(parsed.data, user.id, clientId);
    await storage.createActivityEvent({ actorId: user.id, verb: "created_report_template", targetType: "report", targetId: template.id, clientId });
    res.status(201).json(template);
  });

  app.post("/api/collaboration/report-templates/from-report", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = templateFromReportInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const report = await storage.getSharedReport(parsed.data.reportId);
    if (!report || report.clientId !== clientId || report.status === "template") return res.status(404).json({ message: "Not found" });
    const items = await storage.getBriefingItems(report.id);
    const sections = items
      .filter(item => TEMPLATE_ITEM_TYPES.includes(item.itemType as any) && item.content)
      .map((item, index) => ({
        itemType: item.itemType as (typeof TEMPLATE_ITEM_TYPES)[number],
        content: item.content as string,
        position: item.position ?? index,
      }));
    if (sections.length === 0) {
      return res.status(400).json({ message: "Only headings, notes, and links can be saved in a template" });
    }
    const template = await createBriefingTemplateFromSections({
      name: parsed.data.name || `${report.title} template`,
      description: parsed.data.description || report.summary || null,
      sections,
    }, user.id, clientId);
    await storage.createActivityEvent({ actorId: user.id, verb: "created_report_template", targetType: "report", targetId: template.id, clientId });
    res.status(201).json(template);
  });

  app.post("/api/collaboration/reports/from-template", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const parsed = briefingFromTemplateInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const template = await storage.getSharedReport(parsed.data.templateId);
    if (!template || template.clientId !== clientId || template.status !== "template") return res.status(404).json({ message: "Not found" });
    const crypto = await import("crypto");
    const report = await storage.createSharedReport({
      title: parsed.data.title || `${template.title} - ${new Date().toISOString().slice(0, 10)}`,
      summary: parsed.data.summary || template.summary || null,
      status: "draft",
      createdBy: user.id,
      clientId,
      shareToken: crypto.randomBytes(24).toString("hex"),
    });
    const sections = await storage.getBriefingItems(template.id);
    for (const section of sections.filter(item => TEMPLATE_ITEM_TYPES.includes(item.itemType as any) && item.content)) {
      await storage.createBriefingItem({
        reportId: report.id,
        itemType: section.itemType,
        content: section.content,
        position: section.position || 0,
      } as any);
    }
    await storage.createActivityEvent({ actorId: user.id, verb: "created_report_from_template", targetType: "report", targetId: report.id, clientId });
    res.status(201).json(report);
  });

  app.delete("/api/collaboration/report-templates/:id", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const template = await storage.getSharedReport(parseInt(req.params.id));
    if (!template || template.clientId !== clientId || template.status !== "template") return res.status(404).json({ message: "Not found" });
    await storage.deleteSharedReport(template.id, clientId);
    res.json({ success: true });
  });

  function sharedReportFilename(title: string, ext: string): string {
    const slug = String(title || "briefing")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "briefing";
    const dateLabel = new Date().toISOString().slice(0, 10);
    return `nws360-${slug}-${dateLabel}.${ext}`;
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatExportDate(value: unknown): string {
    if (!value) return "";
    const date = new Date(value as any);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  async function buildSharedReportPayload(report: any) {
    const items = await storage.getBriefingItems(report.id);
    const articleIds = Array.from(new Set(items
      .filter(item => item.itemType === "article" && item.itemRefId)
      .map(item => item.itemRefId as number)));
    const articleRows = articleIds.length > 0
      ? await storage.getArticlesByIds(articleIds, report.clientId)
      : [];
    const articleMap = new Map(articleRows.map(article => [article.id, {
      id: article.id,
      title: article.title,
      url: article.url,
      publishedAt: article.publishedAt,
      imageUrl: article.imageUrl,
      summary: String(article.summary || article.contentClean || article.content || "").replace(/\s+/g, " ").trim().slice(0, 1200),
      category: article.category,
      province: article.province,
      sourceName: article.subSource || article.source?.name || "Unknown source",
      collectedVia: article.subSource ? article.source?.name || null : null,
      sourceType: article.source?.type || null,
    }]));
    const client = await storage.getClient(report.clientId);
    return {
      organization: {
        name: client?.name || "NWS360",
      },
      report: {
        id: report.id,
        title: report.title,
        summary: report.summary,
        status: report.status,
        shareToken: report.shareToken,
        createdAt: report.createdAt,
        lastUpdated: report.lastUpdated,
      },
      items: items.map(item => ({
        id: item.id,
        itemType: item.itemType,
        itemRefId: item.itemRefId,
        content: item.content,
        position: item.position,
        createdAt: item.createdAt,
        article: item.itemRefId ? articleMap.get(item.itemRefId) || null : null,
      })),
    };
  }

  function sharedReportText(payload: any): string {
    const lines: string[] = [
      "NWS360 Briefing",
      `Organization: ${payload.organization.name}`,
      `Title: ${payload.report.title}`,
      `Status: ${payload.report.status}`,
      `Updated: ${formatExportDate(payload.report.lastUpdated || payload.report.createdAt) || "Unknown"}`,
      "",
    ];

    if (payload.report.summary) {
      lines.push("Summary:", payload.report.summary, "");
    }

    const items = [...payload.items].sort((a: any, b: any) => (a.position || 0) - (b.position || 0) || a.id - b.id);
    items.forEach((item: any, index: number) => {
      const article = item.article;
      if (item.itemType === "heading") {
        lines.push(`${index + 1}. ${item.content || "Section"}`, "");
        return;
      }
      if (item.itemType === "article") {
        lines.push(`${index + 1}. ${article?.title || `Article #${item.itemRefId}`}`);
        if (article?.sourceName) lines.push(`Source: ${article.sourceName}`);
        if (article?.collectedVia) lines.push(`Collected via: ${article.collectedVia}`);
        if (article?.publishedAt) lines.push(`Published: ${formatExportDate(article.publishedAt)}`);
        if (article?.url) lines.push(`URL: ${article.url}`);
        const summary = item.content || article?.summary;
        if (summary) lines.push(`Summary: ${summary}`);
        lines.push("");
        return;
      }
      lines.push(`${index + 1}. ${item.itemType}`);
      if (item.content) lines.push(item.content);
      lines.push("");
    });

    return lines.join("\n");
  }

  function sharedReportCsv(payload: any): string {
    const header = ["Report Title", "Organization", "Position", "Type", "Title", "Source", "Collected Via", "Published", "URL", "Content"].join(",");
    const rows = [...payload.items]
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0) || a.id - b.id)
      .map((item: any, index: number) => {
        const article = item.article;
        return [
          csvCell(payload.report.title),
          csvCell(payload.organization.name),
          index + 1,
          csvCell(item.itemType),
          csvCell(item.itemType === "article" ? article?.title || `Article #${item.itemRefId}` : item.itemType === "heading" ? item.content : ""),
          csvCell(article?.sourceName || ""),
          csvCell(article?.collectedVia || ""),
          csvCell(formatExportDate(article?.publishedAt)),
          csvCell(article?.url || (item.itemType === "link" ? item.content : "")),
          csvCell(item.content || article?.summary || ""),
        ].join(",");
      });
    return [header, ...rows].join("\n");
  }

  function sharedReportHtml(payload: any): string {
    const items = [...payload.items].sort((a: any, b: any) => (a.position || 0) - (b.position || 0) || a.id - b.id);
    const itemHtml = items.map((item: any, index: number) => {
      const article = item.article;
      if (item.itemType === "heading") {
        return `<h2>${escapeHtml(item.content || "Section")}</h2>`;
      }
      if (item.itemType === "article") {
        const image = article?.imageUrl
          ? `<img src="${escapeHtml(article.imageUrl)}" alt="" />`
          : "";
        const meta = [
          article?.sourceName,
          article?.collectedVia ? `via ${article.collectedVia}` : "",
          formatExportDate(article?.publishedAt),
        ].filter(Boolean).map(escapeHtml).join(" / ");
        const sourceLink = article?.url
          ? `<a href="${escapeHtml(article.url)}">Open source</a>`
          : "";
        return `<article class="item article">
          ${image}
          <div>
            <p class="kicker">${index + 1}. Article${meta ? ` / ${meta}` : ""}</p>
            <h2>${escapeHtml(article?.title || `Article #${item.itemRefId}`)}</h2>
            ${item.content || article?.summary ? `<p>${escapeHtml(item.content || article?.summary)}</p>` : ""}
            ${sourceLink}
          </div>
        </article>`;
      }
      const link = item.itemType === "link" && String(item.content || "").startsWith("http")
        ? `<a href="${escapeHtml(item.content)}">${escapeHtml(item.content)}</a>`
        : "";
      return `<article class="item">
        <p class="kicker">${index + 1}. ${escapeHtml(item.itemType)}</p>
        ${link || `<p>${escapeHtml(item.content || "")}</p>`}
      </article>`;
    }).join("\n");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(payload.report.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 0; background: #f8fafc; }
    main { max-width: 920px; margin: 0 auto; padding: 40px 24px; background: white; min-height: 100vh; }
    header { border-bottom: 1px solid #e5e7eb; padding-bottom: 24px; margin-bottom: 24px; }
    .meta, .kicker { color: #6b7280; font-size: 13px; }
    h1 { font-size: 36px; line-height: 1.15; margin: 12px 0; }
    h2 { font-size: 20px; line-height: 1.3; margin: 0 0 10px; }
    p { line-height: 1.65; }
    .item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 14px 0; }
    .article { display: grid; grid-template-columns: 160px 1fr; gap: 16px; }
    img { width: 160px; height: 110px; object-fit: cover; border-radius: 6px; background: #e5e7eb; }
    a { color: #2563eb; text-decoration: none; font-weight: 600; }
    @media (max-width: 700px) { .article { grid-template-columns: 1fr; } img { width: 100%; height: auto; max-height: 220px; } }
    @media print { body { background: white; } main { padding: 0; } .item { break-inside: avoid; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="meta">${escapeHtml(payload.organization.name)} / ${escapeHtml(formatExportDate(payload.report.lastUpdated || payload.report.createdAt) || "Unknown")} / ${escapeHtml(payload.report.status)}</div>
      <h1>${escapeHtml(payload.report.title)}</h1>
      ${payload.report.summary ? `<p>${escapeHtml(payload.report.summary)}</p>` : ""}
    </header>
    ${itemHtml || "<p>No briefing items.</p>"}
  </main>
</body>
</html>`;
  }

  function sendSharedReportExport(res: Response, payload: any, format: string) {
    const normalized = ["txt", "html", "csv", "json"].includes(format) ? format : "txt";
    const filename = sharedReportFilename(payload.report.title, normalized);
    if (normalized === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      return res.send(JSON.stringify(payload, null, 2));
    }
    if (normalized === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      return res.send(sharedReportCsv(payload));
    }
    if (normalized === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      return res.send(sharedReportHtml(payload));
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    return res.send(sharedReportText(payload));
  }

  app.get("/api/collaboration/reports/:id/export", requireCapability(CAPS.COLLAB_VIEW), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const report = await storage.getSharedReport(parseInt(req.params.id));
    if (!report || report.clientId !== clientId) return res.status(404).json({ message: "Not found" });
    const payload = await buildSharedReportPayload(report);
    return sendSharedReportExport(res, payload, String(req.query.format || "txt").toLowerCase());
  });

  app.get("/api/shared-report/:token/export", async (req, res) => {
    const report = await storage.getSharedReportByToken(req.params.token);
    if (!report) return res.status(404).json({ message: "Not found" });
    if (report.status === "archived" || report.status === "template") return res.status(404).json({ message: "Not found" });
    const payload = await buildSharedReportPayload(report);
    return sendSharedReportExport(res, payload, String(req.query.format || "txt").toLowerCase());
  });

  app.get("/api/shared-report/:token", async (req, res) => {
    const report = await storage.getSharedReportByToken(req.params.token);
    if (!report) return res.status(404).json({ message: "Not found" });
    if (report.status === "archived" || report.status === "template") return res.status(404).json({ message: "Not found" });
    res.json(await buildSharedReportPayload(report));
  });

  // === CUSTOM TAGS ===
  app.get("/api/collaboration/tags", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json([]);
    const wId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
    if (clientId && wId) {
      const workspace = await getWorkspaceForTenantOrNotFound(wId, clientId, res);
      if (workspace === undefined) return;
    }
    const tags = await storage.getCustomTags({ clientId: clientId || undefined, workspaceId: wId });
    res.json(tags);
  });

  app.post("/api/collaboration/tags", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    if (req.body.workspaceId) {
      const workspace = await getWorkspaceForTenantOrNotFound(Number(req.body.workspaceId), clientId, res);
      if (workspace === undefined) return;
    }
    const tag = await storage.createCustomTag({ ...req.body, clientId, createdBy: user.id });
    res.status(201).json(tag);
  });

  app.delete("/api/collaboration/tags/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    await storage.deleteCustomTag(parseInt(req.params.id), clientId || undefined);
    res.json({ success: true });
  });

  app.get("/api/collaboration/tag-assignments/:targetType/:targetId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const hasAccess = await verifyTargetOwnership(req.params.targetType, parseInt(req.params.targetId), clientId);
    if (!hasAccess) return res.status(404).json({ message: "Not found" });
    const assignments = await storage.getTagAssignments(req.params.targetType, parseInt(req.params.targetId));
    res.json(assignments);
  });

  app.post("/api/collaboration/tag-assignments", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const schema = z.object({ tagId: z.number().int(), targetType: z.string().min(1), targetId: z.number().int() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const tags = await storage.getCustomTags({ clientId });
    if (!tags.some((tag: any) => tag.id === parsed.data.tagId)) return res.status(404).json({ message: "Not found" });
    const hasAccess = await verifyTargetOwnership(parsed.data.targetType, parsed.data.targetId, clientId);
    if (!hasAccess) return res.status(404).json({ message: "Not found" });
    const assignment = await storage.createTagAssignment({ ...parsed.data, createdBy: user.id });
    res.status(201).json(assignment);
  });

  app.delete("/api/collaboration/tag-assignments/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteTagAssignment(parseInt(req.params.id), user.id);
    res.json({ success: true });
  });

  // === TASKS & FOLLOW-UP TRACKING (tenant-scoped) ===
  app.get("/api/collaboration/tasks", requireCapability(CAPS.COLLAB_TASKS), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    try {
      const wsId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
      const assignedTo = req.query.assignedTo ? parseInt(req.query.assignedTo as string) : undefined;
      const status = req.query.status as string | undefined;
      if (status && !TASK_STATUSES.includes(status as any)) return res.status(400).json({ message: "Invalid task status" });
      if (wsId) {
        const workspace = await getWorkspaceForTenantOrNotFound(wsId, clientId, res);
        if (workspace === undefined) return;
      }
      if (assignedTo && !(await ensureUserInTenant(assignedTo, clientId, res))) return;
      const taskList = await storage.getTasks({ workspaceId: wsId, assignedTo, status }, clientId);
      res.json(taskList);
    } catch (err) {
      console.error("Task fetch failed:", err);
      res.status(500).json({ message: "Error fetching tasks" });
    }
  });

  app.post("/api/collaboration/tasks", requireCapability(CAPS.COLLAB_TASKS), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    try {
      const input = taskInputSchema.parse(req.body || {});
      if (!(await validateTaskRelations(input, clientId, res))) return;
      const task = await storage.createTask({ ...normalizeTaskPayload(input), createdBy: user.id, clientId } as any);
      await storage.createActivityEvent({ workspaceId: input.workspaceId || undefined, actorId: user.id, verb: "created_task", targetType: "task", targetId: task.id, clientId });
      res.status(201).json(task);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid task input" });
      }
      res.status(400).json({ message: err instanceof Error ? err.message : "Task create failed" });
    }
  });

  app.patch("/api/collaboration/tasks/:id", requireCapability(CAPS.COLLAB_TASKS), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid task id" });
    try {
      const existingTask = await storage.getTask(id, clientId);
      if (!existingTask) return safeNotFound(res);
      const input = taskUpdateInputSchema.parse(req.body || {});
      const relationInput = {
        assignedTo: input.assignedTo !== undefined ? input.assignedTo : existingTask.assignedTo,
        workspaceId: input.workspaceId !== undefined ? input.workspaceId : existingTask.workspaceId,
        relatedTargetType: input.relatedTargetType !== undefined ? input.relatedTargetType : existingTask.relatedTargetType,
        relatedTargetId: input.relatedTargetId !== undefined ? input.relatedTargetId : existingTask.relatedTargetId,
      };
      if (!(await validateTaskRelations(relationInput, clientId, res))) return;
      const task = await storage.updateTask(id, normalizeTaskPayload(input) as any, clientId);
      if (!task) return safeNotFound(res);
      if (input.status === "resolved" && existingTask.status !== "resolved") {
        await storage.createActivityEvent({ workspaceId: task.workspaceId || undefined, actorId: user.id, verb: "resolved_task", targetType: "task", targetId: task.id, clientId });
      }
      res.json(task);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid task update" });
      }
      res.status(400).json({ message: err instanceof Error ? err.message : "Task update failed" });
    }
  });

  app.delete("/api/collaboration/tasks/:id", requireCapability(CAPS.COLLAB_TASKS), async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid task id" });
    const existingTask = await storage.getTask(id, clientId);
    if (!existingTask) return safeNotFound(res);
    await storage.deleteTask(id, clientId);
    res.json({ success: true });
  });

  // === WATCHLISTS ===
  app.get("/api/collaboration/watchlists", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getWatchlists(user.id);
    res.json(items);
  });

  app.post("/api/collaboration/watchlists", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const item = await storage.createWatchlist({ ...req.body, userId: user.id, clientId });
    res.status(201).json(item);
  });

  app.delete("/api/collaboration/watchlists/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteWatchlist(parseInt(req.params.id), user.id);
    res.json({ success: true });
  });

  // === INTERNAL ALERTS ===
  app.get("/api/collaboration/alerts", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const alerts = await storage.getInternalAlerts(user.id);
    res.json(alerts);
  });

  app.post("/api/collaboration/alerts", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const receiverId = Number(req.body.receiverId);
    if (!receiverId || Number.isNaN(receiverId)) return res.status(400).json({ message: "Valid receiverId required" });
    if (!(await ensureUserInTenant(receiverId, clientId, res))) return;
    if (req.body.workspaceId) {
      const workspace = await getWorkspaceForTenantOrNotFound(Number(req.body.workspaceId), clientId, res);
      if (workspace === undefined) return;
    }
    if (req.body.targetType && req.body.targetId) {
      const hasAccess = await verifyTargetOwnership(String(req.body.targetType), Number(req.body.targetId), clientId);
      if (!hasAccess) return res.status(404).json({ message: "Not found" });
    }
    const alert = await storage.createInternalAlert({ ...req.body, senderId: user.id, receiverId, clientId });
    await storage.createActivityEvent({ workspaceId: req.body.workspaceId, actorId: user.id, verb: "sent_alert", targetType: "alert", targetId: alert.id, clientId });
    res.status(201).json(alert);
  });

  app.patch("/api/collaboration/alerts/:id/read", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.markAlertRead(parseInt(req.params.id), user.id);
    res.json({ success: true });
  });

  // === CHANGE HISTORY ===
  app.get("/api/collaboration/history/:entityType/:entityId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = requireTenantContext(user, req, res);
    if (!clientId) return;
    const hasAccess = await verifyTargetOwnership(req.params.entityType, parseInt(req.params.entityId), clientId);
    if (!hasAccess) return res.status(404).json({ message: "Not found" });
    const history = await storage.getChangeHistory(req.params.entityType, parseInt(req.params.entityId), clientId || undefined);
    res.json(history);
  });

  // === ACTIVITY FEED (tenant-scoped) ===
  app.get("/api/collaboration/activity-feed", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    if (!clientId) return res.json([]);
    const wsId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    if (clientId && wsId) {
      const workspace = await getWorkspaceForTenantOrNotFound(wsId, clientId, res);
      if (workspace === undefined) return;
    }
    const events = await storage.getActivityFeed({ workspaceId: wsId, limit }, clientId || undefined);
    res.json(events);
  });

  // === TEAM MEMBERS LIST (for assigning tasks, sending alerts) ===
  app.get("/api/collaboration/team-members", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const clientId = resolveClientId(user, req);
    let members: any[] = [];
    if (clientId) {
      members = await storage.getUsersByClientId(clientId);
    } else if (isSystemAdmin(user)) {
      members = await storage.getUsers();
    } else {
      return res.status(403).json({ message: "No organization assigned" });
    }
    res.json(members.map(m => ({ id: m.id, username: m.username, role: m.role })));
  });

  return httpServer;
}

function renderWidgetContent(widgetType: string, data: any): string {
  if (!data) return '<div class="item">No data available</div>';
  if (widgetType === "trending_topics" && Array.isArray(data)) {
    return data.slice(0, 10).map((t: any) => `<div class="item">${t.topic || t.keyword || "—"} <span class="badge neutral">${t.count || t.frequency || 0}</span></div>`).join("");
  }
  if (widgetType === "sentiment_overview" && data) {
    const s = data;
    return `<div class="item">Positive: <span class="badge positive">${s.positive || 0}</span></div><div class="item">Negative: <span class="badge negative">${s.negative || 0}</span></div><div class="item">Neutral: <span class="badge neutral">${s.neutral || 0}</span></div>`;
  }
  if (widgetType === "entity_tracker" && Array.isArray(data)) {
    return data.slice(0, 10).map((e: any) => `<div class="item">${e.entityName} <span class="badge neutral">${e.mentionCount} mentions</span></div>`).join("");
  }
  if (widgetType === "daily_briefing" && data) {
    const brief = data;
    return `<div class="item"><strong>${brief.briefDate || "Today"}</strong></div>` + ((brief.topStories as any[]) || []).slice(0, 5).map((s: any) => `<div class="item"><a href="${s.url}" target="_blank">${s.title}</a></div>`).join("");
  }
  return '<div class="item">Widget data loaded</div>';
}

async function seed() {
  if (process.env.SEED_DEMO_DATA !== "1") {
    return;
  }
  const existingSources = await storage.getSources();
  if (existingSources.length === 0) {
    console.log("Seeding sources...");
    const [seedClient] = await storage.getClients();
    if (!seedClient) {
      console.log("Skipping source seed: no client exists.");
      return;
    }
    await storage.createSource({
      name: "TechCrunch",
      url: "https://techcrunch.com/feed/",
      type: "rss",
      active: true,
      intervalMinutes: 15,
      clientId: seedClient.id,
    });
    await storage.createSource({
      name: "The Verge",
      url: "https://www.theverge.com/rss/index.xml",
      type: "rss",
      active: true,
      intervalMinutes: 15,
      clientId: seedClient.id,
    });
    await storage.createSource({
      name: "BBC News",
      url: "https://feeds.bbci.co.uk/news/rss.xml",
      type: "rss",
      active: true,
      intervalMinutes: 10,
      clientId: seedClient.id,
    });
    await storage.createSource({
      name: "Reuters",
      url: "https://www.reutersagency.com/feed/",
      type: "rss",
      active: true,
      intervalMinutes: 10,
      clientId: seedClient.id,
    });
    await storage.createSource({
      name: "Al Jazeera",
      url: "https://www.aljazeera.com/xml/rss/all.xml",
      type: "rss",
      active: true,
      intervalMinutes: 15,
      clientId: seedClient.id,
    });
    console.log("Sources seeded.");
  }
}
