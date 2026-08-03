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
    ["source_validation_identity", "text"],
    ["assignment_config_identity", "text"],
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
    ["source_validation_identity", "text"],
    ["assignment_config_identity", "text"],
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
  source_validation_identity text,
  assignment_config_identity text,
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
  source_validation_identity text,
  assignment_config_identity text,
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
  client_publisher_selections_id_client_publisher_unique: "CREATE UNIQUE INDEX IF NOT EXISTS client_publisher_selections_id_client_publisher_unique ON client_publisher_selections (id, client_id, publisher_profile_id)",
  sources_id_client_channel_unique: "CREATE UNIQUE INDEX IF NOT EXISTS sources_id_client_channel_unique ON sources (id, client_id, publisher_channel_id)",
  sources_client_identity_unique: "CREATE UNIQUE INDEX IF NOT EXISTS sources_client_identity_unique ON sources (client_id, source_identity_key)",
  workspace_source_assignments_key_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_key_unique ON workspace_source_assignments (assignment_key)",
  workspace_source_assignments_workspace_source_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_workspace_source_unique ON workspace_source_assignments (workspace_id, source_id)",
  workspace_source_assignments_workspace_channel_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_workspace_channel_unique ON workspace_source_assignments (workspace_id, publisher_channel_id)",
  workspace_source_assignments_id_client_workspace_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_id_client_workspace_unique ON workspace_source_assignments (id, client_id, workspace_id)",
  workspace_source_assignments_id_source_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_id_source_unique ON workspace_source_assignments (id, source_id)",
  workspace_source_assignments_id_channel_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_id_channel_unique ON workspace_source_assignments (id, publisher_channel_id)",
  workspace_source_assignments_client_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_client_idx ON workspace_source_assignments (client_id, status)",
  workspace_source_assignments_workspace_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_workspace_idx ON workspace_source_assignments (workspace_id, status)",
  workspace_source_assignments_source_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_source_idx ON workspace_source_assignments (source_id, status)",
  workspace_source_assignments_channel_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_channel_idx ON workspace_source_assignments (publisher_channel_id)",
  workspace_source_assignment_tests_assignment_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_assignment_idx ON workspace_source_assignment_tests (assignment_id, created_at)",
  workspace_source_assignment_tests_workspace_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_workspace_idx ON workspace_source_assignment_tests (workspace_id, status)",
  workspace_source_assignment_tests_client_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_client_idx ON workspace_source_assignment_tests (client_id, test_type)",
  workspace_source_assignment_tests_id_assignment_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignment_tests_id_assignment_unique ON workspace_source_assignment_tests (id, assignment_id)",
};

