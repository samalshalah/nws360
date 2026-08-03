import { z } from "zod";
import {
  CLIENT_LIFECYCLE_STATUSES,
  ORGANIZATION_TYPES,
  WORKSPACE_STATUSES,
  type ClientLifecycleStatus,
  type OrganizationType,
  type WorkspaceStatus,
} from "./schema";
import { normalizeCountryCode, normalizeCountryCodes, normalizeRegionCodes } from "./country-registry";
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
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values || []) {
    const cleaned = String(value || "").trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
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

export const clientEnrollmentSchema = z.object({
  enrollmentKey: z.string().trim().min(8).max(160),
  organization: z.object({
    name: z.string().trim().min(2).max(200),
    slug: z.string().trim().min(2).max(100).optional().nullable(),
    organizationType: z.enum(ORGANIZATION_TYPES).default("media"),
    defaultLanguage: z.string().trim().min(2).max(20).default("en"),
    websiteUrl: optionalText(500),
    contactName: optionalText(200),
    contactEmail: z.string().trim().email().max(254).optional().nullable().or(z.literal("")).transform((value) => String(value || "").trim() || null),
  }),
  organizationContext: z.object({
    representedCountryCode: z.string().trim().max(80).optional().nullable(),
    hostCountryCode: z.string().trim().max(80).optional().nullable(),
    headquartersCountryCode: z.string().trim().max(80).optional().nullable(),
    defaultTimezone: z.string().trim().min(2).max(80).default("UTC"),
    defaultLanguages: z.array(z.string().trim().min(2).max(20)).max(20).default(["en"]),
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
    preferredLanguages: z.array(z.string().trim().min(2).max(20)).max(20).optional().default([]),
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
