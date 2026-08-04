const assert = require("node:assert/strict");
const migration = require("./migrate-ingestion-observability.cjs");

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.queries = [];
    this.inTransaction = false;
    this.tables = options.tables || new Map([
      ["source_fetch_logs", {
        count: options.rowCount ?? 3,
        columns: new Map([
          ["id", { column_name: "id", data_type: "integer", udt_name: "int4", is_nullable: "NO", column_default: "nextval('source_fetch_logs_id_seq'::regclass)" }],
          ["source_id", { column_name: "source_id", data_type: "integer", udt_name: "int4", is_nullable: "NO", column_default: null }],
          ["status", { column_name: "status", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null }],
          ["articles_found", { column_name: "articles_found", data_type: "integer", udt_name: "int4", is_nullable: "YES", column_default: "0" }],
        ]),
        historicalRows: [
          { id: 1, status: "success", articles_found: 0, metrics: null },
          { id: 2, status: "error", articles_found: 0, metrics: null },
          { id: 3, status: "success", articles_found: 2, metrics: null },
        ],
      }],
    ]);
    if (!options.tables && options.withMetrics) {
      this.tables.get("source_fetch_logs").columns.set("metrics", {
        column_name: "metrics",
        data_type: "jsonb",
        udt_name: "jsonb",
        is_nullable: "YES",
        column_default: null,
      });
    }
    if (!options.tables && options.badMetrics) {
      this.tables.get("source_fetch_logs").columns.set("metrics", {
        column_name: "metrics",
        data_type: "text",
        udt_name: "text",
        is_nullable: "NO",
        column_default: "'{}'::text",
      });
    }
    if (!options.tables && options.missingTable) this.tables.delete("source_fetch_logs");
  }

  async query(text, params = []) {
    const sql = String(text).replace(/\s+/g, " ").trim();
    this.queries.push(sql);
    if (sql === "BEGIN") {
      this.inTransaction = true;
      return { rows: [] };
    }
    if (sql === "COMMIT" || sql === "ROLLBACK") {
      this.inTransaction = false;
      return { rows: [] };
    }
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [{ pg_advisory_xact_lock: null }] };
    if (sql.includes("to_regclass")) {
      const table = String(params[0] || "").replace(/^public\./, "");
      return { rows: [{ name: this.tables.has(table) ? `public.${table}` : null }] };
    }
    if (sql.includes("information_schema.columns")) {
      const table = String(params[0] || "");
      const column = String(params[1] || "");
      const details = this.tables.get(table)?.columns.get(column);
      return { rows: details ? [details] : [] };
    }
    if (/^SELECT count\(\*\)::int AS count FROM source_fetch_logs$/i.test(sql)) {
      return { rows: [{ count: this.tables.get("source_fetch_logs")?.count ?? 0 }] };
    }
    if (sql === migration.ADD_METRICS_COLUMN_SQL) {
      if (this.options.failOnAlter) throw new Error("simulated_alter_failure");
      const table = this.tables.get("source_fetch_logs");
      table.columns.set("metrics", {
        column_name: "metrics",
        data_type: "jsonb",
        udt_name: "jsonb",
        is_nullable: "YES",
        column_default: null,
      });
      for (const row of table.historicalRows) row.metrics = null;
      return { rows: [] };
    }
    return { rows: [] };
  }
}

class ConcurrentFakeClient extends FakeClient {
  constructor(shared) {
    super({ tables: shared.tables });
    this.shared = shared;
  }

  async query(text, params = []) {
    const sql = String(text).replace(/\s+/g, " ").trim();
    if (sql.includes("pg_advisory_xact_lock")) {
      this.queries.push(sql);
      while (this.shared.locked) {
        await this.shared.lockReleased;
      }
      this.shared.locked = true;
      this.shared.lockReleased = new Promise((resolve) => {
        this.shared.release = resolve;
      });
      return { rows: [{ pg_advisory_xact_lock: null }] };
    }
    const result = await super.query(text, params);
    if ((sql === "COMMIT" || sql === "ROLLBACK") && this.shared.locked) {
      this.shared.locked = false;
      const release = this.shared.release;
      this.shared.release = null;
      if (release) release();
    }
    return result;
  }
}

(async () => {
  const dryRunClient = new FakeClient();
  const dryRun = await migration.runIngestionObservabilityMigration(dryRunClient, { apply: false });
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.writes, false);
  assert.equal(dryRun.applySafe, true);
  assert.deepEqual(dryRun.missingColumns, ["metrics"]);
  assert.deepEqual(dryRun.plannedSql, [migration.ADD_METRICS_COLUMN_SQL]);
  assert.equal(dryRun.tableRowCounts.source_fetch_logs, 3);
  assert.equal(dryRunClient.queries.includes("BEGIN"), false);

  const applyClient = new FakeClient();
  const apply = await migration.runIngestionObservabilityMigration(applyClient, { apply: true });
  assert.equal(apply.mode, "apply");
  assert.equal(apply.writes, true);
  assert.equal(apply.aborted, undefined);
  assert.ok(apply.statementsExecuted.includes("BEGIN"));
  assert.ok(apply.statementsExecuted.includes(migration.ADD_METRICS_COLUMN_SQL));
  assert.ok(apply.statementsExecuted.includes("COMMIT"));
  assert.equal(apply.after.metricsColumn.dataType, "jsonb");
  assert.equal(apply.lockedInspection.missingColumns.includes("metrics"), true);
  assert.equal(applyClient.tables.get("source_fetch_logs").historicalRows.every((row) => row.metrics === null), true);

  const idempotentClient = new FakeClient({ withMetrics: true });
  const idempotent = await migration.runIngestionObservabilityMigration(idempotentClient, { apply: true });
  assert.equal(idempotent.writes, false);
  assert.equal(idempotent.statementsExecuted.includes(migration.ADD_METRICS_COLUMN_SQL), false);

  const badClient = new FakeClient({ badMetrics: true });
  const unsafe = await migration.runIngestionObservabilityMigration(badClient, { apply: false });
  assert.equal(unsafe.applySafe, false);
  assert.deepEqual(unsafe.compatibilityIssues.sort(), ["metrics_has_default", "metrics_not_jsonb", "metrics_not_nullable"].sort());

  const missingTable = await migration.runIngestionObservabilityMigration(new FakeClient({ missingTable: true }), { apply: false });
  assert.equal(missingTable.applySafe, false);
  assert.deepEqual(missingTable.compatibilityIssues, ["source_fetch_logs_missing"]);

  const shared = {
    tables: new FakeClient().tables,
    locked: false,
    lockReleased: Promise.resolve(),
    release: null,
  };
  const concurrentA = new ConcurrentFakeClient(shared);
  const concurrentB = new ConcurrentFakeClient(shared);
  const concurrentResults = await Promise.all([
    migration.runIngestionObservabilityMigration(concurrentA, { apply: true }),
    migration.runIngestionObservabilityMigration(concurrentB, { apply: true }),
  ]);
  assert.equal(concurrentResults.every((result) => !result.aborted), true);
  assert.deepEqual(concurrentResults.map((result) => result.writes).sort(), [false, true]);
  const totalAlterStatements = [...concurrentA.queries, ...concurrentB.queries]
    .filter((query) => query === migration.ADD_METRICS_COLUMN_SQL)
    .length;
  assert.equal(totalAlterStatements, 1);
  assert.equal(shared.tables.get("source_fetch_logs").columns.get("metrics").udt_name, "jsonb");

  assert.equal(migration.ROLLBACK_SQL, "ALTER TABLE source_fetch_logs DROP COLUMN metrics");
  console.log("ingestion observability migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
