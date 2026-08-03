require("dotenv/config");
const { Client } = require("pg");

const ASSIGNMENT_TABLES = [
  "workspace_source_assignments",
  "workspace_source_assignment_tests",
];

const SOURCE_ASSIGNMENT_COLUMNS = {
  sources: [
    ["source_identity_key", "text"],
  ],
  client_publisher_selections: [],
  workspace_source_assignments: [
    ["id", "serial PRIMARY KEY"],
    ["client_id", "integer NOT NULL"],
    ["workspace_id", "integer NOT NULL"],
    ["client_publisher_selection_id", "integer NOT NULL"],
    ["publisher_profile_id", "integer NOT NULL"],
    ["publisher_channel_id", "integer NOT NULL"],
    ["source_id", "integer NOT NULL"],
    ["assignment_key", "text NOT NULL"],
    ["status", "text NOT NULL DEFAULT 'draft'"],
    ["enabled", "boolean NOT NULL DEFAULT false"],
    ["priority", "text NOT NULL DEFAULT 'standard'"],
    ["source_role", "text NOT NULL DEFAULT 'primary'"],
    ["relevance_profile_version", "integer NOT NULL DEFAULT 1"],
    ["relevance_policy", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["minimum_direct_match_rate", "integer NOT NULL DEFAULT 50"],
    ["maximum_noise_rate", "integer NOT NULL DEFAULT 40"],
    ["latest_test_run_id", "integer"],
    ["test_status", "text NOT NULL DEFAULT 'untested'"],
    ["tested_at", "timestamp"],
    ["tested_by", "integer"],
    ["warning_approved_at", "timestamp"],
    ["warning_approved_by", "integer"],
    ["warning_approval_reason", "text"],
    ["notes", "text"],
    ["created_by", "integer"],
    ["created_at", "timestamp DEFAULT now()"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  workspace_source_assignment_tests: [
    ["id", "serial PRIMARY KEY"],
    ["client_id", "integer NOT NULL"],
    ["workspace_id", "integer NOT NULL"],
    ["assignment_id", "integer NOT NULL"],
    ["source_id", "integer NOT NULL"],
    ["publisher_channel_id", "integer NOT NULL"],
    ["test_type", "text NOT NULL"],
    ["status", "text NOT NULL"],
    ["relevance_profile_version", "integer NOT NULL DEFAULT 1"],
    ["connectivity_result", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["sample_count", "integer NOT NULL DEFAULT 0"],
    ["direct_scope_match_count", "integer NOT NULL DEFAULT 0"],
    ["material_scope_impact_count", "integer NOT NULL DEFAULT 0"],
    ["contextual_count", "integer NOT NULL DEFAULT 0"],
    ["not_relevant_count", "integer NOT NULL DEFAULT 0"],
    ["needs_review_count", "integer NOT NULL DEFAULT 0"],
    ["direct_match_rate", "integer NOT NULL DEFAULT 0"],
    ["relevant_rate", "integer NOT NULL DEFAULT 0"],
    ["noise_rate", "integer NOT NULL DEFAULT 0"],
    ["language_counts", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["category_counts", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["safe_sample_results", "jsonb NOT NULL DEFAULT '[]'::jsonb"],
    ["error_code", "text"],
    ["error_message", "text"],
    ["started_at", "timestamp DEFAULT now()"],
    ["completed_at", "timestamp"],
    ["tested_by", "integer"],
    ["created_at", "timestamp DEFAULT now()"],
  ],
};

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS workspace_source_assignments (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_publisher_selection_id integer NOT NULL REFERENCES client_publisher_selections(id),
  publisher_profile_id integer NOT NULL REFERENCES publisher_profiles(id),
  publisher_channel_id integer NOT NULL REFERENCES publisher_channels(id),
  source_id integer NOT NULL REFERENCES sources(id),
  assignment_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  enabled boolean NOT NULL DEFAULT false,
  priority text NOT NULL DEFAULT 'standard',
  source_role text NOT NULL DEFAULT 'primary',
  relevance_profile_version integer NOT NULL DEFAULT 1,
  relevance_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  minimum_direct_match_rate integer NOT NULL DEFAULT 50,
  maximum_noise_rate integer NOT NULL DEFAULT 40,
  latest_test_run_id integer,
  test_status text NOT NULL DEFAULT 'untested',
  tested_at timestamp,
  tested_by integer REFERENCES users(id),
  warning_approved_at timestamp,
  warning_approved_by integer REFERENCES users(id),
  warning_approval_reason text,
  notes text,
  created_by integer REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS workspace_source_assignment_tests (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assignment_id integer NOT NULL REFERENCES workspace_source_assignments(id) ON DELETE CASCADE,
  source_id integer NOT NULL REFERENCES sources(id),
  publisher_channel_id integer NOT NULL REFERENCES publisher_channels(id),
  test_type text NOT NULL,
  status text NOT NULL,
  relevance_profile_version integer NOT NULL DEFAULT 1,
  connectivity_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_count integer NOT NULL DEFAULT 0,
  direct_scope_match_count integer NOT NULL DEFAULT 0,
  material_scope_impact_count integer NOT NULL DEFAULT 0,
  contextual_count integer NOT NULL DEFAULT 0,
  not_relevant_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  direct_match_rate integer NOT NULL DEFAULT 0,
  relevant_rate integer NOT NULL DEFAULT 0,
  noise_rate integer NOT NULL DEFAULT 0,
  language_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  category_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_sample_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  error_message text,
  started_at timestamp DEFAULT now(),
  completed_at timestamp,
  tested_by integer REFERENCES users(id),
  created_at timestamp DEFAULT now()
)`,
];

const INDEXES = {
  client_publisher_selections_id_client_unique: "CREATE UNIQUE INDEX IF NOT EXISTS client_publisher_selections_id_client_unique ON client_publisher_selections (id, client_id)",
  sources_client_identity_unique: "CREATE UNIQUE INDEX IF NOT EXISTS sources_client_identity_unique ON sources (client_id, source_identity_key)",
  workspace_source_assignments_key_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_key_unique ON workspace_source_assignments (assignment_key)",
  workspace_source_assignments_workspace_source_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_workspace_source_unique ON workspace_source_assignments (workspace_id, source_id)",
  workspace_source_assignments_workspace_channel_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_workspace_channel_unique ON workspace_source_assignments (workspace_id, publisher_channel_id)",
  workspace_source_assignments_client_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_client_idx ON workspace_source_assignments (client_id, status)",
  workspace_source_assignments_workspace_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_workspace_idx ON workspace_source_assignments (workspace_id, status)",
  workspace_source_assignments_source_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_source_idx ON workspace_source_assignments (source_id, status)",
  workspace_source_assignments_channel_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_channel_idx ON workspace_source_assignments (publisher_channel_id)",
  workspace_source_assignment_tests_assignment_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_assignment_idx ON workspace_source_assignment_tests (assignment_id, created_at)",
  workspace_source_assignment_tests_workspace_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_workspace_idx ON workspace_source_assignment_tests (workspace_id, status)",
  workspace_source_assignment_tests_client_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_client_idx ON workspace_source_assignment_tests (client_id, test_type)",
};

const CONSTRAINTS = {
  workspace_source_assignments_workspace_client_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_workspace_client_fk FOREIGN KEY (workspace_id, client_id) REFERENCES workspaces(id, client_id) ON DELETE CASCADE",
  workspace_source_assignments_source_client_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_source_client_fk FOREIGN KEY (source_id, client_id) REFERENCES sources(id, client_id)",
  workspace_source_assignments_channel_publisher_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_channel_publisher_fk FOREIGN KEY (publisher_channel_id, publisher_profile_id) REFERENCES publisher_channels(id, publisher_profile_id)",
  workspace_source_assignments_selection_client_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_selection_client_fk FOREIGN KEY (client_publisher_selection_id, client_id) REFERENCES client_publisher_selections(id, client_id)",
  workspace_source_assignment_tests_workspace_client_fk: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_workspace_client_fk FOREIGN KEY (workspace_id, client_id) REFERENCES workspaces(id, client_id) ON DELETE CASCADE",
  workspace_source_assignment_tests_source_client_fk: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_source_client_fk FOREIGN KEY (source_id, client_id) REFERENCES sources(id, client_id)",
  workspace_source_assignments_status_ck: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_status_ck CHECK (status IN ('draft','testing','ready','active','paused','archived'))",
  workspace_source_assignments_test_status_ck: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_test_status_ck CHECK (test_status IN ('untested','passed','warning','failed','stale'))",
  workspace_source_assignments_priority_ck: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_priority_ck CHECK (priority IN ('critical','high','standard','low'))",
  workspace_source_assignments_source_role_ck: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_source_role_ck CHECK (source_role IN ('primary','official','regional','contextual','specialist','social','collector','other'))",
  workspace_source_assignments_rate_ck: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_rate_ck CHECK (minimum_direct_match_rate BETWEEN 0 AND 100 AND maximum_noise_rate BETWEEN 0 AND 100)",
  workspace_source_assignments_enabled_status_ck: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_enabled_status_ck CHECK ((status = 'active' AND enabled IS TRUE) OR (status <> 'active' AND enabled IS FALSE))",
  workspace_source_assignment_tests_type_ck: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_type_ck CHECK (test_type IN ('connectivity','relevance','full'))",
  workspace_source_assignment_tests_status_ck: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_status_ck CHECK (status IN ('running','passed','warning','failed'))",
  workspace_source_assignment_tests_counts_ck: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_counts_ck CHECK (sample_count >= 0 AND direct_scope_match_count >= 0 AND material_scope_impact_count >= 0 AND contextual_count >= 0 AND not_relevant_count >= 0 AND needs_review_count >= 0)",
  workspace_source_assignment_tests_rates_ck: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_rates_ck CHECK (direct_match_rate BETWEEN 0 AND 100 AND relevant_rate BETWEEN 0 AND 100 AND noise_rate BETWEEN 0 AND 100)",
};

function addConstraintIfMissingSql(name, sql) {
  return `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN ${sql}; END IF; END $$`;
}

function allPlannedSql() {
  const existingTableColumnSql = [
    ...Object.entries(SOURCE_ASSIGNMENT_COLUMNS)
      .filter(([table]) => !ASSIGNMENT_TABLES.includes(table))
      .flatMap(([table, columns]) =>
        columns
          .filter(([name]) => name !== "id")
          .map(([name, definition]) => `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${definition}`),
      ),
  ];
  const assignmentTableRepairSql = [
    ...Object.entries(SOURCE_ASSIGNMENT_COLUMNS)
      .filter(([table]) => ASSIGNMENT_TABLES.includes(table))
      .flatMap(([table, columns]) =>
        columns
          .filter(([name]) => name !== "id")
          .map(([name, definition]) => `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${definition}`),
      ),
  ];
  return [
    ...existingTableColumnSql,
    ...CREATE_TABLES,
    ...assignmentTableRepairSql,
    ...Object.values(INDEXES),
    ...Object.entries(CONSTRAINTS).map(([name, stmt]) => addConstraintIfMissingSql(name, stmt)),
  ];
}

async function tableExists(client, table) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${table}`]);
  return Boolean(result.rows[0]?.name);
}

async function tableCount(client, table) {
  if (!(await tableExists(client, table))) return null;
  const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
  return result.rows[0].count;
}

async function columnsFor(client, table) {
  if (!(await tableExists(client, table))) return new Set();
  const result = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function existingIndexes(client) {
  const result = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'");
  return new Set(result.rows.map((row) => row.indexname));
}

async function existingConstraints(client) {
  const result = await client.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace");
  return new Set(result.rows.map((row) => row.conname));
}

async function countQuery(client, sql) {
  try {
    const result = await client.query(sql);
    return Number(result.rows[0]?.count || 0);
  } catch {
    return null;
  }
}

async function inspect(client) {
  const tableRowCounts = {};
  const tables = ["users", "clients", "workspaces", "workspace_relevance_profiles", "publisher_profiles", "publisher_channels", "client_publisher_selections", "sources", "articles", "article_appearances", "platform_reset_audit", ...ASSIGNMENT_TABLES];
  for (const table of tables) tableRowCounts[table] = await tableCount(client, table);

  const missingColumns = {};
  for (const [table, definitions] of Object.entries(SOURCE_ASSIGNMENT_COLUMNS)) {
    const existing = await columnsFor(client, table);
    missingColumns[table] = definitions.filter(([name]) => !existing.has(name)).map(([name, definition]) => ({ name, definition }));
  }

  const indexes = await existingIndexes(client);
  const constraints = await existingConstraints(client);
  const missingIndexes = Object.keys(INDEXES).filter((name) => !indexes.has(name));
  const missingConstraints = Object.keys(CONSTRAINTS).filter((name) => !constraints.has(name));

  const incompatibleRows = {
    invalidAssignmentStatus: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE status NOT IN ('draft','testing','ready','active','paused','archived')"),
    invalidAssignmentTestStatus: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE test_status NOT IN ('untested','passed','warning','failed','stale')"),
    invalidAssignmentEnabledStatus: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE NOT ((status = 'active' AND enabled IS TRUE) OR (status <> 'active' AND enabled IS FALSE))"),
    invalidRunType: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignment_tests WHERE test_type NOT IN ('connectivity','relevance','full')"),
    invalidRunStatus: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignment_tests WHERE status NOT IN ('running','passed','warning','failed')"),
    workspaceClientMismatch: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN workspaces w ON w.id=a.workspace_id AND w.client_id=a.client_id WHERE w.id IS NULL"),
    sourceClientMismatch: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN sources s ON s.id=a.source_id AND s.client_id=a.client_id WHERE s.id IS NULL"),
    sourceChannelMismatch: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignments a JOIN sources s ON s.id=a.source_id WHERE s.publisher_channel_id IS DISTINCT FROM a.publisher_channel_id"),
    selectionPublisherMismatch: await countQuery(client, "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN client_publisher_selections cps ON cps.id=a.client_publisher_selection_id AND cps.client_id=a.client_id AND cps.publisher_profile_id=a.publisher_profile_id WHERE cps.id IS NULL"),
    duplicateWorkspaceSourceAssignments: await countQuery(client, "SELECT count(*)::int AS count FROM (SELECT workspace_id, source_id FROM workspace_source_assignments GROUP BY 1,2 HAVING count(*) > 1) d"),
    duplicateWorkspaceChannelAssignments: await countQuery(client, "SELECT count(*)::int AS count FROM (SELECT workspace_id, publisher_channel_id FROM workspace_source_assignments GROUP BY 1,2 HAVING count(*) > 1) d"),
    duplicateOperationalSourceIdentities: await countQuery(client, "SELECT count(*)::int AS count FROM (SELECT client_id, source_identity_key FROM sources WHERE source_identity_key IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) d"),
  };

  const unsafePartialSchemaRisks = [];
  const partialSchemaRepairs = [];
  for (const table of ASSIGNMENT_TABLES) {
    const exists = await tableExists(client, table);
    if (!exists) continue;
    const rowCount = tableRowCounts[table] || 0;
    const missing = missingColumns[table] || [];
    if (missing.length && rowCount > 0) unsafePartialSchemaRisks.push({ table, rowCount, missingColumns: missing.map((item) => item.name) });
    if (missing.length && rowCount === 0) partialSchemaRepairs.push({ table, missingColumns: missing.map((item) => item.name) });
  }

  const nonZeroIncompatibilities = Object.entries(incompatibleRows)
    .filter(([, value]) => Number(value || 0) > 0)
    .map(([key, value]) => ({ key, value }));

  return {
    missingTables: ASSIGNMENT_TABLES.filter((table) => tableRowCounts[table] === null),
    missingColumns,
    missingIndexes,
    missingUniqueConstraints: missingIndexes.filter((name) => name.includes("unique")),
    missingForeignKeys: missingConstraints.filter((name) => name.endsWith("_fk")),
    missingCheckConstraints: missingConstraints.filter((name) => name.endsWith("_ck")),
    incompatibleRows,
    nonZeroIncompatibilities,
    unsafePartialSchemaRisks,
    partialSchemaRepairs,
    tableRowCounts,
  };
}

async function run({ apply = false, ClientImpl = Client } = {}) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new ClientImpl({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const before = await inspect(client);
    const applySafe = before.nonZeroIncompatibilities.length === 0 && before.unsafePartialSchemaRisks.length === 0;
    const plannedSql = allPlannedSql();
    if (apply && !applySafe) {
      return { migration: "workspace-source-assignments", mode: "apply", writes: false, applySafe, before, plannedSql, error: "apply_not_safe" };
    }
    if (!apply) {
      return { migration: "workspace-source-assignments", mode: "dry-run", writes: false, applySafe, ...before, plannedSql, plannedStatementCount: plannedSql.length, futureApplyCommand: "npm run db:migrate:workspace-source-assignments -- --apply" };
    }
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('nws360.workspace_source_assignments.migration'))");
      for (const statement of plannedSql) await client.query(statement);
      const after = await inspect(client);
      if (after.nonZeroIncompatibilities.length > 0 || after.unsafePartialSchemaRisks.length > 0) {
        throw new Error("post_migration_integrity_failed");
      }
      await client.query("COMMIT");
      return { migration: "workspace-source-assignments", mode: "apply", writes: true, appliedStatements: plannedSql.length, before, after, applySafe: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const apply = process.argv.includes("--apply");
  run({ apply }).then((report) => {
    process.stdout.write(JSON.stringify(report, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ migration: "workspace-source-assignments", error: error.message, stack: error.stack }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  ASSIGNMENT_TABLES,
  SOURCE_ASSIGNMENT_COLUMNS,
  INDEXES,
  CONSTRAINTS,
  allPlannedSql,
  inspect,
  run,
};
