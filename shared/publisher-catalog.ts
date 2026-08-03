import { z } from "zod";
import { normalizeCountryCode, normalizeCountryCodes } from "./country-registry";

export const PUBLISHER_ORGANIZATION_TYPES = [
  "news_agency",
  "newspaper",
  "magazine",
  "television",
  "radio",
  "digital_news",
  "government",
  "diplomatic_mission",
  "international_organization",
  "ngo",
  "think_tank",
  "research_organization",
  "corporate",
  "social_only",
  "other",
] as const;

export const PUBLISHER_OWNERSHIP_TYPES = [
  "public",
  "private",
  "state_owned",
  "nonprofit",
  "international",
  "unknown",
] as const;

export const PUBLISHER_OFFICIAL_STATUSES = [
  "official",
  "independent",
  "state_affiliated",
  "unofficial",
  "unknown",
] as const;

export const PUBLISHER_VERIFICATION_STATUSES = ["unverified", "verified", "disputed"] as const;
export const PUBLISHER_LIFECYCLE_STATUSES = ["draft", "active", "paused", "archived"] as const;
export const PUBLISHER_SCOPE_TYPES = ["global", "client_private"] as const;

export const PUBLISHER_ALIAS_TYPES = [
  "name",
  "abbreviation",
  "former_name",
  "translated_name",
  "social_name",
  "domain_name",
  "other",
] as const;

export const PUBLISHER_CHANNEL_TYPES = [
  "website",
  "rss",
  "telegram",
  "facebook",
  "x",
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
  "television",
  "radio",
  "podcast",
  "newsletter",
  "api",
  "other",
] as const;

export const CHANNEL_VALIDATION_STATUSES = ["untested", "valid", "invalid", "unreachable", "needs_review"] as const;

export const CLIENT_PUBLISHER_SELECTION_STATUSES = ["candidate", "approved", "blocked", "archived"] as const;
export const CLIENT_PUBLISHER_SELECTION_PRIORITIES = ["critical", "high", "standard", "low"] as const;

export const ARTICLE_APPEARANCE_TYPES = [
  "original",
  "rss",
  "republished",
  "social",
  "video",
  "broadcast",
  "collector",
] as const;

export const COLLECTOR_TYPES = ["google_news", "rss_app", "direct", "manual", "other"] as const;

export type PublisherScopeType = typeof PUBLISHER_SCOPE_TYPES[number];
export type PublisherChannelType = typeof PUBLISHER_CHANNEL_TYPES[number];
export type ArticleAppearanceType = typeof ARTICLE_APPEARANCE_TYPES[number];

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "igshid",
];

const LONG_FORM_CHANNEL_TYPES = new Set<PublisherChannelType>(["website", "rss", "podcast", "newsletter", "api"]);
const SOCIAL_CHANNEL_TYPES = new Set<PublisherChannelType>(["facebook", "x", "youtube", "instagram", "tiktok", "linkedin", "telegram"]);

export function cleanPublisherText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizePublisherComparable(value: unknown): string {
  return cleanPublisherText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff.@_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyPublisher(value: unknown): string {
  return normalizePublisherComparable(value)
    .replace(/[@.]/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "publisher";
}

export function normalizeLanguageCode(value: unknown): string | null {
  const raw = cleanPublisherText(value).toLowerCase();
  if (!raw) return null;
  const base = raw.split("-")[0];
  return /^[a-z]{2,3}$/.test(base) ? base : null;
}

export function normalizeLanguageCodes(values: unknown): string[] {
  const input = Array.isArray(values) ? values : typeof values === "string" ? values.split(/[,;\n]+/) : [];
  return Array.from(new Set(input.map(normalizeLanguageCode).filter((code): code is string => Boolean(code))));
}

export function parseUrl(value: unknown): URL | null {
  const raw = cleanPublisherText(value);
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }
}

export function urlHasCredentials(url: URL): boolean {
  return Boolean(url.username || url.password);
}

export function assertUrlHasNoCredentials(url: URL) {
  if (urlHasCredentials(url)) {
    throw new Error("Publisher channel URLs must not contain username or password credentials.");
  }
}

export function normalizeDomain(value: unknown): string | null {
  const parsed = parseUrl(value);
  const host = parsed?.hostname || cleanPublisherText(value);
  const normalized = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  return normalized && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized) ? normalized : null;
}

