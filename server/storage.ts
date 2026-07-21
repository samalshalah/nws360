import { db } from "./db";
import { isGenericAnalyticsTerm } from "./analytics-noise";
import {
  users, sources, articles, keywords, bookmarks, sourceFetchLogs,
  clients, clientKeywords, systemSettings, adminAuditLogs,
  processingJobs, systemErrors, apiKeys, featureFlags, usageMetrics,
  storyClusters, articleAiAnalysis, dailyBriefs, detectedEvents, entityMentions, trendPredictions,
  subscriptions, onboardingState, notificationSettings, whiteLabelSettings, supportTickets,
  integrationWebhooks, webhookDeliveries, emailSubscriptions, integrationConfigs,
  embedTokens, exportJobs, ssoConfigs, importConnectors, mobileNotificationPrefs,
  workspaces, workspaceMembers, comments, annotations, sharedReports, briefingItems,
  customTags, tagAssignments, tasks, watchlists, internalAlerts, changeHistory, activityEvents,
  type User, type InsertUser,
  type Source, type InsertSource,
  type Article, type InsertArticle,
  type Keyword, type InsertKeyword,
  type Bookmark, type InsertBookmark,
  type SourceFetchLog, type InsertSourceFetchLog,
  type Client, type InsertClient,
  type ClientKeyword, type InsertClientKeyword,
  type SystemSetting, type InsertSystemSetting,
  type AdminAuditLog, type InsertAdminAuditLog,
  type FeatureFlag,
  type ArticleQueryParams,
  type StoryCluster, type InsertStoryCluster,
  type ArticleAiAnalysis, type InsertArticleAiAnalysis,
  type DailyBrief, type InsertDailyBrief,
  type DetectedEvent, type InsertDetectedEvent,
  type EntityMention, type InsertEntityMention,
  type TrendPrediction, type InsertTrendPrediction,
  type Subscription, type InsertSubscription,
  type OnboardingState, type InsertOnboardingState,
  type NotificationSetting, type InsertNotificationSetting,
  type WhiteLabelSetting, type InsertWhiteLabelSetting,
  type SupportTicket, type InsertSupportTicket,
  userFeedback, insightEngagement, aiCorrections, alertPreferences, dashboardPreferences,
  experiments, experimentAssignments, knowledgeEntries, valueReports,
  type UserFeedback, type InsertUserFeedback,
  type InsightEngagement, type InsertInsightEngagement,
  type AiCorrection, type InsertAiCorrection,
  type AlertPreference, type InsertAlertPreference,
  type DashboardPreference, type InsertDashboardPreference,
  type Experiment, type InsertExperiment,
  type ExperimentAssignment, type InsertExperimentAssignment,
  type KnowledgeEntry, type InsertKnowledgeEntry,
  type ValueReport, type InsertValueReport,
  type IntegrationWebhook, type InsertIntegrationWebhook,
  type WebhookDelivery, type InsertWebhookDelivery,
  type EmailSubscription, type InsertEmailSubscription,
  type IntegrationConfig, type InsertIntegrationConfig,
  type EmbedToken, type InsertEmbedToken,
  type ExportJob, type InsertExportJob,
  type SsoConfig, type InsertSsoConfig,
  type ImportConnector, type InsertImportConnector,
  type MobileNotificationPref, type InsertMobileNotificationPref,
  type Workspace, type InsertWorkspace,
  type WorkspaceMember, type InsertWorkspaceMember,
  type Comment, type InsertComment,
  type Annotation, type InsertAnnotation,
  type SharedReport, type InsertSharedReport,
  type BriefingItem, type InsertBriefingItem,
  type CustomTag, type InsertCustomTag,
  type TagAssignment, type InsertTagAssignment,
  type Task, type InsertTask,
  type Watchlist, type InsertWatchlist,
  type InternalAlert, type InsertInternalAlert,
  type ChangeHistoryEntry, type InsertChangeHistory,
  type ActivityEvent, type InsertActivityEvent,
  storyTimelines, timelineEvents, recurringPatterns, entityMemory,
  narrativeShifts, institutionalNotes, historicalMatches, trendLifecycles,
  longRangeBriefings, aiMemoryAnswers,
  type StoryTimeline, type InsertStoryTimeline,
  type TimelineEvent, type InsertTimelineEvent,
  type RecurringPattern, type InsertRecurringPattern,
  type EntityMemory, type InsertEntityMemory,
  type NarrativeShift, type InsertNarrativeShift,
  type InstitutionalNote, type InsertInstitutionalNote,
  type HistoricalMatch, type InsertHistoricalMatch,
  type TrendLifecycle, type InsertTrendLifecycle,
  type LongRangeBriefing, type InsertLongRangeBriefing,
  type AiMemoryAnswer, type InsertAiMemoryAnswer,
  topicForecasts, earlySignals, riskScores, influenceGraph,
  attentionDecay, alertPriorityScores, forecastResults, futureBriefings, articleTranslations,
  permissionGroups, permissions, groupPermissions, userPermissionGroups, userPermissions, impersonationLogs,
  type ArticleTranslation, type InsertArticleTranslation,
  type TopicForecast, type InsertTopicForecast,
  type EarlySignal, type InsertEarlySignal,
  type RiskScore, type InsertRiskScore,
  type InfluenceGraphEntry, type InsertInfluenceGraphEntry,
  type AttentionDecayEntry, type InsertAttentionDecayEntry,
  type AlertPriorityScore, type InsertAlertPriorityScore,
  type ForecastResult, type InsertForecastResult,
  type FutureBriefing, type InsertFutureBriefing,
  type PermissionGroup, type InsertPermissionGroup,
  type Permission, type InsertPermission,
  type GroupPermission, type InsertGroupPermission,
  type UserPermissionGroup, type InsertUserPermissionGroup,
  type UserPermission, type InsertUserPermission,
  type ImpersonationLog, type InsertImpersonationLog,
  insightJobs, aiUsageLog,
  type InsightJob, type InsertInsightJob,
  type AiUsageLog, type InsertAiUsageLog,
} from "@shared/schema";
import { eq, like, and, gte, lte, desc, sql, inArray, asc, isNull, isNotNull } from "drizzle-orm";

const AUTO_PAUSE_THRESHOLD_DB = 5;

function sqlNumberList(values: number[]) {
  return sql.join(values.map(value => sql`${value}`), sql`, `);
}

const ANALYTICS_STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "among", "and", "are", "because", "been",
  "before", "being", "between", "but", "can", "could", "during", "for", "from", "had", "has",
  "have", "her", "here", "him", "his", "into", "its", "more", "new", "not", "now", "off",
  "one", "only", "other", "our", "out", "over", "said", "say", "says", "she", "should", "some",
  "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "under", "until", "very", "was", "were", "what", "when", "where", "which", "while",
  "who", "will", "with", "would", "you", "your",
  "الى", "إلى", "الا", "إلا", "التي", "الذي", "الذين", "اللذين", "ان", "إن", "أن", "او", "أو",
  "اي", "أي", "بعد", "بين", "تلك", "تم", "ثم", "حتى", "حول", "حيث", "خلال", "ذلك", "على",
  "عليها", "عليه", "عن", "عند", "غير", "فإن", "فقط", "في", "فيه", "كان", "كانت", "كل", "كما",
  "لا", "لدى", "لم", "لن", "له", "لها", "ما", "مع", "من", "منذ", "نحو", "هذه", "هذا", "هو",
  "هي", "ولا", "وقد", "وهو", "وهي", "يكون",
]);

function isAnalyticsSignalTerm(value: unknown): boolean {
  const term = String(value || "").trim();
  if (!term) return false;
  const normalized = term
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return !ANALYTICS_STOP_WORDS.has(normalized) && !isGenericAnalyticsTerm(term);
}

type AnalyticsTextRow = {
  title: string | null;
  publishedAt: Date | string | null;
};

function extractAnalyticsTerms(value: string | null | undefined): string[] {
  if (!value) return [];
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "");
  const tokens = normalized.match(/[A-Za-z0-9\u0600-\u06FF]{2,}/g) || [];
  return Array.from(new Set(tokens.filter(isAnalyticsSignalTerm))).slice(0, 24);
}

function buildAnalyticsTermSnapshot(rows: AnalyticsTextRow[], topLimit = 25, timelineLimit = 10, minCount = 2) {
  const counts = new Map<string, number>();
  const countsByDate = new Map<string, Map<string, number>>();

  rows.forEach((row) => {
    const terms = extractAnalyticsTerms(row.title);
    let date = "";
    if (row.publishedAt) {
      const parsed = new Date(row.publishedAt);
      if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
    }

    terms.forEach((term) => {
      counts.set(term, (counts.get(term) || 0) + 1);
      if (!date) return;
      const dayCounts = countsByDate.get(date) || new Map<string, number>();
      dayCounts.set(term, (dayCounts.get(term) || 0) + 1);
      countsByDate.set(date, dayCounts);
    });
  });

  const top = Array.from(counts.entries())
    .filter(([, count]) => count >= minCount)
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, topLimit);
  const timelineTerms = new Set(top.slice(0, timelineLimit).map((item) => item.term));
  const timeline = Array.from(countsByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, dayCounts]) => Array.from(dayCounts.entries())
      .filter(([term]) => timelineTerms.has(term))
      .map(([term, count]) => ({ date, term, count })));

  return { top, timeline };
}

export class TenantNotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "TenantNotFoundError";
  }
}

export function assertTenant(recordClientId: number | null | undefined, requestClientId: number | null | undefined): void {
  if (requestClientId != null && recordClientId != null && recordClientId !== requestClientId) {
    throw new TenantNotFoundError();
  }
}

