import RssParser from "rss-parser";
import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { scrapeWebsite, fetchTwitterFeed, fetchYouTubeFeed, fetchFacebookFeed, fetchInstagramFeed, fetchTelegramFeed } from "./web-scraper";
import { enqueueJob, registerJobHandler, openaiLimiter } from "./processing-queue";

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

export async function analyzeWithAI(title: string, content: string): Promise<AIAnalysisResult> {
  return openaiLimiter.run(async () => {
    try {
      const textToAnalyze = truncate(`${title}. ${content}`, 2000);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'You analyze news articles. Return JSON with: "sentiment" (positive/negative/neutral), "score" (-100 to 100), "keywords" (array of 3-5 key terms), "topics" (array of 1-3 topic labels like "economy", "elections", "climate", "cybersecurity", "AI", "conflict", "trade", "healthcare"), "summary" (1-2 sentence summary), "category" (exactly one of: political, health, tech, sports, business, entertainment, science, urgent, general), "country" (ISO 3166-1 alpha-2 code of the primary country the article is about, or null if unclear). Respond ONLY with valid JSON.',
          },
          { role: "user", content: textToAnalyze },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 500,
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
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
  });
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

async function processItems(
  source: { id: number; name: string; clientId?: number | null },
  items: { title: string; url: string; content: string; publishedAt: Date; image?: string; subSource?: string; engagementLikes?: number; engagementComments?: number; engagementShares?: number }[]
): Promise<number> {
  let newArticles = 0;

  for (const item of items) {
    if (!item.url) continue;

    const existing = await storage.getArticleByUrl(item.url);
    if (existing) continue;

    const title = item.title || "Untitled";
    const contentRaw = item.content || title;
    if (!contentRaw && !title) continue;

    const contentClean = cleanText(contentRaw);

    const article = {
      title,
      content: truncate(contentRaw, 5000),
      contentClean: truncate(contentClean, 5000),
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
      category: "general",
      imageUrl: item.image || null,
      subSource: item.subSource || null,
      engagementLikes: item.engagementLikes ?? null,
      engagementComments: item.engagementComments ?? null,
      engagementShares: item.engagementShares ?? null,
      clientId: source.clientId ?? null,
      aiAnalysisStatus: "pending" as const,
      aiRetryCount: 0,
    };

    try {
      const created = await storage.createArticle(article);
      newArticles++;
      await enqueueJob("ANALYZE_ARTICLE", { articleId: created.id }, { priority: 3, maxAttempts: 3 });
    } catch (e) {
      console.error(`[Worker] STORE failed for article: ${item.url}`, e);
    }
  }

  return newArticles;
}

async function handleAnalyzeArticle(payload: { articleId: number }): Promise<any> {
  const article = await storage.getArticle(payload.articleId);
  if (!article) return { skipped: true, reason: "article not found" };

  const analysis = await analyzeWithAI(article.title, article.contentClean || article.content || "");

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

  const langNames: Record<string, string> = {
    en: "English", ar: "Arabic", fr: "French", es: "Spanish", tr: "Turkish"
  };
  const targetLangName = langNames[payload.targetLanguage] || payload.targetLanguage;

  const existing = await storage.getArticleTranslation(payload.articleId, payload.targetLanguage);
  if (!existing) return { skipped: true, reason: "no translation record" };

  try {
    const textToTranslate = `Title: ${article.title}\n\nContent: ${(article.content || "").substring(0, 3000)}${article.summary ? `\n\nSummary: ${article.summary}` : ""}`;

    const result = await openaiLimiter.run(async () => {
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
      return JSON.parse(completion.choices[0].message.content || "{}");
    });

    await storage.updateArticleTranslation(existing.id, {
      translatedTitle: result.title || article.title,
      translatedContent: result.content || article.content,
      translatedSummary: result.summary || article.summary,
      status: "completed",
    });

    return { articleId: payload.articleId, targetLanguage: payload.targetLanguage, status: "completed" };
  } catch (e) {
    console.error(`Translation failed for article ${payload.articleId}:`, e);
    await storage.updateArticleTranslation(existing.id, { status: "failed" });
    throw e;
  }
}

export function registerArticleAnalysisHandler() {
  registerJobHandler("ANALYZE_ARTICLE", handleAnalyzeArticle);
  registerJobHandler("TRANSLATE_ARTICLE", handleTranslateArticle);
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
          await logSystemError("feed-worker", `Source "${source.name}" auto-paused after ${failures} consecutive failures. Last error: ${errorMsg.substring(0, 200)}`, "warning", sourceId);
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
  error?: string;
};

export async function previewSource(url: string, type: string, maxArticles: number = 10): Promise<SourcePreviewResult> {
  const normalized = normalizeUrl(url);

  if (type === "google_news") {
    const keyword = url.trim();
    const encodedKeyword = encodeURIComponent(keyword);
    const rssUrl = `https://news.google.com/rss/search?q=${encodedKeyword}&hl=en&gl=US&ceid=US:en`;
    try {
      const feed = await parser.parseURL(rssUrl);
      const articles = feed.items.slice(0, maxArticles).map(item => {
        const subSource = extractGoogleNewsSubSource(item);
        const rawTitle = stripHtml(item.title || "Untitled");
        return {
          title: cleanGoogleNewsTitle(rawTitle, subSource),
          url: item.link || "",
          content: stripHtml(item.contentSnippet || item.content || item.summary || item.title || "").substring(0, 300),
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          image: extractImageFromRssItem(item),
        };
      });
      if (articles.length > 0) {
        return { success: true, method: "google_news", articles };
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
      const articles = feed.items.slice(0, maxArticles).map(item => ({
        title: stripHtml(item.title || "Untitled"),
        url: item.link || "",
        content: stripHtml(item.contentEncoded || item.content || item.contentSnippet || item.summary || "").substring(0, 300),
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        image: extractImageFromRssItem(item),
      }));
      if (articles.length > 0) {
        return { success: true, method: "rss", articles, feedUrl };
      }
    } catch {}
    return { success: false, method: "none", articles: [], error: "Unable to parse RSS feed from this URL" };
  }

  // For website type: try website scraping first, then RSS discovery, then alternatives
  // Step 1: Try direct website scraping
  try {
    const scraped = await scrapeWebsite(normalized);
    if (scraped.length > 0) {
      const articles = scraped.slice(0, maxArticles).map(a => ({
        title: a.title,
        url: a.url,
        content: (a.content || "").substring(0, 300),
        publishedAt: a.publishedAt || new Date(),
        image: a.image,
      }));
      return { success: true, method: "website", articles };
    }
  } catch (e) {
    console.log(`[Preview] Website scraping failed for ${normalized}: ${e instanceof Error ? e.message : e}`);
  }

  // Step 2: Try RSS feed discovery
  try {
    const feedUrl = await discoverRssFeed(normalized);
    if (feedUrl) {
      const feed = await parser.parseURL(feedUrl);
      const articles = feed.items.slice(0, maxArticles).map(item => ({
        title: stripHtml(item.title || "Untitled"),
        url: item.link || "",
        content: stripHtml(item.contentEncoded || item.content || item.contentSnippet || item.summary || "").substring(0, 300),
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        image: extractImageFromRssItem(item),
      }));
      if (articles.length > 0) {
        return { success: true, method: "rss", articles, feedUrl };
      }
    }
  } catch (e) {
    console.log(`[Preview] RSS discovery failed for ${normalized}: ${e instanceof Error ? e.message : e}`);
  }

  // Step 3: Try Google News as fallback
  try {
    const domain = new URL(normalized).hostname.replace("www.", "");
    const rssUrl = `https://news.google.com/rss/search?q=site:${domain}&hl=en&gl=US&ceid=US:en`;
    const feed = await parser.parseURL(rssUrl);
    const articles = feed.items.slice(0, maxArticles).map(item => ({
      title: stripHtml(item.title || "Untitled"),
      url: item.link || "",
      content: stripHtml(item.contentSnippet || item.content || item.summary || "").substring(0, 300),
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      image: extractImageFromRssItem(item),
    }));
    if (articles.length > 0) {
      return { success: true, method: "google_news_fallback", articles };
    }
  } catch (e) {
    console.log(`[Preview] Google News fallback failed for ${normalized}: ${e instanceof Error ? e.message : e}`);
  }

  return { success: false, method: "none", articles: [], error: "Unable to fetch articles from this source. Please check the URL and try again." };
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

  import("./ai-retry-worker").then(({ runAIRetryQueue }) => {
    setTimeout(async () => {
      try { await runAIRetryQueue(); } catch (e) { console.error("[Worker] Initial AI retry error:", e); }
    }, 30000);
    const retryInterval = setInterval(async () => {
      try {
        await runAIRetryQueue();
      } catch (e) {
        console.error("[Worker] AI retry error:", e);
      }
    }, 10 * 60 * 1000);
    workerIntervals.push(retryInterval);
  });
}

export function stopFeedWorker() {
  for (const interval of workerIntervals) {
    clearInterval(interval);
  }
  workerIntervals = [];
}
