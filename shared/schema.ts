import { pgTable, text, serial, integer, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === CLIENTS ===
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  organizationType: text("organization_type").notNull().default("media"),
  defaultLanguage: text("default_language").default("en"),
  active: boolean("active").default(true),
  allowedRegions: text("allowed_regions").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("client"),
  parentId: integer("parent_id"),
  clientId: integer("client_id"),
  disabled: boolean("disabled").default(false),
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
  country: text("country"),
  refreshPriority: text("refresh_priority").default("medium"),
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
  url: text("url").unique(),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertArticleSchema = createInsertSchema(articles).omit({ id: true, createdAt: true });

// === KEYWORDS (Client tracking) ===
export const keywords = pgTable("keywords", {
  id: serial("id").primaryKey(),
  term: text("term").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertKeywordSchema = createInsertSchema(keywords).omit({ id: true, createdAt: true });

// === BOOKMARKS ===
export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({ id: true, createdAt: true });

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

// Request Types
export type LoginRequest = Pick<InsertUser, "username" | "password">;
export type RegisterRequest = InsertUser;

export type CreateSourceRequest = InsertSource;
export type UpdateSourceRequest = Partial<InsertSource>;

export type CreateKeywordRequest = InsertKeyword;

export interface ArticleQueryParams {
  search?: string;
  sourceId?: number;
  sourceIds?: number[];
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
}
