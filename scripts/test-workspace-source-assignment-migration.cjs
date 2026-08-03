const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const migration = require("./migrate-workspace-source-assignments.cjs");

function inferColumnDetail(table, columnName) {
  const definition = migration.SOURCE_ASSIGNMENT_COLUMNS[table]?.find(([name]) => name === columnName)?.[1] || "integer";
  const lower = definition.toLowerCase();
  const detail = {
    column_name: columnName,
    data_type: "integer",
    udt_name: "int4",
    is_nullable: lower.includes("not null") || lower.includes("primary key") || lower.includes("serial") ? "NO" : "YES",
    column_default: null,
    is_generated: "NEVER",
    generation_expression: null,
    identity_generation: null,
  };
  if (lower.includes("serial")) detail.column_default = `nextval('${table}_${columnName}_seq'::regclass)`;
  if (lower.includes("text")) {
    detail.data_type = "text";
    detail.udt_name = "text";
  }
  if (lower.includes("boolean")) {
    detail.data_type = "boolean";
    detail.udt_name = "bool";
  }
  if (lower.includes("jsonb")) {
    detail.data_type = "jsonb";
    detail.udt_name = "jsonb";
  }
  if (lower.includes("timestamp")) {
    detail.data_type = "timestamp without time zone";
    detail.udt_name = "timestamp";
  }
  const defaultMatch = definition.match(/DEFAULT\s+(.+)$/i);
  if (defaultMatch) detail.column_default = defaultMatch[1].trim();
  return detail;
}

