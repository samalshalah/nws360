import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePeriodicJobEligibility } from "../server/periodic-job-rules";

type User = { id: number; role: "admin" | "client"; userScope: "platform" | "tenant"; clientId: number | null; authenticated: boolean };
type ClientRecord = { id: number; active: boolean; lifecycleStatus: "setup" | "active" | "suspended" | "archived" };
type WorkspaceRecord = {
  id: number;
  clientId: number;
  active: boolean;
  status: "draft" | "active" | "paused" | "archived";
  activatedAt?: string | null;
  activatedBy?: number | null;
};
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
  testType: "full" | "relevance" | "connectivity";
  relevanceProfileVersion: number;
  sourceValidationIdentity: string;
  assignmentConfigIdentity: string;
};
type SourceRecord = { id: number; clientId: number; active: boolean };

type HarnessState = {
  clients: ClientRecord[];
  settings: Array<{ clientId: number }>;
  workspaces: WorkspaceRecord[];
  profiles: Array<{ workspaceId: number; clientId: number; profileVersion: number }>;
  publisherProfilesConfigured: number;
  sourceChannelsConfigured: number;
  assignments: AssignmentRecord[];
  tests: TestRunRecord[];
  sources: SourceRecord[];
  auditLogs: Array<{ action: string; entity: string; entityId: number; details: Record<string, unknown> }>;
  articles: unknown[];
  articleAppearances: unknown[];
  sourceFetchLogs: unknown[];
  processingJobs: unknown[];
  reports: unknown[];
  alerts: unknown[];
  notifications: unknown[];
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
    workspaces: [{ id: 1, clientId: 1, active: false, status: "draft", activatedAt: null, activatedBy: null }],
    profiles: [{ workspaceId: 1, clientId: 1, profileVersion: 2 }],
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
    articleAppearances: [],
    sourceFetchLogs: [],
    processingJobs: [],
    reports: [],
    alerts: [],
    notifications: [],
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
  return Boolean(client && client.active !== false && client.lifecycleStatus === "active");
}

function workspaceIsActive(workspace: WorkspaceRecord | undefined) {
  return Boolean(workspace && workspace.active !== false && workspace.status === "active");
}

function workspaceLifecycleFieldsConsistent(workspace: WorkspaceRecord, status: WorkspaceRecord["status"]) {
  if (workspace.active !== (status === "active")) return false;
  if (status === "draft") return workspace.activatedAt == null && workspace.activatedBy == null;
  return true;
}

function latestTest(state: HarnessState, assignment: AssignmentRecord) {
  return state.tests.find((item) => item.id === assignment.latestTestRunId && item.assignmentId === assignment.id) || null;
}

function assignmentCurrent(state: HarnessState, assignment: AssignmentRecord, profileVersion = assignment.relevanceProfileVersion) {
  const test = latestTest(state, assignment);
  return Boolean(test
    && test.sourceValidationIdentity === assignment.sourceValidationIdentity
    && test.assignmentConfigIdentity === assignment.assignmentConfigIdentity
    && test.relevanceProfileVersion === profileVersion
    && assignment.relevanceProfileVersion === profileVersion);
}

function assignmentHasApprovedWarning(assignment: AssignmentRecord) {
  return Boolean(assignment.warningApprovedAt && assignment.warningApprovalReason);
}

function assignmentHasPassingResult(assignment: AssignmentRecord) {
  return assignment.testStatus === "passed" || (assignment.testStatus === "warning" && assignmentHasApprovedWarning(assignment));
}

function assignmentCanDriveSource(state: HarnessState, assignment: AssignmentRecord, profileVersion = assignment.relevanceProfileVersion) {
  const test = latestTest(state, assignment);
  return Boolean(test
    && ["full", "relevance"].includes(test.testType)
    && ["passed", "warning"].includes(test.status)
    && (test.status !== "warning" || assignmentHasApprovedWarning(assignment))
    && assignmentHasPassingResult(assignment)
    && assignmentCurrent(state, assignment, profileVersion));
}

