import RssParser from "rss-parser";
import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { scrapeWebsite, fetchTwitterFeed, fetchYouTubeFeed, fetchFacebookFeed, fetchInstagramFeed, fetchTelegramFeed } from "./web-scraper";

const parser = new RssParser({
  timeout: 15000,
  headers: {
    "User-Agent": "NWS360/1.0 (RSS Reader)",
    "Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
      ["source", "source"],
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

const VALID_CATEGORIES = ["political", "health", "tech", "sports", "business", "entertainment", "science", "urgent", "general"];

export async function analyzeWithAI(title: string, content: string): Promise<{
  sentimentLabel: string;
  sentimentScore: number;
  keywords: string[];
  summary: string;
  category: string;
}> {
  try {
    const textToAnalyze = truncate(`${title}. ${content}`, 2000);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'You analyze news articles. Return JSON with: "sentiment" (positive/negative/neutral), "score" (-100 to 100), "keywords" (array of 3-5 key terms), "summary" (1-2 sentence summary), "category" (exactly one of: political, health, tech, sports, business, entertainment, science, urgent, general). Respond ONLY with valid JSON.',
        },
        { role: "user", content: textToAnalyze },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 400,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const cat = typeof result.category === "string" ? result.category.toLowerCase() : "general";
    const validSentiments = ["positive", "negative", "neutral"];
    const rawSentiment = typeof result.sentiment === "string" ? result.sentiment.toLowerCase() : "neutral";
    return {
      sentimentLabel: validSentiments.includes(rawSentiment) ? rawSentiment : "neutral",
      sentimentScore: typeof result.score === "number" ? result.score : 0,
      keywords: Array.isArray(result.keywords) ? result.keywords : [],
      summary: result.summary || truncate(content, 200),
      category: VALID_CATEGORIES.includes(cat) ? cat : "general",
    };
  } catch (e) {
    console.error("AI analysis failed:", e);
    return {
      sentimentLabel: "neutral",
      sentimentScore: 0,
      keywords: [],
      summary: truncate(content, 200),
      category: "general",
    };
  }
}

function extractImageFromRssItem(item: any): string | undefined {
  if (item.mediaContent) {
    if (Array.isArray(item.mediaContent)) {
      for (const mc of item.mediaContent) {
        const url = mc.$ ? mc.$.url : mc.url;
        if (url) return url;
      }
    } else {
      const url = item.mediaContent.$ ? item.mediaContent.$.url : item.mediaContent.url;
      if (url) return url;
    }
  }

  if (item.mediaThumbnail) {
    if (Array.isArray(item.mediaThumbnail)) {
      for (const mt of item.mediaThumbnail) {
        const url = mt.$ ? mt.$.url : mt.url;
        if (url) return url;
      }
    } else {
      const url = item.mediaThumbnail.$ ? item.mediaThumbnail.$.url : item.mediaThumbnail.url;
      if (url) return url;
    }
  }

  if (item.enclosure) {
    const enc = item.enclosure;
    if (enc.url && (!enc.type || enc.type.startsWith("image"))) {
      return enc.url;
    }
  }

  const encoded = item.contentEncoded || item.content || "";
  if (typeof encoded === "string") {
    const imgMatch = encoded.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) return imgMatch[1];
  }

  return undefined;
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }
  return normalized;
}

export async function discoverRssFeedPublic(url: string): Promise<string | null> {
  return discoverRssFeed(url);
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

async function fetchRssArticles(source: { id: number; name: string; url: string; maxArticlesPerFetch?: number | null }): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
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
  return await processItems(source, feed.items.slice(0, limit).map(item => ({
    title: stripHtml(item.title || "Untitled"),
    url: item.link || "",
    content: stripHtml(item.contentEncoded || item.content || item.contentSnippet || item.summary || ""),
    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
    image: extractImageFromRssItem(item),
  })));
}

