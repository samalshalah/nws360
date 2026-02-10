import RssParser from "rss-parser";
import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";

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

export async function fetchSourceFeed(sourceId: number): Promise<number> {
  const source = await storage.getSource(sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);

  let feedUrl = source.url;

  // Try to auto-discover RSS feed if the URL isn't an RSS feed directly
  if (!feedUrl.match(/\.(xml|rss|atom)$/i) && !feedUrl.includes("/feed") && !feedUrl.includes("/rss")) {
    const possibleFeeds = [
      `${feedUrl.replace(/\/$/, "")}/feed`,
      `${feedUrl.replace(/\/$/, "")}/rss`,
      `${feedUrl.replace(/\/$/, "")}/feed.xml`,
      `${feedUrl.replace(/\/$/, "")}/rss.xml`,
      `${feedUrl.replace(/\/$/, "")}/atom.xml`,
      `${feedUrl.replace(/\/$/, "")}/index.xml`,
    ];

    let found = false;
    for (const tryUrl of possibleFeeds) {
      try {
        await parser.parseURL(tryUrl);
        feedUrl = tryUrl;
        found = true;
        break;
      } catch {
        continue;
      }
    }

    if (!found) {
      // Try the original URL directly (it might be a feed itself)
      feedUrl = source.url;
    }
  }

  console.log(`[Worker] Fetching feed: ${feedUrl} for source: ${source.name}`);
  const feed = await parser.parseURL(feedUrl);

  let newArticles = 0;

  for (const item of feed.items.slice(0, 20)) {
    if (!item.link) continue;

    const existing = await storage.getArticleByUrl(item.link);
    if (existing) continue;

    const rawContent = item.contentEncoded || item.content || item.contentSnippet || item.summary || "";
    const plainContent = stripHtml(rawContent);
    const title = stripHtml(item.title || "Untitled");

    if (!plainContent && !title) continue;

    const analysis = await analyzeWithAI(title, plainContent);

    const article = {
      title,
      content: truncate(plainContent, 5000),
      summary: analysis.summary,
      url: item.link,
      sourceId: source.id,
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      language: "en",
      sentimentLabel: analysis.sentimentLabel,
      sentimentScore: analysis.sentimentScore,
      keywords: analysis.keywords,
    };

    try {
      await storage.createArticle(article);
      newArticles++;
    } catch (e) {
      console.error(`[Worker] Failed to insert article: ${item.link}`, e);
    }
  }

  // Update the source's lastFetchedAt
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

  // Run once on startup after a short delay
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
