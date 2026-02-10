import * as cheerio from "cheerio";

interface ScrapedArticle {
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  image?: string;
}

function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function extractBaseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url;
  }
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

      seenUrls.add(fullUrl);
      articles.push({
        title,
        url: fullUrl,
        content: content || title,
        publishedAt,
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

  return articles.slice(0, 20);
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

        articles.push({
          title: title || description.substring(0, 100),
          url: tweetUrl,
          content: description || title,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
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

      articles.push({
        title: text.substring(0, 200),
        url: tweetId ? `https://x.com/${handle}/status/${tweetId}` : `https://x.com/${handle}`,
        content: text,
        publishedAt: datetime ? new Date(datetime) : new Date(),
      });
    });

    return articles;
  } catch {
    return [];
  }
}