function stripTrackingParams(url: URL, options?: { preserveQuery?: boolean }) {
  if (options?.preserveQuery) {
    for (const key of TRACKING_PARAMS) url.searchParams.delete(key);
    return;
  }
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.includes(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
}

export function normalizeHttpUrl(value: unknown, options?: { preserveQuery?: boolean; trailingSlash?: "keep" | "remove" }): string {
  const parsed = parseUrl(value);
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) return "";
  assertUrlHasNoCredentials(parsed);
  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  stripTrackingParams(parsed, options);
  parsed.hash = "";
  if (options?.trailingSlash !== "keep" && parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
  }
  if (parsed.pathname === "/") parsed.pathname = "/";
  return parsed.toString();
}

export function extractHandleFromPath(url: URL): string | null {
  const part = url.pathname.split("/").filter(Boolean)[0];
  return part ? part.replace(/^@/, "").trim() : null;
}

export type NormalizedChannelUrl = {
  channelType: PublisherChannelType;
  normalizedUrl: string;
  handle: string | null;
  externalId: string | null;
  warnings: string[];
};

export function normalizePublisherChannelUrl(channelType: PublisherChannelType | string, value: unknown): NormalizedChannelUrl {
  if (channelType === "google_news") {
    throw new Error("Google News is collector metadata, not a publisher-owned channel.");
  }
  const type = channelType as PublisherChannelType;
  const raw = cleanPublisherText(value);
  const warnings: string[] = [];

  if (!raw && ["television", "radio", "other"].includes(type)) {
    return { channelType: type, normalizedUrl: "", handle: null, externalId: null, warnings };
  }

  if (type === "rss") {
    return { channelType: type, normalizedUrl: normalizeHttpUrl(raw, { preserveQuery: true, trailingSlash: "keep" }), handle: null, externalId: null, warnings };
  }

  if (type === "telegram") {
    const input = raw.replace(/^@/, "");
    const parsed = parseUrl(input.includes(".") || input.includes("/") ? input : `https://t.me/${input}`);
    if (parsed) assertUrlHasNoCredentials(parsed);
    const handle = parsed ? extractHandleFromPath(parsed) : input;
    if (parsed?.pathname.startsWith("/joinchat") || parsed?.pathname.includes("+")) {
      warnings.push("Telegram invite URLs are not canonical public publisher channels.");
    }
    const normalizedHandle = cleanPublisherText(handle).replace(/^@/, "");
    return { channelType: type, normalizedUrl: normalizedHandle ? `https://t.me/${normalizedHandle}` : "", handle: normalizedHandle || null, externalId: null, warnings };
  }

  if (type === "facebook") {
    const input = raw.includes(".") || raw.includes("/") ? raw : `https://facebook.com/${raw.replace(/^@/, "")}`;
    const parsed = parseUrl(input);
    if (parsed) assertUrlHasNoCredentials(parsed);
    const handle = parsed ? extractHandleFromPath(parsed) : raw.replace(/^@/, "");
    return { channelType: type, normalizedUrl: handle ? `https://facebook.com/${handle}` : normalizeHttpUrl(input), handle: handle || null, externalId: null, warnings };
  }

  if (type === "x") {
    const input = raw.includes(".") || raw.includes("/") ? raw : `https://x.com/${raw.replace(/^@/, "")}`;
    const parsed = parseUrl(input);
    if (parsed) assertUrlHasNoCredentials(parsed);
    const handle = parsed ? extractHandleFromPath(parsed) : raw.replace(/^@/, "");
    const normalizedHandle = handle ? handle.toLowerCase() : null;
    return { channelType: type, normalizedUrl: normalizedHandle ? `https://x.com/${normalizedHandle}` : normalizeHttpUrl(input), handle: normalizedHandle, externalId: null, warnings };
  }

  if (type === "youtube") {
    const input = raw.includes(".") || raw.includes("/") ? raw : `https://youtube.com/${raw.startsWith("@") ? raw : `@${raw}`}`;
    const parsed = parseUrl(input);
    if (parsed) assertUrlHasNoCredentials(parsed);
    const parts = parsed?.pathname.split("/").filter(Boolean) || [];
    const channelIndex = parts.findIndex((part) => part.toLowerCase() === "channel");
    const channelId = channelIndex >= 0 ? parts[channelIndex + 1] || null : null;
    const handle = parts.find((part) => part.startsWith("@"))?.replace(/^@/, "") || (!channelId ? parts[0]?.replace(/^@/, "") : null);
    if (channelId) {
      return { channelType: type, normalizedUrl: `https://youtube.com/channel/${channelId}`, handle: handle || null, externalId: channelId, warnings };
    }
    return { channelType: type, normalizedUrl: handle ? `https://youtube.com/@${handle}` : normalizeHttpUrl(input), handle: handle || null, externalId: null, warnings };
  }

  if (["instagram", "tiktok", "linkedin"].includes(type)) {
    const host = type === "linkedin" ? "linkedin.com" : `${type}.com`;
    const input = raw.includes(".") || raw.includes("/") ? raw : `https://${host}/${raw.replace(/^@/, "")}`;
    const parsed = parseUrl(input);
    if (parsed) assertUrlHasNoCredentials(parsed);
    const handle = parsed ? extractHandleFromPath(parsed) : raw.replace(/^@/, "");
    return { channelType: type, normalizedUrl: normalizeHttpUrl(input), handle: handle || null, externalId: null, warnings };
  }

  return { channelType: type, normalizedUrl: normalizeHttpUrl(raw), handle: null, externalId: null, warnings };
}

