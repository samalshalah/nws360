import { z } from "zod";
import {
  CLIENT_LIFECYCLE_STATUSES,
  ORGANIZATION_TYPES,
  WORKSPACE_STATUSES,
  type ClientLifecycleStatus,
  type OrganizationType,
  type WorkspaceStatus,
} from "./schema";
import { getCountry, normalizeCountryCode, normalizeCountryCodes, normalizeRegionCodes } from "./country-registry";
import { WORKSPACE_PURPOSES, WORKSPACE_SCOPE_MODES, type WorkspacePurpose, type WorkspaceScopeMode } from "./workspace-relevance";

export { CLIENT_LIFECYCLE_STATUSES, ORGANIZATION_TYPES, WORKSPACE_STATUSES };
export type { ClientLifecycleStatus, OrganizationType, WorkspacePurpose, WorkspaceScopeMode, WorkspaceStatus };

export const DIPLOMATIC_ORGANIZATION_TYPES = ["embassy", "diplomatic_mission"] as const;

const optionalText = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((value) => {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    return text || null;
  });

const stringList = z.array(z.string().trim().min(1).max(160)).max(300).optional().default([]);
const optionalCountryInput = z.string().trim().max(80).nullable().optional();
const optionalEmailInput = z
  .union([z.string().trim().email().max(254), z.literal(""), z.null()])
  .optional()
  .transform((value) => String(value || "").trim() || null);
const optionalUrlInput = z
  .union([z.string().trim().url().max(500), z.literal(""), z.null()])
  .optional()
  .transform((value) => String(value || "").trim() || null);
const profileTermList = (max = 300) => z.array(z.string().trim().min(1).max(160)).max(max).optional().default([]);
const tokenBudgetInput = z.coerce.number().int().min(0).max(50_000_000);

export const TRANSLATION_LANGUAGE_CODES = ["ar", "en", "ku", "fr", "es", "tr"] as const;
export type TranslationLanguageCode = (typeof TRANSLATION_LANGUAGE_CODES)[number];

const translationPairSchema = z.object({
  source: z.enum(TRANSLATION_LANGUAGE_CODES),
  target: z.enum(TRANSLATION_LANGUAGE_CODES),
}).refine((pair) => pair.source !== pair.target, { message: "source and target languages must differ" });

export type TranslationPair = z.infer<typeof translationPairSchema>;

export function normalizeSlug(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

export function suggestSlug(name: string): string {
  return normalizeSlug(name) || `client-${Date.now()}`;
}

export function normalizeWorkspaceName(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeLanguageList(values: string[] | null | undefined): string[] {
  return ["en"];
}

export function normalizeTermList(values: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values || []) {
    const cleaned = String(value || "").trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function isDiplomaticOrganizationType(value: string | null | undefined): boolean {
  return (DIPLOMATIC_ORGANIZATION_TYPES as readonly string[]).includes(String(value || ""));
}

export class ClientEnrollmentValidationError extends Error {
  status: number;
  code: string;
  details: string[];

  constructor(message: string, options: { status?: number; code?: string; details?: string[] } = {}) {
    super(message);
    this.name = "ClientEnrollmentValidationError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "validation_failed";
    this.details = options.details ?? [message];
  }
}

export const clientLifecycleUpdateSchema = z.object({
  lifecycleStatus: z.enum(CLIENT_LIFECYCLE_STATUSES),
  reason: z.string().trim().max(500).optional().nullable().transform((value) => String(value || "").trim() || null),
}).strict();

export type ClientLifecycleUpdateInput = z.infer<typeof clientLifecycleUpdateSchema>;

export const clientSetupUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  slug: z.string().trim().min(2).max(100).optional(),
  organizationType: z.enum(ORGANIZATION_TYPES).optional(),
  defaultLanguage: z.string().trim().min(2).max(20).optional().transform(() => "en"),
  representedCountryCode: optionalCountryInput,
  hostCountryCode: optionalCountryInput,
  headquartersCountryCode: optionalCountryInput,
  defaultTimezone: z.string().trim().min(2).max(80).nullable().optional(),
  defaultLanguages: z.array(z.string().trim().min(2).max(20)).max(20).optional().transform(() => ["en"]),
  websiteUrl: optionalUrlInput,
  contactName: z.string().trim().max(200).nullable().optional().transform((value) => String(value || "").trim() || null),
  contactEmail: optionalEmailInput,
  aiEnabled: z.boolean().optional(),
  dailyTokenBudget: tokenBudgetInput.optional(),
  dailyJobLimit: z.coerce.number().int().min(0).max(100_000).optional(),
  autoTranslationEnabled: z.boolean().optional(),
  aiTokenBudgets: z.object({
    analysis: tokenBudgetInput.optional().default(0),
    translation: tokenBudgetInput.optional().default(0),
    summaries: tokenBudgetInput.optional().default(0),
  }).optional(),
  translationEnabled: z.boolean().optional(),
  allowedTranslationPairs: z.array(translationPairSchema).max(30).optional(),
}).strict();

export type ClientSetupUpdateInput = z.infer<typeof clientSetupUpdateSchema>;

export const workspaceSetupUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: optionalText(2000),
  purpose: z.enum(WORKSPACE_PURPOSES).optional(),
  scopeMode: z.enum(WORKSPACE_SCOPE_MODES).optional(),
  globalScope: z.boolean().optional(),
  primaryCountryCodes: z.array(z.string().trim().max(80)).max(80).optional(),
  secondaryCountryCodes: z.array(z.string().trim().max(80)).max(80).optional(),
  regionCodes: z.array(z.string().trim().max(80)).max(80).optional(),
  subnationalAreas: stringList.optional(),
  preferredLanguages: z.array(z.string().trim().min(2).max(20)).max(20).optional().transform(() => ["en"]),
  timezone: z.string().trim().min(2).max(80).optional(),
  taxonomyTemplateCode: optionalText(120),
  relevanceProfileCode: optionalText(120),
  reportingTemplateCode: optionalText(120),
  status: z.enum(WORKSPACE_STATUSES).optional(),
}).strict();

