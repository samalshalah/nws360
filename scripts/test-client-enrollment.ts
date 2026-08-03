import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  clientLifecycleUpdateSchema,
  normalizeClientSetupUpdate,
  normalizeClientEnrollment,
  normalizeWorkspaceName,
  normalizeWorkspaceSetupUpdate,
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

const enrollmentLocks = new Map<string, Promise<void>>();

async function enrollConcurrentSafe(state: MemoryState, request: any, user: User) {
  const key = String(request?.enrollmentKey || "");
  const previous = enrollmentLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = previous.then(() => new Promise<void>((resolve) => { release = resolve; }));
  enrollmentLocks.set(key, current);
  await previous;
  try {
    await Promise.resolve();
    return enroll(state, request, user);
  } finally {
    release();
    if (enrollmentLocks.get(key) === current) enrollmentLocks.delete(key);
  }
}

function updateClientSetup(state: MemoryState, clientId: number, input: unknown, options: { failAfter?: "client" | "settings" | "audit" } = {}) {
  const client = state.clients.find((item) => item.id === clientId);
  const settings = state.clientSettings.find((item) => item.clientId === clientId);
  if (!client) throw new Error("Client not found");
  const before = clone(state);
  try {
    const normalized = normalizeClientSetupUpdate(input, { client, settings });
    Object.assign(client, normalized.clientUpdates);
    if (options.failAfter === "client") throw new Error("simulated setup client failure");
    if (settings) Object.assign(settings, normalized.settingsUpdates);
    else state.clientSettings.push({ clientId, ...normalized.settingsUpdates });
    if (options.failAfter === "settings") throw new Error("simulated setup settings failure");
    state.auditLogs.push({ id: state.auditLogs.length + 1, userId: 2, clientId, action: "organization_change", details: normalized.changedFields });
    if (options.failAfter === "audit") throw new Error("simulated setup audit failure");
    return normalized;
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
}

function transitionLifecycle(state: MemoryState, clientId: number, input: unknown, readiness = { monitoringReady: false, blockers: ["publisher_profiles_missing"] }) {
  const parsed = clientLifecycleUpdateSchema.parse(input);
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) throw new Error("Client not found");
  if (parsed.lifecycleStatus === "active" && !readiness.monitoringReady) {
    const error: any = new Error("Client cannot become active before publisher and source setup is complete");
    error.status = 409;
    error.code = "readiness_blocked";
    throw error;
  }
  const affectedWorkspaceIds: number[] = [];
  if (parsed.lifecycleStatus === "suspended" || parsed.lifecycleStatus === "archived") {
    for (const workspace of state.workspaces.filter((item) => item.clientId === clientId)) {
      affectedWorkspaceIds.push(workspace.id);
      workspace.active = false;
      if (parsed.lifecycleStatus === "archived") workspace.status = "archived";
      else if (workspace.status === "active") workspace.status = "paused";
    }
  }
  const previousLifecycleStatus = client.lifecycleStatus;
  client.lifecycleStatus = parsed.lifecycleStatus;
  client.active = parsed.lifecycleStatus === "setup" || parsed.lifecycleStatus === "active";
  state.auditLogs.push({
    id: state.auditLogs.length + 1,
    userId: 2,
    clientId,
    action: "lifecycle_status_change",
    previousLifecycleStatus,
    newLifecycleStatus: parsed.lifecycleStatus,
    affectedWorkspaceIds,
  });
  return { client, affectedWorkspaceIds };
}

function updateWorkspacePatch(state: MemoryState, clientId: number, workspaceId: number, input: unknown, readiness = { monitoringReady: false, blockers: ["publisher_profiles_missing"] }) {
  const workspace = state.workspaces.find((item) => item.id === workspaceId && item.clientId === clientId);
  if (!workspace) {
    const error: any = new Error("Workspace not found");
    error.status = 404;
    throw error;
  }
  const profile = state.relevanceProfiles.find((item) => item.workspaceId === workspaceId) || null;
  const normalized = normalizeWorkspaceSetupUpdate(input, { workspace, relevanceProfile: profile });
  if (normalized.updates.normalizedName) {
    const duplicate = state.workspaces.find((item) =>
      item.clientId === clientId &&
      item.id !== workspaceId &&
      item.normalizedName === normalized.updates.normalizedName
    );
    if (duplicate) {
      const error: any = new Error("Workspace name already exists for this client");
      error.status = 409;
      throw error;
    }
  }
  if (normalized.proposed.status === "active" && input && typeof input === "object" && "status" in input && !readiness.monitoringReady) {
    const error: any = new Error("Workspace cannot activate before publisher and source setup is complete");
    error.status = 409;
    throw error;
  }
  Object.assign(workspace, normalized.updates);
  if (normalized.proposed.status === "draft" && input && typeof input === "object" && "status" in input) {
    Object.assign(workspace, { active: false, activatedAt: null, activatedBy: null });
  } else if (normalized.proposed.status === "ready" && input && typeof input === "object" && "status" in input) {
    workspace.active = false;
  } else if ((normalized.proposed.status === "paused" || normalized.proposed.status === "archived") && input && typeof input === "object" && "status" in input) {
    workspace.active = false;
  }
  state.auditLogs.push({ id: state.auditLogs.length + 1, userId: 2, clientId, action: "workspace_change", entityId: workspaceId });
  return workspace;
}

