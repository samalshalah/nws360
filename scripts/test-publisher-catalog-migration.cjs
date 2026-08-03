const assert = require("node:assert/strict");
const migration = require("./migrate-publisher-catalog.cjs");

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

function emptyBaseState() {
  return {
    tables: {
      users: tableFromColumns(["id", "username", "role", "user_scope", "client_id"], [{ id: 2, username: "admin@nws360.com", role: "admin", user_scope: "platform", client_id: null }]),
      clients: tableFromColumns(["id", "name"], []),
      sources: tableFromColumns(["id", "client_id", "name", "url"], []),
      articles: tableFromColumns(["id", "client_id", "source_id", "url"], []),
      platform_reset_audit: tableFromColumns(["id", "result"], [{ id: 1, result: "success" }]),
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
  for (const name of Object.keys(migration.FOREIGN_KEYS)) state.constraints.add(name);
  return state;
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

function countRowsForWhere(table, rows, where) {
  if (table === "publisher_profiles" && where.includes("NOT ((scope_type = 'global'")) {
    return rows.filter((row) => !((row.scope_type === "global" && row.owner_client_id == null) || (row.scope_type === "client_private" && row.owner_client_id != null))).length;
  }
  if (table === "publisher_profiles" && where.includes("status NOT IN")) {
    return rows.filter((row) => row.status != null && !["draft", "active", "paused", "archived"].includes(row.status)).length;
  }
  if (table === "publisher_profiles" && where.includes("verification_status NOT IN")) {
    return rows.filter((row) => row.verification_status != null && !["unverified", "verified", "disputed"].includes(row.verification_status)).length;
  }
  if (table === "publisher_channels" && where.includes("lifecycle_status NOT IN")) {
    return rows.filter((row) => row.lifecycle_status != null && !["draft", "active", "paused", "archived"].includes(row.lifecycle_status)).length;
  }
  if (table === "publisher_channels" && where.includes("validation_status NOT IN")) {
    return rows.filter((row) => row.validation_status != null && !["untested", "valid", "invalid", "unreachable", "needs_review"].includes(row.validation_status)).length;
  }
  if (table === "publisher_channels" && where.includes("channel_type = 'google_news'")) {
    return rows.filter((row) => row.channel_type === "google_news").length;
  }
  if (table === "client_publisher_selections" && where.includes("status NOT IN")) {
    return rows.filter((row) => row.status != null && !["candidate", "approved", "blocked", "archived"].includes(row.status)).length;
  }
  if (table === "article_appearances" && where.includes("appearance_type NOT IN")) {
    return rows.filter((row) => row.appearance_type != null && !["original", "rss", "republished", "social", "video", "broadcast", "collector"].includes(row.appearance_type)).length;
  }
  return 0;
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

  async query(sql, params = []) {
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
    if (normalized.startsWith("SELECT COUNT(*)::int AS count FROM ")) {
      const table = normalized.match(/FROM ([a-z_]+)/)?.[1];
      const rows = this.state.tables[table]?.rows || [];
      if (!normalized.includes(" WHERE ")) return { rows: [{ count: rows.length }], rowCount: 1 };
      const where = normalized.split(" WHERE ")[1];
      return { rows: [{ count: countRowsForWhere(table, rows, where) }], rowCount: 1 };
    }
    if (normalized.includes("SUM(duplicate_count - 1)")) {
      const table = normalized.match(/FROM ([a-z_]+)/)?.[1];
      const rows = this.state.tables[table]?.rows || [];
      if (table === "publisher_profiles" && normalized.includes("canonical_key")) return { rows: [{ count: duplicateCount(rows, (row) => String(row.canonical_key || "").trim()) }], rowCount: 1 };
      if (table === "publisher_profiles" && normalized.includes("normalized_primary_domain")) return { rows: [{ count: duplicateCount(rows, (row) => row.normalized_primary_domain ? `${row.scope_type}:${row.owner_client_id || ""}:${row.normalized_primary_domain}` : "") }], rowCount: 1 };
      if (table === "publisher_channels" && normalized.includes("channel_key")) return { rows: [{ count: duplicateCount(rows, (row) => String(row.channel_key || "").trim()) }], rowCount: 1 };
      if (table === "publisher_channels" && normalized.includes("normalized_url")) return { rows: [{ count: duplicateCount(rows, (row) => String(row.normalized_url || "").trim()) }], rowCount: 1 };
      if (table === "client_publisher_selections") return { rows: [{ count: duplicateCount(rows, (row) => `${row.client_id}:${row.publisher_profile_id}`) }], rowCount: 1 };
      return { rows: [{ count: 0 }], rowCount: 1 };
    }
    if (normalized.includes("FROM client_publisher_selections cps JOIN publisher_profiles pp")) {
      const selections = this.state.tables.client_publisher_selections?.rows || [];
      const publishers = this.state.tables.publisher_profiles?.rows || [];
      const count = selections.filter((selection) => {
        const publisher = publishers.find((item) => item.id === selection.publisher_profile_id);
        return publisher?.scope_type === "client_private" && publisher.owner_client_id !== selection.client_id;
      }).length;
      return { rows: [{ count }], rowCount: 1 };
    }
    if (normalized.includes("FROM sources s JOIN publisher_channels pc")) {
      const sources = this.state.tables.sources?.rows || [];
      const channels = this.state.tables.publisher_channels?.rows || [];
      const publishers = this.state.tables.publisher_profiles?.rows || [];
      const count = sources.filter((source) => {
        const channel = channels.find((item) => item.id === source.publisher_channel_id);
        const publisher = publishers.find((item) => item.id === channel?.publisher_profile_id);
        return source.publisher_channel_id != null && publisher?.scope_type === "client_private" && publisher.owner_client_id !== source.client_id;
      }).length;
      return { rows: [{ count }], rowCount: 1 };
    }

    if (normalized.startsWith("CREATE TABLE IF NOT EXISTS ")) {
      const table = normalized.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/)?.[1];
      if (table && !this.state.tables[table]) {
        this.state.tables[table] = tableFromColumns(migration.TABLE_COLUMNS[table].map(([name]) => name));
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("ALTER TABLE ") && normalized.includes(" ADD COLUMN IF NOT EXISTS ")) {
      const match = normalized.match(/ALTER TABLE ([a-z_]+) ADD COLUMN IF NOT EXISTS ([a-z_]+)/);
      if (match) {
        const [, table, column] = match;
        if (!this.state.tables[table]) this.state.tables[table] = tableFromColumns([]);
        this.state.tables[table].columns.add(column);
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("CREATE ") && normalized.includes(" INDEX IF NOT EXISTS ")) {
      const match = normalized.match(/INDEX IF NOT EXISTS ([a-z_]+)/);
      if (match) this.state.indexes.add(match[1]);
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("DO $$") && normalized.includes("ADD CONSTRAINT")) {
      const match = normalized.match(/ADD CONSTRAINT ([a-z_]+)/);
      if (match) this.state.constraints.add(match[1]);
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 0 };
  }
}

(async () => {
  const dryRunClient = new MockPgClient(emptyBaseState());
  const dryRun = await migration.runPublisherCatalogMigration(dryRunClient, { dryRun: true, apply: false });
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.writes, false);
  assert.equal(dryRun.applySafe, true);
  assert.ok(dryRun.plannedStatements.length > 0);
  assert.equal(dryRunClient.queries.includes("BEGIN"), false);
  assert.equal(dryRunClient.state.tables.publisher_profiles, undefined);

  const applyClient = new MockPgClient(emptyBaseState());
  const firstApply = await migration.runPublisherCatalogMigration(applyClient, { apply: true });
  assert.equal(firstApply.mode, "apply");
  assert.equal(firstApply.writes, true);
  assert.ok(applyClient.state.tables.publisher_profiles);
  assert.ok(applyClient.state.tables.article_appearances);
  assert.ok(applyClient.state.tables.sources.columns.has("publisher_channel_id"));
  assert.equal(applyClient.state.tables.clients.rows.length, 0);
  assert.equal(applyClient.state.tables.sources.rows.length, 0);
  assert.equal(applyClient.state.tables.articles.rows.length, 0);
  assert.equal(applyClient.state.tables.platform_reset_audit.rows.length, 1);

  const afterFirst = cloneState(applyClient.state);
  await migration.runPublisherCatalogMigration(applyClient, { apply: true });
  assert.deepEqual(applyClient.state.tables.platform_reset_audit.rows, afterFirst.tables.platform_reset_audit.rows);
  assert.deepEqual(applyClient.state.tables.publisher_profiles.rows, []);

  const safePartial = fullyMigratedState();
  safePartial.tables.publisher_channels.columns.delete("validation_status");
  safePartial.indexes.delete("publisher_channels_type_idx");
  safePartial.constraints.delete("publisher_channels_validation_status_ck");
  const safePartialClient = new MockPgClient(safePartial);
  const partialReport = await migration.runPublisherCatalogMigration(safePartialClient, { dryRun: true, apply: false });
  assert.equal(partialReport.applySafe, true);
  assert.ok(partialReport.before.missingColumns.publisher_channels.some((column) => column.name === "validation_status"));
  assert.ok(partialReport.before.missingIndexes.includes("publisher_channels_type_idx"));
  assert.ok(partialReport.before.missingCheckConstraints.includes("publisher_channels_validation_status_ck"));
  await migration.runPublisherCatalogMigration(safePartialClient, { apply: true });
  assert.ok(safePartialClient.state.tables.publisher_channels.columns.has("validation_status"));
  assert.ok(safePartialClient.state.indexes.has("publisher_channels_type_idx"));
  assert.ok(safePartialClient.state.constraints.has("publisher_channels_validation_status_ck"));

  const unsafePartial = fullyMigratedState();
  unsafePartial.tables.publisher_profiles.columns.delete("canonical_key");
  unsafePartial.tables.publisher_profiles.rows.push({ id: 1, name: "Partial Publisher" });
  const unsafeClient = new MockPgClient(unsafePartial);
  const unsafeReport = await migration.runPublisherCatalogMigration(unsafeClient, { dryRun: true, apply: false });
  assert.equal(unsafeReport.applySafe, false);
  assert.ok(unsafeReport.before.unsafePartialSchemaRisks.length > 0);
  await assert.rejects(() => migration.runPublisherCatalogMigration(unsafeClient, { apply: true }), /aborted before writes/);

  const invalidState = fullyMigratedState();
  invalidState.tables.publisher_profiles.rows.push({ id: 1, canonical_key: "global:x", scope_type: "global", owner_client_id: 1, status: "active", verification_status: "verified" });
  invalidState.tables.publisher_channels.rows.push({ id: 1, publisher_profile_id: 1, channel_key: "x", channel_type: "google_news", lifecycle_status: "active", validation_status: "valid" });
  const invalidClient = new MockPgClient(invalidState);
  const invalidReport = await migration.runPublisherCatalogMigration(invalidClient, { dryRun: true, apply: false });
  assert.equal(invalidReport.applySafe, false);
  assert.equal(invalidReport.before.incompatibleRows.invalidPublisherScopeOwner, 1);
  assert.equal(invalidReport.before.incompatibleRows.googleNewsPublisherChannels, 1);

  const rollbackState = emptyBaseState();
  const rollbackClient = new MockPgClient(rollbackState, { failOn: "publisher_channels_normalized_url_unique" });
  const beforeRollback = cloneState(rollbackClient.state);
  await assert.rejects(() => migration.runPublisherCatalogMigration(rollbackClient, { apply: true }), /Simulated statement failure/);
  assert.deepEqual(rollbackClient.state, beforeRollback);
  assert.ok(rollbackClient.queries.includes("ROLLBACK"));

  console.log("publisher catalog migration tests passed");
})();