const CONSTRAINTS = {
  workspace_source_assignments_workspace_client_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_workspace_client_fk FOREIGN KEY (workspace_id, client_id) REFERENCES workspaces(id, client_id) ON DELETE CASCADE",
  workspace_source_assignments_source_client_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_source_client_fk FOREIGN KEY (source_id, client_id) REFERENCES sources(id, client_id)",
  workspace_source_assignments_source_client_channel_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_source_client_channel_fk FOREIGN KEY (source_id, client_id, publisher_channel_id) REFERENCES sources(id, client_id, publisher_channel_id)",
  workspace_source_assignments_channel_publisher_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_channel_publisher_fk FOREIGN KEY (publisher_channel_id, publisher_profile_id) REFERENCES publisher_channels(id, publisher_profile_id)",
  workspace_source_assignments_selection_client_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_selection_client_fk FOREIGN KEY (client_publisher_selection_id, client_id) REFERENCES client_publisher_selections(id, client_id)",
  workspace_source_assignments_selection_client_publisher_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_selection_client_publisher_fk FOREIGN KEY (client_publisher_selection_id, client_id, publisher_profile_id) REFERENCES client_publisher_selections(id, client_id, publisher_profile_id)",
  workspace_source_assignment_tests_workspace_client_fk: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_workspace_client_fk FOREIGN KEY (workspace_id, client_id) REFERENCES workspaces(id, client_id) ON DELETE CASCADE",
  workspace_source_assignment_tests_assignment_client_workspace_fk: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_assignment_client_workspace_fk FOREIGN KEY (assignment_id, client_id, workspace_id) REFERENCES workspace_source_assignments(id, client_id, workspace_id) ON DELETE CASCADE",
  workspace_source_assignment_tests_source_client_fk: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_source_client_fk FOREIGN KEY (source_id, client_id) REFERENCES sources(id, client_id)",
  workspace_source_assignment_tests_assignment_source_fk: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_assignment_source_fk FOREIGN KEY (assignment_id, source_id) REFERENCES workspace_source_assignments(id, source_id) ON DELETE CASCADE",
  workspace_source_assignment_tests_assignment_channel_fk: "ALTER TABLE workspace_source_assignment_tests ADD CONSTRAINT workspace_source_assignment_tests_assignment_channel_fk FOREIGN KEY (assignment_id, publisher_channel_id) REFERENCES workspace_source_assignments(id, publisher_channel_id) ON DELETE CASCADE",
  workspace_source_assignments_latest_test_assignment_fk: "ALTER TABLE workspace_source_assignments ADD CONSTRAINT workspace_source_assignments_latest_test_assignment_fk FOREIGN KEY (latest_test_run_id, id) REFERENCES workspace_source_assignment_tests(id, assignment_id)",
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

const COLUMN_REQUIREMENTS = {
  sources: {
    source_identity_key: { dataType: "text", udtName: "text", nullable: true },
  },
  workspace_source_assignments: {
    id: { dataType: "integer", udtName: "int4", nullable: false, sequence: true },
    client_id: { dataType: "integer", udtName: "int4", nullable: false },
    workspace_id: { dataType: "integer", udtName: "int4", nullable: false },
    client_publisher_selection_id: { dataType: "integer", udtName: "int4", nullable: false },
    publisher_profile_id: { dataType: "integer", udtName: "int4", nullable: false },
    publisher_channel_id: { dataType: "integer", udtName: "int4", nullable: false },
    source_id: { dataType: "integer", udtName: "int4", nullable: false },
    assignment_key: { dataType: "text", udtName: "text", nullable: false },
    status: { dataType: "text", udtName: "text", nullable: false, defaultSql: "'draft'" },
    enabled: { dataType: "boolean", udtName: "bool", nullable: false, defaultSql: "false" },
    priority: { dataType: "text", udtName: "text", nullable: false, defaultSql: "'standard'" },
    source_role: { dataType: "text", udtName: "text", nullable: false, defaultSql: "'primary'" },
    relevance_profile_version: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "1" },
    relevance_policy: { dataType: "jsonb", udtName: "jsonb", nullable: false, defaultSql: "'{}'::jsonb" },
    minimum_direct_match_rate: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "50" },
    maximum_noise_rate: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "40" },
    source_validation_identity: { dataType: "text", udtName: "text", nullable: true },
    assignment_config_identity: { dataType: "text", udtName: "text", nullable: true },
    latest_test_run_id: { dataType: "integer", udtName: "int4", nullable: true },
    test_status: { dataType: "text", udtName: "text", nullable: false, defaultSql: "'untested'" },
    tested_at: { dataType: "timestamp without time zone", udtName: "timestamp", nullable: true },
    tested_by: { dataType: "integer", udtName: "int4", nullable: true },
    warning_approved_at: { dataType: "timestamp without time zone", udtName: "timestamp", nullable: true },
    warning_approved_by: { dataType: "integer", udtName: "int4", nullable: true },
    warning_approval_reason: { dataType: "text", udtName: "text", nullable: true },
    notes: { dataType: "text", udtName: "text", nullable: true },
    created_by: { dataType: "integer", udtName: "int4", nullable: true },
    created_at: { dataType: "timestamp without time zone", udtName: "timestamp", nullable: true, defaultSql: "now()" },
    updated_at: { dataType: "timestamp without time zone", udtName: "timestamp", nullable: true, defaultSql: "now()" },
  },
  workspace_source_assignment_tests: {
    id: { dataType: "integer", udtName: "int4", nullable: false, sequence: true },
    client_id: { dataType: "integer", udtName: "int4", nullable: false },
    workspace_id: { dataType: "integer", udtName: "int4", nullable: false },
    assignment_id: { dataType: "integer", udtName: "int4", nullable: false },
    source_id: { dataType: "integer", udtName: "int4", nullable: false },
    publisher_channel_id: { dataType: "integer", udtName: "int4", nullable: false },
    test_type: { dataType: "text", udtName: "text", nullable: false },
    status: { dataType: "text", udtName: "text", nullable: false },
    relevance_profile_version: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "1" },
    source_validation_identity: { dataType: "text", udtName: "text", nullable: true },
    assignment_config_identity: { dataType: "text", udtName: "text", nullable: true },
    connectivity_result: { dataType: "jsonb", udtName: "jsonb", nullable: false, defaultSql: "'{}'::jsonb" },
    sample_count: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    direct_scope_match_count: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    material_scope_impact_count: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    contextual_count: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    not_relevant_count: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    needs_review_count: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    direct_match_rate: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    relevant_rate: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    noise_rate: { dataType: "integer", udtName: "int4", nullable: false, defaultSql: "0" },
    language_counts: { dataType: "jsonb", udtName: "jsonb", nullable: false, defaultSql: "'{}'::jsonb" },
    category_counts: { dataType: "jsonb", udtName: "jsonb", nullable: false, defaultSql: "'{}'::jsonb" },
    safe_sample_results: { dataType: "jsonb", udtName: "jsonb", nullable: false, defaultSql: "'[]'::jsonb" },
    error_code: { dataType: "text", udtName: "text", nullable: true },
    error_message: { dataType: "text", udtName: "text", nullable: true },
    started_at: { dataType: "timestamp without time zone", udtName: "timestamp", nullable: true, defaultSql: "now()" },
    completed_at: { dataType: "timestamp without time zone", udtName: "timestamp", nullable: true },
    tested_by: { dataType: "integer", udtName: "int4", nullable: true },
    created_at: { dataType: "timestamp without time zone", udtName: "timestamp", nullable: true, defaultSql: "now()" },
  },
};

