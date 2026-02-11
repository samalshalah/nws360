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
  
  // Sources - update last fetched
  updateSourceLastFetched(id: number): Promise<void>;

  // Cleanup
  deleteExpiredArticles(): Promise<number>;

  // Analytics
  getStats(): Promise<{
    totalArticles: number;
    sourcesCount: number;
    sentimentDistribution: { name: string; value: number }[];
    trendingKeywords: { text: string; value: number; positive: number; negative: number; neutral: number }[];
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
    await db.delete(articles).where(eq(articles.sourceId, id));
    await db.delete(sources).where(eq(sources.id, id));
  }

  async updateSourceLastFetched(id: number): Promise<void> {
    await db.update(sources).set({ lastFetchedAt: new Date() }).where(eq(sources.id, id));
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
    if (params?.category) {
      conditions.push(eq(articles.category, params.category));
    }
    if (params?.sourceType) {
      conditions.push(eq(sources.type, params.sourceType));
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
    if (params?.sourceType) {
      countQuery.leftJoin(sources, eq(articles.sourceId, sources.id));
    }
    const [countResult] = await countQuery.where(whereClause);
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
      category: articles.category,
      imageUrl: articles.imageUrl,
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

    // Real sentiment distribution from DB
    const sentimentRows = await db.execute(sql`
      SELECT 
        COALESCE(sentiment_label, 'neutral') as label,
        COUNT(*)::int as count
      FROM articles
      GROUP BY sentiment_label
    `);
    const sentimentDistribution = (sentimentRows.rows as any[]).map((r: any) => ({
      name: String(r.label).charAt(0).toUpperCase() + String(r.label).slice(1),
      value: Number(r.count),
    }));
    if (sentimentDistribution.length === 0) {
      sentimentDistribution.push(
        { name: 'Positive', value: 0 },
        { name: 'Neutral', value: 0 },
        { name: 'Negative', value: 0 },
      );
    }

    const keywordRows = await db.execute(sql`
      SELECT 
        kw as keyword, 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE COALESCE(sentiment_label, 'neutral') = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE COALESCE(sentiment_label, 'neutral') = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE COALESCE(sentiment_label, 'neutral') = 'neutral')::int as neutral
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL
      GROUP BY kw
      ORDER BY total DESC
      LIMIT 10
    `);
    const trendingKeywords = (keywordRows.rows as any[]).map((r: any) => ({
      text: String(r.keyword),
      value: Number(r.total),
      positive: Number(r.positive),
      negative: Number(r.negative),
      neutral: Number(r.neutral),
    }));

    return {
      totalArticles: Number(totalArticles?.count || 0),
      sourcesCount: Number(sourcesCount?.count || 0),
      sentimentDistribution,
      trendingKeywords,
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
}

export const storage = new DatabaseStorage();
