import { db } from "./db";
import {
  users, sources, articles, keywords, bookmarks, sourceFetchLogs,
  clients, clientKeywords, systemSettings, adminAuditLogs,
  processingJobs, systemErrors, apiKeys, featureFlags, usageMetrics,
  storyClusters, articleAiAnalysis, dailyBriefs, detectedEvents, entityMentions, trendPredictions,
  subscriptions, onboardingState, notificationSettings, whiteLabelSettings, supportTickets,
  integrationWebhooks, webhookDeliveries, emailSubscriptions, integrationConfigs,
  embedTokens, exportJobs, ssoConfigs, importConnectors, mobileNotificationPrefs,
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
} from "@shared/schema";
import { eq, like, and, gte, lte, desc, sql, inArray, asc, isNull, isNotNull } from "drizzle-orm";

const AUTO_PAUSE_THRESHOLD_DB = 5;

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Sources
  getSources(): Promise<Source[]>;
  getSource(id: number): Promise<Source | undefined>;
  createSource(source: InsertSource): Promise<Source>;
  updateSource(id: number, source: Partial<InsertSource>): Promise<Source | undefined>;
  deleteSource(id: number): Promise<void>;

  // Articles
  getArticles(params?: ArticleQueryParams): Promise<{ items: (Article & { source: Source | null })[], total: number }>;
  getArticle(id: number): Promise<Article | undefined>;
  getArticlesByIds(ids: number[]): Promise<(Article & { source: Source | null })[]>;
  createArticle(article: InsertArticle): Promise<Article>;
  getArticleByUrl(url: string): Promise<Article | undefined>; // For deduplication

  // Keywords
  getKeywords(): Promise<Keyword[]>;
  createKeyword(keyword: InsertKeyword): Promise<Keyword>;
  deleteKeyword(id: number): Promise<void>;
  
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
  deleteUser(id: number): Promise<void>;

  // Bulk article operations
  deleteArticles(ids: number[]): Promise<number>;
  updateArticlesCategory(ids: number[], category: string): Promise<number>;

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
  getContentVolume(startDate: string, endDate: string, sourceIds?: number[]): Promise<{
    timeline: { date: string; count: number }[];
    bySource: { sourceId: number; sourceName: string; count: number }[];
    byHour: { hour: number; count: number }[];
    peaks: { date: string; count: number }[];
  }>;

  // Analytics - Trending Topics
  getTrendingTopics(startDate: string, endDate: string, sourceIds?: number[]): Promise<{
    topics: { topic: string; count: number; sentiment: string }[];
    topicTimeline: { date: string; topic: string; count: number }[];
    byCategory: { category: string; count: number }[];
  }>;

  // Analytics - Keyword Analysis
  getKeywordAnalysis(startDate: string, endDate: string, sourceIds?: number[]): Promise<{
    topKeywords: { keyword: string; count: number; avgSentiment: number }[];
    keywordTimeline: { date: string; keyword: string; count: number }[];
  }>;

  // Analytics - Sentiment Reports
  getSentimentReports(startDate: string, endDate: string, sourceIds?: number[]): Promise<{
    overall: { positive: number; negative: number; neutral: number };
    bySource: { sourceId: number; sourceName: string; positive: number; negative: number; neutral: number }[];
    timeline: { date: string; positive: number; negative: number; neutral: number }[];
    byCategory: { category: string; positive: number; negative: number; neutral: number }[];
  }>;

  // Analytics - Source Behavior
  getSourceBehavior(startDate: string, endDate: string, sourceIds?: number[]): Promise<{
    sources: {
      sourceId: number;
      sourceName: string;
      sourceType: string;
      articleCount: number;
      avgArticlesPerDay: number;
      dominantSentiment: string;
      uniqueKeywords: number;
    }[];
    diversity: { sourceType: string; count: number }[];
  }>;

  getNarrativeComparison(topic: string, startDate: string, endDate: string, sourceIds?: number[]): Promise<{
    topic: string;
    sources: { sourceId: number; sourceName: string; positive: number; negative: number; neutral: number; total: number }[];
    hasContrast: boolean;
  }>;

  getAnalyticsDailyBrief(date: string, sourceIds?: number[]): Promise<{
    date: string;
    topStories: { title: string; url: string; sourceName: string; sentiment: string }[];
    biggestTopic: string;
    sentimentShift: { previous: { positive: number; negative: number; neutral: number }; current: { positive: number; negative: number; neutral: number } };
    sourceSpike: { sourceName: string; count: number; avgCount: number } | null;
  }>;

  getKeywordDetail(keyword: string, startDate: string, endDate: string, sourceIds?: number[]): Promise<{
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
  softDeleteSource(id: number): Promise<void>;
  restoreSource(id: number): Promise<void>;
  getActiveSources(): Promise<Source[]>;

  // User management extensions
  updateUser(id: number, updates: Partial<{ role: string; clientId: number | null; disabled: boolean; password: string }>): Promise<User | undefined>;

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

  getArticleAiAnalysis(articleId: number): Promise<ArticleAiAnalysis | undefined>;
  upsertArticleAiAnalysis(data: InsertArticleAiAnalysis): Promise<ArticleAiAnalysis>;
  getUnanalyzedArticleIds(limit?: number): Promise<number[]>;

  getStoryClusters(params?: { limit?: number; offset?: number }): Promise<StoryCluster[]>;
  getStoryCluster(id: number): Promise<StoryCluster | undefined>;
  createStoryCluster(data: InsertStoryCluster): Promise<StoryCluster>;
  updateStoryCluster(id: number, data: Partial<InsertStoryCluster>): Promise<StoryCluster>;
  getClusterArticles(clusterId: number): Promise<Article[]>;

  getDailyBriefs(limit?: number): Promise<DailyBrief[]>;
  getDailyBrief(date: string): Promise<DailyBrief | undefined>;
  upsertDailyBrief(data: InsertDailyBrief): Promise<DailyBrief>;

  getDetectedEvents(params?: { type?: string; severity?: string; limit?: number; acknowledged?: boolean }): Promise<DetectedEvent[]>;
  createDetectedEvent(data: InsertDetectedEvent): Promise<DetectedEvent>;
  acknowledgeEvent(id: number): Promise<void>;

  getEntityMentions(entityName: string, params?: { limit?: number; startDate?: string; endDate?: string }): Promise<EntityMention[]>;
  createEntityMention(data: InsertEntityMention): Promise<EntityMention>;
  createEntityMentionsBatch(data: InsertEntityMention[]): Promise<void>;
  getTopEntities(params?: { limit?: number; days?: number; entityType?: string }): Promise<{ entityName: string; entityType: string; mentionCount: number; avgSentiment: number }[]>;
  getEntityTimeline(entityName: string, days?: number): Promise<{ date: string; mentionCount: number; avgSentiment: number }[]>;

  getTrendPredictions(params?: { topic?: string; limit?: number }): Promise<TrendPrediction[]>;
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
  deleteNotificationSetting(id: number): Promise<void>;

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

  getKnowledgeEntries(params?: { search?: string; limit?: number }): Promise<KnowledgeEntry[]>;
  upsertKnowledgeEntry(data: InsertKnowledgeEntry): Promise<KnowledgeEntry>;

  getValueReports(clientId: number): Promise<ValueReport[]>;
  createValueReport(data: InsertValueReport): Promise<ValueReport>;

  getWebhooks(clientId?: number): Promise<IntegrationWebhook[]>;
  getWebhook(id: number): Promise<IntegrationWebhook | undefined>;
  createWebhook(data: InsertIntegrationWebhook): Promise<IntegrationWebhook>;
  updateWebhook(id: number, data: Partial<InsertIntegrationWebhook>): Promise<IntegrationWebhook | undefined>;
  deleteWebhook(id: number): Promise<void>;
  getWebhooksByEvent(eventType: string): Promise<IntegrationWebhook[]>;

  getWebhookDeliveries(webhookId?: number, params?: { limit?: number }): Promise<WebhookDelivery[]>;
  createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery>;
  updateWebhookDelivery(id: number, data: Partial<InsertWebhookDelivery>): Promise<void>;

  getEmailSubscriptions(userId?: number): Promise<EmailSubscription[]>;
  createEmailSubscription(data: InsertEmailSubscription): Promise<EmailSubscription>;
  updateEmailSubscription(id: number, data: Partial<InsertEmailSubscription>): Promise<EmailSubscription | undefined>;
  deleteEmailSubscription(id: number): Promise<void>;

  getIntegrationConfigs(clientId?: number): Promise<IntegrationConfig[]>;
  createIntegrationConfig(data: InsertIntegrationConfig): Promise<IntegrationConfig>;
  updateIntegrationConfig(id: number, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined>;
  deleteIntegrationConfig(id: number): Promise<void>;

  getEmbedTokens(clientId?: number): Promise<EmbedToken[]>;
  getEmbedTokenByToken(token: string): Promise<EmbedToken | undefined>;
  createEmbedToken(data: InsertEmbedToken): Promise<EmbedToken>;
  updateEmbedToken(id: number, data: Partial<InsertEmbedToken>): Promise<EmbedToken | undefined>;
  deleteEmbedToken(id: number): Promise<void>;

  getExportJobs(userId?: number): Promise<ExportJob[]>;
  createExportJob(data: InsertExportJob): Promise<ExportJob>;
  updateExportJob(id: number, data: Partial<ExportJob>): Promise<void>;

  getSsoConfigs(clientId?: number): Promise<SsoConfig[]>;
  createSsoConfig(data: InsertSsoConfig): Promise<SsoConfig>;
  updateSsoConfig(id: number, data: Partial<InsertSsoConfig>): Promise<SsoConfig | undefined>;
  deleteSsoConfig(id: number): Promise<void>;

  getImportConnectors(clientId?: number): Promise<ImportConnector[]>;
  createImportConnector(data: InsertImportConnector): Promise<ImportConnector>;
  updateImportConnector(id: number, data: Partial<InsertImportConnector>): Promise<ImportConnector | undefined>;
  deleteImportConnector(id: number): Promise<void>;

  getMobileNotificationPrefs(userId: number): Promise<MobileNotificationPref | undefined>;
  upsertMobileNotificationPrefs(data: InsertMobileNotificationPref): Promise<MobileNotificationPref>;
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
  async getSources(): Promise<Source[]> {
    return await db.select().from(sources);
  }

  async getSource(id: number): Promise<Source | undefined> {
    const [source] = await db.select().from(sources).where(eq(sources.id, id));
    return source;
  }

  async createSource(insertSource: InsertSource): Promise<Source> {
    const [source] = await db.insert(sources).values(insertSource).returning();
    return source;
  }

  async updateSource(id: number, updates: Partial<InsertSource>): Promise<Source | undefined> {
    const [source] = await db.update(sources).set(updates).where(eq(sources.id, id)).returning();
    return source;
  }

  async deleteSource(id: number): Promise<void> {
    await db.delete(articles).where(eq(articles.sourceId, id));
    await db.delete(sources).where(eq(sources.id, id));
  }

  async updateSourceLastFetched(id: number): Promise<void> {
    await db.update(sources).set({ lastFetchedAt: new Date() }).where(eq(sources.id, id));
  }

  // Articles
  async getArticles(params?: ArticleQueryParams): Promise<{ items: (Article & { source: Source | null })[], total: number }> {
    const conditions = [];
    let needsSourceJoin = false;

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
      createdAt: articles.createdAt,
      source: sources
    })
    .from(articles)
    .leftJoin(sources, eq(articles.sourceId, sources.id))
    .where(whereClause)
    .orderBy(desc(articles.publishedAt))
    .limit(limit)
    .offset(offset);

    return { items, total };
  }

  async getArticle(id: number): Promise<Article | undefined> {
    const [article] = await db.select().from(articles).where(eq(articles.id, id));
    return article;
  }

  async getArticlesByIds(ids: number[]): Promise<(Article & { source: Source | null })[]> {
    if (ids.length === 0) return [];
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
      .where(inArray(articles.id, ids))
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

  async getArticleByUrl(url: string): Promise<Article | undefined> {
    const [article] = await db.select().from(articles).where(eq(articles.url, url));
    return article;
  }

  // Keywords
  async getKeywords(): Promise<Keyword[]> {
    return await db.select().from(keywords);
  }

  async createKeyword(insertKeyword: InsertKeyword): Promise<Keyword> {
    const [keyword] = await db.insert(keywords).values(insertKeyword).returning();
    return keyword;
  }

  async deleteKeyword(id: number): Promise<void> {
    await db.delete(keywords).where(eq(keywords.id, id));
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
    const sourceIdFilter = sourceIds ? sql`AND s.id = ANY(${sourceIds})` : sql``;
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

  async deleteUser(id: number): Promise<void> {
    const children = await this.getUserChildren(id);
    for (const child of children) {
      await this.deleteUser(child.id);
    }
    const userSources = await this.getSourcesByUserId(id);
    for (const source of userSources) {
      await db.delete(articles).where(eq(articles.sourceId, source.id));
      await db.delete(sources).where(eq(sources.id, source.id));
    }
    await db.delete(bookmarks).where(eq(bookmarks.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async deleteArticles(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    await db.delete(bookmarks).where(inArray(bookmarks.articleId, ids));
    const result = await db.delete(articles).where(inArray(articles.id, ids)).returning({ id: articles.id });
    return result.length;
  }

  async updateArticlesCategory(ids: number[], category: string): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.update(articles).set({ category }).where(inArray(articles.id, ids)).returning({ id: articles.id });
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
    const sourceFilter = sourceIds ? sql`AND source_id = ANY(${sourceIds})` : sql``;
    const sourceIdFilter = sourceIds ? sql`AND id = ANY(${sourceIds})` : sql``;

    const totalArticlesRows = await db.execute(sql`SELECT COUNT(*)::int as count FROM articles WHERE 1=1 ${sourceFilter}`);
    const totalArticles = Number((totalArticlesRows.rows[0] as any)?.count || 0);

    const sourcesCountRows = await db.execute(sql`SELECT COUNT(*)::int as count FROM sources WHERE 1=1 ${sourceIdFilter}`);
    const sourcesCount = Number((sourcesCountRows.rows[0] as any)?.count || 0);

    const sentimentRows = await db.execute(sql`
      SELECT 
        COALESCE(sentiment_label, 'neutral') as label,
        COUNT(*)::int as count
      FROM articles
      WHERE 1=1 ${sourceFilter}
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
      WHERE keywords IS NOT NULL ${sourceFilter}
      GROUP BY kw
      ORDER BY count DESC
      LIMIT 10
    `);
    const trendingKeywords = (keywordRows.rows as any[]).map((r: any) => ({
      text: String(r.keyword),
      value: Number(r.count),
    }));

    const topSourceRows = await db.execute(sql`
      SELECT s.name, COUNT(a.id)::int as count
      FROM sources s
      JOIN articles a ON a.source_id = s.id
      WHERE 1=1 ${sourceIdFilter}
      GROUP BY s.name
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
    const sourceFilter = sourceIds ? sql`AND source_id = ANY(${sourceIds})` : sql``;
    const rows = await db.execute(sql`
      SELECT 
        TO_CHAR(published_at, 'YYYY-MM-DD') as date,
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= NOW() - INTERVAL '30 days' ${sourceFilter}
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

  async getContentVolume(startDate: string, endDate: string, sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { timeline: [], bySource: [], byHour: [], peaks: [] };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND source_id = ANY(${sourceIds})` : sql``;
    const sourceFilterA = sourceIds ? sql`AND a.source_id = ANY(${sourceIds})` : sql``;

    const timelineRows = await db.execute(sql`
      SELECT TO_CHAR(published_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    const bySourceRows = await db.execute(sql`
      SELECT a.source_id as "sourceId", s.name as "sourceName", COUNT(*)::int as count
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA}
      GROUP BY a.source_id, s.name
      ORDER BY count DESC
      LIMIT 20
    `);

    const byHourRows = await db.execute(sql`
      SELECT EXTRACT(HOUR FROM published_at)::int as hour, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter}
      GROUP BY EXTRACT(HOUR FROM published_at)
      ORDER BY hour ASC
    `);

    const timeline = (timelineRows.rows as any[]).map(r => ({ date: String(r.date), count: Number(r.count) }));

    const avgCount = timeline.length > 0 ? timeline.reduce((s, t) => s + t.count, 0) / timeline.length : 0;
    const peaks = timeline.filter(t => t.count > avgCount * 1.5).sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      timeline,
      bySource: (bySourceRows.rows as any[]).map(r => ({
        sourceId: Number(r.sourceId),
        sourceName: String(r.sourceName || "Unknown"),
        count: Number(r.count),
      })),
      byHour: (byHourRows.rows as any[]).map(r => ({ hour: Number(r.hour), count: Number(r.count) })),
      peaks,
    };
  }

  async getTrendingTopics(startDate: string, endDate: string, sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { topics: [], topicTimeline: [], byCategory: [] };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND source_id = ANY(${sourceIds})` : sql``;
    const sourceFilterA = sourceIds ? sql`AND a.source_id = ANY(${sourceIds})` : sql``;
    const sourceFilterA2 = sourceIds ? sql`AND a2.source_id = ANY(${sourceIds})` : sql``;

    const topicRows = await db.execute(sql`
      SELECT kw as topic, COUNT(*)::int as count,
        MODE() WITHIN GROUP (ORDER BY sentiment_label) as sentiment
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL AND published_at >= ${start} AND published_at <= ${end} ${sourceFilter}
      GROUP BY kw
      ORDER BY count DESC
      LIMIT 20
    `);

    const topicTimelineRows = await db.execute(sql`
      SELECT TO_CHAR(a.published_at, 'YYYY-MM-DD') as date, kw as topic, COUNT(*)::int as count
      FROM articles a, unnest(a.keywords) as kw
      WHERE a.keywords IS NOT NULL AND a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA}
      AND kw IN (
        SELECT kw2 FROM articles a2, unnest(a2.keywords) as kw2
        WHERE a2.keywords IS NOT NULL AND a2.published_at >= ${start} AND a2.published_at <= ${end} ${sourceFilterA2}
        GROUP BY kw2 ORDER BY COUNT(*) DESC LIMIT 5
      )
      GROUP BY TO_CHAR(a.published_at, 'YYYY-MM-DD'), kw
      ORDER BY date ASC
    `);

    const categoryRows = await db.execute(sql`
      SELECT COALESCE(category, 'general') as category, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter}
      GROUP BY category
      ORDER BY count DESC
    `);

    return {
      topics: (topicRows.rows as any[]).map(r => ({
        topic: String(r.topic),
        count: Number(r.count),
        sentiment: String(r.sentiment || "neutral"),
      })),
      topicTimeline: (topicTimelineRows.rows as any[]).map(r => ({
        date: String(r.date),
        topic: String(r.topic),
        count: Number(r.count),
      })),
      byCategory: (categoryRows.rows as any[]).map(r => ({
        category: String(r.category),
        count: Number(r.count),
      })),
    };
  }

  async getKeywordAnalysis(startDate: string, endDate: string, sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { topKeywords: [], keywordTimeline: [] };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND source_id = ANY(${sourceIds})` : sql``;
    const sourceFilterA = sourceIds ? sql`AND a.source_id = ANY(${sourceIds})` : sql``;
    const sourceFilterA2 = sourceIds ? sql`AND a2.source_id = ANY(${sourceIds})` : sql``;

    const topKeywordsRows = await db.execute(sql`
      SELECT kw as keyword, COUNT(*)::int as count,
        COALESCE(AVG(sentiment_score), 0)::int as "avgSentiment"
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL AND published_at >= ${start} AND published_at <= ${end} ${sourceFilter}
      GROUP BY kw
      ORDER BY count DESC
      LIMIT 25
    `);

    const keywordTimelineRows = await db.execute(sql`
      SELECT TO_CHAR(a.published_at, 'YYYY-MM-DD') as date, kw as keyword, COUNT(*)::int as count
      FROM articles a, unnest(a.keywords) as kw
      WHERE a.keywords IS NOT NULL AND a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA}
      AND kw IN (
        SELECT kw2 FROM articles a2, unnest(a2.keywords) as kw2
        WHERE a2.keywords IS NOT NULL AND a2.published_at >= ${start} AND a2.published_at <= ${end} ${sourceFilterA2}
        GROUP BY kw2 ORDER BY COUNT(*) DESC LIMIT 10
      )
      GROUP BY TO_CHAR(a.published_at, 'YYYY-MM-DD'), kw
      ORDER BY date ASC
    `);

    return {
      topKeywords: (topKeywordsRows.rows as any[]).map(r => ({
        keyword: String(r.keyword),
        count: Number(r.count),
        avgSentiment: Number(r.avgSentiment),
      })),
      keywordTimeline: (keywordTimelineRows.rows as any[]).map(r => ({
        date: String(r.date),
        keyword: String(r.keyword),
        count: Number(r.count),
      })),
    };
  }

  async getSentimentReports(startDate: string, endDate: string, sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return {
        overall: { positive: 0, negative: 0, neutral: 0 },
        bySource: [],
        timeline: [],
        byCategory: [],
      };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND source_id = ANY(${sourceIds})` : sql``;
    const sourceFilterA = sourceIds ? sql`AND a.source_id = ANY(${sourceIds})` : sql``;

    const overallRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter}
    `);
    const overall = overallRows.rows[0] as any;

    const bySourceRows = await db.execute(sql`
      SELECT a.source_id as "sourceId", s.name as "sourceName",
        COUNT(*) FILTER (WHERE a.sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'neutral' OR a.sentiment_label IS NULL)::int as neutral
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA}
      GROUP BY a.source_id, s.name
      ORDER BY (COUNT(*) FILTER (WHERE a.sentiment_label = 'positive') + COUNT(*) FILTER (WHERE a.sentiment_label = 'negative') + COUNT(*) FILTER (WHERE a.sentiment_label = 'neutral' OR a.sentiment_label IS NULL)) DESC
      LIMIT 15
    `);

    const timelineRows = await db.execute(sql`
      SELECT TO_CHAR(published_at, 'YYYY-MM-DD') as date,
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    const byCategoryRows = await db.execute(sql`
      SELECT COALESCE(category, 'general') as category,
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end} ${sourceFilter}
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
    };
  }

  async getSourceBehavior(startDate: string, endDate: string, sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { sources: [], diversity: [] };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const sourceIdFilter = sourceIds ? sql`AND s.id = ANY(${sourceIds})` : sql``;
    const sourceFilterA = sourceIds ? sql`AND a.source_id = ANY(${sourceIds})` : sql``;

    const sourceRows = await db.execute(sql`
      SELECT 
        s.id as "sourceId", s.name as "sourceName", s.type as "sourceType",
        COUNT(a.id)::int as "articleCount",
        MODE() WITHIN GROUP (ORDER BY a.sentiment_label) as "dominantSentiment",
        COUNT(DISTINCT unnest_kw)::int as "uniqueKeywords"
      FROM sources s
      LEFT JOIN articles a ON a.source_id = s.id AND a.published_at >= ${start} AND a.published_at <= ${end}
      LEFT JOIN LATERAL unnest(a.keywords) as unnest_kw ON true
      WHERE 1=1 ${sourceIdFilter}
      GROUP BY s.id, s.name, s.type
      ORDER BY "articleCount" DESC
    `);

    const diversityRows = await db.execute(sql`
      SELECT s.type as "sourceType", COUNT(DISTINCT a.id)::int as count
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilterA}
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
      diversity: (diversityRows.rows as any[]).map(r => ({
        sourceType: String(r.sourceType || "unknown"),
        count: Number(r.count),
      })),
    };
  }

  async getNarrativeComparison(topic: string, startDate: string, endDate: string, sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { topic, sources: [], hasContrast: false };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND a.source_id = ANY(${sourceIds})` : sql``;

    const rows = await db.execute(sql`
      SELECT 
        s.id as "sourceId", s.name as "sourceName",
        COUNT(*) FILTER (WHERE a.sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'neutral' OR a.sentiment_label IS NULL)::int as neutral,
        COUNT(*)::int as total
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE (a.keywords IS NOT NULL AND ${topic} = ANY(a.keywords))
        AND a.published_at >= ${start} AND a.published_at <= ${end}
        ${sourceFilter}
      GROUP BY s.id, s.name
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

  async getAnalyticsDailyBrief(date: string, sourceIds?: number[]) {
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
    const sourceFilter = sourceIds ? sql`AND a.source_id = ANY(${sourceIds})` : sql``;
    const sourceFilterPlain = sourceIds ? sql`AND source_id = ANY(${sourceIds})` : sql``;

    const topStoriesRows = await db.execute(sql`
      SELECT a.title, a.url, s.name as "sourceName", a.sentiment_label as sentiment
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${dayStart} AND a.published_at <= ${dayEnd} ${sourceFilter}
      ORDER BY a.published_at DESC
      LIMIT 5
    `);

    const topicRows = await db.execute(sql`
      SELECT kw as topic, COUNT(*)::int as count
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL AND published_at >= ${dayStart} AND published_at <= ${dayEnd} ${sourceFilterPlain}
      GROUP BY kw ORDER BY count DESC LIMIT 1
    `);

    const currentSentimentRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${dayStart} AND published_at <= ${dayEnd} ${sourceFilterPlain}
    `);

    const prevSentimentRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${prevDayStart} AND published_at < ${dayStart} ${sourceFilterPlain}
    `);

    const spikeRows = await db.execute(sql`
      SELECT s.name as "sourceName",
        COUNT(*) FILTER (WHERE a.published_at >= ${dayStart} AND a.published_at <= ${dayEnd})::int as "todayCount",
        COUNT(*) FILTER (WHERE a.published_at >= ${prevDayStart} AND a.published_at < ${dayStart})::int as "yesterdayCount"
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${prevDayStart} AND a.published_at <= ${dayEnd} ${sourceFilter}
      GROUP BY s.name
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

  async getKeywordDetail(keyword: string, startDate: string, endDate: string, sourceIds?: number[]) {
    if (sourceIds !== undefined && sourceIds.length === 0) {
      return { keyword, frequency: [], topSources: [], sentiment: { positive: 0, negative: 0, neutral: 0 }, headlines: [] };
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    const sourceFilter = sourceIds ? sql`AND a.source_id = ANY(${sourceIds})` : sql``;
    const sourceFilterPlain = sourceIds ? sql`AND source_id = ANY(${sourceIds})` : sql``;

    const freqRows = await db.execute(sql`
      SELECT TO_CHAR(published_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM articles
      WHERE keywords IS NOT NULL AND ${keyword} = ANY(keywords)
        AND published_at >= ${start} AND published_at <= ${end} ${sourceFilterPlain}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    const sourceRows = await db.execute(sql`
      SELECT s.name as "sourceName", COUNT(*)::int as count
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.keywords IS NOT NULL AND ${keyword} = ANY(a.keywords)
        AND a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilter}
      GROUP BY s.name
      ORDER BY count DESC
      LIMIT 10
    `);

    const sentimentRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE keywords IS NOT NULL AND ${keyword} = ANY(keywords)
        AND published_at >= ${start} AND published_at <= ${end} ${sourceFilterPlain}
    `);

    const headlineRows = await db.execute(sql`
      SELECT a.title, a.url, s.name as "sourceName", a.published_at as "publishedAt", a.sentiment_label as sentiment
      FROM articles a
      JOIN sources s ON a.source_id = s.id
      WHERE a.keywords IS NOT NULL AND ${keyword} = ANY(a.keywords)
        AND a.published_at >= ${start} AND a.published_at <= ${end} ${sourceFilter}
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
      const retentionDays = source.retentionDays ?? 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await db
        .delete(articles)
        .where(
          and(
            eq(articles.sourceId, source.id),
            lte(articles.createdAt, cutoffDate)
          )
        )
        .returning({ id: articles.id });
      totalDeleted += result.length;
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
    const [entry] = await db.insert(adminAuditLogs).values(log).returning();
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
  async softDeleteSource(id: number): Promise<void> {
    await db.update(sources).set({ deletedAt: new Date(), active: false }).where(eq(sources.id, id));
  }

  async restoreSource(id: number): Promise<void> {
    await db.update(sources).set({ deletedAt: null, active: true }).where(eq(sources.id, id));
  }

  async getActiveSources(): Promise<Source[]> {
    return await db.select().from(sources).where(isNull(sources.deletedAt));
  }

  // === USER MANAGEMENT EXTENSIONS ===
  async updateUser(id: number, updates: Partial<{ role: string; clientId: number | null; disabled: boolean; password: string }>): Promise<User | undefined> {
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

  async getArticleAiAnalysis(articleId: number): Promise<ArticleAiAnalysis | undefined> {
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

  async getUnanalyzedArticleIds(limit: number = 100): Promise<number[]> {
    const rows = await db.select({ id: articles.id })
      .from(articles)
      .leftJoin(articleAiAnalysis, eq(articles.id, articleAiAnalysis.articleId))
      .where(isNull(articleAiAnalysis.id))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);
    return rows.map(r => r.id);
  }

  async getStoryClusters(params?: { limit?: number; offset?: number }): Promise<StoryCluster[]> {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    return await db.select().from(storyClusters)
      .orderBy(desc(storyClusters.lastUpdated))
      .limit(limit)
      .offset(offset);
  }

  async getStoryCluster(id: number): Promise<StoryCluster | undefined> {
    const [row] = await db.select().from(storyClusters).where(eq(storyClusters.id, id));
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

  async getClusterArticles(clusterId: number): Promise<Article[]> {
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
    })
      .from(articles)
      .innerJoin(articleAiAnalysis, eq(articles.id, articleAiAnalysis.articleId))
      .where(eq(articleAiAnalysis.clusterId, clusterId))
      .orderBy(desc(articles.publishedAt));
    return rows;
  }

  async getDailyBriefs(limit: number = 30): Promise<DailyBrief[]> {
    return await db.select().from(dailyBriefs)
      .orderBy(desc(dailyBriefs.date))
      .limit(limit);
  }

  async getDailyBrief(date: string): Promise<DailyBrief | undefined> {
    const [row] = await db.select().from(dailyBriefs).where(eq(dailyBriefs.date, date));
    return row;
  }

  async upsertDailyBrief(data: InsertDailyBrief): Promise<DailyBrief> {
    const [row] = await db.insert(dailyBriefs)
      .values(data)
      .onConflictDoUpdate({
        target: dailyBriefs.date,
        set: {
          content: data.content,
          keyStories: data.keyStories,
          majorDevelopments: data.majorDevelopments,
          emergingTopics: data.emergingTopics,
          toneShifts: data.toneShifts,
          articleCount: data.articleCount,
          sourceCount: data.sourceCount,
          confidenceScore: data.confidenceScore,
        },
      })
      .returning();
    return row;
  }

  async getDetectedEvents(params?: { type?: string; severity?: string; limit?: number; acknowledged?: boolean }): Promise<DetectedEvent[]> {
    const conditions = [];
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

  async acknowledgeEvent(id: number): Promise<void> {
    await db.update(detectedEvents).set({ acknowledged: true }).where(eq(detectedEvents.id, id));
  }

  async getEntityMentions(entityName: string, params?: { limit?: number; startDate?: string; endDate?: string }): Promise<EntityMention[]> {
    const conditions = [eq(entityMentions.entityName, entityName)];
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

  async getTopEntities(params?: { limit?: number; days?: number; entityType?: string }): Promise<{ entityName: string; entityType: string; mentionCount: number; avgSentiment: number }[]> {
    const conditions = [];
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

  async getEntityTimeline(entityName: string, days: number = 30): Promise<{ date: string; mentionCount: number; avgSentiment: number }[]> {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await db.select({
      date: sql<string>`TO_CHAR(${entityMentions.mentionDate}, 'YYYY-MM-DD')`,
      mentionCount: sql<number>`count(*)::int`,
      avgSentiment: sql<number>`COALESCE(AVG(${entityMentions.sentimentScore}), 0)::int`,
    })
      .from(entityMentions)
      .where(and(
        eq(entityMentions.entityName, entityName),
        gte(entityMentions.mentionDate, since),
      ))
      .groupBy(sql`TO_CHAR(${entityMentions.mentionDate}, 'YYYY-MM-DD')`)
      .orderBy(asc(sql`TO_CHAR(${entityMentions.mentionDate}, 'YYYY-MM-DD')`));
    return rows;
  }

  async getTrendPredictions(params?: { topic?: string; limit?: number }): Promise<TrendPrediction[]> {
    const conditions = [];
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
      .where(and(eq(users.clientId, clientId), sql`(${users.disabled} = false OR ${users.disabled} IS NULL)`));
    return result?.count || 0;
  }

  async getUsersByClientId(clientId: number): Promise<User[]> {
    return await db.select().from(users).where(eq(users.clientId, clientId));
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

  async deleteNotificationSetting(id: number): Promise<void> {
    await db.delete(notificationSettings).where(eq(notificationSettings.id, id));
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

  async getKnowledgeEntries(params?: { search?: string; limit?: number }): Promise<KnowledgeEntry[]> {
    const limit = params?.limit || 50;
    if (params?.search) {
      return await db.select().from(knowledgeEntries)
        .where(like(knowledgeEntries.questionPattern, `%${params.search}%`))
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

  async getWebhook(id: number): Promise<IntegrationWebhook | undefined> {
    const [row] = await db.select().from(integrationWebhooks).where(eq(integrationWebhooks.id, id));
    return row;
  }

  async createWebhook(data: InsertIntegrationWebhook): Promise<IntegrationWebhook> {
    const [row] = await db.insert(integrationWebhooks).values(data).returning();
    return row;
  }

  async updateWebhook(id: number, data: Partial<InsertIntegrationWebhook>): Promise<IntegrationWebhook | undefined> {
    const [row] = await db.update(integrationWebhooks).set(data).where(eq(integrationWebhooks.id, id)).returning();
    return row;
  }

  async deleteWebhook(id: number): Promise<void> {
    await db.delete(integrationWebhooks).where(eq(integrationWebhooks.id, id));
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

  async updateEmailSubscription(id: number, data: Partial<InsertEmailSubscription>): Promise<EmailSubscription | undefined> {
    const [row] = await db.update(emailSubscriptions).set(data).where(eq(emailSubscriptions.id, id)).returning();
    return row;
  }

  async deleteEmailSubscription(id: number): Promise<void> {
    await db.delete(emailSubscriptions).where(eq(emailSubscriptions.id, id));
  }

  async getIntegrationConfigs(clientId?: number): Promise<IntegrationConfig[]> {
    if (clientId) return db.select().from(integrationConfigs).where(eq(integrationConfigs.clientId, clientId)).orderBy(desc(integrationConfigs.createdAt));
    return db.select().from(integrationConfigs).orderBy(desc(integrationConfigs.createdAt));
  }

  async createIntegrationConfig(data: InsertIntegrationConfig): Promise<IntegrationConfig> {
    const [row] = await db.insert(integrationConfigs).values(data).returning();
    return row;
  }

  async updateIntegrationConfig(id: number, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined> {
    const [row] = await db.update(integrationConfigs).set(data).where(eq(integrationConfigs.id, id)).returning();
    return row;
  }

  async deleteIntegrationConfig(id: number): Promise<void> {
    await db.delete(integrationConfigs).where(eq(integrationConfigs.id, id));
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

  async deleteEmbedToken(id: number): Promise<void> {
    await db.delete(embedTokens).where(eq(embedTokens.id, id));
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

  async updateSsoConfig(id: number, data: Partial<InsertSsoConfig>): Promise<SsoConfig | undefined> {
    const [row] = await db.update(ssoConfigs).set(data).where(eq(ssoConfigs.id, id)).returning();
    return row;
  }

  async deleteSsoConfig(id: number): Promise<void> {
    await db.delete(ssoConfigs).where(eq(ssoConfigs.id, id));
  }

  async getImportConnectors(clientId?: number): Promise<ImportConnector[]> {
    if (clientId) return db.select().from(importConnectors).where(eq(importConnectors.clientId, clientId)).orderBy(desc(importConnectors.createdAt));
    return db.select().from(importConnectors).orderBy(desc(importConnectors.createdAt));
  }

  async createImportConnector(data: InsertImportConnector): Promise<ImportConnector> {
    const [row] = await db.insert(importConnectors).values(data).returning();
    return row;
  }

  async updateImportConnector(id: number, data: Partial<InsertImportConnector>): Promise<ImportConnector | undefined> {
    const [row] = await db.update(importConnectors).set(data).where(eq(importConnectors.id, id)).returning();
    return row;
  }

  async deleteImportConnector(id: number): Promise<void> {
    await db.delete(importConnectors).where(eq(importConnectors.id, id));
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

}

export const storage = new DatabaseStorage();
