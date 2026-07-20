import { pgTable, text, serial, integer, boolean, timestamp, jsonb, uniqueIndex, index, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import type { WebsiteCollectorConfig } from "./source-collector";
import type { SourceFilterConfig } from "./source-filter";

// === CLIENTS ===
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  organizationType: text("organization_type").notNull().default("media"),
  defaultLanguage: text("default_language").default("en"),
  active: boolean("active").default(true),
  allowedRegions: text("allowed_regions").array(),
  aiEnabled: boolean("ai_enabled").default(false),
  aiTier: text("ai_tier").notNull().default("none"),
  planTier: text("plan_tier").notNull().default("starter"),
  dailyTokenBudget: integer("daily_token_budget").default(0),
  dailyJobLimit: integer("daily_job_limit").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("client"),
  userScope: text("user_scope").notNull().default("tenant"),
  userType: text("user_type"),
  parentId: integer("parent_id"),
  clientId: integer("client_id").notNull(),
  disabled: boolean("disabled").default(false),
  capabilities: text("capabilities").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });

// === SOURCES ===
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull(),
  active: boolean("active").default(true),
  intervalMinutes: integer("interval_minutes").default(15),
  maxArticlesPerFetch: integer("max_articles_per_fetch").default(10),
  retentionDays: integer("retention_days").default(30),
  userId: integer("user_id"),
  clientId: integer("client_id").notNull(),
  country: text("country"),
  category: text("category"),
  collectorConfig: jsonb("collector_config").$type<WebsiteCollectorConfig>(),
  filterConfig: jsonb("filter_config").$type<SourceFilterConfig>(),
  feedToken: uuid("feed_token").defaultRandom().notNull().unique(),
  refreshPriority: text("refresh_priority").default("medium"),
  logoUrl: text("logo_url"),
  deletedAt: timestamp("deleted_at"),
  lastFetchedAt: timestamp("last_fetched_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSourceSchema = createInsertSchema(sources).omit({ id: true, createdAt: true, lastFetchedAt: true, deletedAt: true });

// === CLIENT KEYWORDS ===
export const clientKeywords = pgTable("client_keywords", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  term: text("term").notNull(),
  priority: text("priority").notNull().default("primary"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientKeywordSchema = createInsertSchema(clientKeywords).omit({ id: true, createdAt: true });

// === ARTICLES ===
export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentClean: text("content_clean"),
  summary: text("summary"),
  url: text("url"),
  sourceId: integer("source_id").references(() => sources.id),
  publishedAt: timestamp("published_at"),
  ingestedAt: timestamp("ingested_at").defaultNow(),
  language: text("language").default("en"),
  country: text("country"),
  sentimentScore: integer("sentiment_score"),
  sentimentLabel: text("sentiment_label"),
  keywords: text("keywords").array(),
  topics: text("topics").array(),
  category: text("category"),
  imageUrl: text("image_url"),
  subSource: text("sub_source"),
  engagementLikes: integer("engagement_likes"),
  engagementComments: integer("engagement_comments"),
  engagementShares: integer("engagement_shares"),
  clientId: integer("client_id").notNull(),
  crossPosts: jsonb("cross_posts").$type<{ platform: string; url: string; sourceId: number }[]>().default([]),
  aiAnalysisStatus: text("ai_analysis_status").default("skipped"),
  aiRetryCount: integer("ai_retry_count").default(0),
  aiLastRetryAt: timestamp("ai_last_retry_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_articles_client_id").on(table.clientId),
  uniqueIndex("articles_client_url_idx").on(table.clientId, table.url),
]);

export const insertArticleSchema = createInsertSchema(articles).omit({ id: true, createdAt: true });

// === KEYWORDS (Client tracking) ===
export const keywords = pgTable("keywords", {
  id: serial("id").primaryKey(),
  term: text("term").notNull(),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("keywords_term_client_idx").on(table.term, table.clientId),
]);

export const insertKeywordSchema = createInsertSchema(keywords).omit({ id: true, createdAt: true });

// === BOOKMARKS ===
export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("bookmarks_user_article_idx").on(table.userId, table.articleId),
]);

export const insertBookmarkSchema = createInsertSchema(bookmarks).omit({ id: true, createdAt: true });

// === SOURCE FETCH LOGS (Ingestion Logs) ===
export const sourceFetchLogs = pgTable("source_fetch_logs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  articlesFound: integer("articles_found").default(0),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  durationMs: integer("duration_ms"),
  pipelineStep: text("pipeline_step"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});

export const insertSourceFetchLogSchema = createInsertSchema(sourceFetchLogs).omit({ id: true, fetchedAt: true });

// === SYSTEM SETTINGS ===
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });

// === ADMIN AUDIT LOGS ===
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  details: text("details"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({ id: true, createdAt: true });

// === PROCESSING JOBS (Background Queue) ===
export const processingJobs = pgTable("processing_jobs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").default(5),
  payload: jsonb("payload"),
  result: jsonb("result"),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastError: text("last_error"),
  runAt: timestamp("run_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_jobs_status_runat").on(table.status, table.runAt),
  index("idx_jobs_type").on(table.type),
]);

export const insertProcessingJobSchema = createInsertSchema(processingJobs).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });

// === SYSTEM ERRORS ===
export const systemErrors = pgTable("system_errors", {
  id: serial("id").primaryKey(),
  component: text("component").notNull(),
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  severity: text("severity").notNull().default("error"),
  sourceId: integer("source_id"),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_errors_component").on(table.component),
  index("idx_errors_severity").on(table.severity),
  index("idx_errors_created").on(table.createdAt),
]);

export const insertSystemErrorSchema = createInsertSchema(systemErrors).omit({ id: true, createdAt: true });

// === API KEYS (Partner API) ===
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  clientId: integer("client_id").notNull(),
  scopes: text("scopes").array().default([]),
  rateLimit: integer("rate_limit").default(100),
  active: boolean("active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true, lastUsedAt: true });

// === ANALYTICS CACHE ===
export const analyticsCache = pgTable("analytics_cache", {
  id: serial("id").primaryKey(),
  metricType: text("metric_type").notNull(),
  metricKey: text("metric_key").notNull().default("global"),
  data: jsonb("data").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  clientId: integer("client_id").notNull(),
  computedAt: timestamp("computed_at").defaultNow(),
}, (table) => [
  index("idx_cache_type_key").on(table.metricType, table.metricKey),
  index("idx_cache_period").on(table.periodStart, table.periodEnd),
  index("idx_cache_client_id").on(table.clientId),
]);

export const insertAnalyticsCacheSchema = createInsertSchema(analyticsCache).omit({ id: true, computedAt: true });

// === FEATURE FLAGS ===
export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").default(false),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({ id: true, updatedAt: true });

// === USAGE METRICS ===
export const usageMetrics = pgTable("usage_metrics", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  userId: integer("user_id"),
  clientId: integer("client_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_usage_event").on(table.event),
  index("idx_usage_created").on(table.createdAt),
]);

export const insertUsageMetricSchema = createInsertSchema(usageMetrics).omit({ id: true, createdAt: true });

// === STORY CLUSTERS ===
export const storyClusters = pgTable("story_clusters", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  mainTopic: text("main_topic").notNull(),
  subtopics: text("subtopics").array(),
  importanceScore: integer("importance_score").default(50),
  articleCount: integer("article_count").default(0),
  sourceCount: integer("source_count").default(0),
  avgSentiment: integer("avg_sentiment").default(0),
  narrativeVariations: jsonb("narrative_variations"),
  clientId: integer("client_id").notNull(),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_cluster_topic").on(table.mainTopic),
  index("idx_cluster_importance").on(table.importanceScore),
  index("idx_cluster_last_updated").on(table.lastUpdated),
  index("idx_cluster_client_id").on(table.clientId),
]);

export const insertStoryClusterSchema = createInsertSchema(storyClusters).omit({ id: true, createdAt: true });

// === ARTICLE AI ANALYSIS ===
export const articleAiAnalysis = pgTable("article_ai_analysis", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  mainTopic: text("main_topic"),
  subtopics: text("subtopics").array(),
  entities: jsonb("entities"),
  eventType: text("event_type"),
  importanceScore: integer("importance_score").default(50),
  narrativeSummary: text("narrative_summary"),
  clusterId: integer("cluster_id").references(() => storyClusters.id),
  confidenceScore: integer("confidence_score").default(70),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_ai_analysis_article").on(table.articleId),
  index("idx_ai_analysis_cluster").on(table.clusterId),
  index("idx_ai_analysis_event_type").on(table.eventType),
  index("idx_ai_analysis_importance").on(table.importanceScore),
]);

export const insertArticleAiAnalysisSchema = createInsertSchema(articleAiAnalysis).omit({ id: true, createdAt: true });

