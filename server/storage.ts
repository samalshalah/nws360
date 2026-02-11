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
    trendingKeywords: { text: string; value: number }[];
  }>;
  getSentimentTrend(): Promise<{ date: string; positive: number; negative: number; neutral: number }[]>;

  // Analytics - Content Volume
  getContentVolume(startDate: string, endDate: string): Promise<{
    timeline: { date: string; count: number }[];
    bySource: { sourceId: number; sourceName: string; count: number }[];
    byHour: { hour: number; count: number }[];
    peaks: { date: string; count: number }[];
  }>;

  // Analytics - Trending Topics
  getTrendingTopics(startDate: string, endDate: string): Promise<{
    topics: { topic: string; count: number; sentiment: string }[];
    topicTimeline: { date: string; topic: string; count: number }[];
    byCategory: { category: string; count: number }[];
  }>;

  // Analytics - Keyword Analysis
  getKeywordAnalysis(startDate: string, endDate: string): Promise<{
    topKeywords: { keyword: string; count: number; avgSentiment: number }[];
    keywordTimeline: { date: string; keyword: string; count: number }[];
  }>;

  // Analytics - Sentiment Reports
  getSentimentReports(startDate: string, endDate: string): Promise<{
    overall: { positive: number; negative: number; neutral: number };
    bySource: { sourceId: number; sourceName: string; positive: number; negative: number; neutral: number }[];
    timeline: { date: string; positive: number; negative: number; neutral: number }[];
    byCategory: { category: string; positive: number; negative: number; neutral: number }[];
  }>;

  // Analytics - Source Behavior
  getSourceBehavior(startDate: string, endDate: string): Promise<{
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

    // Real trending keywords from DB (unnest the keywords array column)
    const keywordRows = await db.execute(sql`
      SELECT kw as keyword, COUNT(*)::int as count
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL
      GROUP BY kw
      ORDER BY count DESC
      LIMIT 10
    `);
    const trendingKeywords = (keywordRows.rows as any[]).map((r: any) => ({
      text: String(r.keyword),
      value: Number(r.count),
    }));

    return {
      totalArticles: Number(totalArticles?.count || 0),
      sourcesCount: Number(sourcesCount?.count || 0),
      sentimentDistribution,
      trendingKeywords,
    };
  }

  async getSentimentTrend(): Promise<{ date: string; positive: number; negative: number; neutral: number }[]> {
    const rows = await db.execute(sql`
      SELECT 
        TO_CHAR(published_at, 'YYYY-MM-DD') as date,
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= NOW() - INTERVAL '30 days'
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

  async getContentVolume(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const timelineRows = await db.execute(sql`
      SELECT TO_CHAR(published_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    const bySourceRows = await db.execute(sql`
      SELECT a.source_id as "sourceId", s.name as "sourceName", COUNT(*)::int as count
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end}
      GROUP BY a.source_id, s.name
      ORDER BY count DESC
      LIMIT 20
    `);

    const byHourRows = await db.execute(sql`
      SELECT EXTRACT(HOUR FROM published_at)::int as hour, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end}
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

  async getTrendingTopics(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const topicRows = await db.execute(sql`
      SELECT kw as topic, COUNT(*)::int as count,
        MODE() WITHIN GROUP (ORDER BY sentiment_label) as sentiment
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL AND published_at >= ${start} AND published_at <= ${end}
      GROUP BY kw
      ORDER BY count DESC
      LIMIT 20
    `);

    const topicTimelineRows = await db.execute(sql`
      SELECT TO_CHAR(a.published_at, 'YYYY-MM-DD') as date, kw as topic, COUNT(*)::int as count
      FROM articles a, unnest(a.keywords) as kw
      WHERE a.keywords IS NOT NULL AND a.published_at >= ${start} AND a.published_at <= ${end}
      AND kw IN (
        SELECT kw2 FROM articles a2, unnest(a2.keywords) as kw2
        WHERE a2.keywords IS NOT NULL AND a2.published_at >= ${start} AND a2.published_at <= ${end}
        GROUP BY kw2 ORDER BY COUNT(*) DESC LIMIT 5
      )
      GROUP BY TO_CHAR(a.published_at, 'YYYY-MM-DD'), kw
      ORDER BY date ASC
    `);

    const categoryRows = await db.execute(sql`
      SELECT COALESCE(category, 'general') as category, COUNT(*)::int as count
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end}
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

  async getKeywordAnalysis(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const topKeywordsRows = await db.execute(sql`
      SELECT kw as keyword, COUNT(*)::int as count,
        COALESCE(AVG(sentiment_score), 0)::int as "avgSentiment"
      FROM articles, unnest(keywords) as kw
      WHERE keywords IS NOT NULL AND published_at >= ${start} AND published_at <= ${end}
      GROUP BY kw
      ORDER BY count DESC
      LIMIT 25
    `);

    const keywordTimelineRows = await db.execute(sql`
      SELECT TO_CHAR(a.published_at, 'YYYY-MM-DD') as date, kw as keyword, COUNT(*)::int as count
      FROM articles a, unnest(a.keywords) as kw
      WHERE a.keywords IS NOT NULL AND a.published_at >= ${start} AND a.published_at <= ${end}
      AND kw IN (
        SELECT kw2 FROM articles a2, unnest(a2.keywords) as kw2
        WHERE a2.keywords IS NOT NULL AND a2.published_at >= ${start} AND a2.published_at <= ${end}
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

  async getSentimentReports(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const overallRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end}
    `);
    const overall = overallRows.rows[0] as any;

    const bySourceRows = await db.execute(sql`
      SELECT a.source_id as "sourceId", s.name as "sourceName",
        COUNT(*) FILTER (WHERE a.sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE a.sentiment_label = 'neutral' OR a.sentiment_label IS NULL)::int as neutral
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end}
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
      WHERE published_at >= ${start} AND published_at <= ${end}
      GROUP BY TO_CHAR(published_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    const byCategoryRows = await db.execute(sql`
      SELECT COALESCE(category, 'general') as category,
        COUNT(*) FILTER (WHERE sentiment_label = 'positive')::int as positive,
        COUNT(*) FILTER (WHERE sentiment_label = 'negative')::int as negative,
        COUNT(*) FILTER (WHERE sentiment_label = 'neutral' OR sentiment_label IS NULL)::int as neutral
      FROM articles
      WHERE published_at >= ${start} AND published_at <= ${end}
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

  async getSourceBehavior(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    const sourceRows = await db.execute(sql`
      SELECT 
        s.id as "sourceId", s.name as "sourceName", s.type as "sourceType",
        COUNT(a.id)::int as "articleCount",
        MODE() WITHIN GROUP (ORDER BY a.sentiment_label) as "dominantSentiment",
        COUNT(DISTINCT unnest_kw)::int as "uniqueKeywords"
      FROM sources s
      LEFT JOIN articles a ON a.source_id = s.id AND a.published_at >= ${start} AND a.published_at <= ${end}
      LEFT JOIN LATERAL unnest(a.keywords) as unnest_kw ON true
      GROUP BY s.id, s.name, s.type
      ORDER BY "articleCount" DESC
    `);

    const diversityRows = await db.execute(sql`
      SELECT s.type as "sourceType", COUNT(DISTINCT a.id)::int as count
      FROM articles a
      LEFT JOIN sources s ON a.source_id = s.id
      WHERE a.published_at >= ${start} AND a.published_at <= ${end}
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