export type WorkspaceSetupUpdateInput = z.infer<typeof workspaceSetupUpdateSchema>;

export const workspaceSetupCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: optionalText(2000),
  purpose: z.enum(WORKSPACE_PURPOSES).optional().default("custom"),
  scopeMode: z.enum(WORKSPACE_SCOPE_MODES).optional().default("hybrid"),
  globalScope: z.boolean().optional().default(false),
  primaryCountryCodes: z.array(z.string().trim().max(80)).max(80).optional().default([]),
  secondaryCountryCodes: z.array(z.string().trim().max(80)).max(80).optional().default([]),
  regionCodes: z.array(z.string().trim().max(80)).max(80).optional().default([]),
  subnationalAreas: stringList,
  preferredLanguages: z.array(z.string().trim().min(2).max(20)).max(20).optional().default([]),
  timezone: z.string().trim().min(2).max(80).optional().default("UTC"),
  taxonomyTemplateCode: optionalText(120),
  relevanceProfileCode: optionalText(120),
  reportingTemplateCode: optionalText(120),
}).strict();

export type WorkspaceSetupCreateInput = z.infer<typeof workspaceSetupCreateSchema>;

export const workspaceRelevanceProfileSetupSchema = z.object({
  topics: profileTermList(200),
  subtopics: profileTermList(200),
  industries: profileTermList(200),
  entities: profileTermList(300),
  organizations: profileTermList(300),
  people: profileTermList(300),
  projects: profileTermList(300),
  events: profileTermList(300),
  multilingualAliases: z.union([
    z.record(z.array(z.string().trim().min(1).max(160))),
    z.array(z.string().trim().min(1).max(160)),
    z.null(),
  ]).optional().transform((value) => value ?? []),
  inclusionTerms: profileTermList(300),
  exclusionTerms: profileTermList(300),
  impactTerms: profileTermList(300),
  contextualTerms: profileTermList(300),
  minimumConfidence: z.coerce.number().int().min(0).max(100).optional().default(60),
  includeContextualByDefault: z.boolean().optional().default(false),
  contextualLabel: z.string().trim().min(1).max(120).optional().default("Strategic Context"),
  active: z.boolean().optional().default(true),
}).strict();

export type WorkspaceRelevanceProfileSetupInput = z.infer<typeof workspaceRelevanceProfileSetupSchema>;

type ExistingClientSetup = {
  client: {
    name: string;
    slug?: string | null;
    organizationType: string;
    defaultLanguage?: string | null;
    aiEnabled?: boolean | null;
    dailyTokenBudget?: number | null;
    dailyJobLimit?: number | null;
  };
  settings?: {
    representedCountryCode?: string | null;
    hostCountryCode?: string | null;
    headquartersCountryCode?: string | null;
    defaultTimezone?: string | null;
    defaultLanguages?: string[] | null;
    websiteUrl?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    autoTranslationEnabled?: boolean | null;
    aiTokenBudgets?: {
      analysis?: number;
      translation?: number;
      summaries?: number;
    } | null;
    translationEnabled?: boolean | null;
    allowedTranslationPairs?: Array<{ source: string; target: string }> | null;
    homeCountryCode?: string | null;
    homeCountryName?: string | null;
  } | null;
};

type ExistingWorkspaceSetup = {
  workspace: {
    name: string;
    description?: string | null;
    purpose?: string | null;
    scopeMode?: string | null;
    globalScope?: boolean | null;
    primaryCountryCodes?: string[] | null;
    secondaryCountryCodes?: string[] | null;
    regionCodes?: string[] | null;
    subnationalAreas?: string[] | null;
    preferredLanguages?: string[] | null;
    timezone?: string | null;
    taxonomyTemplateCode?: string | null;
    relevanceProfileCode?: string | null;
    reportingTemplateCode?: string | null;
    status?: string | null;
    active?: boolean | null;
  };
  relevanceProfile?: Partial<ClientEnrollmentRequest["relevanceProfile"]> | null;
};