// === DAILY BRIEFS ===
export const dailyBriefs = pgTable("daily_briefs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  content: text("content").notNull(),
  keyStories: jsonb("key_stories"),
  majorDevelopments: jsonb("major_developments"),
  emergingTopics: jsonb("emerging_topics"),
  toneShifts: jsonb("tone_shifts"),
  articleCount: integer("article_count").default(0),
  sourceCount: integer("source_count").default(0),
  confidenceScore: integer("confidence_score").default(70),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_brief_date").on(table.date),
  index("idx_brief_client_id").on(table.clientId),
]);

export const insertDailyBriefSchema = createInsertSchema(dailyBriefs).omit({ id: true, createdAt: true });

// === DETECTED EVENTS ===
export const detectedEvents = pgTable("detected_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  topic: text("topic").notNull(),
  severity: text("severity").notNull().default("medium"),
  explanation: text("explanation").notNull(),
  triggerValue: text("trigger_value"),
  baselineValue: text("baseline_value"),
  articleCount: integer("article_count").default(0),
  sourceCount: integer("source_count").default(0),
  confidenceScore: integer("confidence_score").default(70),
  acknowledged: boolean("acknowledged").default(false),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_event_type").on(table.type),
  index("idx_event_severity").on(table.severity),
  index("idx_event_created").on(table.createdAt),
  index("idx_event_client_id").on(table.clientId),
]);

export const insertDetectedEventSchema = createInsertSchema(detectedEvents).omit({ id: true, createdAt: true });

// === ENTITY MENTIONS ===
export const entityMentions = pgTable("entity_mentions", {
  id: serial("id").primaryKey(),
  entityName: text("entity_name").notNull(),
  entityType: text("entity_type").notNull(),
  articleId: integer("article_id").references(() => articles.id, { onDelete: "cascade" }),
  sourceId: integer("source_id").references(() => sources.id),
  sentiment: text("sentiment"),
  sentimentScore: integer("sentiment_score"),
  context: text("context"),
  clientId: integer("client_id").notNull(),
  mentionDate: timestamp("mention_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_entity_name").on(table.entityName),
  index("idx_entity_type").on(table.entityType),
  index("idx_entity_date").on(table.mentionDate),
  index("idx_entity_article").on(table.articleId),
  index("idx_entity_client_id").on(table.clientId),
]);

export const insertEntityMentionSchema = createInsertSchema(entityMentions).omit({ id: true, createdAt: true });

// === TREND PREDICTIONS ===
export const trendPredictions = pgTable("trend_predictions", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  predictionType: text("prediction_type").notNull(),
  probability: integer("probability").default(50),
  reasoning: text("reasoning"),
  timeframe: text("timeframe"),
  currentVolume: integer("current_volume"),
  historicalAvg: integer("historical_avg"),
  confidenceScore: integer("confidence_score").default(70),
  basedOnArticleCount: integer("based_on_article_count").default(0),
  basedOnSourceDiversity: integer("based_on_source_diversity").default(0),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_prediction_topic").on(table.topic),
  index("idx_prediction_type").on(table.predictionType),
  index("idx_prediction_created").on(table.createdAt),
  index("idx_prediction_client_id").on(table.clientId),
]);

export const insertTrendPredictionSchema = createInsertSchema(trendPredictions).omit({ id: true, createdAt: true });

// === INDEXES for existing tables ===
// These are added via SQL migration since Drizzle doesn't support adding indexes to existing table definitions inline

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  plan: text("plan").notNull().default("basic"),
  maxUsers: integer("max_users").notNull().default(3),
  maxKeywords: integer("max_keywords").notNull().default(10),
  maxSources: integer("max_sources").notNull().default(5),
  analyticsLevel: text("analytics_level").notNull().default("standard"),
  aiBriefLevel: text("ai_brief_level").notNull().default("summary"),
  apiAccess: boolean("api_access").default(false),
  status: text("status").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodStart: timestamp("current_period_start").defaultNow(),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_subscription_client").on(table.clientId),
  index("idx_subscription_status").on(table.status),
]);

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });

export const onboardingState = pgTable("onboarding_state", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  completed: boolean("completed").default(false),
  currentStep: integer("current_step").default(1),
  industry: text("industry"),
  countries: text("countries").array(),
  selectedKeywords: text("selected_keywords").array(),
  selectedSources: text("selected_sources").array(),
  notificationPreferences: jsonb("notification_preferences"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_onboarding_client").on(table.clientId),
]);

export const insertOnboardingStateSchema = createInsertSchema(onboardingState).omit({ id: true, createdAt: true });

export const notificationSettings = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  channel: text("channel").notNull(),
  frequency: text("frequency").notNull().default("daily"),
  type: text("type").notNull().default("briefing"),
  enabled: boolean("enabled").default(true),
  config: jsonb("config"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_notification_user").on(table.userId),
]);

export const insertNotificationSettingSchema = createInsertSchema(notificationSettings).omit({ id: true, createdAt: true });

export const whiteLabelSettings = pgTable("white_label_settings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  logoUrl: text("logo_url"),
  organizationName: text("organization_name"),
  customReportTitle: text("custom_report_title"),
  primaryColor: text("primary_color"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_whitelabel_client").on(table.clientId),
]);

export const insertWhiteLabelSettingSchema = createInsertSchema(whiteLabelSettings).omit({ id: true, createdAt: true, updatedAt: true });

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  clientId: integer("client_id").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ticket_user").on(table.userId),
  index("idx_ticket_status").on(table.status),
]);

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true });

// === PRODUCT INTELLIGENCE: USER FEEDBACK ===
export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  feature: text("feature").notNull(),
  targetId: integer("target_id"),
  targetType: text("target_type"),
  rating: text("rating").notNull(),
  comment: text("comment"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_feedback_user").on(table.userId),
  index("idx_feedback_feature").on(table.feature),
]);

export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({ id: true, createdAt: true });

// === PRODUCT INTELLIGENCE: INSIGHT ENGAGEMENT ===
export const insightEngagement = pgTable("insight_engagement", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  insightType: text("insight_type").notNull(),
  insightId: integer("insight_id").notNull(),
  opened: boolean("opened").default(false),
  clicked: boolean("clicked").default(false),
  exported: boolean("exported").default(false),
  dwellTimeSeconds: integer("dwell_time_seconds"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_engagement_user").on(table.userId),
  index("idx_engagement_insight").on(table.insightType, table.insightId),
]);

export const insertInsightEngagementSchema = createInsertSchema(insightEngagement).omit({ id: true, createdAt: true });

// === PRODUCT INTELLIGENCE: AI CORRECTIONS ===
export const aiCorrections = pgTable("ai_corrections", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").references(() => articles.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => users.id).notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  status: text("status").notNull().default("pending"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_corrections_article").on(table.articleId),
  index("idx_corrections_user").on(table.userId),
]);

export const insertAiCorrectionSchema = createInsertSchema(aiCorrections).omit({ id: true, createdAt: true });

// === PRODUCT INTELLIGENCE: ALERT PREFERENCES ===
export const alertPreferences = pgTable("alert_preferences", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  alertType: text("alert_type").notNull(),
  sensitivityScore: integer("sensitivity_score").notNull().default(50),
  autoTuned: boolean("auto_tuned").default(false),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_alert_pref_client_type").on(table.clientId, table.alertType),
]);

export const insertAlertPreferenceSchema = createInsertSchema(alertPreferences).omit({ id: true, createdAt: true, lastUpdated: true });

// === PRODUCT INTELLIGENCE: DASHBOARD PREFERENCES ===
export const dashboardPreferences = pgTable("dashboard_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  pinnedTopics: text("pinned_topics").array(),
  favoriteEntities: text("favorite_entities").array(),
  preferredSources: integer("preferred_sources").array(),
  recommendedPanels: jsonb("recommended_panels"),
  frequentSearches: text("frequent_searches").array(),
  autoSuggested: boolean("auto_suggested").default(false),
  clientId: integer("client_id").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_dash_pref_user").on(table.userId),
]);

export const insertDashboardPreferenceSchema = createInsertSchema(dashboardPreferences).omit({ id: true, createdAt: true, updatedAt: true });

// === PRODUCT INTELLIGENCE: EXPERIMENTS (A/B TESTING) ===
export const experiments = pgTable("experiments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  variants: jsonb("variants").notNull(),
  targetPercentage: integer("target_percentage").default(50),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_experiment_name").on(table.name),
]);

export const insertExperimentSchema = createInsertSchema(experiments).omit({ id: true, createdAt: true });

export const experimentAssignments = pgTable("experiment_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  experimentId: integer("experiment_id").references(() => experiments.id).notNull(),
  variant: text("variant").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_exp_assign_user_exp").on(table.userId, table.experimentId),
]);

export const insertExperimentAssignmentSchema = createInsertSchema(experimentAssignments).omit({ id: true, createdAt: true });

// === PRODUCT INTELLIGENCE: KNOWLEDGE BASE ===
export const knowledgeEntries = pgTable("knowledge_entries", {
  id: serial("id").primaryKey(),
  questionPattern: text("question_pattern").notNull(),
  answerSummary: text("answer_summary").notNull(),
  queryCount: integer("query_count").notNull().default(1),
  clientId: integer("client_id").notNull(),
  lastUsed: timestamp("last_used").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_knowledge_pattern").on(table.questionPattern),
]);

