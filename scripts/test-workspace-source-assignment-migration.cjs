const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const migration = require("./migrate-workspace-source-assignments.cjs");

class FakeClient {
  constructor() {
    this.queries = [];
    this.tables = new Map([
      ["users", { count: 1, columns: new Set(["id"]) }],
      ["clients", { count: 0, columns: new Set(["id"]) }],
      ["workspaces", { count: 0, columns: new Set(["id", "client_id"]) }],
      ["workspace_relevance_profiles", { count: 0, columns: new Set(["id", "workspace_id", "client_id"]) }],
      ["publisher_profiles", { count: 0, columns: new Set(["id"]) }],
      ["publisher_channels", { count: 0, columns: new Set(["id", "publisher_profile_id"]) }],
      ["client_publisher_selections", { count: 0, columns: new Set(["id", "client_id", "publisher_profile_id"]) }],
      ["sources", { count: 0, columns: new Set(["id", "client_id", "publisher_channel_id"]) }],
      ["articles", { count: 0, columns: new Set(["id"]) }],
      ["article_appearances", { count: 0, columns: new Set(["id"]) }],
      ["platform_reset_audit", { count: 1, columns: new Set(["id"]) }],
    ]);
    this.indexes = new Set();
    this.constraints = new Set();
  }

  async connect() {}
  async end() {}

  async query(text, params = []) {
    const sql = String(text);
    this.queries.push(sql);
    if (sql.includes("to_regclass")) {
      const table = String(params[0] || "").replace(/^public\./, "");
      return { rows: [{ name: this.tables.has(table) ? `public.${table}` : null }] };
    }
    if (sql.includes("information_schema.columns")) {
      const table = String(params[0] || "");
      const columns = this.tables.get(table)?.columns || new Set();
      return { rows: [...columns].map((column_name) => ({ column_name })) };
    }
    if (sql.includes("FROM pg_indexes")) {
      return { rows: [...this.indexes].map((indexname) => ({ indexname })) };
    }
    if (sql.includes("FROM pg_constraint")) {
      return { rows: [...this.constraints].map((conname) => ({ conname })) };
    }
    if (/^SELECT count\(\*\)::int AS count FROM/i.test(sql)) {
      const table = sql.match(/FROM\s+([a-z_]+)/i)?.[1];
      return { rows: [{ count: this.tables.get(table)?.count ?? 0 }] };
    }
    if (sql.includes("SELECT count(*)::int AS count")) {
      return { rows: [{ count: 0 }] };
    }
    return { rows: [] };
  }
}

class UnsafePartialClient extends FakeClient {
  constructor() {
    super();
    this.tables.set("workspace_source_assignments", {
      count: 1,
      columns: new Set(["id", "client_id"]),
    });
  }
}

class FailingApplyClient extends FakeClient {
  async query(text, params = []) {
    const sql = String(text);
    if (sql.startsWith("ALTER TABLE sources ADD COLUMN")) {
      this.queries.push(sql);
      throw new Error("simulated_migration_failure");
    }
    return super.query(text, params);
  }
}

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), label);
}

const plannedSql = migration.allPlannedSql();
const joined = plannedSql.join("\n");
assert.ok(plannedSql.length > 10, "migration has planned statements");
assertIncludes(joined, "CREATE TABLE IF NOT EXISTS workspace_source_assignments", "assignment table is created");
assertIncludes(joined, "CREATE TABLE IF NOT EXISTS workspace_source_assignment_tests", "test table is created");
assertIncludes(joined, "ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_identity_key text", "source identity column is added");
assertIncludes(joined, "workspace_source_assignments_workspace_source_unique", "workspace/source uniqueness exists");
assertIncludes(joined, "workspace_source_assignments_workspace_channel_unique", "workspace/channel uniqueness exists");
assertIncludes(joined, "client_publisher_selections_id_client_publisher_unique", "client publisher composite uniqueness exists");
assertIncludes(joined, "sources_id_client_channel_unique", "source client/channel composite uniqueness exists");
assertIncludes(joined, "workspace_source_assignment_tests_id_assignment_unique", "test assignment composite uniqueness exists");
assertIncludes(joined, "workspace_source_assignments_latest_test_assignment_fk", "latest test assignment FK exists");
assertIncludes(joined, "sources_client_identity_unique", "client source identity uniqueness exists");
assertIncludes(joined, "workspace_source_assignments_enabled_status_ck", "enabled/status check exists");
assertIncludes(joined, "workspace_source_assignment_tests_rates_ck", "test run rate check exists");
assert.equal(/INSERT\s+INTO/i.test(joined), false, "migration creates no business data");
assert.equal(/DELETE\s+FROM|TRUNCATE/i.test(joined), false, "migration does not delete business data");

