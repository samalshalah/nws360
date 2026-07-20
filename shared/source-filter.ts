import { z } from "zod";

export const SOURCE_FILTER_FIELDS = ["title", "description", "link", "imageTitle"] as const;
export type SourceFilterField = typeof SOURCE_FILTER_FIELDS[number];

export const DEFAULT_SOURCE_FILTER_RULE = {
  enabled: false,
  keywords: [] as string[],
  fields: ["title", "description"] as SourceFilterField[],
};

const sourceFilterRuleSchema = z.object({
  enabled: z.boolean().default(false),
  keywords: z.array(z.string().trim().min(1).max(120)).max(100).default([])
    .transform((values) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))),
  fields: z.array(z.enum(SOURCE_FILTER_FIELDS)).min(1).max(SOURCE_FILTER_FIELDS.length)
    .default(["title", "description"]),
}).strict();

export const sourceFilterConfigSchema = z.object({
  whitelist: sourceFilterRuleSchema.default(DEFAULT_SOURCE_FILTER_RULE),
  blacklist: sourceFilterRuleSchema.default(DEFAULT_SOURCE_FILTER_RULE),
}).strict();

export type SourceFilterRule = z.infer<typeof sourceFilterRuleSchema>;
export type SourceFilterConfig = z.infer<typeof sourceFilterConfigSchema>;

export const DEFAULT_SOURCE_FILTER_CONFIG: SourceFilterConfig = {
  whitelist: { ...DEFAULT_SOURCE_FILTER_RULE, keywords: [], fields: [...DEFAULT_SOURCE_FILTER_RULE.fields] },
  blacklist: { ...DEFAULT_SOURCE_FILTER_RULE, keywords: [], fields: [...DEFAULT_SOURCE_FILTER_RULE.fields] },
};

export function normalizeSourceFilterConfig(value: unknown): SourceFilterConfig {
  return sourceFilterConfigSchema.parse(value || {});
}

export interface SourceFilterItem {
  title?: string | null;
  content?: string | null;
  description?: string | null;
  summary?: string | null;
  url?: string | null;
  link?: string | null;
  imageTitle?: string | null;
}

function searchableValues(item: SourceFilterItem, fields: SourceFilterField[]): string[] {
  const values: Record<SourceFilterField, string | null | undefined> = {
    title: item.title,
    description: item.description || item.summary || item.content,
    link: item.link || item.url,
    imageTitle: item.imageTitle,
  };
  return fields
    .map((field) => values[field]?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
}

function ruleMatches(item: SourceFilterItem, rule: SourceFilterRule): boolean {
  if (!rule.enabled || rule.keywords.length === 0) return false;
  const values = searchableValues(item, rule.fields);
  return rule.keywords.some((keyword) => {
    const normalized = keyword.trim().toLowerCase();
    return normalized.length > 0 && values.some((value) => value.includes(normalized));
  });
}

export function sourceFilterDecision(
  item: SourceFilterItem,
  rawConfig: SourceFilterConfig | null | undefined,
): { accepted: boolean; reason?: "whitelist" | "blacklist" } {
  const config = normalizeSourceFilterConfig(rawConfig);
  return normalizedSourceFilterDecision(item, config);
}

function normalizedSourceFilterDecision(
  item: SourceFilterItem,
  config: SourceFilterConfig,
): { accepted: boolean; reason?: "whitelist" | "blacklist" } {
  if (config.blacklist.enabled && config.blacklist.keywords.length > 0 && ruleMatches(item, config.blacklist)) {
    return { accepted: false, reason: "blacklist" };
  }
  if (config.whitelist.enabled && config.whitelist.keywords.length > 0 && !ruleMatches(item, config.whitelist)) {
    return { accepted: false, reason: "whitelist" };
  }
  return { accepted: true };
}

export function filterSourceItems<T extends SourceFilterItem>(
  items: T[],
  config: SourceFilterConfig | null | undefined,
): T[] {
  const normalized = normalizeSourceFilterConfig(config);
  return items.filter((item) => normalizedSourceFilterDecision(item, normalized).accepted);
}