export const insertKnowledgeEntrySchema = createInsertSchema(knowledgeEntries).omit({ id: true, createdAt: true, lastUsed: true });

// === PRODUCT INTELLIGENCE: VALUE REPORTS ===
export const valueReports = pgTable("value_reports", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  reportMonth: text("report_month").notNull(),
  alertsDetected: integer("alerts_detected").default(0),
  emergingTopicsCaught: integer("emerging_topics_caught").default(0),
  sentimentChanges: integer("sentiment_changes").default(0),
  estimatedTimeSavedMinutes: integer("estimated_time_saved_minutes").default(0),
  articlesProcessed: integer("articles_processed").default(0),
  briefsGenerated: integer("briefs_generated").default(0),
  reportData: jsonb("report_data"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_value_report_client_month").on(table.clientId, table.reportMonth),
]);

export const insertValueReportSchema = createInsertSchema(valueReports).omit({ id: true, createdAt: true });

// === INTEGRATION WEBHOOKS ===
export const integrationWebhooks = pgTable("integration_webhooks", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  eventTypes: text("event_types").array().notNull(),
  active: boolean("active").default(true),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_webhook_client").on(table.clientId),
]);

export const insertWebhookSchema = createInsertSchema(integrationWebhooks).omit({ id: true, createdAt: true });

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  statusCode: integer("status_code"),
  responseBody: text("response_body"),
  success: boolean("success").default(false),
  attempts: integer("attempts").default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_delivery_webhook").on(table.webhookId),
  index("idx_delivery_created").on(table.createdAt),
]);

export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({ id: true, createdAt: true });

// === EMAIL SUBSCRIPTIONS ===
export const emailSubscriptions = pgTable("email_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  email: text("email").notNull(),
  topics: text("topics").array(),
  frequency: text("frequency").notNull().default("daily"),
  sendAlerts: boolean("send_alerts").default(true),
  sendBriefing: boolean("send_briefing").default(true),
  sendWeeklySummary: boolean("send_weekly_summary").default(false),
  customSchedule: jsonb("custom_schedule"),
  active: boolean("active").default(true),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_email_sub_user").on(table.userId),
]);

export const insertEmailSubscriptionSchema = createInsertSchema(emailSubscriptions).omit({ id: true, createdAt: true });

// === INTEGRATION CONFIGS (Slack, Teams, etc.) ===
export const integrationConfigs = pgTable("integration_configs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  platform: text("platform").notNull(),
  channelId: text("channel_id"),
  channelName: text("channel_name"),
  webhookUrl: text("webhook_url"),
  sendAlerts: boolean("send_alerts").default(true),
  sendBriefing: boolean("send_briefing").default(true),
  sendWeeklySummary: boolean("send_weekly_summary").default(false),
  active: boolean("active").default(true),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_integ_config_client").on(table.clientId),
]);

export const insertIntegrationConfigSchema = createInsertSchema(integrationConfigs).omit({ id: true, createdAt: true });

// === EMBED TOKENS ===
export const embedTokens = pgTable("embed_tokens", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  token: text("token").notNull().unique(),
  widgetType: text("widget_type").notNull(),
  allowedDomains: text("allowed_domains").array(),
  active: boolean("active").default(true),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_embed_token").on(table.token),
  index("idx_embed_client").on(table.clientId),
]);

export const insertEmbedTokenSchema = createInsertSchema(embedTokens).omit({ id: true, createdAt: true });

// === EXPORT JOBS ===
export const exportJobs = pgTable("export_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  exportType: text("export_type").notNull(),
  format: text("format").notNull().default("json"),
  filters: jsonb("filters"),
  status: text("status").notNull().default("pending"),
  resultUrl: text("result_url"),
  resultData: jsonb("result_data"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_export_user").on(table.userId),
]);

export const insertExportJobSchema = createInsertSchema(exportJobs).omit({ id: true, createdAt: true, completedAt: true });

// === SSO CONFIGS ===
export const ssoConfigs = pgTable("sso_configs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  provider: text("provider").notNull(),
  entityId: text("entity_id"),
  ssoUrl: text("sso_url"),
  certificate: text("certificate"),
  metadataUrl: text("metadata_url"),
  defaultRole: text("default_role").default("client"),
  active: boolean("active").default(false),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_sso_client").on(table.clientId),
]);

export const insertSsoConfigSchema = createInsertSchema(ssoConfigs).omit({ id: true, createdAt: true });

// === DATA IMPORT CONNECTORS ===
export const importConnectors = pgTable("import_connectors", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  connectorType: text("connector_type").notNull(),
  name: text("name").notNull(),
  url: text("url"),
  config: jsonb("config"),
  lastImportAt: timestamp("last_import_at"),
  itemsImported: integer("items_imported").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_import_client").on(table.clientId),
]);

export const insertImportConnectorSchema = createInsertSchema(importConnectors).omit({ id: true, createdAt: true });

// === MOBILE NOTIFICATION PREFERENCES ===
export const mobileNotificationPrefs = pgTable("mobile_notification_prefs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  criticalAlerts: boolean("critical_alerts").default(true),
  briefingReady: boolean("briefing_ready").default(true),
  entityChanges: boolean("entity_changes").default(false),
  severityLevel: text("severity_level").default("high"),
  quietHoursStart: text("quiet_hours_start"),
  quietHoursEnd: text("quiet_hours_end"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_mobile_notif_user").on(table.userId),
]);

export const insertMobileNotificationPrefSchema = createInsertSchema(mobileNotificationPrefs).omit({ id: true, createdAt: true });

// === RELATIONS ===
export const sourceRelations = relations(sources, ({ many }) => ({
  articles: many(articles),
}));

export const articleRelations = relations(articles, ({ one }) => ({
  source: one(sources, {
    fields: [articles.sourceId],
    references: [sources.id],
  }),
}));

// === TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Source = typeof sources.$inferSelect;
export type InsertSource = z.infer<typeof insertSourceSchema>;

export type Article = typeof articles.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;

export type Keyword = typeof keywords.$inferSelect;
export type InsertKeyword = z.infer<typeof insertKeywordSchema>;

export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;

export type SourceFetchLog = typeof sourceFetchLogs.$inferSelect;
export type InsertSourceFetchLog = z.infer<typeof insertSourceFetchLogSchema>;

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type ClientKeyword = typeof clientKeywords.$inferSelect;
export type InsertClientKeyword = z.infer<typeof insertClientKeywordSchema>;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;

export type SystemError = typeof systemErrors.$inferSelect;
export type InsertSystemError = z.infer<typeof insertSystemErrorSchema>;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type AnalyticsCache = typeof analyticsCache.$inferSelect;
export type InsertAnalyticsCache = z.infer<typeof insertAnalyticsCacheSchema>;

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;

export type UsageMetric = typeof usageMetrics.$inferSelect;
export type InsertUsageMetric = z.infer<typeof insertUsageMetricSchema>;

export type StoryCluster = typeof storyClusters.$inferSelect;
export type InsertStoryCluster = z.infer<typeof insertStoryClusterSchema>;

export type ArticleAiAnalysis = typeof articleAiAnalysis.$inferSelect;
export type InsertArticleAiAnalysis = z.infer<typeof insertArticleAiAnalysisSchema>;

export type DailyBrief = typeof dailyBriefs.$inferSelect;
export type InsertDailyBrief = z.infer<typeof insertDailyBriefSchema>;

export type DetectedEvent = typeof detectedEvents.$inferSelect;
export type InsertDetectedEvent = z.infer<typeof insertDetectedEventSchema>;

export type EntityMention = typeof entityMentions.$inferSelect;
export type InsertEntityMention = z.infer<typeof insertEntityMentionSchema>;

export type TrendPrediction = typeof trendPredictions.$inferSelect;
export type InsertTrendPrediction = z.infer<typeof insertTrendPredictionSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type OnboardingState = typeof onboardingState.$inferSelect;
export type InsertOnboardingState = z.infer<typeof insertOnboardingStateSchema>;

export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = z.infer<typeof insertNotificationSettingSchema>;

export type WhiteLabelSetting = typeof whiteLabelSettings.$inferSelect;
export type InsertWhiteLabelSetting = z.infer<typeof insertWhiteLabelSettingSchema>;

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

