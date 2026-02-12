import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { startFeedWorker, fetchAllFeeds, fetchSourceFeed, analyzeWithAI } from "./feed-worker";
import { openai } from "./replit_integrations/image/client";
import { db } from "./db";
import { articles } from "@shared/schema";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import sanitizeHtml from "sanitize-html";
import { scrypt, randomBytes, createHash } from "crypto";
import { promisify } from "util";
import { startQueueProcessor, getQueueStats, logSystemError } from "./processing-queue";
import { runAnalyticsComputation } from "./analytics-worker";
import { runDataRetention, onSourceHardDeleted } from "./data-retention-worker";

const scryptAsync = promisify(scrypt);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
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

async function getUserSourceIds(user: any): Promise<number[] | undefined> {
  if (user.role === "admin") return undefined;
  const userIds = [user.id];
  const children = await storage.getUserChildren(user.id);
  for (const child of children) {
    userIds.push(child.id);
  }
  const userSources = await storage.getSources();
  return userSources
    .filter(s => s.userId && userIds.includes(s.userId))
    .map(s => s.id);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.use("/api/", apiLimiter);
  app.use("/api/login", authLimiter);
  app.use("/api/register", authLimiter);

  // === SOURCES ===
  app.get(api.sources.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (user.role === "admin") {
      const allSources = await storage.getSources();
      return res.json(allSources);
    }
    const children = await storage.getUserChildren(user.id);
    const userIds = [user.id, ...children.map((c: any) => c.id)];
    const allSources = await storage.getSources();
    const filtered = allSources.filter((s: any) => userIds.includes(s.userId));
    res.json(filtered);
  });

  app.post(api.sources.create.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const input = api.sources.create.input.parse(req.body);
      const source = await storage.createSource({...input, userId: user.id});

      // Immediately fetch articles from the new source
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

  app.patch(api.sources.update.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const id = parseInt(req.params.id);
      if (user.role !== "admin") {
        const existingSource = await storage.getSource(id);
        if (!existingSource || existingSource.userId !== user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const rawBody = req.body;
      const allowedFields = ['name', 'url', 'type', 'active', 'intervalMinutes', 'maxArticlesPerFetch', 'retentionDays', 'userId'] as const;
      const cleanUpdates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (key in rawBody && rawBody[key] !== undefined) {
          cleanUpdates[key] = rawBody[key];
        }
      }
      if (Object.keys(cleanUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      const source = await storage.updateSource(id, cleanUpdates);
      if (!source) return res.status(404).json({ message: "Source not found" });
      res.json(source);
    } catch (err) {
      res.status(400).json({ message: "Invalid Input" });
    }
  });

  app.delete(api.sources.delete.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (user.role !== "admin") {
      const existingSource = await storage.getSource(id);
      if (!existingSource || existingSource.userId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
    }
    await storage.deleteSource(id);
    res.sendStatus(204);
  });

  // === WEBSITE SEARCH / DISCOVERY ===
  app.get("/api/search-websites", async (req, res) => {
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
  app.post("/api/sources/:id/fetch", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const source = await storage.getSource(id);
    if (!source) return res.status(404).json({ message: "Source not found" });
    if (user.role !== "admin" && source.userId !== user.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    try {
      const newArticles = await fetchSourceFeed(id);
      res.json({ success: true, newArticles });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fetch failed";
      res.status(500).json({ success: false, message: msg });
    }
  });

  app.post("/api/fetch-all", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const results = await fetchAllFeeds();
      res.json({ success: true, results });
    } catch (err) {
      res.status(500).json({ success: false, message: "Fetch failed" });
    }
  });

  // === ARTICLES ===
  app.get(api.articles.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user as any;
      const scopedSourceIds = await getUserSourceIds(user);
      const params = {
        search: req.query.search as string,
        sourceId: req.query.sourceId && !isNaN(parseInt(req.query.sourceId as string)) ? parseInt(req.query.sourceId as string) : undefined,
        sourceIds: scopedSourceIds,
        sentiment: req.query.sentiment as string,
        category: req.query.category as string,
        sourceType: req.query.sourceType as string,
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
        const langNames: Record<string, string> = {
          en: "English", ar: "Arabic", fr: "French", es: "Spanish", tr: "Turkish"
        };
        const targetLangName = langNames[targetLang] || targetLang;
        
        const batchSize = 5;
        for (let i = 0; i < result.items.length; i += batchSize) {
          const batch = result.items.slice(i, i + batchSize);
          const translationPromises = batch.map(async (article) => {
            try {
              const textToTranslate = `Title: ${article.title}\nSummary: ${article.summary || article.content.substring(0, 500)}`;
              const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content: `Translate the following news article title and summary to ${targetLangName}. Return JSON with: "title" (translated title), "summary" (translated summary). Respond ONLY with valid JSON.`,
                  },
                  { role: "user", content: textToTranslate },
                ],
                response_format: { type: "json_object" },
                max_completion_tokens: 1000,
              });
              const translated = JSON.parse(completion.choices[0].message.content || "{}");
              article.title = translated.title || article.title;
              article.summary = translated.summary || article.summary;
            } catch (e) {
              console.error(`Translation failed for article ${article.id}:`, e);
            }
          });
          await Promise.all(translationPromises);
        }
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

  app.get(api.articles.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const id = parseInt(req.params.id);
    const article = await storage.getArticle(id);
    if (!article) return res.status(404).json({ message: "Article not found" });
    if (scopedSourceIds && article.sourceId && !scopedSourceIds.includes(article.sourceId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(article);
  });

  // === KEYWORDS ===
  app.get(api.keywords.list.path, async (req, res) => {
    const keywords = await storage.getKeywords();
    res.json(keywords);
  });

  app.post(api.keywords.create.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const input = api.keywords.create.input.parse(req.body);
      const keyword = await storage.createKeyword(input);
      res.status(201).json(keyword);
    } catch (err) {
      res.status(400).json({ message: "Invalid Input" });
    }
  });

  app.delete(api.keywords.delete.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    await storage.deleteKeyword(id);
    res.sendStatus(204);
  });

  // === ARTICLE TRANSLATION ===
  app.post("/api/articles/:id/translate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    const { targetLanguage } = req.body;
    
    if (!targetLanguage) {
      return res.status(400).json({ message: "targetLanguage is required" });
    }

    const article = await storage.getArticle(id);
    if (!article) return res.status(404).json({ message: "Article not found" });

    try {
      const langNames: Record<string, string> = {
        en: "English", ar: "Arabic", fr: "French", es: "Spanish", tr: "Turkish"
      };
      const targetLangName = langNames[targetLanguage] || targetLanguage;
      
      const textToTranslate = `Title: ${article.title}\n\nContent: ${article.content?.substring(0, 3000) || ""}${article.summary ? `\n\nSummary: ${article.summary}` : ""}`;
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional news translator. Translate the following news article to ${targetLangName}. Return JSON with: "title" (translated title), "content" (translated content), "summary" (translated summary). Respond ONLY with valid JSON.`,
          },
          { role: "user", content: textToTranslate },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
      res.json({
        translatedTitle: result.title || article.title,
        translatedContent: result.content || article.content,
        translatedSummary: result.summary || article.summary,
        targetLanguage,
      });
    } catch (e) {
      console.error("Translation failed:", e);
      res.status(500).json({ message: "Translation failed" });
    }
  });

  // === RE-ANALYZE ARTICLES ===
  app.post("/api/reanalyze", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user as any;
      const scopedSourceIds = await getUserSourceIds(user);
      const allArticles = await storage.getArticles({ limit: 500, sourceIds: scopedSourceIds });
      const unanalyzed = allArticles.items.filter(
        a => (!a.sentimentLabel || a.sentimentLabel === "neutral") && a.sentimentScore === 0 && (!a.keywords || a.keywords.length === 0)
      );
      
      let analyzed = 0;
      const batchSize = 5;
      
      for (let i = 0; i < Math.min(unanalyzed.length, 100); i += batchSize) {
        const batch = unanalyzed.slice(i, i + batchSize);
        const promises = batch.map(async (article) => {
          try {
            const analysis = await analyzeWithAI(article.title, article.content || article.title);
            await db.update(articles)
              .set({
                sentimentLabel: analysis.sentimentLabel,
                sentimentScore: analysis.sentimentScore,
                keywords: analysis.keywords,
                summary: analysis.summary,
                category: analysis.category,
              })
              .where(eq(articles.id, article.id));
            analyzed++;
          } catch (e) {
            console.error(`[Reanalyze] Failed for article ${article.id}:`, e);
          }
        });
        await Promise.all(promises);
      }
      
      res.json({ success: true, analyzed, total: unanalyzed.length });
    } catch (err) {
      console.error("[Reanalyze] Error:", err);
      res.status(500).json({ success: false, message: "Re-analysis failed" });
    }
  });

  // === ANALYTICS ===
  app.get(api.analytics.stats.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const stats = await storage.getStats(scopedSourceIds);
    res.json(stats);
  });

  app.get(api.analytics.sentimentTrend.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const trend = await storage.getSentimentTrend(scopedSourceIds);
    res.json(trend);
  });

  app.get("/api/analytics/content-volume", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getContentVolume(startDate, endDate, scopedSourceIds);
    res.json(data);
  });

  app.get("/api/analytics/trending-topics", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getTrendingTopics(startDate, endDate, scopedSourceIds);
    res.json(data);
  });

  app.get("/api/analytics/keyword-analysis", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getKeywordAnalysis(startDate, endDate, scopedSourceIds);
    res.json(data);
  });

  app.get("/api/analytics/sentiment-reports", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getSentimentReports(startDate, endDate, scopedSourceIds);
    res.json(data);
  });

  app.get("/api/analytics/source-behavior", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getSourceBehavior(startDate, endDate, scopedSourceIds);
    res.json(data);
  });

  app.get("/api/analytics/narrative-comparison", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const topic = req.query.topic as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) return res.status(400).json({ message: "topic is required" });
    if (!startDate || !endDate || isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) return res.status(400).json({ message: "valid startDate and endDate required" });
    try {
      const data = await storage.getNarrativeComparison(topic.trim(), startDate, endDate, scopedSourceIds);
      res.json(data);
    } catch (e: any) {
      console.error("Narrative comparison error:", e.message);
      res.status(500).json({ message: "Failed to fetch narrative comparison" });
    }
  });

  app.get("/api/analytics/daily-brief", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
    if (isNaN(Date.parse(dateStr))) return res.status(400).json({ message: "valid date required" });
    try {
      const data = await storage.getDailyBrief(dateStr, scopedSourceIds);
      res.json(data);
    } catch (e: any) {
      console.error("Daily brief error:", e.message);
      res.status(500).json({ message: "Failed to fetch daily brief" });
    }
  });

  app.get("/api/analytics/keyword-detail", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const keyword = req.query.keyword as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!keyword || typeof keyword !== "string" || keyword.trim().length === 0) return res.status(400).json({ message: "keyword is required" });
    if (!startDate || !endDate || isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) return res.status(400).json({ message: "valid startDate and endDate required" });
    try {
      const data = await storage.getKeywordDetail(keyword.trim(), startDate, endDate, scopedSourceIds);
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
    const userId = (req.user as any).id;
    try {
      const articleIds = await storage.getBookmarks(userId);
      if (articleIds.length === 0) return res.json([]);
      const bookmarkedArticles = await storage.getArticlesByIds(articleIds);
      res.json(bookmarkedArticles);
    } catch (err) {
      console.error("Error fetching bookmarked articles:", err);
      res.status(500).json({ message: "Error fetching bookmarked articles" });
    }
  });

  app.post("/api/bookmarks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = (req.user as any).id;
    const { articleId } = req.body;
    if (!articleId) return res.status(400).json({ message: "articleId required" });
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
    if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids array required" });
    const deleted = await storage.deleteArticles(ids);
    res.json({ deleted });
  });

  app.post("/api/articles/bulk-categorize", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const { ids, category } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !category) return res.status(400).json({ message: "ids and category required" });
    const updated = await storage.updateArticlesCategory(ids, category);
    res.json({ updated });
  });

  // === EXPORT ARTICLES CSV ===
  app.get("/api/articles/export", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const params = {
      search: req.query.search as string,
      sourceId: req.query.sourceId ? parseInt(req.query.sourceId as string) : undefined,
      sourceIds: scopedSourceIds,
      sentiment: req.query.sentiment as string,
      category: req.query.category as string,
      sourceType: req.query.sourceType as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: 1,
      limit: 1000,
    };
    const result = await storage.getArticles(params);
    const csvHeader = "ID,Title,Source,Category,Sentiment,Published,URL\n";
    const csvRows = result.items.map(a => {
      const title = `"${(a.title || "").replace(/"/g, '""')}"`;
      const source = `"${(a.source?.name || "").replace(/"/g, '""')}"`;
      const cat = a.category || "general";
      const sentiment = a.sentimentLabel || "neutral";
      const published = a.publishedAt ? new Date(a.publishedAt).toISOString() : "";
      const url = a.url || "";
      return `${a.id},${title},${source},${cat},${sentiment},${published},${url}`;
    }).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=nws360-articles.csv");
    res.send(csvHeader + csvRows);
  });

  app.get("/api/articles/urgent", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user as any;
      const scopedSourceIds = await getUserSourceIds(user);
      if (Array.isArray(scopedSourceIds) && scopedSourceIds.length === 0) {
        return res.json([]);
      }
      const since = req.query.since as string;
      const result = await storage.getArticles({
        category: "urgent",
        sourceIds: scopedSourceIds,
        startDate: since || new Date(Date.now() - 3600000).toISOString(),
        limit: 10,
        page: 1,
      });
      res.json(result.items);
    } catch (err) {
      console.error("Error fetching urgent articles:", err);
      res.json([]);
    }
  });

  // === USER MANAGEMENT ===
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    let allUsers;
    if (user.role === "admin") {
      allUsers = await storage.getUsers();
    } else {
      allUsers = await storage.getUsers(user.id);
    }
    const safeUsers = allUsers.map((u: any) => ({ id: u.id, username: u.username, role: u.role, parentId: u.parentId, createdAt: u.createdAt }));
    res.json(safeUsers);
  });

  app.post("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const currentUser = req.user as any;
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password required" });

    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) return res.status(400).json({ message: "Username already exists" });

    let assignedRole = "client";
    if (currentUser.role === "admin" && role && ["admin", "client"].includes(role)) {
      assignedRole = role;
    }

    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    const hashedPassword = `${salt}:${buf.toString("hex")}`;

    const newUser = await storage.createUser({
      username,
      password: hashedPassword,
      role: assignedRole,
      parentId: currentUser.id,
    });

    res.status(201).json({ id: newUser.id, username: newUser.username, role: newUser.role, parentId: newUser.parentId, createdAt: newUser.createdAt });
  });

  app.patch("/api/users/:id/role", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const currentUser = req.user as any;
    const id = parseInt(req.params.id);
    if (id === currentUser.id) return res.status(400).json({ message: "Cannot change your own role" });

    if (currentUser.role !== "admin") {
      const targetUser = await storage.getUser(id);
      if (!targetUser || targetUser.parentId !== currentUser.id) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const { role } = req.body;
    if (!role || !["admin", "client", "viewer"].includes(role)) return res.status(400).json({ message: "Invalid role" });
    const updated = await storage.updateUserRole(id, role);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json({ id: updated.id, username: updated.username, role: updated.role, parentId: updated.parentId, createdAt: updated.createdAt });
  });

  app.delete("/api/users/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const currentUser = req.user as any;
    const id = parseInt(req.params.id);
    if (id === currentUser.id) return res.status(400).json({ message: "Cannot delete yourself" });

    if (currentUser.role !== "admin") {
      const targetUser = await storage.getUser(id);
      if (!targetUser || targetUser.parentId !== currentUser.id) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    await storage.deleteUser(id);
    res.sendStatus(204);
  });

  // === SOURCE HEALTH ===
  app.get("/api/source-health", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const health = await storage.getSourceHealth(scopedSourceIds);
    res.json(health);
  });

  app.get("/api/source-health/:sourceId/logs", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const sourceId = parseInt(req.params.sourceId);
    const scopedSourceIds = await getUserSourceIds(user);
    if (scopedSourceIds && !scopedSourceIds.includes(sourceId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const logs = await storage.getFetchLogs(sourceId, 50);
    res.json(logs);
  });

  // === INGESTION LOGS ===
  app.get("/api/ingestion-logs", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
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
  app.get("/api/analytics/export", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const sentimentData = await storage.getSentimentReports(startDate, endDate, scopedSourceIds);
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
    if ((req.user as any).role !== "admin") { res.status(403).json({ message: "Admin access required" }); return false; }
    return true;
  }

  app.get("/api/admin/sources", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const allSources = await storage.getSources();
    res.json(allSources);
  });

  app.post("/api/admin/sources", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    try {
      const { name, url, type, active, intervalMinutes, maxArticlesPerFetch, retentionDays, country, refreshPriority } = req.body;
      if (!name || !url || !type) return res.status(400).json({ message: "name, url, and type are required" });
      const source = await storage.createSource({ name: sanitizeInput(name), url, type, active: active !== false, intervalMinutes: intervalMinutes || 15, maxArticlesPerFetch: maxArticlesPerFetch || 10, retentionDays: retentionDays || 30, country: country || null, refreshPriority: refreshPriority || "medium", userId: user.id });
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
    const allowedFields = ['name', 'url', 'type', 'active', 'intervalMinutes', 'maxArticlesPerFetch', 'retentionDays', 'country', 'refreshPriority'] as const;
    const cleanUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in req.body && req.body[key] !== undefined) cleanUpdates[key] = req.body[key];
    }
    if (Object.keys(cleanUpdates).length === 0) return res.status(400).json({ message: "No valid fields to update" });
    const source = await storage.updateSource(id, cleanUpdates);
    if (!source) return res.status(404).json({ message: "Source not found" });
    await storage.createAuditLog({ userId: user.id, action: "update", entity: "source", entityId: id, details: `Updated source: ${JSON.stringify(cleanUpdates)}` });
    res.json(source);
  });

  app.delete("/api/admin/sources/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid source ID" });
    await storage.softDeleteSource(id);
    await storage.createAuditLog({ userId: user.id, action: "soft_delete", entity: "source", entityId: id, details: `Soft-deleted source #${id}` });
    res.sendStatus(204);
  });

  app.post("/api/admin/sources/:id/restore", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid source ID" });
    await storage.restoreSource(id);
    await storage.createAuditLog({ userId: user.id, action: "restore", entity: "source", entityId: id, details: `Restored source #${id}` });
    res.json({ success: true });
  });

  // === ADMIN: CLIENTS MANAGEMENT ===
  app.get("/api/admin/clients", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const allClients = await storage.getClients();
    res.json(allClients);
  });

  app.post("/api/admin/clients", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const { name, organizationType, defaultLanguage, active, allowedRegions } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) return res.status(400).json({ message: "Client name is required" });
    try {
      const client = await storage.createClient({ name: sanitizeInput(name), organizationType: organizationType || "media", defaultLanguage: defaultLanguage || "en", active: active !== false, allowedRegions: allowedRegions || null });
      await storage.createAuditLog({ userId: user.id, action: "create", entity: "client", entityId: client.id, details: `Created client: ${client.name}` });
      res.status(201).json(client);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put("/api/admin/clients/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid client ID" });
    const allowedFields = ['name', 'organizationType', 'defaultLanguage', 'active', 'allowedRegions'] as const;
    const cleanUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in req.body && req.body[key] !== undefined) cleanUpdates[key] = req.body[key];
    }
    const client = await storage.updateClient(id, cleanUpdates);
    if (!client) return res.status(404).json({ message: "Client not found" });
    await storage.createAuditLog({ userId: user.id, action: "update", entity: "client", entityId: id, details: `Updated client: ${JSON.stringify(cleanUpdates)}` });
    res.json(client);
  });

  app.delete("/api/admin/clients/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid client ID" });
    await storage.deleteClient(id);
    await storage.createAuditLog({ userId: user.id, action: "deactivate", entity: "client", entityId: id, details: `Deactivated client #${id}` });
    res.sendStatus(204);
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
    const allUsers = await storage.getUsers();
    const safeUsers = allUsers.map((u: any) => ({ id: u.id, username: u.username, role: u.role, parentId: u.parentId, clientId: u.clientId, disabled: u.disabled, createdAt: u.createdAt }));
    res.json(safeUsers);
  });

  app.post("/api/admin/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const adminUser = req.user as any;
    const { username, password, role, clientId } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password required" });
    if (!["admin", "client", "viewer"].includes(role || "client")) return res.status(400).json({ message: "Invalid role" });
    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) return res.status(400).json({ message: "Username already exists" });
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    const hashedPassword = `${salt}:${buf.toString("hex")}`;
    const newUser = await storage.createUser({ username: sanitizeInput(username), password: hashedPassword, role: role || "client", parentId: adminUser.id, clientId: clientId || null });
    await storage.createAuditLog({ userId: adminUser.id, action: "create", entity: "user", entityId: newUser.id, details: `Created user: ${newUser.username} (${newUser.role})` });
    res.status(201).json({ id: newUser.id, username: newUser.username, role: newUser.role, parentId: newUser.parentId, clientId: newUser.clientId, disabled: newUser.disabled, createdAt: newUser.createdAt });
  });

  app.put("/api/admin/users/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const adminUser = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });
    if (id === adminUser.id) return res.status(400).json({ message: "Cannot modify your own account via admin" });
    const allowedFields: Record<string, any> = {};
    if (req.body.role && ["admin", "client", "viewer"].includes(req.body.role)) allowedFields.role = req.body.role;
    if (req.body.clientId !== undefined) allowedFields.clientId = req.body.clientId;
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
    res.json({ id: updated.id, username: updated.username, role: updated.role, parentId: updated.parentId, clientId: updated.clientId, disabled: updated.disabled, createdAt: updated.createdAt });
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const adminUser = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });
    if (id === adminUser.id) return res.status(400).json({ message: "Cannot delete yourself" });
    await storage.deleteUser(id);
    await storage.createAuditLog({ userId: adminUser.id, action: "delete", entity: "user", entityId: id, details: `Deleted user #${id}` });
    res.sendStatus(204);
  });

  // === ADMIN: SYSTEM SETTINGS ===
  app.get("/api/admin/settings", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const settings = await storage.getSystemSettings();
    const defaults: Record<string, string> = {
      feedRefreshMinutes: "5",
      rawArticleRetentionDays: "30",
      analyticsRetentionMonths: "12",
      defaultTargetLanguages: "en,ar",
      autoTranslationEnabled: "true",
      keywordSpikeThreshold: "150",
      sentimentShiftSensitivity: "30",
    };
    res.json({ ...defaults, ...settings });
  });

  app.put("/api/admin/settings", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const updates = req.body;
    if (!updates || typeof updates !== "object") return res.status(400).json({ message: "Settings object required" });
    const allowedKeys = ["feedRefreshMinutes", "rawArticleRetentionDays", "analyticsRetentionMonths", "defaultTargetLanguages", "autoTranslationEnabled", "keywordSpikeThreshold", "sentimentShiftSensitivity"];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key) && typeof value === "string") {
        await storage.updateSystemSetting(key, value);
      }
    }
    await storage.createAuditLog({ userId: user.id, action: "update", entity: "system_settings", details: `Updated settings: ${Object.keys(updates).join(", ")}` });
    const settings = await storage.getSystemSettings();
    res.json(settings);
  });

  // === ADMIN: LOGS & HEALTH ===
  app.get("/api/admin/system-health", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const health = await storage.getSystemHealth();
    res.json(health);
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
  app.post("/api/admin/compute-analytics", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const result = await runAnalyticsComputation();
    await storage.createAuditLog({ userId: user.id, action: "compute_analytics", entity: "analytics_cache", details: `Triggered analytics computation: ${result.success ? "success" : "failed"}` });
    res.json(result);
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
    const params = {
      search: req.query.search as string,
      sentiment: req.query.sentiment as string,
      category: req.query.category as string,
      country: req.query.country as string,
      topic: req.query.topic as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
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
        source: a.source?.name || null,
        sourceType: a.source?.type || null,
        category: a.category,
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
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getTrendingTopics(sevenDaysAgo.toISOString(), now.toISOString());
    res.json(data);
  });

  app.get("/api/v1/sentiment", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getSentimentReports(sevenDaysAgo.toISOString(), now.toISOString());
    res.json(data);
  });

  app.get("/api/v1/keywords", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getKeywordAnalysis(sevenDaysAgo.toISOString(), now.toISOString());
    res.json(data);
  });

  // === SEED & START WORKERS ===
  await seed();
  startFeedWorker();
  startQueueProcessor();

  setInterval(async () => {
    try {
      await runAnalyticsComputation();
    } catch (e) {
      console.error("[Analytics Worker] Error:", e);
    }
  }, 15 * 60 * 1000);

  setTimeout(() => {
    runAnalyticsComputation().catch(e => console.error("[Analytics] Initial computation error:", e));
  }, 30000);

  setInterval(async () => {
    try {
      await runDataRetention();
    } catch (e) {
      console.error("[Retention Worker] Error:", e);
    }
  }, 24 * 60 * 60 * 1000);

  return httpServer;
}

async function seed() {
  const existingSources = await storage.getSources();
  if (existingSources.length === 0) {
    console.log("Seeding sources...");
    await storage.createSource({
      name: "TechCrunch",
      url: "https://techcrunch.com/feed/",
      type: "rss",
      active: true,
      intervalMinutes: 15,
    });
    await storage.createSource({
      name: "The Verge",
      url: "https://www.theverge.com/rss/index.xml",
      type: "rss",
      active: true,
      intervalMinutes: 15,
    });
    await storage.createSource({
      name: "BBC News",
      url: "https://feeds.bbci.co.uk/news/rss.xml",
      type: "rss",
      active: true,
      intervalMinutes: 10,
    });
    await storage.createSource({
      name: "Reuters",
      url: "https://www.reutersagency.com/feed/",
      type: "rss",
      active: true,
      intervalMinutes: 10,
    });
    await storage.createSource({
      name: "Al Jazeera",
      url: "https://www.aljazeera.com/xml/rss/all.xml",
      type: "rss",
      active: true,
      intervalMinutes: 15,
    });
    console.log("Sources seeded.");
  }
}
