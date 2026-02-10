import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/image/client"; // Reusing the client
import { insertArticleSchema } from "@shared/schema";

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

  // === ARTICLES ===
  app.get(api.articles.list.path, async (req, res) => {
    try {
      // Manually parsing query params since express parses them as strings
      const params = {
        search: req.query.search as string,
        sourceId: req.query.sourceId ? parseInt(req.query.sourceId as string) : undefined,
        sentiment: req.query.sentiment as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };
      
      const result = await storage.getArticles(params);
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

  // === ANALYTICS ===
  app.get(api.analytics.stats.path, async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // === BACKGROUND WORKER SIMULATION ===
  // In a real app, this would be a separate worker process or proper cron job
  // Fetching news every 5 minutes
  setInterval(async () => {
    try {
      console.log("Fetching news...");
      const sources = await storage.getSources();
      const activeSources = sources.filter(s => s.active);

      // Mock fetching logic - in reality, use rss-parser here
      for (const source of activeSources) {
        // Simulate new article
        if (Math.random() > 0.7) {
          const mockTitle = `New update from ${source.name} - ${new Date().toLocaleTimeString()}`;
          const mockContent = "This is a simulated article content fetched from the source. It contains some keywords like Technology and AI.";
          
          // AI Analysis (Sentiment & Keywords)
          let sentimentLabel = "neutral";
          let sentimentScore = 0;
          let keywords: string[] = [];

          try {
            const completion = await openai.chat.completions.create({
              model: "gpt-5.1",
              messages: [{
                role: "system",
                content: "Analyze the following news text. Return a JSON object with 'sentiment' (positive, negative, neutral), 'score' (-100 to 100), and 'keywords' (array of strings)."
              }, {
                role: "user",
                content: mockContent
              }],
              response_format: { type: "json_object" }
            });

            const analysis = JSON.parse(completion.choices[0].message.content || "{}");
            sentimentLabel = analysis.sentiment || "neutral";
            sentimentScore = analysis.score || 0;
            keywords = analysis.keywords || [];
          } catch (e) {
            console.error("AI Analysis failed", e);
          }

          const article = {
            title: mockTitle,
            content: mockContent,
            summary: mockContent.substring(0, 100) + "...",
            url: `https://example.com/article-${Date.now()}`,
            sourceId: source.id,
            publishedAt: new Date(),
            language: "en",
            sentimentLabel,
            sentimentScore,
            keywords,
          };
          
          // Check for duplicates (by URL)
          const existing = await storage.getArticleByUrl(article.url);
          if (!existing) {
             // Validate and insert
             const validArticle = insertArticleSchema.parse(article);
             await storage.createArticle(validArticle);
          }
        }
      }
    } catch (e) {
      console.error("News fetch worker error:", e);
    }
  }, 5 * 60 * 1000); // 5 minutes

  // === SEED DATA ===
  await seed();

  return httpServer;
}

async function seed() {
  const sources = await storage.getSources();
  if (sources.length === 0) {
    console.log("Seeding sources...");
    await storage.createSource({
       name: "TechCrunch",
       url: "https://techcrunch.com/feed/",
       type: "rss",
       active: true,
       intervalMinutes: 15
    });
    await storage.createSource({
       name: "The Verge",
       url: "https://www.theverge.com/rss/index.xml",
       type: "rss",
       active: true,
       intervalMinutes: 15
    });
    console.log("Sources seeded.");
  }
}
