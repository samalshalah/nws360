const assert = require("node:assert/strict");
const migration = require("./migrate-workspace-relevance.cjs");

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
      clients: tableFromColumns(["id"], [{ id: 1 }]),
      sources: tableFromColumns(["id", "client_id"], [{ id: 10, client_id: 1 }]),
      articles: tableFromColumns(["id", "client_id"], [{ id: 100, client_id: 1 }]),
      workspaces: tableFromColumns(["id", "client_id", "name"], [{ id: 50, client_id: 1, name: "Iraq Desk" }]),
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
  for (const name of [...Object.keys(migration.CHECKS), ...Object.keys(migration.FOREIGN_KEYS)]) {
    state.constraints.add(name);
  }
  return state;
}

function countInvalidRows(table, rows, where, state) {
  if (where.includes("scope_mode") && where.includes("NOT IN")) {
    return rows.filter((row) => row.scope_mode != null && !migration.WORKSPACE_SCOPE_MODES.includes(row.scope_mode)).length;
  }
  if (where.includes("purpose") && where.includes("NOT IN")) {
    return rows.filter((row) => row.purpose != null && !migration.WORKSPACE_PURPOSES.includes(row.purpose)).length;
  }
  if (where.includes("minimum_confidence")) {
    return rows.filter((row) => row.minimum_confidence < 0 || row.minimum_confidence > 100).length;
  }
  if (table === "article_workspace_relevance" && where.includes("relevance_status NOT IN")) {
    return rows.filter((row) => !migration.RELEVANCE_STATUSES.includes(row.relevance_status)).length;
  }
  if (table === "article_workspace_relevance" && where.includes("evaluation_method NOT IN")) {
    return rows.filter((row) => !migration.RELEVANCE_METHODS.includes(row.evaluation_method)).length;
  }
  if (table === "article_workspace_relevance" && where.includes("confidence")) {
    return rows.filter((row) => row.confidence < 0 || row.confidence > 100).length;
  }
  if (table === "workspace_relevance_history" && where.includes("previous_status")) {
    return rows.filter((row) =>
      (row.previous_status != null && !migration.RELEVANCE_STATUSES.includes(row.previous_status)) ||
      !migration.RELEVANCE_STATUSES.includes(row.new_status)
    ).length;
  }
  if (table === "workspace_relevance_history" && where.includes("evaluation_method NOT IN")) {
    return rows.filter((row) => !migration.RELEVANCE_METHODS.includes(row.evaluation_method)).length;
  }
  if (table === "workspace_relevance_history" && where.includes("previous_confidence")) {
    return rows.filter((row) =>
      (row.previous_confidence != null && (row.previous_confidence < 0 || row.previous_confidence > 100)) ||
      row.new_confidence < 0 ||
      row.new_confidence > 100
    ).length;
  }
  if (table === "article_workspace_relevance" && where.includes("NOT EXISTS")) {
    return rows.filter((row) => {
      const workspace = state.tables.workspaces.rows.find((item) => item.id === row.workspace_id && item.client_id === row.client_id);
      const article = state.tables.articles.rows.find((item) => item.id === row.article_id && item.client_id === row.client_id);
      return !workspace || !article;
    }).length;
  }
  if (table === "workspace_relevance_history" && where.includes("NOT EXISTS")) {
    return rows.filter((row) => {
      const workspace = state.tables.workspaces.rows.find((item) => item.id === row.workspace_id && item.client_id === row.client_id);
      const article = state.tables.articles.rows.find((item) => item.id === row.article_id && item.client_id === row.client_id);
      return !workspace || !article;
    }).length;
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
    if (normalized.includes("SUM(duplicate_count")) {
      const table = normalized.match(/FROM ([a-z_]+) GROUP BY/)?.[1];
      const groupBy = normalized.match(/GROUP BY ([a-z_, ]+) HAVING/)?.[1]?.split(",").map((item) => item.trim()) || [];
      const groups = new Map();
      for (const row of this.state.tables[table]?.rows || []) {
        const key = groupBy.map((column) => row[column]).join("|");
        groups.set(key, (groups.get(key) || 0) + 1);
      }
      const count = [...groups.values()].reduce((total, value) => total + Math.max(0, value - 1), 0);
      return { rows: [{ count }], rowCount: 1 };
    }
    const countMatch = normalized.match(/^SELECT COUNT\(\*\)::int AS count FROM ([a-z_]+)(?: WHERE (.*))?$/);
    if (countMatch) {
      const [, table, where] = countMatch;
      const rows = this.state.tables[table]?.rows || [];
      const count = where ? countInvalidRows(table, rows, where, this.state) : rows.length;
      return { rows: [{ count }], rowCount: 1 };
    }
    const createTableMatch = normalized.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+) /);
    if (createTableMatch) {
      const table = createTableMatch[1];
      if (!this.state.tables[table]) {
        this.state.tables[table] = tableFromColumns(requiredColumnNames(table));
      }
      return { rows: [], rowCount: 0 };
    }
    const alterColumnMatch = normalized.match(/^ALTER TABLE ([a-z_]+) ADD COLUMN IF NOT EXISTS ([a-z_]+)/);
    if (alterColumnMatch) {
      const [, table, column] = alterColumnMatch;
      if (!this.state.tables[table]) this.state.tables[table] = tableFromColumns([]);
      this.state.tables[table].columns.add(column);
      return { rows: [], rowCount: 0 };
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
  const report = await migration.runWorkspaceRelevanceMigration(client, { dryRun: true, apply: false });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.writes, false);
  assert.deepEqual(client.state, before);
  assert.equal(client.queries.some((query) => /^BEGIN|^CREATE|^ALTER|^COMMIT|^ROLLBACK/.test(query)), false);
}

