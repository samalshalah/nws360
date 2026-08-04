import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePeriodicJobEligibility } from "../server/periodic-job-rules";

type User = { id: number; role: "admin" | "client"; userScope: "platform" | "tenant"; clientId: number | null; authenticated: boolean };
type ClientRecord = { id: number; active: boolean; lifecycleStatus: "setup" | "active" | "suspended" | "archived" };
type WorkspaceRecord = { id: number; clientId: number; active: boolean; status: "draft" | "active" | "paused" | "archived" };
type AssignmentRecord = {
  id: number;
  clientId: number;
  workspaceId: number;
  sourceId: number;
  status: "ready" | "active" | "paused" | "draft" | "archived";
  enabled: boolean;
  testStatus: "passed" | "failed" | "stale" | "untested" | "warning";
  latestTestRunId: number | null;
  relevanceProfileVersion: number;
  sourceValidationIdentity: string;
  assignmentConfigIdentity: string;
  warningApprovedAt?: string | null;
  warningApprovalReason?: string | null;
};
type TestRunRecord = {
  id: number;
  assignmentId: number;
  status: "passed" | "failed" | "warning";
  testType: "full" | "relevance";
  relevanceProfileVersion: number;
  sourceValidationIdentity: string;
  assignmentConfigIdentity: string;
};
type SourceRecord = { id: number; clientId: number; active: boolean };

type HarnessState = {
  clients: ClientRecord[];
  settings: Array<{ clientId: number }>;
  workspaces: WorkspaceRecord[];
  profiles: Array<{ workspaceId: number; profileVersion: number }>;
  publisherProfilesConfigured: number;
  sourceChannelsConfigured: number;
  assignments: AssignmentRecord[];
  tests: TestRunRecord[];
  sources: SourceRecord[];
  auditLogs: Array<{ action: string; entity: string; entityId: number; details: Record<string, unknown> }>;
  articles: unknown[];
  sourceFetchLogs: unknown[];
  processingJobs: unknown[];
};

function platformAdmin(): User {
  return { id: 2, role: "admin", userScope: "platform", clientId: null, authenticated: true };
}

function tenantUser(): User {
  return { id: 10, role: "client", userScope: "tenant", clientId: 1, authenticated: true };
}

function unauthenticatedUser(): User {
  return { id: 0, role: "client", userScope: "tenant", clientId: 1, authenticated: false };
}

function freshState(): HarnessState {
  const assignments = Array.from({ length: 7 }, (_, index) => {
    const id = index + 1;
    return {
      id,
      clientId: 1,
      workspaceId: 1,
      sourceId: id,
      status: "ready" as const,
      enabled: false,
      testStatus: "passed" as const,
      latestTestRunId: id,
      relevanceProfileVersion: 2,
      sourceValidationIdentity: `source-${id}`,
      assignmentConfigIdentity: `assignment-${id}`,
    };
  });
  return {
    clients: [{ id: 1, active: true, lifecycleStatus: "setup" }],
    settings: [{ clientId: 1 }],
    workspaces: [{ id: 1, clientId: 1, active: false, status: "draft" }],
    profiles: [{ workspaceId: 1, profileVersion: 2 }],
    publisherProfilesConfigured: 7,
    sourceChannelsConfigured: 7,
    assignments,
    tests: assignments.map((assignment) => ({
      id: assignment.id,
      assignmentId: assignment.id,
      status: "passed",
      testType: "full",
      relevanceProfileVersion: assignment.relevanceProfileVersion,
      sourceValidationIdentity: assignment.sourceValidationIdentity,
      assignmentConfigIdentity: assignment.assignmentConfigIdentity,
    })),
    sources: assignments.map((assignment) => ({ id: assignment.sourceId, clientId: assignment.clientId, active: false })),
    auditLogs: [],
    articles: [],
    sourceFetchLogs: [],
    processingJobs: [],
  };
}

