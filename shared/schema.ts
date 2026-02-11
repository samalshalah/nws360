import { pgTable, text, serial, integer, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("client"), // 'admin' | 'client'
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });

// === SOURCES ===
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull(), // 'rss' | 'website' | 'twitter' | 'youtube' | 'facebook' | 'instagram' | 'telegram'
  active: boolean("active").default(true),
  intervalMinutes: integer("interval_minutes").default(15),
  maxArticlesPerFetch: integer("max_articles_per_fetch").default(10),
  retentionDays: integer("retention_days").default(30),
  lastFetchedAt: timestamp("last_fetched_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSourceSchema = createInsertSchema(sources).omit({ id: true, createdAt: true, lastFetchedAt: true });

// === ARTICLES ===
export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  url: text("url").unique(),
  sourceId: integer("source_id").references(() => sources.id),
  publishedAt: timestamp("published_at"),
  language: text("language").default("en"),
  sentimentScore: integer("sentiment_score"), // -100 to 100
  sentimentLabel: text("sentiment_label"), // 'positive' | 'negative' | 'neutral'
  keywords: text("keywords").array(),
  category: text("category"), // 'political' | 'health' | 'tech' | 'sports' | 'business' | 'entertainment' | 'science' | 'urgent' | 'general'
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

// === SOURCE FETCH LOGS ===
export const sourceFetchLogs = pgTable("source_fetch_logs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // 'success' | 'error'
  articlesFound: integer("articles_found").default(0),
  errorMessage: text("error_message"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});

export const insertSourceFetchLogSchema = createInsertSchema(sourceFetchLogs).omit({ id: true, fetchedAt: true });

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

// Request Types
export type LoginRequest = Pick<InsertUser, "username" | "password">;
export type RegisterRequest = InsertUser;

export type CreateSourceRequest = InsertSource;
export type UpdateSourceRequest = Partial<InsertSource>;

export type CreateKeywordRequest = InsertKeyword;

export interface ArticleQueryParams {
  search?: string;
  sourceId?: number;
  sentiment?: string;
  category?: string;
  sourceType?: string;
  lang?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
