import {
  OPERATIONAL_SOURCE_SETTING_FIELDS,
  OPERATIONAL_SOURCE_SUPPORTED_FILTER_FIELDS,
  OPERATIONAL_SOURCE_SUPPORTED_STRATEGIES,
  stableOperationalSettingsJson,
  type OperationalSourceSettingField,
  type OperationalSourceSettings,
} from "@shared/operational-source-settings";
import {
  DEFAULT_SOURCE_FILTER_CONFIG,
  normalizeSourceFilterConfig,
  type SourceFilterConfig,
  type SourceFilterField,
  type SourceFilterRule,
} from "@shared/source-filter";
import type { WebsiteCollectorConfig } from "@shared/source-collector";

export const OPERATIONAL_SETTINGS_LIMITS = {
  urlMaxLength: 2000,
  selectorMaxLength: 240,
  keywordMaxLength: 120,
  keywordMaxCount: 100,
  intervalMinutes: { min: 5, max: 1440 },
  maxArticlesPerFetch: { min: 1, max: 100 },
  retentionDays: { min: 1, max: 90 },
};

export type OperationalSettingsReadResponse = {
  source?: {
    id?: number;
    name?: string;
    type?: string;
    active?: boolean;
    clientId?: number;
    publisherChannelId?: number | null;
  } | null;
  settings?: Partial<OperationalSourceSettings> | null;
  publisher?: {
    id?: number;
    name?: string;
    scopeType?: string;
    status?: string;
  } | null;
  channel?: {
    id?: number;
    name?: string;
    channelType?: string;
    url?: string | null;
    normalizedUrl?: string | null;
    verificationStatus?: string | null;
    validationStatus?: string | null;
    lifecycleStatus?: string | null;
  } | null;
  assignment?: {
    id?: number;
    workspaceId?: number;
    sourceId?: number;
    publisherChannelId?: number;
    status?: string;
    enabled?: boolean;
    priority?: string;
    sourceRole?: string;
    testStatus?: string;
    latestTestRunId?: number | null;
    updatedAt?: string | Date | null;
  } | null;
  linkedAssignments?: Array<{
    id?: number;
    workspaceId?: number;
    status?: string;
    enabled?: boolean;
    testStatus?: string;
  }>;
  relevanceProfileVersion?: number;
  currentState?: {
    sourceIdentity?: string;
    sourceActive?: boolean;
    linkedAssignmentCount?: number;
    enabledAssignmentCount?: number;
    staleAssignmentCount?: number;
    latestTestStatus?: string | null;
  } | null;
  updateAllowed?: {
    allowed?: boolean;
    reasons?: string[];
  } | null;
  supportedStrategies?: readonly string[];
  supportedFilterFields?: readonly string[];
};

export type NormalizedOperationalSettingsRead = {
  source: {
    id: number;
    name: string;
    type: string;
    active: boolean;
    clientId: number | null;
    publisherChannelId: number | null;
  } | null;
  settings: OperationalSourceSettings;
  publisher: {
    id: number | null;
    name: string;
    scopeType: string;
    status: string;
  };
  channel: {
    id: number | null;
    name: string;
    channelType: string;
    url: string | null;
    normalizedUrl: string | null;
    verificationStatus: string;
    validationStatus: string;
    lifecycleStatus: string;
  };
  assignment: {
    id: number | null;
    workspaceId: number | null;
    sourceId: number | null;
    publisherChannelId: number | null;
    status: string;
    enabled: boolean;
    priority: string;
    sourceRole: string;
    testStatus: string;
    latestTestRunId: number | null;
  };
  linkedAssignments: Array<{
    id: number;
    workspaceId: number | null;
    status: string;
    enabled: boolean;
    testStatus: string;
  }>;
  relevanceProfileVersion: number;
  currentState: {
    sourceIdentity: string | null;
    sourceActive: boolean;
    linkedAssignmentCount: number;
    enabledAssignmentCount: number;
    staleAssignmentCount: number;
    latestTestStatus: string | null;
  };
  updateAllowed: {
    allowed: boolean;
    reasons: string[];
  };
  supportedStrategies: readonly string[];
  supportedFilterFields: readonly string[];
  identityError: string | null;
};