export function buildPublisherCanonicalKey(scopeType: PublisherScopeType, slug: string, ownerClientId?: number | null): string {
  const normalizedSlug = slugifyPublisher(slug);
  if (scopeType === "global") return `global:${normalizedSlug}`;
  if (!Number.isInteger(ownerClientId) || Number(ownerClientId) <= 0) {
    throw new Error("Client-private publisher requires ownerClientId.");
  }
  return `client:${ownerClientId}:${normalizedSlug}`;
}

export function buildPublisherDomainScopeKey(scopeType: PublisherScopeType, normalizedPrimaryDomain?: string | null, ownerClientId?: number | null): string | null {
  const domain = cleanPublisherText(normalizedPrimaryDomain).toLowerCase();
  if (!domain) return null;
  if (scopeType === "global") return `global:${domain}`;
  if (!Number.isInteger(ownerClientId) || Number(ownerClientId) <= 0) {
    throw new Error("Client-private publisher domain requires ownerClientId.");
  }
  return `client:${ownerClientId}:${domain}`;
}

export function validatePublisherCanonicalKey(canonicalKey: unknown, scopeType: PublisherScopeType, ownerClientId?: number | null): string {
  const key = cleanPublisherText(canonicalKey).toLowerCase();
  if (!key) throw new Error("canonicalKey is required.");
  if (scopeType === "global") {
    if (!/^global:[a-z0-9\u0600-\u06ff][a-z0-9\u0600-\u06ff-]{0,159}$/.test(key)) {
      throw new Error("Global publisher canonicalKey must use global:<publisher-slug>.");
    }
    return key;
  }
  if (!Number.isInteger(ownerClientId) || Number(ownerClientId) <= 0) {
    throw new Error("Client-private publisher requires ownerClientId.");
  }
  const pattern = new RegExp(`^client:${ownerClientId}:[a-z0-9\\u0600-\\u06ff][a-z0-9\\u0600-\\u06ff-]{0,159}$`);
  if (!pattern.test(key)) {
    throw new Error("Client-private publisher canonicalKey must use client:<ownerClientId>:<publisher-slug>.");
  }
  return key;
}

export function buildPublisherChannelKey(publisherProfileId: number | string, channelType: PublisherChannelType, normalizedUrl: string, externalId?: string | null, handle?: string | null): string {
  const identity = cleanPublisherText(externalId || handle || normalizedUrl).toLowerCase();
  return `publisher:${publisherProfileId}:${channelType}:${identity}`;
}

