require("dotenv/config");
const { Client } = require("pg");

const MIGRATION = "ingestion_drop_observability";
const SOURCE_FETCH_LOGS_TABLE = "source_fetch_logs";
const METRICS_COLUMN = "metrics";
const ADD_METRICS_COLUMN_SQL = "ALTER TABLE source_fetch_logs ADD COLUMN metrics jsonb";
const ROLLBACK_SQL = "ALTER TABLE source_fetch_logs DROP COLUMN metrics";
const ADVISORY_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('nws360_ingestion_drop_observability'))";

async function tableExists(client, tableName) {
  const result = await client.query(
    "SELECT to_regclass($1) AS name",
    [`public.${tableName}`],
  );
  return Boolean(result.rows[0]?.name);
}

async function columnDetails(client, tableName, columnName) {
  const result = await client.query(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
  `, [tableName, columnName]);
  return result.rows[0] || null;
}

async function tableCount(client, tableName) {
  if (!await tableExists(client, tableName)) return null;
  const result = await client.query(`SELECT count(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count || 0);
}

function validateMetricsColumn(details) {
  if (!details) return [];
  const issues = [];
  if (details.udt_name !== "jsonb" && details.data_type !== "jsonb") issues.push("metrics_not_jsonb");
  if (details.is_nullable !== "YES") issues.push("metrics_not_nullable");
  if (details.column_default !== null) issues.push("metrics_has_default");
  return issues;
}

async function inspectIngestionObservability(client) {
  const sourceFetchLogsExists = await tableExists(client, SOURCE_FETCH_LOGS_TABLE);
  const metrics = sourceFetchLogsExists
    ? await columnDetails(client, SOURCE_FETCH_LOGS_TABLE, METRICS_COLUMN)
    : null;
  const rowCount = await tableCount(client, SOURCE_FETCH_LOGS_TABLE);
  const compatibilityIssues = sourceFetchLogsExists
    ? validateMetricsColumn(metrics)
    : ["source_fetch_logs_missing"];
  const missingColumns = sourceFetchLogsExists && !metrics ? [METRICS_COLUMN] : [];
  const plannedSql = missingColumns.length > 0 ? [ADD_METRICS_COLUMN_SQL] : [];

  return {
    migration: MIGRATION,
    sourceFetchLogsExists,
    metricsColumn: metrics ? {
      columnName: metrics.column_name,
      dataType: metrics.data_type,
      udtName: metrics.udt_name,
      nullable: metrics.is_nullable === "YES",
      default: metrics.column_default,
    } : null,
    missingColumns,
    compatibilityIssues,
    tableRowCounts: {
      source_fetch_logs: rowCount,
    },
    plannedSql,
    rollbackSql: ROLLBACK_SQL,
    existingRowsPreserved: true,
    historicalMetricsDefault: null,
  };
}

async function runIngestionObservabilityMigration(client, options = {}) {
  const apply = Boolean(options.apply);
  const dryRun = !apply;
  const before = await inspectIngestionObservability(client);
  const applySafe = before.sourceFetchLogsExists && before.compatibilityIssues.length === 0;

  const output = {
    ...before,
    mode: apply ? "apply" : "dry-run",
    writes: false,
    applySafe,
    advisoryLockSql: apply ? ADVISORY_LOCK_SQL : null,
    statementsExecuted: [],
    futureApplyCommand: "npm run db:migrate:ingestion-observability -- --apply",
  };

  if (dryRun) {
    return output;
  }

  if (!applySafe) {
    return {
      ...output,
      aborted: true,
      abortReason: "migration_not_apply_safe",
    };
  }

  await client.query("BEGIN");
  output.statementsExecuted.push("BEGIN");
  try {
    await client.query(ADVISORY_LOCK_SQL);
    output.statementsExecuted.push(ADVISORY_LOCK_SQL);
    const locked = await inspectIngestionObservability(client);
    output.lockedInspection = locked;
    if (!locked.sourceFetchLogsExists || locked.compatibilityIssues.length > 0) {
      throw new Error(`locked_schema_not_apply_safe:${locked.compatibilityIssues.join(",") || "source_fetch_logs_missing"}`);
    }
    if (locked.missingColumns.includes(METRICS_COLUMN)) {
      await client.query(ADD_METRICS_COLUMN_SQL);
      output.statementsExecuted.push(ADD_METRICS_COLUMN_SQL);
      output.writes = true;
    }
    const after = await inspectIngestionObservability(client);
    if (after.compatibilityIssues.length > 0 || after.missingColumns.length > 0) {
      throw new Error(`post_migration_integrity_failed:${after.compatibilityIssues.concat(after.missingColumns).join(",")}`);
    }
    await client.query("COMMIT");
    output.statementsExecuted.push("COMMIT");
    output.after = after;
    return output;
  } catch (error) {
    await client.query("ROLLBACK");
    output.statementsExecuted.push("ROLLBACK");
    return {
      ...output,
      aborted: true,
      abortReason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await runIngestionObservabilityMigration(client, { apply });
    console.log(JSON.stringify(result, null, 2));
    if (result.aborted) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

module.exports = {
  MIGRATION,
  SOURCE_FETCH_LOGS_TABLE,
  METRICS_COLUMN,
  ADD_METRICS_COLUMN_SQL,
  ROLLBACK_SQL,
  ADVISORY_LOCK_SQL,
  inspectIngestionObservability,
  runIngestionObservabilityMigration,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