function summarizeWorkspaceAssignments(state: HarnessState, assignments: AssignmentRecord[], profileVersion: number) {
  const activeAssignments = assignments.filter((assignment) => assignment.status !== "archived");
  const currentAssignments = activeAssignments.filter((assignment) => assignmentCurrent(state, assignment, profileVersion));
  const sourceAssignmentsConfigured = currentAssignments.filter((assignment) => (
    ["ready", "active"].includes(assignment.status)
    && Boolean(assignment.sourceId)
    && assignmentHasPassingResult(assignment)
  )).length;
  const sourceAssignmentTestsPassed = currentAssignments.filter((assignment) => (
    assignment.testStatus === "passed" || assignment.testStatus === "warning"
  )).length;
  const sourceAssignmentTestsStale = activeAssignments.filter((assignment) => (
    assignment.testStatus === "stale" || (assignment.latestTestRunId && !assignmentCurrent(state, assignment, profileVersion))
  )).length;
  const sourceAssignmentsBlocked = activeAssignments.filter((assignment) => (
    ["untested", "failed", "stale"].includes(assignment.testStatus)
    || (assignment.latestTestRunId && !assignmentCurrent(state, assignment, profileVersion))
    || (assignment.testStatus === "warning" && !assignmentHasApprovedWarning(assignment))
  )).length;
  return {
    sourceAssignmentsConfigured,
    sourceAssignmentTestsPassed,
    sourceAssignmentTestsStale,
    sourceAssignmentsBlocked,
  };
}

