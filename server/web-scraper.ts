import * as cheerio from "cheerio";

interface ScrapedArticle {
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  image?: string;
  subSource?: string;
  engagementLikes?: number;
  engagementComments?: number;
  engagementShares?: number;
}

const FACEBOOK_FALLBACK_MAX_AGE_DAYS = 30;
const FACEBOOK_FALLBACK_MAX_AGE_MS = FACEBOOK_FALLBACK_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function isRecentFacebookDate(value: Date | null | undefined): value is Date {
  if (!value || Number.isNaN(value.getTime())) return false;
  const timestamp = value.getTime();
  const now = Date.now();
  return timestamp <= now + 24 * 60 * 60 * 1000 && timestamp >= now - FACEBOOK_FALLBACK_MAX_AGE_MS;
}

function filterRecentFacebookArticles(articles: ScrapedArticle[]): ScrapedArticle[] {
  return articles.filter((article) => isRecentFacebookDate(article.publishedAt));
}

function parseEngagementCount(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match) return undefined;
  let raw = match[1].replace(/,/g, "").toLowerCase();
  let multiplier = 1;
  if (raw.endsWith("k")) { multiplier = 1000; raw = raw.slice(0, -1); }
  else if (raw.endsWith("m")) { multiplier = 1000000; raw = raw.slice(0, -1); }
  const num = parseFloat(raw);
  return isNaN(num) ? undefined : Math.round(num * multiplier);
}

function extractBaseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
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

function parseDate(value: string): Date {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

function parseSocialRssXml(xml: string, fallbackUrl: string, limit = 20): ScrapedArticle[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const articles: ScrapedArticle[] = [];

  $("item, entry").each((_, el) => {
    if (articles.length >= limit) return false;
    const $item = $(el);
    const title = $item.find("title").first().text().trim();
    const rawDescription =
      $item.find("content\\:encoded").first().text().trim() ||
      $item.find("content").first().text().trim() ||
      $item.find("summary").first().text().trim() ||
      $item.find("description").first().text().trim();
    const content = stripHtml(rawDescription || title);
    const link =
      $item.find("link").first().text().trim() ||
      $item.find("link").first().attr("href") ||
      $item.find("guid").first().text().trim() ||
      fallbackUrl;
    const pubDate =
      $item.find("pubDate").first().text().trim() ||
      $item.find("published").first().text().trim() ||
      $item.find("updated").first().text().trim();

    if (!title && !content) return;

    let image: string | undefined;
    image =
      $item.find("enclosure[type^='image']").first().attr("url") ||
      $item.find("media\\:content[url]").first().attr("url") ||
      $item.find("media\\:thumbnail[url]").first().attr("url");
    if (!image) {
      const imgMatch = rawDescription.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) image = imgMatch[1];
    }

    articles.push({
      title: title || content.substring(0, 150),
      url: link,
      content: content || title,
      publishedAt: parseDate(pubDate),
      image,
    });
  });

  return articles;
}

function isLikelyFeedUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.toLowerCase();
    return host === "rss.app" ||
      host === "rsshub.app" ||
      path.endsWith(".xml") ||
      path.endsWith(".rss") ||
      path.endsWith(".atom") ||
      path.includes("/feed") ||
      path.includes("/rss");
  } catch {
    return false;
  }
}

