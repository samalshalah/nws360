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

export async function fetchFacebookFeed(input: string): Promise<ScrapedArticle[]> {
  let pageName = input.trim();
  const fbMatch = pageName.match(/(?:facebook\.com|fb\.com)\/(?:pages\/[^/]+\/|profile\.php\?id=)?([A-Za-z0-9._-]+)/);
  if (fbMatch) {
    pageName = fbMatch[1];
  }
  pageName = pageName.replace(/^@/, "").replace(/\/$/, "");

  console.log(`[Facebook] Fetching page: ${pageName}`);

  const rssBridges = [
    `https://rsshub.app/facebook/page/${pageName}`,
    `https://feedbridge.notifier.in/facebook/${pageName}`,
  ];

  for (const bridgeUrl of rssBridges) {
    try {
      console.log(`[Facebook] Trying RSS bridge: ${bridgeUrl}`);
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
        const description = $item.find("description, content").text().trim();
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
          url: link || `https://www.facebook.com/${pageName}`,
          content: description || title,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          image,
        });
      });

      if (articles.length > 0) {
        console.log(`[Facebook] Got ${articles.length} posts from RSS bridge`);
        return articles;
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

    if (!response.ok) {
      console.log(`[Facebook] mbasic returned ${response.status}`);
      return [];
    }

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

      articles.push({
        title: text.substring(0, 200),
        url: postUrl.replace("mbasic.facebook.com", "www.facebook.com"),
        content: text,
        publishedAt: new Date(),
        image,
      });
    });

    console.log(`[Facebook] Scraped ${articles.length} posts from mbasic`);
    return articles;
  } catch (e) {
    console.error(`[Facebook] Scraping failed:`, e);
    return [];
  }
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