function fullColumns(table) {
  return new Set((migration.SOURCE_ASSIGNMENT_COLUMNS[table] || []).map(([name]) => name));
}

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
    this.indexes = new Map();
    this.constraints = new Map();
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
      const tableInfo = this.tables.get(table) || {};
      const columns = tableInfo.columns || new Set();
      return {
        rows: [...columns].map((column_name) => ({
          ...inferColumnDetail(table, column_name),
          ...(tableInfo.columnOverrides?.[column_name] || {}),
        })),
      };
    }
    if (sql.includes("FROM pg_indexes")) {
      return { rows: [...this.indexes.entries()].map(([indexname, indexdef]) => ({ indexname, indexdef })) };
    }
    if (sql.includes("FROM pg_constraint c")) {
      return {
        rows: [...this.constraints.entries()].map(([conname, constraint]) => ({
          conname,
          contype: constraint.type,
          table_name: constraint.table,
          foreign_table: constraint.foreignTable || null,
          confdeltype: constraint.deleteBehavior || "a",
          definition: constraint.definition || "",
          columns: constraint.columns || [],
          foreign_columns: constraint.foreignColumns || [],
        })),
      };
    }
    if (sql.includes("FROM pg_constraint")) {
      return { rows: [...this.constraints.keys()].map((conname) => ({ conname })) };
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

class FullAssignmentSchemaClient extends FakeClient {
  constructor() {
    super();
    this.tables.set("workspace_source_assignments", {
      count: 0,
      columns: fullColumns("workspace_source_assignments"),
    });
    this.tables.set("workspace_source_assignment_tests", {
      count: 0,
      columns: fullColumns("workspace_source_assignment_tests"),
    });
  }
}

class MalformedColumnClient extends FullAssignmentSchemaClient {
  constructor() {
    super();
    this.tables.set("workspace_source_assignments", {
      count: 1,
      columns: fullColumns("workspace_source_assignments"),
      columnOverrides: {
        id: { data_type: "text", udt_name: "text", column_default: null },
        relevance_policy: { data_type: "ARRAY", udt_name: "_text" },
        enabled: { data_type: "integer", udt_name: "int4" },
        status: { is_nullable: "YES", column_default: null },
      },
    });
  }
}

class PopulatedMissingPrimaryKeyClient extends FullAssignmentSchemaClient {
  constructor() {
    super();
    this.tables.get("workspace_source_assignments").count = 1;
  }
}

class MalformedPrimaryKeyClient extends FullAssignmentSchemaClient {
  constructor() {
    super();
    this.constraints.set("workspace_source_assignments_pkey", {
      type: "p",
      table: "workspace_source_assignments",
      columns: ["client_id"],
      definition: "PRIMARY KEY (client_id)",
    });
  }
}

class NonUniqueIndexClient extends FullAssignmentSchemaClient {
  constructor() {
    super();
    this.indexes.set(
      "workspace_source_assignments_key_unique",
      "CREATE INDEX workspace_source_assignments_key_unique ON public.workspace_source_assignments USING btree (assignment_key)",
    );
  }
}

class WrongForeignKeyClient extends FullAssignmentSchemaClient {
  constructor() {
    super();
    this.constraints.set("workspace_source_assignment_tests_assignment_channel_fk", {
      type: "f",
      table: "workspace_source_assignment_tests",
      columns: ["assignment_id", "publisher_channel_id"],
      foreignTable: "sources",
      foreignColumns: ["id", "publisher_channel_id"],
      deleteBehavior: "c",
      definition: "FOREIGN KEY (assignment_id, publisher_channel_id) REFERENCES sources(id, publisher_channel_id) ON DELETE CASCADE",
    });
  }
}

class MalformedCheckClient extends FullAssignmentSchemaClient {
  constructor() {
    super();
    this.constraints.set("workspace_source_assignment_tests_type_ck", {
      type: "c",
      table: "workspace_source_assignment_tests",
      columns: ["test_type"],
      definition: "CHECK (test_type IN ('connectivity'))",
    });
  }
}

class ThrowingIntegrityClient extends FullAssignmentSchemaClient {
  async query(text, params = []) {
    const sql = String(text);
    if (sql.includes("latest_test_run_id")) {
      this.queries.push(sql);
      const error = new Error("column latest_test_run_id disappeared during inspection");
      error.code = "42703";
      throw error;
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
assertIncludes(joined, "workspace_source_assignments_id_channel_unique", "assignment/channel composite uniqueness exists");
assertIncludes(joined, "workspace_source_assignment_tests_assignment_channel_fk", "test assignment/channel FK exists");
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
assertIncludes(migrationSource, "testAssignmentChannelMismatch", "test assignment channel mismatch is inspected");
assertIncludes(migrationSource, "missingForeignKeys", "missing foreign keys are reported");
assertIncludes(migrationSource, "malformedForeignKeys", "malformed foreign keys are reported");
assertIncludes(migrationSource, "missingCheckConstraints", "missing checks are reported");
assertIncludes(migrationSource, "malformedCheckConstraints", "malformed checks are reported");
assertIncludes(migrationSource, "partialSchemaRepairs", "empty partial-schema repair plan is reported");
assertIncludes(migrationSource, "inspectionErrors", "inspection errors are reported");

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

    const malformedColumns = await migration.inspect(new MalformedColumnClient());
    assert.equal(malformedColumns.applySafe, false);
    assert.ok(malformedColumns.incompatibleColumnDefinitions.some((item) => item.column === "relevance_policy" && item.actual.udtName === "_text"), "wrong jsonb/text[] column is rejected");
    assert.ok(malformedColumns.incompatibleColumnDefinitions.some((item) => item.column === "enabled" && item.actual.dataType === "integer"), "boolean-as-integer column is rejected");
    assert.ok(malformedColumns.incompatibleColumnDefinitions.some((item) => item.column === "id" && item.actual.dataType === "text"), "wrong id type is rejected");
    assert.ok(malformedColumns.nullableRequiredColumns.some((item) => item.column === "status"), "nullable required column is reported");
    assert.ok(malformedColumns.missingDefaults.some((item) => item.column === "status"), "missing default is reported");

    const missingPkEmpty = await migration.inspect(new FullAssignmentSchemaClient());
    assert.equal(missingPkEmpty.applySafe, true, "empty partial table missing PK can be repaired");
    assert.ok(missingPkEmpty.partialSchemaRepairs.some((item) => item.repair === "safe_empty_table_primary_key_repair"), "safe primary-key repair is reported");

    const missingPkPopulated = await migration.inspect(new PopulatedMissingPrimaryKeyClient());
    assert.equal(missingPkPopulated.applySafe, false, "populated missing PK is unsafe");
    assert.ok(missingPkPopulated.partialSchemaRisks.some((item) => item.risk === "populated_table_missing_primary_key"), "populated missing PK risk is reported");

    const malformedPk = await migration.inspect(new MalformedPrimaryKeyClient());
    assert.equal(malformedPk.applySafe, false, "malformed PK is unsafe");
    assert.ok(malformedPk.malformedPrimaryKeys.some((item) => item.table === "workspace_source_assignments"), "malformed PK is reported");

    const nonUniqueIndex = await migration.inspect(new NonUniqueIndexClient());
    assert.equal(nonUniqueIndex.applySafe, false, "nonunique index with expected unique name is unsafe");
    assert.ok(nonUniqueIndex.malformedIndexes.some((item) => item.name === "workspace_source_assignments_key_unique" && item.problems.includes("not_unique")), "malformed unique index is reported");
    assert.ok(nonUniqueIndex.missingUniqueConstraints.some((item) => item.name === "workspace_source_assignments_key_unique"), "malformed unique index is treated as missing unique enforcement");

    const wrongFk = await migration.inspect(new WrongForeignKeyClient());
    assert.equal(wrongFk.applySafe, false, "FK name with wrong target is unsafe");
    assert.ok(wrongFk.malformedForeignKeys.some((item) => item.name === "workspace_source_assignment_tests_assignment_channel_fk" && item.problems.includes("wrong_target_table")), "malformed FK target is reported");

    const badCheck = await migration.inspect(new MalformedCheckClient());
    assert.equal(badCheck.applySafe, false, "malformed check is unsafe");
    assert.ok(badCheck.malformedCheckConstraints.some((item) => item.name === "workspace_source_assignment_tests_type_ck"), "malformed check is reported");

    const throwingClient = new ThrowingIntegrityClient();
    const ThrowingClient = function ThrowingClient() { return throwingClient; };
    const throwing = await migration.run({ apply: true, ClientImpl: ThrowingClient });
    assert.equal(throwing.mode, "apply");
    assert.equal(throwing.writes, false);
    assert.equal(throwing.applySafe, false);
    assert.equal(throwing.error, "apply_not_safe");
    assert.ok(throwing.before.inspectionErrors.some((item) => item.check === "latestTestWrongAssignment" && item.errorCode === "42703"), "integrity query failure is reported");
    assert.equal(throwing.before.incompatibleRows.latestTestWrongAssignment, null, "failed mismatch scan is not reported as zero");
    assert.equal(throwingClient.queries.some((query) => query === "BEGIN"), false, "inspection error aborts apply before transaction");

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