async function fetchWebsiteArticles(source: { id: number; name: string; url: string; maxArticlesPerFetch?: number | null }): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  const url = normalizeUrl(source.url);
  console.log(`[Worker] Scraping website: ${url} for source: ${source.name}`);

  const discovered = await discoverRssFeed(url);
  if (discovered) {
    console.log(`[Worker] Found RSS feed for ${source.name}: ${discovered}`);
    const feed = await parser.parseURL(discovered);
    return await processItems(source, feed.items.slice(0, limit).map(item => ({
      title: stripHtml(item.title || "Untitled"),
      url: item.link || "",
      content: stripHtml(item.contentEncoded || item.content || item.contentSnippet || item.summary || ""),
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      image: extractImageFromRssItem(item),
    })));
  }

  const scraped = await scrapeWebsite(url);
  console.log(`[Worker] Scraped ${scraped.length} articles from ${source.name}`);
  return await processItems(source, scraped.slice(0, limit));
}

async function fetchTwitterArticles(source: { id: number; name: string; url: string; maxArticlesPerFetch?: number | null }): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  console.log(`[Worker] Fetching Twitter/X: ${source.url} for source: ${source.name}`);
  const tweets = await fetchTwitterFeed(source.url);
  console.log(`[Worker] Got ${tweets.length} tweets from ${source.name}`);
  return await processItems(source, tweets.slice(0, limit));
}

async function fetchYouTubeArticles(source: { id: number; name: string; url: string; maxArticlesPerFetch?: number | null }): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  console.log(`[Worker] Fetching YouTube: ${source.url} for source: ${source.name}`);
  const videos = await fetchYouTubeFeed(source.url);
  console.log(`[Worker] Got ${videos.length} videos from ${source.name}`);
  return await processItems(source, videos.slice(0, limit));
}

async function fetchFacebookArticles(source: { id: number; name: string; url: string; maxArticlesPerFetch?: number | null }): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  console.log(`[Worker] Fetching Facebook: ${source.url} for source: ${source.name}`);
  const posts = await fetchFacebookFeed(source.url);
  console.log(`[Worker] Got ${posts.length} Facebook posts from ${source.name}`);
  return await processItems(source, posts.slice(0, limit));
}

async function fetchInstagramArticles(source: { id: number; name: string; url: string; maxArticlesPerFetch?: number | null }): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  console.log(`[Worker] Fetching Instagram: ${source.url} for source: ${source.name}`);
  const posts = await fetchInstagramFeed(source.url);
  console.log(`[Worker] Got ${posts.length} Instagram posts from ${source.name}`);
  return await processItems(source, posts.slice(0, limit));
}

async function fetchTelegramArticles(source: { id: number; name: string; url: string; maxArticlesPerFetch?: number | null }): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  console.log(`[Worker] Fetching Telegram: ${source.url} for source: ${source.name}`);
  const posts = await fetchTelegramFeed(source.url);
  console.log(`[Worker] Got ${posts.length} Telegram posts from ${source.name}`);
  return await processItems(source, posts.slice(0, limit));
}

function extractGoogleNewsSubSource(item: any): string | undefined {
  if (item.source) {
    if (typeof item.source === "string") return item.source;
    if (item.source._ || item.source.$t) return item.source._ || item.source.$t;
    if (item.source.$ && item.source.$.url) {
      const text = item.source._ || item.source.$text || item.source.$t;
      if (text) return text;
    }
  }

  const title = item.title || "";
  const dashIndex = title.lastIndexOf(" - ");
  if (dashIndex > 0) {
    return title.substring(dashIndex + 3).trim();
  }

  return undefined;
}

const PUBLISHER_DOMAINS: Record<string, string> = {
  "CNN": "cnn.com", "NBC News": "nbcnews.com", "The New York Times": "nytimes.com",
  "The Guardian": "theguardian.com", "Politico": "politico.com", "Fox News": "foxnews.com",
  "ABC News": "abcnews.go.com", "ELLE": "elle.com", "Bloomberg": "bloomberg.com",
  "PBS": "pbs.org", "The Salt Lake Tribune": "sltrib.com", "The Economist": "economist.com",
  "Financial Times": "ft.com", "Nikkei Asia": "asia.nikkei.com", "The Korea Herald": "koreaherald.com",
  "KITCO": "kitco.com", "Investing.com": "investing.com", "Foreign Policy": "foreignpolicy.com",
  "Times of India": "timesofindia.indiatimes.com", "NBC 5 Chicago": "nbcchicago.com",
  "Reuters": "reuters.com", "AP News": "apnews.com", "BBC": "bbc.com", "BBC News": "bbc.com",
  "NPR": "npr.org", "The Washington Post": "washingtonpost.com", "USA Today": "usatoday.com",
  "Forbes": "forbes.com", "Business Insider": "businessinsider.com", "TechCrunch": "techcrunch.com",
  "The Verge": "theverge.com", "Wired": "wired.com", "Al Jazeera": "aljazeera.com",
  "The Hill": "thehill.com", "Axios": "axios.com", "Vox": "vox.com",
};

