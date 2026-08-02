const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(ROOT, "scripts/migrate-workspace-relevance.cjs"), "utf8");
const schema = fs.readFileSync(path.join(ROOT, "shared/schema.ts"), "utf8");

assert(migration.includes("mode: \"dry-run\""), "migration must default to dry-run report mode");
assert(migration.includes("writes: false"), "dry-run must declare that it writes nothing");
assert(migration.includes("pg_advisory_xact_lock"), "apply mode must take an advisory lock");
assert(migration.includes("BEGIN") && migration.includes("ROLLBACK") && migration.includes("COMMIT"), "apply mode must use an explicit transaction");
assert(migration.includes("applySafe"), "dry-run must report whether apply is safe");
assert(migration.includes("missingWorkspaceColumns"), "dry-run must report missing workspace columns");
assert(migration.includes("missingRelevanceColumns"), "dry-run must report relevance-table column gaps");
assert(migration.includes("missingIndexes"), "dry-run must report missing indexes");
assert(migration.includes("missingUniqueConstraints"), "dry-run must report missing unique constraints");
assert(migration.includes("missingForeignKeys"), "dry-run must report missing foreign keys");
assert(migration.includes("missingCheckConstraints"), "dry-run must report missing check constraints");
assert(migration.includes("incompatibleRows"), "dry-run must report incompatible rows");
assert(migration.includes("article_workspace_relevance_workspace_client_fk"), "migration must add workspace/client tenant FK");
assert(migration.includes("article_workspace_relevance_article_client_fk"), "migration must add article/client tenant FK");
assert(migration.includes("workspace_relevance_history_workspace_client_fk"), "migration must add history workspace/client tenant FK");
assert(migration.includes("workspace_relevance_history_article_client_fk"), "migration must add history article/client tenant FK");
assert(migration.includes("Workspace relevance migration aborted before writes"), "apply must abort before writes on incompatible data");

assert(schema.includes("workspaces_scope_mode_ck"), "schema must declare workspaces.scope_mode check");
assert(schema.includes("workspaces_purpose_ck"), "schema must declare workspaces.purpose check");
assert(schema.includes("article_workspace_relevance_status_ck"), "schema must declare relevance status check");
assert(schema.includes("article_workspace_relevance_method_ck"), "schema must declare relevance method check");
assert(schema.includes("article_workspace_relevance_confidence_ck"), "schema must declare relevance confidence check");
assert(schema.includes("workspace_relevance_history_confidence_ck"), "schema must declare history confidence check");
assert(schema.includes("workspace_relevance_profiles_min_confidence_ck"), "schema must declare profile confidence check");

console.log("Workspace relevance migration safety tests passed");