function explicitNullableCountry(value: string | null | undefined, field: string, errors: string[]): string | null | undefined {
  if (value === undefined) return undefined;
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = normalizeCountryCode(raw);
  if (!normalized) {
    errors.push(`${field} must be a valid ISO country code`);
    return null;
  }
  return normalized;
}

function countryOrNull(value: string | null | undefined): string | null {
  return normalizeCountryCode(value) || null;
}

function diffKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys).filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
}

export function normalizeClientSetupUpdate(input: unknown, current: ExistingClientSetup) {
  const parsed = clientSetupUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ClientEnrollmentValidationError("Invalid client setup update", {
      details: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`),
    });
  }

  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);
  const data = parsed.data;
  const errors: string[] = [];
  const organizationType = data.organizationType ?? current.client.organizationType;
  const representedInput = has("representedCountryCode") ? explicitNullableCountry(data.representedCountryCode, "representedCountryCode", errors) : undefined;
  const hostInput = has("hostCountryCode") ? explicitNullableCountry(data.hostCountryCode, "hostCountryCode", errors) : undefined;
  const headquartersInput = has("headquartersCountryCode") ? explicitNullableCountry(data.headquartersCountryCode, "headquartersCountryCode", errors) : undefined;
  const representedCountryCode = representedInput !== undefined
    ? representedInput
    : countryOrNull(current.settings?.representedCountryCode || current.settings?.homeCountryCode);
  const hostCountryCode = hostInput !== undefined ? hostInput : countryOrNull(current.settings?.hostCountryCode);
  const headquartersCountryCode = headquartersInput !== undefined ? headquartersInput : countryOrNull(current.settings?.headquartersCountryCode);

  if (isDiplomaticOrganizationType(organizationType)) {
    if (!representedCountryCode) errors.push("diplomatic organizations require representedCountryCode");
    if (!hostCountryCode) errors.push("diplomatic organizations require hostCountryCode");
  }

  const slug = data.slug !== undefined ? normalizeSlug(data.slug) : undefined;
  if (data.slug !== undefined && (!slug || !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug))) {
    errors.push("organization slug must contain lowercase letters, numbers, and hyphens only");
  }

  if (errors.length > 0) {
    throw new ClientEnrollmentValidationError("Invalid client setup update", { details: errors });
  }

  const clientUpdates: Record<string, unknown> = {};
  if (has("name")) clientUpdates.name = data.name!.trim().replace(/\s+/g, " ");
  if (has("slug")) clientUpdates.slug = slug;
  if (has("organizationType")) clientUpdates.organizationType = data.organizationType;
  if (has("defaultLanguage")) clientUpdates.defaultLanguage = data.defaultLanguage!.trim().toLowerCase();
  if (has("aiEnabled")) clientUpdates.aiEnabled = data.aiEnabled === true;
  if (has("dailyTokenBudget")) clientUpdates.dailyTokenBudget = data.dailyTokenBudget;
  if (has("dailyJobLimit")) clientUpdates.dailyJobLimit = data.dailyJobLimit;

  const settingsUpdates: Record<string, unknown> = {};
  if (representedInput !== undefined) settingsUpdates.representedCountryCode = representedInput;
  if (hostInput !== undefined) settingsUpdates.hostCountryCode = hostInput;
  if (headquartersInput !== undefined) settingsUpdates.headquartersCountryCode = headquartersInput;
  if (has("defaultTimezone")) settingsUpdates.defaultTimezone = data.defaultTimezone || null;
  if (has("defaultLanguages")) settingsUpdates.defaultLanguages = normalizeLanguageList(data.defaultLanguages);
  if (has("websiteUrl")) settingsUpdates.websiteUrl = data.websiteUrl;
  if (has("contactName")) settingsUpdates.contactName = data.contactName;
  if (has("contactEmail")) settingsUpdates.contactEmail = data.contactEmail;
  if (has("autoTranslationEnabled")) settingsUpdates.autoTranslationEnabled = data.autoTranslationEnabled === true;
  if (has("aiTokenBudgets")) {
    settingsUpdates.aiTokenBudgets = {
      analysis: data.aiTokenBudgets?.analysis ?? 0,
      translation: data.aiTokenBudgets?.translation ?? 0,
      summaries: data.aiTokenBudgets?.summaries ?? 0,
    };
  }
  if (has("translationEnabled")) settingsUpdates.translationEnabled = data.translationEnabled === true;
  if (has("allowedTranslationPairs")) settingsUpdates.allowedTranslationPairs = data.allowedTranslationPairs ?? [];

  if (representedInput !== undefined || has("organizationType")) {
    const legacyCountry = isDiplomaticOrganizationType(organizationType) ? representedCountryCode : null;
    settingsUpdates.homeCountryCode = legacyCountry;
    settingsUpdates.homeCountryName = legacyCountry ? getCountry(legacyCountry)?.name || legacyCountry : null;
    if (!legacyCountry) settingsUpdates.bilateralCategoryLabel = null;
  }

  const before = {
    name: current.client.name,
    slug: current.client.slug || null,
    organizationType: current.client.organizationType,
    defaultLanguage: current.client.defaultLanguage || null,
    representedCountryCode: current.settings?.representedCountryCode || null,
    hostCountryCode: current.settings?.hostCountryCode || null,
    headquartersCountryCode: current.settings?.headquartersCountryCode || null,
    defaultTimezone: current.settings?.defaultTimezone || null,
    defaultLanguages: current.settings?.defaultLanguages || null,
    websiteUrl: current.settings?.websiteUrl || null,
    contactName: current.settings?.contactName || null,
    contactEmail: current.settings?.contactEmail || null,
    aiEnabled: current.client.aiEnabled ?? false,
    dailyTokenBudget: current.client.dailyTokenBudget ?? 0,
    dailyJobLimit: current.client.dailyJobLimit ?? 0,
    autoTranslationEnabled: current.settings?.autoTranslationEnabled ?? false,
    aiTokenBudgets: current.settings?.aiTokenBudgets ?? null,
    translationEnabled: current.settings?.translationEnabled ?? false,
    allowedTranslationPairs: current.settings?.allowedTranslationPairs ?? [],
    homeCountryCode: current.settings?.homeCountryCode || null,
    homeCountryName: current.settings?.homeCountryName || null,
  };
  const after = {
    ...before,
    ...clientUpdates,
    ...settingsUpdates,
  };

  return {
    clientUpdates,
    settingsUpdates,
    changedFields: diffKeys(before, after),
    before,
    after,
  };
}

export const clientEnrollmentSchema = z.object({
  enrollmentKey: z.string().trim().min(8).max(160),
  organization: z.object({
    name: z.string().trim().min(2).max(200),
    slug: z.string().trim().min(2).max(100).optional().nullable(),
    organizationType: z.enum(ORGANIZATION_TYPES).default("media"),
    defaultLanguage: z.string().trim().min(2).max(20).default("en").transform(() => "en"),
    websiteUrl: optionalText(500),
    contactName: optionalText(200),
    contactEmail: z.string().trim().email().max(254).optional().nullable().or(z.literal("")).transform((value) => String(value || "").trim() || null),
  }),
  organizationContext: z.object({
    representedCountryCode: z.string().trim().max(80).optional().nullable(),
    hostCountryCode: z.string().trim().max(80).optional().nullable(),
    headquartersCountryCode: z.string().trim().max(80).optional().nullable(),
    defaultTimezone: z.string().trim().min(2).max(80).default("UTC"),
    defaultLanguages: z.array(z.string().trim().min(2).max(20)).max(20).default(["en"]).transform(() => ["en"]),
  }),
  workspace: z.object({
    name: z.string().trim().min(2).max(200),
    description: optionalText(2000),
    purpose: z.enum(WORKSPACE_PURPOSES).default("custom"),
    scopeMode: z.enum(WORKSPACE_SCOPE_MODES).default("hybrid"),
    globalScope: z.boolean().optional().default(false),
    primaryCountryCodes: z.array(z.string().trim().max(80)).max(80).optional().default([]),
    secondaryCountryCodes: z.array(z.string().trim().max(80)).max(80).optional().default([]),
    regionCodes: z.array(z.string().trim().max(80)).max(80).optional().default([]),
    subnationalAreas: stringList,
    preferredLanguages: z.array(z.string().trim().min(2).max(20)).max(20).optional().default(["en"]).transform(() => ["en"]),
    timezone: z.string().trim().min(2).max(80).default("UTC"),
    taxonomyTemplateCode: optionalText(120),
    relevanceProfileCode: optionalText(120),
    reportingTemplateCode: optionalText(120),
  }),
  relevanceProfile: z.object({
    topics: stringList,
    subtopics: stringList,
    industries: stringList,
    entities: stringList,
    organizations: stringList,
    people: stringList,
    projects: stringList,
    events: stringList,
    multilingualAliases: z.union([z.record(z.array(z.string().trim().min(1).max(160))), z.array(z.string().trim().min(1).max(160))]).optional().nullable().default([]),
    inclusionTerms: stringList,
    exclusionTerms: stringList,
    impactTerms: stringList,
    contextualTerms: stringList,
    minimumConfidence: z.coerce.number().int().min(0).max(100).default(60),
    includeContextualByDefault: z.boolean().optional().default(false),
    contextualLabel: z.string().trim().min(1).max(120).default("Strategic Context"),
    active: z.boolean().optional().default(true),
  }).default({}),
}).strict();

export type ClientEnrollmentRequest = z.infer<typeof clientEnrollmentSchema>;
export type NormalizedClientEnrollment = ClientEnrollmentRequest & {
  organization: ClientEnrollmentRequest["organization"] & { slug: string };
  workspace: ClientEnrollmentRequest["workspace"] & { normalizedName: string };
};

export type EnrollmentPreviewResult = {
  writes: false;
  valid: boolean;
  normalized?: NormalizedClientEnrollment;
  errors: string[];
  warnings: string[];
  suggestedDefaults: Record<string, unknown>;
  creationPlan: string[];
};

function normalizeOptionalCountry(value: string | null | undefined): string | null {
  return normalizeCountryCode(value) || null;
}

function hasAnyTopicSignal(profile: ClientEnrollmentRequest["relevanceProfile"]): boolean {
  return [
    profile.topics,
    profile.subtopics,
    profile.industries,
    profile.entities,
    profile.organizations,
    profile.people,
    profile.projects,
    profile.events,
    profile.inclusionTerms,
  ].some((values) => Array.isArray(values) && values.length > 0);
}

function hasAnyGeographicScope(workspace: ClientEnrollmentRequest["workspace"]): boolean {
  return Boolean(
    workspace.globalScope ||
    workspace.primaryCountryCodes.length ||
    workspace.secondaryCountryCodes.length ||
    workspace.regionCodes.length ||
    workspace.subnationalAreas.length,
  );
}

export function validateWorkspaceScope(workspace: ClientEnrollmentRequest["workspace"], profile: ClientEnrollmentRequest["relevanceProfile"]): string[] {
  const errors: string[] = [];
  switch (workspace.scopeMode) {
    case "global":
      if (!workspace.globalScope) errors.push("global requires globalScope true");
      break;
    case "single_country":
      if (workspace.primaryCountryCodes.length !== 1) errors.push("single_country requires exactly one primary monitoring country");
      break;
    case "multi_country":
      if (workspace.primaryCountryCodes.length < 2) errors.push("multi_country requires at least two primary monitoring countries");
      break;
    case "regional":
      if (workspace.regionCodes.length < 1) errors.push("regional requires at least one valid region");
      break;
    case "subnational":
      if (workspace.primaryCountryCodes.length < 1) errors.push("subnational requires at least one primary country");
      if (workspace.subnationalAreas.length < 1) errors.push("subnational requires at least one subnational area");
      break;
    case "topic_only":
      if (!hasAnyTopicSignal(profile)) errors.push("topic_only requires at least one topic, entity, organization, project, event, industry, or inclusion term");
      break;
    case "hybrid":
      if (!hasAnyGeographicScope(workspace)) errors.push("hybrid requires at least one geographic scope");
      if (!hasAnyTopicSignal(profile)) errors.push("hybrid requires at least one topic, entity, organization, project, event, industry, or inclusion term");
      break;
  }
  return errors;
}

function workspaceProfileDefaults(profile?: Partial<ClientEnrollmentRequest["relevanceProfile"]> | null): ClientEnrollmentRequest["relevanceProfile"] {
  return {
    topics: normalizeTermList(profile?.topics),
    subtopics: normalizeTermList(profile?.subtopics),
    industries: normalizeTermList(profile?.industries),
    entities: normalizeTermList(profile?.entities),
    organizations: normalizeTermList(profile?.organizations),
    people: normalizeTermList(profile?.people),
    projects: normalizeTermList(profile?.projects),
    events: normalizeTermList(profile?.events),
    multilingualAliases: profile?.multilingualAliases || [],
    inclusionTerms: normalizeTermList(profile?.inclusionTerms),
    exclusionTerms: normalizeTermList(profile?.exclusionTerms),
    impactTerms: normalizeTermList(profile?.impactTerms),
    contextualTerms: normalizeTermList(profile?.contextualTerms),
    minimumConfidence: Number(profile?.minimumConfidence ?? 60),
    includeContextualByDefault: Boolean(profile?.includeContextualByDefault),
    contextualLabel: String(profile?.contextualLabel || "Strategic Context"),
    active: profile?.active !== false,
  };
}

export function normalizeWorkspaceRelevanceProfileSetup(input: unknown): ClientEnrollmentRequest["relevanceProfile"] {
  const parsed = workspaceRelevanceProfileSetupSchema.safeParse(input || {});
  if (!parsed.success) {
    throw new ClientEnrollmentValidationError("Invalid workspace relevance profile", {
      details: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`),
    });
  }
  const data = parsed.data;
  return {
    topics: normalizeTermList(data.topics),
    subtopics: normalizeTermList(data.subtopics),
    industries: normalizeTermList(data.industries),
    entities: normalizeTermList(data.entities),
    organizations: normalizeTermList(data.organizations),
    people: normalizeTermList(data.people),
    projects: normalizeTermList(data.projects),
    events: normalizeTermList(data.events),
    multilingualAliases: data.multilingualAliases || [],
    inclusionTerms: normalizeTermList(data.inclusionTerms),
    exclusionTerms: normalizeTermList(data.exclusionTerms),
    impactTerms: normalizeTermList(data.impactTerms),
    contextualTerms: normalizeTermList(data.contextualTerms),
    minimumConfidence: Number(data.minimumConfidence ?? 60),
    includeContextualByDefault: Boolean(data.includeContextualByDefault),
    contextualLabel: String(data.contextualLabel || "Strategic Context"),
    active: data.active !== false,
  };
}

