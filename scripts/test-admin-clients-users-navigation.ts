import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const app = read("client/src/App.tsx");
const nav = read("client/src/lib/nav-config.ts");
const universalShell = read("client/src/components/layout/UniversalShell.tsx");
const adminClients = read("client/src/pages/AdminClients.tsx");
const userManagement = read("client/src/pages/UserManagement.tsx");
const routes = read("server/routes.ts");
const tenantNav = nav.slice(
  nav.indexOf("export function buildTenantNavTree"),
  nav.indexOf("export function buildPlatformAdminNavTree"),
);

function assertIncludes(source: string, needle: string, message: string) {
  assert.ok(source.includes(needle), message);
}

// Platform-admin navigation contains the required IA entries.
assertIncludes(nav, 'label: t("nav.adminDashboard", "Overview")', "Admin navigation should label /admin as Overview");
assertIncludes(nav, 'key: "clients"', "Admin navigation should include Clients");
assertIncludes(nav, 'href: "/admin/clients"', "Clients navigation should link to /admin/clients");
assertIncludes(nav, 'key: "adminUsers"', "Admin navigation should include Users & Access");
assertIncludes(nav, 'href: "/admin/users"', "Users & Access navigation should link to /admin/users");
assertIncludes(nav, 'href: "/admin/clients/new"', "Enroll Client navigation should link to /admin/clients/new");

// Tenant navigation remains separate and does not get platform-admin links.
assertIncludes(nav, 'label: t("nav.userManagement", "Team")', "Tenant navigation should keep Team label");
assert.ok(!tenantNav.includes('href: "/admin/clients"'), "Tenant navigation must not include /admin/clients");
assert.ok(!tenantNav.includes('href: "/admin/users"'), "Tenant navigation must not include /admin/users");

// Route guards and app routes exist for platform admin only.
assertIncludes(nav, '{ path: "/admin/clients", caps: [CAPS.ADMIN_SYSTEM_DASHBOARD], adminOnly: true }', "/admin/clients should be platform-admin only");
assertIncludes(nav, '{ path: "/admin/users", caps: [CAPS.ADMIN_SYSTEM_DASHBOARD], adminOnly: true }', "/admin/users should be platform-admin only");
assertIncludes(app, 'import AdminClients from "@/pages/AdminClients";', "AdminClients route component should be imported");
assertIncludes(app, '<Route path="/admin/clients">', "/admin/clients route should exist");
assertIncludes(app, '<Route path="/admin/users">', "/admin/users route should exist");
assertIncludes(universalShell, 'if (!isAdmin) return buildClientNavTree(t);', "Tenant users should keep client-only navigation");
assertIncludes(universalShell, 'const adminNav = buildAdminNavTree(t);', "Platform admins should always build the admin navigation tree");
assertIncludes(universalShell, 'capabilities?.tenantId ? [...adminNav, ...buildClientNavTree(t)] : adminNav', "Platform admin links should remain visible when a tenant is selected");
assert.ok(!universalShell.includes('isPlatformContext ? buildAdminNavTree(t) : buildClientNavTree(t)'), "Tenant selection must not hide platform-admin navigation");

// Clients page builds links from returned IDs, not hard-coded production IDs.
assertIncludes(adminClients, 'openClient: `/admin/clients/${client.id}/setup`', "Open Client link should be generated from client.id");
assertIncludes(adminClients, 'manageUsers: `/admin/users?clientId=${client.id}`', "Manage Users link should be generated from client.id");
assertIncludes(adminClients, '`/admin/clients/${client.id}/workspaces/${primaryWorkspace.id}/sources`', "Manage Sources link should use workspace.id");
assert.ok(!adminClients.includes("U.S. Embassy Baghdad"), "Clients page should not hard-code the pilot client name");
assert.ok(!adminClients.includes("/admin/clients/1/setup"), "Clients page should not hard-code Client 1 setup link");
assert.ok(!adminClients.includes("/admin/users?clientId=1"), "Clients page should not hard-code Client 1 users link");
assert.ok(!adminClients.includes("/admin/clients/1/workspaces/1/sources"), "Clients page should not hard-code Client 1 source link");

// Required client page states and metrics are present.
for (const testId of [
  "admin-clients-loading",
  "admin-clients-error",
  "admin-clients-empty",
  "admin-clients-table",
  "admin-clients-mobile-list",
]) {
  assertIncludes(adminClients, testId, `Clients page should include ${testId} state`);
}
for (const label of ["workspace", "tenantUserCount", "sourceAssignmentCount", "enabledSourceCount", "monitoringReady"]) {
  assertIncludes(adminClients, label, `Clients page should include ${label}`);
}

// Users & Access honors client filtering and preselects the client in the create form.
assertIncludes(userManagement, 'location.startsWith("/admin/users")', "UserManagement should detect platform Users & Access route");
assertIncludes(userManagement, 'const search = useSearch();', "UserManagement should read router search state");
assertIncludes(userManagement, 'new URLSearchParams(search).get("clientId")', "UserManagement should read clientId from query string");
assertIncludes(userManagement, 'setNewClientId(routeClientId)', "UserManagement should preselect route clientId in create-user form");
assertIncludes(userManagement, '`/api/admin/users${clientFilter !== "all" ? `?clientId=${clientFilter}` : ""}`', "UserManagement should query filtered admin users endpoint");
assertIncludes(userManagement, 'isPlatformUsersRoute ? "/api/admin/users" : "/api/users"', "UserManagement should create via admin users endpoint in platform route");
assertIncludes(userManagement, 'Users & Access', "UserManagement should expose platform Users & Access label");
assertIncludes(userManagement, 'Assigned Client', "UserManagement should show assigned client column");
assertIncludes(userManagement, 'userScope', "UserManagement should show user scope");

// Backend admin users endpoint supports all-user and client-filtered reads.
assertIncludes(routes, 'app.get("/api/admin/users"', "Admin users endpoint should exist");
assertIncludes(routes, 'req.query.clientId', "Admin users endpoint should inspect clientId query");
assertIncludes(routes, 'await storage.getUsersByClientId(requestedClientId)', "Admin users endpoint should filter tenant users by client");
assertIncludes(routes, 'await storage.getUsers()', "Admin users endpoint should list all users for platform admin");

// Fallbacks avoid undefined/NaN values in visible UI.
assertIncludes(adminClients, 'Number.isFinite(value)', "Clients page should guard numeric metric formatting");
assertIncludes(adminClients, 'return "n/a"', "Clients page should show n/a instead of undefined/NaN");
assertIncludes(userManagement, 'return "Platform"', "Users page should show Platform for null clientId");
assertIncludes(userManagement, 'return clientNameById.get(clientId) || `Client ${clientId}`', "Users page should show a bounded client fallback");

console.log("admin clients/users navigation tests passed");