const nullableString = z.preprocess((value) => {
  const text = cleanPublisherText(value);
  return text || null;
}, z.string().nullable());

export const publisherProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  slug: z.string().trim().max(160).optional().nullable(),
  canonicalKey: z.string().trim().max(260).optional().nullable(),
  legalName: nullableString.optional(),
  organizationType: z.enum(PUBLISHER_ORGANIZATION_TYPES).default("other"),
  description: nullableString.optional(),
  primaryDomain: nullableString.optional(),
  websiteUrl: nullableString.optional(),
  logoUrl: nullableString.optional(),
  countryCode: nullableString.optional(),
  operatingCountryCodes: z.array(z.string()).optional().default([]),
  languageCodes: z.array(z.string()).optional().default([]),
  ownershipType: z.enum(PUBLISHER_OWNERSHIP_TYPES).default("unknown"),
  parentOrganizationName: nullableString.optional(),
  officialStatus: z.enum(PUBLISHER_OFFICIAL_STATUSES).default("unknown"),
  verificationStatus: z.enum(PUBLISHER_VERIFICATION_STATUSES).default("unverified"),
  scopeType: z.enum(PUBLISHER_SCOPE_TYPES).default("global"),
  ownerClientId: z.number().int().positive().nullable().optional(),
  status: z.enum(PUBLISHER_LIFECYCLE_STATUSES).default("draft"),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const publisherAliasInputSchema = z.object({
  alias: z.string().trim().min(1).max(240),
  languageCode: z.string().trim().max(12).optional().nullable(),
  aliasType: z.enum(PUBLISHER_ALIAS_TYPES).default("name"),
});

export const publisherChannelInputSchema = z.object({
  name: z.string().trim().min(1).max(240).optional().nullable(),
  channelType: z.string().trim().min(1),
  url: z.string().trim().max(2000).optional().nullable(),
  externalId: z.string().trim().max(240).optional().nullable(),
  handle: z.string().trim().max(240).optional().nullable(),
  countryCode: z.string().trim().max(12).optional().nullable(),
  languageCodes: z.array(z.string()).optional().default([]),
  isPrimary: z.boolean().optional().default(false),
  verificationStatus: z.enum(PUBLISHER_VERIFICATION_STATUSES).default("unverified"),
  lifecycleStatus: z.enum(PUBLISHER_LIFECYCLE_STATUSES).default("draft"),
  fetchStrategy: z.string().trim().max(120).optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({}),
  validationStatus: z.enum(CHANNEL_VALIDATION_STATUSES).default("untested"),
});

export const createPublisherRequestSchema = z.object({
  profile: publisherProfileInputSchema,
  aliases: z.array(publisherAliasInputSchema).optional().default([]),
  channels: z.array(publisherChannelInputSchema).optional().default([]),
});

export const clientPublisherSelectionInputSchema = z.object({
  publisherProfileId: z.number().int().positive(),
  status: z.enum(CLIENT_PUBLISHER_SELECTION_STATUSES).default("candidate"),
  priority: z.enum(CLIENT_PUBLISHER_SELECTION_PRIORITIES).default("standard"),
  notes: nullableString.optional(),
});

export function normalizePublisherProfile(input: unknown) {
  const parsed = publisherProfileInputSchema.parse(input);
  const name = cleanPublisherText(parsed.name);
  const slug = slugifyPublisher(parsed.slug || name);
  const countryCode = parsed.countryCode ? normalizeCountryCode(parsed.countryCode) : null;
  if (parsed.countryCode && !countryCode) throw new Error("countryCode must be a canonical country code.");
  const operatingCountryCodes = normalizeCountryCodes(parsed.operatingCountryCodes);
  const languageCodes = normalizeLanguageCodes(parsed.languageCodes);
  const websiteUrl = parsed.websiteUrl ? normalizeHttpUrl(parsed.websiteUrl) : null;
  const normalizedPrimaryDomain = normalizeDomain(parsed.primaryDomain || websiteUrl || "") || null;
  const primaryDomain = parsed.primaryDomain ? normalizedPrimaryDomain : normalizedPrimaryDomain;
  const ownerClientId = parsed.scopeType === "global" ? null : parsed.ownerClientId ?? null;
  if (parsed.scopeType === "client_private" && !ownerClientId) throw new Error("client_private publisher requires ownerClientId.");
  const canonicalKey = validatePublisherCanonicalKey(
    cleanPublisherText(parsed.canonicalKey) || buildPublisherCanonicalKey(parsed.scopeType, slug, ownerClientId),
    parsed.scopeType,
    ownerClientId,
  );
  const domainScopeKey = buildPublisherDomainScopeKey(parsed.scopeType, normalizedPrimaryDomain, ownerClientId);
  return {
    ...parsed,
    name,
    slug,
    canonicalKey,
    domainScopeKey,
    primaryDomain,
    normalizedPrimaryDomain,
    websiteUrl,
    countryCode,
    operatingCountryCodes,
    languageCodes,
    ownerClientId,
  };
}