async function firstMigrationAppliesAndIsIdempotent() {
  const client = new MockPgClient();
  const baselineCounts = {
    clients: client.state.tables.clients.rows.length,
    workspaces: client.state.tables.workspaces.rows.length,
    sources: client.state.tables.sources.rows.length,
    articles: client.state.tables.articles.rows.length,
  };
  const first = await migration.runWorkspaceRelevanceMigration(client, { apply: true, dryRun: false });
  assert.equal(first.mode, "apply");
  assert.equal(client.queries.some((query) => query.includes("pg_advisory_xact_lock")), true);
  for (const [table, columns] of Object.entries(migration.TABLE_COLUMNS)) {
    assert.ok(client.state.tables[table], `${table} should exist`);
    for (const [column] of columns) {
      assert.ok(client.state.tables[table].columns.has(column), `${table}.${column} should exist`);
    }
  }
  const afterFirst = await migration.inspect(client);
  assert.deepEqual(afterFirst.missingRelevanceColumns.workspace_relevance_profiles, []);
  assert.deepEqual(afterFirst.missingIndexes, []);
  assert.deepEqual(afterFirst.missingForeignKeys, []);
  assert.deepEqual(afterFirst.missingCheckConstraints, []);

  const second = await migration.runWorkspaceRelevanceMigration(client, { apply: true, dryRun: false });
  assert.equal(second.mode, "apply");
  assert.equal(client.state.tables.clients.rows.length, baselineCounts.clients);
  assert.equal(client.state.tables.workspaces.rows.length, baselineCounts.workspaces);
  assert.equal(client.state.tables.sources.rows.length, baselineCounts.sources);
  assert.equal(client.state.tables.articles.rows.length, baselineCounts.articles);
}

async function partialTablesAreRepairedWhenSafe() {
  const state = fullyMigratedState();
  state.tables.article_workspace_relevance = tableFromColumns(["workspace_id", "article_id", "client_id"]);
  const client = new MockPgClient(state);
  const before = await migration.inspect(client);
  assert.equal(before.applySafe, true);
  assert.equal(before.partialSchemaRepairs.some((repair) => repair.column === "id"), true);
  await migration.runWorkspaceRelevanceMigration(client, { apply: true, dryRun: false });
  assert.equal(client.state.tables.article_workspace_relevance.columns.has("id"), true);
  assert.equal(client.state.tables.article_workspace_relevance.columns.has("relevance_status"), true);
}

async function missingSchemaIsDetected() {
  const state = fullyMigratedState();
  state.tables.article_workspace_relevance.columns.delete("confidence");
  state.indexes.delete("idx_article_workspace_relevance_review");
  state.constraints.delete("article_workspace_relevance_confidence_ck");
  state.constraints.delete("article_workspace_relevance_article_client_fk");
  const client = new MockPgClient(state);
  const report = await migration.inspect(client);
  assert.equal(report.missingRelevanceColumns.article_workspace_relevance.some((column) => column.name === "confidence"), true);
  assert.equal(report.missingIndexes.includes("idx_article_workspace_relevance_review"), true);
  assert.equal(report.missingForeignKeys.includes("article_workspace_relevance_article_client_fk"), true);
  assert.equal(report.missingCheckConstraints.includes("article_workspace_relevance_confidence_ck"), true);
}

async function incompatibleRowsBlockApply() {
  const state = fullyMigratedState();
  state.tables.article_workspace_relevance.rows.push({
    id: 1,
    client_id: 1,
    workspace_id: 50,
    article_id: 100,
    relevance_status: "bad_status",
    confidence: 101,
    evaluation_method: "deterministic",
  });
  const client = new MockPgClient(state);
  const report = await migration.inspect(client);
  assert.equal(report.applySafe, false);
  assert.equal(report.incompatibleRows.invalidArticleRelevanceStatus, 1);
  await assert.rejects(
    migration.runWorkspaceRelevanceMigration(client, { apply: true, dryRun: false }),
    /Workspace relevance migration aborted before writes/,
  );
  assert.equal(client.queries.includes("BEGIN"), false);
}

