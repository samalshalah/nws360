import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import RssParser from "rss-parser";
import type { PublisherChannel, Source } from "@shared/schema";
import { getGoogleNewsEdition } from "@shared/google-news-regions";
import { normalizeWebsiteCollectorConfig, type WebsiteCollectorConfig } from "@shared/source-collector";
import { filterSourceItems, normalizeSourceFilterConfig } from "@shared/source-filter";
import {
  fetchPublicUrlText,
  safeNetworkErrorCode,
  sanitizeUrlForEvidence,
  type ChannelValidatorDeps,
  type SafeTextFetchResult,
} from "./publisher-channel-validator";

export type OperationalSourceSampleItem = {
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  language?: string | null;
  image?: string | null;
  imageTitle?: string | null;
  subSource?: string | null;
  externalId?: string | null;
};

export type OperationalSourceInspectionResult = {
  success: boolean;
  collectorType: "rss" | "website" | "rss_app" | "google_news" | "manual" | "unsupported";
  sourceValidationIdentity: string;
  safeSourceFacts: {
    sourceId: number;
    sourceType: string | null;
    channelId?: number | null;
    channelType?: string | null;
    requestedUrl?: string | null;
    finalUrl?: string | null;
    statusCode?: number | null;
    collectorType: string;
    structure: string;
    rawItemCount: number;
    itemCount: number;
    filteredOutCount: number;
    retentionDays?: number | null;
    retentionCutoff?: string | null;
    retentionEligibleSampleCount?: number;
    retentionRejectedSampleCount?: number;
    redirectCount?: number | null;
    timingMs?: number | null;
    contentType?: string | null;
    approvedAddressFamily?: number | null;
    bytesRead?: number | null;
    responseTruncated?: boolean | null;
    declaredContentLength?: number | null;
    articleInsertions: 0;
    appearancesCreated: 0;
    rejectedItemsCreated: 0;
    sourceFetchLogsCreated: 0;
    processingJobsCreated: 0;
  };
  items: OperationalSourceSampleItem[];
  warnings: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type OperationalSourceInspectionDeps = ChannelValidatorDeps & {
  fetchText?: (url: string, deps: ChannelValidatorDeps & { accept?: string }) => Promise<SafeTextFetchResult>;
};

const parser = new RssParser({
  timeout: 8000,
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
      ["source", "source"],
      ["guid", "guid"],
    ],
  },
});

const RSS_ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5";
const HTML_ACCEPT = "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml;q=0.8, */*;q=0.5";
const DEFAULT_STRICT_FETCH_BYTES = 256 * 1024;
const HTML_INSPECTION_MAX_BYTES = 1024 * 1024;
const MAX_JSON_LD_SCRIPT_BYTES = 96 * 1024;
const MAX_JSON_LD_TOTAL_BYTES = 192 * 1024;
const DEFAULT_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;
const SOCIAL_SOURCE_TYPES = new Set(["facebook", "twitter", "x", "instagram", "telegram", "youtube", "tiktok", "linkedin"]);
const MANUAL_CHANNEL_TYPES = new Set(["television", "radio", "podcast", "other"]);

function stableJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function publicCollectorConfig(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value ?? null;
  const blocked = new Set(["password", "token", "secret", "apiKey", "api_key", "authorization", "headers", "cookie", "cookies"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !blocked.has(key)));
}

export function sourceValidationIdentity(source: Source, channel?: PublisherChannel | null): string {
  const payload = {
    sourceId: source.id,
    sourceIdentityKey: source.sourceIdentityKey || null,
    sourceUrl: source.url || null,
    sourceType: source.type || null,
    collectorConfig: publicCollectorConfig(source.collectorConfig),
    filterConfig: source.filterConfig || null,
    publisherChannelId: source.publisherChannelId || null,
    intervalMinutes: source.intervalMinutes || null,
    maxArticlesPerFetch: source.maxArticlesPerFetch || null,
    retentionDays: source.retentionDays || null,
    refreshPriority: source.refreshPriority || null,
    sourceCreatedAt: source.createdAt instanceof Date ? source.createdAt.toISOString() : source.createdAt || null,
    channel: channel ? {
      id: channel.id,
      publisherProfileId: channel.publisherProfileId,
      channelType: channel.channelType,
      normalizedUrl: channel.normalizedUrl || null,
      url: channel.url || null,
      externalId: channel.externalId || null,
      handle: channel.handle || null,
      validationStatus: channel.validationStatus || null,
      verificationStatus: channel.verificationStatus || null,
      lifecycleStatus: channel.lifecycleStatus || null,
      updatedAt: channel.updatedAt instanceof Date ? channel.updatedAt.toISOString() : channel.updatedAt || null,
    } : null,
  };
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function cleanText(value: unknown): string {
  return String(value || "")
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

function normalizeUrl(value: unknown, baseUrl?: string): string | null {
  try {
    const parsed = new URL(String(value || ""), baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) parsed.searchParams.delete(key);
    }
    return sanitizeUrlForEvidence(parsed.toString());
  } catch {
    return null;
  }
}

function parseDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000) return date;
  return new Date();
}

