const NOISE_WORDS = new Set([
  "about",
  "advertisement",
  "advertising",
  "afp",
  "agency",
  "agencies",
  "analysis",
  "analyses",
  "ap",
  "article",
  "articles",
  "associated",
  "author",
  "authors",
  "bbc",
  "bloomberg",
  "breaking",
  "caption",
  "cbs",
  "cnn",
  "commentary",
  "copyright",
  "copy",
  "coverage",
  "credit",
  "credits",
  "editor",
  "editors",
  "exclusive",
  "explained",
  "explainer",
  "file",
  "files",
  "forbes",
  "fox",
  "getty",
  "google",
  "guardian",
  "image",
  "images",
  "investigate",
  "investigates",
  "journalist",
  "journalists",
  "latest",
  "listen",
  "live",
  "login",
  "media",
  "msn",
  "nbc",
  "news",
  "newsletter",
  "nytimes",
  "opinion",
  "photo",
  "photos",
  "picture",
  "pictures",
  "podcast",
  "politico",
  "press",
  "promo",
  "publisher",
  "publishers",
  "read",
  "reads",
  "reading",
  "report",
  "reports",
  "reserved",
  "reuters",
  "rights",
  "said",
  "says",
  "sign",
  "source",
  "sources",
  "sponsored",
  "staff",
  "stories",
  "story",
  "stream",
  "subscribe",
  "subscriber",
  "subscribers",
  "subscription",
  "underscored",
  "update",
  "updates",
  "video",
  "videos",
  "watch",
  "wire",
  "wires",
  "writer",
  "writers",
  "wsj",
  "yahoo",
]);

const DATE_WORDS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "today",
  "yesterday",
  "tomorrow",
  "ago",
  "hour",
  "hours",
  "minute",
  "minutes",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
]);

const NOISE_PHRASES = new Set([
  "associated press",
  "file photo",
  "file photos",
  "getty image",
  "getty images",
  "live updates",
  "news analysis",
  "photo illustration",
  "subscribe newsletter",
  "cnn underscored",
]);

const ALLOWED_SHORT_TERMS = new Set(["ai"]);

function normalizeAnalyticsValue(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function analyticsTokens(value: string): string[] {
  return normalizeAnalyticsValue(value).match(/[a-z0-9\u0600-\u06FF]{2,}/g) || [];
}

function isNoiseToken(token: string): boolean {
  if (!ALLOWED_SHORT_TERMS.has(token) && token.length < 3) return true;
  if (/^\d+$/.test(token)) return true;
  if (/^\d+(?:st|nd|rd|th)$/.test(token)) return true;
  return NOISE_WORDS.has(token) || DATE_WORDS.has(token);
}

export function isGenericAnalyticsTerm(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = normalizeAnalyticsValue(value);
  if (!normalized) return true;
  if (NOISE_PHRASES.has(normalized)) return true;

  const tokens = analyticsTokens(normalized);
  if (tokens.length === 0) return true;
  if (tokens.length === 1) return isNoiseToken(tokens[0]);
  return tokens.every(isNoiseToken);
}
