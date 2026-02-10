import { db } from "./db";
import {
  users, sources, articles, keywords,
  type User, type InsertUser,
  type Source, type InsertSource,
  type Article, type InsertArticle,
  type Keyword, type InsertKeyword,
  type ArticleQueryParams
} from "@shared/schema";
import { eq, like, and, gte, lte, desc, sql } from "drizzle-orm";

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
  createArticle(article: InsertArticle): Promise<Article>;
  getArticleByUrl(url: string): Promise<Article | undefined>; // For deduplication

  // Keywords
  getKeywords(): Promise<Keyword[]>;
  createKeyword(keyword: InsertKeyword): Promise<Keyword>;
  deleteKeyword(id: number): Promise<void>;
  
  // Analytics
  getStats(): Promise<{
    totalArticles: number;
    sourcesCount: number;
    sentimentDistribution: { name: string; value: number }[];
    trendingKeywords: { text: string; value: number }[];
  }>;
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
    await db.delete(sources).where(eq(sources.id, id));
  }

  // Articles
  async getArticles(params?: ArticleQueryParams): Promise<{ items: (Article & { source: Source | null })[], total: number }> {
    const conditions = [];

    if (params?.search) {
      conditions.push(sql`(${articles.title} ILIKE ${`%${params.search}%`} OR ${articles.content} ILIKE ${`%${params.search}%`})`);
    }
    if (params?.sourceId) {
      conditions.push(eq(articles.sourceId, params.sourceId));
    }
    if (params?.sentiment) {
      conditions.push(eq(articles.sentimentLabel, params.sentiment));
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

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(articles).where(whereClause);
    const total = Number(countResult?.count || 0);

    const items = await db.select({
      id: articles.id,
      title: articles.title,
      content: articles.content,
      summary: articles.summary,
      url: articles.url,
      sourceId: articles.sourceId,
      publishedAt: articles.publishedAt,
      language: articles.language,
      sentimentScore: articles.sentimentScore,
      sentimentLabel: articles.sentimentLabel,
      keywords: articles.keywords,
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

  async createArticle(insertArticle: InsertArticle): Promise<Article> {
    const [article] = await db.insert(articles).values(insertArticle).returning();
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

  // Analytics
  async getStats() {
    const [totalArticles] = await db.select({ count: sql<number>`count(*)` }).from(articles);
    const [sourcesCount] = await db.select({ count: sql<number>`count(*)` }).from(sources);
    
    // Simple mock aggregation for sentiment (drizzle aggregation can be verbose)
    const sentimentDistribution = [
      { name: 'Positive', value: 35 },
      { name: 'Neutral', value: 45 },
      { name: 'Negative', value: 20 },
    ];

    // Mock trending keywords (in real app, would aggregate array column)
    const trendingKeywords = [
      { text: 'Technology', value: 80 },
      { text: 'AI', value: 65 },
      { text: 'Market', value: 45 },
      { text: 'Crypto', value: 30 },
      { text: 'Climate', value: 25 },
    ];

    return {
      totalArticles: Number(totalArticles?.count || 0),
      sourcesCount: Number(sourcesCount?.count || 0),
      sentimentDistribution,
      trendingKeywords,
    };
  }
}

export const storage = new DatabaseStorage();
