export type ImportableSourceType =
  | "website"
  | "rss"
  | "google_news"
  | "youtube"
  | "twitter"
  | "facebook"
  | "instagram"
  | "telegram";

export interface FeedImportInputRow {
  xmlUrl?: string | null;
  title?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
}

export interface ClassifiedFeedImportRow {
  rowIndex: number;
  name: string;
  url: string;
  type: ImportableSourceType;
  country?: string | null;
  description?: string | null;
  originalUrl?: string | null;
  xmlUrl?: string | null;
  enabled: boolean;
  warnings: string[];
}

function cleanText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}

function normalizeUrl(value: string): string {
  const trimmed = cleanText(value);
  if (!trimmed) return "";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
}

function fallbackName(url: string): string {
  const parsed = safeUrl(url);
  return parsed?.hostname.replace(/^www\./, "") || "Imported source";
}

function cleanGoogleNewsTitle(title: string): string {
  return title
    .replace(/\s*[-|]\s*(Google News|أخبار Google)\s*$/i, "")
    .replace(/\s*[-|]\s*أخبار Google\s*$/i, "")
    .trim();
}

function getGoogleNewsCountry(url: URL): string | null {
  const gl = url.searchParams.get("gl");
  if (gl && /^[a-z]{2}$/i.test(gl)) return gl.toUpperCase();
  const ceid = url.searchParams.get("ceid");
  const country = ceid?.split(":")[0];
  return country && /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : null;
}

function classifyOriginalUrl(sourceUrl: string, title: string): { type: ImportableSourceType; url: string; country?: string | null; warnings: string[] } {
  const normalized = normalizeUrl(sourceUrl);
  const parsed = safeUrl(normalized);
  const host = parsed?.hostname.replace(/^www\./, "").toLowerCase() || "";
  const warnings: string[] = [];

  if (host === "news.google.com") {
    const keyword = cleanText(parsed?.searchParams.get("q")) || cleanGoogleNewsTitle(title) || "Iraq";
    return { type: "google_news", url: keyword, country: parsed ? getGoogleNewsCountry(parsed) : null, warnings };
  }
  if (host === "facebook.com" || host.endsWith(".facebook.com")) return { type: "facebook", url: normalized, warnings };
  if (host === "twitter.com" || host === "x.com" || host.endsWith(".twitter.com") || host.endsWith(".x.com")) return { type: "twitter", url: normalized, warnings };
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return { type: "instagram", url: normalized, warnings };
  if (host === "t.me" || host.endsWith(".t.me") || host === "telegram.me") return { type: "telegram", url: normalized, warnings };
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return { type: "youtube", url: normalized, warnings };

  return { type: "website", url: normalized, warnings };
}

function isRssAppFeed(value: string): boolean {
  return /^https?:\/\/rss\.app\/feeds\//i.test(value);
}

function isRssBackedSocialType(type: ImportableSourceType): boolean {
  return type === "facebook" || type === "instagram" || type === "twitter" || type === "telegram";
}

export function classifyFeedImportRow(row: FeedImportInputRow, rowIndex: number): ClassifiedFeedImportRow {
  const title = cleanText(row.title);
  const description = cleanText(row.description);
  const sourceUrl = cleanText(row.sourceUrl);
  const xmlUrl = cleanText(row.xmlUrl);
  const warnings: string[] = [];

  if (sourceUrl) {
    const classified = classifyOriginalUrl(sourceUrl, title);
    if (isRssAppFeed(xmlUrl)) {
      warnings.push(isRssBackedSocialType(classified.type)
        ? "RSS.app feed will be used as the collection feed for this social source."
        : "RSS.app export detected; importing original source URL.");
    }
    return {
      rowIndex,
      name: title || fallbackName(sourceUrl),
      url: classified.url,
      type: classified.type,
      country: classified.country || null,
      description: description || null,
      originalUrl: sourceUrl,
      xmlUrl: xmlUrl || null,
      enabled: Boolean(classified.url),
      warnings: [...warnings, ...classified.warnings],
    };
  }

  if (xmlUrl) {
    const normalizedXml = normalizeUrl(xmlUrl);
    if (isRssAppFeed(normalizedXml)) {
      warnings.push("RSS.app feed has no original source URL; verify access before activating.");
    }
    return {
      rowIndex,
      name: title || fallbackName(xmlUrl),
      url: normalizedXml,
      type: "rss",
      country: null,
      description: description || null,
      originalUrl: null,
      xmlUrl: normalizedXml,
      enabled: Boolean(normalizedXml),
      warnings,
    };
  }

  return {
    rowIndex,
    name: title || `Row ${rowIndex + 1}`,
    url: "",
    type: "website",
    country: null,
    description: description || null,
    originalUrl: null,
    xmlUrl: null,
    enabled: false,
    warnings: ["No source URL or XML URL found."],
  };
}

export function normalizeSourceImportKey(type: string, url: string, country?: string | null): string {
  return `${type}:${cleanText(url).toLowerCase()}:${cleanText(country).toUpperCase()}`;
}
