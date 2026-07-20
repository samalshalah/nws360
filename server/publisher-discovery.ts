import { load } from "cheerio";
import RssParser from "rss-parser";
import { SOURCE_CATEGORIES, type SourceCategoryCode } from "@shared/source-categories";

export interface DiscoveredPublisherCategory {
  category: SourceCategoryCode;
  label: string;
  url: string;
  type: "rss" | "website";
  confidence: "high" | "medium";
}

interface CategoryDefinition {
  category: SourceCategoryCode;
  aliases: string[];
}

interface CategoryCandidate {
  category: SourceCategoryCode;
  label: string;
  pageUrl?: string;
  feedUrls: string[];
  score: number;
}

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { category: "political", aliases: ["politics", "political", "elections", "election", "government", "parliament", "congress"] },
  { category: "health", aliases: ["health", "healthcare", "medicine", "medical", "wellness"] },
  { category: "business", aliases: ["business", "economy", "economic", "finance", "markets", "money"] },
  { category: "tech", aliases: ["technology", "tech", "digital", "cybersecurity", "cyber", "innovation"] },
  { category: "sports", aliases: ["sports", "sport", "football"] },
  { category: "science", aliases: ["science", "space", "research"] },
  { category: "entertainment", aliases: ["entertainment", "culture", "arts", "movies", "film", "music", "television", "lifestyle"] },
];

const parser = new RssParser({
  timeout: 8000,
  headers: { "User-Agent": "NWS360/1.0 (Publisher Discovery)" },
});

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function categoryLabel(category: SourceCategoryCode): string {
  return SOURCE_CATEGORIES.find((item) => item.code === category)?.label || category;
}

function matchCategory(text: string, href: string): { category: SourceCategoryCode; score: number } | null {
  const normalizedText = normalizeText(text);
  let pathSegments: string[] = [];
  try {
    pathSegments = new URL(href).pathname
      .split("/")
      .map((segment) => normalizeText(decodeURIComponent(segment)))
      .filter(Boolean);
  } catch {}
  const allTokens = `${normalizedText} ${pathSegments.join(" ")}`.split(" ").filter(Boolean);

  let best: { category: SourceCategoryCode; score: number } | null = null;
  for (const definition of CATEGORY_DEFINITIONS) {
    for (const alias of definition.aliases) {
      const normalizedAlias = normalizeText(alias);
      let score = 0;
      if (normalizedText === normalizedAlias) score = 100;
      else if (normalizedText.split(" ").includes(normalizedAlias)) score = 85;
      else if (pathSegments.includes(normalizedAlias)) score = 75;
      else if (allTokens.includes(normalizedAlias)) score = 55;
      if (score > (best?.score || 0)) best = { category: definition.category, score };
    }
  }
  return best;
}

function toAbsoluteUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (!url.protocol.startsWith("http")) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function samePublisher(url: string, targetUrl: string): boolean {
  try {
    const normalizeHost = (value: string) => new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return normalizeHost(url) === normalizeHost(targetUrl);
  } catch {
    return false;
  }
}

