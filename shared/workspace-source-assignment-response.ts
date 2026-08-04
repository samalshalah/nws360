export type WorkspaceSourceAssignmentSelectionDto = {
  id: number;
  clientId: number;
  publisherProfileId: number;
  status: string;
  priority: string;
  notes: string | null;
};

export type WorkspaceSourceAssignmentPublisherDto = {
  id: number;
  name: string;
  status: string;
  scopeType: string;
  verificationStatus: string;
};

export type WorkspaceSourceAssignmentChannelDto = {
  id: number;
  publisherProfileId: number;
  name: string;
  channelType: string;
  url?: string | null;
  normalizedUrl?: string | null;
  verificationStatus?: string | null;
  validationStatus?: string | null;
  lifecycleStatus?: string | null;
  isPrimary?: boolean;
};

export type WorkspaceSourceApprovedPublisherDto = {
  selection: WorkspaceSourceAssignmentSelectionDto;
  publisher: WorkspaceSourceAssignmentPublisherDto;
  channels: WorkspaceSourceAssignmentChannelDto[];
  channelCount: number;
  sourceLinkCount: number;
};

export type WorkspaceSourcePublisherEligibilitySummary = {
  approvedPublisherCount: number;
  eligibleChannelCount: number;
  excludedSelectionCount: number;
  excludedChannelCount: number;
};

export type WorkspaceSourceAssignmentReadinessDto = {
  technicalReady: boolean;
  lifecycleReady: boolean;
  monitoringReady: boolean;
  technicalBlockers: string[];
  lifecycleBlockers: string[];
  clientActivationReady?: boolean;
  clientActivationBlockers?: string[];
  workspaceActivationReady?: boolean;
  workspaceActivationBlockers?: string[];
  sourceAssignmentsConfigured: number;
  sourceAssignmentTestsPassed: number;
  sourceAssignmentTestsStale: number;
  sourceAssignmentsBlocked: number;
  blockers: string[];
};

export type WorkspaceSourceAssignmentResponseDto = {
  client?: { id: number; name: string } | null;
  workspace?: { id: number; name: string; status: string; active: boolean } | null;
  relevanceProfile?: { profileVersion?: number; topics?: string[]; entities?: string[] } | null;
  approvedPublishers?: unknown;
  publisherEligibilitySummary?: WorkspaceSourcePublisherEligibilitySummary;
  operationalSources?: unknown;
  assignments?: unknown;
  readiness?: Partial<WorkspaceSourceAssignmentReadinessDto> | null;
};

export type NormalizedWorkspaceSourceAssignmentResponse = {
  client: { id: number; name: string } | null;
  workspace: { id: number; name: string; status: string; active: boolean };
  relevanceProfile: { profileVersion?: number; topics?: string[]; entities?: string[] } | null;
  approvedPublishers: WorkspaceSourceApprovedPublisherDto[];
  publisherEligibilitySummary?: WorkspaceSourcePublisherEligibilitySummary;
  operationalSources: Array<{ id: number; name: string; type: string; active: boolean; publisherChannelId?: number | null }>;
  assignments: Array<Record<string, any>>;
  readiness: WorkspaceSourceAssignmentReadinessDto;
  skippedMalformedPublisherCount: number;
};

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSelection(value: unknown): WorkspaceSourceAssignmentSelectionDto | null {
  if (!isRecord(value)) return null;
  const id = finiteNumber(value.id);
  const clientId = finiteNumber(value.clientId);
  const publisherProfileId = finiteNumber(value.publisherProfileId);
  if (!id || !clientId || !publisherProfileId) return null;
  return {
    id,
    clientId,
    publisherProfileId,
    status: String(value.status || ""),
    priority: String(value.priority || "standard"),
    notes: value.notes == null ? null : String(value.notes),
  };
}

function normalizePublisher(value: unknown): WorkspaceSourceAssignmentPublisherDto | null {
  if (!isRecord(value)) return null;
  const id = finiteNumber(value.id);
  const name = String(value.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    status: String(value.status || ""),
    scopeType: String(value.scopeType || ""),
    verificationStatus: String(value.verificationStatus || ""),
  };
}