async function fetchSocialRssFeed(feedUrl: string, fallbackUrl: string): Promise<ScrapedArticle[]> {
  console.log(`[Social RSS] Fetching feed: ${feedUrl}`);
  const response = await fetch(feedUrl, {
    headers: { "User-Agent": "NWS360/1.0 (RSS Reader)", "Accept": "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!response.ok) {
    console.log(`[Social RSS] Feed returned ${response.status}`);
    return [];
  }

  const xml = await response.text();
  if (!xml.includes("<item") && !xml.includes("<entry")) return [];
  return parseSocialRssXml(xml, fallbackUrl);
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractFacebookIdentity(input: string): { pageName: string; searchName: string; pageUrl: string } {
  const trimmed = input.trim();
  let pageName = trimmed.replace(/^@/, "").replace(/\/$/, "");
  let searchName = pageName;
  let pageUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://www.facebook.com/${pageName}`;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://www.facebook.com/${trimmed.replace(/^@/, "")}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "facebook.com" && host !== "fb.com" && !host.endsWith(".facebook.com")) {
      return { pageName, searchName, pageUrl };
    }

    pageUrl = url.href;
    const segments = url.pathname.split("/").filter(Boolean).map(decodePathSegment);
    const first = (segments[0] || "").toLowerCase();

    if (first === "profile.php") {
      const id = url.searchParams.get("id");
      pageName = id || pageName;
      searchName = id || pageName;
    } else if (first === "pages" && segments.length >= 2) {
      const last = segments[segments.length - 1];
      const id = /^\d{8,}$/.test(last) ? last : null;
      pageName = id || segments[segments.length - 1] || segments[1];
      searchName = (id ? segments[segments.length - 2] : pageName) || pageName;
    } else if (first === "p" && segments.length >= 2) {
      const slug = segments[1];
      const id = slug.match(/(\d{8,})$/)?.[1];
      const label = slug.replace(/-\d{8,}$/, "").replace(/[-_]+/g, " ").trim();
      pageName = id || slug;
      searchName = label || id || slug;
    } else if (segments[0]) {
      pageName = segments[0];
      searchName = pageName;
    }
  } catch {}

  pageName = pageName.replace(/^@/, "").replace(/\/$/, "").split("?")[0].split("#")[0];
  searchName = searchName.replace(/^@/, "").replace(/[._-]+/g, " ").replace(/official$/i, "").trim() || pageName;
  return { pageName, searchName, pageUrl };
}

function compactForIdentityMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function cleanFacebookSourceName(value: string): string {
  return value
    .replace(/\b(?:facebook|page|posts?)\b/gi, " ")
    .trim();
}

function facebookResultMatchesIdentity(
  title: string,
  content: string,
  identity: { pageName: string; searchName: string },
  sourceName?: string,
): boolean {
  const titleMatch = compactForIdentityMatch(title);
  const haystack = compactForIdentityMatch(`${title} ${content}`);
  const sourceTerm = sourceName ? compactForIdentityMatch(cleanFacebookSourceName(sourceName)) : "";
  if (sourceTerm.length >= 4) {
    const sourceHasNonAscii = Boolean(sourceName && /[^\x00-\x7F]/.test(sourceName));
    if (sourceHasNonAscii ? titleMatch.includes(sourceTerm) : titleMatch.startsWith(sourceTerm)) return true;
  }

  const terms = Array.from(new Set([identity.pageName, identity.searchName]))
    .map(compactForIdentityMatch)
    .filter((term) => term.length >= 3 && !/^\d+$/.test(term));
  if (terms.length === 0) return true;
  if (sourceName) return terms.some((term) => titleMatch.startsWith(term));
  return terms.some((term) => haystack.includes(term));
}

export async function scrapeWebsite(url: string): Promise<ScrapedArticle[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const baseUrl = extractBaseUrl(url);
  const articles: ScrapedArticle[] = [];
  const seenUrls = new Set<string>();

  const selectors = [
    "article",
    "[class*='article']",
    "[class*='story']",
    "[class*='post']",
    "[class*='card']",
    "[class*='item']",
    "[class*='entry']",
    "[class*='news']",
    ".gc__content",
    ".story-card",
    ".content-card",
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);

      let link = $el.find("a[href]").first().attr("href");
      if (!link) {
        const parentLink = $el.closest("a[href]").attr("href");
        if (parentLink) link = parentLink;
      }
      if (!link) return;

      const fullUrl = resolveUrl(baseUrl, link);

      if (seenUrls.has(fullUrl)) return;
      if (fullUrl === url || fullUrl === baseUrl || fullUrl === baseUrl + "/") return;
      if (!fullUrl.startsWith("http")) return;
      if (fullUrl.includes("#") && fullUrl.split("#")[0] === url) return;

      let title = "";
      const headingEl = $el.find("h1, h2, h3, h4, [class*='title'], [class*='headline']").first();
      if (headingEl.length) {
        title = headingEl.text().trim();
      } else {
        const linkEl = $el.find("a").first();
        title = linkEl.text().trim();
      }

      if (!title || title.length < 10 || title.length > 500) return;

      let content = "";
      const descEl = $el.find("p, [class*='description'], [class*='summary'], [class*='excerpt'], [class*='snippet']").first();
      if (descEl.length) {
        content = descEl.text().trim();
      }

      const timeEl = $el.find("time, [datetime], [class*='date'], [class*='time']").first();
      let publishedAt = new Date();
      if (timeEl.length) {
        const datetime = timeEl.attr("datetime") || timeEl.text().trim();
        const parsed = new Date(datetime);
        if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now() - 365 * 24 * 60 * 60 * 1000) {
          publishedAt = parsed;
        }
      }

      let image: string | undefined;
      const imgEl = $el.find("img[src]").first();
      if (imgEl.length) {
        const src = imgEl.attr("src") || "";
        if (src && !src.includes("data:") && !src.includes("pixel") && !src.includes("spacer")) {
          image = resolveUrl(baseUrl, src);
        }
      }

      seenUrls.add(fullUrl);
      articles.push({
        title,
        url: fullUrl,
        content: content || title,
        publishedAt,
        image,
      });
    });

    if (articles.length >= 5) break;
  }

  if (articles.length === 0) {
    $("a[href]").each((_, el) => {
      if (articles.length >= 20) return false;

      const $a = $(el);
      const href = $a.attr("href");
      if (!href) return;

      const fullUrl = resolveUrl(baseUrl, href);
      if (seenUrls.has(fullUrl)) return;
      if (!fullUrl.startsWith("http")) return;
      if (fullUrl === url || fullUrl === baseUrl || fullUrl === baseUrl + "/") return;

      const text = $a.text().trim();
      if (text.length < 15 || text.length > 500) return;

      const isArticleLike = /\/(article|story|news|post|blog|20\d{2})\//i.test(fullUrl) ||
        fullUrl.split("/").filter(Boolean).length >= 4;
      if (!isArticleLike) return;

      seenUrls.add(fullUrl);
      articles.push({
        title: text,
        url: fullUrl,
        content: text,
        publishedAt: new Date(),
      });
    });
  }

  articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return articles.slice(0, 20);
}