function appError(code: string, status: number) {
  const error: any = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function assertSystemAdmin(user: User) {
  if (!user.authenticated) throw appError("unauthenticated", 401);
  if (!(user.role === "admin" && user.userScope === "platform" && user.clientId === null)) {
    throw appError("forbidden", 403);
  }
}

function clientIsActive(client: ClientRecord | undefined) {
  return Boolean(client?.active !== false && client.lifecycleStatus === "active");
}

function workspaceIsActive(workspace: WorkspaceRecord | undefined) {
  return Boolean(workspace?.active !== false && workspace.status === "active");
}

function assignmentCurrent(state: HarnessState, assignment: AssignmentRecord) {
  const test = state.tests.find((item) => item.id === assignment.latestTestRunId && item.assignmentId === assignment.id);
  return Boolean(test
    && ["full", "relevance"].includes(test.testType)
    && test.status === "passed"
    && test.relevanceProfileVersion === assignment.relevanceProfileVersion
    && test.sourceValidationIdentity === assignment.sourceValidationIdentity
    && test.assignmentConfigIdentity === assignment.assignmentConfigIdentity);
}

function readiness(state: HarnessState, clientId = 1, workspaceId = 1) {
  const client = state.clients.find((item) => item.id === clientId);
  const workspace = state.workspaces.find((item) => item.id === workspaceId && item.clientId === clientId);
  const profile = workspace ? state.profiles.find((item) => item.workspaceId === workspace.id) : null;
  const assignments = state.assignments.filter((assignment) => assignment.clientId === clientId && assignment.workspaceId === workspaceId && assignment.status !== "archived");
  const readyAssignments = assignments.filter((assignment) =>
    ["ready", "active"].includes(assignment.status)
    && assignment.sourceId
    && assignment.testStatus === "passed"
    && assignmentCurrent(state, assignment)
  );
  const staleAssignments = assignments.filter((assignment) => assignment.testStatus === "stale" || (assignment.latestTestRunId && !assignmentCurrent(state, assignment)));
  const blockedAssignments = assignments.filter((assignment) => ["untested", "failed", "stale"].includes(assignment.testStatus) || (assignment.latestTestRunId && !assignmentCurrent(state, assignment)));
  const technicalBlockers = [
    !(client && state.settings.some((setting) => setting.clientId === clientId)) ? "organization_missing" : null,
    !workspace ? "workspace_missing" : null,
    !profile ? "relevance_profile_missing" : null,
    state.publisherProfilesConfigured === 0 ? "publisher_profiles_missing" : null,
    state.sourceChannelsConfigured === 0 ? "source_channels_missing" : null,
    readyAssignments.length === 0 ? "source_assignments_missing" : null,
    assignments.filter((assignment) => assignment.testStatus === "passed" && assignmentCurrent(state, assignment)).length === 0 ? "source_assignment_tests_missing" : null,
    staleAssignments.length > 0 ? "source_assignment_tests_stale" : null,
    blockedAssignments.length > 0 ? "source_assignment_tests_failed" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const lifecycleBlockers = [
    !clientIsActive(client) ? "client_inactive" : null,
    workspace && !workspaceIsActive(workspace) ? "workspace_inactive" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const technicalReady = technicalBlockers.length === 0;
  const lifecycleReady = clientIsActive(client) && workspaceIsActive(workspace);
  return {
    technicalReady,
    lifecycleReady,
    monitoringReady: technicalReady && lifecycleReady,
    technicalBlockers,
    lifecycleBlockers,
    blockers: [...technicalBlockers, ...lifecycleBlockers],
    clientActivationBlockers: technicalBlockers,
    clientCanActivate: technicalBlockers.length === 0 && !clientIsActive(client),
    workspaceActivationBlockers: [
      ...technicalBlockers,
      ...lifecycleBlockers.filter((blocker) => blocker === "client_inactive"),
    ],
    workspaceCanActivate: technicalBlockers.length === 0 && clientIsActive(client) && Boolean(workspace && !workspaceIsActive(workspace)),
    sourceAssignmentsConfigured: readyAssignments.length,
    sourceAssignmentTestsPassed: assignments.filter((assignment) => assignment.testStatus === "passed" && assignmentCurrent(state, assignment)).length,
    sourceAssignmentTestsStale: staleAssignments.length,
    sourceAssignmentsBlocked: blockedAssignments.length,
  };
}

function recomputeSource(state: HarnessState, sourceId: number) {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;
  source.active = state.assignments.some((assignment) => {
    const client = state.clients.find((item) => item.id === assignment.clientId);
    const workspace = state.workspaces.find((item) => item.id === assignment.workspaceId && item.clientId === assignment.clientId);
    return assignment.sourceId === sourceId
      && assignment.status === "active"
      && assignment.enabled
      && clientIsActive(client)
      && workspaceIsActive(workspace)
      && assignment.testStatus === "passed"
      && assignmentCurrent(state, assignment);
  });
}

function activateClient(state: HarnessState, user: User, clientId = 1) {
  assertSystemAdmin(user);
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) throw appError("client_not_found", 404);
  const snapshot = readiness(state, clientId, 1);
  if (snapshot.clientActivationBlockers.length > 0) throw appError("client_activation_not_ready", 409);
  const previousLifecycleStatus = client.lifecycleStatus;
  client.lifecycleStatus = "active";
  client.active = true;
  state.auditLogs.push({ action: "lifecycle_status_change", entity: "client", entityId: clientId, details: { previousLifecycleStatus, newLifecycleStatus: "active" } });
  return client;
}

function activateWorkspace(state: HarnessState, user: User, clientId = 1, workspaceId = 1) {
  assertSystemAdmin(user);
  const workspace = state.workspaces.find((item) => item.id === workspaceId && item.clientId === clientId);
  if (!workspace) throw appError("workspace_not_found", 404);
  const snapshot = readiness(state, clientId, workspaceId);
  if (snapshot.workspaceActivationBlockers.length > 0) {
    throw appError(snapshot.workspaceActivationBlockers.includes("client_inactive") ? "client_inactive" : "workspace_activation_not_ready", 409);
  }
  const previousStatus = workspace.status;
  workspace.status = "active";
  workspace.active = true;
  state.auditLogs.push({ action: "workspace_change", entity: "workspace", entityId: workspaceId, details: { previousStatus, newStatus: "active" } });
  return workspace;
}

function pauseWorkspace(state: HarnessState, user: User, clientId = 1, workspaceId = 1) {
  assertSystemAdmin(user);
  const workspace = state.workspaces.find((item) => item.id === workspaceId && item.clientId === clientId);
  if (!workspace) throw appError("workspace_not_found", 404);
  const previousStatus = workspace.status;
  workspace.status = "paused";
  workspace.active = false;
  for (const assignment of state.assignments.filter((item) => item.workspaceId === workspaceId && item.clientId === clientId && item.status !== "archived")) {
    assignment.status = assignment.status === "active" ? "paused" : assignment.status;
    assignment.enabled = false;
    recomputeSource(state, assignment.sourceId);
  }
  state.auditLogs.push({ action: "workspace_change", entity: "workspace", entityId: workspaceId, details: { previousStatus, newStatus: "paused" } });
}

function activateAssignment(state: HarnessState, user: User, clientId: number, workspaceId: number, assignmentId: number) {
  assertSystemAdmin(user);
  const client = state.clients.find((item) => item.id === clientId);
  const workspace = state.workspaces.find((item) => item.id === workspaceId && item.clientId === clientId);
  const assignment = state.assignments.find((item) => item.id === assignmentId && item.clientId === clientId && item.workspaceId === workspaceId);
  if (!assignment) throw appError("assignment_not_found", 404);
  if (!clientIsActive(client)) throw appError("client_inactive", 409);
  if (!workspaceIsActive(workspace)) throw appError("workspace_inactive", 409);
  if (assignment.status !== "ready") throw appError("assignment_not_ready", 409);
  if (assignment.testStatus === "stale" || !assignmentCurrent(state, assignment)) throw appError("assignment_test_stale", 409);
  if (assignment.testStatus === "failed") throw appError("assignment_test_failed", 409);
  const previousStatus = assignment.status;
  assignment.status = "active";
  assignment.enabled = true;
  recomputeSource(state, assignment.sourceId);
  state.auditLogs.push({ action: "workspace_source_assignment_activate", entity: "workspace_source_assignment", entityId: assignment.id, details: { previousStatus, newStatus: "active" } });
  return assignment;
}

function pauseAssignment(state: HarnessState, user: User, clientId: number, workspaceId: number, assignmentId: number) {
  assertSystemAdmin(user);
  const assignment = state.assignments.find((item) => item.id === assignmentId && item.clientId === clientId && item.workspaceId === workspaceId);
  if (!assignment) throw appError("assignment_not_found", 404);
  const previousStatus = assignment.status;
  assignment.status = "paused";
  assignment.enabled = false;
  recomputeSource(state, assignment.sourceId);
  state.auditLogs.push({ action: "workspace_source_assignment_paused", entity: "workspace_source_assignment", entityId: assignment.id, details: { previousStatus, newStatus: "paused" } });
}

function schedulerEligible(state: HarnessState, assignmentId: number) {
  const assignment = state.assignments.find((item) => item.id === assignmentId);
  if (!assignment) return false;
  const client = state.clients.find((item) => item.id === assignment.clientId);
  const workspace = state.workspaces.find((item) => item.id === assignment.workspaceId && item.clientId === assignment.clientId);
  const source = state.sources.find((item) => item.id === assignment.sourceId);
  return clientIsActive(client)
    && workspaceIsActive(workspace)
    && assignment.status === "active"
    && assignment.enabled
    && Boolean(source?.active)
    && assignmentCurrent(state, assignment);
}

function assertNoIngestionWrites(state: HarnessState) {
  assert.equal(state.articles.length, 0);
  assert.equal(state.sourceFetchLogs.length, 0);
  assert.equal(state.processingJobs.length, 0);
}

function assertThrowsCode(fn: () => unknown, code: string, status = 409) {
  assert.throws(fn, (error: any) => error?.code === code && error?.status === status);
}

function testSuccessfulTransitionSequence() {
  const state = freshState();
  const initial = readiness(state);
  assert.equal(initial.technicalReady, true);
  assert.equal(initial.lifecycleReady, false);
  assert.equal(initial.monitoringReady, false);
  assert.equal(initial.clientCanActivate, true);
  assert.equal(initial.workspaceCanActivate, false);
  assert.deepEqual(initial.lifecycleBlockers, ["client_inactive", "workspace_inactive"]);

  activateClient(state, platformAdmin());
  const afterClient = readiness(state);
  assert.equal(afterClient.technicalReady, true);
  assert.equal(afterClient.lifecycleReady, false);
  assert.equal(afterClient.monitoringReady, false);
  assert.equal(afterClient.workspaceCanActivate, true);
  assert.equal(state.assignments.every((assignment) => !assignment.enabled), true);
  assert.equal(state.sources.every((source) => !source.active), true);
  assertNoIngestionWrites(state);

  activateWorkspace(state, platformAdmin());
  const afterWorkspace = readiness(state);
  assert.equal(afterWorkspace.technicalReady, true);
  assert.equal(afterWorkspace.lifecycleReady, true);
  assert.equal(afterWorkspace.monitoringReady, true);
  assert.equal(state.assignments.every((assignment) => !assignment.enabled), true);
  assert.equal(state.sources.every((source) => !source.active), true);
  assertNoIngestionWrites(state);

  activateAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.assignments.find((assignment) => assignment.id === 1)?.enabled, true);
  assert.equal(state.sources.find((source) => source.id === 1)?.active, true);
  assert.equal(state.assignments.filter((assignment) => assignment.enabled).length, 1);
  assert.equal(state.sources.filter((source) => source.active).length, 1);
  assert.equal(schedulerEligible(state, 1), true);
  assertNoIngestionWrites(state);

  state.assignments[0].testStatus = "stale";
  pauseAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.assignments[0].enabled, false);
  assert.equal(state.sources[0].active, false);
  assert.equal(schedulerEligible(state, 1), false);
}