let braveRateLimited = false;
let braveRateLimitedUntil = 0;

async function resolveGoogleNewsArticleUrl(title: string, subSource?: string): Promise<string | null> {
  if (braveRateLimited && Date.now() < braveRateLimitedUntil) {
    return null;
  }
  braveRateLimited = false;

  try {
    const domain = subSource ? PUBLISHER_DOMAINS[subSource] : null;
    const shortTitle = title.substring(0, 80);
    const query = domain
      ? `site:${domain} ${shortTitle}`
      : `${shortTitle}${subSource ? " " + subSource : ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`https://search.brave.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.status === 429) {
      braveRateLimited = true;
      braveRateLimitedUntil = Date.now() + 300000;
      console.log("[Worker] Brave Search rate limited, pausing for 5 minutes");
      return null;
    }
    if (response.status !== 200) {
      console.log(`[Worker] Brave Search returned status ${response.status}`);
      return null;
    }
    const html = await response.text();

    const targetDomain = domain || (subSource ? subSource.toLowerCase().replace(/\s+/g, "") + ".com" : null);
    if (targetDomain) {
      const escapedDomain = targetDomain.replace(".", "\\.");
      const pattern = new RegExp(`href="(https?://[^"]*${escapedDomain}[^"]+)"`, "g");
      const matches = [...html.matchAll(pattern)];
      for (const m of matches) {
        const url = m[1];
        if (url.length > 40 && !url.includes("/search") && !url.includes("brave.com")) {
          return url;
        }
      }
    }

    const genericPattern = /href="(https?:\/\/(?!search\.brave\.com)[^"]+)"/g;
    const genericMatches = [...html.matchAll(genericPattern)];
    for (const m of genericMatches) {
      const url = m[1];
      if (url.length > 60 && !url.includes("brave.com") && !url.includes("google.com") && !url.includes("/search")) {
        return url;
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.log("[Worker] Article URL resolve timed out");
    } else {
      console.error("[Worker] Failed to resolve article URL:", e?.message || e);
    }
  }
  return null;
}

function isGenericGoogleImage(url: string): boolean {
  return url.includes("lh3.googleusercontent.com") || url.includes("gstatic.com");
}

async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    const html = await response.text();
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch && ogMatch[1]) {
      const imgUrl = ogMatch[1];
      if (imgUrl.startsWith("http")) return imgUrl;
      try {
        return new URL(imgUrl, url).href;
      } catch {
        return imgUrl;
      }
    }
  } catch {}
  return undefined;
}

function cleanGoogleNewsTitle(title: string, subSource?: string): string {
  if (!subSource) return title;
  const suffix = ` - ${subSource}`;
  if (title.endsWith(suffix)) {
    return title.substring(0, title.length - suffix.length).trim();
  }
  return title;
}

