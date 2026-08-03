const assert = require("node:assert/strict");
const migration = require("./migrate-publisher-catalog.cjs");

function inferColumnDetails(table, column) {
  const definition = migration.TABLE_COLUMNS[table]?.find(([name]) => name === column)?.[1] || "text";
  const lower = definition.toLowerCase();
  let data_type = "text";
  let udt_name = "text";
  if (lower.includes("serial") || lower.includes("integer")) {
    data_type = "integer";
    udt_name = "int4";
  } else if (lower.includes("boolean")) {
    data_type = "boolean";
    udt_name = "bool";
  } else if (lower.includes("jsonb")) {
    data_type = "jsonb";
    udt_name = "jsonb";
  } else if (lower.includes("uuid")) {
    data_type = "uuid";
    udt_name = "uuid";
  } else if (lower.includes("timestamp")) {
    data_type = "timestamp without time zone";
    udt_name = "timestamp";
  } else if (lower.includes("text[]")) {
    data_type = "ARRAY";
    udt_name = "_text";
  }
  return {
    column_name: column,
    data_type,
    udt_name,
    is_nullable: lower.includes("not null") || lower.includes("primary key") ? "NO" : "YES",
    column_default: lower.includes("serial") ? `nextval('${table}_${column}_seq'::regclass)` : lower.includes("default") ? "default" : null,
  };
}

function tableFromColumns(columns, rows = [], options = {}) {
  const columnDetails = {};
  for (const column of columns) {
    columnDetails[column] = { ...inferColumnDetails(options.table || "", column), ...(options.columnDetails?.[column] || {}) };
  }
  return {
    columns: new Set(columns),
    rows: rows.map((row) => ({ ...row })),
    columnDetails,
    primaryKeys: new Set(options.primaryKeys || (columns.includes("id") ? ["id"] : [])),
  };
}

function cloneState(state) {
  const tables = {};
  for (const [name, table] of Object.entries(state.tables)) {
    tables[name] = tableFromColumns([...table.columns], table.rows, {
      table: name,
      columnDetails: table.columnDetails,
      primaryKeys: [...(table.primaryKeys || [])],
    });
  }
  return {
    tables,
    indexes: new Set(state.indexes),
    constraints: new Set(state.constraints),
    foreignKeyDetails: new Map(state.foreignKeyDetails || []),
  };
}

function emptyBaseState() {
  return {
    tables: {
      users: tableFromColumns(["id", "username", "role", "user_scope", "client_id"], [{ id: 2, username: "admin@nws360.com", role: "admin", user_scope: "platform", client_id: null }], { table: "users" }),
      clients: tableFromColumns(["id", "name"], [], { table: "clients" }),
      sources: tableFromColumns(["id", "client_id", "name", "url"], [], { table: "sources" }),
      articles: tableFromColumns(["id", "client_id", "source_id", "url"], [], { table: "articles" }),
      platform_reset_audit: tableFromColumns(["id", "result"], [{ id: 1, result: "success" }], { table: "platform_reset_audit" }),
    },
    indexes: new Set(),
    constraints: new Set(),
    foreignKeyDetails: new Map(),
  };
}