function normalizeRetentionDays(value: number | null | undefined): number {
  if (!Number.isFinite(value || NaN)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(1, Math.round(value as number)));
}

function retentionEvidence(items: OperationalSourceSampleItem[], source: Source, nowMs = Date.now()) {
  const retentionDays = normalizeRetentionDays(source.retentionDays);
  const cutoff = new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000);
  const retentionEligibleSampleCount = items.filter((item) => (
    item.publishedAt instanceof Date
    && !Number.isNaN(item.publishedAt.getTime())
    && item.publishedAt.getTime() <= nowMs + 24 * 60 * 60 * 1000
    && item.publishedAt.getTime() >= cutoff.getTime()
  )).length;
  return {
    retentionDays,
    retentionCutoff: cutoff.toISOString(),
    retentionEligibleSampleCount,
    retentionRejectedSampleCount: Math.max(0, items.length - retentionEligibleSampleCount),
  };
}

function imageFromRss(item: any, baseUrl: string): string | null {
  const candidates = [item.mediaContent, item.mediaThumbnail, item.mediaGroup, item.enclosure, item.image];
  for (const candidate of candidates) {
    for (const value of Array.isArray(candidate) ? candidate : [candidate]) {
      if (!value) continue;
      const raw = typeof value === "object" ? value.url || value.href || value.$?.url || value.$?.href : value;
      const type = typeof value === "object" ? String(value.type || value.$?.type || "") : "";
      const normalized = normalizeUrl(raw, baseUrl);
      if (normalized && (!type || type.startsWith("image"))) return normalized;
    }
  }
  const encoded = String(item.contentEncoded || item.content || "");
  const match = encoded.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
  return match ? normalizeUrl(match[1], baseUrl) : null;
}

function imageTitleFromRss(item: any): string | null {
  const candidates = [item.mediaContent, item.mediaThumbnail, item.mediaGroup, item.enclosure, item.image];
  for (const candidate of candidates) {
    for (const value of Array.isArray(candidate) ? candidate : [candidate]) {
      if (!value || typeof value !== "object") continue;
      const title = cleanText(value.title || value.caption || value.description || value.$?.title || value.$?.alt);
      if (title) return title;
    }
  }
  const encoded = String(item.contentEncoded || item.content || "");
  return cleanText(encoded.match(/<img[^>]+(?:alt|title)=["']([^"']+)["']/i)?.[1]) || null;
}

function extractGoogleNewsSubSource(item: any): string | null {
  if (item.source) {
    if (typeof item.source === "string") return cleanText(item.source) || null;
    const text = item.source._ || item.source.$t || item.source.$text;
    if (text) return cleanText(text) || null;
  }
  const rawTitle = cleanText(item.title || "");
  const dashIndex = rawTitle.lastIndexOf(" - ");
  return dashIndex > 0 ? rawTitle.slice(dashIndex + 3).trim() : null;
}

