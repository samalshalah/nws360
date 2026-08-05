import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWorkspaceSourceAssignmentPublisherResponse } from "../server/source-assignment-publisher-dto";
import { inspectOperationalSourceSample, sourceValidationIdentity } from "../server/source-sample-inspector";
import type { PublisherChannel, Source } from "../shared/schema";
import { normalizeWorkspaceSourceAssignmentResponse } from "../shared/workspace-source-assignment-response";
import {
  WORKSPACE_SOURCE_ASSIGNMENT_PRIORITIES,
  WORKSPACE_SOURCE_ASSIGNMENT_STATUSES,
  WORKSPACE_SOURCE_ASSIGNMENT_TEST_STATUSES,
  WORKSPACE_SOURCE_ROLES,
  buildOperationalSourceIdentityKey,
  buildWorkspaceSourceAssignmentKey,
  calculateAssignmentTestRates,
  evaluateAssignmentTestOutcome,
  evaluateChannelProvisionability,
  nextWorkspaceSourceAssignmentStatusAfterTest,
  nextWorkspaceSourceAssignmentStatusAfterWarningApproval,
  normalizeAssignmentThresholds,
  summarizeAssignmentSample,
} from "../shared/workspace-source-assignments";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function includes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), label);
}

assert.deepEqual(WORKSPACE_SOURCE_ASSIGNMENT_STATUSES, ["draft", "testing", "ready", "active", "paused", "archived"]);
assert.deepEqual(WORKSPACE_SOURCE_ASSIGNMENT_TEST_STATUSES, ["untested", "passed", "warning", "failed", "stale"]);
assert.deepEqual(WORKSPACE_SOURCE_ASSIGNMENT_PRIORITIES, ["critical", "high", "standard", "low"]);
assert.deepEqual(WORKSPACE_SOURCE_ROLES, ["primary", "official", "regional", "contextual", "specialist", "social", "collector", "other"]);

function fixturePublisher(id: number, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    status: "active",
    scopeType: "global",
    verificationStatus: "verified",
    ownerClientId: null,
    ...overrides,
  } as any;
}

function fixtureSelection(id: number, publisher: any, overrides: Record<string, unknown> = {}) {
  return {
    id,
    clientId: 1,
    publisherProfileId: publisher.id,
    status: "approved",
    priority: "high",
    notes: null,
    selectedBy: 2,
    selectedAt: new Date("2026-08-03T00:00:00Z"),
    updatedAt: new Date("2026-08-03T00:00:00Z"),
    publisher,
    channelCount: 99,
    sourceLinkCount: "2",
    privateLeak: "must_not_be_serialized",
    ...overrides,
  } as any;
}

function fixtureChannel(id: number, publisherProfileId: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    publisherProfileId,
    name: `Channel ${id}`,
    channelType: "website",
    url: `https://publisher-${publisherProfileId}.example/`,
    normalizedUrl: `https://publisher-${publisherProfileId}.example`,
    countryCode: "IQ",
    languageCodes: ["ar", "en"],
    isPrimary: true,
    verificationStatus: "verified",
    lifecycleStatus: "active",
    validationStatus: "valid",
    metadata: { secret: "must_not_be_serialized" },
    createdAt: new Date("2026-08-03T00:00:00Z"),
    updatedAt: new Date("2026-08-03T00:00:00Z"),
    ...overrides,
  } as PublisherChannel;
}

const productionPublisherFixtures = Array.from({ length: 7 }, (_, index) => {
  const publisher = fixturePublisher(index + 1, `Approved Publisher ${index + 1}`);
  return {
    selection: fixtureSelection(index + 1, publisher, { priority: index < 3 ? "critical" : "high" }),
    channels: [fixtureChannel(index + 1, publisher.id)],
  };
});
const parliamentPublisher = fixturePublisher(8, "Iraqi Council of Representatives", { status: "draft", verificationStatus: "unverified" });
const productionPublisherResponse = buildWorkspaceSourceAssignmentPublisherResponse([
  ...productionPublisherFixtures,
  {
    selection: fixtureSelection(8, parliamentPublisher, { status: "candidate" }),
    channels: [fixtureChannel(8, parliamentPublisher.id, { validationStatus: "invalid", lifecycleStatus: "draft", verificationStatus: "unverified" })],
  },
]);
assert.equal(productionPublisherResponse.approvedPublishers.length, 7, "fixture returns seven approved publisher DTOs");
assert.equal(productionPublisherResponse.publisherEligibilitySummary.approvedPublisherCount, 7);
assert.equal(productionPublisherResponse.publisherEligibilitySummary.eligibleChannelCount, 7);
assert.equal(productionPublisherResponse.publisherEligibilitySummary.excludedSelectionCount, 1);
assert.equal(productionPublisherResponse.publisherEligibilitySummary.excludedChannelCount, 1);
assert.equal(productionPublisherResponse.approvedPublishers.some((item) => item.publisher.name === "Iraqi Council of Representatives"), false, "candidate publisher is excluded");
assert.deepEqual(Object.keys(productionPublisherResponse.approvedPublishers[0].selection).sort(), ["clientId", "id", "notes", "priority", "publisherProfileId", "status"]);
assert.deepEqual(Object.keys(productionPublisherResponse.approvedPublishers[0].publisher).sort(), ["id", "name", "scopeType", "status", "verificationStatus"]);
assert.equal("privateLeak" in productionPublisherResponse.approvedPublishers[0].selection, false, "selection spread does not leak unknown fields");
assert.equal("metadata" in productionPublisherResponse.approvedPublishers[0].channels[0], false, "channel DTO does not leak metadata");

