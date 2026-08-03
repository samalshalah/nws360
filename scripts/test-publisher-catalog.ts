import assert from "node:assert/strict";
import {
  buildPublisherCanonicalKey,
  buildPublisherDomainScopeKey,
  normalizeCreatePublisherRequest,
  normalizePublisherAlias,
  normalizePublisherChannel,
  normalizePublisherProfile,
  previewPublisherDuplicates,
  selectPrimaryAppearance,
  validatePublisherCanonicalKey,
} from "../shared/publisher-catalog";
import { fetchPublicUrlText, isBlockedNetworkAddress, isGloballyRoutableAddress, validatePublisherChannel } from "../server/publisher-channel-validator";

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
      if (normalized.profile.domainScopeKey && this.state.publishers.some((publisher) => publisher.domainScopeKey === normalized.profile.domainScopeKey)) throw error("duplicate_publisher_domain", 409);

      const profile = { ...normalized.profile, id: this.ids.publisher++, createdBy: user.id };
      this.state.publishers.push(profile);

      if (failAt === "alias") throw error("alias_failure");
      const aliases = normalized.aliases.map((alias) => ({ ...alias, id: this.ids.alias++, publisherProfileId: profile.id }));
      for (const alias of aliases) {
        if (this.state.aliases.some((existing) =>
          existing.publisherProfileId === profile.id
          && existing.normalizedAlias === alias.normalizedAlias
          && existing.languageCode === alias.languageCode
        )) throw error("duplicate_publisher_alias", 409);
      }
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

  updatePublisher(publisherId: number, input: Record<string, any>, user = platformAdmin, failAt?: "audit") {
    assertPlatformAdmin(user);
    const before = this.snapshot();
    try {
      const current = this.state.publishers.find((item) => item.id === publisherId);
      if (!current) throw error("publisher_not_found", 404);
      if (input.canonicalKey && String(input.canonicalKey).toLowerCase() !== current.canonicalKey) {
        throw error("publisher_canonical_key_immutable", 409);
      }
      const normalized = normalizePublisherProfile({ ...current, ...input, canonicalKey: current.canonicalKey });
      if (normalized.domainScopeKey && this.state.publishers.some((publisher) => publisher.id !== publisherId && publisher.domainScopeKey === normalized.domainScopeKey)) {
        throw error("duplicate_publisher_domain", 409);
      }
      if (current.scopeType !== normalized.scopeType || current.ownerClientId !== normalized.ownerClientId) {
        const invalidSelection = this.state.selections.some((selection) =>
          selection.publisherProfileId === publisherId
          && normalized.scopeType === "client_private"
          && selection.clientId !== normalized.ownerClientId
        );
        const invalidSource = this.state.sources.some((source) => {
          const channel = this.state.channels.find((item) => item.id === source.publisherChannelId);
          return channel?.publisherProfileId === publisherId
            && normalized.scopeType === "client_private"
            && source.clientId !== normalized.ownerClientId;
        });
        if (invalidSelection || invalidSource) throw error("publisher_scope_change_conflict", 409);
      }
      Object.assign(current, normalized);
      if (failAt === "audit") throw error("audit_failure");
      this.state.auditLogs.push({ id: this.ids.audit++, action: "publisher_profile_update", entityId: publisherId, clientId: current.ownerClientId });
      return current;
    } catch (err) {
      this.restore(before);
      throw err;
    }
  }

  createAlias(publisherId: number, input: unknown, user = platformAdmin, failAt?: "audit") {
    assertPlatformAdmin(user);
    const before = this.snapshot();
    try {
      const publisher = this.state.publishers.find((item) => item.id === publisherId);
      if (!publisher) throw error("publisher_not_found", 404);
      const normalized = normalizePublisherAlias(input);
      if (this.state.aliases.some((alias) =>
        alias.publisherProfileId === publisherId
        && alias.normalizedAlias === normalized.normalizedAlias
        && alias.languageCode === normalized.languageCode
      )) throw error("duplicate_publisher_alias", 409);
      const alias = { ...normalized, id: this.ids.alias++, publisherProfileId: publisherId };
      this.state.aliases.push(alias);
      if (failAt === "audit") throw error("audit_failure");
      this.state.auditLogs.push({ id: this.ids.audit++, action: "publisher_alias_create", entityId: alias.id, clientId: publisher.ownerClientId });
      return alias;
    } catch (err) {
      this.restore(before);
      throw err;
    }
  }

  createChannel(publisherId: number, input: unknown, user = platformAdmin, failAt?: "audit") {
    assertPlatformAdmin(user);
    const before = this.snapshot();
    try {
    const publisher = this.state.publishers.find((item) => item.id === publisherId);
    if (!publisher) throw error("publisher_not_found", 404);
    const normalized = normalizePublisherChannel(input, publisherId);
    if (this.state.channels.some((channel) =>
      (channel.normalizedUrl && normalized.normalizedUrl && channel.normalizedUrl === normalized.normalizedUrl)
      || channel.channelKey === normalized.channelKey
    )) {
      throw error("duplicate_publisher_channel", 409);
    }
    const channel = { ...normalized, id: this.ids.channel++, publisherProfileId: publisherId };
    this.state.channels.push(channel);
    if (failAt === "audit") throw error("audit_failure");
    this.state.auditLogs.push({ id: this.ids.audit++, action: "publisher_channel_create", entityId: channel.id });
    return channel;
    } catch (err) {
      this.restore(before);
      throw err;
    }
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
      sourceAssignmentsConfigured: 0,
      monitoringReady: false,
    };
  }

  addAppearance(appearance: any) {
    const normalizedAppearance = { ...appearance };
    const article = this.state.articles.find((item) => item.id === normalizedAppearance.articleId && item.clientId === normalizedAppearance.clientId);
    if (!article) throw error("appearance_article_client_mismatch", 409);
    if (normalizedAppearance.sourceId != null) {
      const source = this.state.sources.find((item) => item.id === normalizedAppearance.sourceId && item.clientId === normalizedAppearance.clientId);
      if (!source) throw error("appearance_source_client_mismatch", 409);
      if (source.publisherChannelId != null) {
        const sourceChannel = this.state.channels.find((channel) => channel.id === source.publisherChannelId);
        if (!sourceChannel) throw error("appearance_source_channel_mismatch", 409);
        if (normalizedAppearance.publisherChannelId != null && normalizedAppearance.publisherChannelId !== source.publisherChannelId) throw error("appearance_source_channel_mismatch", 409);
        if (normalizedAppearance.publisherProfileId != null && normalizedAppearance.publisherProfileId !== sourceChannel.publisherProfileId) throw error("appearance_source_channel_mismatch", 409);
        normalizedAppearance.publisherChannelId = source.publisherChannelId;
        normalizedAppearance.publisherProfileId = sourceChannel.publisherProfileId;
      }
    }
    if (normalizedAppearance.publisherChannelId != null && normalizedAppearance.publisherProfileId == null) {
      throw error("appearance_channel_requires_publisher", 400);
    }
    const publisher = normalizedAppearance.publisherProfileId != null ? this.state.publishers.find((item) => item.id === normalizedAppearance.publisherProfileId) : null;
    if (normalizedAppearance.publisherProfileId != null && !publisher) throw error("publisher_not_found", 404);
    if (publisher?.scopeType === "client_private" && publisher.ownerClientId !== normalizedAppearance.clientId) {
      throw error("appearance_private_publisher_client_mismatch", 409);
    }
    if (normalizedAppearance.publisherChannelId != null && !this.state.channels.some((channel) => channel.id === normalizedAppearance.publisherChannelId && channel.publisherProfileId === normalizedAppearance.publisherProfileId)) {
      throw error("appearance_channel_publisher_mismatch", 409);
    }
    const row = { id: this.ids.appearance++, ...clone(normalizedAppearance) };
    this.state.articleAppearances.push(row);
    return row;
  }

  addArticle(article: any) {
    const row = { id: this.ids.article++, clientId: 1, ...article };
    this.state.articles.push(row);
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

assert.equal(buildPublisherCanonicalKey("global", "Shafaq News"), "global:shafaq-news");
assert.equal(buildPublisherCanonicalKey("client_private", "Private Monitor", 1), "client:1:private-monitor");
assert.equal(validatePublisherCanonicalKey("global:shafaq-news", "global", null), "global:shafaq-news");
assert.equal(validatePublisherCanonicalKey("client:1:private-monitor", "client_private", 1), "client:1:private-monitor");
assert.throws(() => validatePublisherCanonicalKey("client:1:bad-global", "global", null), /Global publisher canonicalKey/);
assert.throws(() => validatePublisherCanonicalKey("global:bad-private", "client_private", 1), /Client-private publisher canonicalKey/);
assert.throws(() => validatePublisherCanonicalKey("client:2:wrong-owner", "client_private", 1), /Client-private publisher canonicalKey/);
assert.equal(buildPublisherDomainScopeKey("global", "shafaq.com", null), "global:shafaq.com");
assert.equal(buildPublisherDomainScopeKey("client_private", "private.example", 1), "client:1:private.example");
assert.equal(buildPublisherDomainScopeKey("global", null, null), null);

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
assert.throws(() => catalog.updatePublisher(created.profile.id, { canonicalKey: "global:changed" }), (err: any) => err.code === "publisher_canonical_key_immutable");

const concurrentCatalog = new MemoryPublisherCatalog();
const concurrentResults = await Promise.allSettled([
  Promise.resolve().then(() => concurrentCatalog.create(publisherRequest({ profile: { canonicalKey: "global:domain-race-a" } }))),
  Promise.resolve().then(() => concurrentCatalog.create(publisherRequest({ profile: { canonicalKey: "global:domain-race-b" } }))),
]);
assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(concurrentCatalog.state.publishers.length, 1);
assert.equal(concurrentCatalog.state.auditLogs.length, 1);

const canonicalRace = new MemoryPublisherCatalog();
const canonicalRaceResults = await Promise.allSettled([
  Promise.resolve().then(() => canonicalRace.create(publisherRequest({ profile: { primaryDomain: "canonical-a.example", canonicalKey: "global:same-key" } }))),
  Promise.resolve().then(() => canonicalRace.create(publisherRequest({ profile: { primaryDomain: "canonical-b.example", canonicalKey: "global:same-key" } }))),
]);
assert.equal(canonicalRaceResults.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(canonicalRace.state.publishers.length, 1);

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
assert.throws(() => normalizePublisherChannel({ channelType: "rss", url: "https://user:password@example.com/feed" }), /credentials/);
assert.throws(() => normalizePublisherChannel({ channelType: "rss", url: "https://user%3Aname:pass%40word@example.com/feed" }), /credentials/);
const noLanguageAlias = catalog.createAlias(created.profile.id, { alias: "Shafaq" });
assert.equal(noLanguageAlias.languageCode, "und");
assert.throws(() => catalog.createAlias(created.profile.id, { alias: "Shafaq" }), (err: any) => err.code === "duplicate_publisher_alias");
assert.throws(() => catalog.createAlias(created.profile.id, { alias: "Shafaq", languageCode: "und" }), (err: any) => err.code === "duplicate_publisher_alias");
assert.equal(catalog.createAlias(created.profile.id, { alias: "Shafaq", languageCode: "ar" }).languageCode, "ar");
const aliasRaceResults = await Promise.allSettled([
  Promise.resolve().then(() => catalog.createAlias(created.profile.id, { alias: "Race Alias" })),
  Promise.resolve().then(() => catalog.createAlias(created.profile.id, { alias: "Race Alias" })),
]);
assert.equal(aliasRaceResults.filter((result) => result.status === "fulfilled").length, 1);
const aliasAuditBefore = catalog.state.auditLogs.length;
assert.throws(() => catalog.createAlias(created.profile.id, { alias: "Rollback Alias" }, platformAdmin, "audit"), /audit_failure/);
assert.equal(catalog.state.aliases.some((alias) => alias.alias === "Rollback Alias"), false);
assert.equal(catalog.state.auditLogs.length, aliasAuditBefore);
const channelAuditBefore = catalog.state.auditLogs.length;
assert.throws(() => catalog.createChannel(created.profile.id, { channelType: "rss", url: "https://rollback.example/rss.xml" }, platformAdmin, "audit"), /audit_failure/);
assert.equal(catalog.state.channels.some((channel) => channel.normalizedUrl === "https://rollback.example/rss.xml"), false);
assert.equal(catalog.state.auditLogs.length, channelAuditBefore);
const channelRaceCatalog = new MemoryPublisherCatalog();
const channelRacePublisher = channelRaceCatalog.create(publisherRequest({ profile: { primaryDomain: "channel-race.example", canonicalKey: "global:channel-race" }, channels: [] }));
const channelRaceResults = await Promise.allSettled([
  Promise.resolve().then(() => channelRaceCatalog.createChannel(channelRacePublisher.profile.id, { channelType: "rss", url: "https://channel-race.example/feed.xml" })),
  Promise.resolve().then(() => channelRaceCatalog.createChannel(channelRacePublisher.profile.id, { channelType: "rss", url: "https://channel-race.example/feed.xml" })),
]);
assert.equal(channelRaceResults.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(channelRaceCatalog.state.channels.length, 1);
assert.equal(channelRaceCatalog.state.auditLogs.filter((log) => log.action === "publisher_channel_create").length, 1);

const baseArticle = catalog.addArticle({ clientId: 1, title: "Base article" });
const googleAppearance = catalog.addAppearance({
  clientId: 1,
  articleId: baseArticle.id,
  publisherProfileId: created.profile.id,
  appearanceType: "collector",
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
  articleId: baseArticle.id,
  publisherProfileId: created.profile.id,
  publisherChannelId: created.channels[0].id,
  appearanceType: "original",
  publisherChannelType: "website",
  headline: "Original headline",
  publishedAt: "2026-08-02T08:00:00Z",
});
const socialAppearance = catalog.addAppearance({
  clientId: 1,
  articleId: baseArticle.id,
  publisherProfileId: created.profile.id,
  appearanceType: "social",
  publisherChannelType: "facebook",
  caption: "Facebook caption",
  engagementMetadata: { shares: 10 },
  publishedAt: "2026-08-02T09:00:00Z",
});
assert.equal(catalog.state.articleAppearances.filter((item) => item.articleId === baseArticle.id).length, 3);
assert.equal(selectPrimaryAppearance([socialAppearance, websiteAppearance])?.id, websiteAppearance.id);
assert.equal(socialAppearance.caption, "Facebook caption");
assert.deepEqual(socialAppearance.engagementMetadata, { shares: 10 });
const clientTwoArticle = catalog.addArticle({ clientId: 2, title: "Client two" });
const clientTwoSource = catalog.addSource({ clientId: 2, name: "Client two source", url: "https://client-two.example/rss" });
assert.throws(() => catalog.addAppearance({ clientId: 1, articleId: clientTwoArticle.id, publisherProfileId: created.profile.id, appearanceType: "original", appearanceKey: "bad-article" }), (err: any) => err.code === "appearance_article_client_mismatch");
assert.throws(() => catalog.addAppearance({ clientId: 1, articleId: baseArticle.id, sourceId: clientTwoSource.id, publisherProfileId: created.profile.id, appearanceType: "original", appearanceKey: "bad-source" }), (err: any) => err.code === "appearance_source_client_mismatch");
assert.throws(() => catalog.addAppearance({ clientId: 1, articleId: baseArticle.id, publisherProfileId: privatePublisher.profile.id, publisherChannelId: created.channels[0].id, appearanceType: "original", appearanceKey: "bad-channel" }), (err: any) => err.code === "appearance_channel_publisher_mismatch");
assert.throws(() => catalog.addAppearance({ clientId: 2, articleId: clientTwoArticle.id, publisherProfileId: privatePublisher.profile.id, appearanceType: "original", appearanceKey: "bad-private" }), (err: any) => err.code === "appearance_private_publisher_client_mismatch");
assert.throws(() => catalog.addAppearance({ clientId: 1, articleId: baseArticle.id, publisherChannelId: created.channels[0].id, appearanceType: "original", appearanceKey: "missing-publisher" }), (err: any) => err.code === "appearance_channel_requires_publisher");
const sourceWithChannel = catalog.addSource({ clientId: 1, name: "Shafaq source", url: "https://shafaq.com/rss", publisherChannelId: created.channels[0].id });
const derivedAppearance = catalog.addAppearance({ clientId: 1, articleId: baseArticle.id, sourceId: sourceWithChannel.id, appearanceType: "rss", appearanceKey: "derived-from-source" });
assert.equal(derivedAppearance.publisherChannelId, created.channels[0].id);
assert.equal(derivedAppearance.publisherProfileId, created.profile.id);
assert.throws(() => catalog.addAppearance({ clientId: 1, articleId: baseArticle.id, sourceId: sourceWithChannel.id, publisherProfileId: privatePublisher.profile.id, publisherChannelId: privatePublisher.channels[0].id, appearanceType: "rss", appearanceKey: "source-channel-mismatch" }), (err: any) => err.code === "appearance_source_channel_mismatch");

const otherPublisher = catalog.create(publisherRequest({
  profile: { name: "Rudaw", primaryDomain: "rudaw.net", canonicalKey: "global:rudaw" },
  aliases: [],
  channels: [],
}));
catalog.state.articles.push({ id: catalog.ids.article++, publisherProfileId: created.profile.id, title: "Coverage item" });
catalog.state.articles.push({ id: catalog.ids.article++, publisherProfileId: otherPublisher.profile.id, title: "Coverage item" });
assert.equal(new Set(catalog.state.articles.map((article) => article.publisherProfileId).filter(Boolean)).size, 2);

const nullLinkedSource = catalog.addSource({ clientId: 1, name: "Legacy RSS", url: "https://example.com/rss" });
assert.equal(nullLinkedSource.publisherChannelId, null);
catalog.addSource({ clientId: 1, name: "Linked channel source", url: "https://www.shafaq.com/rss", publisherChannelId: created.channels[0].id });
assert.equal(platformAdmin.clientId, null);
assert.throws(() => catalog.create(publisherRequest({ profile: { name: "Tenant Attempt", canonicalKey: "global:tenant-attempt", primaryDomain: "tenant-attempt.example" } }), tenantAdmin), (err: any) => err.code === "platform_admin_required");
assert.throws(() => catalog.select(2, privatePublisher.profile.id), (err: any) => err.status === 404);

const readiness = catalog.readiness(1);
assert.equal(readiness.publisherProfilesConfigured, 2);
assert.equal(readiness.sourceChannelsConfigured >= 2, true);
assert.equal(readiness.sourceAssignmentsConfigured, 0);
assert.equal(readiness.monitoringReady, false);
assert.deepEqual(catalog.state.platformResetAudit, [{ id: 1, result: "success" }]);

const safeResolver = async () => ["93.184.216.34"];
const okFetch = async () => ({
  status: 200,
  headers: { get: () => null },
  body: (async function* () { yield "<html><title>ok</title></html>"; })(),
});
function headers(values: Record<string, string | null> = {}) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}
const websiteValidation = await validatePublisherChannel(created.profile as any, created.channels[0] as any, {
  resolveHost: safeResolver,
  requestUrl: async (request) => {
    assert.equal(request.approvedAddress, "93.184.216.34");
    assert.equal(request.hostname, "shafaq.com");
    return okFetch();
  },
});
assert.equal(websiteValidation.validationStatus, "valid");
assert.equal(websiteValidation.evidence.networkTested, true);

const rssChannel = normalizePublisherChannel({ channelType: "rss", url: "https://www.shafaq.com/rss.xml" }, created.profile.id);
const rssValidation = await validatePublisherChannel(created.profile as any, rssChannel as any, {
  resolveHost: safeResolver,
  requestUrl: async () => ({
    status: 200,
    headers: headers({ "content-length": String(Buffer.byteLength("<?xml version=\"1.0\"?><rss><channel></channel></rss>")) }),
    body: (async function* () { yield "<?xml version=\"1.0\"?><rss><channel></channel></rss>"; })(),
  }),
});
assert.equal(rssValidation.validationStatus, "valid");

const invalidRssValidation = await validatePublisherChannel(created.profile as any, rssChannel as any, {
  resolveHost: safeResolver,
  requestUrl: okFetch,
});
assert.equal(invalidRssValidation.validationStatus, "invalid");
assert.equal(invalidRssValidation.errorCode, "invalid_feed_structure");

const socialValidation = await validatePublisherChannel(privatePublisher.profile as any, privatePublisher.channels[0] as any, {
  resolveHost: safeResolver,
  requestUrl: okFetch,
});
assert.equal(socialValidation.validationStatus, "needs_review");
assert.equal(socialValidation.evidence.networkTested, false);

const manualValidation = await validatePublisherChannel(created.profile as any, {
  ...created.channels[0],
  channelType: "television",
  normalizedUrl: "",
  url: "",
} as any, { resolveHost: safeResolver, requestUrl: okFetch });
assert.equal(manualValidation.validationStatus, "needs_review");
assert.equal(manualValidation.reason, "manual_review_required");

for (const blocked of ["127.0.0.1", "::1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.1.1", "169.254.169.254"]) {
  assert.equal(isBlockedNetworkAddress(blocked), true, `${blocked} should be blocked`);
}
for (const blocked of ["::ffff:127.0.0.1", "::ffff:10.1.2.3", "::127.0.0.1", "2130706433", "0x7f000001", "224.0.0.1", "240.0.0.1", "100.64.0.1"]) {
  assert.equal(isBlockedNetworkAddress(blocked), true, `${blocked} should be blocked`);
}
assert.equal(isGloballyRoutableAddress("8.8.8.8"), true);
assert.equal(isGloballyRoutableAddress("::ffff:8.8.8.8"), true);
const localhostValidation = await validatePublisherChannel(created.profile as any, {
  ...created.channels[0],
  normalizedUrl: "http://localhost/admin",
  url: "http://localhost/admin",
} as any, { resolveHost: safeResolver, requestUrl: okFetch });
assert.equal(localhostValidation.validationStatus, "invalid");
assert.equal(localhostValidation.errorCode, "blocked_network_target");

const redirectValidation = await validatePublisherChannel(created.profile as any, {
  ...created.channels[0],
  normalizedUrl: "https://redirect.example/start",
  url: "https://redirect.example/start",
} as any, {
  resolveHost: async (host) => host === "redirect.example" ? ["93.184.216.34"] : ["127.0.0.1"],
  requestUrl: async () => ({
    status: 302,
    headers: { get: (name: string) => name.toLowerCase() === "location" ? "http://127.0.0.1/private" : null },
    text: async () => "",
  }),
});
assert.equal(redirectValidation.validationStatus, "invalid");
assert.equal(redirectValidation.errorCode, "blocked_network_target");

let mixedDnsRequested = false;
const mixedDnsValidation = await validatePublisherChannel(created.profile as any, {
  ...created.channels[0],
  normalizedUrl: "https://mixed.example/feed",
  url: "https://mixed.example/feed",
} as any, {
  resolveHost: async () => ["93.184.216.34", "127.0.0.1"],
  requestUrl: async () => {
    mixedDnsRequested = true;
    return okFetch();
  },
});
assert.equal(mixedDnsValidation.validationStatus, "invalid");
assert.equal(mixedDnsValidation.errorCode, "blocked_resolved_address");
assert.equal(mixedDnsRequested, false);

const credentialValidation = await validatePublisherChannel(created.profile as any, {
  ...rssChannel,
  normalizedUrl: "https://user:password@example.com/feed",
  url: "https://user:password@example.com/feed",
} as any, { resolveHost: safeResolver, requestUrl: okFetch });
assert.equal(credentialValidation.validationStatus, "invalid");
assert.equal(credentialValidation.errorCode, "url_credentials_not_allowed");

const oversizedLengthValidation = await validatePublisherChannel(created.profile as any, rssChannel as any, {
  resolveHost: safeResolver,
  maxBytes: 8,
  requestUrl: async () => ({
    status: 200,
    headers: headers({ "content-length": "9" }),
    body: (async function* () { yield "<rss></rss>"; })(),
  }),
});
assert.equal(oversizedLengthValidation.validationStatus, "invalid");
assert.equal(oversizedLengthValidation.errorCode, "response_too_large");

const streamingTooLargeValidation = await validatePublisherChannel(created.profile as any, rssChannel as any, {
  resolveHost: safeResolver,
  maxBytes: 8,
  requestUrl: async () => ({
    status: 200,
    headers: headers(),
    body: (async function* () {
      yield "<rss>";
      yield "too-large";
    })(),
  }),
});
assert.equal(streamingTooLargeValidation.validationStatus, "invalid");
assert.equal(streamingTooLargeValidation.errorCode, "response_too_large");

const exactBody = "<rss></rss>";
const exactLimitValidation = await validatePublisherChannel(created.profile as any, rssChannel as any, {
  resolveHost: safeResolver,
  maxBytes: Buffer.byteLength(exactBody),
  requestUrl: async () => ({
    status: 200,
    headers: headers({ "content-length": String(Buffer.byteLength(exactBody)) }),
    body: (async function* () { yield exactBody; })(),
  }),
});
assert.equal(exactLimitValidation.validationStatus, "valid");

const smallHtml = "<html><body>ok</body></html>";
const smallHtmlFetch = await fetchPublicUrlText("https://www.shafaq.com/", {
  resolveHost: safeResolver,
  maxBytes: Buffer.byteLength(smallHtml) + 1,
  truncateOnLimit: true,
  requestUrl: async () => ({
    status: 200,
    headers: headers({ "content-length": String(Buffer.byteLength(smallHtml)) }),
    body: (async function* () { yield smallHtml; })(),
  }),
});
assert.equal(smallHtmlFetch.truncated, false);
assert.equal(smallHtmlFetch.bytesRead, Buffer.byteLength(smallHtml));

const exactLimitFetch = await fetchPublicUrlText("https://www.shafaq.com/", {
  resolveHost: safeResolver,
  maxBytes: Buffer.byteLength(smallHtml),
  truncateOnLimit: true,
  requestUrl: async () => ({
    status: 200,
    headers: headers({ "content-length": String(Buffer.byteLength(smallHtml)) }),
    body: (async function* () { yield smallHtml; })(),
  }),
});
assert.equal(exactLimitFetch.truncated, false);
assert.equal(exactLimitFetch.bytesRead, Buffer.byteLength(smallHtml));

let contentLengthAbortCalled = false;
const contentLengthTruncatedFetch = await fetchPublicUrlText("https://www.shafaq.com/", {
  resolveHost: safeResolver,
  maxBytes: 8,
  truncateOnLimit: true,
  requestUrl: async () => ({
    status: 200,
    headers: headers({ "content-length": "20" }),
    body: (async function* () { yield "12345678901234567890"; })(),
    abort: () => { contentLengthAbortCalled = true; },
  }),
});
assert.equal(contentLengthTruncatedFetch.truncated, true);
assert.equal(contentLengthTruncatedFetch.bytesRead, 8);
assert.equal(contentLengthTruncatedFetch.text, "12345678");
assert.equal(contentLengthTruncatedFetch.declaredContentLength, 20);
assert.equal(contentLengthAbortCalled, true);

let streamingAbortCalled = false;
const streamingTruncatedFetch = await fetchPublicUrlText("https://www.shafaq.com/", {
  resolveHost: safeResolver,
  maxBytes: 8,
  truncateOnLimit: true,
  requestUrl: async () => ({
    status: 200,
    headers: headers(),
    body: (async function* () {
      yield "1234";
      yield "56789";
    })(),
    abort: () => { streamingAbortCalled = true; },
  }),
});
assert.equal(streamingTruncatedFetch.truncated, true);
assert.equal(streamingTruncatedFetch.bytesRead, 8);
assert.equal(streamingTruncatedFetch.text, "12345678");
assert.equal(streamingAbortCalled, true);

await assert.rejects(
  () => fetchPublicUrlText("https://www.shafaq.com/rss.xml", {
    resolveHost: safeResolver,
    maxBytes: 8,
    requestUrl: async () => ({
      status: 200,
      headers: headers({ "content-length": "20" }),
      body: (async function* () { yield "<rss>too-large</rss>"; })(),
    }),
  }),
  (err: any) => err.code === "response_too_large",
);

const stalledBodyValidation = await validatePublisherChannel(created.profile as any, rssChannel as any, {
  resolveHost: safeResolver,
  timeoutMs: 20,
  requestUrl: async (request) => ({
    status: 200,
    headers: headers(),
    body: (async function* () {
      yield "<rss>";
      await new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => reject(Object.assign(new Error("timeout"), { code: "timeout" })), { once: true }));
    })(),
  }),
});
assert.equal(stalledBodyValidation.validationStatus, "unreachable");
assert.equal(stalledBodyValidation.errorCode, "timeout");

console.log("publisher catalog behavioral tests passed");