function fullyMigratedState() {
  const state = emptyBaseState();
  for (const [table, columns] of Object.entries(migration.TABLE_COLUMNS)) {
    if (!state.tables[table]) state.tables[table] = tableFromColumns([], [], { table });
    for (const [name] of columns) {
      state.tables[table].columns.add(name);
      state.tables[table].columnDetails[name] = inferColumnDetails(table, name);
      if (name === "id") state.tables[table].primaryKeys.add(name);
    }
  }
  for (const name of Object.keys(migration.INDEXES)) state.indexes.add(name);
  for (const name of Object.keys(migration.CHECKS)) state.constraints.add(name);
  for (const [name, spec] of Object.entries(migration.FOREIGN_KEYS)) {
    state.constraints.add(name);
    const ref = String(spec.references).match(/^([a-z_]+)\(([^)]+)\)$/);
    state.foreignKeyDetails.set(name, {
      conname: name,
      table_name: spec.table,
      foreign_table_name: ref?.[1],
      columns: Array.isArray(spec.columns) ? spec.columns : [spec.column],
      foreign_columns: ref?.[2].split(",").map((column) => column.trim()) || [],
    });
  }
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
      const tableState = this.state.tables[table];
      const columns = tableState?.columns || new Set();
      const rows = [...columns].map((column_name) => ({
        column_name,
        ...(tableState?.columnDetails?.[column_name] || inferColumnDetails(table, column_name)),
      }));
      return { rows, rowCount: columns.size };
    }
    if (normalized.startsWith("SELECT A.ATTNAME AS COLUMN_NAME") || normalized.includes("FROM pg_index i")) {
      const table = params[0];
      const primaryKeys = this.state.tables[table]?.primaryKeys || new Set();
      return { rows: [...primaryKeys].map((column_name) => ({ column_name })), rowCount: primaryKeys.size };
    }
    if (normalized.startsWith("SELECT") && normalized.includes("FROM pg_indexes")) {
      return { rows: [...this.state.indexes].map((indexname) => ({ indexname })), rowCount: this.state.indexes.size };
    }
    if (normalized.startsWith("SELECT C.CONNAME") || normalized.includes("ARRAY_AGG(a.attname")) {
      const rows = [...this.state.foreignKeyDetails.values()].filter((row) => this.state.constraints.has(row.conname));
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith("SELECT") && normalized.includes("FROM pg_constraint")) {
      return { rows: [...this.state.constraints].map((conname) => ({ conname })), rowCount: this.state.constraints.size };
    }
    if (normalized.startsWith("SELECT COUNT(*)::int AS count FROM ") && !normalized.includes(" JOIN ")) {
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
      if (table === "publisher_profiles" && normalized.includes("domain_scope_key")) return { rows: [{ count: duplicateCount(rows, (row) => String(row.domain_scope_key || "").trim()) }], rowCount: 1 };
      if (table === "publisher_aliases" && normalized.includes("COALESCE(NULLIF(language_code")) return { rows: [{ count: duplicateCount(rows, (row) => `${row.publisher_profile_id}:${row.normalized_alias}:${row.language_code || "und"}`) }], rowCount: 1 };
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
    if (normalized.includes("FROM article_appearances aa LEFT JOIN articles a")) {
      const appearances = this.state.tables.article_appearances?.rows || [];
      const articles = this.state.tables.articles?.rows || [];
      const count = appearances.filter((appearance) => !articles.some((article) => article.id === appearance.article_id && article.client_id === appearance.client_id)).length;
      return { rows: [{ count }], rowCount: 1 };
    }
    if (normalized.includes("FROM article_appearances aa LEFT JOIN sources s")) {
      const appearances = this.state.tables.article_appearances?.rows || [];
      const sources = this.state.tables.sources?.rows || [];
      const count = appearances.filter((appearance) => appearance.source_id != null && !sources.some((source) => source.id === appearance.source_id && source.client_id === appearance.client_id)).length;
      return { rows: [{ count }], rowCount: 1 };
    }
    if (normalized.includes("FROM article_appearances aa LEFT JOIN publisher_channels pc")) {
      const appearances = this.state.tables.article_appearances?.rows || [];
      const channels = this.state.tables.publisher_channels?.rows || [];
      const count = appearances.filter((appearance) =>
        appearance.publisher_channel_id != null
        && appearance.publisher_profile_id != null
        && !channels.some((channel) => channel.id === appearance.publisher_channel_id && channel.publisher_profile_id === appearance.publisher_profile_id)
      ).length;
      return { rows: [{ count }], rowCount: 1 };
    }
    if (normalized.includes("FROM article_appearances aa JOIN publisher_profiles pp")) {
      const appearances = this.state.tables.article_appearances?.rows || [];
      const publishers = this.state.tables.publisher_profiles?.rows || [];
      const count = appearances.filter((appearance) => {
        const publisher = publishers.find((item) => item.id === appearance.publisher_profile_id);
        return publisher?.scope_type === "client_private" && publisher.owner_client_id !== appearance.client_id;
      }).length;
      return { rows: [{ count }], rowCount: 1 };
    }
    if (normalized.includes("FROM sources s LEFT JOIN publisher_channels pc")) {
      const sources = this.state.tables.sources?.rows || [];
      const channels = this.state.tables.publisher_channels?.rows || [];
      const count = sources.filter((source) => source.publisher_channel_id != null && !channels.some((channel) => channel.id === source.publisher_channel_id)).length;
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
        this.state.tables[table] = tableFromColumns(migration.TABLE_COLUMNS[table].map(([name]) => name), [], { table });
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("ALTER TABLE ") && normalized.includes(" ADD COLUMN IF NOT EXISTS ")) {
      const match = normalized.match(/ALTER TABLE ([a-z_]+) ADD COLUMN IF NOT EXISTS ([a-z_]+)/);
      if (match) {
        const [, table, column] = match;
        if (!this.state.tables[table]) this.state.tables[table] = tableFromColumns([], [], { table });
        this.state.tables[table].columns.add(column);
        this.state.tables[table].columnDetails[column] = inferColumnDetails(table, column);
        if (column === "id" && normalized.includes("PRIMARY KEY")) this.state.tables[table].primaryKeys.add(column);
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("ALTER TABLE ") && normalized.includes(" ADD PRIMARY KEY ")) {
      const match = normalized.match(/ALTER TABLE ([a-z_]+) ADD PRIMARY KEY \(id\)/);
      if (match) this.state.tables[match[1]]?.primaryKeys.add("id");
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("ALTER TABLE ") && normalized.includes(" ALTER COLUMN ") && normalized.includes(" SET NOT NULL")) {
      const match = normalized.match(/ALTER TABLE ([a-z_]+) ALTER COLUMN ([a-z_]+) SET NOT NULL/);
      if (match && this.state.tables[match[1]]?.columnDetails?.[match[2]]) {
        this.state.tables[match[1]].columnDetails[match[2]].is_nullable = "NO";
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("ALTER TABLE ") && normalized.includes(" ALTER COLUMN ") && normalized.includes(" SET DEFAULT")) {
      const match = normalized.match(/ALTER TABLE ([a-z_]+) ALTER COLUMN ([a-z_]+) SET DEFAULT/);
      if (match && this.state.tables[match[1]]?.columnDetails?.[match[2]]) {
        this.state.tables[match[1]].columnDetails[match[2]].column_default = "default";
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("UPDATE publisher_profiles SET domain_scope_key")) {
      const rows = this.state.tables.publisher_profiles?.rows || [];
      for (const row of rows) {
        if (!row.normalized_primary_domain) row.domain_scope_key = null;
        else if (row.scope_type === "global") row.domain_scope_key = `global:${row.normalized_primary_domain}`;
        else if (row.scope_type === "client_private" && row.owner_client_id != null) row.domain_scope_key = `client:${row.owner_client_id}:${row.normalized_primary_domain}`;
      }
      return { rows: [], rowCount: rows.length };
    }
    if (normalized.startsWith("UPDATE publisher_aliases SET language_code")) {
      const rows = this.state.tables.publisher_aliases?.rows || [];
      for (const row of rows) {
        if (row.language_code == null || String(row.language_code).trim() === "") row.language_code = "und";
      }
      return { rows: [], rowCount: rows.length };
    }
    if (normalized.startsWith("ALTER TABLE publisher_aliases ALTER COLUMN language_code")) {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("CREATE ") && normalized.includes(" INDEX IF NOT EXISTS ")) {
      const match = normalized.match(/INDEX IF NOT EXISTS ([a-z_]+)/);
      if (match) this.state.indexes.add(match[1]);
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("DO $$") && normalized.includes("ADD CONSTRAINT")) {
      const match = normalized.match(/ADD CONSTRAINT ([a-z_]+)/);
      if (match) {
        this.state.constraints.add(match[1]);
        const spec = migration.FOREIGN_KEYS[match[1]];
        if (spec) {
          const ref = String(spec.references).match(/^([a-z_]+)\(([^)]+)\)$/);
          this.state.foreignKeyDetails.set(match[1], {
            conname: match[1],
            table_name: spec.table,
            foreign_table_name: ref?.[1],
            columns: Array.isArray(spec.columns) ? spec.columns : [spec.column],
            foreign_columns: ref?.[2].split(",").map((column) => column.trim()) || [],
          });
        }
      }
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
  assert.ok(dryRun.plannedStatements.some((statement) => statement.includes("domain_scope_key")));
  assert.ok(dryRun.plannedStatements.some((statement) => statement.includes("article_appearances_article_client_fk")));
  assert.ok(dryRun.plannedStatements.some((statement) => statement.includes("language_code = 'und'")));
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

  const emptyMissingId = fullyMigratedState();
  emptyMissingId.tables.publisher_aliases.columns.delete("id");
  delete emptyMissingId.tables.publisher_aliases.columnDetails.id;
  emptyMissingId.tables.publisher_aliases.primaryKeys.delete("id");
  const emptyMissingIdClient = new MockPgClient(emptyMissingId);
  const emptyMissingIdReport = await migration.runPublisherCatalogMigration(emptyMissingIdClient, { dryRun: true, apply: false });
  assert.equal(emptyMissingIdReport.applySafe, true);
  assert.equal(emptyMissingIdReport.before.partialSchemaRepairs.some((repair) => repair.table === "publisher_aliases" && repair.column === "id"), true);
  await migration.runPublisherCatalogMigration(emptyMissingIdClient, { apply: true });
  assert.ok(emptyMissingIdClient.state.tables.publisher_aliases.columns.has("id"));
  assert.ok(emptyMissingIdClient.state.tables.publisher_aliases.primaryKeys.has("id"));

  const populatedMissingId = fullyMigratedState();
  populatedMissingId.tables.publisher_aliases.columns.delete("id");
  delete populatedMissingId.tables.publisher_aliases.columnDetails.id;
  populatedMissingId.tables.publisher_aliases.primaryKeys.delete("id");
  populatedMissingId.tables.publisher_aliases.rows.push({ publisher_profile_id: 1, alias: "A", normalized_alias: "a", language_code: "und", alias_type: "name" });
  const populatedMissingIdReport = await migration.runPublisherCatalogMigration(new MockPgClient(populatedMissingId), { dryRun: true, apply: false });
  assert.equal(populatedMissingIdReport.applySafe, false);
  assert.equal(populatedMissingIdReport.before.missingPrimaryKeys.some((risk) => risk.table === "publisher_aliases"), true);

  const idWithoutPrimaryKey = fullyMigratedState();
  idWithoutPrimaryKey.tables.publisher_channels.primaryKeys.delete("id");
  const idWithoutPrimaryKeyReport = await migration.runPublisherCatalogMigration(new MockPgClient(idWithoutPrimaryKey), { dryRun: true, apply: false });
  assert.equal(idWithoutPrimaryKeyReport.applySafe, true);
  assert.equal(idWithoutPrimaryKeyReport.before.partialSchemaRepairs.some((repair) => repair.table === "publisher_channels" && repair.statement.includes("ADD PRIMARY KEY")), true);

  const wrongIdType = fullyMigratedState();
  wrongIdType.tables.publisher_channels.columnDetails.id.data_type = "text";
  wrongIdType.tables.publisher_channels.columnDetails.id.udt_name = "text";
  const wrongIdTypeReport = await migration.runPublisherCatalogMigration(new MockPgClient(wrongIdType), { dryRun: true, apply: false });
  assert.equal(wrongIdTypeReport.applySafe, false);
  assert.equal(wrongIdTypeReport.before.incompatibleColumnDefinitions.some((item) => item.table === "publisher_channels" && item.column === "id"), true);

  const wrongJsonArrayType = fullyMigratedState();
  wrongJsonArrayType.tables.publisher_profiles.columnDetails.metadata.data_type = "text";
  wrongJsonArrayType.tables.publisher_profiles.columnDetails.metadata.udt_name = "text";
  wrongJsonArrayType.tables.publisher_profiles.columnDetails.language_codes.data_type = "text";
  wrongJsonArrayType.tables.publisher_profiles.columnDetails.language_codes.udt_name = "text";
  const wrongJsonArrayReport = await migration.runPublisherCatalogMigration(new MockPgClient(wrongJsonArrayType), { dryRun: true, apply: false });
  assert.equal(wrongJsonArrayReport.applySafe, false);
  assert.equal(wrongJsonArrayReport.before.incompatibleColumnDefinitions.some((item) => item.column === "metadata"), true);
  assert.equal(wrongJsonArrayReport.before.incompatibleColumnDefinitions.some((item) => item.column === "language_codes"), true);

  const nullableRequired = fullyMigratedState();
  nullableRequired.tables.publisher_profiles.columnDetails.name.is_nullable = "YES";
  nullableRequired.tables.publisher_profiles.rows.push({ id: 1, canonical_key: "global:x", scope_type: "global", owner_client_id: null, name: "X", slug: "x", status: "draft", verification_status: "unverified" });
  const nullableRequiredReport = await migration.runPublisherCatalogMigration(new MockPgClient(nullableRequired), { dryRun: true, apply: false });
  assert.equal(nullableRequiredReport.applySafe, false);
  assert.equal(nullableRequiredReport.before.partialSchemaRisks.some((risk) => risk.table === "publisher_profiles" && risk.column === "name"), true);

  const wrongForeignKey = fullyMigratedState();
  wrongForeignKey.foreignKeyDetails.set("article_appearances_article_client_fk", {
    conname: "article_appearances_article_client_fk",
    table_name: "article_appearances",
    foreign_table_name: "sources",
    columns: ["article_id", "client_id"],
    foreign_columns: ["id", "client_id"],
  });
  const wrongForeignKeyReport = await migration.runPublisherCatalogMigration(new MockPgClient(wrongForeignKey), { dryRun: true, apply: false });
  assert.equal(wrongForeignKeyReport.applySafe, false);
  assert.equal(wrongForeignKeyReport.before.malformedForeignKeys.some((item) => item.name === "article_appearances_article_client_fk"), true);

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

  const duplicateDomainState = fullyMigratedState();
  duplicateDomainState.tables.publisher_profiles.rows.push(
    { id: 1, canonical_key: "global:a", domain_scope_key: "global:dup.example", scope_type: "global", owner_client_id: null, normalized_primary_domain: "dup.example", status: "active", verification_status: "verified" },
    { id: 2, canonical_key: "global:b", domain_scope_key: "global:dup.example", scope_type: "global", owner_client_id: null, normalized_primary_domain: "dup.example", status: "active", verification_status: "verified" },
  );
  const duplicateDomainReport = await migration.runPublisherCatalogMigration(new MockPgClient(duplicateDomainState), { dryRun: true, apply: false });
  assert.equal(duplicateDomainReport.applySafe, false);
  assert.equal(duplicateDomainReport.before.incompatibleRows.duplicateDomainScopeKeys, 1);

  const aliasCollapseState = fullyMigratedState();
  aliasCollapseState.tables.publisher_aliases.rows.push(
    { id: 1, publisher_profile_id: 1, normalized_alias: "shafaq", language_code: null, alias_type: "name" },
    { id: 2, publisher_profile_id: 1, normalized_alias: "shafaq", language_code: "und", alias_type: "name" },
  );
  const aliasCollapseReport = await migration.runPublisherCatalogMigration(new MockPgClient(aliasCollapseState), { dryRun: true, apply: false });
  assert.equal(aliasCollapseReport.applySafe, false);
  assert.equal(aliasCollapseReport.before.incompatibleRows.aliasLanguageCollapseDuplicates, 1);

  const mismatchState = fullyMigratedState();
  mismatchState.tables.clients.rows.push({ id: 1, name: "Client One" }, { id: 2, name: "Client Two" });
  mismatchState.tables.articles.rows.push({ id: 1, client_id: 1 });
  mismatchState.tables.sources.rows.push({ id: 1, client_id: 2, publisher_channel_id: 99 });
  mismatchState.tables.publisher_profiles.rows.push({ id: 1, canonical_key: "client:2:private", domain_scope_key: "client:2:private.example", scope_type: "client_private", owner_client_id: 2, normalized_primary_domain: "private.example", status: "active", verification_status: "verified" });
  mismatchState.tables.publisher_channels.rows.push({ id: 1, publisher_profile_id: 1, channel_key: "publisher:1:website:https://private.example", normalized_url: "https://private.example", channel_type: "website", lifecycle_status: "active", validation_status: "valid" });
  mismatchState.tables.article_appearances.rows.push(
    { id: 1, client_id: 2, article_id: 1, publisher_profile_id: 1, publisher_channel_id: 1, source_id: null, appearance_key: "bad-article", appearance_type: "original" },
    { id: 2, client_id: 1, article_id: 1, publisher_profile_id: 1, publisher_channel_id: 1, source_id: 1, appearance_key: "bad-source", appearance_type: "original" },
    { id: 3, client_id: 1, article_id: 1, publisher_profile_id: 1, publisher_channel_id: 99, source_id: null, appearance_key: "bad-channel", appearance_type: "original" },
    { id: 4, client_id: 1, article_id: 1, publisher_profile_id: 1, publisher_channel_id: null, source_id: null, appearance_key: "bad-private", appearance_type: "original" },
  );
  const mismatchReport = await migration.runPublisherCatalogMigration(new MockPgClient(mismatchState), { dryRun: true, apply: false });
  assert.equal(mismatchReport.applySafe, false);
  assert.ok(mismatchReport.before.tenantMismatches.appearanceArticleClientMismatch >= 1);
  assert.ok(mismatchReport.before.tenantMismatches.appearanceSourceClientMismatch >= 1);
  assert.ok(mismatchReport.before.tenantMismatches.appearanceChannelPublisherMismatch >= 1);
  assert.ok(mismatchReport.before.tenantMismatches.appearancePrivatePublisherClientMismatch >= 1);
  assert.ok(mismatchReport.before.tenantMismatches.sourceChannelPublisherMismatch >= 1);

  const rollbackState = emptyBaseState();
  const rollbackClient = new MockPgClient(rollbackState, { failOn: "publisher_channels_normalized_url_unique" });
  const beforeRollback = cloneState(rollbackClient.state);
  await assert.rejects(() => migration.runPublisherCatalogMigration(rollbackClient, { apply: true }), /Simulated statement failure/);
  assert.deepEqual(rollbackClient.state, beforeRollback);
  assert.ok(rollbackClient.queries.includes("ROLLBACK"));

  console.log("publisher catalog migration tests passed");
})();
