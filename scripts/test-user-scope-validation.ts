import assert from "node:assert";
import { normalizeUserScopeClientAssignment } from "../shared/user-scope";

function testPlatformAdminWithNullClientIsValid() {
  const result = normalizeUserScopeClientAssignment(
    { userScope: "platform", clientId: null },
    { mode: "create" },
  );
  assert.deepStrictEqual(result, { userScope: "platform", clientId: null });
}

function testTenantUserWithClientIsValid() {
  const result = normalizeUserScopeClientAssignment(
    { userScope: "tenant", clientId: 44 },
    { mode: "create" },
  );
  assert.deepStrictEqual(result, { userScope: "tenant", clientId: 44 });
}

function testTenantUserWithoutClientIsRejected() {
  assert.throws(
    () => normalizeUserScopeClientAssignment({ userScope: "tenant", clientId: null }, { mode: "create" }),
    /Tenant users require a valid clientId/,
  );
}

function testPlatformCreateWithClientIsRejected() {
  assert.throws(
    () => normalizeUserScopeClientAssignment({ userScope: "platform", clientId: 44 }, { mode: "create" }),
    /Platform users cannot be assigned to a tenant client/,
  );
}

function testTenantToPlatformClearsClient() {
  const result = normalizeUserScopeClientAssignment(
    { userScope: "platform" },
    { mode: "update", existing: { userScope: "tenant", clientId: 44 } },
  );
  assert.deepStrictEqual(result, { userScope: "platform", clientId: null });
}

function testPlatformToTenantRequiresClient() {
  assert.throws(
    () => normalizeUserScopeClientAssignment(
      { userScope: "tenant" },
      { mode: "update", existing: { userScope: "platform", clientId: null } },
    ),
    /Tenant users require a valid clientId/,
  );
  const result = normalizeUserScopeClientAssignment(
    { userScope: "tenant", clientId: 44 },
    { mode: "update", existing: { userScope: "platform", clientId: null } },
  );
  assert.deepStrictEqual(result, { userScope: "tenant", clientId: 44 });
}

function testTenantIsolationKeepsTenantClient() {
  const result = normalizeUserScopeClientAssignment(
    { clientId: 45 },
    { mode: "update", existing: { userScope: "tenant", clientId: 44 } },
  );
  assert.deepStrictEqual(result, { userScope: "tenant", clientId: 45 });
}

testPlatformAdminWithNullClientIsValid();
testTenantUserWithClientIsValid();
testTenantUserWithoutClientIsRejected();
testPlatformCreateWithClientIsRejected();
testTenantToPlatformClearsClient();
testPlatformToTenantRequiresClient();
testTenantIsolationKeepsTenantClient();

console.log("PASS user scope/client validation: platform null client, tenant required client, platform client rejection, tenant/platform transitions, tenant isolation");