export function normalizePublisherAlias(input: unknown) {
  const parsed = publisherAliasInputSchema.parse(input);
  const alias = cleanPublisherText(parsed.alias);
  return {
    alias,
    normalizedAlias: normalizePublisherComparable(alias),
    languageCode: normalizeLanguageCode(parsed.languageCode) || "und",
    aliasType: parsed.aliasType,
  };
}

export function normalizePublisherChannel(input: unknown, publisherProfileId: number | string = "new") {
  const parsed = publisherChannelInputSchema.parse(input);
  if (parsed.channelType === "google_news") {
    throw new Error("Google News is collector metadata, not a publisher-owned channel.");
  }
  if (!PUBLISHER_CHANNEL_TYPES.includes(parsed.channelType as PublisherChannelType)) {
    throw new Error("Unsupported publisher channel type.");
  }
  const channelType = parsed.channelType as PublisherChannelType;
  const normalized = normalizePublisherChannelUrl(channelType, parsed.url || parsed.handle || parsed.externalId || "");
  const countryCode = parsed.countryCode ? normalizeCountryCode(parsed.countryCode) : null;
  if (parsed.countryCode && !countryCode) throw new Error("channel countryCode must be canonical.");
  const externalId = cleanPublisherText(parsed.externalId) || normalized.externalId;
  const handle = cleanPublisherText(parsed.handle) || normalized.handle;
  const channelKey = buildPublisherChannelKey(publisherProfileId, channelType, normalized.normalizedUrl, externalId, handle);
  return {
    ...parsed,
    name: cleanPublisherText(parsed.name) || channelType,
    channelType,
    url: cleanPublisherText(parsed.url) || normalized.normalizedUrl,
    normalizedUrl: normalized.normalizedUrl,
    externalId: externalId || null,
    handle: handle || null,
    countryCode,
    languageCodes: normalizeLanguageCodes(parsed.languageCodes),
    channelKey,
    warnings: normalized.warnings,
  };
}

export function normalizeCreatePublisherRequest(input: unknown) {
  const parsed = createPublisherRequestSchema.parse(input);
  const profile = normalizePublisherProfile(parsed.profile);
  const aliases = parsed.aliases.map(normalizePublisherAlias);
  const channels = parsed.channels.map((channel) => normalizePublisherChannel(channel, "new"));
  const aliasKeys = new Set<string>();
  for (const alias of aliases) {
    const key = `${alias.normalizedAlias}:${alias.languageCode || ""}`;
    if (aliasKeys.has(key)) throw new Error("Duplicate alias for publisher and language.");
    aliasKeys.add(key);
  }
  const channelKeys = new Set<string>();
  for (const channel of channels) {
    const key = `${channel.channelType}:${channel.normalizedUrl || channel.externalId || channel.handle}`;
    if (key === `${channel.channelType}:`) throw new Error("Channel URL, handle, or externalId is required.");
    if (channelKeys.has(key)) throw new Error("Duplicate channel in request.");
    channelKeys.add(key);
  }
  return { profile, aliases, channels };
}

export type DuplicateSignal = {
  publisherId?: number;
  signal: string;
  confidence: number;
  message: string;
};