const edgePublisher = fixturePublisher(30, "Eligibility Edge Publisher");
const edgeResponse = buildWorkspaceSourceAssignmentPublisherResponse([
  { selection: fixtureSelection(20, edgePublisher), channels: [
    fixtureChannel(20, edgePublisher.id),
    fixtureChannel(21, edgePublisher.id, { validationStatus: "invalid" }),
    fixtureChannel(22, edgePublisher.id, { lifecycleStatus: "archived" }),
    fixtureChannel(23, edgePublisher.id, { verificationStatus: "unverified" }),
    fixtureChannel(24, edgePublisher.id + 99),
    fixtureChannel(25, edgePublisher.id, { metadata: { collectorType: "google_news" } }),
  ] },
  { selection: fixtureSelection(21, fixturePublisher(31, "Candidate"), { status: "candidate" }), channels: [fixtureChannel(31, 31)] },
  { selection: fixtureSelection(22, fixturePublisher(32, "Blocked"), { status: "blocked" }), channels: [fixtureChannel(32, 32)] },
  { selection: fixtureSelection(23, fixturePublisher(33, "Archived Selection"), { status: "archived" }), channels: [fixtureChannel(33, 33)] },
  { selection: fixtureSelection(24, fixturePublisher(34, "Inactive Publisher", { status: "paused" })), channels: [fixtureChannel(34, 34)] },
]);
assert.equal(edgeResponse.approvedPublishers.length, 1, "only one eligible publisher remains");
assert.equal(edgeResponse.approvedPublishers[0].channels.length, 1, "only valid verified active same-publisher channel remains");
assert.equal(edgeResponse.approvedPublishers[0].channelCount, 1, "channelCount matches returned eligible channels");
assert.equal(edgeResponse.approvedPublishers[0].sourceLinkCount, 2, "sourceLinkCount is numeric");
assert.equal(edgeResponse.publisherEligibilitySummary.excludedSelectionCount, 4, "candidate, blocked, archived and inactive publisher selections are excluded");

const noValidChannelPublisher = fixturePublisher(40, "Approved Without Valid Channel");
const noValidChannelResponse = buildWorkspaceSourceAssignmentPublisherResponse([
  { selection: fixtureSelection(40, noValidChannelPublisher), channels: [fixtureChannel(40, noValidChannelPublisher.id, { validationStatus: "invalid" })] },
]);
assert.equal(noValidChannelResponse.approvedPublishers.length, 1, "approved publisher with no valid channels still renders as approved");
assert.equal(noValidChannelResponse.approvedPublishers[0].channels.length, 0, "invalid channels are not offered");
assert.equal(noValidChannelResponse.publisherEligibilitySummary.eligibleChannelCount, 0);

const malformedNormalized = normalizeWorkspaceSourceAssignmentResponse({
  approvedPublishers: [{ selection: undefined, publisher: undefined, channels: undefined }],
  operationalSources: undefined,
  assignments: undefined,
  readiness: undefined,
} as any);
assert.equal(malformedNormalized.approvedPublishers.length, 0);
assert.equal(malformedNormalized.skippedMalformedPublisherCount, 1, "malformed approved publisher entry is skipped");
assert.deepEqual(malformedNormalized.operationalSources, []);
assert.deepEqual(malformedNormalized.assignments, []);
assert.deepEqual(malformedNormalized.readiness.blockers, []);

const validNormalized = normalizeWorkspaceSourceAssignmentResponse({
  approvedPublishers: productionPublisherResponse.approvedPublishers.slice(0, 1),
  operationalSources: [],
  assignments: [],
  readiness: { blockers: ["client_inactive"], sourceAssignmentsConfigured: 0 },
  relevanceProfile: null,
});
assert.equal(validNormalized.approvedPublishers[0].publisher.name, "Approved Publisher 1", "valid DTO preserves publisher name for rendering");
assert.equal(validNormalized.approvedPublishers[0].selection.status, "approved", "valid DTO preserves selection status for rendering");
assert.equal(validNormalized.approvedPublishers[0].channels[0].channelType, "website", "valid DTO preserves channel badge data");

const emptyNormalized = normalizeWorkspaceSourceAssignmentResponse({ approvedPublishers: [], operationalSources: [], assignments: [], readiness: { blockers: ["workspace_inactive"] }, relevanceProfile: null });
assert.deepEqual(emptyNormalized.approvedPublishers, [], "empty publisher state renders as an empty list");
assert.deepEqual(emptyNormalized.readiness.blockers, ["workspace_inactive"], "readiness blockers are preserved");

assert.equal(buildWorkspaceSourceAssignmentKey(12, 34), "workspace:12:source:34");
assert.equal(buildOperationalSourceIdentityKey(7, 9), "client:7:publisher-channel:9");
assert.deepEqual(normalizeAssignmentThresholds({ minimumDirectMatchRate: 2, maximumNoiseRate: -1 }), {
  minimumDirectMatchRate: 1,
  maximumNoiseRate: 0,
});

assert.deepEqual(calculateAssignmentTestRates({
  sampleCount: 5,
  directScopeMatchCount: 3,
  materialScopeImpactCount: 1,
  contextualCount: 0,
  notRelevantCount: 1,
  needsReviewCount: 0,
}), {
  directMatchRate: 0.6,
  relevantRate: 0.8,
  noiseRate: 0.2,
});

assert.equal(evaluateAssignmentTestOutcome({
  sampleCount: 5,
  directScopeMatchCount: 3,
  materialScopeImpactCount: 1,
  contextualCount: 0,
  notRelevantCount: 1,
  needsReviewCount: 0,
  minimumDirectMatchRate: 0.5,
  maximumNoiseRate: 0.4,
}).status, "passed");

assert.equal(evaluateAssignmentTestOutcome({
  sampleCount: 1,
  directScopeMatchCount: 1,
  materialScopeImpactCount: 0,
  contextualCount: 0,
  notRelevantCount: 0,
  needsReviewCount: 0,
  minimumDirectMatchRate: 0.5,
  maximumNoiseRate: 0.4,
}).reason, "small_sample");

assert.equal(evaluateAssignmentTestOutcome({
  sampleCount: 4,
  directScopeMatchCount: 1,
  materialScopeImpactCount: 0,
  contextualCount: 0,
  notRelevantCount: 3,
  needsReviewCount: 0,
  minimumDirectMatchRate: 0.5,
  maximumNoiseRate: 0.4,
}).reason, "noise_rate_exceeded");

assert.equal(evaluateAssignmentTestOutcome({
  sampleCount: 0,
  directScopeMatchCount: 0,
  materialScopeImpactCount: 0,
  contextualCount: 0,
  notRelevantCount: 0,
  needsReviewCount: 0,
  minimumDirectMatchRate: 0.5,
  maximumNoiseRate: 0.4,
}).reason, "no_usable_items");

assert.equal(evaluateChannelProvisionability({
  channelType: "website",
  url: "https://example.com",
  validationStatus: "valid",
  lifecycleStatus: "active",
}).provisionable, true);

assert.deepEqual(evaluateChannelProvisionability({
  channelType: "website",
  url: "https://example.com",
  validationStatus: "needs_review",
  lifecycleStatus: "active",
}), {
  provisionable: false,
  manualOnly: false,
  reason: "channel_validation_required",
  requiredConfiguration: ["valid_channel_validation_or_manual_override"],
});