function cleanGoogleNewsTitle(title: string, subSource?: string | null): string {
  if (!subSource) return title;
  const suffix = ` - ${subSource}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

function mapFeedItems(feed: any, finalUrl: string, options: { googleNews?: boolean } = {}): OperationalSourceSampleItem[] {
  return (feed.items || []).map((item: any) => {
    const subSource = options.googleNews ? extractGoogleNewsSubSource(item) : null;
    const rawTitle = cleanText(item.title || "Untitled");
    const title = options.googleNews ? cleanGoogleNewsTitle(rawTitle, subSource) : rawTitle;
    const url = normalizeUrl(item.link || item.guid || "", finalUrl) || "";
    return {
      title,
      url,
      content: cleanText(item.contentEncoded || item.content || item.contentSnippet || item.summary || item.title || ""),
      publishedAt: parseDate(item.isoDate || item.pubDate),
      image: imageFromRss(item, finalUrl),
      imageTitle: imageTitleFromRss(item),
      subSource,
      externalId: typeof item.guid === "string" ? item.guid : item.guid?._ || null,
    };
  }).filter((item: OperationalSourceSampleItem) => item.url && item.title.length >= 3);
}

function selectorConfigurationError(field: string, error?: unknown) {
  return Object.assign(new Error(`Invalid website selector configuration for ${field}.`), {
    code: "invalid_selector_configuration",
    cause: error,
  });
}

function safeSelect($: ReturnType<typeof cheerio.load>, selector: string, field: string) {
  try {
    return $(selector);
  } catch (error) {
    throw selectorConfigurationError(field, error);
  }
}

function safeFind(scope: cheerio.Cheerio<any>, selector: string, field: string) {
  try {
    return scope.find(selector);
  } catch (error) {
    throw selectorConfigurationError(field, error);
  }
}

function firstSrcsetUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.split(",")[0]?.trim().split(/\s+/)[0] || "";
}

function textFromElement(element: cheerio.Cheerio<any>): string {
  return cleanText(
    element.attr("aria-label")
    || element.attr("title")
    || element.attr("alt")
    || element.attr("content")
    || element.text(),
  );
}

function dateFromElement(element: cheerio.Cheerio<any>): string {
  return cleanText(element.attr("datetime") || element.attr("content") || element.attr("title") || element.text());
}

function imageUrlFromElement(element: cheerio.Cheerio<any>, finalUrl: string): string | null {
  return normalizeUrl(
    element.attr("src")
    || element.attr("data-src")
    || element.attr("data-original")
    || firstSrcsetUrl(element.attr("srcset")),
    finalUrl,
  );
}

function dedupeItems(items: OperationalSourceSampleItem[], limit: number): OperationalSourceSampleItem[] {
  const seen = new Set<string>();
  const result: OperationalSourceSampleItem[] = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    result.push(item);
    if (result.length >= limit * 3) break;
  }
  return result;
}

function jsonLdArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function jsonLdString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return jsonLdString(record["@id"] || record.url || record.name || record.text);
  }
  return "";
}

function jsonLdTypes(value: unknown): string[] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return jsonLdArray(record["@type"]).map((type) => String(type || "").toLowerCase());
}

function flattenJsonLd(value: unknown, result: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 4 || result.length >= 80) return result;
  for (const item of jsonLdArray(value)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    result.push(record);
    if (record["@graph"]) flattenJsonLd(record["@graph"], result, depth + 1);
    if (record.mainEntity) flattenJsonLd(record.mainEntity, result, depth + 1);
    if (record.itemListElement) flattenJsonLd(record.itemListElement, result, depth + 1);
  }
  return result;
}

function jsonLdImage(value: unknown, finalUrl: string): string | null {
  for (const candidate of jsonLdArray(value)) {
    const raw = typeof candidate === "string" ? candidate : jsonLdString(candidate);
    const normalized = normalizeUrl(raw, finalUrl);
    if (normalized) return normalized;
  }
  return null;
}

function structuredArticlesFromJsonLd($: ReturnType<typeof cheerio.load>, finalUrl: string, limit: number): OperationalSourceSampleItem[] {
  const items: OperationalSourceSampleItem[] = [];
  let totalBytes = 0;
  $("script[type='application/ld+json']").each((_, element) => {
    if (items.length >= limit * 3 || totalBytes >= MAX_JSON_LD_TOTAL_BYTES) return false;
    const raw = $(element).contents().text().trim();
    const bytes = Buffer.byteLength(raw);
    if (!raw || bytes > MAX_JSON_LD_SCRIPT_BYTES || totalBytes + bytes > MAX_JSON_LD_TOTAL_BYTES) return;
    totalBytes += bytes;
    try {
      for (const record of flattenJsonLd(JSON.parse(raw))) {
        if (items.length >= limit * 3) break;
        const types = jsonLdTypes(record);
        if (!types.some((type) => ["newsarticle", "article", "blogposting"].includes(type))) continue;
        const title = cleanText(record.headline || record.name);
        const url = normalizeUrl(jsonLdString(record.url || record.mainEntityOfPage), finalUrl);
        if (!title || title.length < 8 || !url) continue;
        items.push({
          title,
          url,
          content: cleanText(record.description || record.articleBody || title),
          publishedAt: parseDate(record.datePublished || record.dateModified),
          image: jsonLdImage(record.image, finalUrl),
          imageTitle: null,
        });
      }
    } catch {
      return;
    }
  });
  return dedupeItems(items, limit);
}

function configuredSelectorItems(
  $: ReturnType<typeof cheerio.load>,
  finalUrl: string,
  limit: number,
  selectors: NonNullable<WebsiteCollectorConfig["selectors"]>,
): OperationalSourceSampleItem[] {
  if (!selectors.item) return [];
  const items: OperationalSourceSampleItem[] = [];
  safeSelect($, selectors.item, "item").each((_, element) => {
    if (items.length >= limit * 3) return false;
    const container = $(element);
    const link = selectors.link
      ? safeFind(container, selectors.link, "link").first()
      : container.is("a[href]")
        ? container
        : container.find("a[href]").first();
    const href = normalizeUrl(link.attr("href") || "", finalUrl);
    if (!href) return;
    const titleElement = selectors.title ? safeFind(container, selectors.title, "title").first() : container.find("h1,h2,h3,h4,[class*='title'],[class*='headline']").first();
    const summaryElement = selectors.summary ? safeFind(container, selectors.summary, "summary").first() : container.find("p,[class*='summary'],[class*='excerpt'],[class*='description']").first();
    const imageElement = selectors.image ? safeFind(container, selectors.image, "image").first() : container.find("img").first();
    const dateElement = selectors.date ? safeFind(container, selectors.date, "date").first() : container.find("time,[datetime]").first();
    const title = cleanText(textFromElement(titleElement) || textFromElement(link));
    if (title.length < 8 || title.length > 500) return;
    const summary = cleanText(textFromElement(summaryElement)) || title;
    items.push({
      title,
      url: href,
      content: summary,
      publishedAt: parseDate(dateFromElement(dateElement)),
      image: imageUrlFromElement(imageElement, finalUrl),
      imageTitle: cleanText(imageElement.attr("alt") || imageElement.attr("title")) || null,
    });
  });
  return dedupeItems(items, limit);
}

const NAV_TEXT_RE = /^(home|homepage|about|contact|privacy|terms|login|log in|sign in|sign up|register|registration|search|menu|category|categories|section|sections|tag|tags|author|authors|share|shares|subscribe|advertise|archive|archives|rss|feed|facebook|twitter|x|instagram|youtube|telegram|linkedin|english|arabic|kurdish|read more|more|more news|latest|all news|عربي|العربية|كوردی|فارسی)$/i;
const UTILITY_SEGMENTS = new Set(["about", "contact", "privacy", "terms", "login", "signin", "signup", "register", "registration", "search", "tag", "tags", "author", "authors", "category", "categories", "section", "sections", "archive", "archives", "page", "pages"]);
const LANGUAGE_SEGMENTS = new Set(["ar", "en", "ku", "ckb", "fr", "fa", "tr"]);
const SOCIAL_HOST_RE = /(^|\.)((facebook|fb|instagram|twitter|x|youtube|youtu|tiktok|telegram|t|linkedin|whatsapp)\.com|youtu\.be|t\.me)$/i;
const STATIC_ASSET_RE = /\.(?:avif|bmp|css|csv|docx?|gif|ico|jpe?g|js|json|mp3|mp4|pdf|png|svg|txt|webm|webp|xlsx?|xml|zip)$/i;
const ARTICLE_SIGNAL_RE = /(?:news|article|story|stories|press|release|releases|media|public-release|politic|econom|business|security|iraq|kurdistan|government|statement|announcement)/i;
const DATE_OR_ID_RE = /(?:\/(?:19|20)\d{2}(?:[\/-]|\b)|\/\d{4,}(?:[\/.-]|$)|[a-f0-9]{10,})/i;

function normalizedHost(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function samePublisherDomain(candidateUrl: string, finalUrl: string): boolean {
  const candidate = normalizedHost(candidateUrl);
  const base = normalizedHost(finalUrl);
  return Boolean(candidate && base && (candidate === base || candidate.endsWith(`.${base}`) || base.endsWith(`.${candidate}`)));
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").map((part) => {
    try {
      return decodeURIComponent(part).trim().toLowerCase();
    } catch {
      return part.trim().toLowerCase();
    }
  }).filter(Boolean);
}

function isUtilityArticleUrl(urlValue: string, title: string): boolean {
  try {
    const parsed = new URL(urlValue);
    const segments = pathSegments(parsed);
    if (parsed.hash || segments.length === 0) return true;
    if (SOCIAL_HOST_RE.test(parsed.hostname)) return true;
    if (STATIC_ASSET_RE.test(parsed.pathname)) return true;
    if (NAV_TEXT_RE.test(title)) return true;
    if (segments.length === 1 && LANGUAGE_SEGMENTS.has(segments[0])) return true;
    const nonLanguageSegments = segments.filter((segment) => !LANGUAGE_SEGMENTS.has(segment));
    if (nonLanguageSegments.length <= 2 && nonLanguageSegments.some((segment) => UTILITY_SEGMENTS.has(segment))) return true;
    if (nonLanguageSegments.length <= 1 && nonLanguageSegments.some((segment) => /^(news|media|press|releases|stories|articles)$/i.test(segment))) return true;
    return false;
  } catch {
    return true;
  }
}

function articleLinkScore(item: OperationalSourceSampleItem, finalUrl: string, container: cheerio.Cheerio<any>): number {
  let score = 0;
  if (samePublisherDomain(item.url, finalUrl)) score += 2;
  try {
    const parsed = new URL(item.url);
    if (ARTICLE_SIGNAL_RE.test(parsed.pathname)) score += 3;
    if (DATE_OR_ID_RE.test(parsed.pathname)) score += 2;
  } catch {
    return -20;
  }
  if (container.is("article") || container.closest("article").length) score += 2;
  if (container.find("time,[datetime]").length) score += 1;
  if (cleanText(item.content) && item.content !== item.title) score += 1;
  if (item.title.length >= 28) score += 1;
  if (!samePublisherDomain(item.url, finalUrl)) score -= 4;
  if (isUtilityArticleUrl(item.url, item.title)) score -= 10;
  return score;
}

function genericItemsFromHtml($: ReturnType<typeof cheerio.load>, finalUrl: string, limit: number): OperationalSourceSampleItem[] {
  const seen = new Set<string>();
  const candidates: Array<{ score: number; item: OperationalSourceSampleItem }> = [];
  $("article a[href], main a[href], [role='main'] a[href], [class*='news'] a[href], [class*='article'] a[href], [class*='story'] a[href], [class*='card'] a[href], h1 a[href], h2 a[href], h3 a[href]").each((_, element) => {
    if (candidates.length >= limit * 8) return false;
    const link = $(element);
    const href = normalizeUrl(link.attr("href") || "", finalUrl);
    if (!href || seen.has(href)) return;
    const container = link.closest("article, section, div, li");
    const title = cleanText(link.attr("aria-label") || link.text() || container.find("h1,h2,h3,h4,[class*='title'],[class*='headline']").first().text());
    if (title.length < 8 || title.length > 500) return;
    const summary = cleanText(container.find("p,[class*='summary'],[class*='excerpt'],[class*='description']").first().text()) || title;
    const published = container.find("time,[datetime]").first().attr("datetime") || container.find("time").first().text();
    const image = imageUrlFromElement(container.find("img").first(), finalUrl);
    const imageTitle = cleanText(container.find("img").first().attr("alt") || container.find("img").first().attr("title")) || null;
    const item = { title, url: href, content: summary, publishedAt: parseDate(published), image, imageTitle };
    const score = articleLinkScore(item, finalUrl, container);
    if (score < 3) return;
    seen.add(href);
    candidates.push({ score, item });
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((candidate) => candidate.item).slice(0, limit * 3);
}

function websiteItemsFromHtml(html: string, finalUrl: string, limit: number, selectors?: WebsiteCollectorConfig["selectors"]): OperationalSourceSampleItem[] {
  const $ = cheerio.load(html);
  const structured = structuredArticlesFromJsonLd($, finalUrl, limit);
  if (selectors?.item) {
    return dedupeItems([...structured, ...configuredSelectorItems($, finalUrl, limit, selectors)], limit);
  }
  return dedupeItems([...structured, ...genericItemsFromHtml($, finalUrl, limit)], limit);
}

function rssAlternateUrls(html: string, finalUrl: string, configuredFeedUrl?: string | null): string[] {
  const $ = cheerio.load(html);
  const candidates = new Set<string>();
  if (configuredFeedUrl) candidates.add(configuredFeedUrl);
  $('link[rel~="alternate"]').each((_, element) => {
    const type = String($(element).attr("type") || "").toLowerCase();
    if (!/(rss|atom|xml)/.test(type)) return;
    const href = normalizeUrl($(element).attr("href") || "", finalUrl);
    if (href) candidates.add(href);
  });
  return Array.from(candidates).slice(0, 5);
}

function googleNewsUrl(query: string, country?: string | null): string {
  const edition = getGoogleNewsEdition(country);
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${encodeURIComponent(edition.locale)}&gl=${edition.code}&ceid=${edition.code}:${edition.language}`;
}

