import RssParser from "rss-parser";
import { storage } from "./storage";
import { enqueueAIJob, awaitJobResult } from "./ai/ai-gateway";
import { fetchTwitterFeed, fetchYouTubeFeed, fetchFacebookFeed, fetchInstagramFeed, fetchTelegramFeed } from "./web-scraper";
import { enqueueJob, registerJobHandler, openaiLimiter } from "./processing-queue";
import { getGoogleNewsEdition } from "@shared/google-news-regions";
import type { WebsiteCollectorConfig } from "@shared/source-collector";
import {
  filterSourceItems,
  normalizeSourceFilterConfig,
  type SourceFilterConfig,
} from "@shared/source-filter";
import { collectWebsite, extractArticleContent, inspectArticleImage } from "./website-collector";

type FeedSource = {
  id: number;
  name: string;
  url: string;
  clientId?: number | null;
  country?: string | null;
  category?: string | null;
  maxArticlesPerFetch?: number | null;
  collectorConfig?: WebsiteCollectorConfig | null;
  filterConfig?: SourceFilterConfig | null;
};

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
const MAX_STORED_CONTENT_CHARS = 50_000;
const MIN_FULL_ARTICLE_GAIN_CHARS = 250;
const FULL_ARTICLE_JOB_PRIORITY = 6;

export type AIAnalysisResult = {
  sentimentLabel: string;
  sentimentScore: number;
  keywords: string[];
  topics: string[];
  summary: string;
  category: string;
  country: string | null;
  aiAnalysisStatus: "success" | "failed";
};