async function fetchGoogleNewsArticles(source: { id: number; name: string; url: string; maxArticlesPerFetch?: number | null }): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  const keyword = source.url.trim();
  const encodedKeyword = encodeURIComponent(keyword);
  const rssUrl = `https://news.google.com/rss/search?q=${encodedKeyword}&hl=en&gl=US&ceid=US:en`;
  console.log(`[Worker] Fetching Google News for keyword "${keyword}": ${rssUrl}`);

  try {
    const feed = await parser.parseURL(rssUrl);
    const rawItems = feed.items.slice(0, limit);
    const items: { title: string; url: string; content: string; publishedAt: Date; image?: string; subSource?: string }[] = [];
    for (const item of rawItems) {
      const subSource = extractGoogleNewsSubSource(item);
      const rawTitle = stripHtml(item.title || "Untitled");
      const cleanTitle = cleanGoogleNewsTitle(rawTitle, subSource);
      const googleNewsUrl = item.link || "";
      let image: string | undefined;

      const stdImage = extractImageFromRssItem(item);
      if (stdImage && !isGenericGoogleImage(stdImage)) {
        image = stdImage;
      }

      items.push({
        title: cleanTitle,
        url: googleNewsUrl,
        content: stripHtml(item.contentSnippet || item.content || item.summary || item.title || ""),
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        image,
        subSource,
      });
    }

    return await processItems(source, items);
  } catch (e) {
    console.error(`[Worker] Google News fetch failed for "${keyword}":`, e);
    return 0;
  }
}

async function processItems(
  source: { id: number; name: string },
  items: { title: string; url: string; content: string; publishedAt: Date; image?: string; subSource?: string }[]
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
      category: analysis.category,
      imageUrl: item.image || null,
      subSource: item.subSource || null,
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
    case "youtube":
      newArticles = await fetchYouTubeArticles(source);
      break;
    case "facebook":
      newArticles = await fetchFacebookArticles(source);
      break;
    case "instagram":
      newArticles = await fetchInstagramArticles(source);
      break;
    case "telegram":
      newArticles = await fetchTelegramArticles(source);
      break;
    case "google_news":
      newArticles = await fetchGoogleNewsArticles(source);
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

export async function backfillGoogleNewsImages(): Promise<number> {
  const { items } = await storage.getArticles({ limit: 200 });
  const googleNewsArticles = items.filter(
    (a) => (a.source?.type === "google_news" || a.source?.type === "facebook") && (!a.imageUrl || isGenericGoogleImage(a.imageUrl)) && a.imageUrl !== "none"
  );
  if (googleNewsArticles.length === 0) return 0;

  console.log(`[Worker] Backfilling images for ${googleNewsArticles.length} Google News articles...`);
  let updated = 0;

  const batch = googleNewsArticles.slice(0, 2);
  for (const article of batch) {
    if (braveRateLimited && Date.now() < braveRateLimitedUntil) {
      console.log("[Worker] Brave rate limited, skipping remaining backfill");
      break;
    }
    try {
      const realUrl = await resolveGoogleNewsArticleUrl(article.title, article.subSource || undefined);
      if (realUrl) {
        console.log(`[Worker] Resolved: ${realUrl.substring(0, 100)}`);
        const image = await fetchOgImage(realUrl);
        if (image && !isGenericGoogleImage(image)) {
          await storage.updateArticle(article.id, { imageUrl: image });
          updated++;
          console.log(`[Worker] Backfilled image for article ${article.id}: ${image.substring(0, 80)}`);
        } else {
          await storage.updateArticle(article.id, { imageUrl: "none" });
          console.log(`[Worker] No usable image for article ${article.id}, marked as checked`);
        }
      } else {
        await storage.updateArticle(article.id, { imageUrl: "none" });
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (e) {
      console.error(`[Worker] Backfill error for article ${article.id}:`, e);
    }
  }

  console.log(`[Worker] Backfill complete: updated ${updated}/${googleNewsArticles.length} articles`);
  return updated;
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
    try {
      const deleted = await storage.deleteExpiredArticles();
      if (deleted > 0) console.log(`[Worker] Cleaned up ${deleted} expired articles`);
    } catch (e) {
      console.error("[Worker] Cleanup error:", e);
    }
    try {
      await backfillGoogleNewsImages();
    } catch (e) {
      console.error("[Worker] Image backfill error:", e);
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
    try {
      const deleted = await storage.deleteExpiredArticles();
      if (deleted > 0) console.log(`[Worker] Cleaned up ${deleted} expired articles`);
    } catch (e) {
      console.error("[Worker] Cleanup error:", e);
    }
  }, intervalMinutes * 60 * 1000);
}

export function stopFeedWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