async function tenantMismatchesAndDuplicatesBlockApply() {
  const tenantMismatch = fullyMigratedState();
  tenantMismatch.tables.article_workspace_relevance.rows.push({
    id: 1,
    client_id: 2,
    workspace_id: 50,
    article_id: 100,
    relevance_status: "direct_scope_match",
    confidence: 90,
    evaluation_method: "deterministic",
  });
  const tenantClient = new MockPgClient(tenantMismatch);
  const tenantReport = await migration.inspect(tenantClient);
  assert.equal(tenantReport.applySafe, false);
  assert.equal(tenantReport.incompatibleRows.articleWorkspaceTenantMismatch, 1);

  const duplicateRelevance = fullyMigratedState();
  duplicateRelevance.tables.article_workspace_relevance.rows.push(
    { id: 1, client_id: 1, workspace_id: 50, article_id: 100, relevance_status: "direct_scope_match", confidence: 90, evaluation_method: "deterministic" },
    { id: 2, client_id: 1, workspace_id: 50, article_id: 100, relevance_status: "contextual", confidence: 60, evaluation_method: "deterministic" },
  );
  const duplicateRelevanceClient = new MockPgClient(duplicateRelevance);
  const duplicateRelevanceReport = await migration.inspect(duplicateRelevanceClient);
  assert.equal(duplicateRelevanceReport.applySafe, false);
  assert.equal(duplicateRelevanceReport.incompatibleRows.duplicateArticleWorkspaceRelevanceRows, 1);

  const duplicateProfiles = fullyMigratedState();
  duplicateProfiles.tables.workspace_relevance_profiles.rows.push(
    { id: 1, workspace_id: 50, minimum_confidence: 60 },
    { id: 2, workspace_id: 50, minimum_confidence: 70 },
  );
  const duplicateProfilesClient = new MockPgClient(duplicateProfiles);
  const duplicateProfilesReport = await migration.inspect(duplicateProfilesClient);
  assert.equal(duplicateProfilesReport.applySafe, false);
  assert.equal(duplicateProfilesReport.incompatibleRows.duplicateWorkspaceRelevanceProfiles, 1);
}

async function unsafePartialSchemasBlockApply() {
  const missingId = fullyMigratedState();
  missingId.tables.article_workspace_relevance.columns.delete("id");
  missingId.tables.article_workspace_relevance.rows.push({
    client_id: 1,
    workspace_id: 50,
    article_id: 100,
    relevance_status: "direct_scope_match",
    confidence: 90,
    evaluation_method: "deterministic",
  });
  const missingIdClient = new MockPgClient(missingId);
  const missingIdReport = await migration.inspect(missingIdClient);
  assert.equal(missingIdReport.applySafe, false);
  assert.equal(missingIdReport.partialSchemaRisks.some((risk) => risk.column === "id"), true);

  const missingRequired = fullyMigratedState();
  missingRequired.tables.article_workspace_relevance.columns.delete("workspace_id");
  missingRequired.tables.article_workspace_relevance.rows.push({
    id: 1,
    client_id: 1,
    article_id: 100,
    relevance_status: "direct_scope_match",
    confidence: 90,
    evaluation_method: "deterministic",
  });
  const missingRequiredClient = new MockPgClient(missingRequired);
  const missingRequiredReport = await migration.inspect(missingRequiredClient);
  assert.equal(missingRequiredReport.applySafe, false);
  assert.equal(missingRequiredReport.partialSchemaRisks.some((risk) => risk.column === "workspace_id"), true);
}

async function failedStatementRollsBack() {
  const client = new MockPgClient(emptyBaseState(), { failOn: "CREATE INDEX IF NOT EXISTS workspaces_client_idx" });
  await assert.rejects(
    migration.runWorkspaceRelevanceMigration(client, { apply: true, dryRun: false }),
    /Simulated statement failure/,
  );
  assert.equal(client.queries.includes("BEGIN"), true);
  assert.equal(client.queries.includes("ROLLBACK"), true);
  assert.equal(client.queries.includes("COMMIT"), false);
  assert.equal(client.state.tables.workspace_relevance_profiles, undefined);
}

async function run() {
  await dryRunPerformsNoWrites();
  await firstMigrationAppliesAndIsIdempotent();
  await partialTablesAreRepairedWhenSafe();
  await missingSchemaIsDetected();
  await incompatibleRowsBlockApply();
  await tenantMismatchesAndDuplicatesBlockApply();
  await unsafePartialSchemasBlockApply();
  await failedStatementRollsBack();
  console.log("Workspace relevance migration behavioral tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