function collectAlternateFeeds(html: string, pageUrl: string): string[] {
  const $ = load(html);
  const feeds = new Set<string>();
  $('link[rel~="alternate"]').each((_, element) => {
    const type = ($(element).attr("type") || "").toLowerCase();
    if (!type.includes("rss") && !type.includes("atom") && !type.includes("xml")) return;
    const href = $(element).attr("href");
    if (!href) return;
    const absolute = toAbsoluteUrl(href, pageUrl);
    if (absolute) feeds.add(absolute);
  });
  return Array.from(feeds);
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function validateFeed(url: string): Promise<string | null> {
  try {
    const feed = await parser.parseURL(url);
    return feed.items?.length ? url : null;
  } catch {
    return null;
  }
}

async function resolveCandidate(candidate: CategoryCandidate): Promise<DiscoveredPublisherCategory | null> {
  const feedUrls = new Set(candidate.feedUrls);
  if (candidate.pageUrl) {
    const sectionHtml = await fetchPage(candidate.pageUrl);
    if (sectionHtml) {
      for (const feedUrl of collectAlternateFeeds(sectionHtml, candidate.pageUrl)) {
        const feedCategory = matchCategory("", feedUrl);
        if (feedCategory?.category === candidate.category) feedUrls.add(feedUrl);
      }
      const section = load(sectionHtml);
      const generator = section('meta[name="generator"]').attr("content") || "";
      if (/wordpress/i.test(generator) || /\/category\//i.test(new URL(candidate.pageUrl).pathname)) {
        const base = candidate.pageUrl.replace(/\/$/, "");
        feedUrls.add(`${base}/feed`);
        feedUrls.add(`${base}/rss`);
      }
    }
  }

  for (const feedUrl of Array.from(feedUrls).slice(0, 5)) {
    const validated = await validateFeed(feedUrl);
    if (validated) {
      return {
        category: candidate.category,
        label: candidate.label,
        url: validated,
        type: "rss",
        confidence: "high",
      };
    }
  }

  if (!candidate.pageUrl) return null;
  return {
    category: candidate.category,
    label: candidate.label,
    url: candidate.pageUrl,
    type: "website",
    confidence: "medium",
  };
}

export async function discoverPublisherCategories(targetUrl: string, html: string): Promise<DiscoveredPublisherCategory[]> {
  const $ = load(html);
  const candidates = new Map<SourceCategoryCode, CategoryCandidate>();

  const addCandidate = (category: SourceCategoryCode, score: number, pageUrl?: string, feedUrl?: string) => {
    const current = candidates.get(category) || {
      category,
      label: categoryLabel(category),
      feedUrls: [],
      score: 0,
    };
    if (feedUrl && !current.feedUrls.includes(feedUrl)) current.feedUrls.push(feedUrl);
    if (pageUrl && (!current.pageUrl || score > current.score)) {
      current.pageUrl = pageUrl;
    }
    current.score = Math.max(current.score, score);
    candidates.set(category, current);
  };

  $('link[rel~="alternate"]').each((_, element) => {
    const type = ($(element).attr("type") || "").toLowerCase();
    if (!type.includes("rss") && !type.includes("atom") && !type.includes("xml")) return;
    const href = $(element).attr("href");
    if (!href) return;
    const feedUrl = toAbsoluteUrl(href, targetUrl);
    if (!feedUrl) return;
    const match = matchCategory(`${$(element).attr("title") || ""} ${href}`, feedUrl);
    if (match) addCandidate(match.category, match.score + 20, undefined, feedUrl);
  });

  const navigationSelector = [
    "nav a[href]",
    "header a[href]",
    '[role="navigation"] a[href]',
  ].join(",");

  $(navigationSelector).each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const pageUrl = toAbsoluteUrl(href, targetUrl);
    if (!pageUrl || !samePublisher(pageUrl, targetUrl)) return;
    const parsed = new URL(pageUrl);
    if (parsed.pathname === "/" || /\/(tag|author|search|login|account)\//i.test(parsed.pathname)) return;
    if (/\/(?:19|20)\d{2}\/\d{1,2}\//.test(parsed.pathname)) return;
    if (parsed.pathname.split("/").filter(Boolean).length > 3) return;
    const match = matchCategory($(element).text(), pageUrl);
    if (match) addCandidate(match.category, match.score, pageUrl);
  });

  const resolved = await Promise.all(Array.from(candidates.values()).map(resolveCandidate));
  const byCategory = new Map(resolved.filter(Boolean).map((item) => [item!.category, item!]));
  return SOURCE_CATEGORIES
    .map((category) => byCategory.get(category.code))
    .filter((item): item is DiscoveredPublisherCategory => Boolean(item));
}