assert.deepEqual(evaluateChannelProvisionability({
  channelType: "facebook",
  lifecycleStatus: "active",
}), {
  provisionable: false,
  manualOnly: false,
  reason: "social_feed_configuration_required",
  requiredConfiguration: ["supported_social_connector"],
});

assert.equal(evaluateChannelProvisionability({
  channelType: "facebook",
  sourceUrl: "https://www.facebook.com/example",
  lifecycleStatus: "active",
}).provisionable, true);

assert.deepEqual(evaluateChannelProvisionability({
  channelType: "television",
  lifecycleStatus: "active",
}), {
  provisionable: false,
  manualOnly: true,
  reason: "manual_only_channel",
  requiredConfiguration: ["supported_stream_or_feed"],
});

class AssignmentRuntimeHarness {
  users = [{ id: 2, username: "admin@nws360.com", role: "admin", userScope: "platform", clientId: null as number | null }];
  platformResetAudit = [{ id: 1, status: "success" }];
  clients = new Map([
    [3, { id: 3, active: true, lifecycleStatus: "active" }],
    [4, { id: 4, active: true, lifecycleStatus: "active" }],
  ]);
  workspaces = new Map([
    [30, { id: 30, clientId: 3, active: true, status: "active" }],
    [31, { id: 31, clientId: 3, active: true, status: "active" }],
    [40, { id: 40, clientId: 4, active: true, status: "active" }],
  ]);
  channels = new Map([
    [9, { id: 9, publisherProfileId: 4, clientId: 3 }],
    [10, { id: 10, publisherProfileId: 4, clientId: 3 }],
    [19, { id: 19, publisherProfileId: 7, clientId: 4 }],
  ]);
  sources = new Map<number, any>();
  assignments = new Map<number, any>();
  tests = new Map<number, any>();
  auditLogs: any[] = [];
  articles: any[] = [];
  articleAppearances: any[] = [];
  rejectedIngestionItems: any[] = [];
  sourceFetchLogs: any[] = [];
  processingJobs: any[] = [];
  nextSourceId = 100;
  nextAssignmentId = 200;
  nextTestId = 300;

  snapshot() {
    return {
      sources: new Map(this.sources),
      assignments: new Map(this.assignments),
      tests: new Map(this.tests),
      auditLogs: [...this.auditLogs],
      articles: [...this.articles],
      articleAppearances: [...this.articleAppearances],
      rejectedIngestionItems: [...this.rejectedIngestionItems],
      sourceFetchLogs: [...this.sourceFetchLogs],
      processingJobs: [...this.processingJobs],
      nextSourceId: this.nextSourceId,
      nextAssignmentId: this.nextAssignmentId,
      nextTestId: this.nextTestId,
    };
  }

  restore(snapshot: ReturnType<AssignmentRuntimeHarness["snapshot"]>) {
    this.sources = snapshot.sources;
    this.assignments = snapshot.assignments;
    this.tests = snapshot.tests;
    this.auditLogs = snapshot.auditLogs;
    this.articles = snapshot.articles;
    this.articleAppearances = snapshot.articleAppearances;
    this.rejectedIngestionItems = snapshot.rejectedIngestionItems;
    this.sourceFetchLogs = snapshot.sourceFetchLogs;
    this.processingJobs = snapshot.processingJobs;
    this.nextSourceId = snapshot.nextSourceId;
    this.nextAssignmentId = snapshot.nextAssignmentId;
    this.nextTestId = snapshot.nextTestId;
  }

  storageError(code: string, status = 409) {
    const error = new Error(code) as Error & { code: string; status: number };
    error.code = code;
    error.status = status;
    return error;
  }

  transact<T>(work: () => T): T {
    const before = this.snapshot();
    try {
      return work();
    } catch (error) {
      this.restore(before);
      throw error;
    }
  }

  createAssignment(clientId: number, workspaceId: number, channelId: number, options: { sourceId?: number; failProfile?: boolean; failAudit?: boolean } = {}) {
    return this.transact(() => {
      const workspace = this.workspaces.get(workspaceId);
      const channel = this.channels.get(channelId);
      if (!workspace || workspace.clientId !== clientId) throw this.storageError("workspace_not_found", 404);
      if (!channel || channel.clientId !== clientId) throw this.storageError("publisher_not_approved_for_client", 409);
      if ([...this.assignments.values()].some((assignment) => assignment.workspaceId === workspaceId && assignment.publisherChannelId === channelId)) {
        throw this.storageError("duplicate_workspace_source_assignment", 409);
      }
      let source = options.sourceId ? this.sources.get(options.sourceId) : null;
      if (options.sourceId && (!source || source.clientId !== clientId)) throw this.storageError("source_assignment_client_mismatch", 409);
      if (source && source.publisherChannelId !== channelId) throw this.storageError("source_assignment_channel_mismatch", 409);
      if (!source) {
        source = {
          id: this.nextSourceId++,
          clientId,
          publisherChannelId: channelId,
          sourceIdentityKey: buildOperationalSourceIdentityKey(clientId, channelId),
          active: false,
        };
        this.sources.set(source.id, source);
      }
      if (options.failProfile) throw this.storageError("profile_failure", 500);
      const assignment = {
        id: this.nextAssignmentId++,
        clientId,
        workspaceId,
        publisherChannelId: channelId,
        sourceId: source.id,
        assignmentKey: buildWorkspaceSourceAssignmentKey(workspaceId, source.id),
        status: "draft",
        enabled: false,
        testStatus: "untested",
        latestTestRunId: null as number | null,
        relevanceProfileVersion: 1,
        sourceValidationIdentity: `source:${source.id}:channel:${channelId}`,
        assignmentConfigIdentity: "cfg:1",
        warningApprovalReason: null as string | null,
      };
      this.assignments.set(assignment.id, assignment);
      if (options.failAudit) throw this.storageError("audit_failure", 500);
      this.auditLogs.push({ action: "workspace_source_provision_assignment", entityId: assignment.id });
      return { source, assignment, auditLog: this.auditLogs[this.auditLogs.length - 1] };
    });
  }

  rawInsertAssignmentTest(input: any) {
    const assignment = this.assignments.get(input.assignmentId);
    if (!assignment || assignment.publisherChannelId !== input.publisherChannelId) throw this.storageError("assignment_channel_fk_violation", 23503);
    const test = { id: this.nextTestId++, ...input };
    this.tests.set(test.id, test);
    return test;
  }