export type OperationalPreviewResponse = {
  writes?: boolean;
  changedFields?: unknown;
  normalizedSettings?: Partial<OperationalSourceSettings> | null;
  previewFingerprint?: string | null;
  currentSourceIdentity?: string | null;
  proposedSourceIdentity?: string | null;
  inspection?: {
    success?: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    warnings?: unknown;
    collectorType?: string | null;
    structure?: string | null;
    requestedUrl?: string | null;
    finalUrl?: string | null;
    statusCode?: number | null;
    bytesRead?: number | null;
    declaredContentLength?: number | null;
    responseTruncated?: boolean | null;
    rawItemCount?: number;
    acceptedItemCount?: number;
    filteredOutCount?: number;
  } | null;
  safeSamples?: unknown;
  relevanceCounts?: {
    sampleCount?: number;
    directScopeMatchCount?: number;
    materialScopeImpactCount?: number;
    contextualCount?: number;
    notRelevantCount?: number;
    needsReviewCount?: number;
  } | null;
  directMatchRate?: number;
  relevantRate?: number;
  noiseRate?: number;
  productionCandidate?: boolean;
  expectedImpact?: {
    staleRequired?: boolean;
    sourceRemainsInactive?: boolean;
    assignmentsDisabled?: boolean;
    affectedAssignmentIds?: unknown;
    articleInsertions?: number;
    appearancesCreated?: number;
    fetchLogsCreated?: number;
    jobsCreated?: number;
    testsCreated?: number;
  } | null;
};

export type NormalizedOperationalPreview = {
  writes: boolean;
  changedFields: OperationalSourceSettingField[];
  normalizedSettings: OperationalSourceSettings | null;
  previewFingerprint: string | null;
  currentSourceIdentity: string | null;
  proposedSourceIdentity: string | null;
  inspection: {
    success: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    warnings: string[];
    collectorType: string;
    structure: string;
    requestedUrl: string | null;
    finalUrl: string | null;
    statusCode: number | null;
    bytesRead: number | null;
    declaredContentLength: number | null;
    responseTruncated: boolean;
    rawItemCount: number;
    acceptedItemCount: number;
    filteredOutCount: number;
  };
  safeSamples: Array<{
    headline: string;
    normalizedUrl: string | null;
    publicationTime: string | null;
    language: string | null;
    relevanceClassification: string;
    matchedSignals: string[];
    rejectionReason: string | null;
  }>;
  relevanceCounts: {
    sampleCount: number;
    directScopeMatchCount: number;
    materialScopeImpactCount: number;
    contextualCount: number;
    notRelevantCount: number;
    needsReviewCount: number;
  };
  directMatchRate: number;
  relevantRate: number;
  noiseRate: number;
  productionCandidate: boolean;
  expectedImpact: {
    staleRequired: boolean;
    sourceRemainsInactive: boolean;
    assignmentsDisabled: boolean;
    affectedAssignmentIds: number[];
    articleInsertions: number;
    appearancesCreated: number;
    fetchLogsCreated: number;
    jobsCreated: number;
    testsCreated: number;
  };
};

export const DEFAULT_OPERATIONAL_COLLECTOR_CONFIG: WebsiteCollectorConfig = {
  strategy: "auto",
  renderJavascript: false,
  selectors: {},
};

export const DEFAULT_OPERATIONAL_SETTINGS: OperationalSourceSettings = {
  url: "",
  collectorConfig: DEFAULT_OPERATIONAL_COLLECTOR_CONFIG,
  filterConfig: DEFAULT_SOURCE_FILTER_CONFIG,
  intervalMinutes: 15,
  maxArticlesPerFetch: 10,
  retentionDays: 7,
  refreshPriority: "medium",
};

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeCollectorConfig(value: unknown): WebsiteCollectorConfig {
  const input = isRecord(value) ? value : {};
  const selectors = isRecord(input.selectors) ? input.selectors : {};
  const cleanSelectors = Object.fromEntries(
    ["item", "link", "title", "summary", "image", "date"]
      .map((field) => [field, optionalString(selectors[field]) || undefined])
      .filter(([, selector]) => Boolean(selector)),
  );
  return {
    strategy: OPERATIONAL_SOURCE_SUPPORTED_STRATEGIES.includes(input.strategy) ? input.strategy : "auto",
    feedUrl: optionalString(input.feedUrl) || undefined,
    renderJavascript: false,
    selectors: cleanSelectors,
  };
}

function normalizeSettings(value: unknown): OperationalSourceSettings {
  const input = isRecord(value) ? value : {};
  const refreshPriority = input.refreshPriority === "high" || input.refreshPriority === "low" ? input.refreshPriority : "medium";
  return {
    url: optionalString(input.url) || "",
    collectorConfig: normalizeCollectorConfig(input.collectorConfig),
    filterConfig: normalizeSourceFilterConfig(input.filterConfig),
    intervalMinutes: finiteNumber(input.intervalMinutes, DEFAULT_OPERATIONAL_SETTINGS.intervalMinutes),
    maxArticlesPerFetch: finiteNumber(input.maxArticlesPerFetch, DEFAULT_OPERATIONAL_SETTINGS.maxArticlesPerFetch),
    retentionDays: finiteNumber(input.retentionDays, DEFAULT_OPERATIONAL_SETTINGS.retentionDays),
    refreshPriority,
  };
}

