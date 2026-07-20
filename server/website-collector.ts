import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import RssParser from "rss-parser";
import {
  normalizeWebsiteCollectorConfig,
  type WebsiteCollectorConfig,
} from "@shared/source-collector";

export interface CollectedWebsiteArticle {
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  image?: string;
  imageTitle?: string;
  fullContentExtracted?: boolean;
}

export interface WebsiteCollectionResult {
  method: "rss" | "selectors" | "structured" | "website";
  articles: CollectedWebsiteArticle[];
  feedUrl?: string;
  rendered: boolean;
  warnings: string[];
}

export interface ExtractedArticleContent {
  title?: string;
  content: string;
  excerpt?: string;
  image?: string;
  imageTitle?: string;
  publishedAt?: Date;
  finalUrl: string;
  method: "readability" | "selectors";
}

const parser = new RssParser({
  timeout: 12_000,
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["media:group", "mediaGroup"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 NWS360/1.0",
  "Accept": "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
} as const;

const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const MAX_EXTRACTED_CONTENT_CHARS = 50_000;
const UNWANTED_PATH = /\/(?:login|signin|signup|account|privacy|terms|cookie|contact|about|advertis|subscribe|newsletter|author|tag|search)(?:\/|$)/i;
const ARTICLE_TYPES = new Set(["article", "newsarticle", "reportagenewsarticle", "analysisnewsarticle", "blogposting"]);
const NON_CONTENT_TEXT = /(?:cookie|privacy policy|terms of use|subscribe|newsletter|advertisement|share this|follow us|sign in|sign up|all rights reserved)/i;

function cleanText(value: string): string {
  return value
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

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length).replace(/\s+\S*$/, "")}...`;
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped || (isIP(normalized) === 4 ? normalized : "");
  if (!ipv4) return false;
  const [a, b] = ipv4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function assertPublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS sources are supported");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Private network sources are not supported");
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private network sources are not supported");
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new Error("Source host does not resolve to a public address");
    }
  }
  return url;
}

async function fetchText(value: string, accept: string = REQUEST_HEADERS.Accept, timeoutMs = 15_000): Promise<{ html: string; finalUrl: string }> {
  let current = (await assertPublicUrl(value)).href;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const response = await fetch(current, {
      headers: { ...REQUEST_HEADERS, Accept: accept },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect from ${current} did not include a location`);
      current = (await assertPublicUrl(new URL(location, current).href)).href;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(current).hostname}`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_RESPONSE_BYTES) throw new Error("Source response is too large");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_RESPONSE_BYTES) throw new Error("Source response is too large");
    return { html, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

function normalizeUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(?:utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return null;
  }
}

function samePublisher(value: string, baseUrl: string): boolean {
  try {
    const a = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    const b = new URL(baseUrl).hostname.replace(/^www\./, "").toLowerCase();
    return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
  } catch {
    return false;
  }
}

function imageFromValue(value: unknown, baseUrl: string): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "object" && raw) {
    const object = raw as Record<string, unknown>;
    return imageFromValue(object.url || object.contentUrl || object.$, baseUrl);
  }
  if (typeof raw !== "string" || !raw.trim() || raw.startsWith("data:")) return undefined;
  const normalized = normalizeUrl(raw.trim().split(/\s+/)[0], baseUrl);
  if (!normalized || /(?:pixel|spacer|tracking|1x1)/i.test(normalized)) return undefined;
  return normalized;
}

function imageTitleFromValue(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== "object") return undefined;
  const object = raw as Record<string, unknown>;
  const title = object.caption || object.name || object.alternateName || object.description;
  return typeof title === "string" && cleanText(title) ? cleanText(title) : undefined;
}

function bestSrcset(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  const candidates = value.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  return imageFromValue(candidates[candidates.length - 1], baseUrl);
}

function elementImage($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>, baseUrl: string, selector?: string): string | undefined {
  const target = selector
    ? (element.is(selector) ? element : element.find(selector).first())
    : element.find("img, picture source").first();
  if (!target.length) return undefined;
  return imageFromValue(
    target.attr("src") || target.attr("data-src") || target.attr("data-lazy-src") || target.attr("data-original") || target.attr("content"),
    baseUrl,
  ) || bestSrcset(target.attr("srcset") || target.attr("data-srcset"), baseUrl);
}

function elementImageTitle(element: cheerio.Cheerio<any>, selector?: string): string | undefined {
  let target = selector
    ? (element.is(selector) ? element : element.find(selector).first())
    : element.find("img").first();
  if (target.is("source")) target = target.closest("picture").find("img").first();
  const title = target.attr("alt") || target.attr("title") || target.attr("aria-label");
  return title && cleanText(title) ? cleanText(title) : undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getTime() > Date.now() + 7 * 24 * 60 * 60 * 1000) return undefined;
  return date;
}

function jsonLdNodes(html: string): Record<string, any>[] {
  const $ = cheerio.load(html);
  const output: Record<string, any>[] = [];
  const visit = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object") return;
    output.push(value);
    if (Array.isArray(value["@graph"])) value["@graph"].forEach(visit);
    if (Array.isArray(value.itemListElement)) value.itemListElement.forEach(visit);
    if (value.item && typeof value.item === "object") visit(value.item);
  };
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try { visit(JSON.parse(raw)); } catch {}
  });
  return output;
}

function structuredArticles(html: string, baseUrl: string): CollectedWebsiteArticle[] {
  const output: CollectedWebsiteArticle[] = [];
  for (const node of jsonLdNodes(html)) {
    const rawType = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    const types = rawType.filter((value: unknown) => typeof value === "string").map((value: string) => value.toLowerCase());
    const isArticle = types.some((type: string) => ARTICLE_TYPES.has(type));
    const urlValue = typeof node.url === "object" ? node.url?.["@id"] : node.url || node.mainEntityOfPage?.["@id"] || node["@id"];
    const url = typeof urlValue === "string" ? normalizeUrl(urlValue, baseUrl) : null;
    const title = cleanText(String(node.headline || node.name || ""));
    if (!isArticle || !url || title.length < 10 || !samePublisher(url, baseUrl)) continue;
    output.push({
      title,
      url,
      content: cleanText(String(node.description || node.abstract || title)),
      publishedAt: parseDate(node.datePublished || node.dateCreated) || new Date(),
      image: imageFromValue(node.image || node.thumbnailUrl, baseUrl),
      imageTitle: imageTitleFromValue(node.image),
    });
  }
  return output;
}

function linkFromElement(element: cheerio.Cheerio<any>, selector?: string): cheerio.Cheerio<any> {
  if (selector) return element.is(selector) ? element : element.find(selector).first();
  const headingLink = element.find("h1 a[href], h2 a[href], h3 a[href], h4 a[href], [class*='title'] a[href], [class*='headline'] a[href]").first();
  return headingLink.length ? headingLink : (element.is("a[href]") ? element : element.find("a[href]").first());
}

function articlesFromElements(html: string, baseUrl: string, config: WebsiteCollectorConfig): { method: "selectors" | "website"; articles: CollectedWebsiteArticle[] } {
  const $ = cheerio.load(html);
  const selectors = config.selectors;
  const itemSelector = selectors?.item || [
    "article",
    "main [class*='story']",
    "main [class*='article']",
    "main [class*='post']",
    "main [class*='card']",
    "[role='main'] [class*='story']",
    "[role='main'] [class*='article']",
  ].join(",");
  const articles: CollectedWebsiteArticle[] = [];
  const seen = new Set<string>();

  let elements: cheerio.Cheerio<any>;
  try { elements = $(itemSelector); } catch { return { method: selectors?.item ? "selectors" : "website", articles: [] }; }
  elements.each((_, rawElement) => {
    if (articles.length >= 100) return false;
    const element = $(rawElement);
    let link: cheerio.Cheerio<any>;
    try { link = linkFromElement(element, selectors?.link); } catch { return; }
    const href = link.attr("href");
    const url = href ? normalizeUrl(href, baseUrl) : null;
    if (!url || seen.has(url) || !samePublisher(url, baseUrl) || UNWANTED_PATH.test(new URL(url).pathname)) return;

    let title = "";
    try {
      const titleElement = selectors?.title
        ? (element.is(selectors.title) ? element : element.find(selectors.title).first())
        : element.find("h1, h2, h3, h4, [class*='title'], [class*='headline']").first();
      title = cleanText(titleElement.text() || link.attr("aria-label") || link.text());
    } catch { return; }
    if (title.length < 10 || title.length > 500) return;

    let summary = "";
    let image: string | undefined;
    let imageTitle: string | undefined;
    let publishedAt: Date | undefined;
    try {
      const summaryElement = selectors?.summary
        ? (element.is(selectors.summary) ? element : element.find(selectors.summary).first())
        : element.find("p, [class*='summary'], [class*='description'], [class*='excerpt'], [class*='dek']").first();
      summary = cleanText(summaryElement.text());
      image = elementImage($, element, baseUrl, selectors?.image);
      imageTitle = elementImageTitle(element, selectors?.image);
      const dateElement = selectors?.date
        ? (element.is(selectors.date) ? element : element.find(selectors.date).first())
        : element.find("time, [datetime], [class*='date'], [class*='time']").first();
      publishedAt = parseDate(
        dateElement.attr("datetime")
        || dateElement.attr("content")
        || dateElement.attr("data-published")
        || dateElement.attr("data-date")
        || cleanText(dateElement.text()),
      );
    } catch {}

    seen.add(url);
    articles.push({ title, url, content: summary || title, publishedAt: publishedAt || new Date(), image, imageTitle });
  });

  if (articles.length === 0 && !selectors?.item) {
    $("main a[href], [role='main'] a[href]").each((_, rawLink) => {
      if (articles.length >= 60) return false;
      const link = $(rawLink);
      const url = normalizeUrl(link.attr("href") || "", baseUrl);
      if (!url || seen.has(url) || !samePublisher(url, baseUrl)) return;
      const parsed = new URL(url);
      const title = cleanText(link.attr("aria-label") || link.text());
      const pathDepth = parsed.pathname.split("/").filter(Boolean).length;
      if (title.length < 15 || title.length > 500 || pathDepth < 2 || UNWANTED_PATH.test(parsed.pathname)) return;
      seen.add(url);
      articles.push({
        title,
        url,
        content: title,
        publishedAt: new Date(),
        image: elementImage($, link, baseUrl),
        imageTitle: elementImageTitle(link),
      });
    });
  }

  return { method: selectors?.item ? "selectors" : "website", articles };
}

function deduplicate(articles: CollectedWebsiteArticle[]): CollectedWebsiteArticle[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return articles.filter((article) => {
    const titleKey = article.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!article.url || seenUrls.has(article.url) || seenTitles.has(titleKey)) return false;
    seenUrls.add(article.url);
    seenTitles.add(titleKey);
    return true;
  });
}

function metaContent($: cheerio.CheerioAPI, selectors: string): string | undefined {
  const value = $(selectors).first().attr("content")?.trim();
  return value || undefined;
}

function articleMetadata(html: string, url: string): Partial<CollectedWebsiteArticle> {
  const $ = cheerio.load(html);
  const structured = structuredArticles(html, url).find((item) => normalizeUrl(item.url, url) === normalizeUrl(url, url)) || structuredArticles(html, url)[0];
  const title = cleanText(metaContent($, 'meta[property="og:title"], meta[name="twitter:title"]') || $("h1").first().text() || structured?.title || "");
  const content = cleanText(metaContent($, 'meta[property="og:description"], meta[name="twitter:description"], meta[name="description"]') || structured?.content || $("article p, main p").slice(0, 3).text());
  const image = imageFromValue(
    metaContent($, 'meta[property="og:image:secure_url"], meta[property="og:image"], meta[name="twitter:image"], meta[name="twitter:image:src"]') || structured?.image,
    url,
  );
  const imageTitle = cleanText(
    metaContent($, 'meta[property="og:image:alt"], meta[name="twitter:image:alt"]') || structured?.imageTitle || "",
  ) || undefined;
  const publishedAt = parseDate(metaContent($, 'meta[property="article:published_time"], meta[name="date"], meta[name="pubdate"]')) || structured?.publishedAt;
  return {
    title: title || undefined,
    content: content || undefined,
    image,
    imageTitle,
    publishedAt,
  };
}

function googleNewsPublisherUrl(html: string, baseUrl: string): string | null {
  const baseHost = new URL(baseUrl).hostname.replace(/^www\./, "").toLowerCase();
  if (!baseHost.endsWith("google.com")) return null;
  const $ = cheerio.load(html);
  const candidates = new Map<string, number>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const normalized = normalizeUrl(href, baseUrl);
    if (!normalized) return;
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host.endsWith("google.com") || host.endsWith("gstatic.com") || host.endsWith("googleusercontent.com")) return;
    if (UNWANTED_PATH.test(url.pathname)) return;
    const score = cleanText($(element).text()).length + Math.max(url.pathname.split("/").filter(Boolean).length, 1) * 10;
    candidates.set(normalized, Math.max(candidates.get(normalized) || 0, score));
  });
  return Array.from(candidates.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function paragraphText($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>): string {
  root.find("script, style, noscript, iframe, svg, nav, header, footer, aside, form, button").remove();
  const parts: string[] = [];
  root.find("p, h2, h3, blockquote, li").each((_, element) => {
    const text = cleanText($(element).text());
    if (text.length < 30 || NON_CONTENT_TEXT.test(text)) return;
    parts.push(text);
  });
  return parts.join("\n\n");
}

function fallbackArticleBody(html: string): string {
  const $ = cheerio.load(html);
  const selectors = [
    "article",
    "[role='article']",
    "main article",
    "[class*='article-body']",
    "[class*='article-content']",
    "[class*='story-body']",
    "[class*='story-content']",
    "[class*='entry-content']",
    "[class*='post-content']",
    "main",
  ];

  let best = "";
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const text = paragraphText($, $(element));
      if (text.length > best.length) best = text;
    });
  }
  return cleanText(best);
}

function extractArticleContentFromHtml(html: string, finalUrl: string): ExtractedArticleContent | null {
  const metadata = articleMetadata(html, finalUrl);
  try {
    const dom = new JSDOM(html, { url: finalUrl });
    const article = new Readability(dom.window.document, {
      charThreshold: 180,
      keepClasses: false,
    }).parse();
    const text = cleanText(article?.textContent || "");
    if (text.length >= 180) {
      return {
        title: cleanText(article?.title || "") || metadata.title,
        content: truncate(text, MAX_EXTRACTED_CONTENT_CHARS),
        excerpt: cleanText(article?.excerpt || "") || metadata.content,
        image: metadata.image,
        imageTitle: metadata.imageTitle,
        publishedAt: parseDate(article?.publishedTime || "") || metadata.publishedAt,
        finalUrl,
        method: "readability",
      };
    }
  } catch {}

  const fallback = fallbackArticleBody(html);
  if (fallback.length >= 180) {
    return {
      title: metadata.title,
      content: truncate(fallback, MAX_EXTRACTED_CONTENT_CHARS),
      excerpt: metadata.content,
      image: metadata.image,
      imageTitle: metadata.imageTitle,
      publishedAt: metadata.publishedAt,
      finalUrl,
      method: "selectors",
    };
  }

  return null;
}

export async function extractArticleContent(url: string): Promise<ExtractedArticleContent | null> {
  const first = await fetchText(url, REQUEST_HEADERS.Accept, 12_000);
  let html = first.html;
  let finalUrl = first.finalUrl;

  const publisherUrl = googleNewsPublisherUrl(html, finalUrl);
  if (publisherUrl) {
    try {
      const publisher = await fetchText(publisherUrl, REQUEST_HEADERS.Accept, 12_000);
      html = publisher.html;
      finalUrl = publisher.finalUrl;
    } catch {
      // Keep the Google News page fallback if publisher resolution fails.
    }
  }

  return extractArticleContentFromHtml(html, finalUrl);
}

function feedCandidates(html: string, pageUrl: string, storedFeedUrl?: string): string[] {
  const $ = cheerio.load(html);
  const candidates = new Set<string>();
  if (storedFeedUrl) candidates.add(storedFeedUrl);
  $('link[rel~="alternate"]').each((_, element) => {
    const type = ($(element).attr("type") || "").toLowerCase();
    if (!/(?:rss|atom|xml)/.test(type)) return;
    const value = normalizeUrl($(element).attr("href") || "", pageUrl);
    if (value) candidates.add(value);
  });
  const root = new URL(pageUrl).origin;
  for (const path of ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/feeds/posts/default", "/?feed=rss2"]) {
    candidates.add(new URL(path, root).href);
  }
  return Array.from(candidates).slice(0, 12);
}

function feedImage(item: any, baseUrl: string): string | undefined {
  const candidates = [item.mediaContent, item.mediaThumbnail, item.mediaGroup, item.image, item.enclosure];
  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : [candidate];
    for (const value of values) {
      if (!value) continue;
      const object = typeof value === "object" ? value : {};
      const image = imageFromValue(object.url || object.$?.url || object.href || value, baseUrl);
      const type = String(object.type || object.$?.type || "");
      if (image && (!type || type.startsWith("image"))) return image;
    }
  }
  const encoded = String(item.contentEncoded || item.content || "");
  const match = encoded.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
  return match ? imageFromValue(match[1], baseUrl) : undefined;
}

function feedImageTitle(item: any): string | undefined {
  for (const candidate of [item.mediaContent, item.mediaThumbnail, item.mediaGroup, item.image, item.enclosure]) {
    for (const value of Array.isArray(candidate) ? candidate : [candidate]) {
      if (!value || typeof value !== "object") continue;
      const title = value.title || value.caption || value.description || value.$?.title || value.$?.alt;
      if (typeof title === "string" && cleanText(title)) return cleanText(title);
    }
  }
  const encoded = String(item.contentEncoded || item.content || "");
  const match = encoded.match(/<img[^>]+(?:alt|title)=["']([^"']+)["']/i);
  return match?.[1] ? cleanText(match[1]) : undefined;
}

async function parseFeed(feedUrl: string, limit: number): Promise<CollectedWebsiteArticle[]> {
  const { html: xml, finalUrl } = await fetchText(feedUrl, "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*", 12_000);
  const feed = await parser.parseString(xml);
  const articles = (feed.items || []).map((item) => {
    const url = normalizeUrl(item.link || item.guid || "", finalUrl) || "";
    const title = cleanText(item.title || "Untitled");
    const content = cleanText((item as any).contentEncoded || item.content || item.contentSnippet || item.summary || title);
    return {
      title,
      url,
      content: content || title,
      publishedAt: parseDate(item.isoDate || item.pubDate) || new Date(),
      image: feedImage(item, finalUrl),
      imageTitle: feedImageTitle(item),
    };
  }).filter((item) => item.url && item.title.length >= 5);
  articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return deduplicate(articles).slice(0, limit);
}

async function discoverWorkingFeed(candidates: string[], limit: number): Promise<{ feedUrl: string; articles: CollectedWebsiteArticle[] } | null> {
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    const results = await Promise.all(batch.map(async (feedUrl) => {
      try {
        const articles = await parseFeed(feedUrl, limit);
        return articles.length > 0 ? { feedUrl, articles } : null;
      } catch {
        return null;
      }
    }));
    const winner = results.find(Boolean);
    if (winner) return winner;
  }
  return null;
}

export async function collectWebsite(
  inputUrl: string,
  rawConfig: WebsiteCollectorConfig | null | undefined,
  limit = 10,
): Promise<WebsiteCollectionResult> {
  const config = normalizeWebsiteCollectorConfig(rawConfig);
  const normalized = (await assertPublicUrl(/^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`)).href;
  const warnings: string[] = [];
  const landing = await fetchText(normalized);

  if (config.strategy !== "scrape") {
    const candidates = feedCandidates(landing.html, landing.finalUrl, config.feedUrl);
    const feed = await discoverWorkingFeed(candidates, limit);
    if (feed) {
      return {
        method: "rss",
        articles: feed.articles.slice(0, limit),
        feedUrl: feed.feedUrl,
        rendered: false,
        warnings,
      };
    }
    if (config.strategy === "rss") {
      throw new Error("No working RSS or Atom feed was found for this website");
    }
    warnings.push("No working RSS feed was found; using the website collector.");
  }

  const html = landing.html;
  let structured = structuredArticles(html, landing.finalUrl);
  let extracted = articlesFromElements(html, landing.finalUrl, config);
  const combined = deduplicate([...structured, ...extracted.articles]);
  if (config.renderJavascript) warnings.push("JavaScript rendering is not enabled; static HTML was used.");

  if (combined.length === 0) {
    throw new Error("No article links were detected. Add website collector selectors for this layout.");
  }

  const structuredUrls = new Set(structured.map((article) => article.url));
  const method = config.selectors?.item
    ? "selectors"
    : combined.some((article) => structuredUrls.has(article.url)) ? "structured" : extracted.method;
  combined.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return { method, articles: combined.slice(0, limit), rendered: false, warnings };
}

export async function inspectArticleImage(url: string): Promise<string | undefined> {
  const { html, finalUrl } = await fetchText(url, REQUEST_HEADERS.Accept, 10_000);
  return articleMetadata(html, finalUrl).image;
}

export function extractArticleContentFromHtmlForTest(html: string, url: string): ExtractedArticleContent | null {
  return extractArticleContentFromHtml(html, url);
}

export function collectWebsiteFromHtmlForTest(html: string, baseUrl: string, rawConfig?: WebsiteCollectorConfig): CollectedWebsiteArticle[] {
  const config = normalizeWebsiteCollectorConfig(rawConfig);
  const structured = structuredArticles(html, baseUrl);
  const extracted = articlesFromElements(html, baseUrl, config);
  return deduplicate([...structured, ...extracted.articles]);
}