export const PLAN_LIMITS = {
  basic: { maxUsers: 3, maxKeywords: 10, maxSources: 5, analyticsLevel: "standard", aiBriefLevel: "summary", apiAccess: false },
  pro: { maxUsers: 10, maxKeywords: 50, maxSources: 20, analyticsLevel: "advanced", aiBriefLevel: "full", apiAccess: true },
  enterprise: { maxUsers: -1, maxKeywords: -1, maxSources: -1, analyticsLevel: "full", aiBriefLevel: "custom", apiAccess: true },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export type UserFeedback = typeof userFeedback.$inferSelect;
export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;

export type InsightEngagement = typeof insightEngagement.$inferSelect;
export type InsertInsightEngagement = z.infer<typeof insertInsightEngagementSchema>;

export type AiCorrection = typeof aiCorrections.$inferSelect;
export type InsertAiCorrection = z.infer<typeof insertAiCorrectionSchema>;

export type AlertPreference = typeof alertPreferences.$inferSelect;
export type InsertAlertPreference = z.infer<typeof insertAlertPreferenceSchema>;

export type DashboardPreference = typeof dashboardPreferences.$inferSelect;
export type InsertDashboardPreference = z.infer<typeof insertDashboardPreferenceSchema>;

export type Experiment = typeof experiments.$inferSelect;
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;

export type ExperimentAssignment = typeof experimentAssignments.$inferSelect;
export type InsertExperimentAssignment = z.infer<typeof insertExperimentAssignmentSchema>;

export type KnowledgeEntry = typeof knowledgeEntries.$inferSelect;
export type InsertKnowledgeEntry = z.infer<typeof insertKnowledgeEntrySchema>;

export type ValueReport = typeof valueReports.$inferSelect;
export type InsertValueReport = z.infer<typeof insertValueReportSchema>;

// === TEAM WORKSPACES ===
export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });

export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("ws_member_unique").on(table.workspaceId, table.userId),
]);

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).omit({ id: true, createdAt: true });

// === DISCUSSION COMMENTS ===
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  message: text("message").notNull(),
  parentCommentId: integer("parent_comment_id"),
  workspaceId: integer("workspace_id"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("comments_target_idx").on(table.targetType, table.targetId),
]);

export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });

// === ANNOTATIONS & ANALYST NOTES ===
export const annotations = pgTable("annotations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  noteType: text("note_type").notNull().default("observation"),
  content: text("content").notNull(),
  workspaceId: integer("workspace_id"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("annotations_target_idx").on(table.targetType, table.targetId),
]);

export const insertAnnotationSchema = createInsertSchema(annotations).omit({ id: true, createdAt: true });