function legacyClientUpdate(_state: MemoryState, _clientId: number, _body: unknown) {
  return { status: 410, code: "legacy_client_update_retired" };
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

async function testConcurrentIdenticalEnrollmentCreatesOneClient() {
  const state = emptyState();
  const [first, second] = await Promise.all([
    enrollConcurrentSafe(state, baseRequest(), platformAdmin()),
    enrollConcurrentSafe(state, baseRequest(), platformAdmin()),
  ]);
  assert.equal(state.clients.length, 1);
  assert.equal(state.workspaces.length, 1);
  assert.equal(state.relevanceProfiles.length, 1);
  assert.equal(first.clientId, second.clientId);
  assert.equal([first.idempotent, second.idempotent].filter(Boolean).length, 1);
}

async function testConcurrentSameKeyDifferentPayloadConflictsWithoutPartialRecords() {
  const state = emptyState();
  const results = await Promise.allSettled([
    enrollConcurrentSafe(state, baseRequest(), platformAdmin()),
    enrollConcurrentSafe(state, baseRequest({ organization: { name: "Different Embassy" } }), platformAdmin()),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(state.clients.length, 1);
  assert.equal(state.workspaces.length, 1);
  assert.equal(state.relevanceProfiles.length, 1);
}

async function testConcurrentDuplicateSlugReturnsSafeConflict() {
  const state = emptyState();
  const results = await Promise.allSettled([
    enrollConcurrentSafe(state, baseRequest(), platformAdmin()),
    enrollConcurrentSafe(state, baseRequest({ enrollmentKey: "enroll-other-key-2", organization: { name: "Other Embassy", slug: "us-embassy-baghdad" } }), platformAdmin()),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rejected.reason?.message || rejected.reason), /slug already exists/);
  assert.equal(rejected.reason?.status, 409);
  assert.equal(state.clients.length, 1);
}

function testSetupUpdateIsAtomicAndAudited() {
  const state = emptyState();
  const { clientId } = enroll(state, baseRequest(), platformAdmin());
  const beforeAuditCount = state.auditLogs.length;
  const result = updateClientSetup(state, clientId, {
    name: "U.S. Embassy Baghdad Media Office",
    representedCountryCode: "US",
    hostCountryCode: "IQ",
    contactEmail: "media-office@example.test",
  });
  assert(result.changedFields.includes("name"));
  assert.equal(state.clients[0].name, "U.S. Embassy Baghdad Media Office");
  assert.equal(state.clientSettings[0].homeCountryCode, "US");
  assert.equal(state.auditLogs.length, beforeAuditCount + 1);
}

function testSetupFailureRollsBackClientSettingsAndAudit() {
  const state = emptyState();
  const { clientId } = enroll(state, baseRequest(), platformAdmin());
  const before = clone(state);
  assert.throws(() => updateClientSetup(state, clientId, { name: "Rollback Name", contactEmail: "rollback@example.test" }, { failAfter: "settings" }), /simulated/);
  assert.deepEqual(state, before);
}

function testSetupValidationAndLegacyCountrySync() {
  const state = emptyState();
  const { clientId } = enroll(state, baseRequest(), platformAdmin());
  assert.throws(() => updateClientSetup(state, clientId, { representedCountryCode: null }), /Invalid client setup update/);
  assert.throws(() => updateClientSetup(state, clientId, { contactEmail: "not-an-email" }), /Invalid client setup update/);
  assert.throws(() => updateClientSetup(state, clientId, { representedCountryCode: "ZZ" }), /Invalid client setup update/);
  assert.throws(() => updateClientSetup(state, clientId, { organizationType: "invalid_type" }), /Invalid client setup update/);
  updateClientSetup(state, clientId, {
    organizationType: "newsroom",
    representedCountryCode: null,
    hostCountryCode: null,
    headquartersCountryCode: "GB",
  });
  assert.equal(state.clients[0].organizationType, "newsroom");
  assert.equal(state.clientSettings[0].representedCountryCode, null);
  assert.equal(state.clientSettings[0].hostCountryCode, null);
  assert.equal(state.clientSettings[0].homeCountryCode, null);
  assert.equal(state.clientSettings[0].homeCountryName, null);
}

function testLegacyClientUpdateIsRetired() {
  const state = emptyState();
  enroll(state, baseRequest(), platformAdmin());
  const result = legacyClientUpdate(state, 1, { enrollmentKey: "changed", enrollmentRequestFingerprint: "changed", unknown: true });
  assert.equal(result.status, 410);
  assert.equal(state.clients[0].enrollmentKey, "enroll-us-embassy-baghdad-1");
}

function testLifecycleTransitions() {
  const state = emptyState();
  const { clientId } = enroll(state, baseRequest(), platformAdmin());
  state.workspaces[0].status = "active";
  state.workspaces[0].active = true;
  const beforeAuditCount = state.auditLogs.length;
  const suspended = transitionLifecycle(state, clientId, { lifecycleStatus: "suspended", reason: "test" });
  assert.equal(state.clients[0].lifecycleStatus, "suspended");
  assert.equal(state.clients[0].active, false);
  assert.equal(state.workspaces[0].active, false);
  assert.equal(state.workspaces[0].status, "paused");
  assert.deepEqual(suspended.affectedWorkspaceIds, [1]);
  assert.equal(state.auditLogs.length, beforeAuditCount + 1);
  transitionLifecycle(state, clientId, { lifecycleStatus: "setup" });
  assert.equal(state.clients[0].lifecycleStatus, "setup");
  assert.equal(state.clients[0].active, true);
  assert.throws(() => transitionLifecycle(state, clientId, { lifecycleStatus: "active" }), /publisher and source setup/);
}

function testWorkspacePatchValidationAndAudit() {
  const state = emptyState();
  const { clientId, workspaceId } = enroll(state, baseRequest(), platformAdmin());
  const beforeAuditCount = state.auditLogs.length;
  assert.throws(() => updateWorkspacePatch(state, clientId, workspaceId!, { scopeMode: "single_country", primaryCountryCodes: ["IQ", "US"] }), /Invalid workspace update/);
  assert.throws(() => updateWorkspacePatch(state, clientId, workspaceId!, { scopeMode: "regional", regionCodes: [] }), /Invalid workspace update/);
  state.relevanceProfiles[0].topics = [];
  state.relevanceProfiles[0].inclusionTerms = [];
  assert.throws(() => updateWorkspacePatch(state, clientId, workspaceId!, { scopeMode: "topic_only" }), /Invalid workspace update/);
  const updated = updateWorkspacePatch(state, clientId, workspaceId!, { name: "Iraq Morning Desk", scopeMode: "single_country", primaryCountryCodes: ["IQ"] });
  assert.equal(updated.normalizedName, "iraq morning desk");
  assert.equal(state.auditLogs.length, beforeAuditCount + 1);
}

function testWorkspaceDuplicateAndStatusConsistency() {
  const state = emptyState();
  const { clientId, workspaceId } = enroll(state, baseRequest(), platformAdmin());
  state.workspaces.push({
    id: 2,
    clientId,
    name: "Economy Desk",
    normalizedName: "economy desk",
    status: "draft",
    active: false,
    scopeMode: "single_country",
    primaryCountryCodes: ["IQ"],
  });
  assert.throws(() => updateWorkspacePatch(state, clientId, workspaceId!, { name: " economy   DESK " }), /already exists/);
  const draft = updateWorkspacePatch(state, clientId, workspaceId!, { status: "draft" });
  assert.equal(draft.active, false);
  assert.equal(draft.activatedAt, null);
  assert.equal(draft.activatedBy, null);
  assert.throws(() => updateWorkspacePatch(state, clientId, workspaceId!, { status: "active" }), /Workspace cannot activate/);
}

function testCrossClientWorkspacePatchSafe404() {
  const state = emptyState();
  enroll(state, baseRequest(), platformAdmin());
  assert.throws(() => updateWorkspacePatch(state, 999, 1, { name: "No Access" }), /Workspace not found/);
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
  await testConcurrentIdenticalEnrollmentCreatesOneClient();
  await testConcurrentSameKeyDifferentPayloadConflictsWithoutPartialRecords();
  await testConcurrentDuplicateSlugReturnsSafeConflict();
  testSetupUpdateIsAtomicAndAudited();
  testSetupFailureRollsBackClientSettingsAndAudit();
  testSetupValidationAndLegacyCountrySync();
  testLegacyClientUpdateIsRetired();
  testLifecycleTransitions();
  testWorkspacePatchValidationAndAudit();
  testWorkspaceDuplicateAndStatusConsistency();
  testCrossClientWorkspacePatchSafe404();
  console.log("client enrollment behavioral tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