  recordTest(assignmentId: number, testType: "connectivity" | "relevance" | "full", status: "passed" | "warning" | "failed" = "passed") {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) throw this.storageError("assignment_not_found", 404);
    const test = this.rawInsertAssignmentTest({
      clientId: assignment.clientId,
      workspaceId: assignment.workspaceId,
      assignmentId,
      sourceId: assignment.sourceId,
      publisherChannelId: assignment.publisherChannelId,
      testType,
      status,
      sourceValidationIdentity: assignment.sourceValidationIdentity,
      assignmentConfigIdentity: assignment.assignmentConfigIdentity,
      relevanceProfileVersion: assignment.relevanceProfileVersion,
      sampleCount: testType === "connectivity" ? 2 : 4,
      directScopeMatchCount: status === "failed" ? 0 : 3,
      materialScopeImpactCount: 0,
      contextualCount: 0,
      notRelevantCount: status === "failed" ? 4 : 1,
      needsReviewCount: 0,
      articleInsertions: 0,
      processingJobsCreated: 0,
    });
    assignment.latestTestRunId = test.id;
    assignment.testStatus = status;
    assignment.status = nextWorkspaceSourceAssignmentStatusAfterTest({
      currentStatus: assignment.status,
      testType,
      runStatus: status,
    });
    if (assignment.status !== "active") assignment.enabled = false;
    return { assignment, test };
  }

  assertCanReady(assignmentId: number) {
    const assignment = this.assignments.get(assignmentId);
    const test = assignment?.latestTestRunId ? this.tests.get(assignment.latestTestRunId) : null;
    if (!assignment) throw this.storageError("assignment_not_found", 404);
    if (assignment?.testStatus === "stale") throw this.storageError("source_assignment_tests_stale", 409);
    if (!test || !["relevance", "full"].includes(test.testType) || !["passed", "warning"].includes(test.status)) {
      throw this.storageError("source_assignment_relevance_test_required", 409);
    }
    if (test.status === "warning" && !assignment.warningApprovalReason) {
      throw this.storageError("source_assignment_warning_approval_required", 409);
    }
    if (
      test.sourceValidationIdentity !== assignment.sourceValidationIdentity
      || test.assignmentConfigIdentity !== assignment.assignmentConfigIdentity
      || test.relevanceProfileVersion !== assignment.relevanceProfileVersion
    ) {
      throw this.storageError("source_assignment_tests_stale", 409);
    }
    assignment.status = "ready";
    assignment.enabled = false;
    return assignment;
  }

  activate(assignmentId: number) {
    const assignment = this.assertCanReady(assignmentId);
    const client = this.clients.get(assignment.clientId);
    const workspace = this.workspaces.get(assignment.workspaceId);
    if (!client?.active || client.lifecycleStatus !== "active") throw this.storageError("client_inactive", 409);
    if (!workspace?.active || workspace.status !== "active") throw this.storageError("workspace_inactive", 409);
    assignment.status = "active";
    assignment.enabled = true;
    this.recomputeSource(assignment.sourceId);
    return assignment;
  }

  updateAssignmentConfig(assignmentId: number) {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) throw this.storageError("assignment_not_found", 404);
    assignment.assignmentConfigIdentity += ":changed";
    assignment.testStatus = "stale";
    assignment.status = assignment.status === "active" ? "paused" : assignment.status;
    assignment.enabled = false;
    this.recomputeSource(assignment.sourceId);
    return assignment;
  }

  approveWarning(assignmentId: number, reason: string) {
    const assignment = this.assignments.get(assignmentId);
    const test = assignment?.latestTestRunId ? this.tests.get(assignment.latestTestRunId) : null;
    if (!assignment || assignment.testStatus !== "warning" || !test || !["relevance", "full"].includes(test.testType)) {
      throw this.storageError("warning_approval_not_allowed", 409);
    }
    assignment.warningApprovalReason = reason;
    assignment.status = nextWorkspaceSourceAssignmentStatusAfterWarningApproval({ currentStatus: assignment.status });
    assignment.enabled = false;
    this.recomputeSource(assignment.sourceId);
    return assignment;
  }

  completeAfterConcurrentChange(assignmentId: number, capturedIdentity: string) {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment || assignment.sourceValidationIdentity !== capturedIdentity) {
      throw this.storageError("source_assignment_changed_during_test", 409);
    }
  }

  archiveAssignment(assignmentId: number) {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) throw this.storageError("assignment_not_found", 404);
    assignment.status = "archived";
    assignment.enabled = false;
    this.recomputeSource(assignment.sourceId);
  }

  recomputeSource(sourceId: number) {
    const source = this.sources.get(sourceId);
    if (!source) return false;
    source.active = [...this.assignments.values()].some((assignment) => (
      assignment.sourceId === sourceId &&
      assignment.status === "active" &&
      assignment.enabled === true
    ));
    return source.active;
  }

  readinessCounts(clientId: number) {
    const assignments = [...this.assignments.values()].filter((assignment) => assignment.clientId === clientId && assignment.status !== "archived");
    const isCurrent = (assignment: any) => {
      const test = assignment.latestTestRunId ? this.tests.get(assignment.latestTestRunId) : null;
      return Boolean(test
        && test.sourceValidationIdentity === assignment.sourceValidationIdentity
        && test.assignmentConfigIdentity === assignment.assignmentConfigIdentity
        && test.relevanceProfileVersion === assignment.relevanceProfileVersion);
    };
    const sourceAssignmentsConfigured = assignments.filter((assignment) => (
      ["ready", "active"].includes(assignment.status)
      && assignment.sourceId
      && isCurrent(assignment)
      && (
        assignment.testStatus === "passed"
        || (assignment.testStatus === "warning" && assignment.warningApprovalReason)
      )
    )).length;
    const sourceAssignmentsBlocked = assignments.filter((assignment) => ["untested", "failed", "stale"].includes(assignment.testStatus)).length;
    return { sourceAssignmentsConfigured, sourceAssignmentsBlocked };
  }
}