function testFailureCases() {
  const missingWorkspace = freshState();
  missingWorkspace.workspaces = [];
  assertThrowsCode(() => activateClient(missingWorkspace, platformAdmin()), "client_activation_not_ready");

  const missingProfile = freshState();
  missingProfile.profiles = [];
  assertThrowsCode(() => activateClient(missingProfile, platformAdmin()), "client_activation_not_ready");

  const stale = freshState();
  stale.assignments[0].testStatus = "stale";
  assertThrowsCode(() => activateClient(stale, platformAdmin()), "client_activation_not_ready");

  const failed = freshState();
  failed.assignments[0].testStatus = "failed";
  assertThrowsCode(() => activateClient(failed, platformAdmin()), "client_activation_not_ready");

  assertThrowsCode(() => activateClient(freshState(), tenantUser()), "forbidden", 403);
  assertThrowsCode(() => activateClient(freshState(), unauthenticatedUser()), "unauthenticated", 401);

  const inactiveClient = freshState();
  assertThrowsCode(() => activateWorkspace(inactiveClient, platformAdmin()), "client_inactive");

  const staleWorkspace = freshState();
  activateClient(staleWorkspace, platformAdmin());
  staleWorkspace.assignments[0].testStatus = "stale";
  assertThrowsCode(() => activateWorkspace(staleWorkspace, platformAdmin()), "workspace_activation_not_ready");

  const inactiveAssignmentClient = freshState();
  assertThrowsCode(() => activateAssignment(inactiveAssignmentClient, platformAdmin(), 1, 1, 1), "client_inactive");

  const inactiveAssignmentWorkspace = freshState();
  activateClient(inactiveAssignmentWorkspace, platformAdmin());
  assertThrowsCode(() => activateAssignment(inactiveAssignmentWorkspace, platformAdmin(), 1, 1, 1), "workspace_inactive");

  const staleAssignment = freshState();
  activateClient(staleAssignment, platformAdmin());
  activateWorkspace(staleAssignment, platformAdmin());
  staleAssignment.assignments[0].testStatus = "stale";
  assertThrowsCode(() => activateAssignment(staleAssignment, platformAdmin(), 1, 1, 1), "assignment_test_stale");

  const wrongTenant = freshState();
  assertThrowsCode(() => activateAssignment(wrongTenant, platformAdmin(), 999, 1, 1), "assignment_not_found", 404);
}