export async function analyzeWithAI(title: string, content: string, clientId?: number): Promise<AIAnalysisResult> {
  const effectiveClientId = clientId || 0;
  try {
    const textToAnalyze = truncate(`${title}. ${content}`, 2000);
    const job = await enqueueAIJob(effectiveClientId, "classification", {
      systemPrompt: 'You analyze news articles. Return JSON with: "sentiment" (positive/negative/neutral), "score" (-100 to 100), "keywords" (array of 3-5 key terms), "topics" (array of 1-3 topic labels like "economy", "elections", "climate", "cybersecurity", "AI", "conflict", "trade", "healthcare"), "summary" (1-2 sentence summary), "category" (exactly one of: political, health, tech, sports, business, entertainment, science, urgent, general), "country" (ISO 3166-1 alpha-2 code of the primary country the article is about, or null if unclear). Respond ONLY with valid JSON.',
      userContent: textToAnalyze,
      responseFormat: { type: "json_object" },
    }, 500);

    const aiResult = await awaitJobResult(job.id);
    const result = JSON.parse(aiResult.content || "{}");
    const cat = typeof result.category === "string" ? result.category.toLowerCase() : "general";
    const validSentiments = ["positive", "negative", "neutral"];
    const rawSentiment = typeof result.sentiment === "string" ? result.sentiment.toLowerCase() : "neutral";
    return {
      sentimentLabel: validSentiments.includes(rawSentiment) ? rawSentiment : "neutral",
      sentimentScore: typeof result.score === "number" ? result.score : 0,
      keywords: Array.isArray(result.keywords) ? result.keywords : [],
      topics: Array.isArray(result.topics) ? result.topics : [],
      summary: result.summary || truncate(content, 200),
      category: VALID_CATEGORIES.includes(cat) ? cat : "general",
      country: typeof result.country === "string" && result.country.length === 2 ? result.country.toUpperCase() : null,
      aiAnalysisStatus: "success",
    };
  } catch (e) {
    console.error("AI analysis failed:", e);
    return {
      sentimentLabel: null as any,
      sentimentScore: null as any,
      keywords: [],
      topics: [],
      summary: truncate(content, 200),
      category: "general",
      country: null,
      aiAnalysisStatus: "failed",
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

function extractImageTitleFromRssItem(item: any): string | undefined {
  const candidates = [item.mediaContent, item.mediaThumbnail, item.mediaGroup, item.image, item.enclosure];
  for (const candidate of candidates) {
    for (const value of Array.isArray(candidate) ? candidate : [candidate]) {
      if (!value || typeof value !== "object") continue;
      const title = value.title || value.caption || value.description || value.$?.title || value.$?.alt;
      if (typeof title === "string" && stripHtml(title).trim()) return stripHtml(title).trim();
    }
  }
  const encoded = String(item.contentEncoded || item.content || "");
  const match = encoded.match(/<img[^>]+(?:alt|title)=["']([^"']+)["']/i);
  return match?.[1] ? stripHtml(match[1]).trim() : undefined;
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

async function fetchRssArticles(source: FeedSource): Promise<number> {
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
  const mapped = (feed.items || []).map(item => ({
    title: stripHtml(item.title || "Untitled"),
    url: item.link || "",
    content: stripHtml(item.contentEncoded || item.content || item.contentSnippet || item.summary || ""),
    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
    image: extractImageFromRssItem(item),
    imageTitle: extractImageTitleFromRssItem(item),
  }));
  mapped.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return await processItems(source, mapped);
}

async function fetchWebsiteArticles(source: FeedSource): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  const hasFilters = Boolean(source.filterConfig?.whitelist.enabled || source.filterConfig?.blacklist.enabled);
  const candidateLimit = hasFilters ? Math.min(limit * 3, 50) : limit;
  const url = normalizeUrl(source.url);
  console.log(`[Worker] Collecting website: ${url} for source: ${source.name}`);

  const result = await collectWebsite(url, source.collectorConfig, candidateLimit);
  console.log(`[Worker] Website collector used ${result.method}${result.rendered ? " with browser rendering" : ""} for ${source.name}`);
  for (const warning of result.warnings) console.warn(`[Worker] ${source.name}: ${warning}`);

  if (result.feedUrl && result.feedUrl !== source.collectorConfig?.feedUrl) {
    await storage.updateSource(source.id, {
      collectorConfig: {
        strategy: source.collectorConfig?.strategy || "auto",
        renderJavascript: source.collectorConfig?.renderJavascript || false,
        selectors: source.collectorConfig?.selectors,
        feedUrl: result.feedUrl,
      },
    }, source.clientId || undefined);
  }
  return await processItems(source, result.articles);
}

async function fetchTwitterArticles(source: FeedSource): Promise<number> {
  console.log(`[Worker] Fetching Twitter/X: ${source.url} for source: ${source.name}`);
  const tweets = await fetchTwitterFeed(source.url);
  tweets.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  console.log(`[Worker] Got ${tweets.length} tweets from ${source.name}`);
  return await processItems(source, tweets);
}

async function fetchYouTubeArticles(source: FeedSource): Promise<number> {
  console.log(`[Worker] Fetching YouTube: ${source.url} for source: ${source.name}`);
  const videos = await fetchYouTubeFeed(source.url);
  videos.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  console.log(`[Worker] Got ${videos.length} videos from ${source.name}`);
  return await processItems(source, videos);
}

async function fetchFacebookArticles(source: FeedSource): Promise<number> {
  console.log(`[Worker] Fetching Facebook: ${source.url} for source: ${source.name}`);
  const posts = await fetchFacebookFeed(source.url);
  posts.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  console.log(`[Worker] Got ${posts.length} Facebook posts from ${source.name}`);
  return await processItems(source, posts);
}

async function fetchInstagramArticles(source: FeedSource): Promise<number> {
  console.log(`[Worker] Fetching Instagram: ${source.url} for source: ${source.name}`);
  const posts = await fetchInstagramFeed(source.url);
  posts.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  console.log(`[Worker] Got ${posts.length} Instagram posts from ${source.name}`);
  return await processItems(source, posts);
}

async function fetchTelegramArticles(source: FeedSource): Promise<number> {
  console.log(`[Worker] Fetching Telegram: ${source.url} for source: ${source.name}`);
  const posts = await fetchTelegramFeed(source.url);
  posts.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  console.log(`[Worker] Got ${posts.length} Telegram posts from ${source.name}`);
  return await processItems(source, posts);
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
      const matches = Array.from(html.matchAll(pattern));
      for (const m of matches) {
        const url = m[1];
        if (url.length > 40 && !url.includes("/search") && !url.includes("brave.com")) {
          return url;
        }
      }
    }

    const genericPattern = /href="(https?:\/\/(?!search\.brave\.com)[^"]+)"/g;
    const genericMatches = Array.from(html.matchAll(genericPattern));
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

function buildGoogleNewsSearchUrl(keyword: string, country?: string | null, recency?: "1d" | "7d"): string {
  const edition = getGoogleNewsEdition(country);
  const query = recency ? `${keyword} when:${recency}` : keyword;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${encodeURIComponent(edition.locale)}&gl=${edition.code}&ceid=${edition.code}:${edition.language}`;
}

async function fetchGoogleNewsArticles(source: FeedSource): Promise<number> {
  const limit = source.maxArticlesPerFetch || 10;
  const hasFilters = Boolean(source.filterConfig?.whitelist.enabled || source.filterConfig?.blacklist.enabled);
  const candidateLimit = hasFilters ? Math.min(limit * 3, 50) : limit;
  const keyword = source.url.trim();
  const edition = getGoogleNewsEdition(source.country);
  const recentUrl = buildGoogleNewsSearchUrl(keyword, edition.code, "1d");
  const fallbackUrl = buildGoogleNewsSearchUrl(keyword, edition.code, "7d");
  const defaultUrl = buildGoogleNewsSearchUrl(keyword, edition.code);
  console.log(`[Worker] Fetching Google News for keyword "${keyword}" in ${edition.name} (recent first)`);

  try {
    let feed = await parser.parseURL(recentUrl);
    if (!feed.items || feed.items.length === 0) {
      console.log(`[Worker] No articles from last 24h for "${keyword}", trying 7-day window`);
      feed = await parser.parseURL(fallbackUrl);
    }
    if (!feed.items || feed.items.length === 0) {
      console.log(`[Worker] No articles from last 7d for "${keyword}", using default`);
      feed = await parser.parseURL(defaultUrl);
    }

    const allItems = feed.items || [];
    const itemsWithDates = allItems.map(item => ({
      ...item,
      _parsedDate: item.pubDate ? new Date(item.pubDate) : new Date(0),
    }));
    itemsWithDates.sort((a, b) => b._parsedDate.getTime() - a._parsedDate.getTime());

    const rawItems = itemsWithDates.slice(0, candidateLimit);
    const items: { title: string; url: string; content: string; publishedAt: Date; image?: string; imageTitle?: string; subSource?: string }[] = [];
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
        publishedAt: item._parsedDate.getTime() > 0 ? item._parsedDate : new Date(),
        image,
        imageTitle: extractImageTitleFromRssItem(item),
        subSource,
      });
    }

    console.log(`[Worker] Google News: got ${items.length} articles for "${keyword}", newest: ${items[0]?.publishedAt?.toISOString() || 'none'}`);
    return await processItems(source, items);
  } catch (e) {
    console.error(`[Worker] Google News fetch failed for "${keyword}":`, e);
    return 0;
  }
}

function cleanText(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
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

function detectPlatform(url: string): string | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("facebook.com") || u.includes("fb.com")) return "facebook";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("t.me") || u.includes("telegram")) return "telegram";
  if (u.includes("reddit.com")) return "reddit";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("news.google.com")) return "google_news";
  return null;
}

type FeedItem = {
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  image?: string;
  imageTitle?: string;
  subSource?: string;
  engagementLikes?: number;
  engagementComments?: number;
  engagementShares?: number;
  fullContentExtracted?: boolean;
};

async function processItems(
  source: FeedSource,
  items: FeedItem[]
): Promise<number> {
  let newArticles = 0;

  items.sort((a, b) => {
    const dateA = a.publishedAt instanceof Date ? a.publishedAt.getTime() : 0;
    const dateB = b.publishedAt instanceof Date ? b.publishedAt.getTime() : 0;
    return dateB - dateA;
  });

  const filteredItems = filterSourceItems(items, source.filterConfig);
  const rejectedCount = items.length - filteredItems.length;
  if (rejectedCount > 0) console.log(`[Worker] ${source.name}: feed filters rejected ${rejectedCount} article(s)`);

  for (const rawItem of filteredItems.slice(0, source.maxArticlesPerFetch || 10)) {
    let item = rawItem;
    if (!item.url) continue;

    const clientId = source.clientId;
    if (!clientId) continue;

    const sourceCategory = source.category && VALID_CATEGORIES.includes(source.category)
      ? source.category
      : "general";
    const existing = await storage.getArticleByUrl(item.url, clientId);
    if (existing) {
      if (sourceCategory !== "general" && existing.category === "general") {
        await storage.updateArticle(existing.id, { category: sourceCategory, sourceId: source.id });
      }
      continue;
    }

    const title = item.title || "Untitled";

    if (title.length >= 10) {
      const titleDup = await storage.getArticleByTitle(title, source.clientId ?? null);
      if (titleDup) {
        const platform = detectPlatform(item.url) || "web";
        const existingCrossPosts = Array.isArray(titleDup.crossPosts) ? titleDup.crossPosts as { platform: string; url: string; sourceId: number }[] : [];
        const alreadyTracked = existingCrossPosts.some(cp => cp.url === item.url);
        if (!alreadyTracked) {
          const updated = [...existingCrossPosts, { platform, url: item.url, sourceId: source.id }];
          await storage.updateArticle(titleDup.id, { crossPosts: updated });
          console.log(`[Worker] Cross-post added: "${title.substring(0, 50)}..." on ${platform}`);
        }
        if (sourceCategory !== "general" && titleDup.category === "general") {
          await storage.updateArticle(titleDup.id, { category: sourceCategory, sourceId: source.id });
        }
        continue;
      }
    }

    const contentRaw = item.content || title;
    if (!contentRaw && !title) continue;

    const contentClean = cleanText(contentRaw);

    const article = {
      title,
      content: truncate(contentRaw, MAX_STORED_CONTENT_CHARS),
      contentClean: truncate(contentClean, MAX_STORED_CONTENT_CHARS),
      summary: truncate(contentClean, 200),
      url: item.url,
      sourceId: source.id,
      publishedAt: item.publishedAt,
      language: "en",
      country: null,
      sentimentLabel: null,
      sentimentScore: null,
      keywords: [] as string[],
      topics: [] as string[],
      category: sourceCategory,
      imageUrl: item.image || null,
      subSource: item.subSource || null,
      engagementLikes: item.engagementLikes ?? null,
      engagementComments: item.engagementComments ?? null,
      engagementShares: item.engagementShares ?? null,
      clientId,
      aiAnalysisStatus: "skipped" as const,
      aiRetryCount: 0,
    };

    try {
      const created = await storage.createArticle(article);
      newArticles++;
      await enqueueFullArticleExtraction(created.id, clientId, item.url, source.id);
    } catch (e) {
      console.error(`[Worker] STORE failed for article: ${item.url}`, e);
    }
  }

  return newArticles;
}

async function enqueueFullArticleExtraction(
  articleId: number,
  clientId: number,
  url: string,
  sourceId: number,
): Promise<void> {
  const platform = detectPlatform(url);
  if (platform && platform !== "google_news") return;

  try {
    await enqueueJob(
      "EXTRACT_ARTICLE_CONTENT",
      { articleId, clientId, sourceId, url },
      { priority: FULL_ARTICLE_JOB_PRIORITY, maxAttempts: 2 },
    );
  } catch (e: any) {
    console.warn(`[Worker] Full article extraction job not queued for article=${articleId}: ${e?.message || e}`);
  }
}

async function handleExtractArticleContent(payload: {
  articleId?: number;
  clientId?: number;
  sourceId?: number;
  url?: string;
}): Promise<any> {
  const articleId = Number(payload.articleId);
  const clientId = Number(payload.clientId);
  if (!Number.isInteger(articleId) || articleId <= 0) throw new Error("Invalid articleId");
  if (!Number.isInteger(clientId) || clientId <= 0) throw new Error("Invalid clientId");

  const article = await storage.getArticle(articleId, clientId);
  if (!article?.url) return { status: "skipped", reason: "article_not_found" };

  const platform = detectPlatform(article.url);
  if (platform && platform !== "google_news") {
    return { status: "skipped", reason: `platform_${platform}` };
  }

  const extracted = await extractArticleContent(article.url);
  if (!extracted) return { status: "skipped", reason: "no_extractable_content" };

  const currentContent = cleanText(article.contentClean || article.content || "");
  const extractedContent = cleanText(extracted.content || "");
  const shouldUseExtracted =
    extractedContent.length >= 180 &&
    (currentContent.length < 800 || extractedContent.length > currentContent.length + MIN_FULL_ARTICLE_GAIN_CHARS);

  const updates: Record<string, any> = {};
  if (shouldUseExtracted) {
    updates.content = truncate(extractedContent, MAX_STORED_CONTENT_CHARS);
    updates.contentClean = truncate(extractedContent, MAX_STORED_CONTENT_CHARS);
    updates.summary = truncate(extracted.excerpt || extractedContent, 200);
  }
  if (article.title === "Untitled" && extracted.title) updates.title = extracted.title;
  if (!article.imageUrl && extracted.image) updates.imageUrl = extracted.image;
  if (extracted.publishedAt) updates.publishedAt = extracted.publishedAt;

  if (extracted.finalUrl && extracted.finalUrl !== article.url) {
    const existing = await storage.getArticleByUrl(extracted.finalUrl, clientId);
    if (!existing || existing.id === article.id) {
      updates.url = extracted.finalUrl;
    }
  }

  if (Object.keys(updates).length === 0) {
    return {
      status: "unchanged",
      articleId,
      method: extracted.method,
      extractedChars: extractedContent.length,
    };
  }

  await storage.updateArticle(articleId, updates);
  return {
    status: "updated",
    articleId,
    method: extracted.method,
    fullContentUsed: shouldUseExtracted,
    extractedChars: extractedContent.length,
  };
}

async function handleAnalyzeArticle(payload: { articleId: number }): Promise<any> {
  const article = await storage.getArticle(payload.articleId);
  if (!article) return { skipped: true, reason: "article not found" };

  const analysis = await analyzeWithAI(article.title, article.contentClean || article.content || "", article.clientId ?? undefined);

  const updateData: any = {
    summary: analysis.summary,
    country: analysis.country,
    keywords: analysis.keywords,
    topics: analysis.topics,
    category: analysis.category,
    aiAnalysisStatus: analysis.aiAnalysisStatus,
  };

  if (analysis.aiAnalysisStatus === "success") {
    updateData.sentimentLabel = analysis.sentimentLabel;
    updateData.sentimentScore = analysis.sentimentScore;
  } else {
    updateData.sentimentLabel = null;
    updateData.sentimentScore = null;
  }

  await storage.updateArticle(payload.articleId, updateData);
  return { articleId: payload.articleId, status: analysis.aiAnalysisStatus };
}

async function handleTranslateArticle(payload: { articleId: number; targetLanguage: string }): Promise<any> {
  const article = await storage.getArticle(payload.articleId);
  if (!article) return { skipped: true, reason: "article not found" };

  const articleClientId = article.clientId || undefined;

  const langNames: Record<string, string> = {
    en: "English", ar: "Arabic", fr: "French", es: "Spanish", tr: "Turkish"
  };
  const targetLangName = langNames[payload.targetLanguage] || payload.targetLanguage;

  const existing = await storage.getArticleTranslation(payload.articleId, payload.targetLanguage, articleClientId);
  if (!existing) return { skipped: true, reason: "no translation record" };

  const effectiveClientId = article.clientId || 0;
  try {
    const textToTranslate = `Title: ${article.title}\n\nContent: ${(article.content || "").substring(0, 3000)}${article.summary ? `\n\nSummary: ${article.summary}` : ""}`;

    const job = await enqueueAIJob(effectiveClientId, "summary", {
      systemPrompt: `You are a professional news translator. Translate the following news article to ${targetLangName}. Return JSON with: "title" (translated title), "content" (translated content), "summary" (translated summary). Respond ONLY with valid JSON.`,
      userContent: textToTranslate,
      responseFormat: { type: "json_object" },
    }, 2000);

    const aiResult = await awaitJobResult(job.id);
    const result = JSON.parse(aiResult.content || "{}");

    await storage.updateArticleTranslation(existing.id, {
      translatedTitle: result.title || article.title,
      translatedContent: result.content || article.content,
      translatedSummary: result.summary || article.summary,
      status: "completed",
    }, articleClientId);

    return { articleId: payload.articleId, targetLanguage: payload.targetLanguage, status: "completed" };
  } catch (e) {
    console.error(`Translation failed for article ${payload.articleId}:`, e);
    await storage.updateArticleTranslation(existing.id, { status: "failed" }, articleClientId);
    throw e;
  }
}

export function registerArticleAnalysisHandler() {
  registerJobHandler("ANALYZE_ARTICLE", handleAnalyzeArticle);
  registerJobHandler("TRANSLATE_ARTICLE", handleTranslateArticle);
  registerJobHandler("EXTRACT_ARTICLE_CONTENT", handleExtractArticleContent);
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

async function fetchWithRetry(source: any): Promise<{ newArticles: number; retries: number }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`[Worker] ${source.name}: retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
    try {
      let newArticles: number;
      switch (source.type) {
        case "rss": newArticles = await fetchRssArticles(source); break;
        case "website": newArticles = await fetchWebsiteArticles(source); break;
        case "twitter": newArticles = await fetchTwitterArticles(source); break;
        case "youtube": newArticles = await fetchYouTubeArticles(source); break;
        case "facebook": newArticles = await fetchFacebookArticles(source); break;
        case "instagram": newArticles = await fetchInstagramArticles(source); break;
        case "telegram": newArticles = await fetchTelegramArticles(source); break;
        case "google_news": newArticles = await fetchGoogleNewsArticles(source); break;
        default: newArticles = await fetchRssArticles(source);
      }
      return { newArticles, retries: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Worker] ${source.name}: attempt ${attempt + 1} failed - ${lastError.message}`);
    }
  }
  throw lastError || new Error("All retries exhausted");
}

const AUTO_PAUSE_THRESHOLD = 5;

export async function fetchSourceFeed(sourceId: number): Promise<number> {
  const source = await storage.getSource(sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);

  const startTime = Date.now();

  try {
    console.log(`[Worker] FETCH start | source=${source.name} | type=${source.type}`);
    const result = await fetchWithRetry(source);
    const durationMs = Date.now() - startTime;

    await storage.updateSourceLastFetched(source.id);
    await storage.createFetchLog({
      sourceId: source.id,
      status: "success",
      articlesFound: result.newArticles,
      retryCount: result.retries,
      durationMs,
      pipelineStep: "complete",
    });
    console.log(`[Worker] COMPLETE | source=${source.name} | articles=${result.newArticles} | retries=${result.retries} | duration=${durationMs}ms`);
    return result.newArticles;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    await storage.createFetchLog({
      sourceId: source.id,
      status: "error",
      articlesFound: 0,
      errorMessage: errorMsg.substring(0, 500),
      retryCount: MAX_RETRIES,
      durationMs,
      pipelineStep: "fetch",
    });

    try {
      const failures = await storage.getConsecutiveFailureCount(sourceId);
      if (failures >= AUTO_PAUSE_THRESHOLD) {
        console.warn(`[Worker] AUTO-PAUSE | source=${source.name} | consecutive failures=${failures} — deactivating source`);
        await storage.updateSource(sourceId, { active: false });
        try {
          const { logSystemError } = await import("./processing-queue");
          await logSystemError("feed-worker", `Source "${source.name}" auto-paused after ${failures} consecutive failures. Last error: ${errorMsg.substring(0, 200)}`, "warning", { sourceId });
        } catch {}
      }
      console.error(`[Worker] FAILED | source=${source.name} | error=${errorMsg} | retries=${MAX_RETRIES} | duration=${durationMs}ms | consecutive=${failures}`);
    } catch {
      console.error(`[Worker] FAILED | source=${source.name} | error=${errorMsg} | retries=${MAX_RETRIES} | duration=${durationMs}ms`);
    }

    throw err;
  }
}

export type PreviewArticle = {
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  image?: string;
};

export type SourcePreviewResult = {
  success: boolean;
  method: string;
  articles: PreviewArticle[];
  feedUrl?: string;
  rendered?: boolean;
  warnings?: string[];
  error?: string;
};

export async function previewSource(
  url: string,
  type: string,
  maxArticles: number = 10,
  country?: string,
  collectorConfig?: WebsiteCollectorConfig,
  rawFilterConfig?: SourceFilterConfig,
): Promise<SourcePreviewResult> {
  const normalized = normalizeUrl(url);
  const filterConfig = normalizeSourceFilterConfig(rawFilterConfig);
  const candidateLimit = filterConfig.whitelist.enabled || filterConfig.blacklist.enabled
    ? Math.min(maxArticles * 3, 50)
    : maxArticles;

  if (type === "google_news") {
    const keyword = url.trim();
    const rssUrl = buildGoogleNewsSearchUrl(keyword, country);
    try {
      const feed = await parser.parseURL(rssUrl);
      const candidates = feed.items.slice(0, candidateLimit).map(item => {
        const subSource = extractGoogleNewsSubSource(item);
        const rawTitle = stripHtml(item.title || "Untitled");
        return {
          title: cleanGoogleNewsTitle(rawTitle, subSource),
          url: item.link || "",
          content: stripHtml(item.contentSnippet || item.content || item.summary || item.title || "").substring(0, 300),
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          image: extractImageFromRssItem(item),
          imageTitle: extractImageTitleFromRssItem(item),
        };
      });
      const articles = filterSourceItems(candidates, filterConfig).slice(0, maxArticles);
      if (articles.length > 0) {
        return { success: true, method: "google_news", articles };
      }
      if (candidates.length > 0) {
        return { success: false, method: "google_news", articles: [], error: "No recent articles matched the feed filters" };
      }
    } catch {}
    return { success: false, method: "none", articles: [], error: "Unable to fetch Google News results for this keyword" };
  }

  if (type === "rss") {
    try {
      let feedUrl = normalized;
      if (!feedUrl.match(/\.(xml|rss|atom)$/i) && !feedUrl.includes("/feed") && !feedUrl.includes("/rss")) {
        const discovered = await discoverRssFeed(feedUrl);
        if (discovered) feedUrl = discovered;
      }
      const feed = await parser.parseURL(feedUrl);
      const candidates = feed.items.slice(0, candidateLimit).map(item => ({
        title: stripHtml(item.title || "Untitled"),
        url: item.link || "",
        content: stripHtml(item.contentEncoded || item.content || item.contentSnippet || item.summary || "").substring(0, 300),
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        image: extractImageFromRssItem(item),
        imageTitle: extractImageTitleFromRssItem(item),
      }));
      const articles = filterSourceItems(candidates, filterConfig).slice(0, maxArticles);
      if (articles.length > 0) {
        return { success: true, method: "rss", articles, feedUrl };
      }
      if (candidates.length > 0) {
        return { success: false, method: "rss", articles: [], feedUrl, error: "No recent articles matched the feed filters" };
      }
    } catch {}
    return { success: false, method: "none", articles: [], error: "Unable to parse RSS feed from this URL" };
  }

  try {
    const result = await collectWebsite(normalized, collectorConfig, candidateLimit);
    const articles = filterSourceItems(result.articles, filterConfig).slice(0, maxArticles);
    return {
      success: articles.length > 0,
      method: result.method,
      articles: articles.map((article) => ({ ...article, content: article.content.substring(0, 300) })),
      feedUrl: result.feedUrl,
      rendered: result.rendered,
      warnings: result.warnings,
      error: result.articles.length > 0 && articles.length === 0 ? "No recent articles matched the feed filters" : undefined,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Website collection failed";
    console.log(`[Preview] Website collection failed for ${normalized}: ${message}`);
    return { success: false, method: "none", articles: [], error: message };
  }
}

export async function fetchAllFeeds(): Promise<{ sourceName: string; newArticles: number; error?: string }[]> {
  const allSources = await storage.getSources();
  const activeSources = allSources.filter((s) => s.active);
  const results: { sourceName: string; newArticles: number; error?: string }[] = [];
  const batchStart = Date.now();

  console.log(`[Worker] Batch fetch starting | sources=${activeSources.length}`);

  for (const source of activeSources) {
    try {
      const newArticles = await fetchSourceFeed(source.id);
      results.push({ sourceName: source.name, newArticles });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      results.push({ sourceName: source.name, newArticles: 0, error: errorMsg });
    }
  }

  const totalArticles = results.reduce((sum, r) => sum + r.newArticles, 0);
  const failures = results.filter(r => r.error).length;
  console.log(`[Worker] Batch complete | articles=${totalArticles} | success=${results.length - failures} | failed=${failures} | duration=${Date.now() - batchStart}ms`);

  return results;
}

export async function backfillGoogleNewsImages(): Promise<number> {
  const clientIds = await storage.getDistinctClientIds();
  let totalUpdated = 0;

  for (const clientId of clientIds) {
    const { items } = await storage.getArticles({ limit: 200, clientId });
    const googleNewsArticles = items.filter(
      (a) => (a.source?.type === "google_news" || a.source?.type === "facebook") && (!a.imageUrl || isGenericGoogleImage(a.imageUrl)) && a.imageUrl !== "none"
    );
    if (googleNewsArticles.length === 0) continue;

    console.log(`[Worker] Backfilling images for ${googleNewsArticles.length} articles (client=${clientId})...`);

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
            totalUpdated++;
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
  }

  console.log(`[Worker] Backfill complete: updated ${totalUpdated} articles across ${clientIds.length} clients`);
  return totalUpdated;
}

export async function backfillMissingImages(): Promise<number> {
  const clientIds = await storage.getDistinctClientIds();
  let totalUpdated = 0;

  for (const clientId of clientIds) {
    const { items } = await storage.getArticles({ limit: 200, clientId });
    const noImageArticles = items.filter(
      (a) => !a.imageUrl && a.url && a.source?.type !== "google_news" && a.source?.type !== "facebook"
    );
    if (noImageArticles.length === 0) continue;

    const batch = noImageArticles.slice(0, 5);
    for (const article of batch) {
      try {
        const image = await inspectArticleImage(article.url!).catch(() => fetchOgImage(article.url!));
        if (image && !isGenericGoogleImage(image)) {
          await storage.updateArticle(article.id, { imageUrl: image });
          totalUpdated++;
          console.log(`[Worker] Resolved image for article ${article.id}: ${image.substring(0, 80)}`);
        } else {
          await storage.updateArticle(article.id, { imageUrl: "none" });
        }
      } catch (e) {
        console.error(`[Worker] Image resolve error for article ${article.id}:`, e);
      }
    }
  }

  if (totalUpdated > 0) {
    console.log(`[Worker] Image resolve: updated ${totalUpdated} articles`);
  }
  return totalUpdated;
}

const PRIORITY_INTERVALS: Record<string, number> = {
  high: 5,
  medium: 10,
  low: 15,
};

let workerIntervals: ReturnType<typeof setInterval>[] = [];
let lastWorkerRun: Date | null = null;

export function getLastWorkerRun() {
  return lastWorkerRun;
}

async function fetchByPriority(priority: string) {
  const allSources = await storage.getSources();
  const activeSources = allSources.filter(
    (s) => s.active && !s.deletedAt && (s.refreshPriority || "medium") === priority
  );

  if (activeSources.length === 0) return;

  console.log(`[Worker] Fetching ${priority}-priority sources (${activeSources.length})`);
  const results: { sourceName: string; newArticles: number; error?: string }[] = [];
  const batchStart = Date.now();

  for (const source of activeSources) {
    try {
      const newArticles = await fetchSourceFeed(source.id);
      results.push({ sourceName: source.name, newArticles });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      results.push({ sourceName: source.name, newArticles: 0, error: errorMsg });
    }
  }

  const totalArticles = results.reduce((sum, r) => sum + r.newArticles, 0);
  const failures = results.filter(r => r.error).length;
  lastWorkerRun = new Date();
  console.log(`[Worker] ${priority}-priority complete | articles=${totalArticles} | success=${results.length - failures} | failed=${failures} | duration=${Date.now() - batchStart}ms`);
}

export function startFeedWorker(intervalMinutes?: number) {
  registerJobHandler("EXTRACT_ARTICLE_CONTENT", handleExtractArticleContent);
  stopFeedWorker();

  console.log(`[Worker] Starting smart feed worker with priority-based scheduling`);
  console.log(`[Worker] High: every ${PRIORITY_INTERVALS.high}min | Medium: every ${PRIORITY_INTERVALS.medium}min | Low: every ${PRIORITY_INTERVALS.low}min`);

  setTimeout(async () => {
    console.log("[Worker] Initial feed fetch (all priorities)...");
    try {
      const results = await fetchAllFeeds();
      const total = results.reduce((sum, r) => sum + r.newArticles, 0);
      lastWorkerRun = new Date();
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
      await backfillMissingImages();
    } catch (e) {
      console.error("[Worker] Image backfill error:", e);
    }
  }, 5000);

  for (const [priority, minutes] of Object.entries(PRIORITY_INTERVALS)) {
    const interval = setInterval(async () => {
      try {
        await fetchByPriority(priority);
      } catch (e) {
        console.error(`[Worker] ${priority}-priority fetch error:`, e);
      }
    }, minutes * 60 * 1000);
    workerIntervals.push(interval);
  }

  const retentionInterval = setInterval(async () => {
    try {
      const deleted = await storage.deleteExpiredArticles();
      if (deleted > 0) console.log(`[Worker] Cleanup: removed ${deleted} expired articles`);
    } catch (e) {
      console.error("[Worker] Cleanup error:", e);
    }
  }, 60 * 60 * 1000);
  workerIntervals.push(retentionInterval);

  // AI retry worker disabled
  // import("./ai-retry-worker").then(({ runAIRetryQueue }) => {
  //   setTimeout(async () => {
  //     try { await runAIRetryQueue(); } catch (e) { console.error("[Worker] Initial AI retry error:", e); }
  //   }, 30000);
  //   const retryInterval = setInterval(async () => {
  //     try {
  //       await runAIRetryQueue();
  //     } catch (e) {
  //       console.error("[Worker] AI retry error:", e);
  //     }
  //   }, 10 * 60 * 1000);
  //   workerIntervals.push(retryInterval);
  // });
}

export function stopFeedWorker() {
  for (const interval of workerIntervals) {
    clearInterval(interval);
  }
  workerIntervals = [];
}
