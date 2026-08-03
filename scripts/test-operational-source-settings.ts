import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyOperationalSourceSettings,
  diffOperationalSourceSettings,
  normalizeOperationalSourceSettings,
  operationalSourceSettingsPreviewRequestSchema,
  operationalSourceSettingsUpdateRequestSchema,
  sanitizeOperationalUrlForEvidence,
} from "../shared/operational-source-settings";
import {
  operationalSettingsFingerprint,
  validateOperationalSourceSelectors,
} from "../server/operational-source-settings";
import { inspectOperationalSourceSample, sourceValidationIdentity } from "../server/source-sample-inspector";
import { evaluateWorkspaceRelevance } from "../shared/workspace-relevance";
import {
  calculateAssignmentTestRates,
  summarizeAssignmentSample,
} from "../shared/workspace-source-assignments";
import type { PublisherChannel, Source } from "../shared/schema";

const root = process.cwd();

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function methodBody(contents: string, signature: string): string {
  const start = contents.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const next = contents.indexOf("\n  async ", start + signature.length);
  return contents.slice(start, next === -1 ? contents.length : next);
}

function assertIncludes(contents: string, needle: string, label: string) {
  assert.ok(contents.includes(needle), `${label}: missing ${needle}`);
}

const sourceFixture: Source = {
  id: 10,
  name: "Iraq Example News",
  url: "https://example.com/news",
  type: "website",
  active: false,
  intervalMinutes: 15,
  maxArticlesPerFetch: 10,
  retentionDays: 7,
  userId: 2,
  clientId: 1,
  country: "IQ",
  category: "politics",
  collectorConfig: null,
  filterConfig: null,
  feedToken: "11111111-1111-4111-8111-111111111111",
  refreshPriority: "medium",
  logoUrl: null,
  publisherChannelId: 20,
  sourceIdentityKey: "client:1:publisher-channel:20",
  deletedAt: null,
  lastFetchedAt: null,
  createdAt: new Date("2026-08-03T00:00:00Z"),
};

const channelFixture: PublisherChannel = {
  id: 20,
  publisherProfileId: 30,
  channelKey: "example:website",
  name: "Website",
  channelType: "website",
  url: "https://example.com/news",
  normalizedUrl: "https://example.com/news",
  externalId: null,
  handle: null,
  countryCode: "IQ",
  languageCodes: ["en", "ar"],
  isPrimary: true,
  verificationStatus: "verified",
  verifiedAt: null,
  verifiedBy: null,
  lifecycleStatus: "active",
  fetchStrategy: null,
  metadata: {},
  lastValidatedAt: null,
  validationStatus: "valid",
  createdBy: 2,
  createdAt: new Date("2026-08-03T00:00:00Z"),
  updatedAt: new Date("2026-08-03T00:00:00Z"),
};

const normalized = normalizeOperationalSourceSettings({
  url: "https://example.com/latest",
  collectorConfig: {
    strategy: "scrape",
    feedUrl: "",
    renderJavascript: false,
    selectors: {
      item: "article.card",
      link: "a.link",
      title: ".title",
      summary: ".summary",
      image: ".image",
      date: ".date",
    },
  },
  filterConfig: {
    whitelist: { enabled: true, keywords: ["Iraq", "Baghdad"], fields: ["title", "description"] },
    blacklist: { enabled: true, keywords: ["sports"], fields: ["title"] },
  },
  intervalMinutes: 30,
  maxArticlesPerFetch: 20,
  retentionDays: 14,
  refreshPriority: "high",
}, sourceFixture);
assert.equal(normalized.url, "https://example.com/latest");
assert.equal(normalized.collectorConfig.strategy, "scrape");
assert.equal(normalized.collectorConfig.feedUrl, undefined, "blank feedUrl normalizes away");
assert.equal(normalized.collectorConfig.renderJavascript, false);
assert.deepEqual(normalized.filterConfig.whitelist.keywords, ["Iraq", "Baghdad"]);
assert.deepEqual(diffOperationalSourceSettings(normalizeOperationalSourceSettings({}, sourceFixture), normalized).sort(), [
  "collectorConfig",
  "filterConfig",
  "intervalMinutes",
  "maxArticlesPerFetch",
  "refreshPriority",
  "retentionDays",
  "url",
].sort());

