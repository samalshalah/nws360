import assert from "node:assert/strict";
import {
  normalizeCreatePublisherRequest,
  normalizePublisherChannel,
  previewPublisherDuplicates,
  selectPrimaryAppearance,
} from "../shared/publisher-catalog";

type User = { id: number; role: string; userScope: string; clientId: number | null };
type MemoryState = {
  clients: any[];
  publishers: any[];
  aliases: any[];
  channels: any[];
  selections: any[];
  sources: any[];
  articles: any[];
  processingJobs: any[];
  auditLogs: any[];
  articleAppearances: any[];
  platformResetAudit: any[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function emptyState(): MemoryState {
  return {
    clients: [{ id: 1, name: "U.S. Embassy Baghdad" }, { id: 2, name: "French Embassy Baghdad" }],
    publishers: [],
    aliases: [],
    channels: [],
    selections: [],
    sources: [],
    articles: [],
    processingJobs: [],
    auditLogs: [],
    articleAppearances: [],
    platformResetAudit: [{ id: 1, result: "success" }],
  };
}

const platformAdmin: User = { id: 2, role: "admin", userScope: "platform", clientId: null };
const tenantAdmin: User = { id: 20, role: "client_admin", userScope: "tenant", clientId: 1 };

function error(code: string, status = 400) {
  const err: any = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

function assertPlatformAdmin(user: User) {
  if (!(user.role === "admin" && user.userScope === "platform" && user.clientId === null)) {
    throw error("platform_admin_required", 403);
  }
}

class MemoryPublisherCatalog {
  state = emptyState();
  ids = { publisher: 1, alias: 1, channel: 1, selection: 1, audit: 1, article: 1, appearance: 1, source: 1 };

  snapshot() {
    return clone({ state: this.state, ids: this.ids });
  }

  restore(snapshot: ReturnType<MemoryPublisherCatalog["snapshot"]>) {
    this.state = snapshot.state;
    this.ids = snapshot.ids;
  }

  preview(input: unknown) {
    const before = this.snapshot();
    const normalized = normalizeCreatePublisherRequest(input);
    const duplicateCandidates = previewPublisherDuplicates(
      {
        name: normalized.profile.name,
        normalizedPrimaryDomain: normalized.profile.normalizedPrimaryDomain,
        aliases: normalized.aliases,
        channels: normalized.channels,
        countryCode: normalized.profile.countryCode,
      },
      this.state.publishers.map((publisher) => ({
        id: publisher.id,
        name: publisher.name,
        normalizedPrimaryDomain: publisher.normalizedPrimaryDomain,
        aliases: this.state.aliases.filter((alias) => alias.publisherProfileId === publisher.id),
        channels: this.state.channels.filter((channel) => channel.publisherProfileId === publisher.id),
        countryCode: publisher.countryCode,
      })),
    );
    assert.deepEqual(this.snapshot(), before, "publisher preview performed a write");
    return { writes: false, normalized, duplicateCandidates };
  }

  create(input: unknown, user = platformAdmin, failAt?: "alias" | "channel" | "audit") {
    assertPlatformAdmin(user);
    const before = this.snapshot();
    try {
      const normalized = normalizeCreatePublisherRequest(input);
      if (normalized.profile.scopeType === "global" && normalized.profile.ownerClientId !== null) throw error("invalid_scope_owner");
      if (normalized.profile.scopeType === "client_private" && !this.state.clients.some((client) => client.id === normalized.profile.ownerClientId)) throw error("client_not_found", 404);
      if (this.state.publishers.some((publisher) => publisher.canonicalKey === normalized.profile.canonicalKey)) throw error("duplicate_publisher", 409);
      if (normalized.profile.normalizedPrimaryDomain && this.state.publishers.some((publisher) =>
        publisher.normalizedPrimaryDomain === normalized.profile.normalizedPrimaryDomain
        && publisher.scopeType === normalized.profile.scopeType
        && (publisher.ownerClientId || null) === (normalized.profile.ownerClientId || null)
      )) throw error("duplicate_publisher_domain", 409);

      const profile = { ...normalized.profile, id: this.ids.publisher++, createdBy: user.id };
      this.state.publishers.push(profile);

      if (failAt === "alias") throw error("alias_failure");
      const aliases = normalized.aliases.map((alias) => ({ ...alias, id: this.ids.alias++, publisherProfileId: profile.id }));
      this.state.aliases.push(...aliases);

      if (failAt === "channel") throw error("channel_failure");
      const channels = normalized.channels.map((channel) => {
        const normalizedChannel = normalizePublisherChannel(channel, profile.id);
        const identity = normalizedChannel.normalizedUrl || normalizedChannel.externalId || normalizedChannel.handle || normalizedChannel.channelKey;
        if (this.state.channels.some((existing) => existing.normalizedUrl && normalizedChannel.normalizedUrl && existing.normalizedUrl === normalizedChannel.normalizedUrl)) throw error("duplicate_publisher_channel", 409);
        return { ...normalizedChannel, id: this.ids.channel++, publisherProfileId: profile.id, identity };
      });
      const channelKeys = new Set<string>();
      for (const channel of channels) {
        if (channelKeys.has(channel.channelKey)) throw error("duplicate_publisher_channel", 409);
        channelKeys.add(channel.channelKey);
      }
      this.state.channels.push(...channels);

      if (failAt === "audit") throw error("audit_failure");
      const auditLog = { id: this.ids.audit++, action: "publisher_profile_create", entityId: profile.id, clientId: profile.ownerClientId };
      this.state.auditLogs.push(auditLog);
      return { profile, aliases, channels, auditLog };
    } catch (err) {
      this.restore(before);
      throw err;
    }
  }

  createChannel(publisherId: number, input: unknown, user = platformAdmin) {
    assertPlatformAdmin(user);
    const publisher = this.state.publishers.find((item) => item.id === publisherId);
    if (!publisher) throw error("publisher_not_found", 404);
    const normalized = normalizePublisherChannel(input, publisherId);
    if (this.state.channels.some((channel) => channel.normalizedUrl && normalized.normalizedUrl && channel.normalizedUrl === normalized.normalizedUrl)) {
      throw error("duplicate_publisher_channel", 409);
    }
    const channel = { ...normalized, id: this.ids.channel++, publisherProfileId: publisherId };
    this.state.channels.push(channel);
    this.state.auditLogs.push({ id: this.ids.audit++, action: "publisher_channel_create", entityId: channel.id });
    return channel;
  }

  visiblePublishers(clientId?: number) {
    return this.state.publishers.filter((publisher) => publisher.scopeType === "global" || publisher.ownerClientId === clientId);
  }

  select(clientId: number, publisherProfileId: number, user = platformAdmin, status = "approved") {
    assertPlatformAdmin(user);
    if (!this.state.clients.some((client) => client.id === clientId)) throw error("client_not_found", 404);
    const publisher = this.visiblePublishers(clientId).find((item) => item.id === publisherProfileId);
    if (!publisher) throw error("publisher_not_found", 404);
    if (this.state.selections.some((item) => item.clientId === clientId && item.publisherProfileId === publisherProfileId)) throw error("duplicate_client_publisher_selection", 409);
    const selection = { id: this.ids.selection++, clientId, publisherProfileId, status, priority: "standard", selectedBy: user.id };
    this.state.selections.push(selection);
    this.state.auditLogs.push({ id: this.ids.audit++, action: "client_publisher_selection", entityId: selection.id, clientId });
    return selection;
  }

  readiness(clientId: number) {
    const approvedSelections = this.state.selections.filter((selection) => selection.clientId === clientId && selection.status === "approved");
    const approvedIds = new Set(approvedSelections.map((selection) => selection.publisherProfileId));
    const channelIds = new Set(this.state.channels
      .filter((channel) => approvedIds.has(channel.publisherProfileId) && (channel.lifecycleStatus === "active" || channel.verificationStatus === "verified"))
      .map((channel) => channel.id));
    return {
      publisherProfilesConfigured: approvedSelections.length,
      sourceChannelsConfigured: channelIds.size,
      sourceAssignmentsConfigured: this.state.sources.filter((source) => source.clientId === clientId && channelIds.has(source.publisherChannelId)).length,
      monitoringReady: false,
    };
  }

  addAppearance(appearance: any) {
    const row = { id: this.ids.appearance++, ...clone(appearance) };
    this.state.articleAppearances.push(row);
    return row;
  }

  addSource(source: any) {
    const row = { id: this.ids.source++, publisherChannelId: null, ...source };
    this.state.sources.push(row);
    return row;
  }
}

function publisherRequest(overrides: Record<string, any> = {}) {
  return {
    profile: {
      name: "Shafaq News",
      organizationType: "digital_news",
      primaryDomain: "https://www.shafaq.com",
      countryCode: "IQ",
      languageCodes: ["ar", "ku", "en"],
      verificationStatus: "verified",
      scopeType: "global",
      ...(overrides.profile || {}),
    },
    aliases: overrides.aliases ?? [
      { alias: "Shafaq News", languageCode: "en", aliasType: "name" },
      { alias: "شفاق نيوز", languageCode: "ar", aliasType: "translated_name" },
    ],
    channels: overrides.channels ?? [
      { channelType: "website", url: "https://www.shafaq.com", verificationStatus: "verified", lifecycleStatus: "active" },
    ],
  };
}

const catalog = new MemoryPublisherCatalog();

const preview = catalog.preview(publisherRequest());
assert.equal(preview.writes, false);
assert.equal(catalog.state.publishers.length, 0);

const created = catalog.create(publisherRequest());
assert.equal(catalog.state.publishers.length, 1);
assert.equal(catalog.state.aliases.length, 2);
assert.equal(catalog.state.channels.length, 1);
assert.equal(catalog.state.auditLogs.length, 1);
assert.equal(created.profile.ownerClientId, null);

assert.throws(() => catalog.create(publisherRequest({
  profile: { name: "Alias Failure", primaryDomain: "alias.example", canonicalKey: "global:alias-failure" },
  channels: [{ channelType: "website", url: "https://alias.example", verificationStatus: "verified", lifecycleStatus: "active" }],
}), platformAdmin, "alias"), /alias_failure/);
assert.equal(catalog.state.publishers.length, 1);
assert.throws(() => catalog.create(publisherRequest({
  profile: { name: "Channel Failure", primaryDomain: "channel.example", canonicalKey: "global:channel-failure" },
  channels: [{ channelType: "website", url: "https://channel.example", verificationStatus: "verified", lifecycleStatus: "active" }],
}), platformAdmin, "channel"), /channel_failure/);
assert.equal(catalog.state.aliases.length, 2);
assert.throws(() => catalog.create(publisherRequest({
  profile: { name: "Audit Failure", primaryDomain: "audit.example", canonicalKey: "global:audit-failure" },
  channels: [{ channelType: "website", url: "https://audit.example", verificationStatus: "verified", lifecycleStatus: "active" }],
}), platformAdmin, "audit"), /audit_failure/);
assert.equal(catalog.state.channels.length, 1);

assert.throws(() => catalog.create(publisherRequest()), (err: any) => err.code === "duplicate_publisher");
const duplicatePreview = catalog.preview(publisherRequest({ profile: { name: "Shafaq Duplicate", canonicalKey: "global:shafaq-duplicate" } }));
assert.ok(duplicatePreview.duplicateCandidates.some((candidate) => candidate.signal === "normalized_primary_domain"));
assert.throws(() => catalog.create(publisherRequest({ profile: { name: "Shafaq Duplicate", canonicalKey: "global:shafaq-duplicate" } })), (err: any) => err.code === "duplicate_publisher_domain");
assert.throws(() => catalog.createChannel(created.profile.id, { channelType: "rss", url: "https://www.shafaq.com" }), (err: any) => err.code === "duplicate_publisher_channel");

const concurrentCatalog = new MemoryPublisherCatalog();
const concurrentResults = await Promise.allSettled([
  Promise.resolve().then(() => concurrentCatalog.create(publisherRequest())),
  Promise.resolve().then(() => concurrentCatalog.create(publisherRequest())),
]);
assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(concurrentCatalog.state.publishers.length, 1);
assert.equal(concurrentCatalog.state.auditLogs.length, 1);

assert.throws(() => catalog.create(publisherRequest({ profile: { name: "Bad Private", scopeType: "client_private", ownerClientId: null, canonicalKey: "client:missing" } })), /client_private/);
const privatePublisher = catalog.create(publisherRequest({
  profile: { name: "Private Monitor", primaryDomain: "private-monitor.example", canonicalKey: "client:1:private-monitor", scopeType: "client_private", ownerClientId: 1 },
  aliases: [],
  channels: [{ channelType: "telegram", handle: "privateMonitor", lifecycleStatus: "active" }],
}));
assert.ok(catalog.visiblePublishers(1).some((publisher) => publisher.id === privatePublisher.profile.id));
assert.ok(!catalog.visiblePublishers(2).some((publisher) => publisher.id === privatePublisher.profile.id));

catalog.select(1, created.profile.id);
catalog.select(1, privatePublisher.profile.id);
assert.throws(() => catalog.select(2, privatePublisher.profile.id), (err: any) => err.code === "publisher_not_found");
assert.throws(() => catalog.select(1, created.profile.id), (err: any) => err.code === "duplicate_client_publisher_selection");
assert.equal(catalog.state.sources.length, 0);
catalog.createChannel(privatePublisher.profile.id, { channelType: "facebook", url: "https://facebook.com/privateMonitor" });
assert.equal(catalog.state.sources.length, 0);
assert.equal(catalog.state.articles.length, 0);
assert.equal(catalog.state.processingJobs.length, 0);
assert.throws(() => normalizePublisherChannel({ channelType: "google_news", url: "https://news.google.com/search?q=iraq" }), /Google News/);

const googleAppearance = catalog.addAppearance({
  clientId: 1,
  articleId: 1,
  publisherProfileId: created.profile.id,
  collectorType: "google_news",
  collectorUrl: "https://news.google.com/articles/example",
  collectorQuery: "Iraq oil",
  headline: "Iraq oil story",
  metadata: { actualPublisherDomain: "shafaq.com" },
});
assert.equal(googleAppearance.publisherProfileId, created.profile.id);
assert.notEqual(created.profile.name.toLowerCase(), "google news");
assert.equal(googleAppearance.collectorType, "google_news");

const websiteAppearance = catalog.addAppearance({
  clientId: 1,
  articleId: 1,
  publisherProfileId: created.profile.id,
  appearanceType: "original",
  publisherChannelType: "website",
  headline: "Original headline",
  publishedAt: "2026-08-02T08:00:00Z",
});
const socialAppearance = catalog.addAppearance({
  clientId: 1,
  articleId: 1,
  publisherProfileId: created.profile.id,
  appearanceType: "social",
  publisherChannelType: "facebook",
  caption: "Facebook caption",
  engagementMetadata: { shares: 10 },
  publishedAt: "2026-08-02T09:00:00Z",
});
assert.equal(catalog.state.articleAppearances.filter((item) => item.articleId === 1).length, 3);
assert.equal(selectPrimaryAppearance([socialAppearance, websiteAppearance])?.id, websiteAppearance.id);
assert.equal(socialAppearance.caption, "Facebook caption");
assert.deepEqual(socialAppearance.engagementMetadata, { shares: 10 });

const otherPublisher = catalog.create(publisherRequest({
  profile: { name: "Rudaw", primaryDomain: "rudaw.net", canonicalKey: "global:rudaw" },
  aliases: [],
  channels: [],
}));
catalog.state.articles.push({ id: catalog.ids.article++, publisherProfileId: created.profile.id, title: "Coverage item" });
catalog.state.articles.push({ id: catalog.ids.article++, publisherProfileId: otherPublisher.profile.id, title: "Coverage item" });
assert.equal(new Set(catalog.state.articles.map((article) => article.publisherProfileId)).size, 2);

const nullLinkedSource = catalog.addSource({ clientId: 1, name: "Legacy RSS", url: "https://example.com/rss" });
assert.equal(nullLinkedSource.publisherChannelId, null);
assert.equal(platformAdmin.clientId, null);
assert.throws(() => catalog.create(publisherRequest({ profile: { name: "Tenant Attempt", canonicalKey: "global:tenant-attempt", primaryDomain: "tenant-attempt.example" } }), tenantAdmin), (err: any) => err.code === "platform_admin_required");
assert.throws(() => catalog.select(2, privatePublisher.profile.id), (err: any) => err.status === 404);

const readiness = catalog.readiness(1);
assert.equal(readiness.publisherProfilesConfigured, 2);
assert.equal(readiness.sourceChannelsConfigured >= 2, true);
assert.equal(readiness.sourceAssignmentsConfigured, 0);
assert.equal(readiness.monitoringReady, false);
assert.deepEqual(catalog.state.platformResetAudit, [{ id: 1, result: "success" }]);

console.log("publisher catalog behavioral tests passed");
