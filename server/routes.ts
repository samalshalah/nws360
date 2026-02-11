import type { Express } from "express";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  setupAuth(app);

  // === SOURCES ===
  app.get(api.sources.list.path, async (req, res) => {
    const sources = await storage.getSources();
    res.json(sources);
  });

  app.post(api.sources.create.path, async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const input = api.sources.create.input.parse(req.body);
      const source = await storage.createSource(input);

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
      const id = parseInt(req.params.id);
      const input = api.sources.update.input.parse(req.body);
      const source = await storage.updateSource(id, input);
      if (!source) return res.status(404).json({ message: "Source not found" });
      res.json(source);
    } catch (err) {
      res.status(400).json({ message: "Invalid Input" });
    }
  });

  app.delete(api.sources.delete.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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
    try {
      const params = {
        search: req.query.search as string,
        sourceId: req.query.sourceId ? parseInt(req.query.sourceId as string) : undefined,
        sentiment: req.query.sentiment as string,
        category: req.query.category as string,
        sourceType: req.query.sourceType as string,
        lang: req.query.lang as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
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
    const id = parseInt(req.params.id);
    const article = await storage.getArticle(id);
    if (!article) return res.status(404).json({ message: "Article not found" });
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
      const allArticles = await storage.getArticles({ limit: 500 });
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
    const stats = await storage.getStats();
    res.json(stats);
  });

  app.get(api.analytics.sentimentTrend.path, async (req, res) => {
    const trend = await storage.getSentimentTrend();
    res.json(trend);
  });

  // === SEED & START WORKER ===
  await seed();
  startFeedWorker(1);

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