export function normalizeWorkspaceCreate(input: unknown, relevanceProfileInput: unknown) {
  const parsed = workspaceSetupCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ClientEnrollmentValidationError("Invalid workspace create", {
      details: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`),
    });
  }

  const data = parsed.data;
  const profile = normalizeWorkspaceRelevanceProfileSetup(relevanceProfileInput);
  const normalizedName = normalizeWorkspaceName(data.name);
  const workspace: ClientEnrollmentRequest["workspace"] & {
    normalizedName: string;
    status: "draft";
    active: false;
    activatedAt: null;
    activatedBy: null;
  } = {
    name: data.name.trim().replace(/\s+/g, " "),
    description: data.description,
    purpose: data.purpose,
    scopeMode: data.scopeMode,
    globalScope: Boolean(data.globalScope),
    primaryCountryCodes: normalizeCountryCodes(data.primaryCountryCodes),
    secondaryCountryCodes: normalizeCountryCodes(data.secondaryCountryCodes),
    regionCodes: normalizeRegionCodes(data.regionCodes),
    subnationalAreas: normalizeTermList(data.subnationalAreas),
    preferredLanguages: normalizeLanguageList(data.preferredLanguages),
    timezone: data.timezone,
    taxonomyTemplateCode: data.taxonomyTemplateCode,
    relevanceProfileCode: data.relevanceProfileCode,
    reportingTemplateCode: data.reportingTemplateCode,
    normalizedName,
    status: "draft",
    active: false,
    activatedAt: null,
    activatedBy: null,
  };

  if (workspace.scopeMode === "global") {
    workspace.globalScope = true;
    workspace.primaryCountryCodes = [];
    workspace.secondaryCountryCodes = [];
    workspace.regionCodes = [];
    workspace.subnationalAreas = [];
  }

  const errors: string[] = [];
  if (!workspace.normalizedName) errors.push("workspace name is required");
  if (data.primaryCountryCodes.length > 0 && workspace.primaryCountryCodes.length !== data.primaryCountryCodes.length) errors.push("primary monitoring countries must be valid ISO country codes");
  if (data.secondaryCountryCodes.length > 0 && workspace.secondaryCountryCodes.length !== data.secondaryCountryCodes.length) errors.push("secondary monitoring countries must be valid ISO country codes");
  if (data.regionCodes.length > 0 && workspace.regionCodes.length !== data.regionCodes.length) errors.push("regions must be valid canonical region codes");
  errors.push(...validateWorkspaceScope(workspace, profile));
  if (errors.length > 0) {
    throw new ClientEnrollmentValidationError("Invalid workspace create", { details: errors });
  }

  return {
    workspace,
    relevanceProfile: profile,
  };
}

export function normalizeWorkspaceSetupUpdate(input: unknown, current: ExistingWorkspaceSetup) {
  const parsed = workspaceSetupUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ClientEnrollmentValidationError("Invalid workspace update", {
      details: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`),
    });
  }

  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);
  const data = parsed.data;
  const proposed: ClientEnrollmentRequest["workspace"] & { normalizedName: string; status?: WorkspaceStatus } = {
    name: has("name") ? data.name! : current.workspace.name,
    description: has("description") ? data.description : current.workspace.description || null,
    purpose: (data.purpose ?? current.workspace.purpose ?? "custom") as WorkspacePurpose,
    scopeMode: (data.scopeMode ?? current.workspace.scopeMode ?? "hybrid") as WorkspaceScopeMode,
    globalScope: has("globalScope") ? Boolean(data.globalScope) : Boolean(current.workspace.globalScope),
    primaryCountryCodes: normalizeCountryCodes(has("primaryCountryCodes") ? data.primaryCountryCodes : current.workspace.primaryCountryCodes ?? []),
    secondaryCountryCodes: normalizeCountryCodes(has("secondaryCountryCodes") ? data.secondaryCountryCodes : current.workspace.secondaryCountryCodes ?? []),
    regionCodes: normalizeRegionCodes(has("regionCodes") ? data.regionCodes : current.workspace.regionCodes ?? []),
    subnationalAreas: normalizeTermList(has("subnationalAreas") ? data.subnationalAreas : current.workspace.subnationalAreas ?? []),
    preferredLanguages: normalizeLanguageList(has("preferredLanguages") ? data.preferredLanguages : current.workspace.preferredLanguages ?? []),
    timezone: has("timezone") ? data.timezone! : current.workspace.timezone ?? "UTC",
    taxonomyTemplateCode: has("taxonomyTemplateCode") ? data.taxonomyTemplateCode : current.workspace.taxonomyTemplateCode || null,
    relevanceProfileCode: has("relevanceProfileCode") ? data.relevanceProfileCode : current.workspace.relevanceProfileCode || null,
    reportingTemplateCode: has("reportingTemplateCode") ? data.reportingTemplateCode : current.workspace.reportingTemplateCode || null,
    normalizedName: normalizeWorkspaceName(has("name") ? data.name : current.workspace.name),
    status: data.status ?? (current.workspace.status as WorkspaceStatus | undefined) ?? "draft",
  };

  if (proposed.scopeMode === "global") {
    proposed.globalScope = true;
    proposed.primaryCountryCodes = [];
    proposed.secondaryCountryCodes = [];
    proposed.regionCodes = [];
    proposed.subnationalAreas = [];
  } else if (has("scopeMode") && data.scopeMode !== "global") {
    proposed.globalScope = false;
  }

  const inputPrimaryCount = has("primaryCountryCodes") && Array.isArray(data.primaryCountryCodes) ? data.primaryCountryCodes.length : 0;
  const inputSecondaryCount = has("secondaryCountryCodes") && Array.isArray(data.secondaryCountryCodes) ? data.secondaryCountryCodes.length : 0;
  const inputRegionCount = has("regionCodes") && Array.isArray(data.regionCodes) ? data.regionCodes.length : 0;
  const errors: string[] = [];
  if (inputPrimaryCount > 0 && proposed.primaryCountryCodes.length !== inputPrimaryCount) errors.push("primary monitoring countries must be valid ISO country codes");
  if (inputSecondaryCount > 0 && proposed.secondaryCountryCodes.length !== inputSecondaryCount) errors.push("secondary monitoring countries must be valid ISO country codes");
  if (inputRegionCount > 0 && proposed.regionCodes.length !== inputRegionCount) errors.push("regions must be valid canonical region codes");
  if (!proposed.normalizedName) errors.push("workspace name is required");

  const profile = workspaceProfileDefaults(current.relevanceProfile);
  errors.push(...validateWorkspaceScope(proposed, profile));
  if (errors.length > 0) {
    throw new ClientEnrollmentValidationError("Invalid workspace update", { details: errors });
  }

  const updates: Record<string, unknown> = {};
  for (const key of [
    "name",
    "description",
    "purpose",
    "scopeMode",
    "globalScope",
    "primaryCountryCodes",
    "secondaryCountryCodes",
    "regionCodes",
    "subnationalAreas",
    "preferredLanguages",
    "timezone",
    "taxonomyTemplateCode",
    "relevanceProfileCode",
    "reportingTemplateCode",
    "status",
  ] as const) {
    if (has(key) || (key === "globalScope" && proposed.scopeMode === "global")) {
      updates[key] = proposed[key];
    }
  }
  if (has("name")) updates.normalizedName = proposed.normalizedName;
  if (proposed.scopeMode === "global") {
    updates.globalScope = true;
    updates.primaryCountryCodes = [];
    updates.secondaryCountryCodes = [];
    updates.regionCodes = [];
    updates.subnationalAreas = [];
  }

  return {
    updates,
    proposed,
    profile,
  };
}