const firstSourceAlter = plannedSql.findIndex((stmt) => stmt.includes("ALTER TABLE sources ADD COLUMN"));
const createAssignment = plannedSql.findIndex((stmt) => stmt.includes("CREATE TABLE IF NOT EXISTS workspace_source_assignments"));
const assignmentRepair = plannedSql.findIndex((stmt, index) => index > createAssignment && stmt.includes("ALTER TABLE workspace_source_assignments ADD COLUMN"));
assert.ok(firstSourceAlter >= 0, "existing source-table alter is planned");
assert.ok(createAssignment > firstSourceAlter, "assignment table create follows existing-table alters");
assert.ok(assignmentRepair > createAssignment, "assignment-table repair follows create-table statements");

const migrationSource = readFileSync("scripts/migrate-workspace-source-assignments.cjs", "utf8");
assertIncludes(migrationSource, "pg_advisory_xact_lock", "apply uses advisory migration lock");
assertIncludes(migrationSource, "BEGIN", "apply starts transaction");
assertIncludes(migrationSource, "ROLLBACK", "apply rolls back on failure");
assertIncludes(migrationSource, "duplicateOperationalSourceIdentity", "duplicate source identities are inspected");
assertIncludes(migrationSource, "assignmentSourceClientChannelMismatch", "source/channel mismatch is inspected");
assertIncludes(migrationSource, "activeAssignmentWithoutCurrentTest", "active assignments require current relevance/full tests");
assertIncludes(migrationSource, "latestTestWrongAssignment", "latest test assignment mismatch is inspected");
assertIncludes(migrationSource, "missingForeignKeys", "missing foreign keys are reported");
assertIncludes(migrationSource, "missingCheckConstraints", "missing checks are reported");
assertIncludes(migrationSource, "partialSchemaRepairs", "empty partial-schema repair plan is reported");

(async () => {
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://example.invalid/neondb";
  try {
    const dryClient = new FakeClient();
    const DryClient = function DryClient() { return dryClient; };
    const dryRun = await migration.run({ apply: false, ClientImpl: DryClient });
    assert.equal(dryRun.mode, "dry-run");
    assert.equal(dryRun.writes, false);
    assert.equal(dryRun.applySafe, true);
    assert.equal(dryRun.futureApplyCommand, "npm run db:migrate:workspace-source-assignments -- --apply");
    assert.equal(dryClient.queries.some((query) => query === "BEGIN"), false, "dry-run does not start write transaction");
    assert.equal(dryClient.queries.some((query) => query.includes("pg_advisory_xact_lock")), false, "dry-run does not take write lock");

    const unsafeClient = new UnsafePartialClient();
    const UnsafeClient = function UnsafeClient() { return unsafeClient; };
    const unsafe = await migration.run({ apply: true, ClientImpl: UnsafeClient });
    assert.equal(unsafe.mode, "apply");
    assert.equal(unsafe.writes, false);
    assert.equal(unsafe.applySafe, false);
    assert.equal(unsafe.error, "apply_not_safe");
    assert.equal(unsafeClient.queries.some((query) => query === "BEGIN"), false, "unsafe apply aborts before transaction");

    const failingClient = new FailingApplyClient();
    const FailingClient = function FailingClient() { return failingClient; };
    await assert.rejects(() => migration.run({ apply: true, ClientImpl: FailingClient }), /simulated_migration_failure/);
    assert.ok(failingClient.queries.includes("BEGIN"), "apply starts transaction");
    assert.ok(failingClient.queries.some((query) => query.includes("pg_advisory_xact_lock")), "apply takes advisory lock");
    assert.ok(failingClient.queries.includes("ROLLBACK"), "apply rolls back after simulated failure");
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }
  console.log("workspace source assignment migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
