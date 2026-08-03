require("dotenv/config");
const { Client } = require("pg");

const ORGANIZATION_TYPES = [
  "embassy",
  "diplomatic_mission",
  "government_agency",
  "international_organization",
  "media",
  "media_company",
  "newsroom",
  "tv_station",
  "ngo",
  "humanitarian_organization",
  "research_organization",
  "university",
  "commercial_intelligence",
  "corporate",
  "other",
];

const CLIENT_LIFECYCLE_STATUSES = ["setup", "active", "suspended", "archived"];
const WORKSPACE_STATUSES = ["draft", "ready", "active", "paused", "archived"];

const TABLE_COLUMNS = {
  clients: [
    ["slug", "text"],
    ["lifecycle_status", "text NOT NULL DEFAULT 'active'"],
    ["enrollment_key", "text"],
    ["enrollment_request_fingerprint", "text"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  client_settings: [
    ["represented_country_code", "text"],
    ["host_country_code", "text"],
    ["headquarters_country_code", "text"],
    ["default_timezone", "text"],
    ["default_languages", "text[]"],
    ["website_url", "text"],
    ["contact_name", "text"],
    ["contact_email", "text"],
  ],
  workspaces: [
    ["normalized_name", "text"],
    ["status", "text NOT NULL DEFAULT 'active'"],
    ["activated_at", "timestamp"],
    ["activated_by", "integer REFERENCES users(id)"],
  ],
};

const INDEXES = {
  clients_slug_unique: "CREATE UNIQUE INDEX IF NOT EXISTS clients_slug_unique ON clients (slug)",
  clients_enrollment_key_unique: "CREATE UNIQUE INDEX IF NOT EXISTS clients_enrollment_key_unique ON clients (enrollment_key)",
  workspaces_client_normalized_name_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspaces_client_normalized_name_unique ON workspaces (client_id, normalized_name)",
};

const CHECKS = {
  clients_lifecycle_status_ck: {
    table: "clients",
    expression: `lifecycle_status IN (${CLIENT_LIFECYCLE_STATUSES.map((item) => `'${item}'`).join(", ")})`,
  },
  clients_organization_type_ck: {
    table: "clients",
    expression: `organization_type IN (${ORGANIZATION_TYPES.map((item) => `'${item}'`).join(", ")})`,
  },
  workspaces_status_ck: {
    table: "workspaces",
    expression: `status IN (${WORKSPACE_STATUSES.map((item) => `'${item}'`).join(", ")})`,
  },
};

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`
Client enrollment schema migration

Dry run:
  npm run db:migrate:client-enrollment -- --dry-run

Apply:
  npm run db:migrate:client-enrollment -- --apply
`);
}

function constraintStatement(name, spec) {
  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
    ALTER TABLE ${spec.table} ADD CONSTRAINT ${name} CHECK (${spec.expression});
  END IF;
END $$`;
}

async function tableExists(client, tableName) {
  const result = await client.query(`
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = $1
  `, [tableName]);
  return result.rowCount > 0;
}

async function existingColumns(client, tableName) {
  const result = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
  `, [tableName]);
  return new Set(result.rows.map((row) => row.column_name));
}

async function hasColumns(client, tableName, columnNames) {
  if (!(await tableExists(client, tableName))) return false;
  const columns = await existingColumns(client, tableName);
  return columnNames.every((column) => columns.has(column));
}

async function existingIndexes(client) {
  const result = await client.query(`
    SELECT indexname
      FROM pg_indexes
     WHERE schemaname = 'public'
  `);
  return new Set(result.rows.map((row) => row.indexname));
}

async function existingConstraints(client) {
  const result = await client.query(`
    SELECT conname
      FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace
  `);
  return new Set(result.rows.map((row) => row.conname));
}

async function countRowsIfTableExists(client, table) {
  if (!(await tableExists(client, table))) return 0;
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return Number(result.rows[0]?.count || 0);
}