export function safeNotFound(res: any): any {
  return res.status(404).json({ message: "Not found" });
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Sources
  getSources(clientId?: number): Promise<Source[]>;
  getSource(id: number, clientId?: number): Promise<Source | undefined>;
  createSource(source: InsertSource): Promise<Source>;
  updateSource(id: number, source: Partial<InsertSource>, clientId?: number): Promise<Source | undefined>;
  clearSourceArticles(id: number, clientId?: number): Promise<number>;
  deleteSource(id: number, clientId?: number): Promise<void>;

  // Articles
  getArticles(params?: ArticleQueryParams): Promise<{ items: (Article & { source: Source | null })[], total: number }>;
  getArticle(id: number, clientId?: number): Promise<Article | undefined>;
  getArticlesByIds(ids: number[], clientId?: number): Promise<(Article & { source: Source | null })[]>;
  createArticle(article: InsertArticle): Promise<Article>;
  getArticleByUrl(url: string, clientId: number): Promise<Article | undefined>; // For tenant-scoped deduplication
  getArticleByTitle(title: string, clientId?: number | null): Promise<Article | undefined>; // For cross-channel deduplication

  // Keywords
  getKeywords(clientId?: number): Promise<Keyword[]>;
  createKeyword(keyword: InsertKeyword): Promise<Keyword>;
  deleteKeyword(id: number, clientId?: number): Promise<void>;
  
  // Sources - update last fetched
  updateSourceLastFetched(id: number): Promise<void>;

  // Bookmarks
  getBookmarks(userId: number): Promise<number[]>;
  addBookmark(userId: number, articleId: number): Promise<Bookmark>;
  removeBookmark(userId: number, articleId: number): Promise<void>;

  // Source Fetch Logs / Ingestion Logs
  createFetchLog(log: InsertSourceFetchLog): Promise<SourceFetchLog>;
  getFetchLogs(sourceId: number, limit?: number): Promise<SourceFetchLog[]>;
  getConsecutiveFailureCount(sourceId: number): Promise<number>;
  getIngestionLogs(params?: { from?: string; to?: string; sourceIds?: number[]; limit?: number; offset?: number }): Promise<{ items: (SourceFetchLog & { sourceName: string })[], total: number }>;
  getSourceHealth(sourceIds?: number[]): Promise<{ sourceId: number; sourceName: string; lastStatus: string; lastError: string | null; successRate: number; totalFetches: number; lastFetchedAt: Date | null }[]>;

  // Users management
  getUsers(parentId?: number): Promise<User[]>;
  getUserChildren(parentId: number): Promise<User[]>;
  getUsersByParent(parentId: number | null): Promise<User[]>;
  getSourcesByUserId(userId: number): Promise<Source[]>;
  updateUserRole(id: number, role: string): Promise<User | undefined>;
  updateUserType(id: number, userType: string): Promise<User | undefined>;
  updateUserPassword(id: number, hashedPassword: string): Promise<void>;
  deleteUser(id: number): Promise<void>;

  // Bulk article operations
  deleteArticles(ids: number[], clientId?: number): Promise<number>;
  deleteAllArticles(clientId?: number): Promise<number>;
  updateArticlesCategory(ids: number[], category: string, clientId?: number): Promise<number>;

  // Cleanup
  deleteExpiredArticles(): Promise<number>;

  // Analytics
  getStats(sourceIds?: number[]): Promise<{
    totalArticles: number;
    sourcesCount: number;
    sentimentDistribution: { name: string; value: number }[];
    trendingKeywords: { text: string; value: number }[];
  }>;
  getSentimentTrend(sourceIds?: number[]): Promise<{ date: string; positive: number; negative: number; neutral: number }[]>;

  // Analytics - Content Volume
  getContentVolume(startDate: string, endDate: string, sourceIds?: number[], clientId?: number): Promise<{
    timeline: { date: string; count: number }[];
    bySource: { sourceId: number; sourceName: string; count: number }[];
    byHour: { hour: number; count: number }[];
    peaks: { date: string; count: number }[];
    confidence: { totalCount: number; analyzedCount: number; failedCount: number; pendingRetryCount: number };
  }>;

  // Analytics - Trending Topics
  getTrendingTopics(startDate: string, endDate: string, sourceIds?: number[], clientId?: number): Promise<{
    topics: { topic: string; count: number; sentiment: string }[];
    topicTimeline: { date: string; topic: string; count: number }[];
    byCategory: { category: string; count: number }[];
  }>;

  // Analytics - Keyword Analysis
  getKeywordAnalysis(startDate: string, endDate: string, sourceIds?: number[], clientId?: number): Promise<{
    topKeywords: { keyword: string; count: number; avgSentiment: number }[];
    keywordTimeline: { date: string; keyword: string; count: number }[];
  }>;

  // Analytics - Sentiment Reports
  getSentimentReports(startDate: string, endDate: string, sourceIds?: number[], clientId?: number): Promise<{
    overall: { positive: number; negative: number; neutral: number };
    bySource: { sourceId: number; sourceName: string; positive: number; negative: number; neutral: number }[];
    timeline: { date: string; positive: number; negative: number; neutral: number }[];
    byCategory: { category: string; positive: number; negative: number; neutral: number }[];
    confidence: { totalCount: number; analyzedCount: number; failedCount: number; pendingRetryCount: number };
  }>;

  // Analytics - Source Behavior
  getSourceBehavior(startDate: string, endDate: string, sourceIds?: number[], clientId?: number): Promise<{
    sources: {
      sourceId: number;
      sourceName: string;
      sourceType: string;
      articleCount: number;
      avgArticlesPerDay: number;
      dominantSentiment: string;
      uniqueKeywords: number;
    }[];
    publishers: {
      publisherName: string;
      collectorSourceName: string;
      collectorSourceType: string;
      articleCount: number;
      avgArticlesPerDay: number;
    }[];
    diversity: { sourceType: string; count: number }[];
  }>;

  getNarrativeComparison(topic: string, startDate: string, endDate: string, sourceIds?: number[], clientId?: number): Promise<{
    topic: string;
    sources: { sourceId: number; sourceName: string; positive: number; negative: number; neutral: number; total: number }[];
    hasContrast: boolean;
  }>;

  getAnalyticsDailyBrief(date: string, sourceIds?: number[], clientId?: number): Promise<{
    date: string;
    topStories: { title: string; url: string; sourceName: string; sentiment: string }[];
    biggestTopic: string;
    sentimentShift: { previous: { positive: number; negative: number; neutral: number }; current: { positive: number; negative: number; neutral: number } };
    sourceSpike: { sourceName: string; count: number; avgCount: number } | null;
  }>;

  getKeywordDetail(keyword: string, startDate: string, endDate: string, sourceIds?: number[], clientId?: number): Promise<{
    keyword: string;
    frequency: { date: string; count: number }[];
    topSources: { sourceName: string; count: number }[];
    sentiment: { positive: number; negative: number; neutral: number };
    headlines: { title: string; url: string; sourceName: string; publishedAt: string; sentiment: string }[];
  }>;

  // Clients
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, updates: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<void>;

  // Client Keywords
  getClientKeywords(clientId: number): Promise<ClientKeyword[]>;
  addClientKeyword(keyword: InsertClientKeyword): Promise<ClientKeyword>;
  removeClientKeyword(id: number): Promise<void>;

  // System Settings
  getSystemSettings(): Promise<Record<string, string>>;
  updateSystemSetting(key: string, value: string): Promise<SystemSetting>;

  // Admin Audit Logs
  createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAuditLogs(params?: { limit?: number; offset?: number }): Promise<{ items: (AdminAuditLog & { username: string })[], total: number }>;

  // Soft-delete sources
  softDeleteSource(id: number, clientId?: number): Promise<void>;
  restoreSource(id: number, clientId?: number): Promise<void>;
  getActiveSources(): Promise<Source[]>;

  // User management extensions
  updateUser(id: number, updates: Partial<{ role: string; userScope: string; clientId: number | null; disabled: boolean; password: string }>): Promise<User | undefined>;

  // System health (enhanced)
  getSystemHealth(): Promise<{
    lastWorkerRun: Date | null;
    avgProcessingTime: number;
    failedSourcesCount: number;
    totalArticles: number;
    totalSources: number;
    totalUsers: number;
    queueStats?: { pending: number; running: number; completed: number; failed: number };
    recentErrors?: number;
    storageEstimate?: { articlesSize: number; logsSize: number };
  }>;

  // System Errors
  getSystemErrors(params?: { severity?: string; component?: string; limit?: number; offset?: number }): Promise<{ items: any[]; total: number }>;

  // API Keys
  getApiKeys(): Promise<any[]>;
  getApiKeyByHash(keyHash: string): Promise<any | undefined>;
  createApiKey(data: any): Promise<any>;
  updateApiKeyLastUsed(id: number): Promise<void>;
  deactivateApiKey(id: number): Promise<void>;

  // Feature Flags
  getFeatureFlags(): Promise<FeatureFlag[]>;
  getFeatureFlag(key: string): Promise<FeatureFlag | undefined>;
  upsertFeatureFlag(key: string, enabled: boolean, description?: string): Promise<FeatureFlag>;
  deleteFeatureFlag(id: number): Promise<void>;

  // Usage Metrics
  trackUsage(event: string, userId?: number, metadata?: any): Promise<void>;
  getUsageMetrics(params?: { event?: string; startDate?: string; endDate?: string; limit?: number }): Promise<{ event: string; count: number; lastOccurred: Date | null }[]>;
  getUsageSummary(days?: number): Promise<{ dailyActiveUsers: number; totalEvents: number; topEvents: { event: string; count: number }[]; topEndpoints: { event: string; count: number }[] }>;

  getArticleAiAnalysis(articleId: number, clientId?: number): Promise<ArticleAiAnalysis | undefined>;
  upsertArticleAiAnalysis(data: InsertArticleAiAnalysis): Promise<ArticleAiAnalysis>;
  getUnanalyzedArticleIds(limit?: number, clientId?: number): Promise<number[]>;

  getStoryClusters(params?: { limit?: number; offset?: number; clientId?: number }): Promise<StoryCluster[]>;
  getStoryCluster(id: number, clientId?: number): Promise<StoryCluster | undefined>;
  createStoryCluster(data: InsertStoryCluster): Promise<StoryCluster>;
  updateStoryCluster(id: number, data: Partial<InsertStoryCluster>): Promise<StoryCluster>;
  getClusterArticles(clusterId: number, clientId?: number): Promise<(Article & { sourceName?: string | null })[]>;

  getDailyBriefs(limit?: number, clientId?: number): Promise<DailyBrief[]>;
  getDailyBrief(date: string, clientId?: number): Promise<DailyBrief | undefined>;
  upsertDailyBrief(data: InsertDailyBrief): Promise<DailyBrief>;

  getDetectedEvents(params?: { type?: string; severity?: string; limit?: number; acknowledged?: boolean; clientId?: number }): Promise<DetectedEvent[]>;
  createDetectedEvent(data: InsertDetectedEvent): Promise<DetectedEvent>;
  acknowledgeEvent(id: number, clientId?: number): Promise<void>;

  getEntityMentions(entityName: string, params?: { limit?: number; startDate?: string; endDate?: string; clientId?: number }): Promise<EntityMention[]>;
  createEntityMention(data: InsertEntityMention): Promise<EntityMention>;
  createEntityMentionsBatch(data: InsertEntityMention[]): Promise<void>;
  getTopEntities(params?: { limit?: number; days?: number; entityType?: string; clientId?: number }): Promise<{ entityName: string; entityType: string; mentionCount: number; avgSentiment: number }[]>;
  getEntityTimeline(entityName: string, days?: number, clientId?: number): Promise<{ date: string; mentionCount: number; avgSentiment: number }[]>;

  getTrendPredictions(params?: { topic?: string; limit?: number; clientId?: number }): Promise<TrendPrediction[]>;
  createTrendPrediction(data: InsertTrendPrediction): Promise<TrendPrediction>;

  getSubscription(clientId: number): Promise<Subscription | undefined>;
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  updateSubscription(clientId: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  getActiveUserCount(clientId: number): Promise<number>;
  getUsersByClientId(clientId: number): Promise<User[]>;

  getOnboardingState(clientId: number): Promise<OnboardingState | undefined>;
  upsertOnboardingState(data: InsertOnboardingState): Promise<OnboardingState>;

  getNotificationSettings(userId: number): Promise<NotificationSetting[]>;
  upsertNotificationSetting(data: InsertNotificationSetting): Promise<NotificationSetting>;
  deleteNotificationSetting(id: number, userId?: number): Promise<void>;

  getWhiteLabelSettings(clientId: number): Promise<WhiteLabelSetting | undefined>;
  upsertWhiteLabelSettings(data: InsertWhiteLabelSetting): Promise<WhiteLabelSetting>;

  getSupportTickets(params?: { userId?: number; clientId?: number; status?: string }): Promise<SupportTicket[]>;
  createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket>;
  updateSupportTicketStatus(id: number, status: string): Promise<void>;

  getUserFeedback(params?: { userId?: number; feature?: string; targetId?: number }): Promise<UserFeedback[]>;
  createUserFeedback(data: InsertUserFeedback): Promise<UserFeedback>;

  getInsightEngagement(params?: { userId?: number; insightType?: string; insightId?: number }): Promise<InsightEngagement[]>;
  upsertInsightEngagement(data: InsertInsightEngagement): Promise<InsightEngagement>;

  getAiCorrections(params?: { articleId?: number; userId?: number; status?: string }): Promise<AiCorrection[]>;
  createAiCorrection(data: InsertAiCorrection): Promise<AiCorrection>;
  updateAiCorrectionStatus(id: number, status: string): Promise<void>;

  getAlertPreferences(clientId: number): Promise<AlertPreference[]>;
  upsertAlertPreference(data: InsertAlertPreference): Promise<AlertPreference>;

  getDashboardPreferences(userId: number): Promise<DashboardPreference | undefined>;
  upsertDashboardPreferences(data: InsertDashboardPreference): Promise<DashboardPreference>;

  getExperiments(params?: { status?: string }): Promise<Experiment[]>;
  createExperiment(data: InsertExperiment): Promise<Experiment>;
  updateExperiment(id: number, data: Partial<InsertExperiment>): Promise<Experiment | undefined>;
  getExperimentAssignment(userId: number, experimentId: number): Promise<ExperimentAssignment | undefined>;
  getUserExperiments(userId: number): Promise<ExperimentAssignment[]>;
  createExperimentAssignment(data: InsertExperimentAssignment): Promise<ExperimentAssignment>;

  getKnowledgeEntries(params?: { search?: string; limit?: number }, clientId?: number): Promise<KnowledgeEntry[]>;
  upsertKnowledgeEntry(data: InsertKnowledgeEntry): Promise<KnowledgeEntry>;

  getValueReports(clientId: number): Promise<ValueReport[]>;
  createValueReport(data: InsertValueReport): Promise<ValueReport>;

  getWebhooks(clientId?: number): Promise<IntegrationWebhook[]>;
  getWebhook(id: number, clientId?: number): Promise<IntegrationWebhook | undefined>;
  createWebhook(data: InsertIntegrationWebhook): Promise<IntegrationWebhook>;
  updateWebhook(id: number, data: Partial<InsertIntegrationWebhook>, clientId?: number): Promise<IntegrationWebhook | undefined>;
  deleteWebhook(id: number, clientId?: number): Promise<void>;
  getWebhooksByEvent(eventType: string): Promise<IntegrationWebhook[]>;

  getWebhookDeliveries(webhookId?: number, params?: { limit?: number }): Promise<WebhookDelivery[]>;
  createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery>;
  updateWebhookDelivery(id: number, data: Partial<InsertWebhookDelivery>): Promise<void>;

  getEmailSubscriptions(userId?: number): Promise<EmailSubscription[]>;
  createEmailSubscription(data: InsertEmailSubscription): Promise<EmailSubscription>;
  updateEmailSubscription(id: number, data: Partial<InsertEmailSubscription>, userId?: number): Promise<EmailSubscription | undefined>;
  deleteEmailSubscription(id: number, userId?: number): Promise<void>;

  getIntegrationConfigs(clientId?: number): Promise<IntegrationConfig[]>;
  createIntegrationConfig(data: InsertIntegrationConfig): Promise<IntegrationConfig>;
  updateIntegrationConfig(id: number, data: Partial<InsertIntegrationConfig>, clientId?: number): Promise<IntegrationConfig | undefined>;
  deleteIntegrationConfig(id: number, clientId?: number): Promise<void>;

  getEmbedTokens(clientId?: number): Promise<EmbedToken[]>;
  getEmbedTokenByToken(token: string): Promise<EmbedToken | undefined>;
  createEmbedToken(data: InsertEmbedToken): Promise<EmbedToken>;
  updateEmbedToken(id: number, data: Partial<InsertEmbedToken>): Promise<EmbedToken | undefined>;
  deleteEmbedToken(id: number, clientId?: number): Promise<void>;

  getExportJobs(userId?: number): Promise<ExportJob[]>;
  createExportJob(data: InsertExportJob): Promise<ExportJob>;
  updateExportJob(id: number, data: Partial<ExportJob>): Promise<void>;

  getSsoConfigs(clientId?: number): Promise<SsoConfig[]>;
  createSsoConfig(data: InsertSsoConfig): Promise<SsoConfig>;
  updateSsoConfig(id: number, data: Partial<InsertSsoConfig>, clientId?: number): Promise<SsoConfig | undefined>;
  deleteSsoConfig(id: number, clientId?: number): Promise<void>;

  getImportConnectors(clientId?: number): Promise<ImportConnector[]>;
  createImportConnector(data: InsertImportConnector): Promise<ImportConnector>;
  updateImportConnector(id: number, data: Partial<InsertImportConnector>, clientId?: number): Promise<ImportConnector | undefined>;
  deleteImportConnector(id: number, clientId?: number): Promise<void>;

  getMobileNotificationPrefs(userId: number): Promise<MobileNotificationPref | undefined>;
  upsertMobileNotificationPrefs(data: InsertMobileNotificationPref): Promise<MobileNotificationPref>;

  // Workspaces
  getWorkspaces(clientId?: number): Promise<Workspace[]>;
  getWorkspace(id: number): Promise<Workspace | undefined>;
  createWorkspace(data: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: number, data: Partial<InsertWorkspace>): Promise<Workspace | undefined>;
  deleteWorkspace(id: number, clientId?: number): Promise<void>;
  getWorkspaceMembers(workspaceId: number): Promise<WorkspaceMember[]>;
  addWorkspaceMember(data: InsertWorkspaceMember): Promise<WorkspaceMember>;
  removeWorkspaceMember(workspaceId: number, userId: number): Promise<void>;

  // Comments / Discussions
  getComments(targetType: string, targetId: number, clientId?: number): Promise<Comment[]>;
  getComment(id: number): Promise<Comment | undefined>;
  createComment(data: InsertComment): Promise<Comment>;
  deleteComment(id: number, userId?: number): Promise<void>;

  // Annotations
  getAnnotations(targetType: string, targetId: number, clientId?: number): Promise<Annotation[]>;
  createAnnotation(data: InsertAnnotation): Promise<Annotation>;
  deleteAnnotation(id: number, userId?: number): Promise<void>;

  // Shared Reports / Briefings
  getSharedReports(params?: { clientId?: number; workspaceId?: number; createdBy?: number }): Promise<SharedReport[]>;
  getSharedReport(id: number): Promise<SharedReport | undefined>;
  getSharedReportByToken(token: string): Promise<SharedReport | undefined>;
  createSharedReport(data: InsertSharedReport): Promise<SharedReport>;
  updateSharedReport(id: number, data: Partial<InsertSharedReport>, clientId?: number): Promise<SharedReport | undefined>;
  deleteSharedReport(id: number, clientId?: number): Promise<void>;
  getBriefingItems(reportId: number): Promise<BriefingItem[]>;
  createBriefingItem(data: InsertBriefingItem): Promise<BriefingItem>;
  deleteBriefingItem(id: number, clientId?: number): Promise<void>;

  // Custom Tags
  getCustomTags(params?: { clientId?: number; workspaceId?: number }): Promise<CustomTag[]>;
  createCustomTag(data: InsertCustomTag): Promise<CustomTag>;
  deleteCustomTag(id: number, clientId?: number): Promise<void>;
  getTagAssignments(targetType: string, targetId: number): Promise<TagAssignment[]>;
  createTagAssignment(data: InsertTagAssignment): Promise<TagAssignment>;
  deleteTagAssignment(id: number, userId?: number): Promise<void>;

  // Tasks
  getTasks(params?: { workspaceId?: number; assignedTo?: number; createdBy?: number; status?: string }, clientId?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;

  // Watchlists
  getWatchlists(userId: number): Promise<Watchlist[]>;
  createWatchlist(data: InsertWatchlist): Promise<Watchlist>;
  deleteWatchlist(id: number, userId?: number): Promise<void>;

  // Internal Alerts
  getInternalAlerts(receiverId: number): Promise<InternalAlert[]>;
  createInternalAlert(data: InsertInternalAlert): Promise<InternalAlert>;
  markAlertRead(id: number, userId?: number): Promise<void>;

  // Change History
  getChangeHistory(entityType: string, entityId: number, clientId?: number): Promise<ChangeHistoryEntry[]>;
  createChangeHistory(data: InsertChangeHistory): Promise<ChangeHistoryEntry>;

  // Activity Feed
  getActivityFeed(params?: { workspaceId?: number; limit?: number }, clientId?: number): Promise<ActivityEvent[]>;
  createActivityEvent(data: InsertActivityEvent): Promise<ActivityEvent>;

  // Knowledge Memory - Story Timelines
  getStoryTimelines(clientId?: number): Promise<StoryTimeline[]>;
  getStoryTimeline(id: number, clientId?: number): Promise<StoryTimeline | undefined>;
  createStoryTimeline(data: InsertStoryTimeline): Promise<StoryTimeline>;
  updateStoryTimeline(id: number, data: Partial<InsertStoryTimeline>, clientId?: number): Promise<StoryTimeline | undefined>;
  deleteStoryTimeline(id: number, clientId?: number): Promise<void>;

  // Knowledge Memory - Timeline Events
  getTimelineEvents(timelineId: number): Promise<TimelineEvent[]>;
  createTimelineEvent(data: InsertTimelineEvent): Promise<TimelineEvent>;
  getTimelineEvent(id: number): Promise<TimelineEvent | undefined>;
  deleteTimelineEvent(id: number): Promise<void>;

  // Knowledge Memory - Recurring Patterns
  getRecurringPatterns(clientId?: number): Promise<RecurringPattern[]>;
  createRecurringPattern(data: InsertRecurringPattern): Promise<RecurringPattern>;
  updateRecurringPattern(id: number, data: Partial<InsertRecurringPattern>, clientId?: number): Promise<RecurringPattern | undefined>;
  deleteRecurringPattern(id: number, clientId?: number): Promise<void>;

  // Knowledge Memory - Entity Memory
  getEntityMemories(clientId?: number): Promise<EntityMemory[]>;
  getEntityMemoryByName(name: string, clientId?: number): Promise<EntityMemory | undefined>;
  createEntityMemory(data: InsertEntityMemory): Promise<EntityMemory>;
  updateEntityMemory(id: number, data: Partial<InsertEntityMemory>, clientId?: number): Promise<EntityMemory | undefined>;
  deleteEntityMemory(id: number, clientId?: number): Promise<void>;

  // Knowledge Memory - Narrative Shifts
  getNarrativeShifts(params?: { topic?: string; clientId?: number }): Promise<NarrativeShift[]>;
  createNarrativeShift(data: InsertNarrativeShift): Promise<NarrativeShift>;
  deleteNarrativeShift(id: number, clientId?: number): Promise<void>;

  // Knowledge Memory - Institutional Notes
  getInstitutionalNotes(clientId?: number, topic?: string): Promise<InstitutionalNote[]>;
  createInstitutionalNote(data: InsertInstitutionalNote): Promise<InstitutionalNote>;
  deleteInstitutionalNote(id: number, clientId?: number): Promise<void>;

  // Knowledge Memory - Historical Matches
  getHistoricalMatches(clientId?: number): Promise<HistoricalMatch[]>;
  createHistoricalMatch(data: InsertHistoricalMatch): Promise<HistoricalMatch>;
  acknowledgeHistoricalMatch(id: number, clientId?: number): Promise<void>;

  // Knowledge Memory - Trend Lifecycles
  getTrendLifecycles(clientId?: number): Promise<TrendLifecycle[]>;
  createTrendLifecycle(data: InsertTrendLifecycle): Promise<TrendLifecycle>;
  updateTrendLifecycle(id: number, data: Partial<InsertTrendLifecycle>, clientId?: number): Promise<TrendLifecycle | undefined>;
  deleteTrendLifecycle(id: number, clientId?: number): Promise<void>;

  // Knowledge Memory - Long-Range Briefings
  getLongRangeBriefings(clientId?: number, periodType?: string): Promise<LongRangeBriefing[]>;
  createLongRangeBriefing(data: InsertLongRangeBriefing): Promise<LongRangeBriefing>;
  deleteLongRangeBriefing(id: number, clientId?: number): Promise<void>;

  // Knowledge Memory - AI Memory Answers
  getAiMemoryAnswers(clientId?: number, limit?: number): Promise<AiMemoryAnswer[]>;
  createAiMemoryAnswer(data: InsertAiMemoryAnswer): Promise<AiMemoryAnswer>;

  // Predictive Intelligence - Topic Forecasts
  getTopicForecasts(clientId?: number): Promise<TopicForecast[]>;
  createTopicForecast(data: InsertTopicForecast): Promise<TopicForecast>;
  deleteTopicForecast(id: number): Promise<void>;

  // Predictive Intelligence - Early Signals
  getEarlySignals(clientId?: number): Promise<EarlySignal[]>;
  createEarlySignal(data: InsertEarlySignal): Promise<EarlySignal>;
  deleteEarlySignal(id: number): Promise<void>;

  // Predictive Intelligence - Risk Scores
  getRiskScores(clientId?: number): Promise<RiskScore[]>;
  createRiskScore(data: InsertRiskScore): Promise<RiskScore>;
  updateRiskScore(id: number, data: Partial<InsertRiskScore>): Promise<RiskScore>;
  deleteRiskScore(id: number): Promise<void>;

  // Predictive Intelligence - Influence Graph
  getInfluenceGraph(clientId?: number): Promise<InfluenceGraphEntry[]>;
  createInfluenceGraphEntry(data: InsertInfluenceGraphEntry): Promise<InfluenceGraphEntry>;
  deleteInfluenceGraphEntry(id: number): Promise<void>;

  // Predictive Intelligence - Attention Decay
  getAttentionDecay(clientId?: number): Promise<AttentionDecayEntry[]>;
  createAttentionDecay(data: InsertAttentionDecayEntry): Promise<AttentionDecayEntry>;
  deleteAttentionDecay(id: number): Promise<void>;

  // Predictive Intelligence - Alert Priority Scores
  getAlertPriorityScores(clientId?: number): Promise<AlertPriorityScore[]>;
  createAlertPriorityScore(data: InsertAlertPriorityScore): Promise<AlertPriorityScore>;

  // Predictive Intelligence - Forecast Results
  getForecastResults(clientId?: number): Promise<ForecastResult[]>;
  createForecastResult(data: InsertForecastResult): Promise<ForecastResult>;

  // Predictive Intelligence - Future Briefings
  getFutureBriefings(clientId?: number, limit?: number): Promise<FutureBriefing[]>;
  createFutureBriefing(data: InsertFutureBriefing): Promise<FutureBriefing>;
  deleteFutureBriefing(id: number): Promise<void>;

  // Article Translations
  getArticleTranslation(articleId: number, targetLanguage: string, clientId?: number): Promise<ArticleTranslation | undefined>;
  createArticleTranslation(data: InsertArticleTranslation): Promise<ArticleTranslation>;
  updateArticleTranslation(id: number, data: Partial<InsertArticleTranslation>, clientId?: number): Promise<ArticleTranslation | undefined>;

  // === ENTERPRISE ACCESS CONTROL ===
  // Permission Groups
  getPermissionGroups(): Promise<PermissionGroup[]>;
  getPermissionGroup(id: number): Promise<PermissionGroup | undefined>;
  getPermissionGroupByName(name: string): Promise<PermissionGroup | undefined>;
  createPermissionGroup(data: InsertPermissionGroup): Promise<PermissionGroup>;
  deletePermissionGroup(id: number): Promise<void>;

  // Permissions
  getPermissions(): Promise<Permission[]>;
  getPermissionByCode(code: string): Promise<Permission | undefined>;
  createPermission(data: InsertPermission): Promise<Permission>;

  // Group-Permission Mapping
  getGroupPermissions(groupId: number): Promise<Permission[]>;
  addPermissionToGroup(groupId: number, permissionId: number): Promise<GroupPermission>;
  removePermissionFromGroup(groupId: number, permissionId: number): Promise<void>;

  // User-Permission Group Mapping
  getUserPermissionGroups(userId: number): Promise<(UserPermissionGroup & { groupName: string })[]>;
  assignUserToGroup(userId: number, groupId: number): Promise<UserPermissionGroup>;
  removeUserFromGroup(userId: number, groupId: number): Promise<void>;

  // User Direct Permissions
  getUserDirectPermissions(userId: number): Promise<(UserPermission & { code: string })[]>;
  assignDirectPermission(userId: number, permissionId: number, granted: boolean): Promise<UserPermission>;
  removeDirectPermission(userId: number, permissionId: number): Promise<void>;

  // Resolved Permissions (groups + direct)
  getEffectivePermissions(userId: number): Promise<string[]>;

  // Impersonation Logs
  createImpersonationLog(data: InsertImpersonationLog): Promise<ImpersonationLog>;
  getImpersonationLogs(params?: { adminUserId?: number; limit?: number }): Promise<ImpersonationLog[]>;

  // Insight Jobs (AI Cost Control)
  createInsightJob(data: InsertInsightJob): Promise<InsightJob>;
  getInsightJob(id: number): Promise<InsightJob | undefined>;
  updateInsightJobStatus(id: number, status: string, extra?: Partial<InsightJob>): Promise<InsightJob | undefined>;
  updateInsightJobIfStatus(id: number, fromStatus: string, toStatus: string, extra?: Partial<InsightJob>): Promise<InsightJob | undefined>;
  getQueuedJobsByTenant(clientId: number, limit: number): Promise<InsightJob[]>;
  getScheduledJobs(limit: number): Promise<InsightJob[]>;
  bulkUpdateJobStatus(fromStatus: string, toStatus: string, clientId?: number): Promise<number>;
  expireOldQueuedJobs(maxAgeMs: number): Promise<number>;
  recoverZombieRunningJobs(): Promise<number>;
  getJobCountsByStatus(): Promise<Record<string, number>>;
  createAiUsageLog(data: InsertAiUsageLog): Promise<AiUsageLog>;
  getDailyAiUsage(clientId: number): Promise<{ totalTokens: number; jobCount: number }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Sources
  async getSources(clientId?: number): Promise<Source[]> {
    if (clientId) {
      return await db.select().from(sources).where(eq(sources.clientId, clientId));
    }
    return await db.select().from(sources);
  }

  async getSource(id: number, clientId?: number): Promise<Source | undefined> {
    const conditions = [eq(sources.id, id)];
    if (clientId) conditions.push(eq(sources.clientId, clientId));
    const [source] = await db.select().from(sources).where(and(...conditions));
    return source;
  }

  async getSourceByFeedToken(feedToken: string): Promise<Source | undefined> {
    const [source] = await db.select().from(sources).where(eq(sources.feedToken, feedToken));
    return source;
  }

  async createSource(insertSource: InsertSource): Promise<Source> {
    const [source] = await db.insert(sources).values(insertSource).returning();
    return source;
  }

  async updateSource(id: number, updates: Partial<InsertSource>, clientId?: number): Promise<Source | undefined> {
    const conditions = [eq(sources.id, id)];
    if (clientId) conditions.push(eq(sources.clientId, clientId));
    const [source] = await db.update(sources).set(updates).where(and(...conditions)).returning();
    return source;
  }

  async cleanupArticleDependents(articleIds: number[]): Promise<void> {
    if (articleIds.length === 0) return;
    await db.delete(comments).where(and(eq(comments.targetType, "article"), inArray(comments.targetId, articleIds)));
    await db.delete(annotations).where(and(eq(annotations.targetType, "article"), inArray(annotations.targetId, articleIds)));
    await db.delete(tagAssignments).where(and(eq(tagAssignments.targetType, "article"), inArray(tagAssignments.targetId, articleIds)));
    await db.delete(timelineEvents).where(inArray(timelineEvents.articleId, articleIds));
    await db.delete(bookmarks).where(inArray(bookmarks.articleId, articleIds));
  }

  async clearSourceArticles(id: number, clientId?: number): Promise<number> {
    const articleConditions = [eq(articles.sourceId, id)];
    if (clientId) articleConditions.push(eq(articles.clientId, clientId));
    const sourceArticles = await db.select({ id: articles.id }).from(articles).where(and(...articleConditions));
    const articleIds = sourceArticles.map(a => a.id);
    if (articleIds.length === 0) return 0;

    const clusterRows = await db
      .select({ clusterId: articleAiAnalysis.clusterId })
      .from(articleAiAnalysis)
      .where(and(inArray(articleAiAnalysis.articleId, articleIds), isNotNull(articleAiAnalysis.clusterId)));
    const clusterIds = Array.from(new Set(clusterRows.map(row => row.clusterId).filter((id): id is number => typeof id === "number")));

    await this.cleanupArticleDependents(articleIds);
    await db.delete(articles).where(inArray(articles.id, articleIds));

    if (clusterIds.length > 0) {
      const clusterConditions = [
        inArray(storyClusters.id, clusterIds),
        sql`NOT EXISTS (SELECT 1 FROM ${articleAiAnalysis} ai WHERE ai.cluster_id = ${storyClusters.id})`,
      ];
      if (clientId) clusterConditions.push(eq(storyClusters.clientId, clientId));
      await db.delete(storyClusters).where(and(...clusterConditions));
    }

    return articleIds.length;
  }

  async deleteSource(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(sources.id, id)];
    if (clientId) conditions.push(eq(sources.clientId, clientId));
    const [source] = await db.select().from(sources).where(and(...conditions));
    if (!source) return;
    await this.clearSourceArticles(id, source.clientId);
    await db.delete(sources).where(eq(sources.id, id));
  }

  async updateSourceLastFetched(id: number): Promise<void> {
    await db.update(sources).set({ lastFetchedAt: new Date() }).where(eq(sources.id, id));
  }

  // Articles
  async getArticles(params?: ArticleQueryParams): Promise<{ items: (Article & { source: Source | null })[], total: number }> {
    const conditions = [];
    let needsSourceJoin = false;

    if (params?.clientId) {
      conditions.push(eq(articles.clientId, params.clientId));
    }
    if (params?.search) {
      conditions.push(sql`(${articles.title} ILIKE ${`%${params.search}%`} OR ${articles.content} ILIKE ${`%${params.search}%`})`);
    }
    if (params?.sourceIds !== undefined) {
      if (params.sourceIds.length === 0) {
        return { items: [], total: 0 };
      }
      conditions.push(inArray(articles.sourceId, params.sourceIds));
    }
    if (params?.sourceId) {
      conditions.push(eq(articles.sourceId, params.sourceId));
    }
    if (params?.sentiment) {
      conditions.push(eq(articles.sentimentLabel, params.sentiment));
    }
    if (params?.category) {
      conditions.push(eq(articles.category, params.category));
    }
    if (params?.country) {
      conditions.push(eq(articles.country, params.country));
    }
    if (params?.topic) {
      conditions.push(sql`${params.topic} = ANY(${articles.topics})`);
    }
    if (params?.sourceType) {
      conditions.push(eq(sources.type, params.sourceType));
      needsSourceJoin = true;
    }
    if (params?.startDate) {
      conditions.push(gte(articles.publishedAt, new Date(params.startDate)));
    }
    if (params?.endDate) {
      conditions.push(lte(articles.publishedAt, new Date(params.endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = params?.limit || 20;
    const offset = ((params?.page || 1) - 1) * limit;
    const sort = params?.sort || "newest";
    const publishedSort = sql`COALESCE(${articles.publishedAt}, ${articles.ingestedAt}, ${articles.createdAt})`;
    const sourceNameSort = sql`LOWER(COALESCE(NULLIF(${articles.subSource}, ''), ${sources.name}, 'Unknown'))`;
    const engagementSort = sql`COALESCE(${articles.engagementLikes}, 0) + COALESCE(${articles.engagementComments}, 0) + COALESCE(${articles.engagementShares}, 0)`;
    const orderBy =
      sort === "oldest" ? [asc(publishedSort), asc(articles.id)] :
      sort === "recently_added" ? [desc(articles.ingestedAt), desc(articles.id)] :
      sort === "source_az" ? [asc(sourceNameSort), desc(publishedSort), desc(articles.id)] :
      sort === "title_az" ? [asc(sql`LOWER(${articles.title})`), desc(publishedSort), desc(articles.id)] :
      sort === "engagement" ? [desc(engagementSort), desc(publishedSort), desc(articles.id)] :
      [desc(publishedSort), desc(articles.id)];

    const countQuery = db.select({ count: sql<number>`count(*)` }).from(articles);
    if (needsSourceJoin) {
      countQuery.leftJoin(sources, eq(articles.sourceId, sources.id));
    }
    const [countResult] = await countQuery.where(whereClause);
    const total = Number(countResult?.count || 0);

    const items = await db.select({
      id: articles.id,
      title: articles.title,
      content: articles.content,
      contentClean: articles.contentClean,
      summary: articles.summary,
      url: articles.url,
      sourceId: articles.sourceId,
      publishedAt: articles.publishedAt,
      ingestedAt: articles.ingestedAt,
      language: articles.language,
      country: articles.country,
      sentimentScore: articles.sentimentScore,
      sentimentLabel: articles.sentimentLabel,
      keywords: articles.keywords,
      topics: articles.topics,
      category: articles.category,
      imageUrl: articles.imageUrl,
      subSource: articles.subSource,
      engagementLikes: articles.engagementLikes,
      engagementComments: articles.engagementComments,
      engagementShares: articles.engagementShares,
      clientId: articles.clientId,
      createdAt: articles.createdAt,
      source: sources
    })
    .from(articles)
    .leftJoin(sources, eq(articles.sourceId, sources.id))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

    return { items, total };
  }

  async getArticle(id: number, clientId?: number): Promise<Article | undefined> {
    const conditions = [eq(articles.id, id)];
    if (clientId) conditions.push(eq(articles.clientId, clientId));
    const [article] = await db.select().from(articles).where(and(...conditions));
    return article;
  }

  async getArticlesByIds(ids: number[], clientId?: number): Promise<(Article & { source: Source | null })[]> {
    if (ids.length === 0) return [];
    const conditions = [inArray(articles.id, ids)];
    if (clientId) conditions.push(eq(articles.clientId, clientId));
    const items = await db.select({
      id: articles.id,
      title: articles.title,
      content: articles.content,
      contentClean: articles.contentClean,
      summary: articles.summary,
      url: articles.url,
      sourceId: articles.sourceId,
      publishedAt: articles.publishedAt,
      ingestedAt: articles.ingestedAt,
      language: articles.language,
      country: articles.country,
      sentimentScore: articles.sentimentScore,
      sentimentLabel: articles.sentimentLabel,
      keywords: articles.keywords,
      topics: articles.topics,
      category: articles.category,
      imageUrl: articles.imageUrl,
      subSource: articles.subSource,
      createdAt: articles.createdAt,
      source: sources,
    })
      .from(articles)
      .leftJoin(sources, eq(articles.sourceId, sources.id))
      .where(and(...conditions))
      .orderBy(desc(articles.publishedAt));
    return items as any;
  }

  async createArticle(insertArticle: InsertArticle): Promise<Article> {
    const [article] = await db.insert(articles).values(insertArticle).returning();
    return article;
  }

  async updateArticle(id: number, data: Partial<InsertArticle>): Promise<Article | undefined> {
    const [article] = await db.update(articles).set(data).where(eq(articles.id, id)).returning();
    return article;
  }

  async getArticleByUrl(url: string, clientId: number): Promise<Article | undefined> {
    const [article] = await db.select().from(articles).where(
      and(eq(articles.url, url), eq(articles.clientId, clientId)),
    );
    return article;
  }

  async getArticleByTitle(title: string, clientId?: number | null): Promise<Article | undefined> {
    const normalizedTitle = title.toLowerCase().trim();
    if (normalizedTitle.length < 10) return undefined;
    const conditions = [sql`lower(trim(${articles.title})) = ${normalizedTitle}`];
    if (clientId !== undefined && clientId !== null) {
      conditions.push(eq(articles.clientId, clientId));
    }
    const [article] = await db.select().from(articles).where(and(...conditions)).limit(1);
    return article;
  }

  // Keywords
  async getKeywords(clientId?: number): Promise<Keyword[]> {
    if (clientId) return await db.select().from(keywords).where(eq(keywords.clientId, clientId));
    return await db.select().from(keywords);
  }

  async createKeyword(insertKeyword: InsertKeyword): Promise<Keyword> {
    const [keyword] = await db.insert(keywords).values(insertKeyword).returning();
    return keyword;
  }

  async deleteKeyword(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(keywords.id, id)];
    if (clientId) conditions.push(eq(keywords.clientId, clientId));
    await db.delete(keywords).where(and(...conditions));
  }

  async getBookmarks(userId: number): Promise<number[]> {
    const rows = await db.select({ articleId: bookmarks.articleId })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));
    return rows.map(r => r.articleId);
  }

  async addBookmark(userId: number, articleId: number): Promise<Bookmark> {
    const [bookmark] = await db.insert(bookmarks)
      .values({ userId, articleId })
      .onConflictDoNothing()
      .returning();
    if (!bookmark) {
      const [existing] = await db.select().from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.articleId, articleId)));
      return existing;
    }
    return bookmark;
  }

  async removeBookmark(userId: number, articleId: number): Promise<void> {
    await db.delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.articleId, articleId)));
  }

  async createFetchLog(log: InsertSourceFetchLog): Promise<SourceFetchLog> {
    const [entry] = await db.insert(sourceFetchLogs).values(log).returning();
    return entry;
  }

  async getFetchLogs(sourceId: number, limit = 20): Promise<SourceFetchLog[]> {
    return await db.select().from(sourceFetchLogs)
      .where(eq(sourceFetchLogs.sourceId, sourceId))
      .orderBy(desc(sourceFetchLogs.fetchedAt))
      .limit(limit);
  }

  async getConsecutiveFailureCount(sourceId: number): Promise<number> {
    const recent = await db.select({ status: sourceFetchLogs.status })
      .from(sourceFetchLogs)
      .where(eq(sourceFetchLogs.sourceId, sourceId))
      .orderBy(desc(sourceFetchLogs.fetchedAt))
      .limit(AUTO_PAUSE_THRESHOLD_DB);
    let count = 0;
    for (const row of recent) {
      if (row.status === "error") count++;
      else break;
    }
    return count;
  }

  async getIngestionLogs(params?: { from?: string; to?: string; sourceIds?: number[]; limit?: number; offset?: number }): Promise<{ items: (SourceFetchLog & { sourceName: string })[], total: number }> {
    const conditions = [];
    if (params?.sourceIds !== undefined) {
      if (params.sourceIds.length === 0) return { items: [], total: 0 };
      conditions.push(inArray(sourceFetchLogs.sourceId, params.sourceIds));
    }
    if (params?.from) {
      conditions.push(gte(sourceFetchLogs.fetchedAt, new Date(params.from)));
    }
    if (params?.to) {
      conditions.push(lte(sourceFetchLogs.fetchedAt, new Date(params.to)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(sourceFetchLogs)
      .where(where);

    const rows = await db.select({
      id: sourceFetchLogs.id,
      sourceId: sourceFetchLogs.sourceId,
      status: sourceFetchLogs.status,
      articlesFound: sourceFetchLogs.articlesFound,
      errorMessage: sourceFetchLogs.errorMessage,
      retryCount: sourceFetchLogs.retryCount,
      durationMs: sourceFetchLogs.durationMs,
      pipelineStep: sourceFetchLogs.pipelineStep,
      fetchedAt: sourceFetchLogs.fetchedAt,
      sourceName: sources.name,
    })
      .from(sourceFetchLogs)
      .leftJoin(sources, eq(sourceFetchLogs.sourceId, sources.id))
      .where(where)
      .orderBy(desc(sourceFetchLogs.fetchedAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(r => ({ ...r, sourceName: r.sourceName || "Unknown" })),
      total: countResult?.count || 0,
    };
  }

  async getSourceHealth(sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return [];
    }
    const sourceIdFilter = sourceIds ? sql`AND s.id IN (${sqlNumberList(sourceIds)})` : sql``;
    const rows = await db.execute(sql`
      SELECT 
        s.id as "sourceId",
        s.name as "sourceName",
        s.last_fetched_at as "lastFetchedAt",
        COALESCE(
          (SELECT status FROM source_fetch_logs WHERE source_id = s.id ORDER BY fetched_at DESC LIMIT 1),
          'unknown'
        ) as "lastStatus",
        (SELECT error_message FROM source_fetch_logs WHERE source_id = s.id ORDER BY fetched_at DESC LIMIT 1) as "lastError",
        COALESCE(
          (SELECT COUNT(*)::int FROM source_fetch_logs WHERE source_id = s.id),
          0
        ) as "totalFetches",
        COALESCE(
          (SELECT (COUNT(*) FILTER (WHERE status = 'success')::float / NULLIF(COUNT(*)::float, 0) * 100)::int 
           FROM source_fetch_logs WHERE source_id = s.id),
          0
        ) as "successRate"
      FROM sources s
      WHERE 1=1 ${sourceIdFilter}
      ORDER BY s.name ASC
    `);
    return (rows.rows as any[]).map(r => ({
      sourceId: Number(r.sourceId),
      sourceName: String(r.sourceName),
      lastStatus: String(r.lastStatus),
      lastError: r.lastError ? String(r.lastError) : null,
      successRate: Number(r.successRate),
      totalFetches: Number(r.totalFetches),
      lastFetchedAt: r.lastFetchedAt ? new Date(r.lastFetchedAt) : null,
    }));
  }

  async getUsers(parentId?: number): Promise<User[]> {
    if (parentId !== undefined) {
      return await db.select().from(users).where(eq(users.parentId, parentId)).orderBy(desc(users.createdAt));
    }
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUserChildren(parentId: number): Promise<User[]> {
    return await db.select().from(users).where(eq(users.parentId, parentId)).orderBy(desc(users.createdAt));
  }

  async getUsersByParent(parentId: number | null): Promise<User[]> {
    if (parentId === null) {
      return await db.select().from(users).where(sql`${users.parentId} IS NULL`).orderBy(desc(users.createdAt));
    }
    return await db.select().from(users).where(eq(users.parentId, parentId)).orderBy(desc(users.createdAt));
  }

  async getSourcesByUserId(userId: number): Promise<Source[]> {
    return await db.select().from(sources).where(eq(sources.userId, userId));
  }

  async updateUserRole(id: number, role: string): Promise<User | undefined> {
    const [user] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUserType(id: number, userType: string): Promise<User | undefined> {
    const [user] = await db.update(users).set({ userType }).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    const children = await this.getUserChildren(id);
    for (const child of children) {
      await this.deleteUser(child.id);
    }
    const userSources = await this.getSourcesByUserId(id);
    for (const source of userSources) {
      const sourceArticles = await db.select({ id: articles.id }).from(articles).where(eq(articles.sourceId, source.id));
      await this.cleanupArticleDependents(sourceArticles.map(a => a.id));
      await db.delete(articles).where(eq(articles.sourceId, source.id));
      await db.delete(sources).where(eq(sources.id, source.id));
    }
    await db.delete(bookmarks).where(eq(bookmarks.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async deleteArticles(ids: number[], clientId?: number): Promise<number> {
    if (ids.length === 0) return 0;
    const conditions = [inArray(articles.id, ids)];
    if (clientId) conditions.push(eq(articles.clientId, clientId));
    const scopedArticles = await db.select({ id: articles.id }).from(articles).where(and(...conditions));
    const scopedIds = scopedArticles.map(a => a.id);
    if (scopedIds.length === 0) return 0;
    await this.cleanupArticleDependents(scopedIds);
    const result = await db.delete(articles).where(inArray(articles.id, scopedIds)).returning({ id: articles.id });
    return result.length;
  }

  async deleteAllArticles(clientId?: number): Promise<number> {
    const conditions: any[] = [];
    if (clientId) conditions.push(eq(articles.clientId, clientId));
    const allArticleIds = await db
      .select({ id: articles.id })
      .from(articles)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const ids = allArticleIds.map(a => a.id);
    if (ids.length === 0) return 0;
    const batchSize = 500;
    let totalDeleted = 0;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      await this.cleanupArticleDependents(batch);
      const result = await db.delete(articles).where(inArray(articles.id, batch)).returning({ id: articles.id });
      totalDeleted += result.length;
    }
    return totalDeleted;
  }

  async updateArticlesCategory(ids: number[], category: string, clientId?: number): Promise<number> {
    if (ids.length === 0) return 0;
    const conditions = [inArray(articles.id, ids)];
    if (clientId) conditions.push(eq(articles.clientId, clientId));
    const result = await db.update(articles).set({ category }).where(and(...conditions)).returning({ id: articles.id });
    return result.length;
  }

  // Analytics
  async getStats(sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return {
        totalArticles: 0,
        sourcesCount: 0,
        sentimentDistribution: [
          { name: 'positive', value: 0 },
          { name: 'neutral', value: 0 },
          { name: 'negative', value: 0 },
        ],
        trendingKeywords: [],
      };
    }
    const sourceFilter = sourceIds ? sql`AND source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const sourceIdFilter = sourceIds ? sql`AND sources.id IN (${sqlNumberList(sourceIds)})` : sql``;
    const joinedSourceIdFilter = sourceIds ? sql`AND s.id IN (${sqlNumberList(sourceIds)})` : sql``;

    const totalArticlesRows = await db.execute(sql`SELECT COUNT(*)::int as count FROM articles WHERE 1=1 ${sourceFilter}`);
    const totalArticles = Number((totalArticlesRows.rows[0] as any)?.count || 0);

    const sourcesCountRows = await db.execute(sql`SELECT COUNT(*)::int as count FROM sources WHERE 1=1 ${sourceIdFilter}`);
    const sourcesCount = Number((sourcesCountRows.rows[0] as any)?.count || 0);

    const aiFilter = sql`AND (ai_analysis_status = 'success' OR ai_analysis_status IS NULL)`;
    const sentimentRows = await db.execute(sql`
      SELECT 
        COALESCE(sentiment_label, 'neutral') as label,
        COUNT(*)::int as count
      FROM articles
      WHERE 1=1 ${sourceFilter} ${aiFilter}
      GROUP BY sentiment_label
    `);
    const sentimentDistribution = (sentimentRows.rows as any[]).map((r: any) => ({
      name: String(r.label).toLowerCase(),
      value: Number(r.count),
    }));
    if (sentimentDistribution.length === 0) {
      sentimentDistribution.push(
        { name: 'positive', value: 0 },
        { name: 'neutral', value: 0 },
        { name: 'negative', value: 0 },
      );
    }

    const keywordRows = await db.execute(sql`
      SELECT kw as keyword, COUNT(*)::int as count
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL ${sourceFilter} ${aiFilter}
      GROUP BY kw
      ORDER BY count DESC
      LIMIT 50
    `);
    const trendingKeywords = (keywordRows.rows as any[])
      .filter((r: any) => isAnalyticsSignalTerm(r.keyword))
      .slice(0, 10)
      .map((r: any) => ({
        text: String(r.keyword),
        value: Number(r.count),
      }));

    const topSourceRows = await db.execute(sql`
      SELECT COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as name, COUNT(a.id)::int as count
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE 1=1 ${joinedSourceIdFilter}
      GROUP BY COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown')
      ORDER BY count DESC
      LIMIT 5
    `);
    const topSources = (topSourceRows.rows as any[]).map((r: any) => ({
      name: String(r.name),
      count: Number(r.count),
    }));

    return {
      totalArticles,
      sourcesCount,
      sentimentDistribution,
      trendingKeywords,
      topSources,
    };
  }

  async getSentimentTrend(sourceIds?: number[]): Promise<{ date: string; positive: number; negative: number; neutral: number }[]> {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return [];
    }
    const sourceFilter = sourceIds ? sql`AND source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const aiFilter = sql`AND (ai_analysis_status = 'success' OR ai_analysis_status IS NULL)`;
    const rows = await db.execute(sql`
      SELECT 
        TO_CHAR(published_at, 'YYYY-MM-DD') as date,
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= NOW() - INTERVAL '30 days' ${sourceFilter} ${aiFilter}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);
    return (rows.rows as any[]).map((r: any) => ({
      date: String(r.date),
      positive: Number(r.positive),
      negative: Number(r.negative),
      neutral: Number(r.neutral),
    }));
  }

  private async getAnalyticsConfidence(start: Date, end: Date, sourceFilter: any, clientFilter: any) {
    const rows = await db.execute(sql`
      SELECT 
        COUNT(*)::int as "totalCount",
        COUNT(*) FILTER (WHERE ai_analysis_status = 'success' OR ai_analysis_status IS NULL)::int as "analyzedCount",
        COUNT(*) FILTER (WHERE ai_analysis_status = 'failed')::int as "failedCount",
        COUNT(*) FILTER (WHERE ai_analysis_status = 'pending_retry')::int as "pendingRetryCount"
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter}
    `);
    const r = rows.rows[0] as any;
    return {
      totalCount: Number(r?.totalCount || 0),
      analyzedCount: Number(r?.analyzedCount || 0),
      failedCount: Number(r?.failedCount || 0),
      pendingRetryCount: Number(r?.pendingRetryCount || 0),
    };
  }

  async getContentVolume(startDate: string, endDate: string, sourceIds?: number[], clientId?: number) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { timeline: [], bySource: [], byHour: [], peaks: [], confidence: { totalCount: 0, analyzedCount: 0, failedCount: 0, pendingRetryCount: 0 } };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const sourceFilterA = sourceIds ? sql`AND a.source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const clientFilter = clientId ? sql`AND client_id = ${clientId}` : sql``;
    const clientFilterA = clientId ? sql`AND a.client_id = ${clientId}` : sql``;

    const timelineRows = await db.execute(sql`
      SELECT TO_CHAR(published_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    const bySourceRows = await db.execute(sql`
      SELECT
        MIN(a.source_id)::int as "sourceId",
        COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as "sourceName",
        COUNT(*)::int as count
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA} ${clientFilterA}
      GROUP BY COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown')
      ORDER BY count DESC
      LIMIT 20
    `);

    const byHourRows = await db.execute(sql`
      SELECT EXTRACT(HOUR FROM published_at)::int as hour, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter}
      GROUP BY EXTRACT(HOUR FROM published_at)
      ORDER BY hour ASC
    `);

    const timeline = (timelineRows.rows as any[]).map(r => ({ date: String(r.date), count: Number(r.count) }));

    const avgCount = timeline.length > 0 ? timeline.reduce((s, t) => s + t.count, 0) / timeline.length : 0;
    const peaks = timeline.filter(t => t.count > avgCount * 1.5).sort((a, b) => b.count - a.count).slice(0, 5);

    const confidence = await this.getAnalyticsConfidence(start, end, sourceFilter, clientFilter);

    return {
      timeline,
      bySource: (bySourceRows.rows as any[]).map(r => ({
        sourceId: Number(r.sourceId),
        sourceName: String(r.sourceName || "Unknown"),
        count: Number(r.count),
      })),
      byHour: (byHourRows.rows as any[]).map(r => ({ hour: Number(r.hour), count: Number(r.count) })),
      peaks,
      confidence,
    };
  }

  async getTrendingTopics(startDate: string, endDate: string, sourceIds?: number[], clientId?: number) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { topics: [], topicTimeline: [], byCategory: [], method: "title-terms" };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const clientFilter = clientId ? sql`AND client_id = ${clientId}` : sql``;

    const termRows = await db.execute(sql`
      SELECT title, published_at as "publishedAt"
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter}
    `);
    const termStats = buildAnalyticsTermSnapshot(termRows.rows as unknown as AnalyticsTextRow[], 20, 8);

    const categoryRows = await db.execute(sql`
      SELECT COALESCE(category, 'general') as category, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter}
      GROUP BY category
      ORDER BY count DESC
    `);

    return {
      topics: termStats.top.map(({ term, count }) => ({ topic: term, count, sentiment: "neutral" })),
      topicTimeline: termStats.timeline.map(({ date, term, count }) => ({ date, topic: term, count })),
      byCategory: (categoryRows.rows as any[]).map(r => ({
        category: String(r.category),
        count: Number(r.count),
      })),
      method: "title-terms",
    };
  }

  async getKeywordAnalysis(startDate: string, endDate: string, sourceIds?: number[], clientId?: number) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { topKeywords: [], keywordTimeline: [] };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const clientFilter = clientId ? sql`AND client_id = ${clientId}` : sql``;

    const termRows = await db.execute(sql`
      SELECT title, published_at as "publishedAt"
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter}
    `);
    const termStats = buildAnalyticsTermSnapshot(termRows.rows as unknown as AnalyticsTextRow[], 25, 10);

    return {
      topKeywords: termStats.top.map(({ term, count }) => ({ keyword: term, count, avgSentiment: 0 })),
      keywordTimeline: termStats.timeline.map(({ date, term, count }) => ({ date, keyword: term, count })),
      method: "title-terms",
    };
  }

  async getSentimentReports(startDate: string, endDate: string, sourceIds?: number[], clientId?: number) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return {
        overall: { positive: 0, negative: 0, neutral: 0 },
        bySource: [],
        timeline: [],
        byCategory: [],
        confidence: { totalCount: 0, analyzedCount: 0, failedCount: 0, pendingRetryCount: 0 },
      };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const sourceFilterA = sourceIds ? sql`AND a.source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const clientFilter = clientId ? sql`AND client_id = ${clientId}` : sql``;
    const clientFilterA = clientId ? sql`AND a.client_id = ${clientId}` : sql``;
    const aiFilter = sql`AND (ai_analysis_status = 'success' OR ai_analysis_status IS NULL)`;
    const aiFilterA = sql`AND (a.ai_analysis_status = 'success' OR a.ai_analysis_status IS NULL)`;

    const overallRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter} ${aiFilter}
    `);
    const overall = overallRows.rows[0] as any;

    const bySourceRows = await db.execute(sql`
      SELECT
        MIN(a.source_id)::int as "sourceId",
        COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as "sourceName",
        COUNT(*) FILTER (WHERE a.sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'neutral' OR a.sentiment_label IS NULL)::int as neutral
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA} ${clientFilterA} ${aiFilterA}
      GROUP BY COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown')
      ORDER BY (COUNT(*) FILTER (WHERE a.sentiment_label = 'positive') + COUNT(*) FILTER (WHERE a.sentiment_label = 'negative') + COUNT(*) FILTER (WHERE a.sentiment_label = 'neutral' OR a.sentiment_label IS NULL)) DESC
      LIMIT 15
    `);

    const timelineRows = await db.execute(sql`
      SELECT TO_CHAR(published_at, 'YYYY-MM-DD') as date,
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter} ${aiFilter}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    const byCategoryRows = await db.execute(sql`
      SELECT COALESCE(category, 'general') as category,
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter} ${clientFilter} ${aiFilter}
      GROUP BY category
      ORDER BY (COUNT(*)) DESC
    `);

    return {
      overall: {
        positive: Number(overall?.positive || 0),
        negative: Number(overall?.negative || 0),
        neutral: Number(overall?.neutral || 0),
      },
      bySource: (bySourceRows.rows as any[]).map(r => ({
        sourceId: Number(r.sourceId),
        sourceName: String(r.sourceName || "Unknown"),
        positive: Number(r.positive),
        negative: Number(r.negative),
        neutral: Number(r.neutral),
      })),
      timeline: (timelineRows.rows as any[]).map(r => ({
        date: String(r.date),
        positive: Number(r.positive),
        negative: Number(r.negative),
        neutral: Number(r.neutral),
      })),
      byCategory: (byCategoryRows.rows as any[]).map(r => ({
        category: String(r.category),
        positive: Number(r.positive),
        negative: Number(r.negative),
        neutral: Number(r.neutral),
      })),
      confidence: await this.getAnalyticsConfidence(start, end, sourceFilter, clientFilter),
    };
  }

  async getSourceBehavior(startDate: string, endDate: string, sourceIds?: number[], clientId?: number) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { sources: [], publishers: [], diversity: [] };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const sourceIdFilter = sourceIds ? sql`AND s.id IN (${sqlNumberList(sourceIds)})` : sql``;
    const sourceFilterA = sourceIds ? sql`AND a.source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const clientFilterA = clientId ? sql`AND a.client_id = ${clientId}` : sql``;
    const clientFilterS = clientId ? sql`AND s.client_id = ${clientId}` : sql``;

    const sourceRows = await db.execute(sql`
      SELECT 
        s.id as "sourceId", s.name as "sourceName", s.type as "sourceType",
        COUNT(a.id)::int as "articleCount",
        MODE() WITHIN GROUP (ORDER BY a.sentiment_label) as "dominantSentiment",
        COUNT(DISTINCT unnest_kw)::int as "uniqueKeywords"
      FROM sources s
      LEFT JOIN articles a ON a.source_id = s.id AND a.published_at >= ${start} AND a.published_at <= ${end}
      LEFT JOIN LATERAL unnest(a.keywords) as unnest_kw ON true
      WHERE 1=1 ${sourceIdFilter} ${clientFilterS}
      GROUP BY s.id, s.name, s.type
      ORDER BY "articleCount" DESC
    `);

    const publisherRows = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as "publisherName",
        MIN(s.name) as "collectorSourceName",
        CASE
          WHEN COUNT(DISTINCT s.type) = 1 THEN MIN(s.type)
          ELSE 'mixed'
        END as "collectorSourceType",
        COUNT(DISTINCT a.id)::int as "articleCount"
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA} ${clientFilterA}
      GROUP BY COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown')
      ORDER BY "articleCount" DESC, "publisherName" ASC
      LIMIT 20
    `);

    const diversityRows = await db.execute(sql`
      SELECT s.type as "sourceType", COUNT(DISTINCT a.id)::int as count
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA} ${clientFilterA}
      GROUP BY s.type
      ORDER BY count DESC
    `);

    return {
      sources: (sourceRows.rows as any[]).map(r => ({
        sourceId: Number(r.sourceId),
        sourceName: String(r.sourceName),
        sourceType: String(r.sourceType),
        articleCount: Number(r.articleCount),
        avgArticlesPerDay: Math.round((Number(r.articleCount) / daysDiff) * 10) / 10,
        dominantSentiment: String(r.dominantSentiment || "neutral"),
        uniqueKeywords: Number(r.uniqueKeywords),
      })),
      publishers: (publisherRows.rows as any[]).map(r => ({
        publisherName: String(r.publisherName || "Unknown"),
        collectorSourceName: String(r.collectorSourceName || "Unknown"),
        collectorSourceType: String(r.collectorSourceType || "unknown"),
        articleCount: Number(r.articleCount),
        avgArticlesPerDay: Math.round((Number(r.articleCount) / daysDiff) * 10) / 10,
      })),
      diversity: (diversityRows.rows as any[]).map(r => ({
        sourceType: String(r.sourceType || "unknown"),
        count: Number(r.count),
      })),
    };
  }

  async getNarrativeComparison(topic: string, startDate: string, endDate: string, sourceIds?: number[], clientId?: number) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { topic, sources: [], hasContrast: false };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND a.source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const clientFilterA = clientId ? sql`AND a.client_id = ${clientId}` : sql``;

    const rows = await db.execute(sql`
      SELECT 
        MIN(a.source_id)::int as "sourceId",
        COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as "sourceName",
        COUNT(*) FILTER (WHERE a.sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'neutral' OR a.sentiment_label IS NULL)::int as neutral,
        COUNT(*)::int as total
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE (a.keywords IS NOT NULL AND ${topic} = ANY(a.keywords))
        AND a.published_at >= ${start} AND a.published_at <= ${end}
        ${sourceFilter} ${clientFilterA}
      GROUP BY COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown')
      HAVING COUNT(*) >= 1
      ORDER BY total DESC
      LIMIT 10
    `);

    const sourcesData = (rows.rows as any[]).map(r => ({
      sourceId: Number(r.sourceId),
      sourceName: String(r.sourceName),
      positive: Number(r.positive),
      negative: Number(r.negative),
      neutral: Number(r.neutral),
      total: Number(r.total),
    }));

    let hasContrast = false;
    if (sourcesData.length >= 2) {
      const ratios = sourcesData.map(s => {
        const total = s.total || 1;
        return { name: s.sourceName, posRatio: s.positive / total, negRatio: s.negative / total };
      });
      for (let i = 0; i < ratios.length - 1; i++) {
        for (let j = i + 1; j < ratios.length; j++) {
          if (Math.abs(ratios[i].posRatio - ratios[j].posRatio) > 0.3 ||
              Math.abs(ratios[i].negRatio - ratios[j].negRatio) > 0.3) {
            hasContrast = true;
            break;
          }
        }
        if (hasContrast) break;
      }
    }

    return { topic, sources: sourcesData, hasContrast };
  }

  async getAnalyticsDailyBrief(date: string, sourceIds?: number[], clientId?: number) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return {
        date,
        topStories: [],
        biggestTopic: "",
        sentimentShift: { previous: { positive: 0, negative: 0, neutral: 0 }, current: { positive: 0, negative: 0, neutral: 0 } },
        sourceSpike: null,
      };
    }
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const prevDayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
    const sourceFilter = sourceIds ? sql`AND a.source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const sourceFilterPlain = sourceIds ? sql`AND source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const clientFilter = clientId ? sql`AND a.client_id = ${clientId}` : sql``;
    const clientFilterPlain = clientId ? sql`AND client_id = ${clientId}` : sql``;

    const topStoriesRows = await db.execute(sql`
      SELECT
        a.title,
        a.url,
        COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as "sourceName",
        a.sentiment_label as sentiment
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${dayStart} AND a.published_at <= ${dayEnd} ${sourceFilter} ${clientFilter}
      ORDER BY a.published_at DESC
      LIMIT 5
    `);

    const topicRows = await db.execute(sql`
      SELECT kw as topic, COUNT(*)::int as count
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL AND published_at >= ${dayStart} AND published_at <= ${dayEnd} ${sourceFilterPlain} ${clientFilterPlain}
      GROUP BY kw ORDER BY count DESC LIMIT 1
    `);

    const currentSentimentRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${dayStart} AND published_at <= ${dayEnd} ${sourceFilterPlain} ${clientFilterPlain}
    `);

    const prevSentimentRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${prevDayStart} AND published_at < ${dayStart} ${sourceFilterPlain} ${clientFilterPlain}
    `);

    const spikeRows = await db.execute(sql`
      SELECT COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as "sourceName",
        COUNT(*) FILTER (WHERE a.published_at >= ${dayStart} AND a.published_at <= ${dayEnd})::int as "todayCount",
        COUNT(*) FILTER (WHERE a.published_at >= ${prevDayStart} AND a.published_at < ${dayStart})::int as "yesterdayCount"
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${prevDayStart} AND a.published_at <= ${dayEnd} ${sourceFilter} ${clientFilter}
      GROUP BY COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown')
      HAVING COUNT(*) FILTER (WHERE a.published_at >= ${dayStart} AND a.published_at <= ${dayEnd}) > 0
      ORDER BY "todayCount" DESC
      LIMIT 1
    `);

    const currentSent = currentSentimentRows.rows[0] as any || { positive: 0, negative: 0, neutral: 0 };
    const prevSent = prevSentimentRows.rows[0] as any || { positive: 0, negative: 0, neutral: 0 };
    const spikeRow = spikeRows.rows[0] as any;

    return {
      date,
      topStories: (topStoriesRows.rows as any[]).map(r => ({
        title: String(r.title || ""),
        url: String(r.url || ""),
        sourceName: String(r.sourceName || ""),
        sentiment: String(r.sentiment || "neutral"),
      })),
      biggestTopic: String((topicRows.rows[0] as any)?.topic || ""),
      sentimentShift: {
        previous: { positive: Number(prevSent.positive), negative: Number(prevSent.negative), neutral: Number(prevSent.neutral) },
        current: { positive: Number(currentSent.positive), negative: Number(currentSent.negative), neutral: Number(currentSent.neutral) },
      },
      sourceSpike: spikeRow ? {
        sourceName: String(spikeRow.sourceName),
        count: Number(spikeRow.todayCount),
        avgCount: Number(spikeRow.yesterdayCount),
      } : null,
    };
  }

  async getKeywordDetail(keyword: string, startDate: string, endDate: string, sourceIds?: number[], clientId?: number) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { keyword, frequency: [], topSources: [], sentiment: { positive: 0, negative: 0, neutral: 0 }, headlines: [] };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND a.source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const sourceFilterPlain = sourceIds ? sql`AND source_id IN (${sqlNumberList(sourceIds)})` : sql``;
    const clientFilter = clientId ? sql`AND a.client_id = ${clientId}` : sql``;
    const clientFilterPlain = clientId ? sql`AND client_id = ${clientId}` : sql``;

    const freqRows = await db.execute(sql`
      SELECT TO_CHAR(published_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM articles
      WHERE POSITION(${keyword.toLowerCase()} IN LOWER(CONCAT_WS(' ', title, summary, content))) > 0
        AND published_at >= ${start} AND published_at <= ${end} ${sourceFilterPlain} ${clientFilterPlain}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    const sourceRows = await db.execute(sql`
      SELECT COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as "sourceName", COUNT(*)::int as count
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE POSITION(${keyword.toLowerCase()} IN LOWER(CONCAT_WS(' ', a.title, a.summary, a.content))) > 0
        AND a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilter} ${clientFilter}
      GROUP BY COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown')
      ORDER BY count DESC
      LIMIT 10
    `);

    const sentimentRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE POSITION(${keyword.toLowerCase()} IN LOWER(CONCAT_WS(' ', title, summary, content))) > 0
        AND published_at >= ${start} AND published_at <= ${end} ${sourceFilterPlain} ${clientFilterPlain}
    `);

    const headlineRows = await db.execute(sql`
      SELECT
        a.title,
        a.url,
        COALESCE(NULLIF(a.sub_source, ''), s.name, 'Unknown') as "sourceName",
        a.published_at as "publishedAt",
        a.sentiment_label as sentiment
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE POSITION(${keyword.toLowerCase()} IN LOWER(CONCAT_WS(' ', a.title, a.summary, a.content))) > 0
        AND a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilter} ${clientFilter}
      ORDER BY a.published_at DESC
      LIMIT 20
    `);

    const sent = sentimentRows.rows[0] as any || { positive: 0, negative: 0, neutral: 0 };

    return {
      keyword,
      frequency: (freqRows.rows as any[]).map(r => ({ date: String(r.date), count: Number(r.count) })),
      topSources: (sourceRows.rows as any[]).map(r => ({ sourceName: String(r.sourceName), count: Number(r.count) })),
      sentiment: { positive: Number(sent.positive), negative: Number(sent.negative), neutral: Number(sent.neutral) },
      headlines: (headlineRows.rows as any[]).map(r => ({
        title: String(r.title || ""),
        url: String(r.url || ""),
        sourceName: String(r.sourceName || ""),
        publishedAt: String(r.publishedAt || ""),
        sentiment: String(r.sentiment || "neutral"),
      })),
    };
  }

  async deleteExpiredArticles(): Promise<number> {
    const allSources = await this.getSources();
    let totalDeleted = 0;

    for (const source of allSources) {
      const retentionDays = source.retentionDays ?? 7;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const expiredArticles = await db
        .select({ id: articles.id })
        .from(articles)
        .where(
          and(
            eq(articles.sourceId, source.id),
            lte(articles.createdAt, cutoffDate)
          )
        );
      const expiredIds = expiredArticles.map(a => a.id);
      if (expiredIds.length === 0) continue;

      await this.cleanupArticleDependents(expiredIds);
      await db.delete(bookmarks).where(inArray(bookmarks.articleId, expiredIds));
      await db.delete(articles).where(inArray(articles.id, expiredIds));
      totalDeleted += expiredIds.length;
    }

    return totalDeleted;
  }

  // === CLIENTS ===
  async getClients(): Promise<Client[]> {
    return await db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(insertClient).returning();
    return client;
  }

  async updateClient(id: number, updates: Partial<InsertClient>): Promise<Client | undefined> {
    const [client] = await db.update(clients).set(updates).where(eq(clients.id, id)).returning();
    return client;
  }

  async deleteClient(id: number): Promise<void> {
    await db.update(clients).set({ active: false }).where(eq(clients.id, id));
  }

  // === CLIENT KEYWORDS ===
  async getClientKeywords(clientId: number): Promise<ClientKeyword[]> {
    return await db.select().from(clientKeywords).where(eq(clientKeywords.clientId, clientId)).orderBy(desc(clientKeywords.createdAt));
  }

  async addClientKeyword(keyword: InsertClientKeyword): Promise<ClientKeyword> {
    const [kw] = await db.insert(clientKeywords).values(keyword).returning();
    return kw;
  }

  async removeClientKeyword(id: number): Promise<void> {
    await db.delete(clientKeywords).where(eq(clientKeywords.id, id));
  }

  // === SYSTEM SETTINGS ===
  async getSystemSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(systemSettings);
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  async updateSystemSetting(key: string, value: string): Promise<SystemSetting> {
    const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    if (existing) {
      const [updated] = await db.update(systemSettings).set({ value, updatedAt: new Date() }).where(eq(systemSettings.key, key)).returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings).values({ key, value }).returning();
    return created;
  }

  // === ADMIN AUDIT LOGS ===
  async createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [entry] = await db.insert(adminAuditLogs).values({
      ...log,
      clientId: (log as any).clientId ?? 9000,
    }).returning();
    return entry;
  }

  async getAuditLogs(params?: { limit?: number; offset?: number }): Promise<{ items: (AdminAuditLog & { username: string })[], total: number }> {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(adminAuditLogs);

    const rows = await db.select({
      id: adminAuditLogs.id,
      userId: adminAuditLogs.userId,
      action: adminAuditLogs.action,
      entity: adminAuditLogs.entity,
      entityId: adminAuditLogs.entityId,
      details: adminAuditLogs.details,
      createdAt: adminAuditLogs.createdAt,
      username: users.username,
    })
      .from(adminAuditLogs)
      .leftJoin(users, eq(adminAuditLogs.userId, users.id))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(r => ({ ...r, username: r.username || "Unknown" })),
      total: countResult?.count || 0,
    };
  }

  // === SOFT-DELETE SOURCES ===
  async softDeleteSource(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(sources.id, id)];
    if (clientId) conditions.push(eq(sources.clientId, clientId));
    await db.update(sources).set({ deletedAt: new Date(), active: false }).where(and(...conditions));
  }

  async restoreSource(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(sources.id, id)];
    if (clientId) conditions.push(eq(sources.clientId, clientId));
    await db.update(sources).set({ deletedAt: null, active: true }).where(and(...conditions));
  }

  async getActiveSources(): Promise<Source[]> {
    return await db.select().from(sources).where(isNull(sources.deletedAt));
  }

  // === USER MANAGEMENT EXTENSIONS ===
  async updateUser(id: number, updates: Partial<{ role: string; userScope: string; clientId: number | null; disabled: boolean; password: string }>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  // === SYSTEM HEALTH (Enhanced) ===
  async getSystemHealth() {
    const [lastWorkerRow] = await db.select({ fetchedAt: sourceFetchLogs.fetchedAt })
      .from(sourceFetchLogs)
      .orderBy(desc(sourceFetchLogs.fetchedAt))
      .limit(1);

    const [avgTimeRow] = await db.select({ avg: sql<number>`COALESCE(AVG(duration_ms), 0)::int` })
      .from(sourceFetchLogs)
      .where(gte(sourceFetchLogs.fetchedAt, sql`NOW() - INTERVAL '24 hours'`));

    const [failedRow] = await db.select({ count: sql<number>`count(DISTINCT source_id)::int` })
      .from(sourceFetchLogs)
      .where(and(
        eq(sourceFetchLogs.status, 'error'),
        gte(sourceFetchLogs.fetchedAt, sql`NOW() - INTERVAL '24 hours'`)
      ));

    const [totalArticlesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(articles);
    const [totalSourcesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(sources).where(isNull(sources.deletedAt));
    const [totalUsersRow] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

    const [queueStats] = await db.select({
      pending: sql<number>`count(*) filter (where ${processingJobs.status} = 'pending')`,
      running: sql<number>`count(*) filter (where ${processingJobs.status} = 'running')`,
      completed: sql<number>`count(*) filter (where ${processingJobs.status} = 'completed')`,
      failed: sql<number>`count(*) filter (where ${processingJobs.status} = 'failed')`,
    }).from(processingJobs);

    const [recentErrorsRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(systemErrors)
      .where(gte(systemErrors.createdAt, sql`NOW() - INTERVAL '24 hours'`));

    const [articlesSize] = await db.select({
      size: sql<number>`COALESCE(pg_total_relation_size('articles'), 0)`,
    }).from(sql`(SELECT 1) AS t`);

    const [logsSize] = await db.select({
      size: sql<number>`COALESCE(pg_total_relation_size('source_fetch_logs'), 0)`,
    }).from(sql`(SELECT 1) AS t`);

    return {
      lastWorkerRun: lastWorkerRow?.fetchedAt || null,
      avgProcessingTime: Number(avgTimeRow?.avg || 0),
      failedSourcesCount: Number(failedRow?.count || 0),
      totalArticles: Number(totalArticlesRow?.count || 0),
      totalSources: Number(totalSourcesRow?.count || 0),
      totalUsers: Number(totalUsersRow?.count || 0),
      queueStats: {
        pending: Number(queueStats?.pending ?? 0),
        running: Number(queueStats?.running ?? 0),
        completed: Number(queueStats?.completed ?? 0),
        failed: Number(queueStats?.failed ?? 0),
      },
      recentErrors: Number(recentErrorsRow?.count ?? 0),
      storageEstimate: {
        articlesSize: Number(articlesSize?.size ?? 0),
        logsSize: Number(logsSize?.size ?? 0),
      },
    };
  }

  // === SYSTEM ERRORS ===
  async getSystemErrors(params?: { severity?: string; component?: string; limit?: number; offset?: number }) {
    const conditions = [];
    if (params?.severity) conditions.push(eq(systemErrors.severity, params.severity));
    if (params?.component) conditions.push(eq(systemErrors.component, params.component));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(systemErrors).where(whereClause);
    const items = await db.select().from(systemErrors)
      .where(whereClause)
      .orderBy(desc(systemErrors.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total: Number(countResult?.count || 0) };
  }

  // === API KEYS ===
  async getApiKeys() {
    return await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      clientId: apiKeys.clientId,
      scopes: apiKeys.scopes,
      rateLimit: apiKeys.rateLimit,
      active: apiKeys.active,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyByHash(keyHash: string) {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return key;
  }

  async createApiKey(data: any) {
    const [key] = await db.insert(apiKeys).values(data).returning();
    return key;
  }

  async updateApiKeyLastUsed(id: number) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async deactivateApiKey(id: number) {
    await db.update(apiKeys).set({ active: false }).where(eq(apiKeys.id, id));
  }

  async getFeatureFlags(): Promise<FeatureFlag[]> {
    return db.select().from(featureFlags).orderBy(asc(featureFlags.key));
  }

  async getFeatureFlag(key: string): Promise<FeatureFlag | undefined> {
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
    return flag;
  }

  async upsertFeatureFlag(key: string, enabled: boolean, description?: string): Promise<FeatureFlag> {
    const existing = await this.getFeatureFlag(key);
    if (existing) {
      const [updated] = await db.update(featureFlags)
        .set({ enabled, description: description ?? existing.description, updatedAt: new Date() })
        .where(eq(featureFlags.key, key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(featureFlags)
      .values({ key, enabled, description })
      .returning();
    return created;
  }

  async deleteFeatureFlag(id: number): Promise<void> {
    await db.delete(featureFlags).where(eq(featureFlags.id, id));
  }

  async trackUsage(event: string, userId?: number, metadata?: any): Promise<void> {
    await db.insert(usageMetrics).values({ event, userId, metadata });
  }

  async getUsageMetrics(params?: { event?: string; startDate?: string; endDate?: string; limit?: number }) {
    const conditions = [];
    if (params?.event) conditions.push(eq(usageMetrics.event, params.event));
    if (params?.startDate) conditions.push(gte(usageMetrics.createdAt, new Date(params.startDate)));
    if (params?.endDate) conditions.push(lte(usageMetrics.createdAt, new Date(params.endDate)));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const result = await db.select({
      event: usageMetrics.event,
      count: sql<number>`count(*)::int`,
      lastOccurred: sql<Date>`max(${usageMetrics.createdAt})`,
    })
      .from(usageMetrics)
      .where(whereClause)
      .groupBy(usageMetrics.event)
      .orderBy(desc(sql`count(*)`))
      .limit(params?.limit || 50);
    return result;
  }

  async getUsageSummary(days: number = 7) {
    const since = new Date(Date.now() - days * 86400000);
    const [dauResult] = await db.select({
      count: sql<number>`count(distinct ${usageMetrics.userId})::int`,
    }).from(usageMetrics).where(and(
      gte(usageMetrics.createdAt, since),
      isNotNull(usageMetrics.userId)
    ));
    const [totalResult] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(usageMetrics).where(gte(usageMetrics.createdAt, since));
    const topEvents = await db.select({
      event: usageMetrics.event,
      count: sql<number>`count(*)::int`,
    }).from(usageMetrics)
      .where(gte(usageMetrics.createdAt, since))
      .groupBy(usageMetrics.event)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    const topEndpoints = await db.select({
      event: usageMetrics.event,
      count: sql<number>`count(*)::int`,
    }).from(usageMetrics)
      .where(and(gte(usageMetrics.createdAt, since), sql`${usageMetrics.event} LIKE 'api:%'`))
      .groupBy(usageMetrics.event)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    return {
      dailyActiveUsers: dauResult?.count || 0,
      totalEvents: totalResult?.count || 0,
      topEvents,
      topEndpoints,
    };
  }

  async getArticleAiAnalysis(articleId: number, clientId?: number): Promise<ArticleAiAnalysis | undefined> {
    if (clientId) {
      const article = await this.getArticle(articleId, clientId);
      if (!article) return undefined;
    }
    const [row] = await db.select().from(articleAiAnalysis).where(eq(articleAiAnalysis.articleId, articleId));
    return row;
  }

  async upsertArticleAiAnalysis(data: InsertArticleAiAnalysis): Promise<ArticleAiAnalysis> {
    const [row] = await db.insert(articleAiAnalysis)
      .values(data)
      .onConflictDoUpdate({
        target: articleAiAnalysis.articleId,
        set: {
          mainTopic: data.mainTopic,
          subtopics: data.subtopics,
          entities: data.entities,
          eventType: data.eventType,
          importanceScore: data.importanceScore,
          narrativeSummary: data.narrativeSummary,
          clusterId: data.clusterId,
          confidenceScore: data.confidenceScore,
        },
      })
      .returning();
    return row;
  }

  async getUnanalyzedArticleIds(limit: number = 100, clientId?: number): Promise<number[]> {
    const conditions = [isNull(articleAiAnalysis.id)];
    if (clientId) conditions.push(eq(articles.clientId, clientId));
    const rows = await db.select({ id: articles.id })
      .from(articles)
      .leftJoin(articleAiAnalysis, eq(articles.id, articleAiAnalysis.articleId))
      .where(and(...conditions))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);
    return rows.map(r => r.id);
  }

  async getStoryClusters(params?: { limit?: number; offset?: number; clientId?: number }): Promise<StoryCluster[]> {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    const conditions = [];
    if (params?.clientId) conditions.push(eq(storyClusters.clientId, params.clientId));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(storyClusters)
      .where(whereClause)
      .orderBy(desc(storyClusters.lastUpdated))
      .limit(limit)
      .offset(offset);
  }

  async getStoryCluster(id: number, clientId?: number): Promise<StoryCluster | undefined> {
    const conditions = [eq(storyClusters.id, id)];
    if (clientId) conditions.push(eq(storyClusters.clientId, clientId));
    const [row] = await db.select().from(storyClusters).where(and(...conditions));
    return row;
  }

  async createStoryCluster(data: InsertStoryCluster): Promise<StoryCluster> {
    const [row] = await db.insert(storyClusters).values(data).returning();
    return row;
  }

  async updateStoryCluster(id: number, data: Partial<InsertStoryCluster>): Promise<StoryCluster> {
    const [row] = await db.update(storyClusters)
      .set({ ...data, lastUpdated: new Date() })
      .where(eq(storyClusters.id, id))
      .returning();
    return row;
  }

  async getClusterArticles(clusterId: number, clientId?: number): Promise<(Article & { sourceName?: string | null })[]> {
    const conditions = [eq(articleAiAnalysis.clusterId, clusterId)];
    if (clientId) conditions.push(eq(articles.clientId, clientId));
    const rows = await db.select({
      id: articles.id,
      title: articles.title,
      content: articles.content,
      contentClean: articles.contentClean,
      summary: articles.summary,
      url: articles.url,
      sourceId: articles.sourceId,
      publishedAt: articles.publishedAt,
      ingestedAt: articles.ingestedAt,
      language: articles.language,
      country: articles.country,
      sentimentScore: articles.sentimentScore,
      sentimentLabel: articles.sentimentLabel,
      keywords: articles.keywords,
      topics: articles.topics,
      category: articles.category,
      imageUrl: articles.imageUrl,
      subSource: articles.subSource,
      createdAt: articles.createdAt,
      sourceName: sql<string>`COALESCE(NULLIF(${articles.subSource}, ''), ${sources.name}, 'Unknown')`,
    })
      .from(articles)
      .innerJoin(articleAiAnalysis, eq(articles.id, articleAiAnalysis.articleId))
      .leftJoin(sources, eq(articles.sourceId, sources.id))
      .where(and(...conditions))
      .orderBy(desc(articles.publishedAt));
    return rows;
  }

  async getDailyBriefs(limit: number = 30, clientId?: number): Promise<DailyBrief[]> {
    const conditions = [];
    if (clientId) conditions.push(eq(dailyBriefs.clientId, clientId));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(dailyBriefs)
      .where(whereClause)
      .orderBy(desc(dailyBriefs.date))
      .limit(limit);
  }

  async getDailyBrief(date: string, clientId?: number): Promise<DailyBrief | undefined> {
    const conditions = [eq(dailyBriefs.date, date)];
    if (clientId) conditions.push(eq(dailyBriefs.clientId, clientId));
    const [row] = await db.select().from(dailyBriefs).where(and(...conditions));
    return row;
  }

  async upsertDailyBrief(data: InsertDailyBrief): Promise<DailyBrief> {
    if (data.clientId) {
      const existing = await this.getDailyBrief(data.date, data.clientId);
      if (existing) {
        const [row] = await db.update(dailyBriefs)
          .set({
            content: data.content,
            keyStories: data.keyStories,
            majorDevelopments: data.majorDevelopments,
            emergingTopics: data.emergingTopics,
            toneShifts: data.toneShifts,
            articleCount: data.articleCount,
            sourceCount: data.sourceCount,
            confidenceScore: data.confidenceScore,
          })
          .where(eq(dailyBriefs.id, existing.id))
          .returning();
        return row;
      }
    }
    const [row] = await db.insert(dailyBriefs).values(data).returning();
    return row;
  }

  async getDetectedEvents(params?: { type?: string; severity?: string; limit?: number; acknowledged?: boolean; clientId?: number }): Promise<DetectedEvent[]> {
    const conditions = [];
    if (params?.clientId) conditions.push(eq(detectedEvents.clientId, params.clientId));
    if (params?.type) conditions.push(eq(detectedEvents.type, params.type));
    if (params?.severity) conditions.push(eq(detectedEvents.severity, params.severity));
    if (params?.acknowledged !== undefined) conditions.push(eq(detectedEvents.acknowledged, params.acknowledged));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(detectedEvents)
      .where(whereClause)
      .orderBy(desc(detectedEvents.createdAt))
      .limit(params?.limit || 50);
  }

  async createDetectedEvent(data: InsertDetectedEvent): Promise<DetectedEvent> {
    const [row] = await db.insert(detectedEvents).values(data).returning();
    return row;
  }

  async acknowledgeEvent(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(detectedEvents.id, id)];
    if (clientId) conditions.push(eq(detectedEvents.clientId, clientId));
    await db.update(detectedEvents).set({ acknowledged: true }).where(and(...conditions));
  }

  async getEntityMentions(entityName: string, params?: { limit?: number; startDate?: string; endDate?: string; clientId?: number }): Promise<EntityMention[]> {
    const conditions = [eq(entityMentions.entityName, entityName)];
    if (params?.clientId) conditions.push(eq(entityMentions.clientId, params.clientId));
    if (params?.startDate) conditions.push(gte(entityMentions.mentionDate, new Date(params.startDate)));
    if (params?.endDate) conditions.push(lte(entityMentions.mentionDate, new Date(params.endDate)));
    return await db.select().from(entityMentions)
      .where(and(...conditions))
      .orderBy(desc(entityMentions.mentionDate))
      .limit(params?.limit || 100);
  }

  async createEntityMention(data: InsertEntityMention): Promise<EntityMention> {
    const [row] = await db.insert(entityMentions).values(data).returning();
    return row;
  }

  async createEntityMentionsBatch(data: InsertEntityMention[]): Promise<void> {
    if (data.length === 0) return;
    await db.insert(entityMentions).values(data);
  }

  async getTopEntities(params?: { limit?: number; days?: number; entityType?: string; clientId?: number }): Promise<{ entityName: string; entityType: string; mentionCount: number; avgSentiment: number }[]> {
    const conditions = [];
    if (params?.clientId) conditions.push(eq(entityMentions.clientId, params.clientId));
    if (params?.days) {
      const since = new Date(Date.now() - (params.days) * 86400000);
      conditions.push(gte(entityMentions.mentionDate, since));
    }
    if (params?.entityType) conditions.push(eq(entityMentions.entityType, params.entityType));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select({
      entityName: entityMentions.entityName,
      entityType: entityMentions.entityType,
      mentionCount: sql<number>`count(*)::int`,
      avgSentiment: sql<number>`COALESCE(AVG(${entityMentions.sentimentScore}), 0)::int`,
    })
      .from(entityMentions)
      .where(whereClause)
      .groupBy(entityMentions.entityName, entityMentions.entityType)
      .orderBy(desc(sql`count(*)`))
      .limit(params?.limit || 20);
    return rows;
  }

  async getEntityTimeline(entityName: string, days: number = 30, clientId?: number): Promise<{ date: string; mentionCount: number; avgSentiment: number }[]> {
    const since = new Date(Date.now() - days * 86400000);
    const conditions = [
      eq(entityMentions.entityName, entityName),
      gte(entityMentions.mentionDate, since),
    ];
    if (clientId) conditions.push(eq(entityMentions.clientId, clientId));
    const rows = await db.select({
      date: sql<string>`TO_CHAR(${entityMentions.mentionDate}, 'YYYY-MM-DD')`,
      mentionCount: sql<number>`count(*)::int`,
      avgSentiment: sql<number>`COALESCE(AVG(${entityMentions.sentimentScore}), 0)::int`,
    })
      .from(entityMentions)
      .where(and(...conditions))
      .groupBy(sql`TO_CHAR(${entityMentions.mentionDate}, 'YYYY-MM-DD')`)
      .orderBy(asc(sql`TO_CHAR(${entityMentions.mentionDate}, 'YYYY-MM-DD')`));
    return rows;
  }

  async getTrendPredictions(params?: { topic?: string; limit?: number; clientId?: number }): Promise<TrendPrediction[]> {
    const conditions = [];
    if (params?.clientId) conditions.push(eq(trendPredictions.clientId, params.clientId));
    if (params?.topic) conditions.push(eq(trendPredictions.topic, params.topic));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(trendPredictions)
      .where(whereClause)
      .orderBy(desc(trendPredictions.createdAt))
      .limit(params?.limit || 50);
  }

  async createTrendPrediction(data: InsertTrendPrediction): Promise<TrendPrediction> {
    const [row] = await db.insert(trendPredictions).values(data).returning();
    return row;
  }

  async getSubscription(clientId: number): Promise<Subscription | undefined> {
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.clientId, clientId));
    return row;
  }

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [row] = await db.insert(subscriptions).values(data).returning();
    return row;
  }

  async updateSubscription(clientId: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [row] = await db.update(subscriptions).set({ ...data, updatedAt: new Date() }).where(eq(subscriptions.clientId, clientId)).returning();
    return row;
  }

  async getActiveUserCount(clientId: number): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.clientId, clientId), eq(users.userScope, "tenant"), sql`(${users.disabled} = false OR ${users.disabled} IS NULL)`));
    return result?.count || 0;
  }

  async getUsersByClientId(clientId: number): Promise<User[]> {
    return await db.select().from(users).where(and(eq(users.clientId, clientId), eq(users.userScope, "tenant")));
  }

  async getOnboardingState(clientId: number): Promise<OnboardingState | undefined> {
    const [row] = await db.select().from(onboardingState).where(eq(onboardingState.clientId, clientId));
    return row;
  }

  async upsertOnboardingState(data: InsertOnboardingState): Promise<OnboardingState> {
    const [row] = await db.insert(onboardingState).values(data)
      .onConflictDoUpdate({
        target: onboardingState.clientId,
        set: data,
      })
      .returning();
    return row;
  }

  async getNotificationSettings(userId: number): Promise<NotificationSetting[]> {
    return await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId));
  }

  async upsertNotificationSetting(data: InsertNotificationSetting): Promise<NotificationSetting> {
    const [row] = await db.insert(notificationSettings).values(data).returning();
    return row;
  }

  async deleteNotificationSetting(id: number, userId?: number): Promise<void> {
    const conditions = [eq(notificationSettings.id, id)];
    if (userId) conditions.push(eq(notificationSettings.userId, userId));
    await db.delete(notificationSettings).where(and(...conditions));
  }

  async getWhiteLabelSettings(clientId: number): Promise<WhiteLabelSetting | undefined> {
    const [row] = await db.select().from(whiteLabelSettings).where(eq(whiteLabelSettings.clientId, clientId));
    return row;
  }

  async upsertWhiteLabelSettings(data: InsertWhiteLabelSetting): Promise<WhiteLabelSetting> {
    const [row] = await db.insert(whiteLabelSettings).values(data)
      .onConflictDoUpdate({
        target: whiteLabelSettings.clientId,
        set: {
          logoUrl: data.logoUrl,
          organizationName: data.organizationName,
          customReportTitle: data.customReportTitle,
          primaryColor: data.primaryColor,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async getSupportTickets(params?: { userId?: number; clientId?: number; status?: string }): Promise<SupportTicket[]> {
    const conditions = [];
    if (params?.userId) conditions.push(eq(supportTickets.userId, params.userId));
    if (params?.clientId) conditions.push(eq(supportTickets.clientId, params.clientId));
    if (params?.status) conditions.push(eq(supportTickets.status, params.status));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(supportTickets).where(whereClause).orderBy(desc(supportTickets.createdAt));
  }

  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [row] = await db.insert(supportTickets).values(data).returning();
    return row;
  }

  async updateSupportTicketStatus(id: number, status: string): Promise<void> {
    await db.update(supportTickets).set({ status, updatedAt: new Date() }).where(eq(supportTickets.id, id));
  }

  async getUserFeedback(params?: { userId?: number; feature?: string; targetId?: number }): Promise<UserFeedback[]> {
    const conditions = [];
    if (params?.userId) conditions.push(eq(userFeedback.userId, params.userId));
    if (params?.feature) conditions.push(eq(userFeedback.feature, params.feature));
    if (params?.targetId) conditions.push(eq(userFeedback.targetId, params.targetId));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(userFeedback).where(whereClause).orderBy(desc(userFeedback.createdAt));
  }

  async createUserFeedback(data: InsertUserFeedback): Promise<UserFeedback> {
    const [row] = await db.insert(userFeedback).values(data).returning();
    return row;
  }

  async getInsightEngagement(params?: { userId?: number; insightType?: string; insightId?: number }): Promise<InsightEngagement[]> {
    const conditions = [];
    if (params?.userId) conditions.push(eq(insightEngagement.userId, params.userId));
    if (params?.insightType) conditions.push(eq(insightEngagement.insightType, params.insightType));
    if (params?.insightId) conditions.push(eq(insightEngagement.insightId, params.insightId));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(insightEngagement).where(whereClause).orderBy(desc(insightEngagement.createdAt));
  }

  async upsertInsightEngagement(data: InsertInsightEngagement): Promise<InsightEngagement> {
    const existing = await db.select().from(insightEngagement)
      .where(and(
        eq(insightEngagement.userId, data.userId),
        eq(insightEngagement.insightType, data.insightType),
        eq(insightEngagement.insightId, data.insightId),
      ));
    if (existing.length > 0) {
      const [row] = await db.update(insightEngagement)
        .set({ opened: data.opened || existing[0].opened, clicked: data.clicked || existing[0].clicked, exported: data.exported || existing[0].exported, dwellTimeSeconds: data.dwellTimeSeconds ?? existing[0].dwellTimeSeconds })
        .where(eq(insightEngagement.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await db.insert(insightEngagement).values(data).returning();
    return row;
  }

  async getAiCorrections(params?: { articleId?: number; userId?: number; status?: string }): Promise<AiCorrection[]> {
    const conditions = [];
    if (params?.articleId) conditions.push(eq(aiCorrections.articleId, params.articleId));
    if (params?.userId) conditions.push(eq(aiCorrections.userId, params.userId));
    if (params?.status) conditions.push(eq(aiCorrections.status, params.status));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await db.select().from(aiCorrections).where(whereClause).orderBy(desc(aiCorrections.createdAt));
  }

  async createAiCorrection(data: InsertAiCorrection): Promise<AiCorrection> {
    const [row] = await db.insert(aiCorrections).values(data).returning();
    return row;
  }

  async updateAiCorrectionStatus(id: number, status: string): Promise<void> {
    await db.update(aiCorrections).set({ status }).where(eq(aiCorrections.id, id));
  }

  async getAlertPreferences(clientId: number): Promise<AlertPreference[]> {
    return await db.select().from(alertPreferences).where(eq(alertPreferences.clientId, clientId));
  }

  async upsertAlertPreference(data: InsertAlertPreference): Promise<AlertPreference> {
    const [row] = await db.insert(alertPreferences).values(data)
      .onConflictDoUpdate({
        target: [alertPreferences.clientId, alertPreferences.alertType],
        set: { sensitivityScore: data.sensitivityScore, autoTuned: data.autoTuned, lastUpdated: new Date() },
      })
      .returning();
    return row;
  }

  async getDashboardPreferences(userId: number): Promise<DashboardPreference | undefined> {
    const [row] = await db.select().from(dashboardPreferences).where(eq(dashboardPreferences.userId, userId));
    return row;
  }

  async upsertDashboardPreferences(data: InsertDashboardPreference): Promise<DashboardPreference> {
    const [row] = await db.insert(dashboardPreferences).values(data)
      .onConflictDoUpdate({
        target: dashboardPreferences.userId,
        set: { pinnedTopics: data.pinnedTopics, favoriteEntities: data.favoriteEntities, preferredSources: data.preferredSources, recommendedPanels: data.recommendedPanels, frequentSearches: data.frequentSearches, autoSuggested: data.autoSuggested, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async getExperiments(params?: { status?: string }): Promise<Experiment[]> {
    if (params?.status) {
      return await db.select().from(experiments).where(eq(experiments.status, params.status)).orderBy(desc(experiments.createdAt));
    }
    return await db.select().from(experiments).orderBy(desc(experiments.createdAt));
  }

  async createExperiment(data: InsertExperiment): Promise<Experiment> {
    const [row] = await db.insert(experiments).values(data).returning();
    return row;
  }

  async updateExperiment(id: number, data: Partial<InsertExperiment>): Promise<Experiment | undefined> {
    const [row] = await db.update(experiments).set(data).where(eq(experiments.id, id)).returning();
    return row;
  }

  async getExperimentAssignment(userId: number, experimentId: number): Promise<ExperimentAssignment | undefined> {
    const [row] = await db.select().from(experimentAssignments)
      .where(and(eq(experimentAssignments.userId, userId), eq(experimentAssignments.experimentId, experimentId)));
    return row;
  }

  async getUserExperiments(userId: number): Promise<ExperimentAssignment[]> {
    return await db.select().from(experimentAssignments).where(eq(experimentAssignments.userId, userId));
  }

  async createExperimentAssignment(data: InsertExperimentAssignment): Promise<ExperimentAssignment> {
    const [row] = await db.insert(experimentAssignments).values(data).returning();
    return row;
  }

  async getKnowledgeEntries(params?: { search?: string; limit?: number }, clientId?: number): Promise<KnowledgeEntry[]> {
    const limit = params?.limit || 50;
    const conditions = [];
    if (clientId) conditions.push(eq(knowledgeEntries.clientId, clientId));
    if (params?.search) conditions.push(like(knowledgeEntries.questionPattern, `%${params.search}%`));
    if (conditions.length > 0) {
      return await db.select().from(knowledgeEntries)
        .where(and(...conditions))
        .orderBy(desc(knowledgeEntries.queryCount))
        .limit(limit);
    }
    return await db.select().from(knowledgeEntries).orderBy(desc(knowledgeEntries.queryCount)).limit(limit);
  }

  async upsertKnowledgeEntry(data: InsertKnowledgeEntry): Promise<KnowledgeEntry> {
    const existing = await db.select().from(knowledgeEntries)
      .where(eq(knowledgeEntries.questionPattern, data.questionPattern));
    if (existing.length > 0) {
      const [row] = await db.update(knowledgeEntries)
        .set({ answerSummary: data.answerSummary, queryCount: sql`${knowledgeEntries.queryCount} + 1`, lastUsed: new Date() })
        .where(eq(knowledgeEntries.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await db.insert(knowledgeEntries).values(data).returning();
    return row;
  }

  async getValueReports(clientId: number): Promise<ValueReport[]> {
    return await db.select().from(valueReports).where(eq(valueReports.clientId, clientId)).orderBy(desc(valueReports.createdAt));
  }

  async createValueReport(data: InsertValueReport): Promise<ValueReport> {
    const [row] = await db.insert(valueReports).values(data)
      .onConflictDoUpdate({
        target: [valueReports.clientId, valueReports.reportMonth],
        set: { ...data, createdAt: undefined },
      })
      .returning();
    return row;
  }

  async getWebhooks(clientId?: number): Promise<IntegrationWebhook[]> {
    if (clientId) return db.select().from(integrationWebhooks).where(eq(integrationWebhooks.clientId, clientId)).orderBy(desc(integrationWebhooks.createdAt));
    return db.select().from(integrationWebhooks).orderBy(desc(integrationWebhooks.createdAt));
  }

  async getWebhook(id: number, clientId?: number): Promise<IntegrationWebhook | undefined> {
    const conditions = [eq(integrationWebhooks.id, id)];
    if (clientId) conditions.push(eq(integrationWebhooks.clientId, clientId));
    const [row] = await db.select().from(integrationWebhooks).where(and(...conditions));
    return row;
  }

  async createWebhook(data: InsertIntegrationWebhook): Promise<IntegrationWebhook> {
    const [row] = await db.insert(integrationWebhooks).values(data).returning();
    return row;
  }

  async updateWebhook(id: number, data: Partial<InsertIntegrationWebhook>, clientId?: number): Promise<IntegrationWebhook | undefined> {
    const conditions = [eq(integrationWebhooks.id, id)];
    if (clientId) conditions.push(eq(integrationWebhooks.clientId, clientId));
    const [row] = await db.update(integrationWebhooks).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteWebhook(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(integrationWebhooks.id, id)];
    if (clientId) conditions.push(eq(integrationWebhooks.clientId, clientId));
    await db.delete(integrationWebhooks).where(and(...conditions));
  }

  async getWebhooksByEvent(eventType: string): Promise<IntegrationWebhook[]> {
    const all = await db.select().from(integrationWebhooks).where(eq(integrationWebhooks.active, true));
    return all.filter(w => w.eventTypes.includes(eventType));
  }

  async getWebhookDeliveries(webhookId?: number, params?: { limit?: number }): Promise<WebhookDelivery[]> {
    const limit = params?.limit || 50;
    if (webhookId) return db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, webhookId)).orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
    return db.select().from(webhookDeliveries).orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
  }

  async createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery> {
    const [row] = await db.insert(webhookDeliveries).values(data).returning();
    return row;
  }

  async updateWebhookDelivery(id: number, data: Partial<InsertWebhookDelivery>): Promise<void> {
    await db.update(webhookDeliveries).set(data).where(eq(webhookDeliveries.id, id));
  }

  async getEmailSubscriptions(userId?: number): Promise<EmailSubscription[]> {
    if (userId) return db.select().from(emailSubscriptions).where(eq(emailSubscriptions.userId, userId)).orderBy(desc(emailSubscriptions.createdAt));
    return db.select().from(emailSubscriptions).orderBy(desc(emailSubscriptions.createdAt));
  }

  async createEmailSubscription(data: InsertEmailSubscription): Promise<EmailSubscription> {
    const [row] = await db.insert(emailSubscriptions).values(data).returning();
    return row;
  }

  async updateEmailSubscription(id: number, data: Partial<InsertEmailSubscription>, userId?: number): Promise<EmailSubscription | undefined> {
    const conditions = [eq(emailSubscriptions.id, id)];
    if (userId) conditions.push(eq(emailSubscriptions.userId, userId));
    const [row] = await db.update(emailSubscriptions).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteEmailSubscription(id: number, userId?: number): Promise<void> {
    const conditions = [eq(emailSubscriptions.id, id)];
    if (userId) conditions.push(eq(emailSubscriptions.userId, userId));
    await db.delete(emailSubscriptions).where(and(...conditions));
  }

  async getIntegrationConfigs(clientId?: number): Promise<IntegrationConfig[]> {
    if (clientId) return db.select().from(integrationConfigs).where(eq(integrationConfigs.clientId, clientId)).orderBy(desc(integrationConfigs.createdAt));
    return db.select().from(integrationConfigs).orderBy(desc(integrationConfigs.createdAt));
  }

  async createIntegrationConfig(data: InsertIntegrationConfig): Promise<IntegrationConfig> {
    const [row] = await db.insert(integrationConfigs).values(data).returning();
    return row;
  }

  async updateIntegrationConfig(id: number, data: Partial<InsertIntegrationConfig>, clientId?: number): Promise<IntegrationConfig | undefined> {
    const conditions = [eq(integrationConfigs.id, id)];
    if (clientId) conditions.push(eq(integrationConfigs.clientId, clientId));
    const [row] = await db.update(integrationConfigs).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteIntegrationConfig(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(integrationConfigs.id, id)];
    if (clientId) conditions.push(eq(integrationConfigs.clientId, clientId));
    await db.delete(integrationConfigs).where(and(...conditions));
  }

  async getEmbedTokens(clientId?: number): Promise<EmbedToken[]> {
    if (clientId) return db.select().from(embedTokens).where(eq(embedTokens.clientId, clientId)).orderBy(desc(embedTokens.createdAt));
    return db.select().from(embedTokens).orderBy(desc(embedTokens.createdAt));
  }

  async getEmbedTokenByToken(token: string): Promise<EmbedToken | undefined> {
    const [row] = await db.select().from(embedTokens).where(eq(embedTokens.token, token));
    return row;
  }

  async createEmbedToken(data: InsertEmbedToken): Promise<EmbedToken> {
    const [row] = await db.insert(embedTokens).values(data).returning();
    return row;
  }

  async updateEmbedToken(id: number, data: Partial<InsertEmbedToken>): Promise<EmbedToken | undefined> {
    const [row] = await db.update(embedTokens).set(data).where(eq(embedTokens.id, id)).returning();
    return row;
  }

  async deleteEmbedToken(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(embedTokens.id, id)];
    if (clientId) conditions.push(eq(embedTokens.clientId, clientId));
    await db.delete(embedTokens).where(and(...conditions));
  }

  async getExportJobs(userId?: number): Promise<ExportJob[]> {
    if (userId) return db.select().from(exportJobs).where(eq(exportJobs.userId, userId)).orderBy(desc(exportJobs.createdAt));
    return db.select().from(exportJobs).orderBy(desc(exportJobs.createdAt));
  }

  async createExportJob(data: InsertExportJob): Promise<ExportJob> {
    const [row] = await db.insert(exportJobs).values(data).returning();
    return row;
  }

  async updateExportJob(id: number, data: Partial<ExportJob>): Promise<void> {
    await db.update(exportJobs).set(data).where(eq(exportJobs.id, id));
  }

  async getSsoConfigs(clientId?: number): Promise<SsoConfig[]> {
    if (clientId) return db.select().from(ssoConfigs).where(eq(ssoConfigs.clientId, clientId)).orderBy(desc(ssoConfigs.createdAt));
    return db.select().from(ssoConfigs).orderBy(desc(ssoConfigs.createdAt));
  }

  async createSsoConfig(data: InsertSsoConfig): Promise<SsoConfig> {
    const [row] = await db.insert(ssoConfigs).values(data).returning();
    return row;
  }

  async updateSsoConfig(id: number, data: Partial<InsertSsoConfig>, clientId?: number): Promise<SsoConfig | undefined> {
    const conditions = [eq(ssoConfigs.id, id)];
    if (clientId) conditions.push(eq(ssoConfigs.clientId, clientId));
    const [row] = await db.update(ssoConfigs).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteSsoConfig(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(ssoConfigs.id, id)];
    if (clientId) conditions.push(eq(ssoConfigs.clientId, clientId));
    await db.delete(ssoConfigs).where(and(...conditions));
  }

  async getImportConnectors(clientId?: number): Promise<ImportConnector[]> {
    if (clientId) return db.select().from(importConnectors).where(eq(importConnectors.clientId, clientId)).orderBy(desc(importConnectors.createdAt));
    return db.select().from(importConnectors).orderBy(desc(importConnectors.createdAt));
  }

  async createImportConnector(data: InsertImportConnector): Promise<ImportConnector> {
    const [row] = await db.insert(importConnectors).values(data).returning();
    return row;
  }

  async updateImportConnector(id: number, data: Partial<InsertImportConnector>, clientId?: number): Promise<ImportConnector | undefined> {
    const conditions = [eq(importConnectors.id, id)];
    if (clientId) conditions.push(eq(importConnectors.clientId, clientId));
    const [row] = await db.update(importConnectors).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteImportConnector(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(importConnectors.id, id)];
    if (clientId) conditions.push(eq(importConnectors.clientId, clientId));
    await db.delete(importConnectors).where(and(...conditions));
  }

  async getMobileNotificationPrefs(userId: number): Promise<MobileNotificationPref | undefined> {
    const [row] = await db.select().from(mobileNotificationPrefs).where(eq(mobileNotificationPrefs.userId, userId));
    return row;
  }

  async upsertMobileNotificationPrefs(data: InsertMobileNotificationPref): Promise<MobileNotificationPref> {
    const existing = await this.getMobileNotificationPrefs(data.userId);
    if (existing) {
      const [row] = await db.update(mobileNotificationPrefs).set(data).where(eq(mobileNotificationPrefs.userId, data.userId)).returning();
      return row;
    }
    const [row] = await db.insert(mobileNotificationPrefs).values(data).returning();
    return row;
  }

  async getWorkspaces(clientId?: number): Promise<Workspace[]> {
    if (clientId) return db.select().from(workspaces).where(eq(workspaces.clientId, clientId)).orderBy(desc(workspaces.createdAt));
    return db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
  }

  async getWorkspace(id: number): Promise<Workspace | undefined> {
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return row;
  }

  async createWorkspace(data: InsertWorkspace): Promise<Workspace> {
    const [row] = await db.insert(workspaces).values(data).returning();
    return row;
  }

  async updateWorkspace(id: number, data: Partial<InsertWorkspace>): Promise<Workspace | undefined> {
    const [row] = await db.update(workspaces).set(data).where(eq(workspaces.id, id)).returning();
    return row;
  }

  async deleteWorkspace(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(workspaces.id, id)];
    if (clientId) conditions.push(eq(workspaces.clientId, clientId));
    await db.delete(workspaces).where(and(...conditions));
  }

  async getWorkspaceMembers(workspaceId: number): Promise<WorkspaceMember[]> {
    return db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  }

  async addWorkspaceMember(data: InsertWorkspaceMember): Promise<WorkspaceMember> {
    const [row] = await db.insert(workspaceMembers).values(data).returning();
    return row;
  }

  async removeWorkspaceMember(workspaceId: number, userId: number): Promise<void> {
    await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  }

  async getComments(targetType: string, targetId: number, clientId?: number): Promise<Comment[]> {
    const conditions = [eq(comments.targetType, targetType), eq(comments.targetId, targetId)];
    if (clientId) conditions.push(eq(comments.clientId, clientId));
    return db.select().from(comments).where(and(...conditions)).orderBy(asc(comments.createdAt));
  }

  async getComment(id: number): Promise<Comment | undefined> {
    const [row] = await db.select().from(comments).where(eq(comments.id, id));
    return row;
  }

  async createComment(data: InsertComment): Promise<Comment> {
    const [row] = await db.insert(comments).values(data).returning();
    return row;
  }

  async deleteComment(id: number, userId?: number): Promise<void> {
    const conditions = [eq(comments.id, id)];
    if (userId) conditions.push(eq(comments.userId, userId));
    await db.delete(comments).where(and(...conditions));
  }

  async getAnnotations(targetType: string, targetId: number, clientId?: number): Promise<Annotation[]> {
    const conditions = [eq(annotations.targetType, targetType), eq(annotations.targetId, targetId)];
    if (clientId) conditions.push(eq(annotations.clientId, clientId));
    return db.select().from(annotations).where(and(...conditions)).orderBy(desc(annotations.createdAt));
  }

  async createAnnotation(data: InsertAnnotation): Promise<Annotation> {
    const [row] = await db.insert(annotations).values(data).returning();
    return row;
  }

  async deleteAnnotation(id: number, userId?: number): Promise<void> {
    const conditions = [eq(annotations.id, id)];
    if (userId) conditions.push(eq(annotations.userId, userId));
    await db.delete(annotations).where(and(...conditions));
  }

  async getSharedReports(params?: { clientId?: number; workspaceId?: number; createdBy?: number }): Promise<SharedReport[]> {
    const conditions = [];
    if (params?.clientId) conditions.push(eq(sharedReports.clientId, params.clientId));
    if (params?.workspaceId) conditions.push(eq(sharedReports.workspaceId, params.workspaceId));
    if (params?.createdBy) conditions.push(eq(sharedReports.createdBy, params.createdBy));
    if (conditions.length > 0) return db.select().from(sharedReports).where(and(...conditions)).orderBy(desc(sharedReports.createdAt));
    return db.select().from(sharedReports).orderBy(desc(sharedReports.createdAt));
  }

  async getSharedReport(id: number): Promise<SharedReport | undefined> {
    const [row] = await db.select().from(sharedReports).where(eq(sharedReports.id, id));
    return row;
  }

  async getSharedReportByToken(token: string): Promise<SharedReport | undefined> {
    const [row] = await db.select().from(sharedReports).where(eq(sharedReports.shareToken, token));
    return row;
  }

  async createSharedReport(data: InsertSharedReport): Promise<SharedReport> {
    const [row] = await db.insert(sharedReports).values(data).returning();
    return row;
  }

  async updateSharedReport(id: number, data: Partial<InsertSharedReport>, clientId?: number): Promise<SharedReport | undefined> {
    const conditions = [eq(sharedReports.id, id)];
    if (clientId) conditions.push(eq(sharedReports.clientId, clientId));
    const [row] = await db.update(sharedReports).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteSharedReport(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(sharedReports.id, id)];
    if (clientId) conditions.push(eq(sharedReports.clientId, clientId));
    await db.delete(sharedReports).where(and(...conditions));
  }

  async getBriefingItems(reportId: number): Promise<BriefingItem[]> {
    return db.select().from(briefingItems).where(eq(briefingItems.reportId, reportId)).orderBy(asc(briefingItems.position));
  }

  async createBriefingItem(data: InsertBriefingItem): Promise<BriefingItem> {
    const [row] = await db.insert(briefingItems).values(data).returning();
    return row;
  }

  async deleteBriefingItem(id: number, clientId?: number): Promise<void> {
    if (clientId) {
      const [item] = await db.select().from(briefingItems).where(eq(briefingItems.id, id));
      if (item) {
        const report = await this.getSharedReport(item.reportId);
        if (!report || report.clientId !== clientId) return;
      }
    }
    await db.delete(briefingItems).where(eq(briefingItems.id, id));
  }

  async getCustomTags(params?: { clientId?: number; workspaceId?: number }): Promise<CustomTag[]> {
    const conditions = [];
    if (params?.clientId) conditions.push(eq(customTags.clientId, params.clientId));
    if (params?.workspaceId) conditions.push(eq(customTags.workspaceId, params.workspaceId));
    if (conditions.length > 0) return db.select().from(customTags).where(and(...conditions)).orderBy(desc(customTags.createdAt));
    return db.select().from(customTags).orderBy(desc(customTags.createdAt));
  }

  async createCustomTag(data: InsertCustomTag): Promise<CustomTag> {
    const [row] = await db.insert(customTags).values(data).returning();
    return row;
  }

  async deleteCustomTag(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(customTags.id, id)];
    if (clientId) conditions.push(eq(customTags.clientId, clientId));
    await db.delete(customTags).where(and(...conditions));
  }

  async getTagAssignments(targetType: string, targetId: number): Promise<TagAssignment[]> {
    return db.select().from(tagAssignments).where(and(eq(tagAssignments.targetType, targetType), eq(tagAssignments.targetId, targetId)));
  }

  async createTagAssignment(data: InsertTagAssignment): Promise<TagAssignment> {
    const [row] = await db.insert(tagAssignments).values(data).returning();
    return row;
  }

  async deleteTagAssignment(id: number, userId?: number): Promise<void> {
    const conditions = [eq(tagAssignments.id, id)];
    if (userId) conditions.push(eq(tagAssignments.createdBy, userId));
    await db.delete(tagAssignments).where(and(...conditions));
  }

  async getTasks(params?: { workspaceId?: number; assignedTo?: number; createdBy?: number; status?: string }, clientId?: number): Promise<Task[]> {
    const conditions = [];
    if (clientId) conditions.push(eq(tasks.clientId, clientId));
    if (params?.workspaceId) conditions.push(eq(tasks.workspaceId, params.workspaceId));
    if (params?.assignedTo) conditions.push(eq(tasks.assignedTo, params.assignedTo));
    if (params?.createdBy) conditions.push(eq(tasks.createdBy, params.createdBy));
    if (params?.status) conditions.push(eq(tasks.status, params.status));
    if (conditions.length > 0) return db.select().from(tasks).where(and(...conditions)).orderBy(desc(tasks.createdAt));
    return db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
    return row;
  }

  async createTask(data: InsertTask): Promise<Task> {
    const [row] = await db.insert(tasks).values(data).returning();
    return row;
  }

  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined> {
    const [row] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return row;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async getWatchlists(userId: number): Promise<Watchlist[]> {
    return db.select().from(watchlists).where(eq(watchlists.userId, userId)).orderBy(desc(watchlists.createdAt));
  }

  async createWatchlist(data: InsertWatchlist): Promise<Watchlist> {
    const [row] = await db.insert(watchlists).values(data).returning();
    return row;
  }

  async deleteWatchlist(id: number, userId?: number): Promise<void> {
    const conditions = [eq(watchlists.id, id)];
    if (userId) conditions.push(eq(watchlists.userId, userId));
    await db.delete(watchlists).where(and(...conditions));
  }

  async getInternalAlerts(receiverId: number): Promise<InternalAlert[]> {
    return db.select().from(internalAlerts).where(eq(internalAlerts.receiverId, receiverId)).orderBy(desc(internalAlerts.createdAt));
  }

  async createInternalAlert(data: InsertInternalAlert): Promise<InternalAlert> {
    const [row] = await db.insert(internalAlerts).values(data).returning();
    return row;
  }

  async markAlertRead(id: number, userId?: number): Promise<void> {
    const conditions = [eq(internalAlerts.id, id)];
    if (userId) conditions.push(eq(internalAlerts.receiverId, userId));
    await db.update(internalAlerts).set({ read: true }).where(and(...conditions));
  }

  async getChangeHistory(entityType: string, entityId: number, clientId?: number): Promise<ChangeHistoryEntry[]> {
    const conditions = [eq(changeHistory.entityType, entityType), eq(changeHistory.entityId, entityId)];
    if (clientId) conditions.push(eq(changeHistory.clientId, clientId));
    return db.select().from(changeHistory).where(and(...conditions)).orderBy(desc(changeHistory.createdAt));
  }

  async createChangeHistory(data: InsertChangeHistory): Promise<ChangeHistoryEntry> {
    const [row] = await db.insert(changeHistory).values(data).returning();
    return row;
  }

  async getActivityFeed(params?: { workspaceId?: number; limit?: number }, clientId?: number): Promise<ActivityEvent[]> {
    const limit = params?.limit || 50;
    const conditions = [];
    if (clientId) conditions.push(eq(activityEvents.clientId, clientId));
    if (params?.workspaceId) conditions.push(eq(activityEvents.workspaceId, params.workspaceId));
    if (conditions.length > 0) {
      return db.select().from(activityEvents).where(and(...conditions)).orderBy(desc(activityEvents.createdAt)).limit(limit);
    }
    return db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(limit);
  }

  async createActivityEvent(data: InsertActivityEvent): Promise<ActivityEvent> {
    const [row] = await db.insert(activityEvents).values(data).returning();
    return row;
  }

  // === KNOWLEDGE MEMORY - Story Timelines ===
  async getStoryTimelines(clientId?: number): Promise<StoryTimeline[]> {
    if (clientId) return db.select().from(storyTimelines).where(eq(storyTimelines.clientId, clientId)).orderBy(desc(storyTimelines.lastSeen));
    return db.select().from(storyTimelines).orderBy(desc(storyTimelines.lastSeen));
  }

  async getStoryTimeline(id: number, clientId?: number): Promise<StoryTimeline | undefined> {
    const conditions = [eq(storyTimelines.id, id)];
    if (clientId) conditions.push(eq(storyTimelines.clientId, clientId));
    const [row] = await db.select().from(storyTimelines).where(and(...conditions));
    return row;
  }

  async createStoryTimeline(data: InsertStoryTimeline): Promise<StoryTimeline> {
    const [row] = await db.insert(storyTimelines).values(data).returning();
    return row;
  }

  async updateStoryTimeline(id: number, data: Partial<InsertStoryTimeline>, clientId?: number): Promise<StoryTimeline | undefined> {
    const conditions = [eq(storyTimelines.id, id)];
    if (clientId) conditions.push(eq(storyTimelines.clientId, clientId));
    const [row] = await db.update(storyTimelines).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteStoryTimeline(id: number, clientId?: number): Promise<void> {
    if (clientId) {
      const timeline = await this.getStoryTimeline(id);
      if (!timeline || timeline.clientId !== clientId) return;
    }
    await db.delete(timelineEvents).where(eq(timelineEvents.timelineId, id));
    const conditions = [eq(storyTimelines.id, id)];
    if (clientId) conditions.push(eq(storyTimelines.clientId, clientId));
    await db.delete(storyTimelines).where(and(...conditions));
  }

  // === KNOWLEDGE MEMORY - Timeline Events ===
  async getTimelineEvents(timelineId: number): Promise<TimelineEvent[]> {
    return db.select().from(timelineEvents).where(eq(timelineEvents.timelineId, timelineId)).orderBy(desc(timelineEvents.eventDate));
  }

  async createTimelineEvent(data: InsertTimelineEvent): Promise<TimelineEvent> {
    const [row] = await db.insert(timelineEvents).values(data).returning();
    return row;
  }

  async getTimelineEvent(id: number): Promise<TimelineEvent | undefined> {
    const [row] = await db.select().from(timelineEvents).where(eq(timelineEvents.id, id));
    return row;
  }

  async deleteTimelineEvent(id: number): Promise<void> {
    await db.delete(timelineEvents).where(eq(timelineEvents.id, id));
  }

  // === KNOWLEDGE MEMORY - Recurring Patterns ===
  async getRecurringPatterns(clientId?: number): Promise<RecurringPattern[]> {
    if (clientId) return db.select().from(recurringPatterns).where(eq(recurringPatterns.clientId, clientId)).orderBy(desc(recurringPatterns.createdAt));
    return db.select().from(recurringPatterns).orderBy(desc(recurringPatterns.createdAt));
  }

  async createRecurringPattern(data: InsertRecurringPattern): Promise<RecurringPattern> {
    const [row] = await db.insert(recurringPatterns).values(data).returning();
    return row;
  }

  async updateRecurringPattern(id: number, data: Partial<InsertRecurringPattern>, clientId?: number): Promise<RecurringPattern | undefined> {
    const conditions = [eq(recurringPatterns.id, id)];
    if (clientId) conditions.push(eq(recurringPatterns.clientId, clientId));
    const [row] = await db.update(recurringPatterns).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteRecurringPattern(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(recurringPatterns.id, id)];
    if (clientId) conditions.push(eq(recurringPatterns.clientId, clientId));
    await db.delete(recurringPatterns).where(and(...conditions));
  }

  // === KNOWLEDGE MEMORY - Entity Memory ===
  async getEntityMemories(clientId?: number): Promise<EntityMemory[]> {
    if (clientId) return db.select().from(entityMemory).where(eq(entityMemory.clientId, clientId)).orderBy(desc(entityMemory.updatedAt));
    return db.select().from(entityMemory).orderBy(desc(entityMemory.updatedAt));
  }

  async getEntityMemoryByName(name: string, clientId?: number): Promise<EntityMemory | undefined> {
    const conditions = [eq(entityMemory.entityName, name)];
    if (clientId) conditions.push(eq(entityMemory.clientId, clientId));
    const [row] = await db.select().from(entityMemory).where(and(...conditions));
    return row;
  }

  async createEntityMemory(data: InsertEntityMemory): Promise<EntityMemory> {
    const [row] = await db.insert(entityMemory).values(data).returning();
    return row;
  }

  async updateEntityMemory(id: number, data: Partial<InsertEntityMemory>, clientId?: number): Promise<EntityMemory | undefined> {
    const conditions = [eq(entityMemory.id, id)];
    if (clientId) conditions.push(eq(entityMemory.clientId, clientId));
    const [row] = await db.update(entityMemory).set({ ...data, updatedAt: new Date() }).where(and(...conditions)).returning();
    return row;
  }

  async deleteEntityMemory(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(entityMemory.id, id)];
    if (clientId) conditions.push(eq(entityMemory.clientId, clientId));
    await db.delete(entityMemory).where(and(...conditions));
  }

  // === KNOWLEDGE MEMORY - Narrative Shifts ===
  async getNarrativeShifts(params?: { topic?: string; clientId?: number }): Promise<NarrativeShift[]> {
    const conditions = [];
    if (params?.topic) conditions.push(eq(narrativeShifts.topic, params.topic));
    if (params?.clientId) conditions.push(eq(narrativeShifts.clientId, params.clientId));
    if (conditions.length > 0) return db.select().from(narrativeShifts).where(and(...conditions)).orderBy(desc(narrativeShifts.createdAt));
    return db.select().from(narrativeShifts).orderBy(desc(narrativeShifts.createdAt));
  }

  async createNarrativeShift(data: InsertNarrativeShift): Promise<NarrativeShift> {
    const [row] = await db.insert(narrativeShifts).values(data).returning();
    return row;
  }

  async deleteNarrativeShift(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(narrativeShifts.id, id)];
    if (clientId) conditions.push(eq(narrativeShifts.clientId, clientId));
    await db.delete(narrativeShifts).where(and(...conditions));
  }

  // === KNOWLEDGE MEMORY - Institutional Notes ===
  async getInstitutionalNotes(clientId?: number, topic?: string): Promise<InstitutionalNote[]> {
    const conditions = [];
    if (clientId) conditions.push(eq(institutionalNotes.clientId, clientId));
    if (topic) conditions.push(eq(institutionalNotes.relatedTopic, topic));
    if (conditions.length > 0) return db.select().from(institutionalNotes).where(and(...conditions)).orderBy(desc(institutionalNotes.createdAt));
    return db.select().from(institutionalNotes).orderBy(desc(institutionalNotes.createdAt));
  }

  async createInstitutionalNote(data: InsertInstitutionalNote): Promise<InstitutionalNote> {
    const [row] = await db.insert(institutionalNotes).values(data).returning();
    return row;
  }

  async deleteInstitutionalNote(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(institutionalNotes.id, id)];
    if (clientId) conditions.push(eq(institutionalNotes.clientId, clientId));
    await db.delete(institutionalNotes).where(and(...conditions));
  }

  // === KNOWLEDGE MEMORY - Historical Matches ===
  async getHistoricalMatches(clientId?: number): Promise<HistoricalMatch[]> {
    if (clientId) return db.select().from(historicalMatches).where(eq(historicalMatches.clientId, clientId)).orderBy(desc(historicalMatches.createdAt));
    return db.select().from(historicalMatches).orderBy(desc(historicalMatches.createdAt));
  }

  async createHistoricalMatch(data: InsertHistoricalMatch): Promise<HistoricalMatch> {
    const [row] = await db.insert(historicalMatches).values(data).returning();
    return row;
  }

  async acknowledgeHistoricalMatch(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(historicalMatches.id, id)];
    if (clientId) conditions.push(eq(historicalMatches.clientId, clientId));
    await db.update(historicalMatches).set({ acknowledged: true }).where(and(...conditions));
  }

  // === KNOWLEDGE MEMORY - Trend Lifecycles ===
  async getTrendLifecycles(clientId?: number): Promise<TrendLifecycle[]> {
    if (clientId) return db.select().from(trendLifecycles).where(eq(trendLifecycles.clientId, clientId)).orderBy(desc(trendLifecycles.updatedAt));
    return db.select().from(trendLifecycles).orderBy(desc(trendLifecycles.updatedAt));
  }

  async createTrendLifecycle(data: InsertTrendLifecycle): Promise<TrendLifecycle> {
    const [row] = await db.insert(trendLifecycles).values(data).returning();
    return row;
  }

  async updateTrendLifecycle(id: number, data: Partial<InsertTrendLifecycle>, clientId?: number): Promise<TrendLifecycle | undefined> {
    const conditions = [eq(trendLifecycles.id, id)];
    if (clientId) conditions.push(eq(trendLifecycles.clientId, clientId));
    const [row] = await db.update(trendLifecycles).set({ ...data, updatedAt: new Date() }).where(and(...conditions)).returning();
    return row;
  }

  async deleteTrendLifecycle(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(trendLifecycles.id, id)];
    if (clientId) conditions.push(eq(trendLifecycles.clientId, clientId));
    await db.delete(trendLifecycles).where(and(...conditions));
  }

  // === KNOWLEDGE MEMORY - Long-Range Briefings ===
  async getLongRangeBriefings(clientId?: number, periodType?: string): Promise<LongRangeBriefing[]> {
    const conditions = [];
    if (clientId) conditions.push(eq(longRangeBriefings.clientId, clientId));
    if (periodType) conditions.push(eq(longRangeBriefings.periodType, periodType));
    if (conditions.length > 0) return db.select().from(longRangeBriefings).where(and(...conditions)).orderBy(desc(longRangeBriefings.createdAt));
    return db.select().from(longRangeBriefings).orderBy(desc(longRangeBriefings.createdAt));
  }

  async createLongRangeBriefing(data: InsertLongRangeBriefing): Promise<LongRangeBriefing> {
    const [row] = await db.insert(longRangeBriefings).values(data).returning();
    return row;
  }

  async deleteLongRangeBriefing(id: number, clientId?: number): Promise<void> {
    const conditions = [eq(longRangeBriefings.id, id)];
    if (clientId) conditions.push(eq(longRangeBriefings.clientId, clientId));
    await db.delete(longRangeBriefings).where(and(...conditions));
  }

  // === KNOWLEDGE MEMORY - AI Memory Answers ===
  async getAiMemoryAnswers(clientId?: number, limit?: number): Promise<AiMemoryAnswer[]> {
    const lim = limit || 50;
    if (clientId) return db.select().from(aiMemoryAnswers).where(eq(aiMemoryAnswers.clientId, clientId)).orderBy(desc(aiMemoryAnswers.createdAt)).limit(lim);
    return db.select().from(aiMemoryAnswers).orderBy(desc(aiMemoryAnswers.createdAt)).limit(lim);
  }

  async createAiMemoryAnswer(data: InsertAiMemoryAnswer): Promise<AiMemoryAnswer> {
    const [row] = await db.insert(aiMemoryAnswers).values(data).returning();
    return row;
  }

  // === PREDICTIVE INTELLIGENCE - Topic Forecasts ===
  async getTopicForecasts(clientId?: number): Promise<TopicForecast[]> {
    if (clientId) return db.select().from(topicForecasts).where(eq(topicForecasts.clientId, clientId)).orderBy(desc(topicForecasts.createdAt));
    return db.select().from(topicForecasts).orderBy(desc(topicForecasts.createdAt));
  }

  async createTopicForecast(data: InsertTopicForecast): Promise<TopicForecast> {
    const [row] = await db.insert(topicForecasts).values(data).returning();
    return row;
  }

  async deleteTopicForecast(id: number): Promise<void> {
    await db.delete(topicForecasts).where(eq(topicForecasts.id, id));
  }

  // === PREDICTIVE INTELLIGENCE - Early Signals ===
  async getEarlySignals(clientId?: number): Promise<EarlySignal[]> {
    if (clientId) return db.select().from(earlySignals).where(eq(earlySignals.clientId, clientId)).orderBy(desc(earlySignals.detectedAt));
    return db.select().from(earlySignals).orderBy(desc(earlySignals.detectedAt));
  }

  async createEarlySignal(data: InsertEarlySignal): Promise<EarlySignal> {
    const [row] = await db.insert(earlySignals).values(data).returning();
    return row;
  }

  async deleteEarlySignal(id: number): Promise<void> {
    await db.delete(earlySignals).where(eq(earlySignals.id, id));
  }

  // === PREDICTIVE INTELLIGENCE - Risk Scores ===
  async getRiskScores(clientId?: number): Promise<RiskScore[]> {
    if (clientId) return db.select().from(riskScores).where(eq(riskScores.clientId, clientId)).orderBy(desc(riskScores.createdAt));
    return db.select().from(riskScores).orderBy(desc(riskScores.createdAt));
  }

  async createRiskScore(data: InsertRiskScore): Promise<RiskScore> {
    const [row] = await db.insert(riskScores).values(data).returning();
    return row;
  }

  async updateRiskScore(id: number, data: Partial<InsertRiskScore>): Promise<RiskScore> {
    const [row] = await db.update(riskScores).set(data).where(eq(riskScores.id, id)).returning();
    return row;
  }

  async deleteRiskScore(id: number): Promise<void> {
    await db.delete(riskScores).where(eq(riskScores.id, id));
  }

  // === PREDICTIVE INTELLIGENCE - Influence Graph ===
  async getInfluenceGraph(clientId?: number): Promise<InfluenceGraphEntry[]> {
    if (clientId) return db.select().from(influenceGraph).where(eq(influenceGraph.clientId, clientId)).orderBy(desc(influenceGraph.createdAt));
    return db.select().from(influenceGraph).orderBy(desc(influenceGraph.createdAt));
  }

  async createInfluenceGraphEntry(data: InsertInfluenceGraphEntry): Promise<InfluenceGraphEntry> {
    const [row] = await db.insert(influenceGraph).values(data).returning();
    return row;
  }

  async deleteInfluenceGraphEntry(id: number): Promise<void> {
    await db.delete(influenceGraph).where(eq(influenceGraph.id, id));
  }

  // === PREDICTIVE INTELLIGENCE - Attention Decay ===
  async getAttentionDecay(clientId?: number): Promise<AttentionDecayEntry[]> {
    if (clientId) return db.select().from(attentionDecay).where(eq(attentionDecay.clientId, clientId)).orderBy(desc(attentionDecay.createdAt));
    return db.select().from(attentionDecay).orderBy(desc(attentionDecay.createdAt));
  }

  async createAttentionDecay(data: InsertAttentionDecayEntry): Promise<AttentionDecayEntry> {
    const [row] = await db.insert(attentionDecay).values(data).returning();
    return row;
  }

  async deleteAttentionDecay(id: number): Promise<void> {
    await db.delete(attentionDecay).where(eq(attentionDecay.id, id));
  }

  // === PREDICTIVE INTELLIGENCE - Alert Priority Scores ===
  async getAlertPriorityScores(clientId?: number): Promise<AlertPriorityScore[]> {
    if (clientId) return db.select().from(alertPriorityScores).where(eq(alertPriorityScores.clientId, clientId)).orderBy(desc(alertPriorityScores.createdAt));
    return db.select().from(alertPriorityScores).orderBy(desc(alertPriorityScores.createdAt));
  }

  async createAlertPriorityScore(data: InsertAlertPriorityScore): Promise<AlertPriorityScore> {
    const [row] = await db.insert(alertPriorityScores).values(data).returning();
    return row;
  }

  // === PREDICTIVE INTELLIGENCE - Forecast Results ===
  async getForecastResults(clientId?: number): Promise<ForecastResult[]> {
    if (clientId) return db.select().from(forecastResults).where(eq(forecastResults.clientId, clientId)).orderBy(desc(forecastResults.evaluatedAt));
    return db.select().from(forecastResults).orderBy(desc(forecastResults.evaluatedAt));
  }

  async createForecastResult(data: InsertForecastResult): Promise<ForecastResult> {
    const [row] = await db.insert(forecastResults).values(data).returning();
    return row;
  }

  // === PREDICTIVE INTELLIGENCE - Future Briefings ===
  async getFutureBriefings(clientId?: number, limit?: number): Promise<FutureBriefing[]> {
    const lim = limit || 30;
    if (clientId) return db.select().from(futureBriefings).where(eq(futureBriefings.clientId, clientId)).orderBy(desc(futureBriefings.createdAt)).limit(lim);
    return db.select().from(futureBriefings).orderBy(desc(futureBriefings.createdAt)).limit(lim);
  }

  async createFutureBriefing(data: InsertFutureBriefing): Promise<FutureBriefing> {
    const [row] = await db.insert(futureBriefings).values(data).returning();
    return row;
  }

  async deleteFutureBriefing(id: number): Promise<void> {
    await db.delete(futureBriefings).where(eq(futureBriefings.id, id));
  }

  async getDistinctClientIds(): Promise<number[]> {
    const rows = await db.selectDistinct({ clientId: articles.clientId })
      .from(articles);
    return rows.map(r => r.clientId).filter((id): id is number => id !== null && id !== undefined);
  }

  async getArticleTranslation(articleId: number, targetLanguage: string, clientId?: number): Promise<ArticleTranslation | undefined> {
    const conditions = [
      eq(articleTranslations.articleId, articleId),
      eq(articleTranslations.targetLanguage, targetLanguage),
    ];
    if (clientId) conditions.push(eq(articleTranslations.clientId, clientId));
    const [row] = await db.select().from(articleTranslations).where(and(...conditions));
    return row;
  }

  async createArticleTranslation(data: InsertArticleTranslation): Promise<ArticleTranslation> {
    const [row] = await db.insert(articleTranslations).values(data).returning();
    return row;
  }

  async updateArticleTranslation(id: number, data: Partial<InsertArticleTranslation>, clientId?: number): Promise<ArticleTranslation | undefined> {
    const conditions = [eq(articleTranslations.id, id)];
    if (clientId) conditions.push(eq(articleTranslations.clientId, clientId));
    const [row] = await db.update(articleTranslations).set(data).where(and(...conditions)).returning();
    return row;
  }

  // === ENTERPRISE ACCESS CONTROL ===

  // Permission Groups
  async getPermissionGroups(): Promise<PermissionGroup[]> {
    return db.select().from(permissionGroups).orderBy(asc(permissionGroups.name));
  }

  async getPermissionGroup(id: number): Promise<PermissionGroup | undefined> {
    const [row] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, id));
    return row;
  }

  async getPermissionGroupByName(name: string): Promise<PermissionGroup | undefined> {
    const [row] = await db.select().from(permissionGroups).where(eq(permissionGroups.name, name));
    return row;
  }

  async createPermissionGroup(data: InsertPermissionGroup): Promise<PermissionGroup> {
    const [row] = await db.insert(permissionGroups).values(data).returning();
    return row;
  }

  async deletePermissionGroup(id: number): Promise<void> {
    await db.delete(permissionGroups).where(eq(permissionGroups.id, id));
  }

  // Permissions
  async getPermissions(): Promise<Permission[]> {
    return db.select().from(permissions).orderBy(asc(permissions.code));
  }

  async getPermissionByCode(code: string): Promise<Permission | undefined> {
    const [row] = await db.select().from(permissions).where(eq(permissions.code, code));
    return row;
  }

  async createPermission(data: InsertPermission): Promise<Permission> {
    const [row] = await db.insert(permissions).values(data).returning();
    return row;
  }

  // Group-Permission Mapping
  async getGroupPermissions(groupId: number): Promise<Permission[]> {
    const rows = await db.select({ permission: permissions })
      .from(groupPermissions)
      .innerJoin(permissions, eq(groupPermissions.permissionId, permissions.id))
      .where(eq(groupPermissions.groupId, groupId));
    return rows.map(r => r.permission);
  }

  async addPermissionToGroup(groupId: number, permissionId: number): Promise<GroupPermission> {
    const [row] = await db.insert(groupPermissions)
      .values({ groupId, permissionId })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async removePermissionFromGroup(groupId: number, permissionId: number): Promise<void> {
    await db.delete(groupPermissions).where(
      and(eq(groupPermissions.groupId, groupId), eq(groupPermissions.permissionId, permissionId))
    );
  }

  // User-Permission Group Mapping
  async getUserPermissionGroups(userId: number): Promise<(UserPermissionGroup & { groupName: string })[]> {
    const rows = await db.select({
      id: userPermissionGroups.id,
      userId: userPermissionGroups.userId,
      groupId: userPermissionGroups.groupId,
      createdAt: userPermissionGroups.createdAt,
      groupName: permissionGroups.name,
    })
    .from(userPermissionGroups)
    .innerJoin(permissionGroups, eq(userPermissionGroups.groupId, permissionGroups.id))
    .where(eq(userPermissionGroups.userId, userId));
    return rows;
  }

  async assignUserToGroup(userId: number, groupId: number): Promise<UserPermissionGroup> {
    const [row] = await db.insert(userPermissionGroups)
      .values({ userId, groupId })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async removeUserFromGroup(userId: number, groupId: number): Promise<void> {
    await db.delete(userPermissionGroups).where(
      and(eq(userPermissionGroups.userId, userId), eq(userPermissionGroups.groupId, groupId))
    );
  }

  // User Direct Permissions
  async getUserDirectPermissions(userId: number): Promise<(UserPermission & { code: string })[]> {
    const rows = await db.select({
      id: userPermissions.id,
      userId: userPermissions.userId,
      permissionId: userPermissions.permissionId,
      granted: userPermissions.granted,
      createdAt: userPermissions.createdAt,
      code: permissions.code,
    })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.userId, userId));
    return rows;
  }

  async assignDirectPermission(userId: number, permissionId: number, granted: boolean): Promise<UserPermission> {
    const [row] = await db.insert(userPermissions)
      .values({ userId, permissionId, granted })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async removeDirectPermission(userId: number, permissionId: number): Promise<void> {
    await db.delete(userPermissions).where(
      and(eq(userPermissions.userId, userId), eq(userPermissions.permissionId, permissionId))
    );
  }

  // Resolved Permissions (from groups + direct permissions)
  async getEffectivePermissions(userId: number): Promise<string[]> {
    const groupPerms = await db.select({ code: permissions.code })
      .from(userPermissionGroups)
      .innerJoin(groupPermissions, eq(userPermissionGroups.groupId, groupPermissions.groupId))
      .innerJoin(permissions, eq(groupPermissions.permissionId, permissions.id))
      .where(eq(userPermissionGroups.userId, userId));

    const directPerms = await db.select({
      code: permissions.code,
      granted: userPermissions.granted,
    })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.userId, userId));

    const permSet = new Set<string>(groupPerms.map(r => r.code));

    for (const dp of directPerms) {
      if (dp.granted) {
        permSet.add(dp.code);
      } else {
        permSet.delete(dp.code);
      }
    }

    return Array.from(permSet);
  }

  // Impersonation Logs
  async createImpersonationLog(data: InsertImpersonationLog): Promise<ImpersonationLog> {
    const [row] = await db.insert(impersonationLogs).values(data).returning();
    return row;
  }

  async getImpersonationLogs(params?: { adminUserId?: number; limit?: number }): Promise<ImpersonationLog[]> {
    const conditions: any[] = [];
    if (params?.adminUserId) {
      conditions.push(eq(impersonationLogs.adminUserId, params.adminUserId));
    }
    const query = db.select().from(impersonationLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(impersonationLogs.createdAt))
      .limit(params?.limit || 50);
    return query;
  }

  async seedDefaultPermissions(): Promise<void> {
    const { PERMISSION_CODES, DEFAULT_PERMISSION_GROUPS } = await import("@shared/schema");

    const allCodes = Object.values(PERMISSION_CODES);
    for (const code of allCodes) {
      const existing = await db.select().from(permissions).where(eq(permissions.code, code)).limit(1);
      if (existing.length === 0) {
        const parts = code.split(":");
        const resource = parts[0] || "general";
        const action = parts[1] || "access";
        const scope = parts[2] || "org";
        await db.insert(permissions).values({
          code,
          resource,
          action,
          scope,
          description: `Permission: ${code}`,
        });
      }
    }

    const groupDefs: Record<string, { name: string; description: string; isSystem: boolean; codes: string[] }> = {
      [DEFAULT_PERMISSION_GROUPS.PLATFORM_ADMIN]: {
        name: "Platform Admin",
        description: "Full platform access - all permissions",
        isSystem: true,
        codes: allCodes,
      },
      [DEFAULT_PERMISSION_GROUPS.ORG_ADMIN]: {
        name: "Organization Admin",
        description: "Full organization management access",
        isSystem: true,
        codes: allCodes.filter((c: string) => !c.startsWith("billing:") || c === PERMISSION_CODES.BILLING_VIEW),
      },
      [DEFAULT_PERMISSION_GROUPS.ANALYST]: {
        name: "Analyst",
        description: "Content analysis and reporting access",
        isSystem: true,
        codes: [
          PERMISSION_CODES.ARTICLES_READ, PERMISSION_CODES.ARTICLES_MANAGE,
          PERMISSION_CODES.SOURCES_READ,
          PERMISSION_CODES.ANALYTICS_VIEW, PERMISSION_CODES.ANALYTICS_EXPORT,
          PERMISSION_CODES.REPORTS_VIEW, PERMISSION_CODES.REPORTS_EXPORT,
          PERMISSION_CODES.AI_VIEW,
          PERMISSION_CODES.INTELLIGENCE_VIEW,
          PERMISSION_CODES.COLLABORATION_VIEW, PERMISSION_CODES.COLLABORATION_CONTRIBUTE,
        ],
      },
      [DEFAULT_PERMISSION_GROUPS.VIEWER]: {
        name: "Viewer",
        description: "Read-only access to articles and analytics",
        isSystem: true,
        codes: [
          PERMISSION_CODES.ARTICLES_READ,
          PERMISSION_CODES.SOURCES_READ,
          PERMISSION_CODES.ANALYTICS_VIEW,
          PERMISSION_CODES.REPORTS_VIEW,
          PERMISSION_CODES.AI_VIEW,
          PERMISSION_CODES.INTELLIGENCE_VIEW,
          PERMISSION_CODES.COLLABORATION_VIEW,
        ],
      },
    };

    for (const [_slug, def] of Object.entries(groupDefs)) {
      let group = await db.select().from(permissionGroups).where(eq(permissionGroups.name, def.name)).limit(1);
      let groupId: number;
      if (group.length === 0) {
        const [created] = await db.insert(permissionGroups).values({
          name: def.name,
          description: def.description,
          isSystem: def.isSystem,
        }).returning();
        groupId = created.id;
      } else {
        groupId = group[0].id;
      }

      for (const code of def.codes) {
        const perm = await db.select().from(permissions).where(eq(permissions.code, code)).limit(1);
        if (perm.length > 0) {
          const existing = await db.select().from(groupPermissions)
            .where(and(eq(groupPermissions.groupId, groupId), eq(groupPermissions.permissionId, perm[0].id)))
            .limit(1);
          if (existing.length === 0) {
            await db.insert(groupPermissions).values({
              groupId,
              permissionId: perm[0].id,
            });
          }
        }
      }
    }

    console.log("[Seed] Default permission groups and permissions seeded successfully");

    const systemClients = [
      { id: 9000, name: "SYSTEM", organizationType: "platform" },
      { id: 9001, name: "DEMO", organizationType: "demo" },
    ];
    for (const sc of systemClients) {
      const existing = await db.select().from(clients).where(eq(clients.id, sc.id)).limit(1);
      if (existing.length === 0) {
        await db.execute(sql`INSERT INTO clients (id, name, organization_type, active) VALUES (${sc.id}, ${sc.name}, ${sc.organizationType}, true)`);
      }
    }
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('clients', 'id'), GREATEST((SELECT MAX(id) FROM clients), 9001))`);
    console.log("[Seed] SYSTEM and DEMO clients ensured");
  }

  // Insight Jobs (AI Cost Control)
  async createInsightJob(data: InsertInsightJob): Promise<InsightJob> {
    const [job] = await db.insert(insightJobs).values(data).returning();
    return job;
  }

  async getInsightJob(id: number): Promise<InsightJob | undefined> {
    const [job] = await db.select().from(insightJobs).where(eq(insightJobs.id, id));
    return job;
  }

  async updateInsightJobStatus(id: number, status: string, extra?: Partial<InsightJob>): Promise<InsightJob | undefined> {
    const updates: any = { status, ...extra };
    const [job] = await db.update(insightJobs).set(updates).where(eq(insightJobs.id, id)).returning();
    return job;
  }

  async updateInsightJobIfStatus(id: number, fromStatus: string, toStatus: string, extra?: Partial<InsightJob>): Promise<InsightJob | undefined> {
    if (fromStatus === toStatus) return undefined;
    const updates: any = { status: toStatus, ...extra };
    const [job] = await db.update(insightJobs).set(updates).where(and(eq(insightJobs.id, id), eq(insightJobs.status, fromStatus))).returning();
    return job;
  }

  async getQueuedJobsByTenant(clientId: number, limit: number): Promise<InsightJob[]> {
    return db.select().from(insightJobs)
      .where(and(eq(insightJobs.clientId, clientId), eq(insightJobs.status, "queued")))
      .orderBy(insightJobs.createdAt)
      .limit(limit);
  }

  async getScheduledJobs(limit: number): Promise<InsightJob[]> {
    return db.select().from(insightJobs)
      .where(eq(insightJobs.status, "scheduled"))
      .orderBy(insightJobs.createdAt)
      .limit(limit);
  }

  async bulkUpdateJobStatus(fromStatus: string, toStatus: string, clientId?: number): Promise<number> {
    const conditions = [eq(insightJobs.status, fromStatus)];
    if (clientId !== undefined) conditions.push(eq(insightJobs.clientId, clientId));
    const result = await db.update(insightJobs).set({ status: toStatus }).where(and(...conditions));
    return result.rowCount ?? 0;
  }

  async expireOldQueuedJobs(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await db.update(insightJobs)
      .set({ status: "expired", completedAt: new Date() })
      .where(and(eq(insightJobs.status, "queued"), lte(insightJobs.createdAt, cutoff)));
    return result.rowCount ?? 0;
  }

  async recoverZombieRunningJobs(): Promise<number> {
    const result = await db.update(insightJobs)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(insightJobs.status, "running"));
    return result.rowCount ?? 0;
  }

  async getJobCountsByStatus(): Promise<Record<string, number>> {
    const rows = await db.select({
      status: insightJobs.status,
      count: sql<number>`COUNT(*)`,
    }).from(insightJobs).groupBy(insightJobs.status);
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  async createAiUsageLog(data: InsertAiUsageLog): Promise<AiUsageLog> {
    const [log] = await db.insert(aiUsageLog).values(data).returning();
    return log;
  }

  async getDailyAiUsage(clientId: number): Promise<{ totalTokens: number; jobCount: number }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const result = await db.select({
      totalTokens: sql<number>`COALESCE(SUM(${aiUsageLog.totalTokens}), 0)`,
      jobCount: sql<number>`COUNT(*)`,
    })
      .from(aiUsageLog)
      .where(and(
        eq(aiUsageLog.clientId, clientId),
        gte(aiUsageLog.createdAt, todayStart),
      ));

    return {
      totalTokens: Number(result[0]?.totalTokens ?? 0),
      jobCount: Number(result[0]?.jobCount ?? 0),
    };
  }

}

export const storage = new DatabaseStorage();
