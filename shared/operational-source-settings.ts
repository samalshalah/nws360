import { z } from "zod";
import {
  WEBSITE_COLLECTION_STRATEGIES,
  normalizeWebsiteCollectorConfig,
  type WebsiteCollectorConfig,
} from "./source-collector";
import {
  SOURCE_FILTER_FIELDS,
  normalizeSourceFilterConfig,
  type SourceFilterConfig,
} from "./source-filter";

export const OPERATIONAL_SOURCE_SUPPORTED_STRATEGIES = WEBSITE_COLLECTION_STRATEGIES;
export const OPERATIONAL_SOURCE_SUPPORTED_FILTER_FIELDS = SOURCE_FILTER_FIELDS;

export const OPERATIONAL_SOURCE_SETTING_FIELDS = [
  "url",
  "collectorConfig",
  "filterConfig",
  "intervalMinutes",
  "maxArticlesPerFetch",
  "retentionDays",
  "refreshPriority",
] as const;

export const OPERATIONAL_SOURCE_TEST_AFFECTING_FIELDS = [
  "url",
  "collectorConfig",
  "filterConfig",
  "intervalMinutes",
  "maxArticlesPerFetch",
  "retentionDays",
  "refreshPriority",
] as const;

export type OperationalSourceSettingField = typeof OPERATIONAL_SOURCE_SETTING_FIELDS[number];

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
  /\.local$/i,
];

function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function cleanOptionalString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function hasUnsupportedSelectorSyntax(selector: string): boolean {
  return /::?|javascript:|expression\s*\(|<|>/i.test(selector);
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

function validatePublicHttpUrl(value: string, ctx: z.RefinementCtx, path: (string | number)[]) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Only HTTP and HTTPS URLs are supported" });
    }
    if (parsed.username || parsed.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Credential-bearing URLs are not allowed" });
    }
    if (isPrivateOrLocalHost(parsed.hostname)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Private or local URLs are not allowed" });
    }
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "A valid URL is required" });
  }
}

const operationalUrlSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(2000).superRefine((value, ctx) => {
    validatePublicHttpUrl(value, ctx, []);
  }).optional(),
);

const optionalSelectorSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(240).superRefine((selector, ctx) => {
    if (hasUnsupportedSelectorSyntax(selector)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pseudo-selectors and script-like selector constructs are not supported",
      });
    }
  }).optional(),
);

export const operationalCollectorConfigSchema = z.object({
  strategy: z.enum(WEBSITE_COLLECTION_STRATEGIES).default("auto"),
  feedUrl: operationalUrlSchema,
  renderJavascript: z.boolean().default(false),
  selectors: z.object({
    item: optionalSelectorSchema,
    link: optionalSelectorSchema,
    title: optionalSelectorSchema,
    summary: optionalSelectorSchema,
    image: optionalSelectorSchema,
    date: optionalSelectorSchema,
  }).strict().optional(),
}).strict().superRefine((config, ctx) => {
  if (config.renderJavascript) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["renderJavascript"],
      message: "renderJavascript must remain false until a supported renderer exists",
    });
  }
});

export const operationalSourceSettingsSchema = z.object({
  url: operationalUrlSchema,
  collectorConfig: operationalCollectorConfigSchema.nullable().optional(),
  filterConfig: z.preprocess((value) => value ?? undefined, normalizeSourceFilterSchema().optional()),
  intervalMinutes: z.number().int().min(5).max(1440).optional(),
  maxArticlesPerFetch: z.number().int().min(1).max(100).optional(),
  retentionDays: z.number().int().min(1).max(90).optional(),
  refreshPriority: z.enum(["high", "medium", "low"]).optional(),
}).strict();

export const operationalSourceSettingsPreviewRequestSchema = z.object({
  settings: operationalSourceSettingsSchema,
}).strict();

export const operationalSourceSettingsUpdateRequestSchema = z.object({
  previewFingerprint: z.string().trim().regex(/^[a-f0-9]{64}$/),
  previewExpiresAt: z.string().trim().datetime(),
  settings: operationalSourceSettingsSchema,
}).strict();

export type OperationalSourceSettingsInput = z.infer<typeof operationalSourceSettingsSchema>;