function buildTechnicalBlockers(input: {
  organizationConfigured: boolean;
  workspaceCount: number;
  relevanceProfilesConfigured: number;
  publisherProfilesConfigured: number;
  sourceChannelsConfigured: number;
  sourceAssignmentsConfigured: number;
  sourceAssignmentTestsPassed: number;
  sourceAssignmentTestsStale: number;
  sourceAssignmentsBlocked: number;
}) {
  return [
    !input.organizationConfigured ? "organization_missing" : null,
    input.workspaceCount === 0 ? "workspace_missing" : null,
    input.relevanceProfilesConfigured === 0 ? "relevance_profile_missing" : null,
    input.publisherProfilesConfigured === 0 ? "publisher_profiles_missing" : null,
    input.sourceChannelsConfigured === 0 ? "source_channels_missing" : null,
    input.sourceAssignmentsConfigured === 0 ? "source_assignments_missing" : null,
    input.sourceAssignmentTestsPassed === 0 ? "source_assignment_tests_missing" : null,
    input.sourceAssignmentTestsStale > 0 ? "source_assignment_tests_stale" : null,
    input.sourceAssignmentsBlocked > 0 ? "source_assignment_tests_failed" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
}

function unique(items: string[]) {
  return Array.from(new Set(items));
}

function workspaceReadiness(state: HarnessState, clientId = 1, workspaceId = 1) {
  const client = state.clients.find((item) => item.id === clientId);
  const workspaceRow = state.workspaces.find((item) => item.id === workspaceId);
  const workspace = workspaceRow?.clientId === clientId ? workspaceRow : undefined;
  const profile = workspace ? state.profiles.find((item) => item.workspaceId === workspace.id && item.clientId === clientId) : null;
  const profileVersion = profile?.profileVersion || 1;
  const assignments = state.assignments.filter((assignment) => (
    assignment.clientId === clientId
    && assignment.workspaceId === workspaceId
    && assignment.status !== "archived"
  ));
  const assignmentCounts = summarizeWorkspaceAssignments(state, assignments, profileVersion);
  const technicalBlockers = buildTechnicalBlockers({
    organizationConfigured: Boolean(client && state.settings.some((setting) => setting.clientId === clientId)),
    workspaceCount: workspace ? 1 : 0,
    relevanceProfilesConfigured: profile ? 1 : 0,
    publisherProfilesConfigured: state.publisherProfilesConfigured,
    sourceChannelsConfigured: state.sourceChannelsConfigured,
    ...assignmentCounts,
  });
  const lifecycleBlockers = [
    !clientIsActive(client) ? "client_inactive" : null,
    workspace && !workspaceIsActive(workspace) ? "workspace_inactive" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const workspaceActivationBlockers = [
    ...technicalBlockers,
    ...lifecycleBlockers.filter((blocker) => blocker === "client_inactive"),
  ];
  return {
    organizationConfigured: Boolean(client && state.settings.some((setting) => setting.clientId === clientId)),
    workspaceCount: workspace ? 1 : 0,
    activeWorkspaceCount: workspaceIsActive(workspace) ? 1 : 0,
    relevanceProfilesConfigured: profile ? 1 : 0,
    publisherProfilesConfigured: state.publisherProfilesConfigured,
    sourceChannelsConfigured: state.sourceChannelsConfigured,
    ...assignmentCounts,
    technicalReady: technicalBlockers.length === 0,
    lifecycleReady: clientIsActive(client) && workspaceIsActive(workspace),
    monitoringReady: technicalBlockers.length === 0 && clientIsActive(client) && workspaceIsActive(workspace),
    technicalBlockers,
    lifecycleBlockers,
    clientActivationReady: false,
    clientActivationBlockers: ["workspace_lifecycle_endpoint_required"],
    canActivateClient: false,
    workspaceActivationReady: workspaceActivationBlockers.length === 0,
    workspaceActivationBlockers,
    canActivateWorkspace: workspaceActivationBlockers.length === 0 && Boolean(workspace && !workspaceIsActive(workspace)),
    blockers: [...technicalBlockers, ...lifecycleBlockers],
  };
}

function clientReadiness(state: HarnessState, clientId = 1) {
  const client = state.clients.find((item) => item.id === clientId);
  const workspaces = state.workspaces.filter((item) => item.clientId === clientId);
  const workspaceSnapshots = workspaces.map((workspace) => workspaceReadiness(state, clientId, workspace.id));
  const technicallyReadyWorkspaceCount = workspaceSnapshots.filter((snapshot) => snapshot.technicalReady).length;
  const organizationConfigured = Boolean(client && state.settings.some((setting) => setting.clientId === clientId));
  const activeWorkspaceCount = workspaces.filter((workspace) => workspaceIsActive(workspace)).length;
  const baseTechnicalBlockers = [
    !organizationConfigured ? "organization_missing" : null,
    workspaces.length === 0 ? "workspace_missing" : null,
    state.publisherProfilesConfigured === 0 ? "publisher_profiles_missing" : null,
    state.sourceChannelsConfigured === 0 ? "source_channels_missing" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const workspaceTechnicalBlockers = workspaces.length > 0 && technicallyReadyWorkspaceCount === 0
    ? unique(workspaceSnapshots.flatMap((snapshot) => snapshot.technicalBlockers))
      .filter((blocker) => !baseTechnicalBlockers.includes(blocker) && blocker !== "organization_missing" && blocker !== "workspace_missing")
    : [];
  const technicalBlockers = unique([
    ...baseTechnicalBlockers,
    ...workspaceTechnicalBlockers,
    ...(workspaces.length > 0 && technicallyReadyWorkspaceCount === 0 && workspaceTechnicalBlockers.length === 0
      ? ["workspace_activation_not_ready"]
      : []),
  ]);
  const lifecycleBlockers = [
    !clientIsActive(client) ? "client_inactive" : null,
    workspaces.length > 0 && activeWorkspaceCount === 0 ? "workspace_inactive" : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const technicalReady = technicalBlockers.length === 0;
  const lifecycleReady = clientIsActive(client) && (workspaces.length === 0 || activeWorkspaceCount > 0);
  return {
    organizationConfigured,
    workspaceCount: workspaces.length,
    activeWorkspaceCount,
    relevanceProfilesConfigured: state.profiles.filter((profile) => workspaces.some((workspace) => workspace.id === profile.workspaceId)).length,
    publisherProfilesConfigured: state.publisherProfilesConfigured,
    sourceChannelsConfigured: state.sourceChannelsConfigured,
    technicallyReadyWorkspaceCount,
    clientActivationPolicy: "at_least_one_technically_ready_workspace",
    technicalReady,
    lifecycleReady,
    monitoringReady: technicalReady && lifecycleReady,
    technicalBlockers,
    lifecycleBlockers,
    clientActivationReady: technicalReady,
    clientActivationBlockers: technicalBlockers,
    canActivateClient: technicalReady && !clientIsActive(client),
    workspaceActivationBlockers: [],
    blockers: [...technicalBlockers, ...lifecycleBlockers],
  };
}

function setupPayload(state: HarnessState, clientId = 1) {
  const readiness = clientReadiness(state, clientId);
  const workspaces = state.workspaces
    .filter((workspace) => workspace.clientId === clientId)
    .map((workspace) => ({ ...workspace, activationEligibility: workspaceReadiness(state, clientId, workspace.id) }));
  return { readiness, workspaces };
}

function recomputeSource(state: HarnessState, sourceId: number) {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;
  source.active = state.assignments.some((assignment) => {
    const client = state.clients.find((item) => item.id === assignment.clientId);
    const workspace = state.workspaces.find((item) => item.id === assignment.workspaceId && item.clientId === assignment.clientId);
    const profile = state.profiles.find((item) => item.workspaceId === assignment.workspaceId && item.clientId === assignment.clientId);
    return assignment.sourceId === sourceId
      && assignment.status === "active"
      && assignment.enabled
      && clientIsActive(client)
      && workspaceIsActive(workspace)
      && assignmentCanDriveSource(state, assignment, profile?.profileVersion || assignment.relevanceProfileVersion);
  });
}

function assertAssignmentCanActivate(state: HarnessState, assignment: AssignmentRecord) {
  const profile = state.profiles.find((item) => item.workspaceId === assignment.workspaceId && item.clientId === assignment.clientId);
  const profileVersion = profile?.profileVersion || assignment.relevanceProfileVersion;
  if (!assignmentHasPassingResult(assignment) || !assignment.latestTestRunId) {
    throw appError(assignment.testStatus === "stale" ? "source_assignment_tests_stale" : "source_assignment_tests_missing", 409);
  }
  const test = latestTest(state, assignment);
  if (!test || !["relevance", "full"].includes(test.testType)) {
    throw appError("source_assignment_relevance_test_required", 409);
  }
  if (!["passed", "warning"].includes(test.status)) {
    throw appError("source_assignment_tests_missing", 409);
  }
  if (!assignmentCurrent(state, assignment, profileVersion)) {
    throw appError("source_assignment_tests_stale", 409);
  }
}

function activateClient(state: HarnessState, user: User, clientId = 1) {
  assertSystemAdmin(user);
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) throw appError("client_not_found", 404);
  const snapshot = clientReadiness(state, clientId);
  if (client.lifecycleStatus === "active" && client.active === true) return client;
  if (snapshot.clientActivationBlockers.length > 0) throw appError("client_activation_not_ready", 409);
  const previousLifecycleStatus = client.lifecycleStatus;
  client.lifecycleStatus = "active";
  client.active = true;
  state.auditLogs.push({ action: "lifecycle_status_change", entity: "client", entityId: clientId, details: { previousLifecycleStatus, newLifecycleStatus: "active" } });
  return client;
}

function pauseClient(state: HarnessState, user: User, clientId = 1) {
  assertSystemAdmin(user);
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) throw appError("client_not_found", 404);
  if (client.lifecycleStatus === "suspended" && client.active === false) return client;
  const previousLifecycleStatus = client.lifecycleStatus;
  client.lifecycleStatus = "suspended";
  client.active = false;
  for (const workspace of state.workspaces.filter((item) => item.clientId === clientId)) {
    if (workspace.status === "active") workspace.status = "paused";
    workspace.active = false;
  }
  for (const assignment of state.assignments.filter((item) => item.clientId === clientId && item.status !== "archived")) {
    if (assignment.status === "active") assignment.status = "paused";
    assignment.enabled = false;
    recomputeSource(state, assignment.sourceId);
  }
  state.auditLogs.push({ action: "lifecycle_status_change", entity: "client", entityId: clientId, details: { previousLifecycleStatus, newLifecycleStatus: "suspended" } });
  return client;
}

function activateWorkspace(state: HarnessState, user: User, clientId = 1, workspaceId = 1) {
  assertSystemAdmin(user);
  const workspace = state.workspaces.find((item) => item.id === workspaceId && item.clientId === clientId);
  if (!workspace) throw appError("workspace_not_found", 404);
  if (workspace.status === "active" && workspaceLifecycleFieldsConsistent(workspace, "active")) return workspace;
  const snapshot = workspaceReadiness(state, clientId, workspaceId);
  if (snapshot.workspaceActivationBlockers.length > 0) {
    throw appError(snapshot.workspaceActivationBlockers.includes("client_inactive") ? "client_inactive" : "workspace_activation_not_ready", 409);
  }
  const previousStatus = workspace.status;
  workspace.status = "active";
  workspace.active = true;
  workspace.activatedAt = "2026-08-03T00:00:00.000Z";
  workspace.activatedBy = user.id;
  state.auditLogs.push({ action: "workspace_change", entity: "workspace", entityId: workspaceId, details: { previousStatus, newStatus: "active" } });
  return workspace;
}

function pauseWorkspace(state: HarnessState, user: User, clientId = 1, workspaceId = 1) {
  assertSystemAdmin(user);
  const workspace = state.workspaces.find((item) => item.id === workspaceId && item.clientId === clientId);
  if (!workspace) throw appError("workspace_not_found", 404);
  if (workspace.status === "paused" && workspace.active === false) return workspace;
  const previousStatus = workspace.status;
  workspace.status = "paused";
  workspace.active = false;
  for (const assignment of state.assignments.filter((item) => item.workspaceId === workspaceId && item.clientId === clientId && item.status !== "archived")) {
    if (assignment.status === "active") assignment.status = "paused";
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
  if (assignment.status === "active" && assignment.enabled === true) {
    assertAssignmentCanActivate(state, assignment);
    return assignment;
  }
  if (assignment.status !== "ready") throw appError("assignment_not_ready", 409);
  assertAssignmentCanActivate(state, assignment);
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
  if (assignment.status === "paused" && assignment.enabled === false) return assignment;
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
  const profile = state.profiles.find((item) => item.workspaceId === assignment.workspaceId && item.clientId === assignment.clientId);
  return clientIsActive(client)
    && workspaceIsActive(workspace)
    && assignment.status === "active"
    && assignment.enabled
    && Boolean(source?.active)
    && assignmentCanDriveSource(state, assignment, profile?.profileVersion || assignment.relevanceProfileVersion);
}

function assertNoIngestionWrites(state: HarnessState) {
  assert.equal(state.articles.length, 0, "no articles are inserted by lifecycle actions");
  assert.equal(state.articleAppearances.length, 0, "no cross-platform appearances are inserted by lifecycle actions");
  assert.equal(state.sourceFetchLogs.length, 0, "no source fetch logs are inserted by lifecycle actions");
  assert.equal(state.processingJobs.length, 0, "no processing jobs are inserted by lifecycle actions");
  assert.equal(state.reports.length, 0, "no reports are inserted by lifecycle actions");
  assert.equal(state.alerts.length, 0, "no alerts are inserted by lifecycle actions");
  assert.equal(state.notifications.length, 0, "no notifications are inserted by lifecycle actions");
}

function assertThrowsCode(fn: () => unknown, code: string, status = 409) {
  assert.throws(fn, (error: any) => error?.code === code && error?.status === status);
}

function testSuccessfulTransitionSequence() {
  const state = freshState();
  const initialClient = clientReadiness(state);
  const initialWorkspace = workspaceReadiness(state);
  assert.equal(initialClient.technicalReady, true);
  assert.equal(initialClient.lifecycleReady, false);
  assert.equal(initialClient.monitoringReady, false);
  assert.equal(initialClient.clientActivationReady, true);
  assert.equal(initialClient.clientActivationPolicy, "at_least_one_technically_ready_workspace");
  assert.equal(initialClient.technicallyReadyWorkspaceCount, 1);
  assert.equal(initialWorkspace.workspaceActivationReady, false);
  assert.equal(initialWorkspace.canActivateWorkspace, false);
  assert.deepEqual(initialWorkspace.lifecycleBlockers, ["client_inactive", "workspace_inactive"]);

  activateClient(state, platformAdmin());
  const afterClient = workspaceReadiness(state);
  assert.equal(afterClient.technicalReady, true);
  assert.equal(afterClient.lifecycleReady, false);
  assert.equal(afterClient.monitoringReady, false);
  assert.equal(afterClient.workspaceActivationReady, true);
  assert.equal(afterClient.canActivateWorkspace, true);
  assert.equal(state.assignments.every((assignment) => !assignment.enabled), true);
  assert.equal(state.sources.every((source) => !source.active), true);
  assertNoIngestionWrites(state);

  activateWorkspace(state, platformAdmin());
  const afterWorkspace = workspaceReadiness(state);
  assert.equal(afterWorkspace.technicalReady, true);
  assert.equal(afterWorkspace.lifecycleReady, true);
  assert.equal(afterWorkspace.monitoringReady, true);
  assert.equal(afterWorkspace.workspaceActivationReady, true);
  assert.equal(afterWorkspace.canActivateWorkspace, false);
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
  recomputeSource(state, 1);
  assert.equal(schedulerEligible(state, 1), false);
  pauseAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.assignments[0].enabled, false);
  assert.equal(state.sources[0].active, false);
  assert.equal(schedulerEligible(state, 1), false);
  assertNoIngestionWrites(state);
}

function testWorkspaceSpecificEligibility() {
  const state = freshState();
  state.workspaces.push({ id: 2, clientId: 1, active: false, status: "draft", activatedAt: null, activatedBy: null });
  state.clients.push({ id: 2, active: true, lifecycleStatus: "active" });
  state.settings.push({ clientId: 2 });
  state.workspaces.push({ id: 3, clientId: 2, active: true, status: "active" });
  state.profiles.push({ workspaceId: 3, clientId: 2, profileVersion: 1 });

  const setup = setupPayload(state);
  assert.equal(setup.readiness.technicalReady, true);
  assert.equal(setup.readiness.clientActivationReady, true);
  assert.equal(setup.readiness.technicallyReadyWorkspaceCount, 1);
  assert.equal(setup.workspaces.length, 2);
  assert.equal(setup.workspaces[0].activationEligibility.technicalReady, true);
  assert.equal(setup.workspaces[1].activationEligibility.technicalReady, false);
  assert.deepEqual(setup.workspaces[1].activationEligibility.technicalBlockers, [
    "relevance_profile_missing",
    "source_assignments_missing",
    "source_assignment_tests_missing",
  ]);
  assert.equal(workspaceReadiness(state, 1, 3).workspaceCount, 0, "workspace id from another client is not counted");
  assert.ok(workspaceReadiness(state, 1, 3).technicalBlockers.includes("workspace_missing"));

  activateClient(state, platformAdmin());
  assert.equal(state.clients[0].lifecycleStatus, "active");
  assert.equal(workspaceReadiness(state, 1, 1).canActivateWorkspace, true);
  assert.equal(workspaceReadiness(state, 1, 2).canActivateWorkspace, false);
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

  const warningNeedsApproval = freshState();
  warningNeedsApproval.assignments[0].testStatus = "warning";
  warningNeedsApproval.tests[0].status = "warning";
  assertThrowsCode(() => activateClient(warningNeedsApproval, platformAdmin()), "client_activation_not_ready");
  warningNeedsApproval.assignments[0].warningApprovedAt = "2026-08-03T00:00:00.000Z";
  warningNeedsApproval.assignments[0].warningApprovalReason = "Accepted noise threshold for pilot";
  assert.equal(clientReadiness(warningNeedsApproval).clientActivationReady, true);

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
  assertThrowsCode(() => activateAssignment(staleAssignment, platformAdmin(), 1, 1, 1), "source_assignment_tests_stale");

  const connectivityOnly = freshState();
  activateClient(connectivityOnly, platformAdmin());
  activateWorkspace(connectivityOnly, platformAdmin());
  connectivityOnly.tests[0].testType = "connectivity";
  assertThrowsCode(() => activateAssignment(connectivityOnly, platformAdmin(), 1, 1, 1), "source_assignment_relevance_test_required");

  const wrongTenant = freshState();
  assertThrowsCode(() => activateAssignment(wrongTenant, platformAdmin(), 999, 1, 1), "assignment_not_found", 404);
  assertThrowsCode(() => activateWorkspace(wrongTenant, platformAdmin(), 1, 999), "workspace_not_found", 404);
}

function testRepeatRequestsAreNoOps() {
  const state = freshState();
  activateClient(state, platformAdmin());
  assert.equal(state.auditLogs.length, 1);
  activateClient(state, platformAdmin());
  assert.equal(state.auditLogs.length, 1, "repeated client activation creates no duplicate audit");

  activateWorkspace(state, platformAdmin());
  assert.equal(state.auditLogs.length, 2);
  activateWorkspace(state, platformAdmin());
  assert.equal(state.auditLogs.length, 2, "repeated workspace activation creates no duplicate audit");

  activateAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.auditLogs.length, 3);
  activateAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.auditLogs.length, 3, "repeated assignment activation creates no duplicate audit");

  pauseAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.auditLogs.length, 4);
  pauseAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.auditLogs.length, 4, "repeated assignment pause creates no duplicate audit");

  pauseWorkspace(state, platformAdmin(), 1, 1);
  assert.equal(state.auditLogs.length, 5);
  pauseWorkspace(state, platformAdmin(), 1, 1);
  assert.equal(state.auditLogs.length, 5, "repeated workspace pause creates no duplicate audit");

  pauseClient(state, platformAdmin());
  assert.equal(state.auditLogs.length, 6);
  pauseClient(state, platformAdmin());
  assert.equal(state.auditLogs.length, 6, "repeated client pause creates no duplicate audit");
  assertNoIngestionWrites(state);
}

