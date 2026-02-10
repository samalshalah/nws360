import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  type: text("type").notNull(), // 'rss' | 'website' | 'twitter' | 'youtube' | 'facebook' | 'instagram'
  active: boolean("active").default(true),
  intervalMinutes: integer("interval_minutes").default(15),
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
  keywords: text("keywords").array(), // Extracted keywords
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
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
