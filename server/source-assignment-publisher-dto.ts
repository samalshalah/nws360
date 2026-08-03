import type { ClientPublisherSelection, PublisherChannel, PublisherProfile } from "@shared/schema";
import { isAutomatedChannelType } from "@shared/workspace-source-assignments";
import type {
  WorkspaceSourceApprovedPublisherDto,
  WorkspaceSourceAssignmentChannelDto,
  WorkspaceSourcePublisherEligibilitySummary,
} from "@shared/workspace-source-assignment-response";

export type ClientPublisherSelectionStorageRow = ClientPublisherSelection & {
  publisher?: PublisherProfile | null;
  channelCount?: number | string | null;
  sourceLinkCount?: number | string | null;
};

export type PublisherSelectionWithChannels = {
  selection: ClientPublisherSelectionStorageRow;
  channels: PublisherChannel[];
};

export type WorkspaceSourceAssignmentPublisherResponse = {
  approvedPublishers: WorkspaceSourceApprovedPublisherDto[];
  publisherEligibilitySummary: WorkspaceSourcePublisherEligibilitySummary;
};

function numericCount(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeString(value: unknown): string {
  return String(value || "");
}

function metadataIndicatesGoogleNews(channel: PublisherChannel): boolean {
  const metadata = channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
    ? channel.metadata as Record<string, unknown>
    : {};
  const values = [
    channel.channelType,
    metadata.collectorType,
    metadata.collector,
    metadata.provider,
    metadata.sourceType,
    metadata.feedType,
  ].map((value) => safeString(value).toLowerCase().replace(/\s+/g, "_"));
  return values.includes("google_news") || metadata.googleNews === true;
}

export function isEligibleWorkspaceSourcePublisher(selection: ClientPublisherSelectionStorageRow): boolean {
  const publisher = selection.publisher;
  return Boolean(
    selection.status === "approved"
    && publisher
    && publisher.status === "active"
    && publisher.verificationStatus === "verified",
  );
}

export function isEligibleWorkspaceSourceChannel(channel: PublisherChannel, publisherId: number): boolean {
  return Boolean(
    channel.publisherProfileId === publisherId
    && channel.lifecycleStatus === "active"
    && channel.validationStatus === "valid"
    && channel.verificationStatus === "verified"
    && isAutomatedChannelType(channel.channelType)
    && !metadataIndicatesGoogleNews(channel),
  );
}

function toChannelDto(channel: PublisherChannel): WorkspaceSourceAssignmentChannelDto {
  return {
    id: channel.id,
    publisherProfileId: channel.publisherProfileId,
    name: channel.name,
    channelType: channel.channelType,
    url: channel.url || null,
    normalizedUrl: channel.normalizedUrl || null,
    verificationStatus: channel.verificationStatus || null,
    validationStatus: channel.validationStatus || null,
    lifecycleStatus: channel.lifecycleStatus || null,
    isPrimary: Boolean(channel.isPrimary),
  };
}

function toApprovedPublisherDto(selection: ClientPublisherSelectionStorageRow, channels: PublisherChannel[]): WorkspaceSourceApprovedPublisherDto | null {
  const publisher = selection.publisher;
  if (!publisher) return null;
  const eligibleChannels = channels
    .filter((channel) => isEligibleWorkspaceSourceChannel(channel, publisher.id))
    .map(toChannelDto);
  return {
    selection: {
      id: selection.id,
      clientId: selection.clientId,
      publisherProfileId: selection.publisherProfileId,
      status: selection.status,
      priority: selection.priority,
      notes: selection.notes || null,
    },
    publisher: {
      id: publisher.id,
      name: publisher.name,
      status: publisher.status,
      scopeType: publisher.scopeType,
      verificationStatus: publisher.verificationStatus,
    },
    channels: eligibleChannels,
    channelCount: eligibleChannels.length,
    sourceLinkCount: numericCount(selection.sourceLinkCount),
  };
}

export function buildWorkspaceSourceAssignmentPublisherResponse(items: PublisherSelectionWithChannels[]): WorkspaceSourceAssignmentPublisherResponse {
  const approvedPublishers: WorkspaceSourceApprovedPublisherDto[] = [];
  let excludedSelectionCount = 0;
  let excludedChannelCount = 0;

  for (const item of items) {
    const publisherId = item.selection.publisher?.id;
    const rawChannelCount = Array.isArray(item.channels) ? item.channels.length : 0;
    if (!isEligibleWorkspaceSourcePublisher(item.selection) || !publisherId) {
      excludedSelectionCount += 1;
      excludedChannelCount += rawChannelCount;
      continue;
    }

    const dto = toApprovedPublisherDto(item.selection, item.channels || []);
    if (!dto) {
      excludedSelectionCount += 1;
      excludedChannelCount += rawChannelCount;
      continue;
    }
    excludedChannelCount += Math.max(0, rawChannelCount - dto.channels.length);
    approvedPublishers.push(dto);
  }

  return {
    approvedPublishers,
    publisherEligibilitySummary: {
      approvedPublisherCount: approvedPublishers.length,
      eligibleChannelCount: approvedPublishers.reduce((total, item) => total + item.channels.length, 0),
      excludedSelectionCount,
      excludedChannelCount,
    },
  };
}
