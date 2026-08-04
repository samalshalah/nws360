import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const routes = read("server/routes.ts");
const adminPage = read("client/src/pages/Admin.tsx");
const sourceHooks = read("client/src/hooks/use-sources.ts");

function assertIncludes(source: string, needle: string, message: string) {
  assert.ok(source.includes(needle), message);
}

const listRoute = routes.slice(
  routes.indexOf("app.get(api.sources.list.path"),
  routes.indexOf("app.get(\"/feeds/:token.xml\""),
);
const deleteRoute = routes.slice(
  routes.indexOf("app.delete(api.sources.delete.path"),
  routes.indexOf("app.post(\"/api/sources/discover-channels\""),
);

assertIncludes(listRoute, ".filter((source) => !source.deletedAt)", "Tenant source list should hide soft-deleted sources");
assertIncludes(deleteRoute, "requireCapability(CAPS.SOURCES_DELETE)", "Tenant source delete should require sources_delete");
assertIncludes(deleteRoute, "await storage.softDeleteSource(id, clientId)", "Tenant source delete should soft-delete instead of hard-delete");
assert.ok(!deleteRoute.includes("await storage.deleteSource(id, clientId)"), "Tenant source delete must not hard-delete FK-linked pilot sources");
assertIncludes(deleteRoute, 'action: "soft_delete"', "Tenant source delete should write a soft-delete audit event");

assertIncludes(adminPage, "hasCap(CAPS.SOURCES_DELETE) && (", "Source delete controls should be permission-gated");
assertIncludes(adminPage, "button-delete-group-", "Desktop grouped source delete should still exist for authorized users");
assertIncludes(adminPage, "button-delete-source-", "Desktop source delete should still exist for authorized users");
assertIncludes(adminPage, "button-delete-group-mobile-", "Mobile grouped source delete should still exist for authorized users");

assertIncludes(sourceHooks, "error?.message || \"Failed to delete source\"", "Delete source hook should surface backend error messages");

console.log("client source delete tests passed");