export async function fetchYouTubeFeed(input: string): Promise<ScrapedArticle[]> {
  let channelId = "";
  let handle = "";
  const trimmed = input.trim();

  const channelIdMatch = trimmed.match(/(?:youtube\.com\/channel\/)([A-Za-z0-9_-]+)/);
  const handleMatch = trimmed.match(/(?:youtube\.com\/@?)([A-Za-z0-9_-]+)/);
  const directChannelId = trimmed.match(/^UC[A-Za-z0-9_-]{22}$/);

  if (channelIdMatch) {
    channelId = channelIdMatch[1];
  } else if (directChannelId) {
    channelId = trimmed;
  } else if (handleMatch) {
    handle = handleMatch[1];
  } else {
    handle = trimmed.replace(/^@/, "");
  }

  if (!channelId && handle) {
    try {
      const response = await fetch(`https://www.youtube.com/@${handle}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
      });
      const html = await response.text();
      const idMatch = html.match(/"channelId":"(UC[A-Za-z0-9_-]+)"/);
      if (idMatch) {
        channelId = idMatch[1];
      } else {
        const metaMatch = html.match(/channel_id=([A-Za-z0-9_-]+)/);
        if (metaMatch) channelId = metaMatch[1];
      }
    } catch (e) {
      console.error(`[YouTube] Failed to resolve handle @${handle}:`, e);
    }
  }

  if (!channelId) {
    console.log(`[YouTube] Could not resolve channel ID for: ${input}`);
    return [];
  }

  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  console.log(`[YouTube] Fetching RSS: ${rssUrl}`);

  try {
    const response = await fetch(rssUrl, {
      headers: { "User-Agent": "NWS360/1.0 (RSS Reader)" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.log(`[YouTube] RSS feed returned ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const articles: ScrapedArticle[] = [];

    $("entry").each((_, el) => {
      if (articles.length >= 20) return false;
      const $entry = $(el);
      const title = $entry.find("title").text().trim();
      const videoId = $entry.find("yt\\:videoId, videoId").text().trim();
      const published = $entry.find("published").text().trim();
      const description = $entry.find("media\\:description, description").text().trim();
      const thumbnail = $entry.find("media\\:thumbnail, thumbnail").attr("url");

      if (!title) return;

      articles.push({
        title,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
        content: description || title,
        publishedAt: published ? new Date(published) : new Date(),
        image: thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined),
      });
    });

    console.log(`[YouTube] Got ${articles.length} videos`);
    return articles;
  } catch (e) {
    console.error(`[YouTube] Failed to fetch RSS:`, e);
    return [];
  }
}

export async function fetchFacebookFeed(input: string, options: { originalUrl?: string; sourceName?: string } = {}): Promise<ScrapedArticle[]> {
  const identity = extractFacebookIdentity(options.originalUrl || input);
  const feedUrl = isLikelyFeedUrl(input) ? input.trim() : null;

  if (feedUrl) {
    try {
      const feedArticles = await fetchSocialRssFeed(feedUrl, identity.pageUrl);
      if (feedArticles.length > 0) {
        const recentArticles = filterRecentFacebookArticles(feedArticles);
        console.log(`[Facebook] Got ${recentArticles.length}/${feedArticles.length} recent posts from configured feed`);
        return recentArticles;
      }
    } catch (e) {
      console.log(`[Facebook] Configured feed failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const { pageName, searchName, pageUrl } = identity;
  console.log(`[Facebook] Fetching page: ${pageName}`);

  const rssBridges = [
    `https://rsshub.app/facebook/page/${pageName}`,
    `https://feedbridge.notifier.in/facebook/${pageName}`,
  ];

  for (const bridgeUrl of rssBridges) {
    try {
      console.log(`[Facebook] Trying RSS bridge: ${bridgeUrl}`);
      const articles = await fetchSocialRssFeed(bridgeUrl, pageUrl);
      if (articles.length > 0) {
        const recentArticles = filterRecentFacebookArticles(articles);
        console.log(`[Facebook] Got ${recentArticles.length}/${articles.length} recent posts from RSS bridge`);
        return recentArticles;
      }
    } catch (e) {
      console.log(`[Facebook] Bridge failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
  }

  console.log(`[Facebook] RSS bridges failed, trying mbasic scraping for ${pageName}`);
  try {
    const response = await fetch(`https://mbasic.facebook.com/${pageName}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);
      const articles: ScrapedArticle[] = [];

      $("div[data-ft], div.bx, div.by, article, div[role='article']").each((_, el) => {
        if (articles.length >= 20) return false;
        const $post = $(el);
        const text = $post.find("p, div.d2, div.dj").first().text().trim();
        const link = $post.find("a[href*='/story.php'], a[href*='/permalink']").first().attr("href");

        if (!text || text.length < 10) return;

        const postUrl = link
          ? (link.startsWith("http") ? link : `https://mbasic.facebook.com${link}`)
          : `https://www.facebook.com/${pageName}`;

        let image: string | undefined;
        const imgEl = $post.find("img[src]").first();
        if (imgEl.length) {
          const src = imgEl.attr("src") || "";
          if (src.startsWith("http") && !src.includes("emoji")) image = src;
        }

        const footerText = $post.text().toLowerCase();
        const engagementLikes = parseEngagementCount(footerText, /(\d[\d,.]*[km]?)\s*(?:likes?|reactions?|people reacted)/i);
        const engagementComments = parseEngagementCount(footerText, /(\d[\d,.]*[km]?)\s*comments?/i);
        const engagementShares = parseEngagementCount(footerText, /(\d[\d,.]*[km]?)\s*shares?/i);

        articles.push({
          title: text.substring(0, 200),
          url: postUrl.replace("mbasic.facebook.com", "www.facebook.com"),
          content: text,
          publishedAt: new Date(),
          image,
          engagementLikes,
          engagementComments,
          engagementShares,
        });
      });

      if (articles.length > 0) {
        const recentArticles = filterRecentFacebookArticles(articles);
        console.log(`[Facebook] Scraped ${recentArticles.length}/${articles.length} recent posts from mbasic`);
        return recentArticles;
      }
    } else {
      console.log(`[Facebook] mbasic returned ${response.status}`);
    }
  } catch (e) {
    console.log(`[Facebook] mbasic scraping failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(`[Facebook] All direct methods failed, trying Facebook-only Google News fallback for ${pageName}`);
  try {
    const RssParser = (await import("rss-parser")).default;
    const parser = new RssParser({
      customFields: {
        item: [
          ["media:content", "mediaContent"],
          ["media:thumbnail", "mediaThumbnail"],
        ],
      },
    });
    const fallbackSearchTerm = /^\d+$/.test(pageName) ? searchName : pageName;
    if (fallbackSearchTerm.length < 3) return [];
    const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${fallbackSearchTerm}" site:facebook.com when:${FACEBOOK_FALLBACK_MAX_AGE_DAYS}d`)}&hl=en&gl=US&ceid=US:en`;
    const feed = await parser.parseURL(googleNewsUrl);
    const articles: ScrapedArticle[] = [];

    for (const item of (feed.items || []) as any[]) {
      if (articles.length >= 20) break;
      if (!item.title) continue;
      const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
      if (!isRecentFacebookDate(publishedAt)) continue;

      let subSource: string | undefined;
      if (item.source) {
        if (typeof item.source === "string") subSource = item.source;
        else if (item.source._ || item.source.$t) subSource = item.source._ || item.source.$t;
      }
      if (!subSource) {
        const dashIdx = (item.title || "").lastIndexOf(" - ");
        if (dashIdx > 0) subSource = item.title.substring(dashIdx + 3).trim();
      }

      let cleanTitle = item.title;
      if (subSource) {
        const suffix = ` - ${subSource}`;
        if (cleanTitle.endsWith(suffix)) cleanTitle = cleanTitle.slice(0, -suffix.length);
      }

      let image: string | undefined;
      if (item.mediaContent) {
        const mc = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
        const url = mc?.$ ? mc.$.url : mc?.url;
        if (url) image = url;
      }
      if (!image && item.mediaThumbnail) {
        const mt = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail;
        const url = mt?.$ ? mt.$.url : mt?.url;
        if (url) image = url;
      }
      if (!image && item.enclosure?.url) image = item.enclosure.url;

      if (image && (image.includes("lh3.googleusercontent.com") || image.includes("gstatic.com"))) image = undefined;

      const content = item.contentSnippet || item.content || item.title || "";
      const sourceLabel = String(subSource || "").toLowerCase();
      const realUrl = item.link || "";
      const looksFacebook = sourceLabel.includes("facebook") || String(realUrl).includes("facebook.com") || String(content).toLowerCase().includes("facebook.com");
      if (!looksFacebook) continue;
      if (!facebookResultMatchesIdentity(cleanTitle, content, identity, options.sourceName)) continue;

      if (!image && subSource) {
        const resolved = await resolveArticleFromPublisher(cleanTitle, subSource);
        if (resolved) {
          if (resolved.image) image = resolved.image;
        }
      }

      articles.push({
        title: cleanTitle,
        url: realUrl || pageUrl,
        content,
        publishedAt,
        image,
        subSource,
      });
    }

    console.log(`[Facebook] Got ${articles.length} articles via Google News for "${fallbackSearchTerm}"`);
    return articles;
  } catch (e) {
    console.error(`[Facebook] Google News fallback failed:`, e instanceof Error ? e.message : String(e));
    return [];
  }
}

const PUBLISHER_RSS_FEEDS: Record<string, string[]> = {
  "CNN": ["http://rss.cnn.com/rss/edition.rss", "http://rss.cnn.com/rss/cnn_topstories.rss", "http://rss.cnn.com/rss/cnn_latest.rss"],
  "Al Jazeera": ["https://www.aljazeera.com/xml/rss/all.xml"],
  "Reuters": ["https://www.reutersagency.com/feed/"],
  "BBC": ["https://feeds.bbci.co.uk/news/rss.xml"],
  "BBC News": ["https://feeds.bbci.co.uk/news/rss.xml"],
  "Fox News": ["https://moxie.foxnews.com/google-publisher/latest.xml"],
  "NPR": ["https://feeds.npr.org/1001/rss.xml"],
  "The Guardian": ["https://www.theguardian.com/world/rss"],
  "Forbes": ["https://www.forbes.com/real-time/feed2/"],
  "NBC News": ["https://feeds.nbcnews.com/nbcnews/public/news"],
  "ABC News": ["https://abcnews.go.com/abcnews/topstories"],
  "The Washington Post": ["https://feeds.washingtonpost.com/rss/world"],
  "USA Today": ["http://rssfeeds.usatoday.com/UsatodaycomNation-TopStories"],
  "The Hill": ["https://thehill.com/feed/"],
  "Politico": ["https://www.politico.com/rss/politicopicks.xml"],
  "TechCrunch": ["https://techcrunch.com/feed/"],
  "The Verge": ["https://www.theverge.com/rss/index.xml"],
};

async function resolveArticleFromPublisher(title: string, publisher: string): Promise<{ url?: string; image?: string } | null> {
  const feeds = PUBLISHER_RSS_FEEDS[publisher];
  if (!feeds) {
    return await fetchOgImageFromArticleSearch(title, publisher);
  }

  try {
    const RssParser = (await import("rss-parser")).default;
    const parser = new RssParser({
      customFields: {
        item: [
          ["media:content", "mediaContent"],
          ["media:thumbnail", "mediaThumbnail"],
        ],
      },
    });

    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    for (const feedUrl of feeds) {
      try {
        const feed = await parser.parseURL(feedUrl);
        for (const item of (feed.items || []) as any[]) {
          const itemTitle = (item.title || "").toLowerCase();
          const matchCount = titleWords.filter(w => itemTitle.includes(w)).length;
          if (matchCount >= Math.min(3, titleWords.length * 0.5)) {
            let image: string | undefined;
            if (item.mediaContent) {
              const mc = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
              image = mc?.$ ? mc.$.url : mc?.url;
            }
            if (!image && item.mediaThumbnail) {
              const mt = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail;
              image = mt?.$ ? mt.$.url : mt?.url;
            }
            if (!image && item.enclosure?.url) {
              const enc = item.enclosure;
              if (!enc.type || enc.type.startsWith("image")) image = enc.url;
            }

            if (!image && item.link) {
              image = await fetchOgImageDirect(item.link);
            }

            if (image && !image.includes("placeholder") && !image.includes("gstatic")) {
              return { url: item.link, image };
            }

            if (item.link) {
              return { url: item.link };
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch {}

  return await fetchOgImageFromArticleSearch(title, publisher);
}

async function fetchOgImageDirect(url: string): Promise<string | undefined> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "NWS360/1.0 (RSS Reader)" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!resp.ok) return undefined;
    const html = await resp.text();
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const imgUrl = ogMatch[1];
      if (imgUrl.includes("placeholder") || imgUrl.includes("gstatic")) return undefined;
      return imgUrl.startsWith("http") ? imgUrl : new URL(imgUrl, url).href;
    }
  } catch {}
  return undefined;
}

async function fetchOgImageFromArticleSearch(title: string, publisher: string): Promise<{ url?: string; image?: string } | null> {
  const publisherDomains: Record<string, string> = {
    "CNN": "cnn.com", "NBC News": "nbcnews.com", "The New York Times": "nytimes.com",
    "The Guardian": "theguardian.com", "Fox News": "foxnews.com", "Reuters": "reuters.com",
    "AP News": "apnews.com", "BBC": "bbc.com", "BBC News": "bbc.com", "Al Jazeera": "aljazeera.com",
    "NPR": "npr.org", "Forbes": "forbes.com", "TechCrunch": "techcrunch.com", "The Verge": "theverge.com",
    "The Washington Post": "washingtonpost.com", "Politico": "politico.com", "ABC News": "abcnews.go.com",
    "USA Today": "usatoday.com", "Bloomberg": "bloomberg.com", "The Hill": "thehill.com",
    "Wired": "wired.com", "Axios": "axios.com", "Vox": "vox.com",
  };

  const domain = publisherDomains[publisher];
  if (!domain) return null;

  try {
    const searchUrl = `https://www.${domain}/search?q=${encodeURIComponent(title.substring(0, 80))}`;
    const resp = await fetch(searchUrl, {
      headers: { "User-Agent": "NWS360/1.0 (RSS Reader)" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    const articleLinks = Array.from(html.matchAll(/href="(https?:\/\/[^"]*(?:\/\d{4}\/\d{2}\/|\/article|\/story|\/news\/)[^"]+)"/g));
    for (const match of articleLinks.slice(0, 3)) {
      const articleUrl = match[1];
      if (articleUrl.includes("search") || articleUrl.includes("javascript")) continue;
      const image = await fetchOgImageDirect(articleUrl);
      if (image) {
        return { url: articleUrl, image };
      }
    }
  } catch {}

  return null;
}

export async function fetchInstagramFeed(input: string): Promise<ScrapedArticle[]> {
  let username = input.trim();
  const igMatch = username.match(/(?:instagram\.com)\/([A-Za-z0-9._]+)/);
  if (igMatch) {
    username = igMatch[1];
  }
  username = username.replace(/^@/, "").replace(/\/$/, "");

  console.log(`[Instagram] Fetching profile: ${username}`);

  const rssBridges = [
    `https://rsshub.app/instagram/user/${username}`,
    `https://rss.app/feeds/v1.1/instagram-${username}.xml`,
  ];

  for (const bridgeUrl of rssBridges) {
    try {
      console.log(`[Instagram] Trying RSS bridge: ${bridgeUrl}`);
      const response = await fetch(bridgeUrl, {
        headers: { "User-Agent": "NWS360/1.0 (RSS Reader)" },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) continue;

      const xml = await response.text();
      if (!xml.includes("<item>") && !xml.includes("<entry>")) continue;

      const $ = cheerio.load(xml, { xmlMode: true });
      const articles: ScrapedArticle[] = [];

      $("item, entry").each((_, el) => {
        if (articles.length >= 20) return false;
        const $item = $(el);
        const title = $item.find("title").text().trim();
        const link = $item.find("link").text().trim() || $item.find("link").attr("href") || "";
        const description = $item.find("description, content, summary").text().trim();
        const pubDate = $item.find("pubDate, published, updated").text().trim();

        if (!title && !description) return;

        let image: string | undefined;
        const enclosure = $item.find("enclosure[type^='image']").first();
        if (enclosure.length) image = enclosure.attr("url");
        if (!image) {
          const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (imgMatch) image = imgMatch[1];
        }

        articles.push({
          title: title || description.substring(0, 150),
          url: link || `https://www.instagram.com/${username}`,
          content: description || title,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          image,
        });
      });

      if (articles.length > 0) {
        console.log(`[Instagram] Got ${articles.length} posts from RSS bridge`);
        return articles;
      }
    } catch (e) {
      console.log(`[Instagram] Bridge failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
  }

  console.log(`[Instagram] Trying profile page scraping for ${username}`);
  try {
    const response = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const html = await response.text();
    const articles: ScrapedArticle[] = [];

    const jsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const jsonData = JSON.parse(jsonMatch[1]);
        if (jsonData.description) {
          articles.push({
            title: `${username}'s latest post`,
            url: `https://www.instagram.com/${username}/`,
            content: jsonData.description,
            publishedAt: new Date(),
          });
        }
      } catch {}
    }

    const postLinks = html.match(/\/p\/([A-Za-z0-9_-]+)\//g);
    if (postLinks) {
      const uniqueLinks = Array.from(new Set(postLinks)).slice(0, 20);
      for (const postPath of uniqueLinks) {
        const postUrl = `https://www.instagram.com${postPath}`;
        if (articles.some(a => a.url === postUrl)) continue;
        articles.push({
          title: `Post by @${username}`,
          url: postUrl,
          content: `Instagram post by @${username}`,
          publishedAt: new Date(),
        });
      }
    }

    console.log(`[Instagram] Scraped ${articles.length} posts`);
    return articles;
  } catch (e) {
    console.error(`[Instagram] Scraping failed:`, e);
    return [];
  }
}

const NITTER_INSTANCES = [
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.net",
  "https://nitter.cz",
];

export async function fetchTwitterFeed(username: string): Promise<ScrapedArticle[]> {
  let handle = username.trim();
  handle = handle.replace(/^@/, "");
  const urlMatch = handle.match(/(?:https?:\/\/)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)/);
  if (urlMatch) {
    handle = urlMatch[1];
  }
  handle = handle.replace(/\/$/, "").split("/")[0];

  for (const instance of NITTER_INSTANCES) {
    try {
      const rssUrl = `${instance}/${handle}/rss`;
      console.log(`[Twitter] Trying nitter RSS: ${rssUrl}`);

      const response = await fetch(rssUrl, {
        headers: {
          "User-Agent": "NWS360/1.0 (RSS Reader)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) continue;

      const xml = await response.text();
      if (!xml.includes("<item>") && !xml.includes("<entry>")) continue;

      const $ = cheerio.load(xml, { xmlMode: true });
      const articles: ScrapedArticle[] = [];

      $("item").each((_, el) => {
        if (articles.length >= 20) return false;

        const $item = $(el);
        const title = $item.find("title").text().trim();
        const link = $item.find("link").text().trim() || $item.find("guid").text().trim();
        const description = $item.find("description").text().trim();
        const pubDate = $item.find("pubDate").text().trim();

        if (!title && !description) return;

        const tweetUrl = link.replace(instance, "https://x.com");

        let image: string | undefined;
        const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) image = imgMatch[1];

        articles.push({
          title: title || description.substring(0, 100),
          url: tweetUrl,
          content: description || title,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          image,
        });
      });

      if (articles.length > 0) {
        console.log(`[Twitter] Got ${articles.length} tweets from ${instance}/${handle}`);
        return articles;
      }
    } catch (e) {
      console.log(`[Twitter] Failed with ${instance}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
  }

  console.log(`[Twitter] Falling back to scraping x.com/${handle}`);
  try {
    return await scrapeTwitterProfile(handle);
  } catch (e) {
    console.error(`[Twitter] Scrape fallback failed:`, e);
    return [];
  }
}

async function scrapeTwitterProfile(handle: string): Promise<ScrapedArticle[]> {
  const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const articles: ScrapedArticle[] = [];

    $("[data-tweet-id], .timeline-Tweet").each((_, el) => {
      if (articles.length >= 20) return false;

      const $tweet = $(el);
      const tweetId = $tweet.attr("data-tweet-id");
      const text = $tweet.find(".timeline-Tweet-text, .tweet-text, p").first().text().trim();
      const timeEl = $tweet.find("time").first();
      const datetime = timeEl.attr("datetime");

      if (!text) return;

      let image: string | undefined;
      const imgEl = $tweet.find("img[src]").first();
      if (imgEl.length) {
        const src = imgEl.attr("src") || "";
        if (src.startsWith("http") && !src.includes("emoji") && !src.includes("profile")) image = src;
      }

      articles.push({
        title: text.substring(0, 200),
        url: tweetId ? `https://x.com/${handle}/status/${tweetId}` : `https://x.com/${handle}`,
        content: text,
        publishedAt: datetime ? new Date(datetime) : new Date(),
        image,
      });
    });

    return articles;
  } catch {
    return [];
  }
}

export async function fetchTelegramFeed(input: string): Promise<ScrapedArticle[]> {
  let channel = input.trim();
  
  const telegramMatch = channel.match(/(?:t\.me|telegram\.me)\/(?:s\/)?([^\/\?]+)/i);
  if (telegramMatch) {
    channel = telegramMatch[1];
  }
  channel = channel.replace(/^@/, "");
  
  if (!channel) return [];

  try {
    const url = `https://t.me/s/${channel}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const articles: ScrapedArticle[] = [];

    $(".tgme_widget_message_wrap").each((_, el) => {
      const $msg = $(el);
      const text = $msg.find(".tgme_widget_message_text").text().trim();
      const timeEl = $msg.find("time");
      const datetime = timeEl.attr("datetime");
      const linkEl = $msg.find(".tgme_widget_message_date");
      const msgUrl = linkEl.attr("href") || `https://t.me/${channel}`;

      if (!text || text.length < 10) return;

      let image: string | undefined;
      const photoEl = $msg.find(".tgme_widget_message_photo_wrap");
      if (photoEl.length) {
        const style = photoEl.attr("style") || "";
        const bgMatch = style.match(/background-image:\s*url\('([^']+)'\)/);
        if (bgMatch) image = bgMatch[1];
      }
      if (!image) {
        const imgEl = $msg.find("img[src]").first();
        if (imgEl.length) image = imgEl.attr("src");
      }

      articles.push({
        title: text.substring(0, 200),
        url: msgUrl,
        content: text,
        publishedAt: datetime ? new Date(datetime) : new Date(),
        image,
      });
    });

    return articles.slice(0, 20);
  } catch {
    return [];
  }
}