async function countIfColumnsExist(client, table, columnNames, whereSql) {
  if (!(await hasColumns(client, table, columnNames))) return 0;
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${whereSql}`);
  return Number(result.rows[0]?.count || 0);
}

async function duplicateClientSlugCount(client) {
  if (!(await hasColumns(client, "clients", ["slug"]))) return 0;
  const result = await client.query(`
    SELECT COALESCE(SUM(duplicate_count - 1), 0)::int AS count
      FROM (
        SELECT lower(trim(slug)) AS key, COUNT(*)::int AS duplicate_count
          FROM clients
         WHERE slug IS NOT NULL AND trim(slug) <> ''
         GROUP BY lower(trim(slug))
        HAVING COUNT(*) > 1
      ) duplicates
  `);
  return Number(result.rows[0]?.count || 0);
}

async function duplicateEnrollmentKeyCount(client) {
  if (!(await hasColumns(client, "clients", ["enrollment_key"]))) return 0;
  const result = await client.query(`
    SELECT COALESCE(SUM(duplicate_count - 1), 0)::int AS count
      FROM (
        SELECT enrollment_key, COUNT(*)::int AS duplicate_count
          FROM clients
         WHERE enrollment_key IS NOT NULL AND trim(enrollment_key) <> ''
         GROUP BY enrollment_key
        HAVING COUNT(*) > 1
      ) duplicates
  `);
  return Number(result.rows[0]?.count || 0);
}

async function duplicateWorkspaceNameCount(client) {
  if (!(await tableExists(client, "workspaces"))) return 0;
  const nameExpression = await hasColumns(client, "workspaces", ["normalized_name"])
    ? "COALESCE(NULLIF(trim(normalized_name), ''), lower(regexp_replace(trim(name), '\\\\s+', ' ', 'g')))"
    : "lower(regexp_replace(trim(name), '\\\\s+', ' ', 'g'))";
  const result = await client.query(`
    SELECT COALESCE(SUM(duplicate_count - 1), 0)::int AS count
      FROM (
        SELECT client_id, ${nameExpression} AS key, COUNT(*)::int AS duplicate_count
          FROM workspaces
         WHERE name IS NOT NULL AND trim(name) <> ''
         GROUP BY client_id, ${nameExpression}
        HAVING COUNT(*) > 1
      ) duplicates
  `);
  return Number(result.rows[0]?.count || 0);
}

async function incompatibleRows(client) {
  return {
    invalidClientLifecycleStatus: await countIfColumnsExist(client, "clients", ["lifecycle_status"], `lifecycle_status NOT IN (${CLIENT_LIFECYCLE_STATUSES.map((item) => `'${item}'`).join(", ")})`),
    invalidOrganizationType: await countIfColumnsExist(client, "clients", ["organization_type"], `organization_type NOT IN (${ORGANIZATION_TYPES.map((item) => `'${item}'`).join(", ")})`),
    invalidWorkspaceStatus: await countIfColumnsExist(client, "workspaces", ["status"], `status NOT IN (${WORKSPACE_STATUSES.map((item) => `'${item}'`).join(", ")})`),
    duplicateSlugs: await duplicateClientSlugCount(client),
    duplicateEnrollmentKeys: await duplicateEnrollmentKeyCount(client),
    duplicateClientWorkspaceNames: await duplicateWorkspaceNameCount(client),
  };
}

async function inspect(client) {
  const missingColumns = {};
  for (const [tableName, columns] of Object.entries(TABLE_COLUMNS)) {
    const exists = await tableExists(client, tableName);
    const existing = exists ? await existingColumns(client, tableName) : new Set();
    missingColumns[tableName] = columns
      .filter(([name]) => !existing.has(name))
      .map(([name, definition]) => ({ name, definition }));
  }

  const indexSet = await existingIndexes(client);
  const constraintSet = await existingConstraints(client);
  const incompatible = await incompatibleRows(client);
  const tableRowCounts = {};
  for (const table of Object.keys(TABLE_COLUMNS)) {
    tableRowCounts[table] = await countRowsIfTableExists(client, table);
  }

  return {
    missingColumns,
    missingIndexes: Object.keys(INDEXES).filter((name) => !indexSet.has(name)),
    missingUniqueConstraints: Object.keys(INDEXES).filter((name) => !indexSet.has(name) && !constraintSet.has(name)),
    missingCheckConstraints: Object.keys(CHECKS).filter((name) => !constraintSet.has(name)),
    incompatibleRows: incompatible,
    unsafePartialSchemaRisks: [],
    tableRowCounts,
    applySafe: Object.values(incompatible).every((count) => Number(count) === 0),
  };
}

function plannedStatements() {
  const alterColumns = Object.entries(TABLE_COLUMNS).flatMap(([table, columns]) =>
    columns.map(([name, definition]) => `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${definition}`),
  );
  return [
    ...alterColumns,
    "UPDATE workspaces SET normalized_name = lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) WHERE normalized_name IS NULL OR trim(normalized_name) = ''",
    "UPDATE clients SET lifecycle_status = CASE WHEN active IS FALSE THEN 'suspended' ELSE COALESCE(lifecycle_status, 'active') END WHERE lifecycle_status IS NULL",
    ...Object.values(INDEXES),
    ...Object.entries(CHECKS).map(([name, spec]) => constraintStatement(name, spec)),
  ];
}

async function runClientEnrollmentMigration(client, args) {
  const before = await inspect(client);
  const statements = plannedStatements();
  if (!args.apply) {
    return {
      migration: "client-enrollment",
      mode: "dry-run",
      writes: false,
      before,
      plannedStatements: statements,
      applySafe: before.applySafe,
      applyCommand: "npm run db:migrate:client-enrollment -- --apply",
    };
  }

  if (!before.applySafe) {
    const error = new Error("Client enrollment migration aborted before writes because incompatible rows exist.");
    error.report = {
      migration: "client-enrollment",
      mode: "apply",
      writes: false,
      applySafe: false,
      incompatibleRows: before.incompatibleRows,
      message: error.message,
    };
    throw error;
  }

  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nws360.client_enrollment_migration'))");
    for (const statement of statements) {
      await client.query(statement);
    }
    const afterChecks = await incompatibleRows(client);
    if (!Object.values(afterChecks).every((count) => Number(count) === 0)) {
      throw new Error(`Post-migration integrity check failed: ${JSON.stringify(afterChecks)}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return {
    migration: "client-enrollment",
    mode: "apply",
    writes: true,
    appliedStatements: statements.length,
    before,
    after: await inspect(client),
  };
}

async function main(argv = process.argv.slice(2), ClientImpl = Client) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new ClientImpl({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const report = await runClientEnrollmentMigration(client, args);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.report ? JSON.stringify(error.report, null, 2) : error.message || error);
    process.exit(1);
  });
}

module.exports = {
  CHECKS,
  CLIENT_LIFECYCLE_STATUSES,
  INDEXES,
  ORGANIZATION_TYPES,
  TABLE_COLUMNS,
  WORKSPACE_STATUSES,
  countIfColumnsExist,
  countRowsIfTableExists,
  duplicateClientSlugCount,
  duplicateEnrollmentKeyCount,
  duplicateWorkspaceNameCount,
  existingColumns,
  existingConstraints,
  existingIndexes,
  hasColumns,
  incompatibleRows,
  inspect,
  main,
  parseArgs,
  plannedStatements,
  runClientEnrollmentMigration,
  tableExists,
};