const runtime = new AssignmentRuntimeHarness();
const created = runtime.createAssignment(3, 30, 9);
assert.equal(runtime.assignments.size, 1);
assert.equal(runtime.auditLogs.length, 1);
assert.equal(created.assignment.status, "draft");
assert.equal(created.assignment.enabled, false);
assert.equal(created.source.active, false);
assert.throws(() => runtime.createAssignment(3, 31, 10, { failProfile: true }), /profile_failure/);
assert.equal(runtime.assignments.size, 1, "profile failure rolls back assignment");
assert.throws(() => runtime.createAssignment(3, 31, 10, { failAudit: true }), /audit_failure/);
assert.equal(runtime.assignments.size, 1, "audit failure rolls back assignment and source");
assert.throws(() => runtime.createAssignment(3, 30, 9), /duplicate_workspace_source_assignment/);
const sharedSource = runtime.createAssignment(3, 31, 9, { sourceId: created.source.id });
assert.equal(sharedSource.source.id, created.source.id, "one source can be assigned to two workspaces");
assert.throws(() => runtime.createAssignment(4, 40, 9, { sourceId: created.source.id }), /publisher_not_approved_for_client|source_assignment_client_mismatch/);
const connectivity = runtime.recordTest(created.assignment.id, "connectivity");
assert.equal(connectivity.test.testType, "connectivity");
assert.equal(connectivity.assignment.status, "testing", "connectivity pass keeps assignment non-ready");
assert.equal(connectivity.assignment.enabled, false, "connectivity pass does not enable assignment");
assert.equal(runtime.articles.length, 0);
assert.equal(runtime.articleAppearances.length, 0);
assert.equal(runtime.rejectedIngestionItems.length, 0);
assert.equal(runtime.sourceFetchLogs.length, 0);
assert.equal(runtime.processingJobs.length, 0);
assert.throws(() => runtime.assertCanReady(created.assignment.id), /source_assignment_relevance_test_required/);
const relevance = runtime.recordTest(created.assignment.id, "relevance", "warning");
assert.equal(relevance.test.publisherChannelId, created.assignment.publisherChannelId);
assert.equal(relevance.assignment.status, "testing", "warning remains non-ready until approval");
assert.throws(() => runtime.assertCanReady(created.assignment.id), /source_assignment_warning_approval_required/);
runtime.approveWarning(created.assignment.id, "Known source with small but relevant sample");
assert.equal(runtime.assignments.get(created.assignment.id)?.warningApprovalReason, "Known source with small but relevant sample");
assert.equal(runtime.assignments.get(created.assignment.id)?.status, "ready", "approved warning may become ready");
assert.equal(runtime.assignments.get(created.assignment.id)?.enabled, false, "approved warning never enables assignment");
assert.equal(runtime.sources.get(created.source.id)?.active, false, "approved warning does not activate source");
runtime.activate(created.assignment.id);
assert.equal(runtime.sources.get(created.source.id)?.active, true);
const passedShared = runtime.recordTest(sharedSource.assignment.id, "relevance", "passed");
assert.equal(passedShared.assignment.status, "ready", "passed relevance test makes draft/testing assignment ready");
assert.equal(passedShared.assignment.enabled, false, "passed relevance test does not enable assignment");
assert.equal(runtime.sources.get(created.source.id)?.active, true, "ready assignment does not alter existing active source state");
runtime.activate(sharedSource.assignment.id);
runtime.archiveAssignment(created.assignment.id);
assert.equal(runtime.sources.get(created.source.id)?.active, true, "shared source remains active while another assignment is active");
runtime.archiveAssignment(sharedSource.assignment.id);
assert.equal(runtime.sources.get(created.source.id)?.active, false, "final assignment disables source");
const stale = runtime.createAssignment(3, 31, 10);
const passedFull = runtime.recordTest(stale.assignment.id, "full", "passed");
assert.equal(passedFull.assignment.status, "ready", "passed full test makes draft/testing assignment ready");
assert.equal(passedFull.assignment.enabled, false, "passed full test does not enable assignment");
assert.equal(runtime.sources.get(stale.source.id)?.active, false, "passed full test does not activate source");
assert.equal(runtime.readinessCounts(3).sourceAssignmentsConfigured, 1, "readiness counts the ready current assignment");
runtime.activate(stale.assignment.id);
runtime.updateAssignmentConfig(stale.assignment.id);
assert.equal(runtime.assignments.get(stale.assignment.id)?.testStatus, "stale");
assert.equal(runtime.assignments.get(stale.assignment.id)?.enabled, false);
assert.throws(() => runtime.assertCanReady(stale.assignment.id), /source_assignment_tests_stale/);
assert.equal(runtime.readinessCounts(3).sourceAssignmentsBlocked, 1, "stale assignment is counted as blocked");
const failed = runtime.createAssignment(3, 30, 10);
const failedFull = runtime.recordTest(failed.assignment.id, "full", "failed");
assert.equal(failedFull.assignment.status, "testing", "failed full test remains non-ready");
assert.equal(runtime.readinessCounts(3).sourceAssignmentsBlocked, 2, "failed current assignment is counted as blocked");
const inactiveClientAssignment = runtime.createAssignment(4, 40, 19);
runtime.recordTest(inactiveClientAssignment.assignment.id, "full", "passed");
runtime.clients.get(4)!.active = false;
assert.throws(() => runtime.activate(inactiveClientAssignment.assignment.id), /client_inactive/);
runtime.clients.get(4)!.active = true;
runtime.workspaces.get(40)!.active = false;
assert.throws(() => runtime.activate(inactiveClientAssignment.assignment.id), /workspace_inactive/);
const capturedIdentity = runtime.assignments.get(stale.assignment.id)?.sourceValidationIdentity || "";
runtime.assignments.get(stale.assignment.id)!.sourceValidationIdentity = "changed";
assert.throws(() => runtime.completeAfterConcurrentChange(stale.assignment.id, capturedIdentity), /source_assignment_changed_during_test/);
assert.throws(() => runtime.rawInsertAssignmentTest({
  clientId: stale.assignment.clientId,
  workspaceId: stale.assignment.workspaceId,
  assignmentId: stale.assignment.id,
  sourceId: stale.assignment.sourceId,
  publisherChannelId: 999,
  testType: "relevance",
  status: "passed",
}), /assignment_channel_fk_violation/);
assert.equal(runtime.users[0].clientId, null, "platform admin remains clientId null");
assert.deepEqual(runtime.platformResetAudit, [{ id: 1, status: "success" }], "platform reset audit remains unchanged");