assert.throws(
  () => normalizeOperationalSourceSettings({ url: "http://localhost/news" }, sourceFixture),
  /Private or local URLs/,
  "unsafe local URL is rejected",
);
assert.throws(
  () => normalizeOperationalSourceSettings({ url: "https://user:pass@example.com/news" }, sourceFixture),
  /Credential-bearing URLs/,
  "URL credentials are rejected",
);
assert.throws(
  () => normalizeOperationalSourceSettings({ collectorConfig: { renderJavascript: true } }, sourceFixture),
  /renderJavascript must remain false/,
  "unsupported rendering is rejected",
);
assert.throws(
  () => normalizeOperationalSourceSettings({ active: true } as any, sourceFixture),
  /Unrecognized key/,
  "unknown or prohibited settings are rejected",
);
assert.equal(validateOperationalSourceSelectors(normalized).valid, true, "valid selectors compile");
const malformedSelectorSettings = normalizeOperationalSourceSettings({
  url: "https://example.com/latest",
  collectorConfig: { strategy: "scrape", renderJavascript: false, selectors: { item: "article[" } },
}, sourceFixture);
const malformedSelector = validateOperationalSourceSelectors(malformedSelectorSettings);
assert.equal(malformedSelector.valid, false, "malformed selector is rejected by Cheerio validation");
assert.equal(malformedSelector.errors[0].field, "item");
assert.throws(
  () => normalizeOperationalSourceSettings({
    url: "https://example.com/latest",
    collectorConfig: { strategy: "scrape", renderJavascript: false, selectors: { item: "article:first-child" } },
  }, sourceFixture),
  /Pseudo-selectors/,
  "unsupported pseudo selectors are rejected before runtime",
);
operationalSourceSettingsPreviewRequestSchema.parse({ settings: { url: "https://example.com/latest" } });
operationalSourceSettingsUpdateRequestSchema.parse({ previewFingerprint: "a".repeat(64), settings: { url: "https://example.com/latest" } });
assert.equal(sanitizeOperationalUrlForEvidence("https://user:pass@example.com/path#secret"), "https://example.com/path");

const proposedSource = applyOperationalSourceSettings(sourceFixture, normalized) as Source;
const baseFingerprintInput = {
  clientId: 1,
  workspaceId: 5,
  sourceId: sourceFixture.id,
  sourceIdentity: sourceValidationIdentity(proposedSource, channelFixture),
  sourceUpdatedAt: null,
  assignmentId: 40,
  assignmentUpdatedAt: "2026-08-03T01:00:00.000Z",
  channelId: channelFixture.id,
  channelUpdatedAt: channelFixture.updatedAt?.toISOString() || null,
  relevanceProfileVersion: 1,
  settings: normalized,
};
const fingerprint = operationalSettingsFingerprint(baseFingerprintInput);
assert.notEqual(fingerprint, operationalSettingsFingerprint({
  ...baseFingerprintInput,
  sourceIdentity: sourceValidationIdentity({ ...proposedSource, url: "https://example.com/changed" } as Source, channelFixture),
}), "changed source invalidates fingerprint");
assert.notEqual(fingerprint, operationalSettingsFingerprint({
  ...baseFingerprintInput,
  assignmentUpdatedAt: "2026-08-03T02:00:00.000Z",
}), "changed assignment invalidates fingerprint");
assert.notEqual(fingerprint, operationalSettingsFingerprint({
  ...baseFingerprintInput,
  relevanceProfileVersion: 2,
}), "changed profile invalidates fingerprint");
assert.notEqual(fingerprint, operationalSettingsFingerprint({
  ...baseFingerprintInput,
  channelUpdatedAt: "2026-08-03T03:00:00.000Z",
}), "changed channel invalidates fingerprint");
assert.notEqual(fingerprint, operationalSettingsFingerprint({
  ...baseFingerprintInput,
  settings: { ...normalized, retentionDays: 21 },
}), "changed proposed settings invalidate fingerprint");

const html = `
  <main>
    <article class="card">
      <a class="link" href="/iraq-cabinet"><h2 class="title">Iraqi cabinet discusses Baghdad public services</h2></a>
      <p class="summary">The government said the decision affects Baghdad and Basra service delivery.</p>
      <img class="image" src="/image.jpg" alt="Baghdad ministry meeting" />
      <time class="date" datetime="2026-08-03T08:00:00Z">Aug 3</time>
    </article>
    <article class="card">
      <a class="link" href="/sports"><h2 class="title">Sports round-up from Europe</h2></a>
      <p class="summary">Club football headlines.</p>
    </article>
  </main>
`;

const inspection = await inspectOperationalSourceSample(proposedSource, channelFixture, {
  limit: 10,
  fetchText: async () => ({
    text: html,
    statusCode: 200,
    finalUrl: "https://example.com/latest",
    redirectCount: 0,
    approvedAddressFamily: 4,
    contentType: "text/html",
    elapsedMs: 12,
    bytesRead: Buffer.byteLength(html),
    truncated: false,
    declaredContentLength: Buffer.byteLength(html),
  }),
});
assert.equal(inspection.success, true, "preview inspection succeeds with injected fetch");
assert.equal(inspection.safeSourceFacts.articleInsertions, 0, "preview creates no articles");
assert.equal(inspection.safeSourceFacts.appearancesCreated, 0, "preview creates no appearances");
assert.equal(inspection.safeSourceFacts.sourceFetchLogsCreated, 0, "preview creates no fetch logs");
assert.equal(inspection.safeSourceFacts.processingJobsCreated, 0, "preview creates no jobs");
assert.equal(inspection.safeSourceFacts.rawItemCount, 2, "preview returns raw extraction evidence");
assert.equal(inspection.safeSourceFacts.itemCount, 1, "whitelist/blacklist filters affect accepted count");