function testAuditBehavior() {
  const state = freshState();
  readiness(state);
  assert.equal(state.auditLogs.length, 0, "readiness GET equivalent creates no audit");
  assertThrowsCode(() => activateWorkspace(state, platformAdmin()), "client_inactive");
  assert.equal(state.auditLogs.length, 0, "failed activation creates no audit");
  assertThrowsCode(() => activateClient(state, tenantUser()), "forbidden", 403);
  assert.equal(state.auditLogs.length, 0, "unauthorized request creates no audit");
  activateClient(state, platformAdmin());
  activateWorkspace(state, platformAdmin());
  activateAssignment(state, platformAdmin(), 1, 1, 1);
  pauseAssignment(state, platformAdmin(), 1, 1, 1);
  assert.deepEqual(state.auditLogs.map((audit) => audit.action), [
    "lifecycle_status_change",
    "workspace_change",
    "workspace_source_assignment_activate",
    "workspace_source_assignment_paused",
  ]);
}

function testRollbackAndSchedulerSafety() {
  const state = freshState();
  activateClient(state, platformAdmin());
  activateWorkspace(state, platformAdmin());
  activateAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(schedulerEligible(state, 1), true);
  state.assignments[0].testStatus = "stale";
  pauseAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.sources[0].active, false, "stale readiness does not block assignment pause");
  activateAssignment(state, platformAdmin(), 1, 1, 2);
  assert.equal(schedulerEligible(state, 2), true);
  pauseWorkspace(state, platformAdmin(), 1, 1);
  assert.equal(state.workspaces[0].active, false);
  assert.equal(state.assignments.every((assignment) => !assignment.enabled), true);
  assert.equal(state.sources.every((source) => !source.active), true);

  const periodic = evaluatePeriodicJobEligibility("INTELLIGENCE_PIPELINE", {
    activeClientCount: 1,
    activeWorkspaceCount: 0,
    activeArticleCount: 0,
    activeSourceCount: 0,
    dueBriefingCount: 0,
    retentionCandidateCount: 0,
  });
  assert.equal(periodic.eligible, false);
  assert.equal(periodic.reason, "no_eligible_monitoring_scope");

  const inactiveWorkspace = freshState();
  activateClient(inactiveWorkspace, platformAdmin());
  assert.equal(schedulerEligible(inactiveWorkspace, 1), false, "client active with inactive workspace is not scheduler eligible");
  const disabledAssignment = freshState();
  activateClient(disabledAssignment, platformAdmin());
  activateWorkspace(disabledAssignment, platformAdmin());
  assert.equal(schedulerEligible(disabledAssignment, 1), false, "active client/workspace with disabled assignment is not scheduler eligible");
  const inactiveClient = freshState();
  inactiveClient.workspaces[0].active = true;
  inactiveClient.workspaces[0].status = "active";
  assert.equal(schedulerEligible(inactiveClient, 1), false, "inactive client with active workspace is not scheduler eligible");
  const staleEnabled = freshState();
  activateClient(staleEnabled, platformAdmin());
  activateWorkspace(staleEnabled, platformAdmin());
  activateAssignment(staleEnabled, platformAdmin(), 1, 1, 1);
  staleEnabled.assignments[0].testStatus = "stale";
  recomputeSource(staleEnabled, 1);
  assert.equal(schedulerEligible(staleEnabled, 1), false, "stale enabled assignment is not scheduler eligible");
}

function testStaticGuards() {
  const storage = readFileSync("server/storage.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");
  const clientSetup = readFileSync("client/src/pages/ClientSetup.tsx", "utf8");
  assert.match(routes, /technicalReady/);
  assert.match(routes, /lifecycleReady/);
  assert.match(routes, /clientActivationBlockers/);
  assert.match(routes, /workspaceActivationBlockers/);
  assert.match(storage, /client_activation_not_ready/);
  assert.match(storage, /workspace_activation_not_ready/);
  assert.match(storage, /recomputeOperationalSourceActiveState/);
  assert.match(clientSetup, /Activate Client/);
  assert.match(clientSetup, /Activate Workspace/);
  assert.match(clientSetup, /Technical blockers/);
  assert.doesNotMatch(storage, /requestedStatus === "active" && !readiness\.monitoringReady/);
  assert.doesNotMatch(storage, /status\) \{\s*case "active":\s*if \(!readiness\.monitoringReady\)/s);
}

testSuccessfulTransitionSequence();
testFailureCases();
testAuditBehavior();
testRollbackAndSchedulerSafety();
testStaticGuards();

console.log("lifecycle activation readiness tests passed");
