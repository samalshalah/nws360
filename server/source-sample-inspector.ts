import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import RssParser from "rss-parser";
import type { PublisherChannel, Source } from "@shared/schema";
import { getGoogleNewsEdition } from "@shared/google-news-regions";
import { normalizeWebsiteCollectorConfig } from "@shared/source-collector";
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
    redirectCount?: number | null;
    timingMs?: number | null;
    contentType?: string | null;
    approvedAddressFamily?: number | null;
    articleInsertions: 0;
    appearancesCreated: 0;
    rejectedItemsCreated: 0;
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

function websiteItemsFromHtml(html: string, finalUrl: string, limit: number): OperationalSourceSampleItem[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: OperationalSourceSampleItem[] = [];
  $("article a[href], main a[href], [role='main'] a[href], h1 a[href], h2 a[href], h3 a[href]").each((_, element) => {
    if (items.length >= limit * 3) return false;
    const link = $(element);
    const href = normalizeUrl(link.attr("href") || "", finalUrl);
    if (!href || seen.has(href)) return;
    const container = link.closest("article, section, div, li");
    const title = cleanText(link.attr("aria-label") || link.text() || container.find("h1,h2,h3,h4,[class*='title'],[class*='headline']").first().text());
    if (title.length < 8 || title.length > 500) return;
    const summary = cleanText(container.find("p,[class*='summary'],[class*='excerpt'],[class*='description']").first().text()) || title;
    const published = container.find("time,[datetime]").first().attr("datetime") || container.find("time").first().text();
    const image = normalizeUrl(container.find("img").first().attr("src") || container.find("img").first().attr("data-src") || "", finalUrl);
    const imageTitle = cleanText(container.find("img").first().attr("alt") || container.find("img").first().attr("title")) || null;
    seen.add(href);
    items.push({ title, url: href, content: summary, publishedAt: parseDate(published), image, imageTitle });
  });
  return items;
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
  return config.feedUrl || null;
}

function chooseCollector(source: Source, channel?: PublisherChannel | null): { type: OperationalSourceInspectionResult["collectorType"]; url: string | null; reason?: string } {
  const type = sourceType(source);
  const channelType = String(channel?.channelType || "").toLowerCase();
  const feedUrl = sourceFeedUrl(source);
  if (MANUAL_CHANNEL_TYPES.has(channelType)) return { type: "manual", url: null, reason: "manual_channel_requires_external_connector" };
  if (type === "google_news") return { type: "google_news", url: googleNewsUrl(source.url || "", source.country) };
  if (SOCIAL_SOURCE_TYPES.has(type) || SOCIAL_SOURCE_TYPES.has(channelType)) {
    if (!feedUrl && !/^https?:\/\/rss\.app\/feeds\//i.test(source.url || "")) {
      return { type: "unsupported", url: null, reason: "social_feed_configuration_required" };
    }
    return { type: "rss_app", url: feedUrl || source.url };
  }
  if (type === "rss" || channelType === "rss") return { type: "rss", url: feedUrl || source.url };
  if (type === "website" || channelType === "website") return { type: "website", url: source.url };
  return { type: "unsupported", url: null, reason: "unsupported_source_type" };
}

function summarizeFailure(source: Source, channel: PublisherChannel | null | undefined, collectorType: OperationalSourceInspectionResult["collectorType"], identity: string, reason: string, error?: unknown): OperationalSourceInspectionResult {
  const errorCode = error ? safeNetworkErrorCode(error) : reason;
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
      articleInsertions: 0,
      appearancesCreated: 0,
      rejectedItemsCreated: 0,
      processingJobsCreated: 0,
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
  const identity = sourceValidationIdentity(source, channel || null);
  const chosen = chooseCollector(source, channel);
  if (!chosen.url) return summarizeFailure(source, channel, chosen.type, identity, chosen.reason || "source_url_required");

  const fetchText = options.fetchText || fetchPublicUrlText;
  const fetchDeps: ChannelValidatorDeps = {
    resolveHost: options.resolveHost,
    requestUrl: options.requestUrl,
    timeoutMs: options.timeoutMs ?? 8000,
    maxRedirects: options.maxRedirects ?? 3,
    maxBytes: options.maxBytes ?? 256 * 1024,
  };

  try {
    let fetched: SafeTextFetchResult;
    let rawItems: OperationalSourceSampleItem[] = [];
    let structure = "unknown";
    const requestedUrl = chosen.url;

    if (chosen.type === "rss" || chosen.type === "rss_app" || chosen.type === "google_news") {
      fetched = await fetchText(requestedUrl, { ...fetchDeps, accept: RSS_ACCEPT });
      if (fetched.statusCode < 200 || fetched.statusCode >= 400) throw Object.assign(new Error(`HTTP ${fetched.statusCode}`), { code: `http_${fetched.statusCode}` });
      const feed = await parser.parseString(fetched.text);
      rawItems = mapFeedItems(feed, fetched.finalUrl, { googleNews: chosen.type === "google_news" });
      structure = /<feed[\s>]/i.test(fetched.text) ? "atom" : "rss";
    } else {
      fetched = await fetchText(requestedUrl, { ...fetchDeps, accept: HTML_ACCEPT });
      if (fetched.statusCode < 200 || fetched.statusCode >= 400) throw Object.assign(new Error(`HTTP ${fetched.statusCode}`), { code: `http_${fetched.statusCode}` });
      const config = normalizeWebsiteCollectorConfig(source.collectorConfig);
      if (config.strategy !== "scrape") {
        for (const feedUrl of rssAlternateUrls(fetched.text, fetched.finalUrl, config.feedUrl)) {
          try {
            const feedFetched = await fetchText(feedUrl, { ...fetchDeps, accept: RSS_ACCEPT });
            if (feedFetched.statusCode < 200 || feedFetched.statusCode >= 400) continue;
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
        rawItems = websiteItemsFromHtml(fetched.text, fetched.finalUrl, limit);
        structure = "html_links";
      }
    }

    rawItems.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const { accepted, filteredOutCount } = applySourceFilter(rawItems, source, limit);
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
        redirectCount: fetched.redirectCount,
        timingMs: fetched.elapsedMs,
        contentType: fetched.contentType,
        approvedAddressFamily: fetched.approvedAddressFamily,
        articleInsertions: 0,
        appearancesCreated: 0,
        rejectedItemsCreated: 0,
        processingJobsCreated: 0,
      },
      items: accepted.slice(0, limit).map((item) => ({
        ...item,
        title: cleanText(item.title).slice(0, 500),
        content: cleanText(item.content).slice(0, 2000),
        url: sanitizeUrlForEvidence(item.url),
      })),
      warnings: accepted.length === 0 ? ["no_items_after_source_filters"] : [],
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