export type OperationalSourceSettings = {
  url: string;
  collectorConfig: WebsiteCollectorConfig;
  filterConfig: SourceFilterConfig;
  intervalMinutes: number;
  maxArticlesPerFetch: number;
  retentionDays: number;
  refreshPriority: "high" | "medium" | "low";
};

type SourceLike = {
  url?: string | null;
  collectorConfig?: unknown;
  filterConfig?: unknown;
  intervalMinutes?: number | null;
  maxArticlesPerFetch?: number | null;
  retentionDays?: number | null;
  refreshPriority?: string | null;
};

function normalizeSourceFilterSchema() {
  return z.any().transform((value) => normalizeSourceFilterConfig(value));
}

function normalizeCollector(value: unknown): WebsiteCollectorConfig {
  if (value === null || value === undefined) return normalizeWebsiteCollectorConfig({});
  return normalizeWebsiteCollectorConfig(operationalCollectorConfigSchema.parse(value));
}

export function currentOperationalSourceSettings(source: SourceLike): OperationalSourceSettings {
  return {
    url: String(source.url || ""),
    collectorConfig: normalizeCollector(source.collectorConfig),
    filterConfig: normalizeSourceFilterConfig(source.filterConfig),
    intervalMinutes: Number(source.intervalMinutes || 15),
    maxArticlesPerFetch: Number(source.maxArticlesPerFetch || 10),
    retentionDays: Number(source.retentionDays || 7),
    refreshPriority: source.refreshPriority === "high" || source.refreshPriority === "low" ? source.refreshPriority : "medium",
  };
}

export function normalizeOperationalSourceSettings(input: unknown, current?: SourceLike | null): OperationalSourceSettings {
  const parsed = operationalSourceSettingsSchema.parse(input || {});
  const baseline = current
    ? currentOperationalSourceSettings(current)
    : {
        url: "",
        collectorConfig: normalizeCollector({}),
        filterConfig: normalizeSourceFilterConfig({}),
        intervalMinutes: 15,
        maxArticlesPerFetch: 10,
        retentionDays: 7,
        refreshPriority: "medium" as const,
      };

  return {
    url: parsed.url ?? baseline.url,
    collectorConfig: parsed.collectorConfig !== undefined ? normalizeCollector(parsed.collectorConfig) : baseline.collectorConfig,
    filterConfig: parsed.filterConfig !== undefined ? parsed.filterConfig : baseline.filterConfig,
    intervalMinutes: parsed.intervalMinutes ?? baseline.intervalMinutes,
    maxArticlesPerFetch: parsed.maxArticlesPerFetch ?? baseline.maxArticlesPerFetch,
    retentionDays: parsed.retentionDays ?? baseline.retentionDays,
    refreshPriority: parsed.refreshPriority ?? baseline.refreshPriority,
  };
}

export function operationalSourceSettingsPatch(settings: OperationalSourceSettings): Record<string, unknown> {
  return {
    url: settings.url,
    collectorConfig: settings.collectorConfig,
    filterConfig: settings.filterConfig,
    intervalMinutes: settings.intervalMinutes,
    maxArticlesPerFetch: settings.maxArticlesPerFetch,
    retentionDays: settings.retentionDays,
    refreshPriority: settings.refreshPriority,
  };
}

export function applyOperationalSourceSettings<T extends SourceLike>(source: T, settings: OperationalSourceSettings): T {
  return {
    ...source,
    ...operationalSourceSettingsPatch(settings),
  };
}

export function stableOperationalSettingsJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableOperationalSettingsJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableOperationalSettingsJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function diffOperationalSourceSettings(current: OperationalSourceSettings, proposed: OperationalSourceSettings): OperationalSourceSettingField[] {
  return OPERATIONAL_SOURCE_SETTING_FIELDS.filter((field) =>
    stableOperationalSettingsJson(current[field]) !== stableOperationalSettingsJson(proposed[field]),
  );
}

export function sanitizeOperationalUrlForEvidence(value: unknown): string | null {
  const raw = cleanOptionalString(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return parsed.toString().slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}

export function operationalSelectorFieldNames(settings: OperationalSourceSettings): string[] {
  const selectors = settings.collectorConfig.selectors || {};
  return Object.entries(selectors)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([key]) => key);
}