const summarized = summarizeAssignmentSample({
  headline: "x".repeat(400),
  normalizedUrl: "https://example.com/" + "a".repeat(800),
  publicationTime: "2026-08-02T00:00:00Z",
  language: "english-long-value",
  relevanceClassification: "direct_scope_match",
  matchedSignals: Array.from({ length: 20 }, (_, index) => `signal-${index}`),
  rejectionReason: "r".repeat(400),
});
assert.equal(summarized.headline.length, 240);
assert.equal(summarized.normalizedUrl?.length, 500);
assert.equal(summarized.language?.length, 16);
assert.equal(summarized.matchedSignals.length, 12);
assert.equal(summarized.rejectionReason?.length, 240);

const storage = source("server/storage.ts");
const routes = source("server/routes.ts");
const feedWorker = source("server/feed-worker.ts");
const sourceInspector = source("server/source-sample-inspector.ts");
const schemaSource = source("shared/schema.ts");
const workspacePage = source("client/src/pages/WorkspaceSourceAssignments.tsx");
const clientSetup = source("client/src/pages/ClientSetup.tsx");
const adminPage = source("client/src/pages/Admin.tsx");

includes(storage, "createWorkspaceSourceAssignmentAtomic", "atomic assignment method exists");
includes(storage, "SELECT pg_advisory_xact_lock", "atomic assignment uses advisory lock");
includes(storage, "active: false", "provisioned sources are inactive");
includes(storage, "status: \"draft\"", "new assignments are draft");
includes(storage, "enabled: false", "new assignments are disabled");
includes(storage, "createAuditLogInTransaction", "assignment writes are audited in transaction");
includes(storage, "publisher_not_approved_for_client", "unapproved publishers are blocked");
includes(storage, "source_assignment_client_mismatch", "cross-client source assignment is blocked");
includes(storage, "source_assignment_channel_mismatch", "source/channel mismatch is blocked");
includes(storage, "source_assignment_publisher_mismatch", "private publisher mismatch is blocked");
includes(storage, "duplicate_workspace_source_assignment", "duplicate assignment has safe error");
includes(storage, "channel_not_eligible", "unsupported channels are blocked");
includes(sourceInspector, "articleInsertions: 0", "connectivity tests report no article writes");
includes(sourceInspector, "processingJobsCreated: 0", "tests report no job creation");
includes(sourceInspector, "appearancesCreated: 0", "relevance tests report no appearance writes");
includes(sourceInspector, "rejectedItemsCreated: 0", "relevance tests report no rejected-item writes");
includes(storage, "warning_approval_not_allowed", "warning approval is constrained");
includes(storage, "testStatus: \"stale\"", "profile changes mark assignments stale");
includes(storage, "inspectOperationalSourceSample", "assignment tests fetch actual operational source samples");
includes(storage, "source_assignment_changed_during_test", "stale source/profile changes are rejected after inspection");
includes(storage, "testType: \"full\"", "full test records a single full test run");
includes(storage, "source_assignment_relevance_test_required", "connectivity-only tests cannot make assignments ready");
includes(storage, "recomputeOperationalSourceActiveState", "source active state is recomputed from assignments");
includes(storage, "findCanonicalArticleForPublisherAppearance", "publisher-safe canonical article lookup exists");
includes(storage, "getWorkspaceProfilesForActiveSourceAssignments", "active assignments drive workspace relevance");
includes(storage, "getSourceAssignmentSummaries", "source-management assignment summaries exist");
includes(schemaSource, "workspace_source_assignments_id_channel_unique", "schema enforces assignment/channel uniqueness");
includes(schemaSource, "workspace_source_assignment_tests_assignment_channel_fk", "schema enforces test assignment/channel FK");
assert.equal(storage.includes("testWorkspaceSourceAssignmentFull(clientId, workspaceId, assignmentId, actorUserId)"), false, "full test does not call connectivity helper");

includes(routes, "/api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments", "source assignment routes exist");
includes(routes, "parsePositiveId(req.params.clientId)", "routes parse client IDs");
includes(routes, "parsePositiveId(req.params.workspaceId)", "routes parse workspace IDs");
includes(routes, "parsePositiveId(req.params.assignmentId)", "routes parse assignment IDs");
includes(routes, "requireSystemAdmin()", "routes require platform admin");
includes(routes, "buildWorkspaceSourceAssignmentPublisherResponse", "source assignment route uses explicit publisher DTO adapter");
includes(routes, "storage.getSourceAssignmentSummaries(clientId)", "source list attaches assignment metadata");
includes(routes, "source_assignment_tests_stale", "readiness reports stale test blocker");
includes(routes, "workspace_inactive", "readiness reports workspace inactive blocker");
includes(routes, "client_inactive", "readiness reports client inactive blocker");
includes(routes, "samples_not_allowed", "routes reject browser-supplied relevance samples");

includes(feedWorker, "recordLinkedSourceAppearance", "linked ingestion records appearances");
includes(feedWorker, "getWorkspaceProfilesForActiveSourceAssignments", "linked sources use active assignments");
includes(feedWorker, "createArticleAppearance", "canonical appearance linkage is used");
includes(feedWorker, "source.publisherChannelId", "legacy sources remain separate from linked sources");
includes(feedWorker, "collectorTypeForSource", "collector metadata is preserved");
includes(feedWorker, "google_news", "Google News stays collector metadata");
includes(feedWorker, "findCanonicalArticleForPublisherAppearance", "linked sources use publisher-scoped canonical lookup");
includes(feedWorker, "!source.publisherChannelId && title.length", "linked sources skip client-wide exact-title dedupe");

includes(workspacePage, "/admin/clients/:clientId/workspaces/:workspaceId/sources", "admin UI route exists");
includes(workspacePage, "Preview ready", "preview workflow is visible");
includes(workspacePage, "No source, assignment, article, or job was created", "preview no-write behavior is disclosed");
includes(workspacePage, "Connectivity", "connectivity workflow is visible");
includes(workspacePage, "Relevance", "relevance workflow is visible");
includes(workspacePage, "Full", "full source test workflow is visible");
includes(workspacePage, "Sample headlines", "actual source samples are displayed");
includes(workspacePage, "skippedMalformedPublisherCount", "malformed publisher records are surfaced without crashing");
assert.equal(workspacePage.includes("Iraq government announces new public service program"), false, "UI no longer embeds hardcoded relevance sample");
includes(clientSetup, "Continue to Source Setup", "client setup links to source setup");
includes(clientSetup, "Assignment tests passed", "client readiness displays passed test count");
includes(adminPage, "assignmentSummary", "source management displays assignment metadata");
includes(adminPage, "setup incomplete", "incomplete setup is visible in source management");