function normalizeChannel(value: unknown): WorkspaceSourceAssignmentChannelDto | null {
  if (!isRecord(value)) return null;
  const id = finiteNumber(value.id);
  const publisherProfileId = finiteNumber(value.publisherProfileId);
  const name = String(value.name || "").trim();
  const channelType = String(value.channelType || "").trim();
  if (!id || !publisherProfileId || !name || !channelType) return null;
  return {
    id,
    publisherProfileId,
    name,
    channelType,
    url: value.url == null ? null : String(value.url),
    normalizedUrl: value.normalizedUrl == null ? null : String(value.normalizedUrl),
    verificationStatus: value.verificationStatus == null ? null : String(value.verificationStatus),
    validationStatus: value.validationStatus == null ? null : String(value.validationStatus),
    lifecycleStatus: value.lifecycleStatus == null ? null : String(value.lifecycleStatus),
    isPrimary: Boolean(value.isPrimary),
  };
}

export function normalizeApprovedPublisherEntry(value: unknown): WorkspaceSourceApprovedPublisherDto | null {
  if (!isRecord(value)) return null;
  const selection = normalizeSelection(value.selection);
  const publisher = normalizePublisher(value.publisher);
  if (!selection || !publisher) return null;
  const channels = Array.isArray(value.channels) ? value.channels.map(normalizeChannel).filter((item): item is WorkspaceSourceAssignmentChannelDto => Boolean(item)) : [];
  return {
    selection,
    publisher,
    channels,
    channelCount: finiteNumber(value.channelCount) ?? channels.length,
    sourceLinkCount: finiteNumber(value.sourceLinkCount) ?? 0,
  };
}

function normalizeReadiness(value: unknown): WorkspaceSourceAssignmentReadinessDto {
  const input = isRecord(value) ? value : {};
  return {
    technicalReady: Boolean(input.technicalReady),
    lifecycleReady: Boolean(input.lifecycleReady),
    monitoringReady: Boolean(input.monitoringReady),
    technicalBlockers: Array.isArray(input.technicalBlockers) ? input.technicalBlockers.map(String) : [],
    lifecycleBlockers: Array.isArray(input.lifecycleBlockers) ? input.lifecycleBlockers.map(String) : [],
    clientActivationReady: input.clientActivationReady == null ? undefined : Boolean(input.clientActivationReady),
    clientActivationBlockers: Array.isArray(input.clientActivationBlockers) ? input.clientActivationBlockers.map(String) : undefined,
    workspaceActivationReady: input.workspaceActivationReady == null ? undefined : Boolean(input.workspaceActivationReady),
    workspaceActivationBlockers: Array.isArray(input.workspaceActivationBlockers) ? input.workspaceActivationBlockers.map(String) : undefined,
    sourceAssignmentsConfigured: finiteNumber(input.sourceAssignmentsConfigured) ?? 0,
    sourceAssignmentTestsPassed: finiteNumber(input.sourceAssignmentTestsPassed) ?? 0,
    sourceAssignmentTestsStale: finiteNumber(input.sourceAssignmentTestsStale) ?? 0,
    sourceAssignmentsBlocked: finiteNumber(input.sourceAssignmentsBlocked) ?? 0,
    blockers: Array.isArray(input.blockers) ? input.blockers.map(String) : [],
  };
}

export function normalizeWorkspaceSourceAssignmentResponse(input: WorkspaceSourceAssignmentResponseDto | null | undefined): NormalizedWorkspaceSourceAssignmentResponse {
  const approvedInput = Array.isArray(input?.approvedPublishers) ? input.approvedPublishers : [];
  const approvedPublishers = approvedInput.map(normalizeApprovedPublisherEntry).filter((item): item is WorkspaceSourceApprovedPublisherDto => Boolean(item));
  return {
    client: input?.client && typeof input.client === "object" ? input.client : null,
    workspace: input?.workspace && typeof input.workspace === "object"
      ? input.workspace
      : { id: 0, name: "Workspace", status: "unknown", active: false },
    relevanceProfile: input?.relevanceProfile || null,
    approvedPublishers,
    publisherEligibilitySummary: input?.publisherEligibilitySummary,
    operationalSources: Array.isArray(input?.operationalSources) ? input.operationalSources as NormalizedWorkspaceSourceAssignmentResponse["operationalSources"] : [],
    assignments: Array.isArray(input?.assignments) ? input.assignments as Array<Record<string, any>> : [],
    readiness: normalizeReadiness(input?.readiness),
    skippedMalformedPublisherCount: approvedInput.length - approvedPublishers.length,
  };
}
