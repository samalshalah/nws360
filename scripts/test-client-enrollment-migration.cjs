const assert = require("node:assert/strict");
const migration = require("./migrate-client-enrollment.cjs");

function tableFromColumns(columns, rows = []) {
  return { columns: new Set(columns), rows: rows.map((row) => ({ ...row })) };
}

function cloneState(state) {
  const tables = {};
  for (const [name, table] of Object.entries(state.tables)) {
    tables[name] = tableFromColumns([...table.columns], table.rows);
  }
  return {
    tables,
    indexes: new Set(state.indexes),
    constraints: new Set(state.constraints),
  };
}

function requiredColumnNames(table) {
  return migration.TABLE_COLUMNS[table].map(([name]) => name);
}

function emptyBaseState() {
  return {
    tables: {
      clients: tableFromColumns(["id", "name", "organization_type", "active"], [
        { id: 1, name: "Existing Client", organization_type: "media", active: true },
      ]),
      client_settings: tableFromColumns(["id", "client_id"], [{ id: 1, client_id: 1 }]),
      workspaces: tableFromColumns(["id", "client_id", "name", "active"], [
        { id: 1, client_id: 1, name: "Iraq Desk", active: false },
      ]),
    },
    indexes: new Set(),
    constraints: new Set(),
  };
}

function fullyMigratedState() {
  const state = emptyBaseState();
  for (const [table, columns] of Object.entries(migration.TABLE_COLUMNS)) {
    if (!state.tables[table]) state.tables[table] = tableFromColumns([]);
    for (const [name] of columns) state.tables[table].columns.add(name);
  }
  for (const name of Object.keys(migration.INDEXES)) state.indexes.add(name);
  for (const name of Object.keys(migration.CHECKS)) state.constraints.add(name);
  state.tables.clients.rows[0].slug = "existing-client";
  state.tables.clients.rows[0].lifecycle_status = "active";
  state.tables.clients.rows[0].enrollment_key = "existing-key";
  state.tables.workspaces.rows[0].normalized_name = "iraq desk";
  state.tables.workspaces.rows[0].status = "draft";
  return state;
}

function normalizeWorkspaceName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function countInvalidRows(table, rows, where) {
  if (table === "clients" && where.includes("lifecycle_status NOT IN")) {
    return rows.filter((row) => row.lifecycle_status != null && !migration.CLIENT_LIFECYCLE_STATUSES.includes(row.lifecycle_status)).length;
  }
  if (table === "clients" && where.includes("organization_type NOT IN")) {
    return rows.filter((row) => row.organization_type != null && !migration.ORGANIZATION_TYPES.includes(row.organization_type)).length;
  }
  if (table === "workspaces" && where.includes("status NOT IN")) {
    return rows.filter((row) => row.status != null && !migration.WORKSPACE_STATUSES.includes(row.status)).length;
  }
  return 0;
}

