const assert = require("node:assert/strict");
const migration = require("./migrate-ingestion-observability.cjs");

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.queries = [];
    this.inTransaction = false;
    this.tables = new Map([
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
    if (options.withMetrics) {
      this.tables.get("source_fetch_logs").columns.set("metrics", {
        column_name: "metrics",
        data_type: "jsonb",
        udt_name: "jsonb",
        is_nullable: "YES",
        column_default: null,
      });
    }
    if (options.badMetrics) {
      this.tables.get("source_fetch_logs").columns.set("metrics", {
        column_name: "metrics",
        data_type: "text",
        udt_name: "text",
        is_nullable: "NO",
        column_default: "'{}'::text",
      });
    }
    if (options.missingTable) this.tables.delete("source_fetch_logs");
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

  assert.equal(migration.ROLLBACK_SQL, "ALTER TABLE source_fetch_logs DROP COLUMN metrics");
  console.log("ingestion observability migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
