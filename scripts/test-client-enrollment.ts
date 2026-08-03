import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  normalizeClientEnrollment,
  normalizeWorkspaceName,
  stableEnrollmentJson,
  validateWorkspaceScope,
  type NormalizedClientEnrollment,
} from "../shared/client-enrollment";
import { validateWorkspaceTenantAccess } from "../shared/workspace-query-scope";
import { evaluatePeriodicJobEligibility } from "../server/periodic-job-rules";

type User = {
  id: number;
  role: string;
  userScope: string;
  clientId: number | null;
};

type MemoryState = {
  clients: any[];
  clientSettings: any[];
  workspaces: any[];
  relevanceProfiles: any[];
  auditLogs: any[];
  tenantUsers: any[];
  sources: any[];
  articles: any[];
  processingJobs: any[];
  platformResetAudit: any[];
};

function fingerprint(enrollment: NormalizedClientEnrollment) {
  return createHash("sha256").update(stableEnrollmentJson(enrollment)).digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function emptyState(): MemoryState {
  return {
    clients: [],
    clientSettings: [],
    workspaces: [],
    relevanceProfiles: [],
    auditLogs: [],
    tenantUsers: [],
    sources: [],
    articles: [],
    processingJobs: [],
    platformResetAudit: [{ id: 1, action: "platform_reset" }],
  };
}

function platformAdmin(): User {
  return { id: 2, role: "admin", userScope: "platform", clientId: null };
}

function tenantAdmin(clientId = 1): User {
  return { id: 10, role: "client_admin", userScope: "tenant", clientId };
}

function baseRequest(overrides: Record<string, any> = {}) {
  return {
    enrollmentKey: overrides.enrollmentKey || "enroll-us-embassy-baghdad-1",
    organization: {
      name: "U.S. Embassy Baghdad",
      slug: "us-embassy-baghdad",
      organizationType: "embassy",
      defaultLanguage: "en",
      websiteUrl: "https://iq.usembassy.gov",
      contactName: "Media Team",
      contactEmail: "media@example.test",
      ...(overrides.organization || {}),
    },
    organizationContext: {
      representedCountryCode: "US",
      hostCountryCode: "IQ",
      headquartersCountryCode: "",
      defaultTimezone: "Asia/Baghdad",
      defaultLanguages: ["en", "ar", "ku"],
      ...(overrides.organizationContext || {}),
    },
    workspace: {
      name: "Iraq Daily Monitoring",
      description: "Daily diplomatic media monitoring for Iraq.",
      purpose: "diplomatic_monitoring",
      scopeMode: "single_country",
      globalScope: false,
      primaryCountryCodes: ["IQ"],
      secondaryCountryCodes: [],
      regionCodes: [],
      subnationalAreas: [],
      preferredLanguages: ["ar", "ku", "en"],
      timezone: "Asia/Baghdad",
      taxonomyTemplateCode: "iraq-embassy",
      relevanceProfileCode: "iraq-daily",
      reportingTemplateCode: "daily-brief",
      ...(overrides.workspace || {}),
    },
    relevanceProfile: {
      topics: ["government", "security", "economy"],
      subtopics: [],
      industries: ["oil"],
      entities: ["Iraq", "United States"],
      organizations: ["U.S. Embassy Baghdad"],
      people: [],
      projects: [],
      events: [],
      multilingualAliases: ["United States", "America", "الولايات المتحدة"],
      inclusionTerms: ["Iraq", "Baghdad"],
      exclusionTerms: ["sports"],
      impactTerms: ["security cooperation"],
      contextualTerms: ["regional context"],
      minimumConfidence: 60,
      includeContextualByDefault: false,
      contextualLabel: "Regional Context",
      active: true,
      ...(overrides.relevanceProfile || {}),
    },
  };
}

function previewOnly(state: MemoryState, request: unknown) {
  const before = clone(state);
  const result = normalizeClientEnrollment(request);
  assert.deepEqual(state, before, "preview changed in-memory state");
  assert.equal(result.writes, false);
  return result;
}

function assertCanEnroll(user: User) {
  if (!(user.role === "admin" && user.userScope === "platform" && user.clientId === null)) {
    const error: any = new Error("Platform admin access required");
    error.status = 403;
    throw error;
  }
}

function enroll(state: MemoryState, request: unknown, user: User, options: { failAfter?: "client" | "settings" | "workspace" | "profile" } = {}) {
  assertCanEnroll(user);
  const preview = normalizeClientEnrollment(request);
  if (!preview.valid || !preview.normalized) {
    const error: any = new Error(preview.errors.join("; ") || "invalid enrollment");
    error.status = 400;
    throw error;
  }
  const normalized = preview.normalized;
  const requestFingerprint = fingerprint(normalized);
  const existingByKey = state.clients.find((client) => client.enrollmentKey === normalized.enrollmentKey);
  if (existingByKey) {
    if (existingByKey.enrollmentRequestFingerprint === requestFingerprint) {
      return { idempotent: true, clientId: existingByKey.id };
    }
    const error: any = new Error("Enrollment key already exists for a different request");
    error.status = 409;
    throw error;
  }
  if (state.clients.some((client) => client.slug === normalized.organization.slug)) {
    const error: any = new Error("Client slug already exists");
    error.status = 409;
    throw error;
  }
  const before = clone(state);
  try {
    const clientId = state.clients.length + 1;
    state.clients.push({
      id: clientId,
      name: normalized.organization.name,
      slug: normalized.organization.slug,
      organizationType: normalized.organization.organizationType,
      active: true,
      lifecycleStatus: "setup",
      enrollmentKey: normalized.enrollmentKey,
      enrollmentRequestFingerprint: requestFingerprint,
    });
    if (options.failAfter === "client") throw new Error("simulated client failure");

    state.clientSettings.push({
      clientId,
      representedCountryCode: normalized.organizationContext.representedCountryCode,
      hostCountryCode: normalized.organizationContext.hostCountryCode,
      headquartersCountryCode: normalized.organizationContext.headquartersCountryCode,
      defaultTimezone: normalized.organizationContext.defaultTimezone,
      defaultLanguages: normalized.organizationContext.defaultLanguages,
      homeCountryCode: normalized.organization.organizationType === "embassy" ? normalized.organizationContext.representedCountryCode : null,
    });
    if (options.failAfter === "settings") throw new Error("simulated settings failure");

    const workspaceId = state.workspaces.length + 1;
    state.workspaces.push({
      id: workspaceId,
      clientId,
      name: normalized.workspace.name,
      normalizedName: normalized.workspace.normalizedName,
      status: "draft",
      active: false,
      scopeMode: normalized.workspace.scopeMode,
      primaryCountryCodes: normalized.workspace.primaryCountryCodes,
    });
    if (options.failAfter === "workspace") throw new Error("simulated workspace failure");

    state.relevanceProfiles.push({
      id: state.relevanceProfiles.length + 1,
      workspaceId,
      topics: normalized.relevanceProfile.topics,
      inclusionTerms: normalized.relevanceProfile.inclusionTerms,
      active: true,
    });
    if (options.failAfter === "profile") throw new Error("simulated profile failure");

    state.auditLogs.push({ id: state.auditLogs.length + 1, userId: user.id, clientId, action: "client_enrollment" });
    return { idempotent: false, clientId, workspaceId };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
}

function workspaceNameAvailable(state: MemoryState, clientId: number, name: string) {
  const normalizedName = normalizeWorkspaceName(name);
  return !state.workspaces.some((workspace) => workspace.clientId === clientId && workspace.normalizedName === normalizedName);
}

function workspaceValidationRequest(scopeMode: string, workspace: Record<string, any>, relevanceProfile: Record<string, any> = {}) {
  const preview = normalizeClientEnrollment(baseRequest({
    workspace: {
      scopeMode,
      primaryCountryCodes: [],
      secondaryCountryCodes: [],
      regionCodes: [],
      subnationalAreas: [],
      globalScope: false,
      ...workspace,
    },
    relevanceProfile: {
      topics: [],
      entities: [],
      organizations: [],
      projects: [],
      events: [],
      industries: [],
      inclusionTerms: [],
      ...relevanceProfile,
    },
  }));
  assert(preview.normalized);
  return validateWorkspaceScope(preview.normalized.workspace, preview.normalized.relevanceProfile);
}

function testPreviewPerformsNoWrites() {
  const state = emptyState();
  const preview = previewOnly(state, baseRequest());
  assert.equal(preview.valid, true);
  assert.equal(state.clients.length, 0);
}

function testSuccessfulEnrollmentCreatesExpectedRecordsOnly() {
  const state = emptyState();
  const result = enroll(state, baseRequest(), platformAdmin());
  assert.equal(result.idempotent, false);
  assert.equal(state.clients.length, 1);
  assert.equal(state.clientSettings.length, 1);
  assert.equal(state.workspaces.length, 1);
  assert.equal(state.relevanceProfiles.length, 1);
  assert.equal(state.auditLogs.length, 1);
  assert.equal(state.tenantUsers.length, 0);
  assert.equal(state.sources.length, 0);
  assert.equal(state.articles.length, 0);
  assert.equal(state.processingJobs.length, 0);
}

function testTransactionFailureRollsBackAllRecords() {
  const state = emptyState();
  assert.throws(() => enroll(state, baseRequest(), platformAdmin(), { failAfter: "workspace" }), /simulated/);
  assert.equal(state.clients.length, 0);
  assert.equal(state.clientSettings.length, 0);
  assert.equal(state.workspaces.length, 0);
  assert.equal(state.relevanceProfiles.length, 0);
  assert.equal(state.auditLogs.length, 0);
}

function testRepeatedIdenticalEnrollmentKeyIsIdempotent() {
  const state = emptyState();
  const first = enroll(state, baseRequest(), platformAdmin());
  const second = enroll(state, baseRequest(), platformAdmin());
  assert.equal(second.idempotent, true);
  assert.equal(second.clientId, first.clientId);
  assert.equal(state.clients.length, 1);
}

function testSameEnrollmentKeyDifferentRequestConflicts() {
  const state = emptyState();
  enroll(state, baseRequest(), platformAdmin());
  assert.throws(
    () => enroll(state, baseRequest({ organization: { name: "Different Embassy" } }), platformAdmin()),
    /different request/,
  );
}

function testDuplicateSlugConflicts() {
  const state = emptyState();
  enroll(state, baseRequest(), platformAdmin());
  assert.throws(
    () => enroll(state, baseRequest({ enrollmentKey: "enroll-other-key-1", organization: { name: "Other", slug: "us-embassy-baghdad" } }), platformAdmin()),
    /slug already exists/,
  );
}

function testWorkspaceNameUniquenessIsClientScoped() {
  const state = emptyState();
  const first = enroll(state, baseRequest(), platformAdmin());
  assert.equal(workspaceNameAvailable(state, first.clientId, "  IRAQ daily monitoring "), false);
  assert.equal(workspaceNameAvailable(state, first.clientId + 1, "  IRAQ daily monitoring "), true);
}

function testTwoClientsMayUseSameWorkspaceName() {
  const state = emptyState();
  enroll(state, baseRequest(), platformAdmin());
  enroll(
    state,
    baseRequest({
      enrollmentKey: "enroll-network-1",
      organization: { name: "International News Network", slug: "international-news-network", organizationType: "newsroom" },
      organizationContext: { representedCountryCode: "", hostCountryCode: "", headquartersCountryCode: "GB" },
    }),
    platformAdmin(),
  );
  assert.equal(state.workspaces.filter((workspace) => workspace.normalizedName === "iraq daily monitoring").length, 2);
}

function testPlatformAdminRemainsClientIdNull() {
  const admin = platformAdmin();
  const state = emptyState();
  enroll(state, baseRequest(), admin);
  assert.equal(admin.clientId, null);
}

function testNoTenantUserSourceArticleOrProcessingJobCreated() {
  const state = emptyState();
  enroll(state, baseRequest(), platformAdmin());
  assert.deepEqual([state.tenantUsers.length, state.sources.length, state.articles.length, state.processingJobs.length], [0, 0, 0, 0]);
}

function testEmbassyRequiresRepresentedAndHostCountries() {
  const missingRepresented = normalizeClientEnrollment(baseRequest({ organizationContext: { representedCountryCode: "" } }));
  const missingHost = normalizeClientEnrollment(baseRequest({ organizationContext: { hostCountryCode: "" } }));
  assert.equal(missingRepresented.valid, false);
  assert(missingRepresented.errors.some((error) => error.includes("representedCountryCode")));
  assert.equal(missingHost.valid, false);
  assert(missingHost.errors.some((error) => error.includes("hostCountryCode")));
}

function testNonDiplomaticOrganizationMayOmitRepresentedCountry() {
  const preview = normalizeClientEnrollment(baseRequest({
    organization: { organizationType: "newsroom" },
    organizationContext: { representedCountryCode: "", hostCountryCode: "", headquartersCountryCode: "GB" },
  }));
  assert.equal(preview.valid, true);
}

function testMonitoringCountryIndependentFromRepresentedCountry() {
  const preview = normalizeClientEnrollment(baseRequest());
  assert(preview.normalized);
  assert.equal(preview.normalized.organizationContext.representedCountryCode, "US");
  assert.deepEqual(preview.normalized.workspace.primaryCountryCodes, ["IQ"]);
  assert(preview.warnings.some((warning) => warning.includes("represented country is organization context only")));
}

function testWorkspaceScopeValidations() {
  assert.deepEqual(workspaceValidationRequest("single_country", { primaryCountryCodes: ["IQ"] }), []);
  assert(workspaceValidationRequest("single_country", { primaryCountryCodes: ["IQ", "US"] }).some((error) => error.includes("exactly one")));
  assert.deepEqual(workspaceValidationRequest("multi_country", { primaryCountryCodes: ["IQ", "US"] }), []);
  assert(workspaceValidationRequest("multi_country", { primaryCountryCodes: ["IQ"] }).some((error) => error.includes("at least two")));
  assert.deepEqual(workspaceValidationRequest("regional", { regionCodes: ["mena"] }), []);
  assert(workspaceValidationRequest("regional", { regionCodes: [] }).some((error) => error.includes("region")));
  assert.deepEqual(workspaceValidationRequest("subnational", { primaryCountryCodes: ["IQ"], subnationalAreas: ["Baghdad"] }), []);
  assert(workspaceValidationRequest("subnational", { primaryCountryCodes: ["IQ"], subnationalAreas: [] }).some((error) => error.includes("subnational")));
  assert.deepEqual(workspaceValidationRequest("topic_only", {}, { topics: ["water"] }), []);
  assert(workspaceValidationRequest("topic_only", {}, {}).some((error) => error.includes("topic")));
  assert.deepEqual(workspaceValidationRequest("hybrid", { primaryCountryCodes: ["IQ"] }, { topics: ["water"] }), []);
  assert(workspaceValidationRequest("hybrid", { primaryCountryCodes: ["IQ"] }, {}).some((error) => error.includes("topic")));
}

function testDraftWorkspaceIsInactiveAndSchedulerSkipsIt() {
  const state = emptyState();
  enroll(state, baseRequest(), platformAdmin());
  assert.equal(state.workspaces[0].status, "draft");
  assert.equal(state.workspaces[0].active, false);
  const eligibility = evaluatePeriodicJobEligibility("INTELLIGENCE_PIPELINE", {
    activeClientCount: 1,
    activeWorkspaceCount: 0,
    activeArticleCount: 0,
    activeSourceCount: 0,
    dueBriefingCount: 0,
    retentionCandidateCount: 0,
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "no_eligible_monitoring_scope");
}

function testTenantCannotEnroll() {
  assert.throws(() => enroll(emptyState(), baseRequest(), tenantAdmin()), /Platform admin access required/);
}

function testCrossClientWorkspaceAccessRejected() {
  const result = validateWorkspaceTenantAccess({
    workspaceExists: true,
    workspaceClientId: 1,
    clientId: 2,
    isSystemAdmin: false,
  });
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.status, 404);
}

function testAdminExplicitRelevanceAccessWorksWithoutClientId() {
  const result = validateWorkspaceTenantAccess({
    workspaceExists: true,
    workspaceClientId: 1,
    clientId: null,
    isSystemAdmin: true,
  });
  assert.deepEqual(result, { allowed: true });
}

function testPlatformResetAuditRemainsIntact() {
  const state = emptyState();
  enroll(state, baseRequest(), platformAdmin());
  assert.deepEqual(state.platformResetAudit, [{ id: 1, action: "platform_reset" }]);
}

async function main() {
  testPreviewPerformsNoWrites();
  testSuccessfulEnrollmentCreatesExpectedRecordsOnly();
  testTransactionFailureRollsBackAllRecords();
  testRepeatedIdenticalEnrollmentKeyIsIdempotent();
  testSameEnrollmentKeyDifferentRequestConflicts();
  testDuplicateSlugConflicts();
  testWorkspaceNameUniquenessIsClientScoped();
  testTwoClientsMayUseSameWorkspaceName();
  testPlatformAdminRemainsClientIdNull();
  testNoTenantUserSourceArticleOrProcessingJobCreated();
  testEmbassyRequiresRepresentedAndHostCountries();
  testNonDiplomaticOrganizationMayOmitRepresentedCountry();
  testMonitoringCountryIndependentFromRepresentedCountry();
  testWorkspaceScopeValidations();
  testDraftWorkspaceIsInactiveAndSchedulerSkipsIt();
  testTenantCannotEnroll();
  testCrossClientWorkspaceAccessRejected();
  testAdminExplicitRelevanceAccessWorksWithoutClientId();
  testPlatformResetAuditRemainsIntact();
  console.log("client enrollment behavioral tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
