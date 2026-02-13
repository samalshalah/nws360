import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { startFeedWorker, fetchAllFeeds, fetchSourceFeed, analyzeWithAI } from "./feed-worker";
import { openai } from "./replit_integrations/image/client";
import { db } from "./db";
import { articles, PLAN_LIMITS } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import sanitizeHtml from "sanitize-html";
import { scrypt, randomBytes, createHash } from "crypto";
import { promisify } from "util";
import { startQueueProcessor, getQueueStats, logSystemError } from "./processing-queue";
import { runAnalyticsComputation } from "./analytics-worker";
import { runDataRetention, onSourceHardDeleted } from "./data-retention-worker";
import { startLearningWorker } from "./learning-worker";

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

function resolveClientId(user: any): number | null {
  if (user.role === "admin") return null;
  if (user.clientId) return user.clientId;
  if (user.role === "client") return user.id;
  return null;
}

function requireClientId(user: any): number {
  const cid = resolveClientId(user);
  if (cid === null && user.role !== "admin") {
    throw new Error("User has no associated client");
  }
  return cid as number;
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
      const clientId = resolveClientId(user);
      const source = await storage.createSource({...input, userId: user.id, clientId: clientId || undefined});

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
      const clientId = resolveClientId(user);
      const scopedSourceIds = await getUserSourceIds(user);
      const params = {
        search: req.query.search as string,
        sourceId: req.query.sourceId && !isNaN(parseInt(req.query.sourceId as string)) ? parseInt(req.query.sourceId as string) : undefined,
        sourceIds: scopedSourceIds,
        clientId: clientId || undefined,
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
        
        const articlesToTranslate = result.items.filter((article) => {
          const articleLang = (article.language || "en").split("-")[0].toLowerCase();
          return articleLang !== targetLang;
        });

        const batchSize = 5;
        for (let i = 0; i < articlesToTranslate.length; i += batchSize) {
          const batch = articlesToTranslate.slice(i, i + batchSize);
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

  app.get("/api/articles/urgent", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user as any;
      const clientId = resolveClientId(user);
      const scopedSourceIds = await getUserSourceIds(user);
      if (Array.isArray(scopedSourceIds) && scopedSourceIds.length === 0) {
        return res.json([]);
      }
      const since = req.query.since as string;
      const result = await storage.getArticles({
        category: "urgent",
        sourceIds: scopedSourceIds,
        clientId: clientId || undefined,
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

  app.get("/api/articles/export", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const scopedSourceIds = await getUserSourceIds(user);
    const params = {
      search: req.query.search as string,
      sourceId: req.query.sourceId ? parseInt(req.query.sourceId as string) : undefined,
      sourceIds: scopedSourceIds,
      clientId: clientId || undefined,
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

  app.get(api.articles.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid article ID" });
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
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid article ID" });
    const { targetLanguage } = req.body;
    
    if (!targetLanguage) {
      return res.status(400).json({ message: "targetLanguage is required" });
    }

    const article = await storage.getArticle(id);
    if (!article) return res.status(404).json({ message: "Article not found" });
    if (clientId && article.clientId !== clientId) return res.status(403).json({ message: "Access denied" });

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
      const clientId = resolveClientId(user);
      const scopedSourceIds = await getUserSourceIds(user);
      const allArticles = await storage.getArticles({ limit: 500, sourceIds: scopedSourceIds, clientId: clientId || undefined });
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
    const clientId = resolveClientId(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getContentVolume(startDate, endDate, scopedSourceIds, clientId || undefined);
    res.json(data);
  });

  app.get("/api/analytics/trending-topics", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const clientId = resolveClientId(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getTrendingTopics(startDate, endDate, scopedSourceIds, clientId || undefined);
    res.json(data);
  });

  app.get("/api/analytics/keyword-analysis", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const clientId = resolveClientId(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getKeywordAnalysis(startDate, endDate, scopedSourceIds, clientId || undefined);
    res.json(data);
  });

  app.get("/api/analytics/sentiment-reports", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const clientId = resolveClientId(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getSentimentReports(startDate, endDate, scopedSourceIds, clientId || undefined);
    res.json(data);
  });

  app.get("/api/analytics/source-behavior", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const clientId = resolveClientId(user);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate and endDate required" });
    const data = await storage.getSourceBehavior(startDate, endDate, scopedSourceIds, clientId || undefined);
    res.json(data);
  });

  app.get("/api/analytics/narrative-comparison", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scopedSourceIds = await getUserSourceIds(user);
    const clientId = resolveClientId(user);
    const topic = req.query.topic as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) return res.status(400).json({ message: "topic is required" });
    if (!startDate || !endDate || isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) return res.status(400).json({ message: "valid startDate and endDate required" });
    try {
      const data = await storage.getNarrativeComparison(topic.trim(), startDate, endDate, scopedSourceIds, clientId || undefined);
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
    const clientId = resolveClientId(user);
    const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
    if (isNaN(Date.parse(dateStr))) return res.status(400).json({ message: "valid date required" });
    try {
      const data = await storage.getAnalyticsDailyBrief(dateStr, scopedSourceIds, clientId || undefined);
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
    const clientId = resolveClientId(user);
    const keyword = req.query.keyword as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!keyword || typeof keyword !== "string" || keyword.trim().length === 0) return res.status(400).json({ message: "keyword is required" });
    if (!startDate || !endDate || isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) return res.status(400).json({ message: "valid startDate and endDate required" });
    try {
      const data = await storage.getKeywordDetail(keyword.trim(), startDate, endDate, scopedSourceIds, clientId || undefined);
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
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const userId = user.id;
    try {
      const articleIds = await storage.getBookmarks(userId);
      if (articleIds.length === 0) return res.json([]);
      const bookmarkedArticles = await storage.getArticlesByIds(articleIds, clientId || undefined);
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

    const resolvedClientId = currentUser.clientId || (currentUser.role === "client" ? currentUser.id : null);
    if (resolvedClientId) {
      const sub = await storage.getSubscription(resolvedClientId);
      if (sub) {
        const activeCount = await storage.getActiveUserCount(resolvedClientId);
        if (sub.maxUsers > 0 && activeCount >= sub.maxUsers) {
          return res.status(403).json({ message: `Seat limit reached (${activeCount}/${sub.maxUsers}). Upgrade your plan to add more users.` });
        }
      }
    }

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
      clientId: resolvedClientId,
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
    const clientId = resolveClientId(user);
    const scopedSourceIds = await getUserSourceIds(user);
    const sentimentData = await storage.getSentimentReports(startDate, endDate, scopedSourceIds, clientId || undefined);
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

  app.get("/api/sources/article-counts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const counts = await db.execute(sql`SELECT source_id, COUNT(*)::int as count FROM articles WHERE source_id IS NOT NULL GROUP BY source_id`);
      const map: Record<number, number> = {};
      for (const row of counts.rows) {
        map[row.source_id as number] = row.count as number;
      }
      res.json(map);
    } catch (err) {
      res.json({});
    }
  });

  app.post("/api/admin/sources", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    try {
      const { name, url, type, active, intervalMinutes, maxArticlesPerFetch, retentionDays, country, refreshPriority } = req.body;
      if (!name || !url || !type) return res.status(400).json({ message: "name, url, and type are required" });
      const adminClientId = req.body.clientId || resolveClientId(user);
      const source = await storage.createSource({ name: sanitizeInput(name), url, type, active: active !== false, intervalMinutes: intervalMinutes || 15, maxArticlesPerFetch: maxArticlesPerFetch || 10, retentionDays: retentionDays || 30, country: country || null, refreshPriority: refreshPriority || "medium", userId: user.id, clientId: adminClientId || undefined });
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
    const resolvedClientId = clientId || null;
    if (resolvedClientId) {
      const sub = await storage.getSubscription(resolvedClientId);
      if (sub) {
        const activeCount = await storage.getActiveUserCount(resolvedClientId);
        if (sub.maxUsers > 0 && activeCount >= sub.maxUsers) {
          return res.status(403).json({ message: `Seat limit reached (${activeCount}/${sub.maxUsers}). Upgrade plan to add more users.` });
        }
      }
    }
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
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const params = {
      search: req.query.search as string,
      sentiment: req.query.sentiment as string,
      category: req.query.category as string,
      country: req.query.country as string,
      topic: req.query.topic as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      clientId: partnerClientId || undefined,
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
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getTrendingTopics(sevenDaysAgo.toISOString(), now.toISOString(), undefined, partnerClientId || undefined);
    res.json(data);
  });

  app.get("/api/v1/sentiment", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getSentimentReports(sevenDaysAgo.toISOString(), now.toISOString(), undefined, partnerClientId || undefined);
    res.json(data);
  });

  app.get("/api/v1/keywords", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await storage.getKeywordAnalysis(sevenDaysAgo.toISOString(), now.toISOString(), undefined, partnerClientId || undefined);
    res.json(data);
  });

  // === HEALTH CHECK ENDPOINTS (unauthenticated for monitoring) ===
  const workerState = { lastRun: null as Date | null, isRunning: true, startedAt: new Date() };

  app.get("/api/status", async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      const queueStats = await getQueueStats();
      const dbHealthy = true;
      const queueHealthy = (queueStats.failed || 0) < 50;
      const workerHealthy = workerState.isRunning;
      const overall = dbHealthy && queueHealthy && workerHealthy ? "healthy" : "degraded";
      res.json({
        status: overall,
        uptime: Math.floor((Date.now() - workerState.startedAt.getTime()) / 1000),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        components: {
          database: dbHealthy ? "healthy" : "failed",
          workers: workerHealthy ? "healthy" : "degraded",
          queue: queueHealthy ? "healthy" : "degraded",
        },
      });
    } catch (e) {
      res.status(503).json({ status: "failed", error: "System health check failed" });
    }
  });

  app.get("/api/status/database", async (_req, res) => {
    try {
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      const latencyMs = Date.now() - start;
      const tableStats = await db.execute(sql`SELECT 
        (SELECT count(*) FROM articles) as articles_count,
        (SELECT count(*) FROM sources) as sources_count,
        (SELECT count(*) FROM users) as users_count`);
      res.json({
        status: "healthy",
        latencyMs,
        tables: tableStats.rows?.[0] || {},
      });
    } catch (e) {
      res.status(503).json({ status: "failed", error: "Database unreachable" });
    }
  });

  app.get("/api/status/workers", async (_req, res) => {
    try {
      const health = await storage.getSystemHealth();
      res.json({
        status: workerState.isRunning ? "healthy" : "degraded",
        feedWorker: {
          lastRun: health.lastWorkerRun,
          avgProcessingTimeMs: health.avgProcessingTime,
          failedSources: health.failedSourcesCount,
        },
        uptime: Math.floor((Date.now() - workerState.startedAt.getTime()) / 1000),
      });
    } catch (e) {
      res.status(503).json({ status: "failed", error: "Worker status unavailable" });
    }
  });

  app.get("/api/status/queue", async (_req, res) => {
    try {
      const stats = await getQueueStats();
      const healthy = (stats.failed || 0) < 50;
      res.json({
        status: healthy ? "healthy" : "degraded",
        ...stats,
      });
    } catch (e) {
      res.status(503).json({ status: "failed", error: "Queue status unavailable" });
    }
  });

  // === ADMIN: FEATURE FLAGS ===
  app.get("/api/admin/feature-flags", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const flags = await storage.getFeatureFlags();
    res.json(flags);
  });

  const featureFlagSchema = z.object({
    key: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/, "Key must be alphanumeric with underscores, dots, or hyphens"),
    enabled: z.boolean().default(false),
    description: z.string().max(500).optional(),
  });

  app.post("/api/admin/feature-flags", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const parsed = featureFlagSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    const { key, enabled, description } = parsed.data;
    const flag = await storage.upsertFeatureFlag(sanitizeInput(key), enabled, description ? sanitizeInput(description) : undefined);
    await storage.createAuditLog({ userId: user.id, action: "upsert", entity: "feature_flag", entityId: flag.id, details: `Feature flag '${key}' set to ${enabled}` });
    res.json(flag);
  });

  app.delete("/api/admin/feature-flags/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.deleteFeatureFlag(id);
    await storage.createAuditLog({ userId: user.id, action: "delete", entity: "feature_flag", entityId: id, details: `Deleted feature flag #${id}` });
    res.sendStatus(204);
  });

  app.get("/api/feature-flags", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const flags = await storage.getFeatureFlags();
    const flagMap: Record<string, boolean> = {};
    for (const f of flags) flagMap[f.key] = f.enabled ?? false;
    res.json(flagMap);
  });

  // === ADMIN: USAGE METRICS ===
  app.get("/api/admin/usage-metrics", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const metrics = await storage.getUsageMetrics({
      event: req.query.event as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    });
    res.json(metrics);
  });

  app.get("/api/admin/usage-summary", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const summary = await storage.getUsageSummary(days);
    res.json(summary);
  });

  // === ADMIN: OPS DOCUMENTATION ===
  app.get("/api/admin/docs", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({
      architecture: {
        overview: "NWS360 is a full-stack news aggregation platform with AI-powered analysis.",
        stack: "React + Vite frontend, Express.js backend, PostgreSQL (Neon) database, OpenAI for AI analysis.",
        workers: [
          { name: "Feed Worker", schedule: "Priority-based (5/10/15 min)", file: "server/feed-worker.ts" },
          { name: "Analytics Worker", schedule: "Every 15 minutes", file: "server/analytics-worker.ts" },
          { name: "Data Retention Worker", schedule: "Every 24 hours", file: "server/data-retention-worker.ts" },
          { name: "Processing Queue", schedule: "5-second polling", file: "server/processing-queue.ts" },
        ],
      },
      ingestion: {
        pipeline: "FETCH → CLEAN → STRUCTURE → ANALYZE → STORE",
        supported: ["RSS/Atom feeds", "Websites (auto RSS discovery)", "YouTube", "Facebook", "Instagram", "Twitter/X", "Telegram", "Google News"],
        deduplication: "By article URL",
        retry: "Up to 3 retries with exponential backoff",
      },
      analytics: {
        types: ["Content Volume", "Trending Topics", "Sentiment Reports", "Source Behavior", "Keyword Analysis", "Narrative Comparison", "Daily Brief"],
        caching: "Pre-computed metrics for 7-day and 30-day periods, refreshed every 15 minutes",
      },
      recovery: {
        database: "Neon PostgreSQL provides automatic point-in-time recovery. Use Replit's checkpoint system for rollback.",
        workers: "Workers auto-restart on failure. Sources with 5+ consecutive failures are auto-paused.",
        queue: "Failed jobs retry with exponential backoff (max 3 attempts). Admin can requeue failed jobs.",
      },
      healthChecks: {
        endpoints: [
          { path: "/api/status", description: "Overall system health" },
          { path: "/api/status/database", description: "Database connectivity and stats" },
          { path: "/api/status/workers", description: "Worker health and metrics" },
          { path: "/api/status/queue", description: "Processing queue status" },
        ],
      },
      featureFlags: {
        description: "Toggle features without redeploying. Admin can create/update/delete flags via /api/admin/feature-flags.",
        usage: "Frontend fetches flags from /api/feature-flags and gates UI components.",
      },
    });
  });

  // ===================================================================
  // KNOWLEDGE MEMORY & HISTORICAL INTELLIGENCE ROUTES
  // ===================================================================

  // === STORY TIMELINES ===
  app.get("/api/knowledge/timelines", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getStoryTimelines(user.clientId || undefined);
    res.json(items);
  });

  app.get("/api/knowledge/timelines/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const timeline = await storage.getStoryTimeline(parseInt(req.params.id));
    if (!timeline) return res.status(404).json({ message: "Not found" });
    res.json(timeline);
  });

  app.post("/api/knowledge/timelines", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ mainTopic: z.string().min(1), summary: z.string().optional(), status: z.enum(["active", "dormant", "recurring"]).optional(), storyClusterId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createStoryTimeline({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/timelines/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const item = await storage.updateStoryTimeline(parseInt(req.params.id), req.body);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/knowledge/timelines/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteStoryTimeline(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === TIMELINE EVENTS ===
  app.get("/api/knowledge/timelines/:id/events", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const events = await storage.getTimelineEvents(parseInt(req.params.id));
    res.json(events);
  });

  app.post("/api/knowledge/timelines/:id/events", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ label: z.string().min(1), description: z.string().optional(), articleId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createTimelineEvent({ ...parsed.data, timelineId: parseInt(req.params.id) });
    await storage.updateStoryTimeline(parseInt(req.params.id), { lastSeen: new Date() });
    res.status(201).json(item);
  });

  app.delete("/api/knowledge/timeline-events/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteTimelineEvent(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === RECURRING PATTERNS ===
  app.get("/api/knowledge/patterns", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getRecurringPatterns(user.clientId || undefined);
    res.json(items);
  });

  app.post("/api/knowledge/patterns", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ topic: z.string().min(1), recurrenceInterval: z.string().optional(), confidence: z.number().int().min(0).max(100).optional(), occurrenceCount: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createRecurringPattern({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/patterns/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const item = await storage.updateRecurringPattern(parseInt(req.params.id), req.body);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/knowledge/patterns/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteRecurringPattern(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === ENTITY MEMORY ===
  app.get("/api/knowledge/entity-memory", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getEntityMemories(user.clientId || undefined);
    res.json(items);
  });

  app.get("/api/knowledge/entity-memory/by-name/:name", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const item = await storage.getEntityMemoryByName(decodeURIComponent(req.params.name));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.post("/api/knowledge/entity-memory", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ entityName: z.string().min(1), entityType: z.string().optional(), biography: z.string().optional(), associatedTopics: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createEntityMemory({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/entity-memory/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const item = await storage.updateEntityMemory(parseInt(req.params.id), req.body);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/knowledge/entity-memory/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteEntityMemory(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === NARRATIVE SHIFTS ===
  app.get("/api/knowledge/narrative-shifts", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const topic = req.query.topic as string | undefined;
    const items = await storage.getNarrativeShifts({ topic, clientId: user.clientId || undefined });
    res.json(items);
  });

  app.post("/api/knowledge/narrative-shifts", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ topic: z.string().min(1), framingTerms: z.array(z.string()).optional(), sentimentDelta: z.number().int().optional(), summary: z.string().optional(), storyClusterId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createNarrativeShift({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(item);
  });

  app.delete("/api/knowledge/narrative-shifts/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteNarrativeShift(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === INSTITUTIONAL / ORG NOTES ===
  app.get("/api/knowledge/org-notes", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const topic = req.query.topic as string | undefined;
    const items = await storage.getInstitutionalNotes(user.clientId || undefined, topic);
    res.json(items);
  });

  app.post("/api/knowledge/org-notes", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ relatedTopic: z.string().min(1), content: z.string().min(1), noteType: z.enum(["context", "policy", "decision", "reference"]).optional(), targetType: z.string().optional(), targetId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createInstitutionalNote({ ...parsed.data, userId: user.id, clientId: user.clientId });
    res.status(201).json(item);
  });

  app.delete("/api/knowledge/org-notes/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteInstitutionalNote(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === HISTORICAL MATCHES ===
  app.get("/api/knowledge/historical-matches", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getHistoricalMatches(user.clientId || undefined);
    res.json(items);
  });

  app.post("/api/knowledge/historical-matches", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ currentStoryId: z.number().int().optional(), pastStoryId: z.number().int().optional(), similarityScore: z.number().int().min(0).max(100).optional(), matchReason: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createHistoricalMatch({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/historical-matches/:id/acknowledge", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.acknowledgeHistoricalMatch(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === TREND LIFECYCLES ===
  app.get("/api/knowledge/trends", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getTrendLifecycles(user.clientId || undefined);
    res.json(items);
  });

  app.post("/api/knowledge/trends", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ topic: z.string().min(1), stage: z.enum(["emergence", "growth", "peak", "decline", "dormant", "reactivation"]).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createTrendLifecycle({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(item);
  });

  app.patch("/api/knowledge/trends/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const item = await storage.updateTrendLifecycle(parseInt(req.params.id), req.body);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/knowledge/trends/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteTrendLifecycle(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === LONG-RANGE BRIEFINGS ===
  app.get("/api/knowledge/briefings", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const periodType = req.query.periodType as string | undefined;
    const items = await storage.getLongRangeBriefings(user.clientId || undefined, periodType);
    res.json(items);
  });

  app.post("/api/knowledge/briefings", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ periodType: z.enum(["monthly", "quarterly", "yearly"]), summary: z.string().optional(), findings: z.any().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const item = await storage.createLongRangeBriefing({ ...parsed.data, generatedBy: user.id, clientId: user.clientId });
    res.status(201).json(item);
  });

  app.delete("/api/knowledge/briefings/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteLongRangeBriefing(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === AI MEMORY ANSWERS ===
  app.get("/api/knowledge/ai-answers", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getAiMemoryAnswers(user.clientId || undefined, 50);
    res.json(items);
  });

  app.post("/api/knowledge/ai-answers", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ query: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const timelines = await storage.getStoryTimelines(user.clientId || undefined);
      const patterns = await storage.getRecurringPatterns(user.clientId || undefined);
      const trends = await storage.getTrendLifecycles(user.clientId || undefined);
      const entityMems = await storage.getEntityMemories(user.clientId || undefined);
      const notes = await storage.getInstitutionalNotes(user.clientId || undefined);
      const matches = await storage.getHistoricalMatches(user.clientId || undefined);

      const contextSummary = [
        timelines.length > 0 ? `Active timelines: ${timelines.slice(0, 10).map(t => `${t.mainTopic} (${t.status})`).join(", ")}` : "",
        patterns.length > 0 ? `Recurring patterns: ${patterns.slice(0, 10).map(p => `${p.topic} (interval: ${p.recurrenceInterval}, confidence: ${p.confidence}%)`).join(", ")}` : "",
        trends.length > 0 ? `Trend lifecycles: ${trends.slice(0, 10).map(t => `${t.topic} (${t.stage})`).join(", ")}` : "",
        entityMems.length > 0 ? `Known entities: ${entityMems.slice(0, 10).map(e => `${e.entityName} (${e.entityType || "unknown"})`).join(", ")}` : "",
        notes.length > 0 ? `Org notes: ${notes.slice(0, 5).map(n => `[${n.relatedTopic}] ${n.content.substring(0, 100)}`).join("; ")}` : "",
        matches.length > 0 ? `Historical matches: ${matches.slice(0, 5).map(m => `story ${m.currentStoryId} ~ story ${m.pastStoryId} (${m.similarityScore}%)`).join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You are a memory-enhanced intelligence analyst for a news platform. You have access to institutional knowledge including story timelines, recurring patterns, trend lifecycles, entity histories, organizational notes, and historical matches. Use this context to provide historically-aware, contextual answers. Always reference relevant past data when available.\n\nKnowledge Context:\n${contextSummary || "No historical data available yet."}` },
          { role: "user", content: parsed.data.query },
        ],
        max_tokens: 1000,
      });

      const answer = completion.choices[0]?.message?.content || "Unable to generate answer.";
      const saved = await storage.createAiMemoryAnswer({
        query: parsed.data.query,
        answer,
        contextRefs: { timelinesUsed: timelines.length, patternsUsed: patterns.length, trendsUsed: trends.length, entitiesUsed: entityMems.length },
        createdBy: user.id,
        clientId: user.clientId,
      });
      res.status(201).json(saved);
    } catch (err: any) {
      console.error("AI Memory answer error:", err.message);
      const saved = await storage.createAiMemoryAnswer({
        query: parsed.data.query,
        answer: "AI analysis is temporarily unavailable. Your question has been saved and can be re-analyzed later.",
        createdBy: user.id,
        clientId: user.clientId,
      });
      res.status(201).json(saved);
    }
  });

  // === PREDICTIVE INTELLIGENCE & FORECASTING ===

  // Topic Forecasts
  app.get("/api/forecast/topics", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const forecasts = await storage.getTopicForecasts(user.clientId || undefined);
    res.json(forecasts);
  });

  app.post("/api/forecast/topics", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      topic: z.string().min(1),
      momentum: z.number().int().optional(),
      acceleration: z.number().int().optional(),
      mediaAmplification: z.number().int().optional(),
      actorExpansion: z.number().int().optional(),
      next24hProbability: z.number().int().min(0).max(100).optional(),
      next7dProbability: z.number().int().min(0).max(100).optional(),
      predictedStage: z.enum(["emerging", "escalating", "peaking", "declining"]).optional(),
      confidenceScore: z.number().int().min(0).max(100).optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const forecast = await storage.createTopicForecast({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(forecast);
  });

  app.delete("/api/forecast/topics/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const forecasts = await storage.getTopicForecasts(user.clientId || undefined);
    if (!forecasts.find(f => f.id === id)) return res.sendStatus(403);
    await storage.deleteTopicForecast(id);
    res.sendStatus(204);
  });

  // Early Signals
  app.get("/api/forecast/signals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const signals = await storage.getEarlySignals(user.clientId || undefined);
    res.json(signals);
  });

  app.post("/api/forecast/signals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      signalType: z.string().min(1),
      relatedTopic: z.string().min(1),
      strength: z.number().int().min(0).max(100).optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const signal = await storage.createEarlySignal({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(signal);
  });

  app.delete("/api/forecast/signals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const signals = await storage.getEarlySignals(user.clientId || undefined);
    if (!signals.find(s => s.id === id)) return res.sendStatus(403);
    await storage.deleteEarlySignal(id);
    res.sendStatus(204);
  });

  // Risk Scores
  app.get("/api/forecast/risks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const risks = await storage.getRiskScores(user.clientId || undefined);
    res.json(risks);
  });

  app.post("/api/forecast/risks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      subject: z.string().min(1),
      subjectType: z.enum(["topic", "entity", "region"]).optional(),
      operationalRisk: z.number().int().min(0).max(100).optional(),
      reputationalRisk: z.number().int().min(0).max(100).optional(),
      escalationRisk: z.number().int().min(0).max(100).optional(),
      confidence: z.number().int().min(0).max(100).optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const risk = await storage.createRiskScore({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(risk);
  });

  app.delete("/api/forecast/risks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const risks = await storage.getRiskScores(user.clientId || undefined);
    if (!risks.find(r => r.id === id)) return res.sendStatus(403);
    await storage.deleteRiskScore(id);
    res.sendStatus(204);
  });

  // Influence Graph
  app.get("/api/forecast/influence", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const graph = await storage.getInfluenceGraph(user.clientId || undefined);
    res.json(graph);
  });

  app.post("/api/forecast/influence", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      sourceA: z.string().min(1),
      sourceB: z.string().min(1),
      influenceStrength: z.number().int().min(0).max(100).optional(),
      cascadeDelay: z.number().int().optional(),
      relationship: z.enum(["amplifies", "contradicts", "delays", "originates"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const entry = await storage.createInfluenceGraphEntry({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(entry);
  });

  app.delete("/api/forecast/influence/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const entries = await storage.getInfluenceGraph(user.clientId || undefined);
    if (!entries.find(e => e.id === id)) return res.sendStatus(403);
    await storage.deleteInfluenceGraphEntry(id);
    res.sendStatus(204);
  });

  // Attention Decay
  app.get("/api/forecast/attention", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const decay = await storage.getAttentionDecay(user.clientId || undefined);
    res.json(decay);
  });

  app.post("/api/forecast/attention", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      topic: z.string().min(1),
      estimatedDaysRemaining: z.number().int().min(0).optional(),
      decayRate: z.number().int().min(0).max(100).optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const entry = await storage.createAttentionDecay({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(entry);
  });

  app.delete("/api/forecast/attention/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const entries = await storage.getAttentionDecay(user.clientId || undefined);
    if (!entries.find(e => e.id === id)) return res.sendStatus(403);
    await storage.deleteAttentionDecay(id);
    res.sendStatus(204);
  });

  // Alert Priority Scores
  app.get("/api/forecast/alert-priority", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const scores = await storage.getAlertPriorityScores(user.clientId || undefined);
    res.json(scores);
  });

  app.post("/api/forecast/alert-priority", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      alertId: z.number().int().optional(),
      topic: z.string().optional(),
      score: z.number().int().min(0).max(100).optional(),
      acceleratingCoverage: z.boolean().optional(),
      multiRegionSpread: z.boolean().optional(),
      sentimentVolatility: z.boolean().optional(),
      explanation: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const score = await storage.createAlertPriorityScore({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(score);
  });

  // Forecast Results (Accuracy Tracking)
  app.get("/api/forecast/results", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const results = await storage.getForecastResults(user.clientId || undefined);
    res.json(results);
  });

  app.post("/api/forecast/results", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      forecastId: z.number().int().optional(),
      forecastType: z.string().min(1),
      originalPrediction: z.string().optional(),
      outcome: z.string().optional(),
      accuracyScore: z.number().int().min(0).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const result = await storage.createForecastResult({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(result);
  });

  // Future Briefings
  app.get("/api/forecast/future-briefings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const briefings = await storage.getFutureBriefings(user.clientId || undefined);
    res.json(briefings);
  });

  app.post("/api/forecast/future-briefings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      date: z.string().min(1),
      possibleEscalations: z.array(z.object({ topic: z.string(), probability: z.number(), explanation: z.string() })).optional(),
      emergingActors: z.array(z.object({ name: z.string(), context: z.string() })).optional(),
      fadingTopics: z.array(z.object({ topic: z.string(), estimatedDaysLeft: z.number() })).optional(),
      summary: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const briefing = await storage.createFutureBriefing({ ...parsed.data, clientId: user.clientId });
    res.status(201).json(briefing);
  });

  app.delete("/api/forecast/future-briefings/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const briefings = await storage.getFutureBriefings(user.clientId || undefined);
    if (!briefings.find(b => b.id === id)) return res.sendStatus(403);
    await storage.deleteFutureBriefing(id);
    res.sendStatus(204);
  });

  // Scenario Simulation (AI-powered What-If Analysis)
  app.post("/api/forecast/simulate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const schema = z.object({
      topic: z.string().min(1),
      hypotheticalEvent: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    try {
      const forecasts = await storage.getTopicForecasts(user.clientId || undefined);
      const risks = await storage.getRiskScores(user.clientId || undefined);
      const signals = await storage.getEarlySignals(user.clientId || undefined);

      const context = [
        forecasts.length > 0 ? `Current forecasts: ${forecasts.slice(0, 5).map(f => `${f.topic} (${f.predictedStage}, momentum: ${f.momentum})`).join(", ")}` : "",
        risks.length > 0 ? `Risk scores: ${risks.slice(0, 5).map(r => `${r.subject} (op: ${r.operationalRisk}%, rep: ${r.reputationalRisk}%, esc: ${r.escalationRisk}%)`).join(", ")}` : "",
        signals.length > 0 ? `Active signals: ${signals.slice(0, 5).map(s => `${s.signalType} on ${s.relatedTopic} (strength: ${s.strength}%)`).join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You are a predictive intelligence analyst for a news monitoring platform. Given a topic and a hypothetical event, estimate the likely outcomes. Provide your analysis as JSON with these fields: coverageIncreaseLikelihood (0-100), sentimentImpact (string describing direction and magnitude), relatedTopicsActivation (array of topic strings), riskAssessment (string), timeframe (string), explanation (string). Be specific and data-driven.\n\nContext:\n${context || "No existing forecast data."}` },
          { role: "user", content: `Topic: ${parsed.data.topic}\nHypothetical Event: ${parsed.data.hypotheticalEvent}` },
        ],
        max_tokens: 800,
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (err: any) {
      console.error("Simulation error:", err.message);
      res.json({
        coverageIncreaseLikelihood: 50,
        sentimentImpact: "Unable to determine - AI analysis temporarily unavailable",
        relatedTopicsActivation: [],
        riskAssessment: "Analysis pending",
        timeframe: "Unknown",
        explanation: "AI simulation is temporarily unavailable. Please try again later.",
      });
    }
  });

  // === SEED & START WORKERS ===
  await seed();
  startFeedWorker();
  startQueueProcessor();
  startLearningWorker();

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

  // === AI INTELLIGENCE ROUTES ===
  const { answerIntelligenceQuery, runIntelligencePipeline, analyzeNarratives } = await import("./ai-intelligence");

  app.get("/api/stories", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const clusters = await storage.getStoryClusters({ limit, offset, clientId: clientId || undefined });
    res.json(clusters);
  });

  app.get("/api/stories/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const cluster = await storage.getStoryCluster(id);
    if (!cluster) return res.status(404).json({ message: "Story not found" });
    const user = req.user as any;
    const clientId = resolveClientId(user);
    if (clientId && cluster.clientId !== clientId) return res.status(403).json({ message: "Access denied" });
    const clusterArticles = await storage.getClusterArticles(id);
    res.json({ ...cluster, articles: clusterArticles });
  });

  app.post("/api/stories/:id/narratives", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const cluster = await storage.getStoryCluster(id);
    if (!cluster) return res.status(404).json({ message: "Story not found" });
    const user = req.user as any;
    const clientId = resolveClientId(user);
    if (clientId && cluster.clientId !== clientId) return res.status(403).json({ message: "Access denied" });
    const result = await analyzeNarratives(id);
    if (!result) return res.status(404).json({ message: "Not enough data for narrative analysis" });
    res.json(result);
  });

  app.get("/api/briefs", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const briefs = await storage.getDailyBriefs(limit, clientId || undefined);
    res.json(briefs);
  });

  app.get("/api/briefs/:date", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const brief = await storage.getDailyBrief(req.params.date, clientId || undefined);
    if (!brief) return res.status(404).json({ message: "No brief for this date" });
    res.json(brief);
  });

  app.get("/api/events", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const events = await storage.getDetectedEvents({
      type: req.query.type as string,
      severity: req.query.severity as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      acknowledged: req.query.acknowledged === "true" ? true : req.query.acknowledged === "false" ? false : undefined,
      clientId: clientId || undefined,
    });
    res.json(events);
  });

  app.post("/api/events/:id/acknowledge", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.acknowledgeEvent(id);
    res.json({ success: true });
  });

  app.get("/api/entities", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const topEntities = await storage.getTopEntities({
      limit: req.query.limit ? parseInt(req.query.limit as string) : 30,
      days: req.query.days ? parseInt(req.query.days as string) : 7,
      entityType: req.query.type as string,
      clientId: clientId || undefined,
    });
    res.json(topEntities);
  });

  app.get("/api/entities/:name", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const name = decodeURIComponent(req.params.name);
    const mentions = await storage.getEntityMentions(name, {
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      clientId: clientId || undefined,
    });
    const timeline = await storage.getEntityTimeline(name, req.query.days ? parseInt(req.query.days as string) : 30, clientId || undefined);
    res.json({ entityName: name, mentions, timeline });
  });

  app.get("/api/predictions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const predictions = await storage.getTrendPredictions({
      topic: req.query.topic as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      clientId: clientId || undefined,
    });
    res.json(predictions);
  });

  app.post("/api/ai/query", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const { question } = req.body;
    if (!question || typeof question !== "string") return res.status(400).json({ message: "Question is required" });
    const result = await answerIntelligenceQuery(sanitizeInput(question), clientId || undefined);
    res.json(result);
  });

  app.get("/api/articles/:id/analysis", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const analysis = await storage.getArticleAiAnalysis(id);
    if (!analysis) return res.status(404).json({ message: "No AI analysis available" });
    res.json(analysis);
  });

  app.post("/api/admin/run-intelligence", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    runIntelligencePipeline().catch(e => console.error("[Intelligence Pipeline] Error:", e));
    res.json({ message: "Intelligence pipeline started" });
  });

  setInterval(async () => {
    try {
      await runIntelligencePipeline();
    } catch (e) {
      console.error("[Intelligence Pipeline] Scheduled run error:", e);
    }
  }, 30 * 60 * 1000);

  setTimeout(async () => {
    try {
      await runIntelligencePipeline();
    } catch (e) {
      console.error("[Intelligence Pipeline] Initial run error:", e);
    }
  }, 60 * 1000);

  app.get("/api/subscription", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!user.clientId) return res.json(null);
    const sub = await storage.getSubscription(user.clientId);
    const activeUsers = await storage.getActiveUserCount(user.clientId);
    res.json({ subscription: sub, activeUsers, planLimits: sub ? PLAN_LIMITS[sub.plan as keyof typeof PLAN_LIMITS] : PLAN_LIMITS.basic });
  });

  app.get("/api/subscription/usage", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const resolvedClientId = user.clientId || (user.role === "client" ? user.id : null);
    if (!resolvedClientId) return res.json({ plan: "basic", seats: { used: 0, max: 0 }, keywords: { used: 0, max: 0 }, sources: { used: 0, max: 0 } });
    const sub = await storage.getSubscription(resolvedClientId);
    const limits = sub ? PLAN_LIMITS[sub.plan as keyof typeof PLAN_LIMITS] : PLAN_LIMITS.basic;
    const activeUsers = await storage.getActiveUserCount(resolvedClientId);
    const clientKws = await storage.getClientKeywords(resolvedClientId);
    const allSources = await storage.getSources();
    const clientUsers = await storage.getUsersByClientId(resolvedClientId);
    const clientUserIds = new Set(clientUsers.map((u: any) => u.id));
    clientUserIds.add(resolvedClientId);
    const userSources = allSources.filter((s: any) => clientUserIds.has(s.userId));
    res.json({
      plan: sub?.plan || "basic",
      status: sub?.status || "trial",
      seats: { used: activeUsers, max: limits.maxUsers },
      keywords: { used: clientKws.length, max: limits.maxKeywords },
      sources: { used: userSources.length, max: limits.maxSources },
      analyticsLevel: limits.analyticsLevel,
      aiBriefLevel: limits.aiBriefLevel,
      apiAccess: limits.apiAccess,
    });
  });

  app.post("/api/billing/activate", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { clientId, plan } = req.body;
    if (!clientId || !plan) return res.status(400).json({ message: "Client ID and plan required" });
    if (!["basic", "pro", "enterprise"].includes(plan)) return res.status(400).json({ message: "Invalid plan" });
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    const existing = await storage.getSubscription(clientId);
    if (existing) {
      const updated = await storage.updateSubscription(clientId, { plan, status: "active", maxUsers: limits.maxUsers === -1 ? 999 : limits.maxUsers, maxKeywords: limits.maxKeywords === -1 ? 999 : limits.maxKeywords, maxSources: limits.maxSources === -1 ? 999 : limits.maxSources, analyticsLevel: limits.analyticsLevel, aiBriefLevel: limits.aiBriefLevel, apiAccess: limits.apiAccess });
      return res.json(updated);
    }
    const sub = await storage.createSubscription({ clientId, plan, status: "active", maxUsers: limits.maxUsers === -1 ? 999 : limits.maxUsers, maxKeywords: limits.maxKeywords === -1 ? 999 : limits.maxKeywords, maxSources: limits.maxSources === -1 ? 999 : limits.maxSources, analyticsLevel: limits.analyticsLevel, aiBriefLevel: limits.aiBriefLevel, apiAccess: limits.apiAccess });
    res.status(201).json(sub);
  });

  app.post("/api/billing/change-plan", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { clientId, plan } = req.body;
    if (!clientId || !plan) return res.status(400).json({ message: "Client ID and plan required" });
    if (!["basic", "pro", "enterprise"].includes(plan)) return res.status(400).json({ message: "Invalid plan" });
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    const updated = await storage.updateSubscription(clientId, { plan, maxUsers: limits.maxUsers === -1 ? 999 : limits.maxUsers, maxKeywords: limits.maxKeywords === -1 ? 999 : limits.maxKeywords, maxSources: limits.maxSources === -1 ? 999 : limits.maxSources, analyticsLevel: limits.analyticsLevel, aiBriefLevel: limits.aiBriefLevel, apiAccess: limits.apiAccess });
    if (!updated) return res.status(404).json({ message: "Subscription not found" });
    res.json(updated);
  });

  app.post("/api/billing/cancel", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ message: "Client ID required" });
    const updated = await storage.updateSubscription(clientId, { status: "suspended" });
    if (!updated) return res.status(404).json({ message: "Subscription not found" });
    res.json(updated);
  });

  app.get("/api/onboarding", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!user.clientId) return res.json(null);
    const state = await storage.getOnboardingState(user.clientId);
    res.json(state);
  });

  app.post("/api/onboarding", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!user.clientId) return res.status(400).json({ message: "No client association" });
    const { currentStep, industry, countries, selectedKeywords, selectedSources, notificationPreferences, completed } = req.body;
    const state = await storage.upsertOnboardingState({
      clientId: user.clientId,
      currentStep: currentStep || 1,
      industry: industry ? sanitizeInput(industry) : undefined,
      countries: countries || undefined,
      selectedKeywords: selectedKeywords || undefined,
      selectedSources: selectedSources || undefined,
      notificationPreferences: notificationPreferences || undefined,
      completed: completed || false,
      completedAt: completed ? new Date() : undefined,
    });
    res.json(state);
  });

  app.get("/api/notifications/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const settings = await storage.getNotificationSettings(user.id);
    res.json(settings);
  });

  app.post("/api/notifications/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { channel, frequency, type, enabled, config } = req.body;
    if (!channel) return res.status(400).json({ message: "Channel required" });
    const setting = await storage.upsertNotificationSetting({ userId: user.id, channel: sanitizeInput(channel), frequency: frequency || "daily", type: type || "briefing", enabled: enabled !== false, config: config || null });
    res.json(setting);
  });

  app.delete("/api/notifications/settings/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.deleteNotificationSetting(id);
    res.sendStatus(204);
  });

  app.get("/api/white-label", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!user.clientId) return res.json(null);
    const settings = await storage.getWhiteLabelSettings(user.clientId);
    res.json(settings);
  });

  app.put("/api/white-label", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    if (!user.clientId) return res.status(400).json({ message: "No client association" });
    const { logoUrl, organizationName, customReportTitle, primaryColor } = req.body;
    const settings = await storage.upsertWhiteLabelSettings({ clientId: user.clientId, logoUrl: logoUrl || null, organizationName: organizationName ? sanitizeInput(organizationName) : null, customReportTitle: customReportTitle ? sanitizeInput(customReportTitle) : null, primaryColor: primaryColor || null });
    res.json(settings);
  });

  app.get("/api/support/tickets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const params: any = {};
    if (user.role !== "admin") params.userId = user.id;
    if (req.query.status) params.status = req.query.status as string;
    const tickets = await storage.getSupportTickets(params);
    res.json(tickets);
  });

  app.post("/api/support/tickets", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { subject, message, priority } = req.body;
    if (!subject || !message) return res.status(400).json({ message: "Subject and message required" });
    const ticket = await storage.createSupportTicket({ userId: user.id, clientId: user.clientId || null, subject: sanitizeInput(subject), message: sanitizeInput(message), priority: priority || "normal" });
    res.status(201).json(ticket);
  });

  app.put("/api/support/tickets/:id/status", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "Status required" });
    await storage.updateSupportTicketStatus(id, status);
    res.sendStatus(204);
  });

  app.get("/api/executive/snapshot", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = resolveClientId(user);
    const scopedSourceIds = await getUserSourceIds(user);
    const articles = await storage.getArticles({ limit: 5, sourceIds: scopedSourceIds, clientId: clientId || undefined });
    const events = await storage.getDetectedEvents({ limit: 5, clientId: clientId || undefined });
    const briefs = await storage.getDailyBriefs(1, clientId || undefined);
    const entities = await storage.getTopEntities({ limit: 5, days: 1, clientId: clientId || undefined });
    const clusters = await storage.getStoryClusters({ limit: 3, clientId: clientId || undefined });
    res.json({
      topStory: clusters[0] || null,
      latestBrief: briefs[0] || null,
      alerts: events,
      topEntities: entities,
      recentArticles: articles.items.slice(0, 5),
      storyClusters: clusters,
    });
  });

  app.get("/api/demo/snapshot", async (_req, res) => {
    res.json({
      plan: "pro",
      topStory: { title: "Global Climate Summit 2026", mainTopic: "Climate Policy", articleCount: 24, sourceCount: 8, importanceScore: 92, avgSentiment: -15 },
      latestBrief: { date: new Date().toISOString().split("T")[0], content: "Today's intelligence overview highlights continued developments in climate policy discussions, with multiple world leaders announcing new commitments. Market volatility persists as central banks signal cautious approaches to monetary policy.", majorDevelopments: [{ title: "Climate Summit Progress", summary: "New emissions targets proposed by G20 nations" }, { title: "Market Watch", summary: "Tech sector leads recovery amid cautious optimism" }], emergingTopics: ["AI Regulation", "Supply Chain Resilience", "Digital Currency"], confidenceScore: 85 },
      alerts: [{ id: 1, type: "volume_spike", topic: "Climate Summit", severity: "high", explanation: "300% increase in coverage over 24 hours", acknowledged: false }, { id: 2, type: "sentiment_shift", topic: "Tech Regulation", severity: "medium", explanation: "Shift from neutral to negative coverage", acknowledged: false }],
      topEntities: [{ entityName: "United Nations", entityType: "organization", mentionCount: 45, avgSentiment: 8 }, { entityName: "European Union", entityType: "organization", mentionCount: 38, avgSentiment: 12 }],
      usage: { seats: { used: 5, max: 10 }, keywords: { used: 23, max: 50 }, sources: { used: 12, max: 20 }, articlesProcessed: 1247 },
    });
  });

  // === PRODUCT INTELLIGENCE: USER FEEDBACK ===
  app.post("/api/feedback", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { feature, targetId, targetType, rating, comment } = req.body;
    if (!feature || !rating) return res.status(400).json({ message: "Feature and rating required" });
    const feedback = await storage.createUserFeedback({ userId: user.id, feature, targetId, targetType, rating, comment });
    res.status(201).json(feedback);
  });

  app.get("/api/feedback", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const params: any = {};
    if (user.role !== "admin") params.userId = user.id;
    if (req.query.feature) params.feature = req.query.feature;
    const feedback = await storage.getUserFeedback(params);
    res.json(feedback);
  });

  // === PRODUCT INTELLIGENCE: INSIGHT ENGAGEMENT ===
  app.post("/api/engagement", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { insightType, insightId, opened, clicked, exported, dwellTimeSeconds } = req.body;
    if (!insightType || !insightId) return res.status(400).json({ message: "Insight type and ID required" });
    const engagement = await storage.upsertInsightEngagement({ userId: user.id, insightType, insightId, opened, clicked, exported, dwellTimeSeconds });
    res.json(engagement);
  });

  app.get("/api/engagement", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const params: any = { userId: user.id };
    if (req.query.insightType) params.insightType = req.query.insightType;
    res.json(await storage.getInsightEngagement(params));
  });

  // === PRODUCT INTELLIGENCE: AI CORRECTIONS ===
  app.post("/api/corrections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { articleId, field, oldValue, newValue } = req.body;
    if (!field || !newValue) return res.status(400).json({ message: "Field and new value required" });
    const correction = await storage.createAiCorrection({ articleId, userId: user.id, field, oldValue, newValue });
    res.status(201).json(correction);
  });

  app.get("/api/corrections", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const params: any = {};
    if (user.role !== "admin") params.userId = user.id;
    if (req.query.status) params.status = req.query.status;
    if (req.query.articleId) params.articleId = parseInt(req.query.articleId as string);
    res.json(await storage.getAiCorrections(params));
  });

  app.patch("/api/corrections/:id/status", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!status || !["pending", "accepted", "rejected"].includes(status)) return res.status(400).json({ message: "Valid status required" });
    await storage.updateAiCorrectionStatus(id, status);
    res.json({ success: true });
  });

  // === PRODUCT INTELLIGENCE: ALERT PREFERENCES ===
  app.get("/api/alert-preferences", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = user.clientId || (user.role === "client" ? user.id : null);
    if (!clientId) return res.json([]);
    res.json(await storage.getAlertPreferences(clientId));
  });

  app.post("/api/alert-preferences", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = user.clientId || (user.role === "client" ? user.id : null);
    if (!clientId) return res.status(400).json({ message: "Client context required" });
    const { alertType, sensitivityScore, autoTuned } = req.body;
    if (!alertType) return res.status(400).json({ message: "Alert type required" });
    const pref = await storage.upsertAlertPreference({ clientId, alertType, sensitivityScore: sensitivityScore ?? 50, autoTuned });
    res.json(pref);
  });

  // === PRODUCT INTELLIGENCE: DASHBOARD PREFERENCES ===
  app.get("/api/dashboard-preferences", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const prefs = await storage.getDashboardPreferences(user.id);
    res.json(prefs || null);
  });

  app.post("/api/dashboard-preferences", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const { pinnedTopics, favoriteEntities, preferredSources, recommendedPanels, frequentSearches } = req.body;
    const prefs = await storage.upsertDashboardPreferences({ userId: user.id, pinnedTopics, favoriteEntities, preferredSources, recommendedPanels, frequentSearches });
    res.json(prefs);
  });

  // === PRODUCT INTELLIGENCE: EXPERIMENTS (A/B TESTING) ===
  app.get("/api/experiments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const status = req.query.status as string | undefined;
    res.json(await storage.getExperiments({ status }));
  });

  app.post("/api/experiments", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { name, description, variants, targetPercentage, endDate } = req.body;
    if (!name || !variants) return res.status(400).json({ message: "Name and variants required" });
    const experiment = await storage.createExperiment({ name, description, variants, targetPercentage, endDate });
    res.status(201).json(experiment);
  });

  app.patch("/api/experiments/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id);
    const updated = await storage.updateExperiment(id, req.body);
    res.json(updated);
  });

  app.get("/api/experiments/my-assignments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    res.json(await storage.getUserExperiments(user.id));
  });

  app.post("/api/experiments/:id/assign", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const experimentId = parseInt(req.params.id);
    const existing = await storage.getExperimentAssignment(user.id, experimentId);
    if (existing) return res.json(existing);
    const experiment = await storage.getExperiments();
    const exp = experiment.find(e => e.id === experimentId);
    if (!exp || exp.status !== "active") return res.status(404).json({ message: "Active experiment not found" });
    const variantList = exp.variants as string[];
    const variant = variantList[Math.floor(Math.random() * variantList.length)];
    const assignment = await storage.createExperimentAssignment({ userId: user.id, experimentId, variant });
    res.status(201).json(assignment);
  });

  // === PRODUCT INTELLIGENCE: KNOWLEDGE BASE ===
  app.get("/api/knowledge", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    res.json(await storage.getKnowledgeEntries({ search, limit }));
  });

  app.post("/api/knowledge", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { questionPattern, answerSummary } = req.body;
    if (!questionPattern || !answerSummary) return res.status(400).json({ message: "Question pattern and answer required" });
    const entry = await storage.upsertKnowledgeEntry({ questionPattern, answerSummary });
    res.json(entry);
  });

  // === PRODUCT INTELLIGENCE: VALUE REPORTS ===
  app.get("/api/value-reports", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user as any;
    const clientId = user.clientId || (user.role === "client" ? user.id : null);
    if (!clientId) return res.json([]);
    res.json(await storage.getValueReports(clientId));
  });

  app.post("/api/value-reports/generate", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ message: "Client ID required" });
    const now = new Date();
    const reportMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const articleResult = await storage.getArticles({ clientId: clientId || undefined });
    const briefs = await storage.getDailyBriefs(30, clientId || undefined);
    const events = await storage.getDetectedEvents({ limit: 100, clientId: clientId || undefined });
    const report = await storage.createValueReport({
      clientId,
      reportMonth,
      alertsDetected: events.length,
      emergingTopicsCaught: briefs.reduce((sum: number, b: any) => sum + ((b.emergingTopics as any[])?.length || 0), 0),
      sentimentChanges: articleResult.items.filter((a: any) => a.sentimentLabel && a.sentimentLabel !== "neutral").length,
      estimatedTimeSavedMinutes: Math.round(articleResult.total * 2.5),
      articlesProcessed: articleResult.total,
      briefsGenerated: briefs.length,
      reportData: { generatedAt: now.toISOString(), period: reportMonth },
    });
    res.status(201).json(report);
  });

  // === PRODUCT INTELLIGENCE: ADMIN USAGE ANALYTICS ===
  app.get("/api/admin/product-analytics", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const feedback = await storage.getUserFeedback({});
    const corrections = await storage.getAiCorrections({});
    const engagement = await storage.getInsightEngagement({});
    const knowledgeBase = await storage.getKnowledgeEntries({});
    const featureCounts: Record<string, number> = {};
    feedback.forEach((f: any) => { featureCounts[f.feature] = (featureCounts[f.feature] || 0) + 1; });
    const ratingDistribution: Record<string, number> = {};
    feedback.forEach((f: any) => { ratingDistribution[f.rating] = (ratingDistribution[f.rating] || 0) + 1; });
    const engagementStats = {
      totalOpened: engagement.filter((e: any) => e.opened).length,
      totalClicked: engagement.filter((e: any) => e.clicked).length,
      totalExported: engagement.filter((e: any) => e.exported).length,
      totalEvents: engagement.length,
    };
    const correctionsByField: Record<string, number> = {};
    corrections.forEach((c: any) => { correctionsByField[c.field] = (correctionsByField[c.field] || 0) + 1; });
    res.json({
      feedback: { total: feedback.length, byFeature: featureCounts, byRating: ratingDistribution },
      engagement: engagementStats,
      corrections: { total: corrections.length, byField: correctionsByField, pendingCount: corrections.filter((c: any) => c.status === "pending").length },
      knowledgeBase: { totalEntries: knowledgeBase.length, topQueries: knowledgeBase.slice(0, 10).map((k: any) => ({ pattern: k.questionPattern, count: k.queryCount })) },
    });
  });

  // === INTEGRATION: WEBHOOKS ===
  app.get("/api/integrations/webhooks", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const webhooks = await storage.getWebhooks(user.clientId || undefined);
    res.json(webhooks);
  });

  app.post("/api/integrations/webhooks", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const { url, eventTypes, description } = req.body;
    if (!url || !eventTypes || !eventTypes.length) return res.status(400).json({ message: "URL and event types required" });
    const secret = randomBytes(32).toString("hex");
    const webhook = await storage.createWebhook({
      clientId: user.clientId || 0,
      url,
      secret,
      eventTypes,
      description,
      active: true,
    });
    res.status(201).json(webhook);
  });

  app.patch("/api/integrations/webhooks/:id", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const webhook = await storage.updateWebhook(parseInt(req.params.id), req.body);
    res.json(webhook);
  });

  app.delete("/api/integrations/webhooks/:id", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteWebhook(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/integrations/webhooks/:id/deliveries", async (req, res) => {
    const deliveries = await storage.getWebhookDeliveries(parseInt(req.params.id), { limit: 50 });
    res.json(deliveries);
  });

  app.post("/api/integrations/webhooks/:id/test", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const webhook = await storage.getWebhook(parseInt(req.params.id));
    if (!webhook) return res.status(404).json({ message: "Webhook not found" });
    const { deliverWebhookEvent } = await import("./webhook-worker");
    await deliverWebhookEvent(webhook, "test", { message: "Test delivery from NWS360", timestamp: new Date().toISOString() });
    res.json({ success: true, message: "Test webhook delivered" });
  });

  // === INTEGRATION: EMAIL SUBSCRIPTIONS ===
  app.get("/api/integrations/email-subscriptions", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const subs = await storage.getEmailSubscriptions(user.id);
    res.json(subs);
  });

  app.post("/api/integrations/email-subscriptions", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const sub = await storage.createEmailSubscription({ ...req.body, userId: user.id });
    res.status(201).json(sub);
  });

  app.patch("/api/integrations/email-subscriptions/:id", async (req, res) => {
    const sub = await storage.updateEmailSubscription(parseInt(req.params.id), req.body);
    res.json(sub);
  });

  app.delete("/api/integrations/email-subscriptions/:id", async (req, res) => {
    await storage.deleteEmailSubscription(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === INTEGRATION: COMMUNICATION (Slack/Teams) ===
  app.get("/api/integrations/communication", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const configs = await storage.getIntegrationConfigs(user.clientId || undefined);
    res.json(configs);
  });

  app.post("/api/integrations/communication", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const config = await storage.createIntegrationConfig({ ...req.body, clientId: user.clientId || 0 });
    res.status(201).json(config);
  });

  app.patch("/api/integrations/communication/:id", async (req, res) => {
    const config = await storage.updateIntegrationConfig(parseInt(req.params.id), req.body);
    res.json(config);
  });

  app.delete("/api/integrations/communication/:id", async (req, res) => {
    await storage.deleteIntegrationConfig(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === INTEGRATION: EMBED WIDGETS ===
  app.get("/api/integrations/embeds", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const tokens = await storage.getEmbedTokens(user.clientId || undefined);
    res.json(tokens);
  });

  app.post("/api/integrations/embeds", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const token = randomBytes(24).toString("hex");
    const embed = await storage.createEmbedToken({
      clientId: user.clientId || 0,
      token,
      widgetType: req.body.widgetType,
      allowedDomains: req.body.allowedDomains || [],
      active: true,
      config: req.body.config || {},
    });
    res.status(201).json(embed);
  });

  app.delete("/api/integrations/embeds/:id", async (req, res) => {
    await storage.deleteEmbedToken(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === PUBLIC EMBED ROUTES (unauthenticated, token-based) ===
  app.get("/embed/:token", async (req, res) => {
    const embedToken = await storage.getEmbedTokenByToken(req.params.token);
    if (!embedToken || !embedToken.active) return res.status(404).send("Widget not found");
    const origin = req.headers.origin || req.headers.referer;
    if (embedToken.allowedDomains && embedToken.allowedDomains.length > 0 && origin) {
      const allowed = embedToken.allowedDomains.some(d => origin.includes(d));
      if (!allowed) return res.status(403).send("Domain not allowed");
    }
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    let widgetData: any = {};
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const embedClientId = embedToken.clientId || undefined;
    if (embedToken.widgetType === "trending_topics") {
      widgetData = await storage.getTrendingTopics(sevenDaysAgo.toISOString(), now.toISOString(), undefined, embedClientId);
    } else if (embedToken.widgetType === "sentiment_overview") {
      widgetData = await storage.getSentimentReports(sevenDaysAgo.toISOString(), now.toISOString(), undefined, embedClientId);
    } else if (embedToken.widgetType === "entity_tracker") {
      widgetData = await storage.getTopEntities({ limit: 10, days: 7, clientId: embedClientId });
    } else if (embedToken.widgetType === "daily_briefing") {
      const today = now.toISOString().split("T")[0];
      widgetData = await storage.getDailyBrief(today, embedClientId);
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWS360 Widget</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e2e8f0;padding:16px}.widget{border:1px solid #1e293b;border-radius:8px;padding:16px;background:#111827}.title{font-size:14px;font-weight:600;margin-bottom:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em}.item{padding:8px 0;border-bottom:1px solid #1e293b;font-size:13px}.item:last-child{border-bottom:none}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}.positive{background:#065f46;color:#6ee7b7}.negative{background:#7f1d1d;color:#fca5a5}.neutral{background:#1e293b;color:#94a3b8}.powered{text-align:center;margin-top:12px;font-size:10px;color:#475569}a{color:#60a5fa;text-decoration:none}</style></head><body><div class="widget"><div class="title">${embedToken.widgetType.replace(/_/g, " ")}</div><div id="content">${renderWidgetContent(embedToken.widgetType, widgetData)}</div></div><div class="powered">Powered by NWS360</div></body></html>`;
    res.type("html").send(html);
  });

  // === INTEGRATION: EXPORTS ===
  app.post("/api/integrations/export", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const exportClientId = resolveClientId(user);
    const { exportType, format, filters } = req.body;
    if (!exportType || !format) return res.status(400).json({ message: "Export type and format required" });
    let resultData: any = null;
    if (exportType === "articles") {
      const result = await storage.getArticles({ ...(filters || {}), clientId: exportClientId || undefined });
      resultData = result.items.map(a => ({
        id: a.id, title: a.title, url: a.url, summary: a.summary,
        source: a.source?.name, category: a.category,
        sentiment: a.sentimentLabel, score: a.sentimentScore,
        keywords: a.keywords, topics: a.topics, country: a.country,
        publishedAt: a.publishedAt,
      }));
    } else if (exportType === "entities") {
      resultData = await storage.getTopEntities({ limit: 100, days: 30, clientId: exportClientId || undefined });
    } else if (exportType === "stories") {
      resultData = await storage.getStoryClusters({ limit: 100, clientId: exportClientId || undefined });
    } else if (exportType === "trends") {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      resultData = await storage.getTrendingTopics(thirtyDaysAgo.toISOString(), now.toISOString(), undefined, exportClientId || undefined);
    } else if (exportType === "briefings") {
      resultData = await storage.getDailyBriefs(30, exportClientId || undefined);
    }
    const job = await storage.createExportJob({
      userId: user.id,
      exportType,
      format,
      filters,
      status: "completed",
      resultData,
    });
    if (format === "csv" && Array.isArray(resultData) && resultData.length > 0) {
      const headers = Object.keys(resultData[0]);
      const csvRows = [headers.join(",")];
      resultData.forEach((row: any) => {
        csvRows.push(headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(","));
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=nws360-${exportType}-${Date.now()}.csv`);
      return res.send(csvRows.join("\n"));
    }
    res.json({ job, data: resultData });
  });

  app.get("/api/integrations/exports", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const jobs = await storage.getExportJobs(user.id);
    res.json(jobs);
  });

  // === INTEGRATION: SSO CONFIG ===
  app.get("/api/integrations/sso", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const configs = await storage.getSsoConfigs(user.clientId || undefined);
    res.json(configs);
  });

  app.post("/api/integrations/sso", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const config = await storage.createSsoConfig({ ...req.body, clientId: user.clientId || 0 });
    res.status(201).json(config);
  });

  app.patch("/api/integrations/sso/:id", async (req, res) => {
    const config = await storage.updateSsoConfig(parseInt(req.params.id), req.body);
    res.json(config);
  });

  app.delete("/api/integrations/sso/:id", async (req, res) => {
    await storage.deleteSsoConfig(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === INTEGRATION: DATA IMPORT CONNECTORS ===
  app.get("/api/integrations/import-connectors", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const connectors = await storage.getImportConnectors(user.clientId || undefined);
    res.json(connectors);
  });

  app.post("/api/integrations/import-connectors", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const connector = await storage.createImportConnector({ ...req.body, clientId: user.clientId || 0 });
    if (connector.connectorType === "private_rss" && connector.url) {
      await storage.createSource({
        name: connector.name,
        url: connector.url,
        type: "rss",
        active: true,
        intervalMinutes: 30,
        userId: user.id,
      });
    }
    res.status(201).json(connector);
  });

  app.patch("/api/integrations/import-connectors/:id", async (req, res) => {
    const connector = await storage.updateImportConnector(parseInt(req.params.id), req.body);
    res.json(connector);
  });

  app.delete("/api/integrations/import-connectors/:id", async (req, res) => {
    await storage.deleteImportConnector(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === INTEGRATION: MOBILE NOTIFICATION PREFS ===
  app.get("/api/integrations/mobile-notifications", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const prefs = await storage.getMobileNotificationPrefs(user.id);
    res.json(prefs || { criticalAlerts: true, briefingReady: true, entityChanges: false, severityLevel: "high" });
  });

  app.put("/api/integrations/mobile-notifications", async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const prefs = await storage.upsertMobileNotificationPrefs({ ...req.body, userId: user.id });
    res.json(prefs);
  });

  // === EXTENDED PARTNER API: stories, entities, briefings ===
  app.get("/api/v1/stories", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const limit = req.query.limit ? Math.min(50, parseInt(req.query.limit as string)) : 20;
    const clusters = await storage.getStoryClusters({ limit, clientId: partnerClientId || undefined });
    res.json({ items: clusters, total: clusters.length });
  });

  app.get("/api/v1/entities", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const limit = req.query.limit ? Math.min(100, parseInt(req.query.limit as string)) : 20;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const entities = await storage.getTopEntities({ limit, days, clientId: partnerClientId || undefined });
    res.json({ items: entities, total: entities.length });
  });

  app.get("/api/v1/briefings", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const limit = req.query.limit ? Math.min(30, parseInt(req.query.limit as string)) : 7;
    const briefs = await storage.getDailyBriefs(limit, partnerClientId || undefined);
    res.json({ items: briefs, total: briefs.length });
  });

  app.get("/api/v1/trends", async (req, res) => {
    const scopes = (req as any).apiKeyScopes as string[];
    if (!scopes.includes("analytics:read")) return res.status(403).json({ message: "Insufficient scope" });
    const partnerClientId = (req as any).apiKeyClientId as number | undefined;
    const now = new Date();
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const data = await storage.getTrendingTopics(startDate.toISOString(), now.toISOString(), undefined, partnerClientId || undefined);
    res.json(data);
  });

  // === ADMIN: INTEGRATION MONITORING ===
  app.get("/api/admin/integration-monitoring", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const webhooks = await storage.getWebhooks();
    const deliveries = await storage.getWebhookDeliveries(undefined, { limit: 100 });
    const configs = await storage.getIntegrationConfigs();
    const embedTokens = await storage.getEmbedTokens();
    const exportJobs = await storage.getExportJobs();
    const importConnectors = await storage.getImportConnectors();
    const apiKeysAll = await storage.getApiKeys();
    const totalDeliveries = deliveries.length;
    const successfulDeliveries = deliveries.filter((d: any) => d.success).length;
    const failedDeliveries = deliveries.filter((d: any) => !d.success).length;
    const recentFailures = deliveries.filter((d: any) => !d.success && d.createdAt && (Date.now() - new Date(d.createdAt).getTime()) < 24 * 60 * 60 * 1000);
    res.json({
      webhooks: { total: webhooks.length, active: webhooks.filter((w: any) => w.active).length },
      deliveries: { total: totalDeliveries, successful: successfulDeliveries, failed: failedDeliveries, recentFailures: recentFailures.length },
      communication: { total: configs.length, active: configs.filter((c: any) => c.active).length, platforms: configs.reduce((acc: Record<string, number>, c: any) => { acc[c.platform] = (acc[c.platform] || 0) + 1; return acc; }, {}) },
      embeds: { total: embedTokens.length, active: embedTokens.filter((e: any) => e.active).length },
      exports: { total: exportJobs.length, recent: exportJobs.filter((j: any) => j.createdAt && (Date.now() - new Date(j.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000).length },
      importConnectors: { total: importConnectors.length, active: importConnectors.filter((c: any) => c.active).length },
      apiKeys: { total: apiKeysAll.length, active: apiKeysAll.filter((k: any) => k.active).length },
      recentDeliveries: deliveries.slice(0, 20),
    });
  });

  // === TEAM COLLABORATION: WORKSPACES ===
  app.get("/api/collaboration/workspaces", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const ws = await storage.getWorkspaces(user.clientId || undefined);
    res.json(ws);
  });

  app.post("/api/collaboration/workspaces", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ name: z.string().min(1).max(200), description: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const ws = await storage.createWorkspace({ ...parsed.data, clientId: user.clientId, createdBy: user.id });
    await storage.addWorkspaceMember({ workspaceId: ws.id, userId: user.id, role: "owner" });
    await storage.createActivityEvent({ workspaceId: ws.id, actorId: user.id, verb: "created_workspace", targetType: "workspace", targetId: ws.id });
    res.status(201).json(ws);
  });

  app.delete("/api/collaboration/workspaces/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteWorkspace(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/collaboration/workspaces/:id/members", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const members = await storage.getWorkspaceMembers(parseInt(req.params.id));
    res.json(members);
  });

  app.post("/api/collaboration/workspaces/:id/members", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const member = await storage.addWorkspaceMember({ workspaceId: parseInt(req.params.id), userId: req.body.userId, role: req.body.role || "member" });
    res.status(201).json(member);
  });

  app.delete("/api/collaboration/workspaces/:wsId/members/:userId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.removeWorkspaceMember(parseInt(req.params.wsId), parseInt(req.params.userId));
    res.json({ success: true });
  });

  // === DISCUSSION COMMENTS ===
  app.get("/api/collaboration/comments/:targetType/:targetId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const cmts = await storage.getComments(req.params.targetType, parseInt(req.params.targetId));
    res.json(cmts);
  });

  app.post("/api/collaboration/comments", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ targetType: z.string().min(1), targetId: z.number().int(), message: z.string().min(1), parentId: z.number().int().optional(), workspaceId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const cmt = await storage.createComment({ ...parsed.data, userId: user.id });
    await storage.createActivityEvent({ workspaceId: parsed.data.workspaceId, actorId: user.id, verb: "commented", targetType: parsed.data.targetType, targetId: parsed.data.targetId });
    res.status(201).json(cmt);
  });

  app.delete("/api/collaboration/comments/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteComment(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === ANNOTATIONS & ANALYST NOTES ===
  app.get("/api/collaboration/annotations/:targetType/:targetId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const notes = await storage.getAnnotations(req.params.targetType, parseInt(req.params.targetId));
    res.json(notes);
  });

  app.post("/api/collaboration/annotations", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ targetType: z.string().min(1), targetId: z.number().int(), noteType: z.enum(["observation", "warning", "hypothesis", "conclusion"]), content: z.string().min(1), workspaceId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const note = await storage.createAnnotation({ ...parsed.data, userId: user.id });
    await storage.createActivityEvent({ workspaceId: parsed.data.workspaceId, actorId: user.id, verb: "annotated", targetType: parsed.data.targetType, targetId: parsed.data.targetId, metadata: { noteType: parsed.data.noteType } });
    res.status(201).json(note);
  });

  app.delete("/api/collaboration/annotations/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteAnnotation(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === SHARED REPORTS / BRIEFINGS ===
  app.get("/api/collaboration/reports", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const wId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
    const reports = await storage.getSharedReports({ clientId: user.clientId || undefined, workspaceId: wId });
    res.json(reports);
  });

  app.post("/api/collaboration/reports", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const crypto = await import("crypto");
    const shareToken = crypto.randomBytes(24).toString("hex");
    const report = await storage.createSharedReport({ ...req.body, createdBy: user.id, clientId: user.clientId, shareToken });
    await storage.createActivityEvent({ workspaceId: req.body.workspaceId, actorId: user.id, verb: "created_report", targetType: "report", targetId: report.id });
    res.status(201).json(report);
  });

  app.patch("/api/collaboration/reports/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const report = await storage.updateSharedReport(parseInt(req.params.id), req.body);
    if (!report) return res.status(404).json({ message: "Not found" });
    await storage.createChangeHistory({ userId: user.id, entityType: "report", entityId: report.id, changeType: "updated", details: req.body });
    res.json(report);
  });

  app.delete("/api/collaboration/reports/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteSharedReport(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/collaboration/reports/:id/items", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getBriefingItems(parseInt(req.params.id));
    res.json(items);
  });

  app.post("/api/collaboration/reports/:id/items", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const item = await storage.createBriefingItem({ ...req.body, reportId: parseInt(req.params.id) });
    res.status(201).json(item);
  });

  app.delete("/api/collaboration/reports/items/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteBriefingItem(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/shared-report/:token", async (req, res) => {
    const report = await storage.getSharedReportByToken(req.params.token);
    if (!report) return res.status(404).json({ message: "Not found" });
    const items = await storage.getBriefingItems(report.id);
    res.json({ report, items });
  });

  // === CUSTOM TAGS ===
  app.get("/api/collaboration/tags", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const wId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
    const tags = await storage.getCustomTags({ clientId: user.clientId || undefined, workspaceId: wId });
    res.json(tags);
  });

  app.post("/api/collaboration/tags", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const tag = await storage.createCustomTag({ ...req.body, clientId: user.clientId, createdBy: user.id });
    res.status(201).json(tag);
  });

  app.delete("/api/collaboration/tags/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteCustomTag(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/collaboration/tag-assignments/:targetType/:targetId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const assignments = await storage.getTagAssignments(req.params.targetType, parseInt(req.params.targetId));
    res.json(assignments);
  });

  app.post("/api/collaboration/tag-assignments", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const assignment = await storage.createTagAssignment({ ...req.body, createdBy: user.id });
    res.status(201).json(assignment);
  });

  app.delete("/api/collaboration/tag-assignments/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteTagAssignment(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === TASKS & FOLLOW-UP TRACKING ===
  app.get("/api/collaboration/tasks", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const wsId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
    const assignedTo = req.query.assignedTo ? parseInt(req.query.assignedTo as string) : undefined;
    const status = req.query.status as string | undefined;
    const taskList = await storage.getTasks({ workspaceId: wsId, assignedTo, status });
    res.json(taskList);
  });

  app.post("/api/collaboration/tasks", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const schema = z.object({ title: z.string().min(1), description: z.string().optional(), assignedTo: z.number().int().optional(), priority: z.enum(["low", "medium", "high", "critical"]).optional(), dueDate: z.string().optional(), workspaceId: z.number().int().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    const task = await storage.createTask({ ...parsed.data, createdBy: user.id });
    await storage.createActivityEvent({ workspaceId: parsed.data.workspaceId, actorId: user.id, verb: "created_task", targetType: "task", targetId: task.id });
    res.status(201).json(task);
  });

  app.patch("/api/collaboration/tasks/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const task = await storage.updateTask(parseInt(req.params.id), req.body);
    if (!task) return res.status(404).json({ message: "Not found" });
    if (req.body.status === "resolved") {
      await storage.createActivityEvent({ workspaceId: task.workspaceId || undefined, actorId: user.id, verb: "resolved_task", targetType: "task", targetId: task.id });
    }
    res.json(task);
  });

  app.delete("/api/collaboration/tasks/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteTask(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === WATCHLISTS ===
  app.get("/api/collaboration/watchlists", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const items = await storage.getWatchlists(user.id);
    res.json(items);
  });

  app.post("/api/collaboration/watchlists", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const item = await storage.createWatchlist({ ...req.body, userId: user.id });
    res.status(201).json(item);
  });

  app.delete("/api/collaboration/watchlists/:id", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.deleteWatchlist(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === INTERNAL ALERTS ===
  app.get("/api/collaboration/alerts", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const alerts = await storage.getInternalAlerts(user.id);
    res.json(alerts);
  });

  app.post("/api/collaboration/alerts", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const alert = await storage.createInternalAlert({ ...req.body, senderId: user.id });
    await storage.createActivityEvent({ workspaceId: req.body.workspaceId, actorId: user.id, verb: "sent_alert", targetType: "alert", targetId: alert.id });
    res.status(201).json(alert);
  });

  app.patch("/api/collaboration/alerts/:id/read", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    await storage.markAlertRead(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === CHANGE HISTORY ===
  app.get("/api/collaboration/history/:entityType/:entityId", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const history = await storage.getChangeHistory(req.params.entityType, parseInt(req.params.entityId));
    res.json(history);
  });

  // === ACTIVITY FEED ===
  app.get("/api/collaboration/activity-feed", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const wsId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const events = await storage.getActivityFeed({ workspaceId: wsId, limit });
    res.json(events);
  });

  // === TEAM MEMBERS LIST (for assigning tasks, sending alerts) ===
  app.get("/api/collaboration/team-members", async (req, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    let members: any[] = [];
    if (user.clientId) {
      members = await storage.getUsersByClientId(user.clientId);
    } else {
      members = await storage.getUsers();
    }
    res.json(members.map(m => ({ id: m.id, username: m.username, role: m.role })));
  });

  return httpServer;
}

function renderWidgetContent(widgetType: string, data: any): string {
  if (!data) return '<div class="item">No data available</div>';
  if (widgetType === "trending_topics" && Array.isArray(data)) {
    return data.slice(0, 10).map((t: any) => `<div class="item">${t.topic || t.keyword || "—"} <span class="badge neutral">${t.count || t.frequency || 0}</span></div>`).join("");
  }
  if (widgetType === "sentiment_overview" && data) {
    const s = data;
    return `<div class="item">Positive: <span class="badge positive">${s.positive || 0}</span></div><div class="item">Negative: <span class="badge negative">${s.negative || 0}</span></div><div class="item">Neutral: <span class="badge neutral">${s.neutral || 0}</span></div>`;
  }
  if (widgetType === "entity_tracker" && Array.isArray(data)) {
    return data.slice(0, 10).map((e: any) => `<div class="item">${e.entityName} <span class="badge neutral">${e.mentionCount} mentions</span></div>`).join("");
  }
  if (widgetType === "daily_briefing" && data) {
    const brief = data;
    return `<div class="item"><strong>${brief.briefDate || "Today"}</strong></div>` + ((brief.topStories as any[]) || []).slice(0, 5).map((s: any) => `<div class="item"><a href="${s.url}" target="_blank">${s.title}</a></div>`).join("");
  }
  return '<div class="item">Widget data loaded</div>';
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