function sourceType(source: Source): string {
  return String(source.type || "").toLowerCase();
}

function sourceFeedUrl(source: Source): string | null {
  const config = normalizeWebsiteCollectorConfig(source.collectorConfig);
  if (/^https?:\/\/rss\.app\/feeds\//i.test(config.feedUrl || "")) return null;
  return config.feedUrl || null;
}

function chooseCollector(source: Source, channel?: PublisherChannel | null): { type: OperationalSourceInspectionResult["collectorType"]; url: string | null; reason?: string } {
  const type = sourceType(source);
  const channelType = String(channel?.channelType || "").toLowerCase();
  const feedUrl = sourceFeedUrl(source);
  if (MANUAL_CHANNEL_TYPES.has(channelType)) return { type: "manual", url: null, reason: "manual_channel_requires_external_connector" };
  if (type === "google_news") return { type: "google_news", url: googleNewsUrl(source.url || "", source.country) };
  if (SOCIAL_SOURCE_TYPES.has(type) || SOCIAL_SOURCE_TYPES.has(channelType)) {
    return { type: "unsupported", url: null, reason: "supported_social_connector_required" };
  }
  if (type === "rss" || channelType === "rss") return { type: "rss", url: feedUrl || source.url };
  if (type === "website" || channelType === "website") return { type: "website", url: source.url };
  return { type: "unsupported", url: null, reason: "unsupported_source_type" };
}

function summarizeFailure(source: Source, channel: PublisherChannel | null | undefined, collectorType: OperationalSourceInspectionResult["collectorType"], identity: string, reason: string, error?: unknown): OperationalSourceInspectionResult {
  const errorCode = error ? safeNetworkErrorCode(error) : reason;
  const retention = retentionEvidence([], source);
  return {
    success: false,
    collectorType,
    sourceValidationIdentity: identity,
    safeSourceFacts: {
      sourceId: source.id,
      sourceType: source.type || null,
      channelId: channel?.id || null,
      channelType: channel?.channelType || null,
      requestedUrl: source.url || null,
      finalUrl: null,
      statusCode: null,
      collectorType,
      structure: "none",
      rawItemCount: 0,
      itemCount: 0,
      filteredOutCount: 0,
      ...retention,
      bytesRead: null,
      responseTruncated: null,
      declaredContentLength: null,
      articleInsertions: 0,
      appearancesCreated: 0,
      rejectedItemsCreated: 0,
      processingJobsCreated: 0,
      sourceFetchLogsCreated: 0,
    },
    items: [],
    warnings: [],
    errorCode,
    errorMessage: reason,
  };
}

function applySourceFilter(items: OperationalSourceSampleItem[], source: Source, limit: number) {
  const config = normalizeSourceFilterConfig(source.filterConfig);
  const accepted = filterSourceItems(items, config).slice(0, limit);
  return { accepted, filteredOutCount: Math.max(0, items.length - filterSourceItems(items, config).length) };
}

export async function inspectOperationalSourceSample(
  source: Source,
  channel?: PublisherChannel | null,
  options: { limit?: number } & OperationalSourceInspectionDeps = {},
): Promise<OperationalSourceInspectionResult> {
  const limit = Math.min(25, Math.max(1, options.limit || 25));
  const nowMs = Date.now();
  const identity = sourceValidationIdentity(source, channel || null);
  const chosen = chooseCollector(source, channel);
  if (!chosen.url) return summarizeFailure(source, channel, chosen.type, identity, chosen.reason || "source_url_required");

  const fetchText = options.fetchText || fetchPublicUrlText;
  const fetchDeps: ChannelValidatorDeps = {
    resolveHost: options.resolveHost,
    requestUrl: options.requestUrl,
    timeoutMs: options.timeoutMs ?? 8000,
    maxRedirects: options.maxRedirects ?? 3,
    maxBytes: options.maxBytes ?? DEFAULT_STRICT_FETCH_BYTES,
    truncateOnLimit: false,
  };
  const htmlFetchDeps: ChannelValidatorDeps = {
    ...fetchDeps,
    maxBytes: Math.min(options.maxBytes ?? HTML_INSPECTION_MAX_BYTES, HTML_INSPECTION_MAX_BYTES),
    truncateOnLimit: true,
  };

  try {
    let fetched: SafeTextFetchResult;
    let rawItems: OperationalSourceSampleItem[] = [];
    let structure = "unknown";
    const warnings: string[] = [];
    const requestedUrl = chosen.url;

    if (chosen.type === "rss" || chosen.type === "rss_app" || chosen.type === "google_news") {
      fetched = await fetchText(requestedUrl, { ...fetchDeps, accept: RSS_ACCEPT });
      if (fetched.statusCode < 200 || fetched.statusCode >= 400) throw Object.assign(new Error(`HTTP ${fetched.statusCode}`), { code: `http_${fetched.statusCode}` });
      const feed = await parser.parseString(fetched.text);
      rawItems = mapFeedItems(feed, fetched.finalUrl, { googleNews: chosen.type === "google_news" });
      structure = /<feed[\s>]/i.test(fetched.text) ? "atom" : "rss";
    } else {
      fetched = await fetchText(requestedUrl, { ...htmlFetchDeps, accept: HTML_ACCEPT });
      if (fetched.statusCode < 200 || fetched.statusCode >= 400) throw Object.assign(new Error(`HTTP ${fetched.statusCode}`), { code: `http_${fetched.statusCode}` });
      if (fetched.truncated) warnings.push("response_truncated");
      const config = normalizeWebsiteCollectorConfig(source.collectorConfig);
      if (config.strategy !== "scrape") {
        for (const feedUrl of rssAlternateUrls(fetched.text, fetched.finalUrl, config.feedUrl)) {
          try {
            const feedFetched = await fetchText(feedUrl, { ...fetchDeps, accept: RSS_ACCEPT });
            if (feedFetched.statusCode < 200 || feedFetched.statusCode >= 400) continue;
            if (feedFetched.truncated) continue;
            const feed = await parser.parseString(feedFetched.text);
            rawItems = mapFeedItems(feed, feedFetched.finalUrl);
            if (rawItems.length) {
              fetched = feedFetched;
              structure = "discovered_rss";
              break;
            }
          } catch {
            continue;
          }
        }
      }
      if (rawItems.length === 0) {
        rawItems = websiteItemsFromHtml(fetched.text, fetched.finalUrl, limit, config.selectors);
        structure = "html_links";
      }
    }

    rawItems.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const { accepted, filteredOutCount } = applySourceFilter(rawItems, source, limit);
    const retention = retentionEvidence(rawItems, source, nowMs);
    return {
      success: true,
      collectorType: chosen.type,
      sourceValidationIdentity: identity,
      safeSourceFacts: {
        sourceId: source.id,
        sourceType: source.type || null,
        channelId: channel?.id || null,
        channelType: channel?.channelType || null,
        requestedUrl: sanitizeUrlForEvidence(requestedUrl),
        finalUrl: fetched.finalUrl,
        statusCode: fetched.statusCode,
        collectorType: chosen.type,
        structure,
        rawItemCount: rawItems.length,
        itemCount: accepted.length,
        filteredOutCount,
        ...retention,
        redirectCount: fetched.redirectCount,
        timingMs: fetched.elapsedMs,
        contentType: fetched.contentType,
        approvedAddressFamily: fetched.approvedAddressFamily,
        bytesRead: fetched.bytesRead,
        responseTruncated: fetched.truncated,
        declaredContentLength: fetched.declaredContentLength,
        articleInsertions: 0,
        appearancesCreated: 0,
        rejectedItemsCreated: 0,
        sourceFetchLogsCreated: 0,
        processingJobsCreated: 0,
      },
      items: accepted.slice(0, limit).map((item) => ({
        ...item,
        title: cleanText(item.title).slice(0, 500),
        content: cleanText(item.content).slice(0, 2000),
        url: sanitizeUrlForEvidence(item.url),
      })),
      warnings: accepted.length === 0 ? [...warnings, "no_items_after_source_filters"] : warnings,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error: any) {
    return {
      ...summarizeFailure(source, channel, chosen.type, identity, error?.message || "source_inspection_failed", error),
      warnings: [],
    };
  }
}
