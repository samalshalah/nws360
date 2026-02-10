import RssParser from "rss-parser";
import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { scrapeWebsite, fetchTwitterFeed } from "./web-scraper";

const parser = new RssParser({
  timeout: 15000,
  headers: {
    "User-Agent": "NWS360/1.0 (RSS Reader)",
    "Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen).replace(/\s+\S*$/, "") + "...";
}

async function analyzeWithAI(title: string, content: string): Promise<{
  sentimentLabel: string;
  sentimentScore: number;
  keywords: string[];
  summary: string;
}> {
  try {
    const textToAnalyze = truncate(`${title}. ${content}`, 2000);
    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content:
            'You analyze news articles. Return JSON with: "sentiment" (positive/negative/neutral), "score" (-100 to 100), "keywords" (array of 3-5 key terms), "summary" (1-2 sentence summary). Respond ONLY with valid JSON.',
        },
        { role: "user", content: textToAnalyze },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 300,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return {
      sentimentLabel: result.sentiment || "neutral",
      sentimentScore: typeof result.score === "number" ? result.score : 0,
      keywords: Array.isArray(result.keywords) ? result.keywords : [],
      summary: result.summary || truncate(content, 200),
    };
  } catch (e) {
    console.error("AI analysis failed:", e);
    return {
      sentimentLabel: "neutral",
      sentimentScore: 0,
      keywords: [],
      summary: truncate(content, 200),
    };
  }
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }
  return normalized;
}