function duplicateCount(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

class MockPgClient {
  constructor(state = emptyBaseState(), options = {}) {
    this.state = cloneState(state);
    this.options = options;
    this.queries = [];
    this.snapshot = null;
  }

  async connect() {}
  async end() {}

  query(sql, params = []) {
    const text = String(sql);
    const normalized = text.replace(/\s+/g, " ").trim();
    this.queries.push(normalized);

    if (this.options.failOn && normalized.includes(this.options.failOn)) {
      throw new Error("Simulated statement failure");
    }

    if (normalized === "BEGIN") {
      this.snapshot = cloneState(this.state);
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "ROLLBACK") {
      if (this.snapshot) this.state = this.snapshot;
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "COMMIT") {
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes("pg_advisory_xact_lock")) {
      return { rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT") && normalized.includes("information_schema.tables")) {
      const table = params[0];
      const exists = Boolean(this.state.tables[table]);
      return { rows: exists ? [{ "?column?": 1 }] : [], rowCount: exists ? 1 : 0 };
    }
    if (normalized.startsWith("SELECT") && normalized.includes("information_schema.columns")) {
      const table = params[0];
      const columns = this.state.tables[table]?.columns || new Set();
      return { rows: [...columns].map((column_name) => ({ column_name })), rowCount: columns.size };
    }
    if (normalized.startsWith("SELECT") && normalized.includes("FROM pg_indexes")) {
      return { rows: [...this.state.indexes].map((indexname) => ({ indexname })), rowCount: this.state.indexes.size };
    }
    if (normalized.startsWith("SELECT") && normalized.includes("FROM pg_constraint")) {
      return { rows: [...this.state.constraints].map((conname) => ({ conname })), rowCount: this.state.constraints.size };
    }
    if (normalized.includes("SUM(duplicate_count - 1)") && normalized.includes("FROM clients") && normalized.includes("lower(trim(slug))")) {
      const rows = this.state.tables.clients?.rows || [];
      return { rows: [{ count: duplicateCount(rows, (row) => String(row.slug || "").trim().toLowerCase()) }], rowCount: 1 };
    }
    if (normalized.includes("SUM(duplicate_count - 1)") && normalized.includes("FROM clients") && normalized.includes("enrollment_key")) {
      const rows = this.state.tables.clients?.rows || [];
      return { rows: [{ count: duplicateCount(rows, (row) => String(row.enrollment_key || "").trim()) }], rowCount: 1 };
    }
    if (normalized.includes("SUM(duplicate_count - 1)") && normalized.includes("FROM workspaces")) {
      const rows = this.state.tables.workspaces?.rows || [];
      return {
        rows: [{
          count: duplicateCount(rows, (row) => `${row.client_id}|${String(row.normalized_name || normalizeWorkspaceName(row.name))}`),
        }],
        rowCount: 1,
      };
    }
    const countMatch = normalized.match(/^SELECT COUNT\(\*\)::int AS count FROM ([a-z_]+)(?: WHERE (.*))?$/);
    if (countMatch) {
      const [, table, where] = countMatch;
      const rows = this.state.tables[table]?.rows || [];
      const count = where ? countInvalidRows(table, rows, where) : rows.length;
      return { rows: [{ count }], rowCount: 1 };
    }
    const alterColumnMatch = normalized.match(/^ALTER TABLE ([a-z_]+) ADD COLUMN IF NOT EXISTS ([a-z_]+)/);
    if (alterColumnMatch) {
      const [, table, column] = alterColumnMatch;
      if (!this.state.tables[table]) this.state.tables[table] = tableFromColumns([]);
      this.state.tables[table].columns.add(column);
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("UPDATE workspaces SET normalized_name")) {
      const table = this.state.tables.workspaces;
      table?.columns.add("normalized_name");
      for (const row of table?.rows || []) {
        if (!row.normalized_name || !String(row.normalized_name).trim()) row.normalized_name = normalizeWorkspaceName(row.name);
      }
      return { rows: [], rowCount: table?.rows.length || 0 };
    }
    if (normalized.startsWith("UPDATE clients SET lifecycle_status")) {
      const table = this.state.tables.clients;
      table?.columns.add("lifecycle_status");
      for (const row of table?.rows || []) {
        if (!row.lifecycle_status) row.lifecycle_status = row.active === false ? "suspended" : "active";
      }
      return { rows: [], rowCount: table?.rows.length || 0 };
    }
    const indexMatch = normalized.match(/^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ([a-z_]+)/);
    if (indexMatch) {
      this.state.indexes.add(indexMatch[1]);
      return { rows: [], rowCount: 0 };
    }
    const constraintMatch = normalized.match(/conname = '([^']+)'/);
    if (constraintMatch) {
      this.state.constraints.add(constraintMatch[1]);
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  }
}

async function dryRunPerformsNoWrites() {
  const client = new MockPgClient();
  const before = cloneState(client.state);
  const report = await migration.runClientEnrollmentMigration(client, { dryRun: true, apply: false });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.writes, false);
  assert.equal(report.applySafe, true);
  assert.deepEqual(client.state, before);
  assert.equal(client.queries.some((query) => /^BEGIN|^CREATE|^ALTER|^UPDATE|^COMMIT|^ROLLBACK/.test(query)), false);
}

async function applyIsIdempotentAndUsesTransaction() {
  const client = new MockPgClient();
  const beforeCounts = {
    clients: client.state.tables.clients.rows.length,
    client_settings: client.state.tables.client_settings.rows.length,
    workspaces: client.state.tables.workspaces.rows.length,
  };
  const first = await migration.runClientEnrollmentMigration(client, { apply: true, dryRun: false });
  assert.equal(first.mode, "apply");
  assert.equal(first.writes, true);
  assert(client.queries.includes("BEGIN"));
  assert(client.queries.some((query) => query.includes("pg_advisory_xact_lock")));
  assert(client.queries.includes("COMMIT"));

  const inspected = await migration.inspect(client);
  assert.deepEqual(inspected.missingColumns.clients, []);
  assert.deepEqual(inspected.missingColumns.client_settings, []);
  assert.deepEqual(inspected.missingColumns.workspaces, []);
  assert.deepEqual(inspected.missingIndexes, []);
  assert.deepEqual(inspected.missingCheckConstraints, []);

  const second = await migration.runClientEnrollmentMigration(client, { apply: true, dryRun: false });
  assert.equal(second.mode, "apply");
  assert.equal(client.state.tables.clients.rows.length, beforeCounts.clients);
  assert.equal(client.state.tables.client_settings.rows.length, beforeCounts.client_settings);
  assert.equal(client.state.tables.workspaces.rows.length, beforeCounts.workspaces);
}

async function detectsDuplicateSlugsAndWorkspaceNames() {
  const state = fullyMigratedState();
  state.tables.clients.rows.push({
    id: 2,
    name: "Duplicate",
    slug: " Existing-Client ",
    organization_type: "media",
    active: true,
    lifecycle_status: "active",
  });
  state.tables.workspaces.rows.push({
    id: 2,
    client_id: 1,
    name: " IRAQ   DESK ",
    normalized_name: "",
    status: "draft",
    active: false,
  });
  const client = new MockPgClient(state);
  const inspected = await migration.inspect(client);
  assert.equal(inspected.incompatibleRows.duplicateSlugs, 1);
  assert.equal(inspected.incompatibleRows.duplicateClientWorkspaceNames, 1);
  assert.equal(inspected.applySafe, false);
  await assert.rejects(
    () => migration.runClientEnrollmentMigration(client, { apply: true, dryRun: false }),
    /incompatible rows/,
  );
}

async function rollsBackOnFailure() {
  const client = new MockPgClient(emptyBaseState(), { failOn: "clients_slug_unique" });
  const before = cloneState(client.state);
  await assert.rejects(
    () => migration.runClientEnrollmentMigration(client, { apply: true, dryRun: false }),
    /Simulated statement failure/,
  );
  assert.deepEqual(client.state, before);
  assert(client.queries.includes("ROLLBACK"));
}

async function zeroClientDatabaseSupported() {
  const state = emptyBaseState();
  state.tables.clients.rows = [];
  state.tables.client_settings.rows = [];
  state.tables.workspaces.rows = [];
  const client = new MockPgClient(state);
  const report = await migration.runClientEnrollmentMigration(client, { dryRun: true, apply: false });
  assert.equal(report.applySafe, true);
  assert.equal(report.before.tableRowCounts.clients, 0);
  assert.equal(report.before.tableRowCounts.workspaces, 0);
}

async function main() {
  await dryRunPerformsNoWrites();
  await applyIsIdempotentAndUsesTransaction();
  await detectsDuplicateSlugsAndWorkspaceNames();
  await rollsBackOnFailure();
  await zeroClientDatabaseSupported();
  console.log("client enrollment migration tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