function normalizeFilterFields(fields: unknown): SourceFilterField[] {
  const values = Array.isArray(fields) ? fields : [];
  const selected = values.filter((field): field is SourceFilterField =>
    OPERATIONAL_SOURCE_SUPPORTED_FILTER_FIELDS.includes(field as SourceFilterField),
  );
  return selected.length > 0 ? Array.from(new Set(selected)) : ["title", "description"];
}

export function normalizeKeywordList(values: unknown): string[] {
  const input = Array.isArray(values) ? values : typeof values === "string" ? values.split(/[,\n]/) : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    const keyword = String(raw || "").replace(/\s+/g, " ").trim().slice(0, OPERATIONAL_SETTINGS_LIMITS.keywordMaxLength);
    const key = keyword.toLocaleLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= OPERATIONAL_SETTINGS_LIMITS.keywordMaxCount) break;
  }
  return result;
}

export function addKeywordsToRule(rule: SourceFilterRule, draft: string): SourceFilterRule {
  return {
    ...rule,
    keywords: normalizeKeywordList([...rule.keywords, ...draft.split(/[,\n]/)]),
  };
}

export function normalizeFilterRule(value: unknown): SourceFilterRule {
  const input = isRecord(value) ? value : {};
  return {
    enabled: Boolean(input.enabled),
    keywords: normalizeKeywordList(input.keywords),
    fields: normalizeFilterFields(input.fields),
  };
}

export function normalizeFilterConfig(value: unknown): SourceFilterConfig {
  const input = isRecord(value) ? value : {};
  return {
    whitelist: normalizeFilterRule(input.whitelist),
    blacklist: normalizeFilterRule(input.blacklist),
  };
}

export function normalizeOperationalSettingsRead(input: OperationalSettingsReadResponse | null | undefined): NormalizedOperationalSettingsRead {
  const source = isRecord(input?.source) && Number.isFinite(Number(input?.source?.id))
    ? {
        id: Number(input?.source?.id),
        name: String(input?.source?.name || `Source #${input?.source?.id}`),
        type: String(input?.source?.type || "unknown"),
        active: Boolean(input?.source?.active),
        clientId: Number.isFinite(Number(input?.source?.clientId)) ? Number(input?.source?.clientId) : null,
        publisherChannelId: Number.isFinite(Number(input?.source?.publisherChannelId)) ? Number(input?.source?.publisherChannelId) : null,
      }
    : null;
  const publisher = isRecord(input?.publisher) ? input!.publisher! : {};
  const channel = isRecord(input?.channel) ? input!.channel! : {};
  const assignment = isRecord(input?.assignment) ? input!.assignment! : {};
  const updateAllowed = isRecord(input?.updateAllowed) ? input!.updateAllowed! : {};
  const currentState = isRecord(input?.currentState) ? input!.currentState! : {};
  const linkedAssignments = Array.isArray(input?.linkedAssignments)
    ? input!.linkedAssignments!.filter(isRecord).map((item) => ({
        id: Number(item.id),
        workspaceId: Number.isFinite(Number(item.workspaceId)) ? Number(item.workspaceId) : null,
        status: String(item.status || "unknown"),
        enabled: Boolean(item.enabled),
        testStatus: String(item.testStatus || "unknown"),
      })).filter((item) => Number.isFinite(item.id))
    : [];
  const identityMissing = !source || !Number.isFinite(Number(assignment.id)) || !Number.isFinite(Number(channel.id));
  return {
    source,
    settings: normalizeSettings(input?.settings),
    publisher: {
      id: Number.isFinite(Number(publisher.id)) ? Number(publisher.id) : null,
      name: String(publisher.name || "Unknown publisher"),
      scopeType: String(publisher.scopeType || "unknown"),
      status: String(publisher.status || "unknown"),
    },
    channel: {
      id: Number.isFinite(Number(channel.id)) ? Number(channel.id) : null,
      name: String(channel.name || "Unknown channel"),
      channelType: String(channel.channelType || "unknown"),
      url: optionalString(channel.url),
      normalizedUrl: optionalString(channel.normalizedUrl),
      verificationStatus: String(channel.verificationStatus || "unknown"),
      validationStatus: String(channel.validationStatus || "unknown"),
      lifecycleStatus: String(channel.lifecycleStatus || "unknown"),
    },
    assignment: {
      id: Number.isFinite(Number(assignment.id)) ? Number(assignment.id) : null,
      workspaceId: Number.isFinite(Number(assignment.workspaceId)) ? Number(assignment.workspaceId) : null,
      sourceId: Number.isFinite(Number(assignment.sourceId)) ? Number(assignment.sourceId) : null,
      publisherChannelId: Number.isFinite(Number(assignment.publisherChannelId)) ? Number(assignment.publisherChannelId) : null,
      status: String(assignment.status || "unknown"),
      enabled: Boolean(assignment.enabled),
      priority: String(assignment.priority || "standard"),
      sourceRole: String(assignment.sourceRole || "primary"),
      testStatus: String(assignment.testStatus || "unknown"),
      latestTestRunId: Number.isFinite(Number(assignment.latestTestRunId)) ? Number(assignment.latestTestRunId) : null,
    },
    linkedAssignments,
    relevanceProfileVersion: finiteNumber(input?.relevanceProfileVersion, 1),
    currentState: {
      sourceIdentity: optionalString(currentState.sourceIdentity),
      sourceActive: Boolean(currentState.sourceActive),
      linkedAssignmentCount: finiteNumber(currentState.linkedAssignmentCount, linkedAssignments.length),
      enabledAssignmentCount: finiteNumber(currentState.enabledAssignmentCount, linkedAssignments.filter((item) => item.enabled).length),
      staleAssignmentCount: finiteNumber(currentState.staleAssignmentCount, linkedAssignments.filter((item) => item.testStatus === "stale").length),
      latestTestStatus: optionalString(currentState.latestTestStatus),
    },
    updateAllowed: {
      allowed: updateAllowed.allowed === true,
      reasons: Array.isArray(updateAllowed.reasons) ? updateAllowed.reasons.map(String) : [],
    },
    supportedStrategies: Array.isArray(input?.supportedStrategies) ? input!.supportedStrategies!.map(String) : OPERATIONAL_SOURCE_SUPPORTED_STRATEGIES,
    supportedFilterFields: Array.isArray(input?.supportedFilterFields) ? input!.supportedFilterFields!.map(String) : OPERATIONAL_SOURCE_SUPPORTED_FILTER_FIELDS,
    identityError: identityMissing ? "Required source, assignment, or channel identity is missing." : null,
  };
}