function testAuditBehavior() {
  const state = freshState();
  clientReadiness(state);
  workspaceReadiness(state);
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
  recomputeSource(state, 1);
  assert.equal(schedulerEligible(state, 1), false);
  pauseAssignment(state, platformAdmin(), 1, 1, 1);
  assert.equal(state.sources[0].active, false, "stale readiness does not block assignment pause");
  activateAssignment(state, platformAdmin(), 1, 1, 2);
  assert.equal(schedulerEligible(state, 2), true);
  pauseWorkspace(state, platformAdmin(), 1, 1);
  assert.equal(state.workspaces[0].active, false);
  assert.equal(state.assignments.every((assignment) => !assignment.enabled), true);
  assert.equal(state.sources.every((source) => !source.active), true);
  pauseClient(state, platformAdmin(), 1);
  assert.equal(state.clients[0].active, false);
  assert.equal(state.clients[0].lifecycleStatus, "suspended");
  assert.equal(state.sources.every((source) => !source.active), true);
  assertNoIngestionWrites(state);

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
  assert.match(routes, /clientActivationPolicy/);
  assert.match(routes, /at_least_one_technically_ready_workspace/);
  assert.match(routes, /technicallyReadyWorkspaceCount/);
  assert.match(routes, /workspaceRow\?\.clientId === clientId/);
  assert.match(storage, /client_activation_not_ready/);
  assert.match(storage, /workspace_activation_not_ready/);
  assert.match(storage, /recomputeOperationalSourceActiveState/);
  assert.match(storage, /clientActiveForLifecycleStatus/);
  assert.match(storage, /workspaceLifecycleFieldsConsistent/);
  assert.match(storage, /auditLog: null/);
  assert.match(storage, /requestedEnabled/);
  assert.match(clientSetup, /usePermissions/);
  assert.match(clientSetup, /canManageLifecycle/);
  assert.match(clientSetup, /Activate Client/);
  assert.match(clientSetup, /Activate Workspace/);
  assert.match(clientSetup, /Technical blockers/);
  assert.match(clientSetup, /source-summaries/);
  assert.match(clientSetup, /source-assignments/);
  assert.doesNotMatch(storage, /requestedStatus === "active" && !readiness\.monitoringReady/);
  assert.doesNotMatch(storage, /status\) \{\s*case "active":\s*if \(!readiness\.monitoringReady\)/s);
}

testSuccessfulTransitionSequence();
testWorkspaceSpecificEligibility();
testFailureCases();
testRepeatRequestsAreNoOps();
testAuditBehavior();
testRollbackAndSchedulerSafety();
testStaticGuards();

console.log("lifecycle activation readiness tests passed");