export function normalizeClientEnrollment(input: unknown): EnrollmentPreviewResult {
  const parsed = clientEnrollmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      writes: false,
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`),
      warnings: [],
      suggestedDefaults: {},
      creationPlan: [],
    };
  }

  const data = parsed.data;
  const organizationType = data.organization.organizationType;
  const representedCountryCode = normalizeOptionalCountry(data.organizationContext.representedCountryCode);
  const hostCountryCode = normalizeOptionalCountry(data.organizationContext.hostCountryCode);
  const headquartersCountryCode = normalizeOptionalCountry(data.organizationContext.headquartersCountryCode);
  const primaryCountryCodes = normalizeCountryCodes(data.workspace.primaryCountryCodes);
  const secondaryCountryCodes = normalizeCountryCodes(data.workspace.secondaryCountryCodes);
  const regionCodes = normalizeRegionCodes(data.workspace.regionCodes);
  const slug = normalizeSlug(data.organization.slug || data.organization.name);
  const normalizedName = normalizeWorkspaceName(data.workspace.name);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!slug || !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug)) {
    errors.push("organization slug must contain lowercase letters, numbers, and hyphens only");
  }
  if (!normalizedName) errors.push("workspace name is required");

  if (isDiplomaticOrganizationType(organizationType)) {
    if (!representedCountryCode) errors.push("diplomatic organizations require representedCountryCode");
    if (!hostCountryCode) errors.push("diplomatic organizations require hostCountryCode");
    if (representedCountryCode && !primaryCountryCodes.includes(representedCountryCode)) {
      warnings.push("represented country is organization context only and was not added as a monitored country");
    }
    if (hostCountryCode && !primaryCountryCodes.includes(hostCountryCode)) {
      warnings.push("host country may be suggested for monitoring, but it must be explicitly selected");
    }
  }

  if (data.organizationContext.representedCountryCode && !representedCountryCode) errors.push("representedCountryCode must be a valid ISO country code");
  if (data.organizationContext.hostCountryCode && !hostCountryCode) errors.push("hostCountryCode must be a valid ISO country code");
  if (data.organizationContext.headquartersCountryCode && !headquartersCountryCode) errors.push("headquartersCountryCode must be a valid ISO country code");
  if (data.workspace.primaryCountryCodes.length && primaryCountryCodes.length !== data.workspace.primaryCountryCodes.length) errors.push("primary monitoring countries must be valid ISO country codes");
  if (data.workspace.secondaryCountryCodes.length && secondaryCountryCodes.length !== data.workspace.secondaryCountryCodes.length) errors.push("secondary monitoring countries must be valid ISO country codes");
  if (data.workspace.regionCodes.length && regionCodes.length !== data.workspace.regionCodes.length) errors.push("regions must be valid canonical region codes");

  const relevanceProfile = {
    ...data.relevanceProfile,
    topics: normalizeTermList(data.relevanceProfile.topics),
    subtopics: normalizeTermList(data.relevanceProfile.subtopics),
    industries: normalizeTermList(data.relevanceProfile.industries),
    entities: normalizeTermList(data.relevanceProfile.entities),
    organizations: normalizeTermList(data.relevanceProfile.organizations),
    people: normalizeTermList(data.relevanceProfile.people),
    projects: normalizeTermList(data.relevanceProfile.projects),
    events: normalizeTermList(data.relevanceProfile.events),
    inclusionTerms: normalizeTermList(data.relevanceProfile.inclusionTerms),
    exclusionTerms: normalizeTermList(data.relevanceProfile.exclusionTerms),
    impactTerms: normalizeTermList(data.relevanceProfile.impactTerms),
    contextualTerms: normalizeTermList(data.relevanceProfile.contextualTerms),
  };

  const normalized: NormalizedClientEnrollment = {
    ...data,
    organization: {
      ...data.organization,
      slug,
      defaultLanguage: String(data.organization.defaultLanguage || "en").trim().toLowerCase(),
    },
    organizationContext: {
      ...data.organizationContext,
      representedCountryCode,
      hostCountryCode,
      headquartersCountryCode,
      defaultLanguages: normalizeLanguageList(data.organizationContext.defaultLanguages),
    },
    workspace: {
      ...data.workspace,
      normalizedName,
      primaryCountryCodes,
      secondaryCountryCodes,
      regionCodes,
      subnationalAreas: normalizeTermList(data.workspace.subnationalAreas),
      preferredLanguages: normalizeLanguageList(data.workspace.preferredLanguages),
      globalScope: data.workspace.scopeMode === "global" ? true : data.workspace.globalScope,
    },
    relevanceProfile,
  };

  errors.push(...validateWorkspaceScope(normalized.workspace, normalized.relevanceProfile));

  return {
    writes: false,
    valid: errors.length === 0,
    normalized,
    errors,
    warnings,
    suggestedDefaults: buildEnrollmentSuggestions(normalized),
    creationPlan: [
      "Create client organization in setup lifecycle",
      "Create or update one client settings/profile row",
      "Create first monitoring workspace as draft and inactive",
      "Create workspace relevance profile",
      "Create platform admin audit log",
    ],
  };
}

export function buildEnrollmentSuggestions(enrollment: NormalizedClientEnrollment): Record<string, unknown> {
  const suggestions: Record<string, unknown> = {};
  if (isDiplomaticOrganizationType(enrollment.organization.organizationType) && enrollment.organizationContext.hostCountryCode) {
    suggestions.primaryMonitoringCountries = [enrollment.organizationContext.hostCountryCode];
    suggestions.workspacePurpose = "diplomatic_monitoring";
  }
  if (enrollment.workspace.purpose === "humanitarian_monitoring") {
    suggestions.relevanceTopics = ["humanitarian access", "displacement", "public services"];
  } else if (enrollment.workspace.purpose === "industry_intelligence") {
    suggestions.relevanceTopics = ["markets", "regulation", "investment"];
  } else if (enrollment.workspace.purpose === "newsroom_monitoring") {
    suggestions.relevanceTopics = ["breaking news", "public affairs", "source coverage"];
  }
  return suggestions;
}

export function stableEnrollmentJson(enrollment: NormalizedClientEnrollment): string {
  return JSON.stringify(sortJson(enrollment));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortJson(v)]),
    );
  }
  return value;
}