function normalizeChangedFields(value: unknown): OperationalSourceSettingField[] {
  if (!Array.isArray(value)) return [];
  return value.filter((field): field is OperationalSourceSettingField =>
    OPERATIONAL_SOURCE_SETTING_FIELDS.includes(field as OperationalSourceSettingField),
  );
}

function normalizeSafeSamples(value: unknown): NormalizedOperationalPreview["safeSamples"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((sample) => ({
    headline: String(sample.headline || "Untitled").slice(0, 240),
    normalizedUrl: optionalString(sample.normalizedUrl),
    publicationTime: optionalString(sample.publicationTime),
    language: optionalString(sample.language),
    relevanceClassification: String(sample.relevanceClassification || "needs_review"),
    matchedSignals: Array.isArray(sample.matchedSignals) ? sample.matchedSignals.map((item) => String(item).slice(0, 120)).slice(0, 12) : [],
    rejectionReason: optionalString(sample.rejectionReason),
  }));
}

function normalizeNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(Number).filter((item) => Number.isFinite(item))
    : [];
}

export function normalizeOperationalPreview(input: OperationalPreviewResponse | null | undefined): NormalizedOperationalPreview {
  const inspection = isRecord(input?.inspection) ? input!.inspection! : {};
  const counts = isRecord(input?.relevanceCounts) ? input!.relevanceCounts! : {};
  const impact = isRecord(input?.expectedImpact) ? input!.expectedImpact! : {};
  return {
    writes: input?.writes === true,
    changedFields: normalizeChangedFields(input?.changedFields),
    normalizedSettings: input?.normalizedSettings ? normalizeSettings(input.normalizedSettings) : null,
    previewFingerprint: optionalString(input?.previewFingerprint),
    currentSourceIdentity: optionalString(input?.currentSourceIdentity),
    proposedSourceIdentity: optionalString(input?.proposedSourceIdentity),
    inspection: {
      success: inspection.success === true,
      errorCode: optionalString(inspection.errorCode),
      errorMessage: optionalString(inspection.errorMessage),
      warnings: Array.isArray(inspection.warnings) ? inspection.warnings.map(String) : [],
      collectorType: String(inspection.collectorType || "unknown"),
      structure: String(inspection.structure || "unknown"),
      requestedUrl: optionalString(inspection.requestedUrl),
      finalUrl: optionalString(inspection.finalUrl),
      statusCode: Number.isFinite(Number(inspection.statusCode)) ? Number(inspection.statusCode) : null,
      bytesRead: Number.isFinite(Number(inspection.bytesRead)) ? Number(inspection.bytesRead) : null,
      declaredContentLength: Number.isFinite(Number(inspection.declaredContentLength)) ? Number(inspection.declaredContentLength) : null,
      responseTruncated: inspection.responseTruncated === true,
      rawItemCount: finiteNumber(inspection.rawItemCount, 0),
      acceptedItemCount: finiteNumber(inspection.acceptedItemCount, 0),
      filteredOutCount: finiteNumber(inspection.filteredOutCount, 0),
    },
    safeSamples: normalizeSafeSamples(input?.safeSamples),
    relevanceCounts: {
      sampleCount: finiteNumber(counts.sampleCount, 0),
      directScopeMatchCount: finiteNumber(counts.directScopeMatchCount, 0),
      materialScopeImpactCount: finiteNumber(counts.materialScopeImpactCount, 0),
      contextualCount: finiteNumber(counts.contextualCount, 0),
      notRelevantCount: finiteNumber(counts.notRelevantCount, 0),
      needsReviewCount: finiteNumber(counts.needsReviewCount, 0),
    },
    directMatchRate: finiteNumber(input?.directMatchRate, 0),
    relevantRate: finiteNumber(input?.relevantRate, 0),
    noiseRate: finiteNumber(input?.noiseRate, 0),
    productionCandidate: input?.productionCandidate === true,
    expectedImpact: {
      staleRequired: impact.staleRequired === true,
      sourceRemainsInactive: impact.sourceRemainsInactive !== false,
      assignmentsDisabled: impact.assignmentsDisabled !== false,
      affectedAssignmentIds: normalizeNumberArray(impact.affectedAssignmentIds),
      articleInsertions: finiteNumber(impact.articleInsertions, 0),
      appearancesCreated: finiteNumber(impact.appearancesCreated, 0),
      fetchLogsCreated: finiteNumber(impact.fetchLogsCreated, 0),
      jobsCreated: finiteNumber(impact.jobsCreated, 0),
      testsCreated: finiteNumber(impact.testsCreated, 0),
    },
  };
}