const PRIMARY_KEY_REQUIREMENTS = {
  workspace_source_assignments: ["id"],
  workspace_source_assignment_tests: ["id"],
};

const ASSIGNMENT_ID_REPAIR_SQL = ASSIGNMENT_TABLES.map((table) => `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS id serial`);

const COLUMN_DEFAULT_REPAIR_SQL = Object.entries(COLUMN_REQUIREMENTS).flatMap(([table, columns]) =>
  Object.entries(columns)
    .filter(([, requirement]) => requirement.defaultSql)
    .map(([column, requirement]) => `ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT ${requirement.defaultSql}`),
);

const COLUMN_NOT_NULL_REPAIR_SQL = Object.entries(COLUMN_REQUIREMENTS).flatMap(([table, columns]) =>
  Object.entries(columns)
    .filter(([, requirement]) => requirement.nullable === false)
    .map(([column]) => `ALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL`),
);

const PRIMARY_KEY_REPAIR_SQL = Object.entries(PRIMARY_KEY_REQUIREMENTS).map(([table, columns]) =>
  addConstraintIfMissingSql(`${table}_pkey`, `ALTER TABLE ${table} ADD CONSTRAINT ${table}_pkey PRIMARY KEY (${columns.join(", ")})`),
);

const CHECK_REQUIREMENTS = {
  workspace_source_assignments_status_ck: {
    table: "workspace_source_assignments",
    tokens: ["status", "draft", "testing", "ready", "active", "paused", "archived"],
  },
  workspace_source_assignments_test_status_ck: {
    table: "workspace_source_assignments",
    tokens: ["test_status", "untested", "passed", "warning", "failed", "stale"],
  },
  workspace_source_assignments_priority_ck: {
    table: "workspace_source_assignments",
    tokens: ["priority", "critical", "high", "standard", "low"],
  },
  workspace_source_assignments_source_role_ck: {
    table: "workspace_source_assignments",
    tokens: ["source_role", "primary", "official", "regional", "contextual", "specialist", "social", "collector", "other"],
  },
  workspace_source_assignments_rate_ck: {
    table: "workspace_source_assignments",
    tokens: ["minimum_direct_match_rate", "maximum_noise_rate", "between", "0", "100"],
  },
  workspace_source_assignments_enabled_status_ck: {
    table: "workspace_source_assignments",
    tokens: ["status", "active", "enabled", "true", "false"],
  },
  workspace_source_assignment_tests_type_ck: {
    table: "workspace_source_assignment_tests",
    tokens: ["test_type", "connectivity", "relevance", "full"],
  },
  workspace_source_assignment_tests_status_ck: {
    table: "workspace_source_assignment_tests",
    tokens: ["status", "running", "passed", "warning", "failed"],
  },
  workspace_source_assignment_tests_counts_ck: {
    table: "workspace_source_assignment_tests",
    tokens: ["sample_count", "direct_scope_match_count", "material_scope_impact_count", "contextual_count", "not_relevant_count", "needs_review_count", "0"],
  },
  workspace_source_assignment_tests_rates_ck: {
    table: "workspace_source_assignment_tests",
    tokens: ["direct_match_rate", "relevant_rate", "noise_rate", "between", "0", "100"],
  },
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
    ...ASSIGNMENT_ID_REPAIR_SQL,
    ...assignmentTableRepairSql,
    ...COLUMN_DEFAULT_REPAIR_SQL,
    ...COLUMN_NOT_NULL_REPAIR_SQL,
    ...PRIMARY_KEY_REPAIR_SQL,
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

async function columnDetailsFor(client, table) {
  if (!(await tableExists(client, table))) return new Map();
  const result = await client.query(
    `SELECT
      column_name,
      data_type,
      udt_name,
      is_nullable,
      column_default,
      is_generated,
      generation_expression,
      identity_generation
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  return new Map(result.rows.map((row) => [row.column_name, row]));
}

function normalizeIdentifier(value) {
  return String(value || "")
    .replace(/^public\./i, "")
    .replace(/"/g, "")
    .trim()
    .toLowerCase();
}

function splitColumns(value) {
  if (Array.isArray(value)) return value.map(normalizeIdentifier).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => normalizeIdentifier(item.replace(/\s+(asc|desc|NULLS FIRST|NULLS LAST)$/i, "")))
    .filter(Boolean);
}

function normalizeSql(value) {
  return String(value || "")
    .replace(/"/g, "")
    .replace(/public\./gi, "")
    .replace(/::[a-z_ ]+/gi, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDefault(value) {
  return normalizeSql(value)
    .replace(/^'(.+)'$/, "$1")
    .replace(/\s+/g, "");
}

function defaultMatches(actual, requirement) {
  if (requirement.sequence) {
    return Boolean(actual?.identity_generation) || /nextval\s*\(/i.test(String(actual?.column_default || ""));
  }
  if (!requirement.defaultSql) return true;
  const actualDefault = normalizeDefault(actual?.column_default);
  const expectedDefault = normalizeDefault(requirement.defaultSql);
  if (expectedDefault === "now") return actualDefault.includes("now");
  if (expectedDefault === "{}") return actualDefault.includes("{}");
  if (expectedDefault === "[]") return actualDefault.includes("[]");
  return actualDefault === expectedDefault || actualDefault.includes(expectedDefault);
}

function parseIndexDefinition(indexname, definition) {
  const sql = String(definition || "");
  const match = sql.match(/CREATE\s+(UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z0-9_"]+)\s+ON\s+(?:public\.)?([a-z0-9_"]+)(?:\s+USING\s+\w+)?\s*\(([^)]+)\)(?:\s+WHERE\s+(.+))?/i);
  if (!match) return { name: indexname, parseError: "unrecognized_index_definition", definition: sql };
  return {
    name: normalizeIdentifier(indexname || match[2]),
    unique: Boolean(match[1]),
    table: normalizeIdentifier(match[3]),
    columns: splitColumns(match[4]),
    predicate: normalizeSql(match[5] || ""),
    definition: sql,
  };
}

function parseIndexRequirement(name, sql) {
  return parseIndexDefinition(name, sql.replace(/\s+IF\s+NOT\s+EXISTS/i, ""));
}

async function existingIndexDefinitions(client) {
  const result = await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'");
  return new Map(result.rows.map((row) => [
    row.indexname,
    parseIndexDefinition(row.indexname, row.indexdef || row.definition || ""),
  ]));
}

function deleteBehaviorCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cascade" || normalized === "c") return "c";
  if (normalized === "set null" || normalized === "n") return "n";
  if (normalized === "restrict" || normalized === "r") return "r";
  if (normalized === "set default" || normalized === "d") return "d";
  return "a";
}

function parseForeignKeyRequirement(name, sql) {
  const match = String(sql).match(/ALTER\s+TABLE\s+([a-z0-9_"]+)\s+ADD\s+CONSTRAINT\s+([a-z0-9_"]+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([a-z0-9_"]+)\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(.+))?$/i);
  if (!match) return null;
  return {
    name,
    table: normalizeIdentifier(match[1]),
    columns: splitColumns(match[3]),
    foreignTable: normalizeIdentifier(match[4]),
    foreignColumns: splitColumns(match[5]),
    deleteBehavior: deleteBehaviorCode(match[6]),
  };
}

async function constraintCatalog(client) {
  const result = await client.query(`
    SELECT
      c.conname,
      c.contype,
      replace(c.conrelid::regclass::text, 'public.', '') AS table_name,
      CASE WHEN c.confrelid = 0 THEN NULL ELSE replace(c.confrelid::regclass::text, 'public.', '') END AS foreign_table,
      c.confdeltype,
      pg_get_constraintdef(c.oid, true) AS definition,
      COALESCE((
        SELECT array_agg(a.attname ORDER BY u.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      ), ARRAY[]::text[]) AS columns,
      COALESCE((
        SELECT array_agg(a.attname ORDER BY u.ordinality)
        FROM unnest(c.confkey) WITH ORDINALITY AS u(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = u.attnum
      ), ARRAY[]::text[]) AS foreign_columns
    FROM pg_constraint c
    WHERE c.connamespace='public'::regnamespace
  `);
  return new Map(result.rows.map((row) => [
    row.conname,
    {
      name: row.conname,
      type: row.contype,
      table: normalizeIdentifier(row.table_name),
      columns: splitColumns(row.columns),
      foreignTable: normalizeIdentifier(row.foreign_table),
      foreignColumns: splitColumns(row.foreign_columns),
      deleteBehavior: deleteBehaviorCode(row.confdeltype),
      definition: row.definition || "",
    },
  ]));
}

function safeErrorMessage(error) {
  return String(error?.message || error || "unknown_error")
    .replace(/postgres:\/\/[^@\s]+@[^\s]+/gi, "postgres://[redacted]")
    .slice(0, 240);
}

async function runCountCheck(client, context, sql, tableRowCounts, inspectionErrors, notApplicableChecks) {
  const missingRequiredTable = (context.requiredTables || [context.table]).find((table) => tableRowCounts[table] === null);
  if (missingRequiredTable) {
    notApplicableChecks.push({
      check: context.check,
      table: context.table,
      reason: "table_missing",
      missingTable: missingRequiredTable,
    });
    return null;
  }
  try {
    const result = await client.query(sql);
    return Number(result.rows[0]?.count || 0);
  } catch (error) {
    inspectionErrors.push({
      check: context.check,
      table: context.table,
      errorCode: error?.code || error?.name || "QUERY_FAILED",
      safeMessage: safeErrorMessage(error),
    });
    return null;
  }
}

function columnRepairSafety(table, rowCount, columnName, reason) {
  if (table === "sources" && columnName === "source_identity_key") return "safe";
  if (ASSIGNMENT_TABLES.includes(table) && Number(rowCount || 0) === 0) return "safe";
  if (reason === "missing_default") return "safe";
  return "unsafe";
}

function inspectColumnDefinitions(table, details, rowCount) {
  const requirements = COLUMN_REQUIREMENTS[table] || {};
  const missing = [];
  const incompatible = [];
  const nullableRequired = [];
  const missingDefaults = [];
  const safeRepairs = [];
  const unsafeRepairs = [];

  for (const [column, requirement] of Object.entries(requirements)) {
    const actual = details.get(column);
    if (!actual) {
      const definition = SOURCE_ASSIGNMENT_COLUMNS[table]?.find(([name]) => name === column)?.[1] || "";
      missing.push({ name: column, definition });
      const repair = { table, column, reason: "missing_column", rowCount };
      if (columnRepairSafety(table, rowCount, column, "missing_column") === "safe") safeRepairs.push(repair);
      else unsafeRepairs.push(repair);
      continue;
    }

    const actualType = normalizeIdentifier(actual.data_type);
    const actualUdt = normalizeIdentifier(actual.udt_name);
    if (actualType !== normalizeIdentifier(requirement.dataType) || actualUdt !== normalizeIdentifier(requirement.udtName)) {
      incompatible.push({
        table,
        column,
        expected: { dataType: requirement.dataType, udtName: requirement.udtName },
        actual: { dataType: actual.data_type, udtName: actual.udt_name },
      });
      unsafeRepairs.push({ table, column, reason: "incompatible_column_definition", rowCount });
    }

    const nullable = String(actual.is_nullable || "").toUpperCase() === "YES";
    if (requirement.nullable === false && nullable) {
      nullableRequired.push({ table, column, rowCount });
      const repair = { table, column, reason: "required_column_nullable", rowCount };
      if (columnRepairSafety(table, rowCount, column, "required_column_nullable") === "safe") safeRepairs.push(repair);
      else unsafeRepairs.push(repair);
    }

    if ((requirement.defaultSql || requirement.sequence) && !defaultMatches(actual, requirement)) {
      missingDefaults.push({
        table,
        column,
        expected: requirement.sequence ? "sequence_or_identity" : requirement.defaultSql,
        actual: actual.column_default || actual.identity_generation || null,
      });
      const repair = { table, column, reason: requirement.sequence ? "missing_sequence_or_identity" : "missing_default", rowCount };
      if (!requirement.sequence && columnRepairSafety(table, rowCount, column, "missing_default") === "safe") safeRepairs.push(repair);
      else unsafeRepairs.push(repair);
    }
  }

  return { missing, incompatible, nullableRequired, missingDefaults, safeRepairs, unsafeRepairs };
}

function compareIndexes(indexes) {
  const missingIndexes = [];
  const malformedIndexes = [];
  const missingUniqueConstraints = [];
  for (const [name, sql] of Object.entries(INDEXES)) {
    const expected = parseIndexRequirement(name, sql);
    const actual = indexes.get(name);
    if (!actual) {
      missingIndexes.push(name);
      if (expected.unique) missingUniqueConstraints.push({ name, reason: "missing_unique_index" });
      continue;
    }
    const problems = [];
    if (actual.parseError) problems.push(actual.parseError);
    if (actual.table !== expected.table) problems.push("wrong_table");
    if (actual.unique !== expected.unique) problems.push(expected.unique ? "not_unique" : "unexpected_unique");
    if (actual.columns.join(",") !== expected.columns.join(",")) problems.push("wrong_columns_or_order");
    if ((actual.predicate || "") !== (expected.predicate || "")) problems.push("wrong_predicate");
    if (problems.length) {
      malformedIndexes.push({ name, expected, actual, problems });
      if (expected.unique) missingUniqueConstraints.push({ name, reason: "malformed_unique_index", problems });
    }
  }
  return { missingIndexes, malformedIndexes, missingUniqueConstraints };
}

function comparePrimaryKeys(constraints, tableRowCounts) {
  const missingPrimaryKeys = [];
  const malformedPrimaryKeys = [];
  for (const [table, columns] of Object.entries(PRIMARY_KEY_REQUIREMENTS)) {
    const expectedName = `${table}_pkey`;
    const actual = [...constraints.values()].find((constraint) => constraint.type === "p" && constraint.table === table);
    if (!actual) {
      missingPrimaryKeys.push({
        table,
        expectedName,
        expectedColumns: columns,
        rowCount: tableRowCounts[table],
        repair: Number(tableRowCounts[table] || 0) === 0 ? "safe_empty_table" : "unsafe_populated_table",
      });
      continue;
    }
    if (actual.columns.join(",") !== columns.join(",")) {
      malformedPrimaryKeys.push({ table, expectedName, expectedColumns: columns, actualName: actual.name, actualColumns: actual.columns, rowCount: tableRowCounts[table] });
    }
  }
  return { missingPrimaryKeys, malformedPrimaryKeys };
}

function compareForeignKeys(constraints) {
  const missingForeignKeys = [];
  const malformedForeignKeys = [];
  for (const [name, sql] of Object.entries(CONSTRAINTS).filter(([constraintName]) => constraintName.endsWith("_fk"))) {
    const expected = parseForeignKeyRequirement(name, sql);
    const actual = constraints.get(name);
    if (!actual) {
      missingForeignKeys.push(name);
      continue;
    }
    const problems = [];
    if (actual.type !== "f") problems.push("not_foreign_key");
    if (actual.table !== expected.table) problems.push("wrong_table");
    if (actual.columns.join(",") !== expected.columns.join(",")) problems.push("wrong_columns_or_order");
    if (actual.foreignTable !== expected.foreignTable) problems.push("wrong_target_table");
    if (actual.foreignColumns.join(",") !== expected.foreignColumns.join(",")) problems.push("wrong_target_columns_or_order");
    if (actual.deleteBehavior !== expected.deleteBehavior) problems.push("wrong_delete_behavior");
    if (problems.length) malformedForeignKeys.push({ name, expected, actual, problems });
  }
  return { missingForeignKeys, malformedForeignKeys };
}

function compareCheckConstraints(constraints) {
  const missingCheckConstraints = [];
  const malformedCheckConstraints = [];
  for (const [name, requirement] of Object.entries(CHECK_REQUIREMENTS)) {
    const actual = constraints.get(name);
    if (!actual) {
      missingCheckConstraints.push(name);
      continue;
    }
    const normalizedDefinition = normalizeSql(actual.definition);
    const missingTokens = requirement.tokens.filter((token) => !normalizedDefinition.includes(normalizeSql(token)));
    const problems = [];
    if (actual.type !== "c") problems.push("not_check_constraint");
    if (actual.table !== requirement.table) problems.push("wrong_table");
    if (missingTokens.length) problems.push("wrong_expression");
    if (problems.length) malformedCheckConstraints.push({ name, table: requirement.table, missingTokens, actualDefinition: actual.definition, problems });
  }
  return { missingCheckConstraints, malformedCheckConstraints };
}

function evaluateApplySafe(report) {
  return (
    report.nonZeroIncompatibilities.length === 0 &&
    report.partialSchemaRisks.length === 0 &&
    report.unsafeColumnRepairs.length === 0 &&
    report.incompatibleColumnDefinitions.length === 0 &&
    report.malformedPrimaryKeys.length === 0 &&
    report.malformedIndexes.length === 0 &&
    report.malformedForeignKeys.length === 0 &&
    report.malformedCheckConstraints.length === 0 &&
    report.inspectionErrors.length === 0
  );
}

async function inspect(client) {
  const tableRowCounts = {};
  const tables = ["users", "clients", "workspaces", "workspace_relevance_profiles", "publisher_profiles", "publisher_channels", "client_publisher_selections", "sources", "articles", "article_appearances", "platform_reset_audit", ...ASSIGNMENT_TABLES];
  for (const table of tables) tableRowCounts[table] = await tableCount(client, table);

  const missingColumns = {};
  const incompatibleColumnDefinitions = [];
  const nullableRequiredColumns = [];
  const missingDefaults = [];
  const safeColumnRepairs = [];
  const unsafeColumnRepairs = [];
  for (const [table, definitions] of Object.entries(SOURCE_ASSIGNMENT_COLUMNS)) {
    const details = await columnDetailsFor(client, table);
    const columnInspection = inspectColumnDefinitions(table, details, tableRowCounts[table]);
    missingColumns[table] = definitions.filter(([name]) => columnInspection.missing.some((item) => item.name === name)).map(([name, definition]) => ({ name, definition }));
    incompatibleColumnDefinitions.push(...columnInspection.incompatible);
    nullableRequiredColumns.push(...columnInspection.nullableRequired);
    missingDefaults.push(...columnInspection.missingDefaults);
    safeColumnRepairs.push(...columnInspection.safeRepairs);
    unsafeColumnRepairs.push(...columnInspection.unsafeRepairs);
  }

  const indexes = await existingIndexDefinitions(client);
  const constraints = await constraintCatalog(client);
  const { missingIndexes, malformedIndexes, missingUniqueConstraints } = compareIndexes(indexes);
  const { missingPrimaryKeys, malformedPrimaryKeys } = comparePrimaryKeys(constraints, tableRowCounts);
  const { missingForeignKeys, malformedForeignKeys } = compareForeignKeys(constraints);
  const { missingCheckConstraints, malformedCheckConstraints } = compareCheckConstraints(constraints);

  const inspectionErrors = [];
  const notApplicableChecks = [];
  const checks = [
    ["invalidAssignmentStatus", "workspace_source_assignments", ["workspace_source_assignments"], "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE status NOT IN ('draft','testing','ready','active','paused','archived')"],
    ["invalidAssignmentTestStatus", "workspace_source_assignments", ["workspace_source_assignments"], "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE test_status NOT IN ('untested','passed','warning','failed','stale')"],
    ["invalidAssignmentEnabledStatus", "workspace_source_assignments", ["workspace_source_assignments"], "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE NOT ((status = 'active' AND enabled IS TRUE) OR (status <> 'active' AND enabled IS FALSE))"],
    ["invalidRunType", "workspace_source_assignment_tests", ["workspace_source_assignment_tests"], "SELECT count(*)::int AS count FROM workspace_source_assignment_tests WHERE test_type NOT IN ('connectivity','relevance','full')"],
    ["invalidRunStatus", "workspace_source_assignment_tests", ["workspace_source_assignment_tests"], "SELECT count(*)::int AS count FROM workspace_source_assignment_tests WHERE status NOT IN ('running','passed','warning','failed')"],
    ["workspaceClientMismatch", "workspace_source_assignments", ["workspace_source_assignments", "workspaces"], "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN workspaces w ON w.id=a.workspace_id AND w.client_id=a.client_id WHERE w.id IS NULL"],
    ["sourceClientMismatch", "workspace_source_assignments", ["workspace_source_assignments", "sources"], "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN sources s ON s.id=a.source_id AND s.client_id=a.client_id WHERE s.id IS NULL"],
    ["sourceChannelMismatch", "workspace_source_assignments", ["workspace_source_assignments", "sources"], "SELECT count(*)::int AS count FROM workspace_source_assignments a JOIN sources s ON s.id=a.source_id WHERE s.publisher_channel_id IS DISTINCT FROM a.publisher_channel_id"],
    ["selectionPublisherMismatch", "workspace_source_assignments", ["workspace_source_assignments", "client_publisher_selections"], "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN client_publisher_selections cps ON cps.id=a.client_publisher_selection_id AND cps.client_id=a.client_id AND cps.publisher_profile_id=a.publisher_profile_id WHERE cps.id IS NULL"],
    ["assignmentSelectionClientPublisherMismatch", "workspace_source_assignments", ["workspace_source_assignments", "client_publisher_selections"], "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN client_publisher_selections cps ON cps.id=a.client_publisher_selection_id AND cps.client_id=a.client_id AND cps.publisher_profile_id=a.publisher_profile_id WHERE cps.id IS NULL"],
    ["assignmentSourceClientChannelMismatch", "workspace_source_assignments", ["workspace_source_assignments", "sources"], "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN sources s ON s.id=a.source_id AND s.client_id=a.client_id AND s.publisher_channel_id=a.publisher_channel_id WHERE s.id IS NULL"],
    ["assignmentChannelPublisherMismatch", "workspace_source_assignments", ["workspace_source_assignments", "publisher_channels"], "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN publisher_channels pc ON pc.id=a.publisher_channel_id AND pc.publisher_profile_id=a.publisher_profile_id WHERE pc.id IS NULL"],
    ["testAssignmentClientWorkspaceMismatch", "workspace_source_assignment_tests", ["workspace_source_assignment_tests", "workspace_source_assignments"], "SELECT count(*)::int AS count FROM workspace_source_assignment_tests t LEFT JOIN workspace_source_assignments a ON a.id=t.assignment_id AND a.client_id=t.client_id AND a.workspace_id=t.workspace_id WHERE a.id IS NULL"],
    ["testAssignmentSourceMismatch", "workspace_source_assignment_tests", ["workspace_source_assignment_tests", "workspace_source_assignments"], "SELECT count(*)::int AS count FROM workspace_source_assignment_tests t LEFT JOIN workspace_source_assignments a ON a.id=t.assignment_id AND a.source_id=t.source_id WHERE a.id IS NULL"],
    ["testAssignmentChannelMismatch", "workspace_source_assignment_tests", ["workspace_source_assignment_tests", "workspace_source_assignments"], "SELECT count(*)::int AS count FROM workspace_source_assignment_tests t LEFT JOIN workspace_source_assignments a ON a.id=t.assignment_id AND a.publisher_channel_id=t.publisher_channel_id WHERE a.id IS NULL"],
    ["testAssignmentClientWorkspaceSourceMismatch", "workspace_source_assignment_tests", ["workspace_source_assignment_tests", "workspace_source_assignments"], "SELECT count(*)::int AS count FROM workspace_source_assignment_tests t LEFT JOIN workspace_source_assignments a ON a.id=t.assignment_id AND a.client_id=t.client_id AND a.workspace_id=t.workspace_id AND a.source_id=t.source_id AND a.publisher_channel_id=t.publisher_channel_id WHERE a.id IS NULL"],
    ["latestTestWrongAssignment", "workspace_source_assignments", ["workspace_source_assignments", "workspace_source_assignment_tests"], "SELECT count(*)::int AS count FROM workspace_source_assignments a JOIN workspace_source_assignment_tests t ON t.id=a.latest_test_run_id WHERE t.assignment_id <> a.id"],
    ["activeAssignmentWithoutCurrentTest", "workspace_source_assignments", ["workspace_source_assignments", "workspace_source_assignment_tests", "workspace_relevance_profiles"], "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN workspace_source_assignment_tests t ON t.id=a.latest_test_run_id AND t.assignment_id=a.id LEFT JOIN workspace_relevance_profiles p ON p.workspace_id=a.workspace_id WHERE a.status='active' AND (t.id IS NULL OR t.test_type NOT IN ('relevance','full') OR t.status NOT IN ('passed','warning') OR t.relevance_profile_version <> COALESCE(p.profile_version, a.relevance_profile_version) OR t.source_validation_identity IS DISTINCT FROM a.source_validation_identity OR t.assignment_config_identity IS DISTINCT FROM a.assignment_config_identity)"],
    ["activeAssignmentWithStaleTest", "workspace_source_assignments", ["workspace_source_assignments", "workspace_relevance_profiles"], "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN workspace_relevance_profiles p ON p.workspace_id=a.workspace_id WHERE a.status='active' AND (a.test_status='stale' OR a.relevance_profile_version <> COALESCE(p.profile_version, a.relevance_profile_version))"],
    ["activeAssignmentDisabledMismatch", "workspace_source_assignments", ["workspace_source_assignments"], "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE (status='active' AND enabled IS DISTINCT FROM TRUE) OR (status <> 'active' AND enabled IS DISTINCT FROM FALSE)"],
    ["inactiveSourceWithActiveAssignment", "sources", ["sources", "workspace_source_assignments"], "SELECT count(*)::int AS count FROM sources s WHERE s.active IS DISTINCT FROM TRUE AND EXISTS (SELECT 1 FROM workspace_source_assignments a WHERE a.source_id=s.id AND a.status='active' AND a.enabled IS TRUE)"],
    ["activeSourceWithoutActiveAssignment", "sources", ["sources", "workspace_source_assignments"], "SELECT count(*)::int AS count FROM sources s WHERE s.active IS TRUE AND s.publisher_channel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspace_source_assignments a WHERE a.source_id=s.id AND a.status='active' AND a.enabled IS TRUE)"],
    ["duplicateOperationalSourceIdentity", "sources", ["sources"], "SELECT count(*)::int AS count FROM (SELECT client_id, source_identity_key FROM sources WHERE source_identity_key IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) d"],
    ["duplicateWorkspaceSource", "workspace_source_assignments", ["workspace_source_assignments"], "SELECT count(*)::int AS count FROM (SELECT workspace_id, source_id FROM workspace_source_assignments GROUP BY 1,2 HAVING count(*) > 1) d"],
    ["duplicateWorkspaceChannel", "workspace_source_assignments", ["workspace_source_assignments"], "SELECT count(*)::int AS count FROM (SELECT workspace_id, publisher_channel_id FROM workspace_source_assignments GROUP BY 1,2 HAVING count(*) > 1) d"],
  ];
  const incompatibleRows = {};
  for (const [check, table, requiredTables, sql] of checks) {
    incompatibleRows[check] = await runCountCheck(client, { check, table, requiredTables }, sql, tableRowCounts, inspectionErrors, notApplicableChecks);
  }

  const partialSchemaRisks = [];
  const partialSchemaRepairs = [];
  for (const table of ASSIGNMENT_TABLES) {
    const exists = await tableExists(client, table);
    if (!exists) continue;
    const rowCount = tableRowCounts[table] || 0;
    const missing = missingColumns[table] || [];
    if (missing.length && rowCount > 0) partialSchemaRisks.push({ table, rowCount, missingColumns: missing.map((item) => item.name), risk: "populated_partial_schema" });
    if (missing.length && rowCount === 0) partialSchemaRepairs.push({ table, missingColumns: missing.map((item) => item.name), repair: "safe_empty_table_column_repair" });
  }
  for (const primaryKey of missingPrimaryKeys) {
    if (primaryKey.repair === "safe_empty_table") partialSchemaRepairs.push({ table: primaryKey.table, missingPrimaryKey: primaryKey.expectedColumns, repair: "safe_empty_table_primary_key_repair" });
    else partialSchemaRisks.push({ table: primaryKey.table, rowCount: primaryKey.rowCount, missingPrimaryKey: primaryKey.expectedColumns, risk: "populated_table_missing_primary_key" });
  }

  const nonZeroIncompatibilities = Object.entries(incompatibleRows)
    .filter(([, value]) => Number(value || 0) > 0)
    .map(([key, value]) => ({ key, value }));

  const report = {
    missingTables: ASSIGNMENT_TABLES.filter((table) => tableRowCounts[table] === null),
    missingColumns,
    incompatibleColumnDefinitions,
    nullableRequiredColumns,
    missingDefaults,
    safeColumnRepairs,
    unsafeColumnRepairs,
    missingPrimaryKeys,
    malformedPrimaryKeys,
    missingIndexes,
    malformedIndexes,
    missingUniqueConstraints,
    missingForeignKeys,
    malformedForeignKeys,
    missingCheckConstraints,
    malformedCheckConstraints,
    incompatibleRows,
    nonZeroIncompatibilities,
    partialSchemaRisks,
    unsafePartialSchemaRisks: partialSchemaRisks,
    partialSchemaRepairs,
    inspectionErrors,
    notApplicableChecks,
    tableRowCounts,
  };
  report.applySafe = evaluateApplySafe(report);
  return report;
}

async function run({ apply = false, ClientImpl = Client } = {}) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new ClientImpl({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const before = await inspect(client);
    const applySafe = before.applySafe;
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
      if (!after.applySafe) {
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