export type DuplicateCandidateInput = {
  id?: number;
  name: string;
  normalizedPrimaryDomain?: string | null;
  aliases?: Array<{ normalizedAlias: string; languageCode?: string | null }>;
  channels?: Array<{ normalizedUrl?: string | null; externalId?: string | null; handle?: string | null; channelType?: string | null }>;
  countryCode?: string | null;
};

export function previewPublisherDuplicates(candidate: DuplicateCandidateInput, existing: DuplicateCandidateInput[]): DuplicateSignal[] {
  const candidateName = normalizePublisherComparable(candidate.name);
  const candidateAliases = new Set((candidate.aliases || []).map((alias) => `${alias.normalizedAlias}:${alias.languageCode || ""}`));
  const candidateChannels = new Set((candidate.channels || []).flatMap((channel) => [
    channel.normalizedUrl ? `url:${channel.normalizedUrl}` : "",
    channel.externalId ? `external:${channel.channelType || ""}:${channel.externalId}` : "",
    channel.handle ? `handle:${channel.channelType || ""}:${String(channel.handle).toLowerCase()}` : "",
  ]).filter(Boolean));

  return existing.flatMap((record) => {
    const signals: DuplicateSignal[] = [];
    if (candidate.normalizedPrimaryDomain && record.normalizedPrimaryDomain === candidate.normalizedPrimaryDomain) {
      signals.push({ publisherId: record.id, signal: "normalized_primary_domain", confidence: 95, message: "Normalized primary domain matches." });
    }
    for (const alias of record.aliases || []) {
      if (candidateAliases.has(`${alias.normalizedAlias}:${alias.languageCode || ""}`)) {
        signals.push({ publisherId: record.id, signal: "canonical_alias", confidence: 90, message: "Alias and language match." });
      }
    }
    for (const channel of record.channels || []) {
      const candidates = [
        channel.normalizedUrl ? `url:${channel.normalizedUrl}` : "",
        channel.externalId ? `external:${channel.channelType || ""}:${channel.externalId}` : "",
        channel.handle ? `handle:${channel.channelType || ""}:${String(channel.handle).toLowerCase()}` : "",
      ].filter(Boolean);
      if (candidates.some((item) => candidateChannels.has(item))) {
        signals.push({ publisherId: record.id, signal: "verified_channel_identity", confidence: 92, message: "Channel URL, handle, or external ID overlaps." });
      }
    }
    const existingName = normalizePublisherComparable(record.name);
    if (candidateName && existingName && candidate.countryCode && record.countryCode === candidate.countryCode) {
      const a = new Set(candidateName.split(" "));
      const b = new Set(existingName.split(" "));
      const overlap = Array.from(a).filter((token) => b.has(token)).length;
      if (overlap >= Math.min(2, Math.max(1, a.size))) {
        signals.push({ publisherId: record.id, signal: "similar_name_same_country", confidence: 65, message: "Similar name in the same country." });
      }
    }
    return signals;
  });
}

export type AppearanceCandidate = {
  id?: number | string;
  appearanceType: ArticleAppearanceType | string;
  collectorType?: string | null;
  publisherChannelType?: PublisherChannelType | string | null;
  isPrimary?: boolean | null;
  publishedAt?: Date | string | null;
  discoveredAt?: Date | string | null;
};

function appearanceScore(item: AppearanceCandidate): number {
  if (item.appearanceType === "original" && item.publisherChannelType === "website") return 100;
  if (item.appearanceType === "rss") return 85;
  if (LONG_FORM_CHANNEL_TYPES.has(item.publisherChannelType as PublisherChannelType)) return 75;
  if (SOCIAL_CHANNEL_TYPES.has(item.publisherChannelType as PublisherChannelType)) return 55;
  if (item.appearanceType === "collector" || item.collectorType === "google_news") return 15;
  return 40;
}

export function selectPrimaryAppearance<T extends AppearanceCandidate>(appearances: T[]): T | null {
  return [...appearances].sort((a, b) => {
    const scoreDelta = appearanceScore(b) - appearanceScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    const aTime = new Date(a.publishedAt || a.discoveredAt || 0).getTime();
    const bTime = new Date(b.publishedAt || b.discoveredAt || 0).getTime();
    return bTime - aTime;
  })[0] || null;
}