const profile = {
  id: 5,
  clientId: 1,
  name: "Iraq Daily Media Monitoring",
  scopeMode: "single_country",
  primaryCountryCodes: ["IQ"],
  subnationalAreas: ["Baghdad", "Basra"],
  topics: ["government", "public services"],
  inclusionTerms: ["Iraqi cabinet", "Baghdad"],
};
const sampleResults = inspection.items.map((item) => {
  const relevance = evaluateWorkspaceRelevance({
    title: item.title,
    summary: item.content,
    content: item.content,
    url: item.url,
    imageTitle: item.imageTitle,
    sourceName: proposedSource.name,
    sourceCategory: proposedSource.category,
  }, profile);
  return summarizeAssignmentSample({
    headline: item.title,
    normalizedUrl: item.url,
    publicationTime: item.publishedAt.toISOString(),
    language: item.language || null,
    relevanceClassification: relevance.relevanceStatus,
    matchedSignals: relevance.relevanceMatchedSignals,
    rejectionReason: relevance.relevanceStatus === "not_relevant" || relevance.relevanceStatus === "needs_review" ? relevance.relevanceReason : null,
  });
});
const counts = {
  sampleCount: sampleResults.length,
  directScopeMatchCount: sampleResults.filter((item) => item.relevanceClassification === "direct_scope_match").length,
  materialScopeImpactCount: sampleResults.filter((item) => item.relevanceClassification === "material_scope_impact").length,
  contextualCount: sampleResults.filter((item) => item.relevanceClassification === "contextual").length,
  notRelevantCount: sampleResults.filter((item) => item.relevanceClassification === "not_relevant").length,
  needsReviewCount: sampleResults.filter((item) => item.relevanceClassification === "needs_review").length,
};
const rates = calculateAssignmentTestRates(counts);
assert.equal(counts.sampleCount, 1, "preview returns safe sample evidence");
assert.equal(counts.directScopeMatchCount, 1, "preview returns relevance evidence");
assert.equal(rates.directMatchRate, 1);
assert.equal(rates.relevantRate, 1);
assert.equal(rates.noiseRate, 0);

const routes = source("server/routes.ts");
const storage = source("server/storage.ts");
const getRoute = routes.slice(routes.indexOf('app.get("/api/admin/clients/:clientId/workspaces/:workspaceId/sources/:sourceId/settings"'), routes.indexOf('app.get("/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments"'));
assertIncludes(getRoute, "requireSystemAdmin()", "GET settings endpoint platform-admin guard");
assertIncludes(getRoute, "storage.getOperationalSourceSettings", "GET settings endpoint storage call");
assertIncludes(getRoute, "storage.previewOperationalSourceSettings", "preview endpoint storage call");
assertIncludes(getRoute, "storage.updateOperationalSourceSettingsAtomic", "update endpoint atomic storage call");
assertIncludes(routes, "operational_source_settings_workflow_required", "legacy route test-affecting guard");
assertIncludes(routes, "legacyOperationalSettingsWorkflowRequired", "legacy route helper");
assertIncludes(storage, 'code: "client_not_found"', "wrong client rejection");
assertIncludes(storage, 'code: "workspace_not_found"', "wrong workspace rejection");
assertIncludes(storage, 'code: "source_not_assigned_to_workspace"', "source not assigned rejection");
assertIncludes(storage, 'code: "publisher_channel_mismatch"', "publisher/channel mismatch rejection");
assertIncludes(storage, "validateOperationalSourceSelectors", "selector validation is enforced by storage");

const previewBody = storage.slice(storage.indexOf("function buildOperationalSettingsPreview("), storage.indexOf("async function assertAssignmentHasCurrentRelevanceTest("));
assertIncludes(previewBody, "writes: false", "preview explicitly reports no writes");
assert.equal(previewBody.includes("tx.insert"), false, "preview helper does not insert rows");
assert.equal(previewBody.includes("createAuditLogInTransaction"), false, "preview helper does not create audit logs");

const updateBody = methodBody(storage, "async updateOperationalSourceSettingsAtomic(");
assertIncludes(updateBody, "db.transaction", "settings update is atomic");
assertIncludes(updateBody, "pg_advisory_xact_lock", "settings update uses advisory transaction lock");
assertIncludes(updateBody, "expectedFingerprint !== parsed.previewFingerprint", "settings update checks preview fingerprint");
assertIncludes(updateBody, "operational_source_settings_update", "settings update audit action");
assertIncludes(updateBody, "testStatus: \"stale\"", "settings update marks assignments stale");
assertIncludes(updateBody, "enabled: false", "settings update disables assignments");
assertIncludes(updateBody, "sourceValidationIdentity: null", "settings update clears source validation identity");
assertIncludes(updateBody, "active: false", "settings update keeps source inactive");
assert.equal(updateBody.includes("tx.insert(workspaceSourceAssignmentTests"), false, "settings update creates no assignment tests");
assert.equal(updateBody.includes("tx.insert(articles"), false, "settings update creates no articles");
assert.equal(updateBody.includes("tx.insert(sourceFetchLogs"), false, "settings update creates no fetch logs");
assert.equal(updateBody.includes("enqueueJob"), false, "settings update enqueues no jobs");

console.log("operational source settings tests passed");