const channel = {
  id: 9,
  publisherProfileId: 4,
  channelType: "rss",
  normalizedUrl: "https://fixture.example/rss.xml",
  url: "https://fixture.example/rss.xml",
  externalId: null,
  handle: null,
  validationStatus: "valid",
  verificationStatus: "verified",
  lifecycleStatus: "active",
  updatedAt: new Date("2026-08-01T00:00:00Z"),
} as PublisherChannel;

const baseSource = {
  id: 10,
  name: "Fixture RSS",
  url: "https://fixture.example/rss.xml",
  type: "rss",
  active: false,
  intervalMinutes: 15,
  maxArticlesPerFetch: 10,
  retentionDays: 7,
  userId: 2,
  clientId: 3,
  country: "IQ",
  category: "politics",
  collectorConfig: null,
  filterConfig: null,
  feedToken: "00000000-0000-0000-0000-000000000001",
  refreshPriority: "medium",
  logoUrl: null,
  publisherChannelId: channel.id,
  sourceIdentityKey: buildOperationalSourceIdentityKey(3, channel.id),
  deletedAt: null,
  lastFetchedAt: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
} as Source;

const fixtureHeaders = (values: Record<string, string>) => ({
  get(name: string) {
    return values[name.toLowerCase()] || null;
  },
});

const rssXml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Baghdad security cooperation expands</title><link>https://fixture.example/a</link><guid>guid-a</guid><description>Joint security cooperation in Baghdad.</description><pubDate>Sat, 01 Aug 2026 08:00:00 GMT</pubDate></item>
  <item><title>Morocco election coverage</title><link>https://fixture.example/b</link><guid>guid-b</guid><description>Election story outside the target workspace.</description><pubDate>Sat, 01 Aug 2026 07:00:00 GMT</pubDate></item>
</channel></rss>`;

const safeTextResult = (text: string, finalUrl = "https://fixture.example/", overrides: Record<string, unknown> = {}) => ({
  text,
  statusCode: 200,
  finalUrl,
  redirectCount: 0,
  approvedAddressFamily: 4,
  contentType: "text/html",
  elapsedMs: 12,
  bytesRead: Buffer.byteLength(text),
  truncated: false,
  declaredContentLength: Buffer.byteLength(text),
  ...overrides,
});

const inspected = await inspectOperationalSourceSample(baseSource, channel, {
  resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
  requestUrl: async () => ({
    status: 200,
    headers: fixtureHeaders({
      "content-type": "application/rss+xml",
      "content-length": String(Buffer.byteLength(rssXml)),
    }),
    body: (async function* () { yield rssXml; })(),
  }),
});
assert.equal(inspected.success, true);
assert.equal(inspected.collectorType, "rss");
assert.equal(inspected.items.length, 2);
assert.equal(inspected.safeSourceFacts.itemCount, 2);
assert.equal(inspected.safeSourceFacts.articleInsertions, 0);
assert.equal(inspected.safeSourceFacts.processingJobsCreated, 0);
assert.equal(inspected.items[0].externalId, "guid-a");

const filtered = await inspectOperationalSourceSample({
  ...baseSource,
  filterConfig: { whitelist: { enabled: true, keywords: ["Baghdad"], fields: ["title", "description"] }, blacklist: { enabled: false, keywords: [], fields: ["title"] } },
} as Source, channel, {
  resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
  requestUrl: async () => ({
    status: 200,
    headers: fixtureHeaders({ "content-type": "application/rss+xml" }),
    body: (async function* () { yield rssXml; })(),
  }),
});
assert.equal(filtered.safeSourceFacts.rawItemCount, 2);
assert.equal(filtered.safeSourceFacts.itemCount, 1);
assert.equal(filtered.items[0].title, "Baghdad security cooperation expands");

const websiteChannel = {
  ...channel,
  channelType: "website",
  normalizedUrl: "https://fixture.example/",
  url: "https://fixture.example/",
} as PublisherChannel;
const websiteSource = {
  ...baseSource,
  name: "Fixture Website",
  url: "https://fixture.example/",
  type: "website",
  collectorConfig: null,
  publisherChannelId: websiteChannel.id,
} as Source;

const selectorHtml = `
<main>
  <div class="krg-card"><a class="story-link" href="/en/news/iraq-cabinet-meets">Open</a><h2>Baghdad cabinet reviews public services</h2><p class="dek">Iraq public services update from government.</p><img src="/image.jpg" alt="Cabinet meeting"><time datetime="2026-08-03T08:00:00Z"></time></div>
  <div class="krg-card"><a class="story-link" href="/en/news/security-dialogue">Open</a><h2>Security dialogue continues in Erbil</h2><p class="dek">Kurdistan security talks affecting Iraq.</p><time datetime="2026-08-03T07:00:00Z"></time></div>
</main>`;
const selectorInspection = await inspectOperationalSourceSample({
  ...websiteSource,
  collectorConfig: {
    strategy: "scrape",
    selectors: {
      item: ".krg-card",
      link: ".story-link",
      title: "h2",
      summary: ".dek",
      image: "img",
      date: "time",
    },
  },
} as Source, websiteChannel, {
  fetchText: async (_url, deps) => {
    assert.equal(deps.truncateOnLimit, true, "website inspection opts into bounded HTML truncation");
    assert.equal((deps.maxBytes || 0) <= 1024 * 1024, true, "website inspection uses a hard cap no larger than 1 MiB");
    return safeTextResult(selectorHtml, "https://fixture.example/");
  },
});
assert.equal(selectorInspection.success, true);
assert.equal(selectorInspection.safeSourceFacts.rawItemCount, 2);
assert.equal(selectorInspection.items[0].title, "Baghdad cabinet reviews public services");
assert.equal(selectorInspection.items[0].image, "https://fixture.example/image.jpg");
assert.equal(selectorInspection.safeSourceFacts.sourceFetchLogsCreated, 0);

const malformedSelectorInspection = await inspectOperationalSourceSample({
  ...websiteSource,
  collectorConfig: { strategy: "scrape", selectors: { item: "article[", link: "a" } },
} as Source, websiteChannel, {
  fetchText: async () => safeTextResult(selectorHtml, "https://fixture.example/"),
});
assert.equal(malformedSelectorInspection.success, false);
assert.equal(malformedSelectorInspection.errorCode, "invalid_selector_configuration");

const jsonLdHtml = `
<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"NewsArticle","headline":"Iraq oil budget talks continue in Baghdad","url":"/news/2026/08/iraq-oil-budget","description":"Budget talks continue with oil revenue focus.","datePublished":"2026-08-03T09:00:00Z","image":"/oil.jpg"}
</script></head><body>
  <nav><a href="/en">English</a><a href="/category/politics">Politics</a></nav>
  <article><a href="/news/2026/08/security-cooperation">Baghdad security cooperation expands with regional partners</a><p>Regional partners discuss Iraq security.</p><time datetime="2026-08-03T08:30:00Z"></time></article>