// === SHARED BRIEFINGS / REPORTS ===
export const sharedReports = pgTable("shared_reports", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  workspaceId: integer("workspace_id"),
  title: text("title").notNull(),
  summary: text("summary"),
  status: text("status").notNull().default("draft"),
  createdBy: integer("created_by").notNull(),
  shareToken: text("share_token"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSharedReportSchema = createInsertSchema(sharedReports).omit({ id: true, createdAt: true, lastUpdated: true });

export const briefingItems = pgTable("briefing_items", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  itemType: text("item_type").notNull(),
  itemRefId: integer("item_ref_id"),
  content: text("content"),
  position: integer("position").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBriefingItemSchema = createInsertSchema(briefingItems).omit({ id: true, createdAt: true });

// === CUSTOM TAGS ===
export const customTags = pgTable("custom_tags", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  workspaceId: integer("workspace_id"),
  name: text("name").notNull(),
  color: text("color"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomTagSchema = createInsertSchema(customTags).omit({ id: true, createdAt: true });

export const tagAssignments = pgTable("tag_assignments", {
  id: serial("id").primaryKey(),
  tagId: integer("tag_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tag_assign_target_idx").on(table.targetType, table.targetId),
]);

export const insertTagAssignmentSchema = createInsertSchema(tagAssignments).omit({ id: true, createdAt: true });

// === TASKS & FOLLOW-UP TRACKING ===
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  priority: text("priority").default("medium"),
  createdBy: integer("created_by").notNull(),
  assignedTo: integer("assigned_to"),
  relatedTargetType: text("related_target_type"),
  relatedTargetId: integer("related_target_id"),
  dueDate: timestamp("due_date"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });

// === WATCHLISTS ===
export const watchlists = pgTable("watchlists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  entityOrTopic: text("entity_or_topic").notNull(),
  targetType: text("target_type").notNull().default("entity"),
  workspaceId: integer("workspace_id"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWatchlistSchema = createInsertSchema(watchlists).omit({ id: true, createdAt: true });

// === INTERNAL ALERTS ===
export const internalAlerts = pgTable("internal_alerts", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  workspaceId: integer("workspace_id"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("internal_alerts_receiver_idx").on(table.receiverId),
]);

export const insertInternalAlertSchema = createInsertSchema(internalAlerts).omit({ id: true, createdAt: true });

// === CHANGE HISTORY ===
export const changeHistory = pgTable("change_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  changeType: text("change_type").notNull(),
  details: jsonb("details"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("change_history_entity_idx").on(table.entityType, table.entityId),
]);

export const insertChangeHistorySchema = createInsertSchema(changeHistory).omit({ id: true, createdAt: true });

// === ACTIVITY FEED ===
export const activityEvents = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id"),
  actorId: integer("actor_id").notNull(),
  verb: text("verb").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  metadata: jsonb("metadata"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("activity_events_ws_idx").on(table.workspaceId, table.createdAt),
]);

export const insertActivityEventSchema = createInsertSchema(activityEvents).omit({ id: true, createdAt: true });

export type IntegrationWebhook = typeof integrationWebhooks.$inferSelect;
export type InsertIntegrationWebhook = z.infer<typeof insertWebhookSchema>;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;

export type EmailSubscription = typeof emailSubscriptions.$inferSelect;
export type InsertEmailSubscription = z.infer<typeof insertEmailSubscriptionSchema>;

export type IntegrationConfig = typeof integrationConfigs.$inferSelect;
export type InsertIntegrationConfig = z.infer<typeof insertIntegrationConfigSchema>;

export type EmbedToken = typeof embedTokens.$inferSelect;
export type InsertEmbedToken = z.infer<typeof insertEmbedTokenSchema>;

export type ExportJob = typeof exportJobs.$inferSelect;
export type InsertExportJob = z.infer<typeof insertExportJobSchema>;

export type SsoConfig = typeof ssoConfigs.$inferSelect;
export type InsertSsoConfig = z.infer<typeof insertSsoConfigSchema>;

export type ImportConnector = typeof importConnectors.$inferSelect;
export type InsertImportConnector = z.infer<typeof insertImportConnectorSchema>;

export type MobileNotificationPref = typeof mobileNotificationPrefs.$inferSelect;
export type InsertMobileNotificationPref = z.infer<typeof insertMobileNotificationPrefSchema>;

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;

export type SharedReport = typeof sharedReports.$inferSelect;
export type InsertSharedReport = z.infer<typeof insertSharedReportSchema>;

export type BriefingItem = typeof briefingItems.$inferSelect;
export type InsertBriefingItem = z.infer<typeof insertBriefingItemSchema>;

export type CustomTag = typeof customTags.$inferSelect;
export type InsertCustomTag = z.infer<typeof insertCustomTagSchema>;

export type TagAssignment = typeof tagAssignments.$inferSelect;
export type InsertTagAssignment = z.infer<typeof insertTagAssignmentSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type Watchlist = typeof watchlists.$inferSelect;
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;

export type InternalAlert = typeof internalAlerts.$inferSelect;
export type InsertInternalAlert = z.infer<typeof insertInternalAlertSchema>;

export type ChangeHistoryEntry = typeof changeHistory.$inferSelect;
export type InsertChangeHistory = z.infer<typeof insertChangeHistorySchema>;

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = z.infer<typeof insertActivityEventSchema>;

// === KNOWLEDGE MEMORY & HISTORICAL INTELLIGENCE ===

export const storyTimelines = pgTable("story_timelines", {
  id: serial("id").primaryKey(),
  mainTopic: text("main_topic").notNull(),
  summary: text("summary"),
  status: text("status").notNull().default("active"),
  storyClusterId: integer("story_cluster_id"),
  clientId: integer("client_id").notNull(),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timelineEvents = pgTable("timeline_events", {
  id: serial("id").primaryKey(),
  timelineId: integer("timeline_id").notNull(),
  articleId: integer("article_id"),
  eventDate: timestamp("event_date").defaultNow(),
  label: text("label").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
});

export const recurringPatterns = pgTable("recurring_patterns", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  recurrenceInterval: text("recurrence_interval"),
  confidence: integer("confidence").default(50),
  lastOccurrence: timestamp("last_occurrence"),
  occurrenceCount: integer("occurrence_count").default(1),
  clientId: integer("client_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const entityMemory = pgTable("entity_memory", {
  id: serial("id").primaryKey(),
  entityName: text("entity_name").notNull(),
  entityType: text("entity_type"),
  biography: text("biography"),
  firstSeenAt: timestamp("first_seen_at"),
  lastSeenAt: timestamp("last_seen_at"),
  peakMoments: jsonb("peak_moments"),
  associatedTopics: text("associated_topics").array(),
  toneEvolution: jsonb("tone_evolution"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const narrativeShifts = pgTable("narrative_shifts", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  framingTerms: text("framing_terms").array(),
  sentimentDelta: integer("sentiment_delta"),
  summary: text("summary"),
  storyClusterId: integer("story_cluster_id"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const institutionalNotes = pgTable("institutional_notes", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  userId: integer("user_id"),
  relatedTopic: text("related_topic").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  content: text("content").notNull(),
  noteType: text("note_type").default("context"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const historicalMatches = pgTable("historical_matches", {
  id: serial("id").primaryKey(),
  currentStoryId: integer("current_story_id"),
  pastStoryId: integer("past_story_id"),
  similarityScore: integer("similarity_score").default(0),
  matchReason: text("match_reason"),
  acknowledged: boolean("acknowledged").default(false),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trendLifecycles = pgTable("trend_lifecycles", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  stage: text("stage").notNull().default("emergence"),
  stageStartAt: timestamp("stage_start_at").defaultNow(),
  signals: jsonb("signals"),
  clientId: integer("client_id").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const longRangeBriefings = pgTable("long_range_briefings", {
  id: serial("id").primaryKey(),
  periodType: text("period_type").notNull(),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  summary: text("summary"),
  findings: jsonb("findings"),
  generatedBy: integer("generated_by"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiMemoryAnswers = pgTable("ai_memory_answers", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  answer: text("answer"),
  contextRefs: jsonb("context_refs"),
  createdBy: integer("created_by"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Knowledge Memory Insert Schemas
export const insertStoryTimelineSchema = createInsertSchema(storyTimelines).omit({ id: true, createdAt: true });
export const insertTimelineEventSchema = createInsertSchema(timelineEvents).omit({ id: true });
export const insertRecurringPatternSchema = createInsertSchema(recurringPatterns).omit({ id: true, createdAt: true });
export const insertEntityMemorySchema = createInsertSchema(entityMemory).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNarrativeShiftSchema = createInsertSchema(narrativeShifts).omit({ id: true, createdAt: true });
export const insertInstitutionalNoteSchema = createInsertSchema(institutionalNotes).omit({ id: true, createdAt: true });
export const insertHistoricalMatchSchema = createInsertSchema(historicalMatches).omit({ id: true, createdAt: true });
export const insertTrendLifecycleSchema = createInsertSchema(trendLifecycles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLongRangeBriefingSchema = createInsertSchema(longRangeBriefings).omit({ id: true, createdAt: true });
export const insertAiMemoryAnswerSchema = createInsertSchema(aiMemoryAnswers).omit({ id: true, createdAt: true });

// Knowledge Memory Types
export type StoryTimeline = typeof storyTimelines.$inferSelect;
export type InsertStoryTimeline = z.infer<typeof insertStoryTimelineSchema>;

export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type InsertTimelineEvent = z.infer<typeof insertTimelineEventSchema>;

export type RecurringPattern = typeof recurringPatterns.$inferSelect;
export type InsertRecurringPattern = z.infer<typeof insertRecurringPatternSchema>;

export type EntityMemory = typeof entityMemory.$inferSelect;
export type InsertEntityMemory = z.infer<typeof insertEntityMemorySchema>;

export type NarrativeShift = typeof narrativeShifts.$inferSelect;
export type InsertNarrativeShift = z.infer<typeof insertNarrativeShiftSchema>;

export type InstitutionalNote = typeof institutionalNotes.$inferSelect;
export type InsertInstitutionalNote = z.infer<typeof insertInstitutionalNoteSchema>;

export type HistoricalMatch = typeof historicalMatches.$inferSelect;
export type InsertHistoricalMatch = z.infer<typeof insertHistoricalMatchSchema>;

export type TrendLifecycle = typeof trendLifecycles.$inferSelect;
export type InsertTrendLifecycle = z.infer<typeof insertTrendLifecycleSchema>;

export type LongRangeBriefing = typeof longRangeBriefings.$inferSelect;
export type InsertLongRangeBriefing = z.infer<typeof insertLongRangeBriefingSchema>;

export type AiMemoryAnswer = typeof aiMemoryAnswers.$inferSelect;
export type InsertAiMemoryAnswer = z.infer<typeof insertAiMemoryAnswerSchema>;

// === PREDICTIVE INTELLIGENCE & FORECASTING ===

export const topicForecasts = pgTable("topic_forecasts", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  topic: text("topic").notNull(),
  momentum: integer("momentum").default(0),
  acceleration: integer("acceleration").default(0),
  mediaAmplification: integer("media_amplification").default(0),
  actorExpansion: integer("actor_expansion").default(0),
  next24hProbability: integer("next_24h_probability").default(50),
  next7dProbability: integer("next_7d_probability").default(50),
  predictedStage: text("predicted_stage").default("emerging"),
  confidenceScore: integer("confidence_score").default(50),
  explanation: text("explanation"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTopicForecastSchema = createInsertSchema(topicForecasts).omit({ id: true, createdAt: true });

export const earlySignals = pgTable("early_signals", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  signalType: text("signal_type").notNull(),
  relatedTopic: text("related_topic").notNull(),
  strength: integer("strength").default(50),
  explanation: text("explanation"),
  detectedAt: timestamp("detected_at").defaultNow(),
});

export const insertEarlySignalSchema = createInsertSchema(earlySignals).omit({ id: true, detectedAt: true });

export const riskScores = pgTable("risk_scores", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  subject: text("subject").notNull(),
  subjectType: text("subject_type").default("topic"),
  operationalRisk: integer("operational_risk").default(0),
  reputationalRisk: integer("reputational_risk").default(0),
  escalationRisk: integer("escalation_risk").default(0),
  confidence: integer("confidence").default(50),
  explanation: text("explanation"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRiskScoreSchema = createInsertSchema(riskScores).omit({ id: true, createdAt: true });

export const influenceGraph = pgTable("influence_graph", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  sourceA: text("source_a").notNull(),
  sourceB: text("source_b").notNull(),
  influenceStrength: integer("influence_strength").default(50),
  cascadeDelay: integer("cascade_delay"),
  relationship: text("relationship").default("amplifies"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInfluenceGraphSchema = createInsertSchema(influenceGraph).omit({ id: true, createdAt: true });

export const attentionDecay = pgTable("attention_decay", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  topic: text("topic").notNull(),
  estimatedDaysRemaining: integer("estimated_days_remaining").default(7),
  peakDate: timestamp("peak_date"),
  decayRate: integer("decay_rate").default(50),
  explanation: text("explanation"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAttentionDecaySchema = createInsertSchema(attentionDecay).omit({ id: true, createdAt: true });

export const alertPriorityScores = pgTable("alert_priority_scores", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  alertId: integer("alert_id"),
  topic: text("topic"),
  score: integer("score").default(50),
  acceleratingCoverage: boolean("accelerating_coverage").default(false),
  multiRegionSpread: boolean("multi_region_spread").default(false),
  sentimentVolatility: boolean("sentiment_volatility").default(false),
  explanation: text("explanation"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAlertPriorityScoreSchema = createInsertSchema(alertPriorityScores).omit({ id: true, createdAt: true });

export const forecastResults = pgTable("forecast_results", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  forecastId: integer("forecast_id"),
  forecastType: text("forecast_type").notNull(),
  originalPrediction: text("original_prediction"),
  outcome: text("outcome"),
  accuracyScore: integer("accuracy_score"),
  evaluatedAt: timestamp("evaluated_at").defaultNow(),
});

export const insertForecastResultSchema = createInsertSchema(forecastResults).omit({ id: true, evaluatedAt: true });

export const futureBriefings = pgTable("future_briefings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  date: text("date").notNull(),
  possibleEscalations: jsonb("possible_escalations").$type<{ topic: string; probability: number; explanation: string }[]>().default([]),
  emergingActors: jsonb("emerging_actors").$type<{ name: string; context: string }[]>().default([]),
  fadingTopics: jsonb("fading_topics").$type<{ topic: string; estimatedDaysLeft: number }[]>().default([]),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFutureBriefingSchema = createInsertSchema(futureBriefings).omit({ id: true, createdAt: true });

export type TopicForecast = typeof topicForecasts.$inferSelect;
export type InsertTopicForecast = z.infer<typeof insertTopicForecastSchema>;

export type EarlySignal = typeof earlySignals.$inferSelect;
export type InsertEarlySignal = z.infer<typeof insertEarlySignalSchema>;

export type RiskScore = typeof riskScores.$inferSelect;
export type InsertRiskScore = z.infer<typeof insertRiskScoreSchema>;

export type InfluenceGraphEntry = typeof influenceGraph.$inferSelect;
export type InsertInfluenceGraphEntry = z.infer<typeof insertInfluenceGraphSchema>;

export type AttentionDecayEntry = typeof attentionDecay.$inferSelect;
export type InsertAttentionDecayEntry = z.infer<typeof insertAttentionDecaySchema>;

export type AlertPriorityScore = typeof alertPriorityScores.$inferSelect;
export type InsertAlertPriorityScore = z.infer<typeof insertAlertPriorityScoreSchema>;

export type ForecastResult = typeof forecastResults.$inferSelect;
export type InsertForecastResult = z.infer<typeof insertForecastResultSchema>;

export type FutureBriefing = typeof futureBriefings.$inferSelect;
export type InsertFutureBriefing = z.infer<typeof insertFutureBriefingSchema>;

// === ARTICLE TRANSLATIONS CACHE ===
export const articleTranslations = pgTable("article_translations", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  targetLanguage: text("target_language").notNull(),
  status: text("status").notNull().default("pending"),
  translatedTitle: text("translated_title"),
  translatedContent: text("translated_content"),
  translatedSummary: text("translated_summary"),
  clientId: integer("client_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("article_translations_article_lang_idx").on(table.articleId, table.targetLanguage),
]);

export const insertArticleTranslationSchema = createInsertSchema(articleTranslations).omit({ id: true, createdAt: true });
export type ArticleTranslation = typeof articleTranslations.$inferSelect;
export type InsertArticleTranslation = z.infer<typeof insertArticleTranslationSchema>;

// === ENTERPRISE ACCESS CONTROL: PERMISSION GROUPS ===
export const permissionGroups = pgTable("permission_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPermissionGroupSchema = createInsertSchema(permissionGroups).omit({ id: true, createdAt: true });

// === ENTERPRISE ACCESS CONTROL: PERMISSIONS ===
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  scope: text("scope").notNull().default("org"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_permissions_resource").on(table.resource),
  index("idx_permissions_code").on(table.code),
]);

export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true, createdAt: true });

// === ENTERPRISE ACCESS CONTROL: GROUP → PERMISSION MAPPING ===
export const groupPermissions = pgTable("group_permissions", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => permissionGroups.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("group_perm_unique").on(table.groupId, table.permissionId),
]);

export const insertGroupPermissionSchema = createInsertSchema(groupPermissions).omit({ id: true, createdAt: true });

// === ENTERPRISE ACCESS CONTROL: USER → PERMISSION GROUP MAPPING ===
export const userPermissionGroups = pgTable("user_permission_groups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull().references(() => permissionGroups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("user_perm_group_unique").on(table.userId, table.groupId),
]);

export const insertUserPermissionGroupSchema = createInsertSchema(userPermissionGroups).omit({ id: true, createdAt: true });

// === ENTERPRISE ACCESS CONTROL: USER → DIRECT PERMISSION MAPPING ===
export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  granted: boolean("granted").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("user_perm_unique").on(table.userId, table.permissionId),
]);

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({ id: true, createdAt: true });

// === IMPERSONATION AUDIT LOG ===
export const impersonationLogs = pgTable("impersonation_logs", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id").notNull().references(() => users.id),
  targetUserId: integer("target_user_id"),
  targetOrganizationId: integer("target_organization_id"),
  action: text("action").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_impersonation_admin").on(table.adminUserId),
  index("idx_impersonation_created").on(table.createdAt),
]);

export const insertImpersonationLogSchema = createInsertSchema(impersonationLogs).omit({ id: true, createdAt: true });

// RBAC Types
export type PermissionGroup = typeof permissionGroups.$inferSelect;
export type InsertPermissionGroup = z.infer<typeof insertPermissionGroupSchema>;

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;

export type GroupPermission = typeof groupPermissions.$inferSelect;
export type InsertGroupPermission = z.infer<typeof insertGroupPermissionSchema>;

export type UserPermissionGroup = typeof userPermissionGroups.$inferSelect;
export type InsertUserPermissionGroup = z.infer<typeof insertUserPermissionGroupSchema>;

export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;

export type ImpersonationLog = typeof impersonationLogs.$inferSelect;
export type InsertImpersonationLog = z.infer<typeof insertImpersonationLogSchema>;

// === SYSTEM ROLES ===
export const SYSTEM_ROLES = {
  SYSTEM_ADMIN: "admin",
  CLIENT_ADMIN: "client_admin",
  CLIENT_USER: "client",
  READONLY_USER: "viewer",
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

// === USER TYPES (sub-roles under CLIENT_USER) ===
export const USER_TYPES = {
  READER: "reader",
  ANALYST: "analyst",
  EDITOR: "editor",
  MONITOR: "monitor",
  EXECUTIVE: "executive",
  INTEGRATIONS_MANAGER: "integrations_manager",
} as const;

export type UserType = (typeof USER_TYPES)[keyof typeof USER_TYPES];

export const USER_TYPE_LABELS: Record<string, string> = {
  reader: "Reader",
  analyst: "Analyst",
  editor: "Editor",
  monitor: "Monitor",
  executive: "Executive",
  integrations_manager: "Integrations Manager",
};

// === PLAN TIERS ===
export const PLAN_TIERS = {
  STARTER: "starter",
  PRO: "pro",
  ENTERPRISE: "enterprise",
} as const;

export type PlanTier = (typeof PLAN_TIERS)[keyof typeof PLAN_TIERS];

export const PLAN_TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

// === AI TIERS ===
export const AI_TIERS = {
  NONE: "none",
  BASIC: "basic_ai",
  PRO: "pro_ai",
} as const;

export type AiTier = (typeof AI_TIERS)[keyof typeof AI_TIERS];

// === CAPABILITIES (granular permission codes) ===
export const CAPS = {
  FEED_VIEW: "feed_view",
  FEED_SEARCH: "feed_search",
  FEED_FILTER: "feed_filter",
  ARTICLE_VIEW: "article_view",
  ARTICLE_SAVE: "article_save",
  ARTICLE_EXPORT: "article_export",

  SOURCES_VIEW: "sources_view",
  SOURCES_ADD: "sources_add",
  SOURCES_EDIT: "sources_edit",
  SOURCES_DELETE: "sources_delete",
  SOURCE_HEALTH_VIEW: "source_health_view",

  KEYWORDS_VIEW: "keywords_view",
  KEYWORDS_ADD: "keywords_add",
  KEYWORDS_EDIT: "keywords_edit",
  KEYWORDS_DELETE: "keywords_delete",

  ANALYTICS_VIEW: "analytics_view",
  ANALYTICS_OVERVIEW: "analytics_overview",
  ANALYTICS_CONTENT_VOLUME: "analytics_content_volume",
  ANALYTICS_TRENDING_TOPICS: "analytics_trending_topics",
  ANALYTICS_KEYWORD_ANALYSIS: "analytics_keyword_analysis",
  ANALYTICS_TONE_REPORTS: "analytics_tone_reports",
  ANALYTICS_SOURCE_BEHAVIOR: "analytics_source_behavior",
  ANALYTICS_NETWORK_MAPPING: "analytics_network_mapping",
  ANALYTICS_NARRATIVE_COMPARISON: "analytics_narrative_comparison",
  ANALYTICS_CUSTOM_REPORTS: "analytics_custom_reports",
  ANALYTICS_EXPORT: "analytics_export",

  INTELLIGENCE_VIEW: "intelligence_view",
  INTELLIGENCE_DAILY_BRIEF: "intelligence_daily_brief",
  INTELLIGENCE_PREDICTIONS: "intelligence_predictions",
  INTELLIGENCE_QA: "intelligence_qa",
  INTELLIGENCE_RUN: "intelligence_run",
  EXECUTIVE_HOME: "executive_home",

  COLLAB_VIEW: "collab_view",
  COLLAB_COMMENTS: "collab_comments",
  COLLAB_ANNOTATIONS: "collab_annotations",
  COLLAB_TASKS: "collab_tasks",

  INTEGRATIONS_VIEW: "integrations_view",
  INTEGRATIONS_MANAGE: "integrations_manage",
  INTEGRATION_MONITOR_VIEW: "integration_monitor_view",

  USERS_VIEW: "users_view",
  USERS_INVITE: "users_invite",
  USERS_EDIT: "users_edit",
  USERS_DISABLE: "users_disable",
  USERS_ASSIGN_ROLES: "users_assign_roles",
  PERMISSIONS_MANAGE: "permissions_manage",

  BILLING_VIEW: "billing_view",
  BILLING_MANAGE: "billing_manage",
  AI_USAGE_VIEW: "ai_usage_view",

  KNOWLEDGE_VIEW: "knowledge_view",
  KNOWLEDGE_MANAGE: "knowledge_manage",
  KNOWLEDGE_COMPUTE: "knowledge_compute",

  FORECAST_VIEW: "forecast_view",
  FORECAST_MANAGE: "forecast_manage",
  FORECAST_COMPUTE: "forecast_compute",

  ADMIN_SYSTEM_DASHBOARD: "admin_system_dashboard",
  ADMIN_TENANT_SWITCH: "admin_tenant_switch",
  ADMIN_IMPERSONATE: "admin_impersonate",
  ADMIN_AUDIT_LOGS: "admin_audit_logs",
  ADMIN_OPERATIONS: "admin_operations",
  ADMIN_JOB_MONITOR: "admin_job_monitor",
  ADMIN_PRODUCT_ANALYTICS: "admin_product_analytics",
} as const;

export type Cap = (typeof CAPS)[keyof typeof CAPS];

// === DEFAULT CAPABILITY SETS BY USER TYPE ===
const READER_CAPS: Cap[] = [
  CAPS.FEED_VIEW, CAPS.FEED_SEARCH, CAPS.FEED_FILTER,
  CAPS.ARTICLE_VIEW, CAPS.ARTICLE_SAVE,
];

const ANALYST_CAPS: Cap[] = [
  ...READER_CAPS,
  CAPS.ANALYTICS_VIEW, CAPS.ANALYTICS_OVERVIEW, CAPS.ANALYTICS_CONTENT_VOLUME,
  CAPS.ANALYTICS_TRENDING_TOPICS, CAPS.ANALYTICS_KEYWORD_ANALYSIS,
  CAPS.ANALYTICS_TONE_REPORTS, CAPS.ANALYTICS_SOURCE_BEHAVIOR,
  CAPS.ANALYTICS_NETWORK_MAPPING, CAPS.ANALYTICS_NARRATIVE_COMPARISON,
  CAPS.ANALYTICS_CUSTOM_REPORTS, CAPS.ANALYTICS_EXPORT,
  CAPS.KEYWORDS_VIEW,
  CAPS.AI_USAGE_VIEW,
  CAPS.INTELLIGENCE_RUN,
  CAPS.KNOWLEDGE_VIEW,
  CAPS.FORECAST_VIEW,
];

const EDITOR_CAPS: Cap[] = [
  ...READER_CAPS,
  CAPS.KEYWORDS_VIEW, CAPS.KEYWORDS_ADD, CAPS.KEYWORDS_EDIT,
  CAPS.COLLAB_VIEW, CAPS.COLLAB_COMMENTS, CAPS.COLLAB_ANNOTATIONS,
  CAPS.ANALYTICS_CUSTOM_REPORTS,
];

const MONITOR_CAPS: Cap[] = [
  CAPS.FEED_VIEW,
  CAPS.SOURCE_HEALTH_VIEW,
  CAPS.INTEGRATION_MONITOR_VIEW,
  CAPS.ADMIN_JOB_MONITOR,
];

const EXECUTIVE_CAPS: Cap[] = [
  CAPS.FEED_VIEW, CAPS.ARTICLE_VIEW,
  CAPS.EXECUTIVE_HOME,
  CAPS.INTELLIGENCE_DAILY_BRIEF,
];

const INTEGRATIONS_MANAGER_CAPS: Cap[] = [
  CAPS.INTEGRATIONS_VIEW, CAPS.INTEGRATIONS_MANAGE,
  CAPS.INTEGRATION_MONITOR_VIEW,
  CAPS.SOURCES_VIEW,
];

const CLIENT_ADMIN_CAPS: Cap[] = [
  ...READER_CAPS,
  CAPS.ARTICLE_EXPORT,
  CAPS.SOURCES_VIEW, CAPS.SOURCES_ADD, CAPS.SOURCES_EDIT, CAPS.SOURCES_DELETE,
  CAPS.SOURCE_HEALTH_VIEW,
  CAPS.KEYWORDS_VIEW, CAPS.KEYWORDS_ADD, CAPS.KEYWORDS_EDIT, CAPS.KEYWORDS_DELETE,
  CAPS.ANALYTICS_VIEW, CAPS.ANALYTICS_OVERVIEW, CAPS.ANALYTICS_CONTENT_VOLUME,
  CAPS.ANALYTICS_TRENDING_TOPICS, CAPS.ANALYTICS_KEYWORD_ANALYSIS,
  CAPS.ANALYTICS_TONE_REPORTS, CAPS.ANALYTICS_SOURCE_BEHAVIOR,
  CAPS.ANALYTICS_NETWORK_MAPPING, CAPS.ANALYTICS_NARRATIVE_COMPARISON,
  CAPS.ANALYTICS_CUSTOM_REPORTS, CAPS.ANALYTICS_EXPORT,
  CAPS.INTELLIGENCE_RUN,
  CAPS.COLLAB_VIEW, CAPS.COLLAB_COMMENTS, CAPS.COLLAB_ANNOTATIONS, CAPS.COLLAB_TASKS,
  CAPS.INTEGRATIONS_VIEW, CAPS.INTEGRATIONS_MANAGE, CAPS.INTEGRATION_MONITOR_VIEW,
  CAPS.USERS_VIEW, CAPS.USERS_INVITE, CAPS.USERS_EDIT, CAPS.USERS_DISABLE,
  CAPS.USERS_ASSIGN_ROLES, CAPS.PERMISSIONS_MANAGE,
  CAPS.BILLING_VIEW, CAPS.BILLING_MANAGE, CAPS.AI_USAGE_VIEW,
  CAPS.KNOWLEDGE_VIEW, CAPS.KNOWLEDGE_MANAGE, CAPS.KNOWLEDGE_COMPUTE,
  CAPS.FORECAST_VIEW, CAPS.FORECAST_MANAGE, CAPS.FORECAST_COMPUTE,
  CAPS.EXECUTIVE_HOME,
];

const GLOBAL_ADMIN_CAPS: Cap[] = [
  ...CLIENT_ADMIN_CAPS,
  CAPS.INTELLIGENCE_VIEW, CAPS.INTELLIGENCE_DAILY_BRIEF,
  CAPS.INTELLIGENCE_PREDICTIONS, CAPS.INTELLIGENCE_QA,
  CAPS.ADMIN_SYSTEM_DASHBOARD, CAPS.ADMIN_TENANT_SWITCH,
  CAPS.ADMIN_IMPERSONATE, CAPS.ADMIN_AUDIT_LOGS,
  CAPS.ADMIN_OPERATIONS, CAPS.ADMIN_JOB_MONITOR,
  CAPS.ADMIN_PRODUCT_ANALYTICS,
];

export const DEFAULT_CAPS_BY_USER_TYPE: Record<string, Cap[]> = {
  [USER_TYPES.READER]: READER_CAPS,
  [USER_TYPES.ANALYST]: ANALYST_CAPS,
  [USER_TYPES.EDITOR]: EDITOR_CAPS,
  [USER_TYPES.MONITOR]: MONITOR_CAPS,
  [USER_TYPES.EXECUTIVE]: EXECUTIVE_CAPS,
  [USER_TYPES.INTEGRATIONS_MANAGER]: INTEGRATIONS_MANAGER_CAPS,
};

export const DEFAULT_CAPS_BY_ROLE: Record<string, Cap[]> = {
  [SYSTEM_ROLES.SYSTEM_ADMIN]: GLOBAL_ADMIN_CAPS,
  [SYSTEM_ROLES.CLIENT_ADMIN]: CLIENT_ADMIN_CAPS,
  [SYSTEM_ROLES.CLIENT_USER]: READER_CAPS,
  [SYSTEM_ROLES.READONLY_USER]: READER_CAPS,
};

// === PLAN TIER FEATURE GATES ===
export const PLAN_FEATURES: Record<string, Cap[]> = {
  [PLAN_TIERS.STARTER]: [
    CAPS.FEED_VIEW, CAPS.FEED_SEARCH, CAPS.FEED_FILTER,
    CAPS.ARTICLE_VIEW, CAPS.ARTICLE_SAVE,
    CAPS.SOURCES_VIEW, CAPS.SOURCES_ADD, CAPS.SOURCES_EDIT, CAPS.SOURCES_DELETE,
    CAPS.KEYWORDS_VIEW, CAPS.KEYWORDS_ADD, CAPS.KEYWORDS_EDIT, CAPS.KEYWORDS_DELETE,
    CAPS.ANALYTICS_VIEW, CAPS.ANALYTICS_OVERVIEW, CAPS.ANALYTICS_CONTENT_VOLUME,
    CAPS.USERS_VIEW, CAPS.USERS_INVITE, CAPS.USERS_EDIT, CAPS.USERS_DISABLE,
    CAPS.USERS_ASSIGN_ROLES, CAPS.PERMISSIONS_MANAGE,
    CAPS.BILLING_VIEW, CAPS.BILLING_MANAGE,
    CAPS.SOURCE_HEALTH_VIEW,
  ],
  [PLAN_TIERS.PRO]: [
    CAPS.FEED_VIEW, CAPS.FEED_SEARCH, CAPS.FEED_FILTER,
    CAPS.ARTICLE_VIEW, CAPS.ARTICLE_SAVE, CAPS.ARTICLE_EXPORT,
    CAPS.SOURCES_VIEW, CAPS.SOURCES_ADD, CAPS.SOURCES_EDIT, CAPS.SOURCES_DELETE,
    CAPS.SOURCE_HEALTH_VIEW,
    CAPS.KEYWORDS_VIEW, CAPS.KEYWORDS_ADD, CAPS.KEYWORDS_EDIT, CAPS.KEYWORDS_DELETE,
    CAPS.ANALYTICS_VIEW, CAPS.ANALYTICS_OVERVIEW, CAPS.ANALYTICS_CONTENT_VOLUME,
    CAPS.ANALYTICS_TRENDING_TOPICS, CAPS.ANALYTICS_KEYWORD_ANALYSIS,
    CAPS.ANALYTICS_TONE_REPORTS, CAPS.ANALYTICS_SOURCE_BEHAVIOR,
    CAPS.ANALYTICS_NETWORK_MAPPING, CAPS.ANALYTICS_NARRATIVE_COMPARISON,
    CAPS.ANALYTICS_CUSTOM_REPORTS, CAPS.ANALYTICS_EXPORT,
    CAPS.INTELLIGENCE_RUN,
    CAPS.COLLAB_VIEW, CAPS.COLLAB_COMMENTS, CAPS.COLLAB_ANNOTATIONS, CAPS.COLLAB_TASKS,
    CAPS.INTEGRATIONS_VIEW, CAPS.INTEGRATIONS_MANAGE,
    CAPS.USERS_VIEW, CAPS.USERS_INVITE, CAPS.USERS_EDIT, CAPS.USERS_DISABLE,
    CAPS.USERS_ASSIGN_ROLES, CAPS.PERMISSIONS_MANAGE,
    CAPS.BILLING_VIEW, CAPS.BILLING_MANAGE,
    CAPS.AI_USAGE_VIEW,
    CAPS.KNOWLEDGE_VIEW, CAPS.KNOWLEDGE_MANAGE,
    CAPS.FORECAST_VIEW,
    CAPS.INTEGRATION_MONITOR_VIEW,
  ],
  [PLAN_TIERS.ENTERPRISE]: Object.values(CAPS).filter(c =>
    !c.startsWith("admin_")
  ) as Cap[],
};

// AI-gated capabilities (only available if tenant.aiEnabled)
export const AI_GATED_CAPS: Cap[] = [
  CAPS.INTELLIGENCE_VIEW, CAPS.INTELLIGENCE_DAILY_BRIEF,
  CAPS.INTELLIGENCE_PREDICTIONS, CAPS.INTELLIGENCE_QA,
  CAPS.INTELLIGENCE_RUN, CAPS.AI_USAGE_VIEW,
  CAPS.KNOWLEDGE_COMPUTE,
  CAPS.FORECAST_COMPUTE,
];

// Resolve effective capabilities for a user
export function resolveEffectiveCaps(
  role: string,
  userType: string | null,
  planTier: string,
  aiEnabled: boolean,
  userOverrides?: string[] | null,
): Cap[] {
  if (role === SYSTEM_ROLES.SYSTEM_ADMIN) {
    return GLOBAL_ADMIN_CAPS;
  }

  let baseCaps: Cap[];
  if (role === SYSTEM_ROLES.CLIENT_ADMIN) {
    baseCaps = [...CLIENT_ADMIN_CAPS];
  } else if (role === SYSTEM_ROLES.CLIENT_USER && userType && DEFAULT_CAPS_BY_USER_TYPE[userType]) {
    baseCaps = [...DEFAULT_CAPS_BY_USER_TYPE[userType]];
  } else {
    baseCaps = [...READER_CAPS];
  }

  if (userOverrides && userOverrides.length > 0) {
    for (const cap of userOverrides) {
      if (!baseCaps.includes(cap as Cap)) {
        baseCaps.push(cap as Cap);
      }
    }
  }

  const planAllowed = PLAN_FEATURES[planTier] || PLAN_FEATURES[PLAN_TIERS.STARTER];
  const adminCaps = baseCaps.filter(c => c.startsWith("admin_"));
  let filtered = baseCaps.filter(c => planAllowed.includes(c as Cap) || adminCaps.includes(c as Cap));

  if (!aiEnabled) {
    filtered = filtered.filter(c => !AI_GATED_CAPS.includes(c as Cap));
  }

  if (aiEnabled && role === SYSTEM_ROLES.CLIENT_ADMIN) {
    if (!filtered.includes(CAPS.INTELLIGENCE_VIEW)) filtered.push(CAPS.INTELLIGENCE_VIEW);
    if (!filtered.includes(CAPS.INTELLIGENCE_DAILY_BRIEF)) filtered.push(CAPS.INTELLIGENCE_DAILY_BRIEF);
    if (!filtered.includes(CAPS.AI_USAGE_VIEW)) filtered.push(CAPS.AI_USAGE_VIEW);
    if (!filtered.includes(CAPS.KNOWLEDGE_COMPUTE)) filtered.push(CAPS.KNOWLEDGE_COMPUTE);
    if (!filtered.includes(CAPS.FORECAST_COMPUTE)) filtered.push(CAPS.FORECAST_COMPUTE);
  }

  if (aiEnabled && userType === USER_TYPES.ANALYST) {
    if (!filtered.includes(CAPS.INTELLIGENCE_VIEW)) filtered.push(CAPS.INTELLIGENCE_VIEW);
    if (!filtered.includes(CAPS.INTELLIGENCE_DAILY_BRIEF)) filtered.push(CAPS.INTELLIGENCE_DAILY_BRIEF);
    if (!filtered.includes(CAPS.INTELLIGENCE_PREDICTIONS)) filtered.push(CAPS.INTELLIGENCE_PREDICTIONS);
    if (!filtered.includes(CAPS.KNOWLEDGE_COMPUTE)) filtered.push(CAPS.KNOWLEDGE_COMPUTE);
    if (!filtered.includes(CAPS.FORECAST_COMPUTE)) filtered.push(CAPS.FORECAST_COMPUTE);
  }

  return Array.from(new Set(filtered));
}

// Legacy compat
export const PERMISSION_CODES = {
  ARTICLES_READ: "articles:read:org",
  ARTICLES_MANAGE: "articles:manage:org",
  SOURCES_READ: "sources:read:org",
  SOURCES_MANAGE: "sources:manage:org",
  ANALYTICS_VIEW: "analytics:view:org",
  ANALYTICS_EXPORT: "analytics:export:org",
  REPORTS_VIEW: "reports:view:org",
  REPORTS_EXPORT: "reports:export:org",
  AI_VIEW: "ai:view:org",
  AI_CONFIGURE: "ai:configure:org",
  USERS_VIEW: "users:view:org",
  USERS_MANAGE: "users:manage:org",
  SETTINGS_VIEW: "settings:view:org",
  SETTINGS_MANAGE: "settings:manage:org",
  INTELLIGENCE_VIEW: "intelligence:view:org",
  INTELLIGENCE_MANAGE: "intelligence:manage:org",
  BILLING_VIEW: "billing:view:org",
  BILLING_MANAGE: "billing:manage:org",
  COLLABORATION_VIEW: "collaboration:view:org",
  COLLABORATION_CONTRIBUTE: "collaboration:contribute:org",
  COLLABORATION_MANAGE: "collaboration:manage:org",
  INTEGRATIONS_VIEW: "integrations:view:org",
  INTEGRATIONS_MANAGE: "integrations:manage:org",
  PLATFORM_MONITOR: "platform:monitor:any",
  PLATFORM_IMPERSONATE: "platform:impersonate:any",
  PLATFORM_ADMIN: "platform:admin:any",
} as const;

export type PermissionCode = (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES];

export const DEFAULT_PERMISSION_GROUPS = {
  PLATFORM_ADMIN: "platform_admin",
  ORG_ADMIN: "org_admin",
  ANALYST: "analyst",
  VIEWER: "viewer",
} as const;

// Request Types
export type LoginRequest = Pick<InsertUser, "username" | "password">;
export type RegisterRequest = InsertUser;

export type CreateSourceRequest = InsertSource;
export type UpdateSourceRequest = Partial<InsertSource>;

export type CreateKeywordRequest = InsertKeyword;

// === INSIGHT JOBS (AI Cost Control) ===
export const INSIGHT_JOB_STATUSES = ["queued", "scheduled", "running", "completed", "failed", "blocked_budget", "expired"] as const;
export type InsightJobStatus = typeof INSIGHT_JOB_STATUSES[number];

export const insightJobs = pgTable("insight_jobs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("queued"),
  attempt: integer("attempt").notNull().default(0),
  payload: jsonb("payload").$type<{
    systemPrompt: string;
    userContent: string;
    responseFormat?: { type: "json_object" } | { type: "text" };
  }>(),
  result: jsonb("result").$type<{
    content: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>(),
  maxTokens: integer("max_tokens").default(500),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  index("idx_insight_jobs_client").on(table.clientId),
  index("idx_insight_jobs_status").on(table.status),
  index("idx_insight_jobs_status_created").on(table.status, table.createdAt),
]);

export const insertInsightJobSchema = createInsertSchema(insightJobs).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export type InsightJob = typeof insightJobs.$inferSelect;
export type InsertInsightJob = z.infer<typeof insertInsightJobSchema>;

export const aiUsageLog = pgTable("ai_usage_log", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  attempt: integer("attempt").notNull().default(0),
  clientId: integer("client_id").notNull(),
  type: text("type").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ai_usage_client").on(table.clientId),
  index("idx_ai_usage_job").on(table.jobId),
  uniqueIndex("uq_ai_usage_job_attempt").on(table.jobId, table.attempt),
]);

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLog).omit({ id: true, createdAt: true });
export type AiUsageLog = typeof aiUsageLog.$inferSelect;
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;

export interface ArticleQueryParams {
  search?: string;
  sourceId?: number;
  sourceIds?: number[];
  sourceName?: string;
  sentiment?: string;
  category?: string;
  sourceType?: string;
  country?: string;
  topic?: string;
  lang?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  clientId?: number;
}