async function discoverRssFeed(url: string): Promise<string | null> {
  const normalized = normalizeUrl(url);
  
  const possibleFeeds = [
    `${normalized.replace(/\/$/, "")}/feed`,
    `${normalized.replace(/\/$/, "")}/rss`,
    `${normalized.replace(/\/$/, "")}/feed.xml`,
    `${normalized.replace(/\/$/, "")}/rss.xml`,
    `${normalized.replace(/\/$/, "")}/atom.xml`,
    `${normalized.replace(/\/$/, "")}/index.xml`,
    `${normalized.replace(/\/$/, "")}/feeds/posts/default`,
    `${normalized.replace(/\/$/, "")}/?feed=rss2`,
  ];

  for (const tryUrl of possibleFeeds) {
    try {
      await parser.parseURL(tryUrl);
      return tryUrl;
    } catch {
      continue;
    }
  }

  try {
    const response = await fetch(normalized, {
      headers: { "User-Agent": "NWS360/1.0 (RSS Reader)" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await response.text();
    const rssMatch = html.match(/<link[^>]*type=["']application\/(rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i);
    if (rssMatch && rssMatch[2]) {
      const feedUrl = rssMatch[2].startsWith("http") ? rssMatch[2] : new URL(rssMatch[2], normalized).href;
      try {
        await parser.parseURL(feedUrl);
        return feedUrl;
      } catch {}
    }
  } catch {}

  return null;
}

async function fetchRssArticles(source: { id: number; name: string; url: string }): Promise<number> {
  let feedUrl = normalizeUrl(source.url);

  if (!feedUrl.match(/\.(xml|rss|atom)$/i) && !feedUrl.includes("/feed") && !feedUrl.includes("/rss")) {
    const discovered = await discoverRssFeed(feedUrl);
    if (discovered) {
      feedUrl = discovered;
      console.log(`[Worker] Discovered RSS feed: ${feedUrl}`);
    } else {
      console.log(`[Worker] No RSS feed discovered for ${feedUrl}, trying direct parse`);
    }
  }

  console.log(`[Worker] Fetching RSS: ${feedUrl} for source: ${source.name}`);
  const feed = await parser.parseURL(feedUrl);
  return await processItems(source, feed.items.slice(0, 20).map(item => ({
    title: stripHtml(item.title || "Untitled"),
    url: item.link || "",
    content: stripHtml(item.contentEncoded || item.content || item.contentSnippet || item.summary || ""),
    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
  })));
}

async function fetchWebsiteArticles(source: { id: number; name: string; url: string }): Promise<number> {
  const url = normalizeUrl(source.url);
  console.log(`[Worker] Scraping website: ${url} for source: ${source.name}`);

  const discovered = await discoverRssFeed(url);
  if (discovered) {
    console.log(`[Worker] Found RSS feed for ${source.name}: ${discovered}`);
    const feed = await parser.parseURL(discovered);
    return await processItems(source, feed.items.slice(0, 20).map(item => ({
      title: stripHtml(item.title || "Untitled"),
      url: item.link || "",
      content: stripHtml(item.contentEncoded || item.content || item.contentSnippet || item.summary || ""),
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
    })));
  }

  const scraped = await scrapeWebsite(url);
  console.log(`[Worker] Scraped ${scraped.length} articles from ${source.name}`);
  return await processItems(source, scraped);
}

async function fetchTwitterArticles(source: { id: number; name: string; url: string }): Promise<number> {
  console.log(`[Worker] Fetching Twitter/X: ${source.url} for source: ${source.name}`);
  const tweets = await fetchTwitterFeed(source.url);
  console.log(`[Worker] Got ${tweets.length} tweets from ${source.name}`);
  return await processItems(source, tweets);
}

async function processItems(
  source: { id: number; name: string },
  items: { title: string; url: string; content: string; publishedAt: Date }[]
): Promise<number> {
  let newArticles = 0;

  for (const item of items) {
    if (!item.url) continue;

    const existing = await storage.getArticleByUrl(item.url);
    if (existing) continue;

    const title = item.title || "Untitled";
    const content = item.content || title;

    if (!content && !title) continue;

    const analysis = await analyzeWithAI(title, content);

    const article = {
      title,
      content: truncate(content, 5000),
      summary: analysis.summary,
      url: item.url,
      sourceId: source.id,
      publishedAt: item.publishedAt,
      language: "en",
      sentimentLabel: analysis.sentimentLabel,
      sentimentScore: analysis.sentimentScore,
      keywords: analysis.keywords,
    };

    try {
      await storage.createArticle(article);
      newArticles++;
    } catch (e) {
      console.error(`[Worker] Failed to insert article: ${item.url}`, e);
    }
  }

  return newArticles;
}

export async function fetchSourceFeed(sourceId: number): Promise<number> {
  const source = await storage.getSource(sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);

  let newArticles = 0;

  switch (source.type) {
    case "rss":
      newArticles = await fetchRssArticles(source);
      break;
    case "website":
      newArticles = await fetchWebsiteArticles(source);
      break;
    case "twitter":
      newArticles = await fetchTwitterArticles(source);
      break;
    default:
      newArticles = await fetchRssArticles(source);
  }

  await storage.updateSourceLastFetched(source.id);
  console.log(`[Worker] ${source.name}: fetched ${newArticles} new articles`);
  return newArticles;
}

export async function fetchAllFeeds(): Promise<{ sourceName: string; newArticles: number; error?: string }[]> {
  const allSources = await storage.getSources();
  const activeSources = allSources.filter((s) => s.active);
  const results: { sourceName: string; newArticles: number; error?: string }[] = [];

  for (const source of activeSources) {
    try {
      const newArticles = await fetchSourceFeed(source.id);
      results.push({ sourceName: source.name, newArticles });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`[Worker] Error fetching ${source.name}:`, errorMsg);
      results.push({ sourceName: source.name, newArticles: 0, error: errorMsg });
    }
  }

  return results;
}

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startFeedWorker(intervalMinutes: number = 10) {
  if (workerInterval) clearInterval(workerInterval);

  console.log(`[Worker] Starting feed worker, interval: ${intervalMinutes} minutes`);

  setTimeout(async () => {
    console.log("[Worker] Initial feed fetch...");
    try {
      const results = await fetchAllFeeds();
      const total = results.reduce((sum, r) => sum + r.newArticles, 0);
      console.log(`[Worker] Initial fetch complete: ${total} new articles from ${results.length} sources`);
    } catch (e) {
      console.error("[Worker] Initial fetch error:", e);
    }
  }, 5000);

  workerInterval = setInterval(async () => {
    console.log("[Worker] Scheduled feed fetch...");
    try {
      const results = await fetchAllFeeds();
      const total = results.reduce((sum, r) => sum + r.newArticles, 0);
      console.log(`[Worker] Scheduled fetch complete: ${total} new articles`);
    } catch (e) {
      console.error("[Worker] Scheduled fetch error:", e);
    }
  }, intervalMinutes * 60 * 1000);
}

export function stopFeedWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