export function settingsEqual(a: OperationalSourceSettings, b: OperationalSourceSettings): boolean {
  return stableOperationalSettingsJson(a) === stableOperationalSettingsJson(b);
}

export function settingsSnapshot(settings: OperationalSourceSettings): string {
  return stableOperationalSettingsJson(settings);
}

export function settingsFromForm(value: OperationalSourceSettings): OperationalSourceSettings {
  return {
    ...value,
    url: value.url.trim(),
    collectorConfig: {
      strategy: value.collectorConfig.strategy,
      feedUrl: value.collectorConfig.feedUrl?.trim() || undefined,
      renderJavascript: false,
      selectors: Object.fromEntries(
        Object.entries(value.collectorConfig.selectors || {})
          .map(([field, selector]) => [field, selector?.trim() || undefined])
          .filter(([, selector]) => Boolean(selector)),
      ),
    },
    filterConfig: {
      whitelist: normalizeFilterRule(value.filterConfig.whitelist),
      blacklist: normalizeFilterRule(value.filterConfig.blacklist),
    },
    intervalMinutes: Number(value.intervalMinutes),
    maxArticlesPerFetch: Number(value.maxArticlesPerFetch),
    retentionDays: Number(value.retentionDays),
    refreshPriority: value.refreshPriority,
  };
}

export function canSaveOperationalSettings(input: {
  dirty: boolean;
  updateAllowed: boolean;
  identityError: string | null;
  preview: NormalizedOperationalPreview | null;
  currentSettings: OperationalSourceSettings;
  previewSettingsSnapshot: string | null;
  acknowledgement: boolean;
  previewing: boolean;
  saving: boolean;
}) {
  if (!input.dirty || !input.updateAllowed || input.identityError || input.previewing || input.saving) return false;
  if (!input.preview?.previewFingerprint || !input.preview.inspection.success) return false;
  if (!input.previewSettingsSnapshot || settingsSnapshot(input.currentSettings) !== input.previewSettingsSnapshot) return false;
  if (!input.preview.productionCandidate && !input.acknowledgement) return false;
  return true;
}