</body></html>`;
const jsonLdInspection = await inspectOperationalSourceSample(websiteSource, websiteChannel, {
  fetchText: async () => safeTextResult(jsonLdHtml, "https://fixture.example/"),
});
assert.equal(jsonLdInspection.success, true);
assert.equal(jsonLdInspection.items[0].title, "Iraq oil budget talks continue in Baghdad", "JSON-LD article is preferred before generic anchors");
assert.equal(jsonLdInspection.items.some((item) => item.title === "English"), false, "language switcher link is rejected");
assert.equal(jsonLdInspection.items.some((item) => item.url.endsWith("/category/politics")), false, "category-only link is rejected");

const cbiFixture = `
<main>
  <nav><a href="/en">English</a><a href="/en/about">About</a><a href="/en/search">Search</a></nav>
  <section class="latest-news"><a href="/en/news/view/1245">Central Bank of Iraq launches Baghdad payment initiative</a><p>Banking update in Iraq.</p><time datetime="2026-08-02T10:00:00Z"></time></section>
</main>`;
const cbiInspection = await inspectOperationalSourceSample(websiteSource, websiteChannel, {
  fetchText: async () => safeTextResult(cbiFixture, "https://cbi.iq/"),
});
assert.equal(cbiInspection.safeSourceFacts.rawItemCount, 1, "CBI-style navigation noise is rejected before relevance scoring");
assert.equal(cbiInspection.items[0].title, "Central Bank of Iraq launches Baghdad payment initiative");

const unIraqFixture = `
<main>
  <a href="https://facebook.com/uniraq">Facebook</a>
  <a href="/en/tags/global">Global</a>
  <article><a href="/en/press-release/baghdad-humanitarian-update-2026">UN Iraq reports Baghdad humanitarian coordination update</a><p>Iraq coordination update.</p><time datetime="2026-08-02T09:00:00Z"></time></article>
</main>`;
const unIraqInspection = await inspectOperationalSourceSample(websiteSource, websiteChannel, {
  fetchText: async () => safeTextResult(unIraqFixture, "https://iraq.un.org/en"),
});
assert.equal(unIraqInspection.safeSourceFacts.rawItemCount, 1, "UN Iraq fixture rejects social/tag navigation noise");
assert.equal(unIraqInspection.items[0].title, "UN Iraq reports Baghdad humanitarian coordination update");

let shafaqFeedFetchWasStrict = false;
const shafaqHtml = `<html><head><link rel="alternate" type="application/rss+xml" href="/rss.xml"></head><body><nav><a href="/ar">Arabic</a></nav></body></html>`;
const shafaqInspection = await inspectOperationalSourceSample(websiteSource, websiteChannel, {
  fetchText: async (url, deps) => {
    if (url.endsWith("/rss.xml")) {
      shafaqFeedFetchWasStrict = deps.truncateOnLimit === false;
      return safeTextResult(rssXml, "https://fixture.example/rss.xml", {
        contentType: "application/rss+xml",
        bytesRead: Buffer.byteLength(rssXml),
        declaredContentLength: Buffer.byteLength(rssXml),
      });
    }
    assert.equal(deps.truncateOnLimit, true);
    return safeTextResult(shafaqHtml, "https://fixture.example/", {
      truncated: true,
      bytesRead: 1024 * 1024,
      declaredContentLength: 2 * 1024 * 1024,
    });
  },
});
assert.equal(shafaqInspection.success, true);
assert.equal(shafaqInspection.safeSourceFacts.structure, "discovered_rss", "early RSS metadata is discovered from bounded HTML");
assert.equal(shafaqFeedFetchWasStrict, true, "discovered RSS feed is fetched with strict complete-body parsing");
assert.deepEqual(shafaqInspection.warnings, ["response_truncated"]);

const rudawHtml = `
<main>
  <article class="story-card"><a href="/english/middleeast/iraq/03082026">Iraq parliament debates budget and oil revenue package</a><p>Latest Iraq political and economy coverage.</p><time datetime="2026-08-03T06:00:00Z"></time></article>
  <a href="/english">English</a><a href="/about">About</a>
</main>`;
const rudawInspection = await inspectOperationalSourceSample(websiteSource, websiteChannel, {
  fetchText: async (_url, deps) => {
    assert.equal(deps.truncateOnLimit, true);
    return safeTextResult(rudawHtml, "https://www.rudaw.net/", {
      truncated: true,
      bytesRead: 1024 * 1024,
      declaredContentLength: 3 * 1024 * 1024,
    });
  },
});
assert.equal(rudawInspection.success, true);
assert.equal(rudawInspection.safeSourceFacts.structure, "html_links");
assert.equal(rudawInspection.safeSourceFacts.responseTruncated, true);
assert.equal(rudawInspection.items[0].title, "Iraq parliament debates budget and oil revenue package");

const unsafe = await inspectOperationalSourceSample({
  ...baseSource,
  url: "http://127.0.0.1/internal.xml",
} as Source, { ...channel, url: "http://127.0.0.1/internal.xml", normalizedUrl: "http://127.0.0.1/internal.xml" } as PublisherChannel);
assert.equal(unsafe.success, false);
assert.equal(unsafe.safeSourceFacts.articleInsertions, 0);
assert.ok(["blocked_network_target", "blocked_resolved_address"].includes(String(unsafe.errorCode)));

const firstIdentity = sourceValidationIdentity(baseSource, channel);
const changedIdentity = sourceValidationIdentity({ ...baseSource, url: "https://fixture.example/changed.xml" } as Source, channel);
assert.notEqual(firstIdentity, changedIdentity, "source validation identity changes when source config changes");

console.log("workspace source assignment tests passed");
