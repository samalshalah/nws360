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

const PREREQUISITE_UNIQUE_INDEXES = {
  workspaces_id_client_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspaces_id_client_unique ON workspaces (id, client_id)",
  sources_id_client_unique: "CREATE UNIQUE INDEX IF NOT EXISTS sources_id_client_unique ON sources (id, client_id)",
  publisher_channels_id_profile_unique: "CREATE UNIQUE INDEX IF NOT EXISTS publisher_channels_id_profile_unique ON publisher_channels (id, publisher_profile_id)",
  client_publisher_selections_id_client_unique: "CREATE UNIQUE INDEX IF NOT EXISTS client_publisher_selections_id_client_unique ON client_publisher_selections (id, client_id)",
  client_publisher_selections_id_client_publisher_unique: "CREATE UNIQUE INDEX IF NOT EXISTS client_publisher_selections_id_client_publisher_unique ON client_publisher_selections (id, client_id, publisher_profile_id)",
  sources_id_client_channel_unique: "CREATE UNIQUE INDEX IF NOT EXISTS sources_id_client_channel_unique ON sources (id, client_id, publisher_channel_id)",
  sources_client_identity_unique: "CREATE UNIQUE INDEX IF NOT EXISTS sources_client_identity_unique ON sources (client_id, source_identity_key)",
};

const ASSIGNMENT_UNIQUE_INDEXES = {
  workspace_source_assignments_key_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_key_unique ON workspace_source_assignments (assignment_key)",
  workspace_source_assignments_workspace_source_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_workspace_source_unique ON workspace_source_assignments (workspace_id, source_id)",
  workspace_source_assignments_workspace_channel_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_workspace_channel_unique ON workspace_source_assignments (workspace_id, publisher_channel_id)",
  workspace_source_assignments_id_client_workspace_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_id_client_workspace_unique ON workspace_source_assignments (id, client_id, workspace_id)",
  workspace_source_assignments_id_source_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_id_source_unique ON workspace_source_assignments (id, source_id)",
  workspace_source_assignments_id_channel_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignments_id_channel_unique ON workspace_source_assignments (id, publisher_channel_id)",
  workspace_source_assignment_tests_id_assignment_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_assignment_tests_id_assignment_unique ON workspace_source_assignment_tests (id, assignment_id)",
};

const SUPPORTING_INDEXES = {
  workspace_source_assignments_client_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_client_idx ON workspace_source_assignments (client_id, status)",
  workspace_source_assignments_workspace_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_workspace_idx ON workspace_source_assignments (workspace_id, status)",
  workspace_source_assignments_source_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_source_idx ON workspace_source_assignments (source_id, status)",
  workspace_source_assignments_channel_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignments_channel_idx ON workspace_source_assignments (publisher_channel_id)",
  workspace_source_assignment_tests_assignment_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_assignment_idx ON workspace_source_assignment_tests (assignment_id, created_at)",
  workspace_source_assignment_tests_workspace_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_workspace_idx ON workspace_source_assignment_tests (workspace_id, status)",
  workspace_source_assignment_tests_client_idx: "CREATE INDEX IF NOT EXISTS workspace_source_assignment_tests_client_idx ON workspace_source_assignment_tests (client_id, test_type)",
};

const INDEXES = {
  ...PREREQUISITE_UNIQUE_INDEXES,
  ...ASSIGNMENT_UNIQUE_INDEXES,
  ...SUPPORTING_INDEXES,
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

const PREREQUISITE_UNIQUE_PROTECTIONS = {
  workspaces_id_client_unique: {
    table: "workspaces",
    columns: ["id", "client_id"],
    plannedIndexName: "workspaces_id_client_unique",
  },
  sources_id_client_unique: {
    table: "sources",
    columns: ["id", "client_id"],
    plannedIndexName: "sources_id_client_unique",
  },
  sources_id_client_channel_unique: {
    table: "sources",
    columns: ["id", "client_id", "publisher_channel_id"],
    plannedIndexName: "sources_id_client_channel_unique",
  },
  publisher_channels_id_profile_unique: {
    table: "publisher_channels",
    columns: ["id", "publisher_profile_id"],
    plannedIndexName: "publisher_channels_id_profile_unique",
  },
  client_publisher_selections_id_client_unique: {
    table: "client_publisher_selections",
    columns: ["id", "client_id"],
    plannedIndexName: "client_publisher_selections_id_client_unique",
  },
  client_publisher_selections_id_client_publisher_unique: {
    table: "client_publisher_selections",
    columns: ["id", "client_id", "publisher_profile_id"],
    plannedIndexName: "client_publisher_selections_id_client_publisher_unique",
  },
};

const PLANNED_TABLES = new Set(ASSIGNMENT_TABLES);
const PLANNED_COLUMNS = new Set(
  Object.entries(SOURCE_ASSIGNMENT_COLUMNS).flatMap(([table, columns]) =>
    columns.map(([column]) => `${table}.${column}`),
  ),
);

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
    ...Object.values(PREREQUISITE_UNIQUE_INDEXES),
    ...Object.values(ASSIGNMENT_UNIQUE_INDEXES),
    ...Object.values(SUPPORTING_INDEXES),
    ...Object.entries(CONSTRAINTS)
      .filter(([name]) => name.endsWith("_fk"))
      .map(([name, stmt]) => addConstraintIfMissingSql(name, stmt)),
    ...Object.entries(CONSTRAINTS)
      .filter(([name]) => name.endsWith("_ck"))
      .map(([name, stmt]) => addConstraintIfMissingSql(name, stmt)),
  ];
}

function classifyPlannedStatement(statement) {
  const sql = String(statement || "").replace(/\s+/g, " ").trim();
  const lower = sql.toLowerCase();
  if (lower.startsWith("alter table sources add column")) return "add existing-table columns";
  if (lower.startsWith("create table if not exists workspace_source_")) return "create assignment tables";
  if (lower.includes("add column if not exists id serial")) return "empty-partial-table ID repairs";
  if (lower.startsWith("alter table workspace_source_") && lower.includes(" add column if not exists ")) return "add assignment-table columns";
  if (lower.includes(" alter column ") && lower.includes(" set default ")) return "default repairs";
  if (lower.includes(" alter column ") && lower.includes(" set not null")) return "NOT NULL repairs";
  if (lower.includes(" primary key ")) return "primary-key repairs";
  if (Object.values(PREREQUISITE_UNIQUE_INDEXES).includes(statement)) return "prerequisite unique indexes";
  if (Object.values(ASSIGNMENT_UNIQUE_INDEXES).includes(statement)) return "assignment unique indexes";
  if (Object.values(SUPPORTING_INDEXES).includes(statement)) return "supporting indexes";
  if (lower.includes(" foreign key ")) return "foreign keys";
  if (lower.includes(" check ")) return "check constraints";
  return "unclassified";
}

function classifyPlannedSql(plannedSql = allPlannedSql()) {
  const groups = {
    "add existing-table columns": 0,
    "create assignment tables": 0,
    "empty-partial-table ID repairs": 0,
    "add assignment-table columns": 0,
    "default repairs": 0,
    "NOT NULL repairs": 0,
    "primary-key repairs": 0,
    "prerequisite unique indexes": 0,
    "assignment unique indexes": 0,
    "supporting indexes": 0,
    "foreign keys": 0,
    "check constraints": 0,
  };
  const unclassified = [];
  for (const statement of plannedSql) {
    const group = classifyPlannedStatement(statement);
    if (group === "unclassified") unclassified.push(statement);
    else groups[group] += 1;
  }
  return {
    groups,
    total: plannedSql.length,
    classifiedTotal: Object.values(groups).reduce((sum, count) => sum + count, 0),
    unclassified,
  };
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

function indexMatchesRequirement(actual, expected) {
  return (
    !actual?.parseError &&
    actual.table === expected.table &&
    actual.unique === expected.unique &&
    actual.columns.join(",") === expected.columns.join(",") &&
    (actual.predicate || "") === (expected.predicate || "")
  );
}

function findEquivalentIndex(indexes, expected) {
  return [...indexes.values()].find((actual) => indexMatchesRequirement(actual, expected));
}

async function existingIndexDefinitions(client) {
  const result = await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'");
  const indexes = new Map(result.rows.map((row) => [
    row.indexname,
    parseIndexDefinition(row.indexname, row.indexdef || row.definition || ""),
  ]));
  const catalogResult = await client.query(`
    SELECT
      i.relname AS indexname,
      t.relname AS table_name,
      ix.indisunique AS is_unique,
      COALESCE(array_agg(a.attname ORDER BY u.ordinality) FILTER (WHERE a.attname IS NOT NULL), ARRAY[]::text[]) AS columns,
      COALESCE(pg_get_expr(ix.indpred, ix.indrelid), '') AS predicate
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN unnest(ix.indkey) WITH ORDINALITY AS u(attnum, ordinality) ON true
    LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = u.attnum
    WHERE n.nspname = 'public'
    GROUP BY i.relname, t.relname, ix.indisunique, ix.indpred, ix.indrelid
  `);
  for (const row of catalogResult.rows) {
    const existing = indexes.get(row.indexname) || { name: normalizeIdentifier(row.indexname), definition: "" };
    indexes.set(row.indexname, {
      ...existing,
      name: normalizeIdentifier(row.indexname),
      table: normalizeIdentifier(row.table_name),
      unique: row.is_unique === true || row.is_unique === "t",
      columns: splitColumns(row.columns),
      predicate: normalizeSql(row.predicate || ""),
    });
  }
  return indexes;
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

function isPlannedTable(table) {
  return PLANNED_TABLES.has(table);
}

function isPlannedColumn(table, column) {
  return PLANNED_COLUMNS.has(`${table}.${column}`);
}

function missingPrerequisitesForCheck(context, tableRowCounts, columnDetailsByTable) {
  const planned = [];
  const unplanned = [];
  for (const table of context.requiredTables || [context.table]) {
    if (tableRowCounts[table] !== null) continue;
    const item = { type: "table", table, name: table };
    if (isPlannedTable(table)) planned.push(item);
    else unplanned.push(item);
  }
  if (planned.some((item) => item.type === "table") && unplanned.length === 0) {
    return { planned, unplanned };
  }
  for (const requirement of context.requiredColumns || []) {
    const [table, column] = String(requirement).split(".");
    if (!table || !column) continue;
    if (tableRowCounts[table] === null) continue;
    const details = columnDetailsByTable[table] || new Map();
    if (details.has(column)) continue;
    const item = { type: "column", table, column, name: `${table}.${column}` };
    if (isPlannedColumn(table, column)) planned.push(item);
    else unplanned.push(item);
  }
  return { planned, unplanned };
}

function formatMissingPrerequisites(items) {
  return items.map((item) => item.name);
}

async function runIntegrityCheck(client, context, sql, state) {
  const { inspectionErrors, notApplicableChecks, integrityChecks, tableRowCounts, columnDetailsByTable } = state;
  const missing = missingPrerequisitesForCheck(context, tableRowCounts, columnDetailsByTable);
  if (missing.planned.length > 0 && missing.unplanned.length === 0) {
    const result = {
      status: "not_applicable",
      value: null,
      reason: "prerequisite_schema_missing_and_planned",
      missingPrerequisites: formatMissingPrerequisites(missing.planned),
    };
    integrityChecks[context.check] = result;
    notApplicableChecks.push({
      check: context.check,
      table: context.table,
      ...result,
    });
    return result;
  }
  if (missing.unplanned.length > 0) {
    const result = {
      status: "error",
      value: null,
      reason: "missing_unplanned_prerequisite_schema",
      missingPrerequisites: formatMissingPrerequisites(missing.unplanned),
    };
    integrityChecks[context.check] = result;
    inspectionErrors.push({
      check: context.check,
      table: context.table,
      errorCode: "MISSING_PREREQUISITE_SCHEMA",
      safeMessage: `Missing prerequisite schema: ${result.missingPrerequisites.join(", ")}`,
    });
    return result;
  }
  try {
    const result = await client.query(sql);
    const value = Number(result.rows[0]?.count || 0);
    const checkResult = { status: "ok", value, reason: null, missingPrerequisites: [] };
    integrityChecks[context.check] = checkResult;
    return checkResult;
  } catch (error) {
    const checkResult = {
      status: "error",
      value: null,
      reason: "query_failed",
      missingPrerequisites: [],
    };
    integrityChecks[context.check] = checkResult;
    inspectionErrors.push({
      check: context.check,
      table: context.table,
      errorCode: error?.code || error?.name || "QUERY_FAILED",
      safeMessage: safeErrorMessage(error),
    });
    return checkResult;
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
  const equivalentExistingIndexes = [];
  const genuinelyMissingIndexes = [];
  for (const [name, sql] of Object.entries(INDEXES)) {
    const expected = parseIndexRequirement(name, sql);
    const actual = indexes.get(name);
    const equivalent = findEquivalentIndex(indexes, expected);
    if (actual && !indexMatchesRequirement(actual, expected)) {
      const problems = [];
      if (actual.parseError) problems.push(actual.parseError);
      if (actual.table !== expected.table) problems.push("wrong_table");
      if (actual.unique !== expected.unique) problems.push(expected.unique ? "not_unique" : "unexpected_unique");
      if (actual.columns.join(",") !== expected.columns.join(",")) problems.push("wrong_columns_or_order");
      if ((actual.predicate || "") !== (expected.predicate || "")) problems.push("wrong_predicate");
      malformedIndexes.push({ name, expected, actual, problems });
      if (expected.unique) missingUniqueConstraints.push({ name, reason: "malformed_unique_index", problems });
      continue;
    }
    if (actual && indexMatchesRequirement(actual, expected)) continue;
    if (!actual && equivalent) {
      equivalentExistingIndexes.push({
        expectedName: name,
        actualName: equivalent.name,
        table: equivalent.table,
        columns: equivalent.columns,
        unique: equivalent.unique,
        predicate: equivalent.predicate || "",
      });
      continue;
    }
    if (!actual && !equivalent) {
      missingIndexes.push(name);
      if (expected.unique) missingUniqueConstraints.push({ name, reason: "missing_unique_index" });
      genuinelyMissingIndexes.push({ name, table: expected.table, columns: expected.columns, unique: expected.unique, predicate: expected.predicate || "" });
      continue;
    }
  }
  return { missingIndexes, malformedIndexes, missingUniqueConstraints, equivalentExistingIndexes, genuinelyMissingIndexes };
}

function inspectPrerequisiteUniqueProtections(indexes) {
  const prerequisiteUniqueProtections = {};
  const plannedPrerequisiteIndexes = [];
  const uniqueIndexesByTable = {};
  for (const index of indexes.values()) {
    if (!index.unique) continue;
    if (!uniqueIndexesByTable[index.table]) uniqueIndexesByTable[index.table] = [];
    uniqueIndexesByTable[index.table].push({
      name: index.name,
      columns: index.columns,
      unique: index.unique,
      predicate: index.predicate || "",
      definition: index.definition || "",
    });
  }
  for (const [logicalName, requirement] of Object.entries(PREREQUISITE_UNIQUE_PROTECTIONS)) {
    const expected = parseIndexRequirement(requirement.plannedIndexName, PREREQUISITE_UNIQUE_INDEXES[requirement.plannedIndexName]);
    const actualByName = indexes.get(requirement.plannedIndexName);
    const equivalent = findEquivalentIndex(indexes, expected);
    if (actualByName && !indexMatchesRequirement(actualByName, expected)) {
      prerequisiteUniqueProtections[logicalName] = {
        status: "malformed",
        plannedName: requirement.plannedIndexName,
        table: requirement.table,
        columns: requirement.columns,
        actualObjectName: actualByName.name,
        actualColumns: actualByName.columns,
        uniqueness: actualByName.unique,
        predicate: actualByName.predicate || "",
        willCreate: false,
      };
      continue;
    }
    if (equivalent) {
      prerequisiteUniqueProtections[logicalName] = {
        status: "existing_equivalent",
        plannedName: requirement.plannedIndexName,
        table: requirement.table,
        columns: requirement.columns,
        actualObjectName: equivalent.name,
        actualColumns: equivalent.columns,
        uniqueness: equivalent.unique,
        predicate: equivalent.predicate || "",
        willCreate: false,
      };
      continue;
    }
    prerequisiteUniqueProtections[logicalName] = {
      status: "missing_planned",
      plannedName: requirement.plannedIndexName,
      table: requirement.table,
      columns: requirement.columns,
      actualObjectName: null,
      actualColumns: [],
      uniqueness: false,
      predicate: "",
      willCreate: true,
    };
    plannedPrerequisiteIndexes.push({
      name: requirement.plannedIndexName,
      table: requirement.table,
      columns: requirement.columns,
      statement: PREREQUISITE_UNIQUE_INDEXES[requirement.plannedIndexName],
    });
  }
  return { prerequisiteUniqueProtections, plannedPrerequisiteIndexes, uniqueIndexesByTable };
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
  const columnDetailsByTable = {};
  for (const table of tables) columnDetailsByTable[table] = await columnDetailsFor(client, table);

  const missingColumns = {};
  const incompatibleColumnDefinitions = [];
  const nullableRequiredColumns = [];
  const missingDefaults = [];
  const safeColumnRepairs = [];
  const unsafeColumnRepairs = [];
  for (const [table, definitions] of Object.entries(SOURCE_ASSIGNMENT_COLUMNS)) {
    const details = columnDetailsByTable[table] || new Map();
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
  const {
    missingIndexes,
    malformedIndexes,
    missingUniqueConstraints,
    equivalentExistingIndexes,
    genuinelyMissingIndexes,
  } = compareIndexes(indexes);
  const {
    prerequisiteUniqueProtections,
    plannedPrerequisiteIndexes,
    uniqueIndexesByTable,
  } = inspectPrerequisiteUniqueProtections(indexes);
  const { missingPrimaryKeys, malformedPrimaryKeys } = comparePrimaryKeys(constraints, tableRowCounts);
  const { missingForeignKeys, malformedForeignKeys } = compareForeignKeys(constraints);
  const { missingCheckConstraints, malformedCheckConstraints } = compareCheckConstraints(constraints);

  const inspectionErrors = [];
  const notApplicableChecks = [];
  const integrityChecks = {};
  const checks = [
    { check: "duplicateWorkspaceIdClient", table: "workspaces", requiredTables: ["workspaces"], requiredColumns: ["workspaces.id", "workspaces.client_id"], query: "SELECT count(*)::int AS count FROM (SELECT id, client_id FROM workspaces GROUP BY 1,2 HAVING count(*) > 1) d" },
    { check: "duplicateSourceIdClient", table: "sources", requiredTables: ["sources"], requiredColumns: ["sources.id", "sources.client_id"], query: "SELECT count(*)::int AS count FROM (SELECT id, client_id FROM sources GROUP BY 1,2 HAVING count(*) > 1) d" },
    { check: "duplicateSourceIdClientChannel", table: "sources", requiredTables: ["sources"], requiredColumns: ["sources.id", "sources.client_id", "sources.publisher_channel_id"], query: "SELECT count(*)::int AS count FROM (SELECT id, client_id, publisher_channel_id FROM sources GROUP BY 1,2,3 HAVING count(*) > 1) d" },
    { check: "duplicatePublisherChannelIdProfile", table: "publisher_channels", requiredTables: ["publisher_channels"], requiredColumns: ["publisher_channels.id", "publisher_channels.publisher_profile_id"], query: "SELECT count(*)::int AS count FROM (SELECT id, publisher_profile_id FROM publisher_channels GROUP BY 1,2 HAVING count(*) > 1) d" },
    { check: "duplicateClientPublisherSelectionIdClient", table: "client_publisher_selections", requiredTables: ["client_publisher_selections"], requiredColumns: ["client_publisher_selections.id", "client_publisher_selections.client_id"], query: "SELECT count(*)::int AS count FROM (SELECT id, client_id FROM client_publisher_selections GROUP BY 1,2 HAVING count(*) > 1) d" },
    { check: "duplicateClientPublisherSelectionIdClientPublisher", table: "client_publisher_selections", requiredTables: ["client_publisher_selections"], requiredColumns: ["client_publisher_selections.id", "client_publisher_selections.client_id", "client_publisher_selections.publisher_profile_id"], query: "SELECT count(*)::int AS count FROM (SELECT id, client_id, publisher_profile_id FROM client_publisher_selections GROUP BY 1,2,3 HAVING count(*) > 1) d" },
    { check: "invalidAssignmentStatus", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments"], requiredColumns: ["workspace_source_assignments.status"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE status NOT IN ('draft','testing','ready','active','paused','archived')" },
    { check: "invalidAssignmentTestStatus", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments"], requiredColumns: ["workspace_source_assignments.test_status"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE test_status NOT IN ('untested','passed','warning','failed','stale')" },
    { check: "invalidAssignmentEnabledStatus", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments"], requiredColumns: ["workspace_source_assignments.status", "workspace_source_assignments.enabled"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE NOT ((status = 'active' AND enabled IS TRUE) OR (status <> 'active' AND enabled IS FALSE))" },
    { check: "invalidRunType", table: "workspace_source_assignment_tests", requiredTables: ["workspace_source_assignment_tests"], requiredColumns: ["workspace_source_assignment_tests.test_type"], query: "SELECT count(*)::int AS count FROM workspace_source_assignment_tests WHERE test_type NOT IN ('connectivity','relevance','full')" },
    { check: "invalidRunStatus", table: "workspace_source_assignment_tests", requiredTables: ["workspace_source_assignment_tests"], requiredColumns: ["workspace_source_assignment_tests.status"], query: "SELECT count(*)::int AS count FROM workspace_source_assignment_tests WHERE status NOT IN ('running','passed','warning','failed')" },
    { check: "workspaceClientMismatch", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "workspaces"], requiredColumns: ["workspace_source_assignments.workspace_id", "workspace_source_assignments.client_id", "workspaces.id", "workspaces.client_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN workspaces w ON w.id=a.workspace_id AND w.client_id=a.client_id WHERE w.id IS NULL" },
    { check: "sourceClientMismatch", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "sources"], requiredColumns: ["workspace_source_assignments.source_id", "workspace_source_assignments.client_id", "sources.id", "sources.client_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN sources s ON s.id=a.source_id AND s.client_id=a.client_id WHERE s.id IS NULL" },
    { check: "sourceChannelMismatch", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "sources"], requiredColumns: ["workspace_source_assignments.source_id", "workspace_source_assignments.publisher_channel_id", "sources.id", "sources.publisher_channel_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a JOIN sources s ON s.id=a.source_id WHERE s.publisher_channel_id IS DISTINCT FROM a.publisher_channel_id" },
    { check: "selectionPublisherMismatch", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "client_publisher_selections"], requiredColumns: ["workspace_source_assignments.client_publisher_selection_id", "workspace_source_assignments.client_id", "workspace_source_assignments.publisher_profile_id", "client_publisher_selections.id", "client_publisher_selections.client_id", "client_publisher_selections.publisher_profile_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN client_publisher_selections cps ON cps.id=a.client_publisher_selection_id AND cps.client_id=a.client_id AND cps.publisher_profile_id=a.publisher_profile_id WHERE cps.id IS NULL" },
    { check: "assignmentSelectionClientPublisherMismatch", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "client_publisher_selections"], requiredColumns: ["workspace_source_assignments.client_publisher_selection_id", "workspace_source_assignments.client_id", "workspace_source_assignments.publisher_profile_id", "client_publisher_selections.id", "client_publisher_selections.client_id", "client_publisher_selections.publisher_profile_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN client_publisher_selections cps ON cps.id=a.client_publisher_selection_id AND cps.client_id=a.client_id AND cps.publisher_profile_id=a.publisher_profile_id WHERE cps.id IS NULL" },
    { check: "assignmentSourceClientChannelMismatch", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "sources"], requiredColumns: ["workspace_source_assignments.source_id", "workspace_source_assignments.client_id", "workspace_source_assignments.publisher_channel_id", "sources.id", "sources.client_id", "sources.publisher_channel_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN sources s ON s.id=a.source_id AND s.client_id=a.client_id AND s.publisher_channel_id=a.publisher_channel_id WHERE s.id IS NULL" },
    { check: "assignmentChannelPublisherMismatch", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "publisher_channels"], requiredColumns: ["workspace_source_assignments.publisher_channel_id", "workspace_source_assignments.publisher_profile_id", "publisher_channels.id", "publisher_channels.publisher_profile_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN publisher_channels pc ON pc.id=a.publisher_channel_id AND pc.publisher_profile_id=a.publisher_profile_id WHERE pc.id IS NULL" },
    { check: "testAssignmentClientWorkspaceMismatch", table: "workspace_source_assignment_tests", requiredTables: ["workspace_source_assignment_tests", "workspace_source_assignments"], requiredColumns: ["workspace_source_assignment_tests.assignment_id", "workspace_source_assignment_tests.client_id", "workspace_source_assignment_tests.workspace_id", "workspace_source_assignments.id", "workspace_source_assignments.client_id", "workspace_source_assignments.workspace_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignment_tests t LEFT JOIN workspace_source_assignments a ON a.id=t.assignment_id AND a.client_id=t.client_id AND a.workspace_id=t.workspace_id WHERE a.id IS NULL" },
    { check: "testAssignmentSourceMismatch", table: "workspace_source_assignment_tests", requiredTables: ["workspace_source_assignment_tests", "workspace_source_assignments"], requiredColumns: ["workspace_source_assignment_tests.assignment_id", "workspace_source_assignment_tests.source_id", "workspace_source_assignments.id", "workspace_source_assignments.source_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignment_tests t LEFT JOIN workspace_source_assignments a ON a.id=t.assignment_id AND a.source_id=t.source_id WHERE a.id IS NULL" },
    { check: "testAssignmentChannelMismatch", table: "workspace_source_assignment_tests", requiredTables: ["workspace_source_assignment_tests", "workspace_source_assignments"], requiredColumns: ["workspace_source_assignment_tests.assignment_id", "workspace_source_assignment_tests.publisher_channel_id", "workspace_source_assignments.id", "workspace_source_assignments.publisher_channel_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignment_tests t LEFT JOIN workspace_source_assignments a ON a.id=t.assignment_id AND a.publisher_channel_id=t.publisher_channel_id WHERE a.id IS NULL" },
    { check: "testAssignmentClientWorkspaceSourceMismatch", table: "workspace_source_assignment_tests", requiredTables: ["workspace_source_assignment_tests", "workspace_source_assignments"], requiredColumns: ["workspace_source_assignment_tests.assignment_id", "workspace_source_assignment_tests.client_id", "workspace_source_assignment_tests.workspace_id", "workspace_source_assignment_tests.source_id", "workspace_source_assignment_tests.publisher_channel_id", "workspace_source_assignments.id", "workspace_source_assignments.client_id", "workspace_source_assignments.workspace_id", "workspace_source_assignments.source_id", "workspace_source_assignments.publisher_channel_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignment_tests t LEFT JOIN workspace_source_assignments a ON a.id=t.assignment_id AND a.client_id=t.client_id AND a.workspace_id=t.workspace_id AND a.source_id=t.source_id AND a.publisher_channel_id=t.publisher_channel_id WHERE a.id IS NULL" },
    { check: "latestTestWrongAssignment", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "workspace_source_assignment_tests"], requiredColumns: ["workspace_source_assignments.latest_test_run_id", "workspace_source_assignments.id", "workspace_source_assignment_tests.id", "workspace_source_assignment_tests.assignment_id"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a JOIN workspace_source_assignment_tests t ON t.id=a.latest_test_run_id WHERE t.assignment_id <> a.id" },
    { check: "activeAssignmentWithoutCurrentTest", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "workspace_source_assignment_tests", "workspace_relevance_profiles"], requiredColumns: ["workspace_source_assignments.status", "workspace_source_assignments.latest_test_run_id", "workspace_source_assignments.id", "workspace_source_assignments.workspace_id", "workspace_source_assignments.relevance_profile_version", "workspace_source_assignments.source_validation_identity", "workspace_source_assignments.assignment_config_identity", "workspace_source_assignment_tests.id", "workspace_source_assignment_tests.assignment_id", "workspace_source_assignment_tests.test_type", "workspace_source_assignment_tests.status", "workspace_source_assignment_tests.relevance_profile_version", "workspace_source_assignment_tests.source_validation_identity", "workspace_source_assignment_tests.assignment_config_identity", "workspace_relevance_profiles.workspace_id", "workspace_relevance_profiles.profile_version"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN workspace_source_assignment_tests t ON t.id=a.latest_test_run_id AND t.assignment_id=a.id LEFT JOIN workspace_relevance_profiles p ON p.workspace_id=a.workspace_id WHERE a.status='active' AND (t.id IS NULL OR t.test_type NOT IN ('relevance','full') OR t.status NOT IN ('passed','warning') OR t.relevance_profile_version <> COALESCE(p.profile_version, a.relevance_profile_version) OR t.source_validation_identity IS DISTINCT FROM a.source_validation_identity OR t.assignment_config_identity IS DISTINCT FROM a.assignment_config_identity)" },
    { check: "activeAssignmentWithStaleTest", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments", "workspace_relevance_profiles"], requiredColumns: ["workspace_source_assignments.status", "workspace_source_assignments.test_status", "workspace_source_assignments.workspace_id", "workspace_source_assignments.relevance_profile_version", "workspace_relevance_profiles.workspace_id", "workspace_relevance_profiles.profile_version"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments a LEFT JOIN workspace_relevance_profiles p ON p.workspace_id=a.workspace_id WHERE a.status='active' AND (a.test_status='stale' OR a.relevance_profile_version <> COALESCE(p.profile_version, a.relevance_profile_version))" },
    { check: "activeAssignmentDisabledMismatch", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments"], requiredColumns: ["workspace_source_assignments.status", "workspace_source_assignments.enabled"], query: "SELECT count(*)::int AS count FROM workspace_source_assignments WHERE (status='active' AND enabled IS DISTINCT FROM TRUE) OR (status <> 'active' AND enabled IS DISTINCT FROM FALSE)" },
    { check: "inactiveSourceWithActiveAssignment", table: "sources", requiredTables: ["sources", "workspace_source_assignments"], requiredColumns: ["sources.id", "sources.active", "workspace_source_assignments.source_id", "workspace_source_assignments.status", "workspace_source_assignments.enabled"], query: "SELECT count(*)::int AS count FROM sources s WHERE s.active IS DISTINCT FROM TRUE AND EXISTS (SELECT 1 FROM workspace_source_assignments a WHERE a.source_id=s.id AND a.status='active' AND a.enabled IS TRUE)" },
    { check: "activeSourceWithoutActiveAssignment", table: "sources", requiredTables: ["sources", "workspace_source_assignments"], requiredColumns: ["sources.id", "sources.active", "sources.publisher_channel_id", "workspace_source_assignments.source_id", "workspace_source_assignments.status", "workspace_source_assignments.enabled"], query: "SELECT count(*)::int AS count FROM sources s WHERE s.active IS TRUE AND s.publisher_channel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspace_source_assignments a WHERE a.source_id=s.id AND a.status='active' AND a.enabled IS TRUE)" },
    { check: "duplicateOperationalSourceIdentity", table: "sources", requiredTables: ["sources"], requiredColumns: ["sources.client_id", "sources.source_identity_key"], query: "SELECT count(*)::int AS count FROM (SELECT client_id, source_identity_key FROM sources WHERE source_identity_key IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) d" },
    { check: "duplicateWorkspaceSource", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments"], requiredColumns: ["workspace_source_assignments.workspace_id", "workspace_source_assignments.source_id"], query: "SELECT count(*)::int AS count FROM (SELECT workspace_id, source_id FROM workspace_source_assignments GROUP BY 1,2 HAVING count(*) > 1) d" },
    { check: "duplicateWorkspaceChannel", table: "workspace_source_assignments", requiredTables: ["workspace_source_assignments"], requiredColumns: ["workspace_source_assignments.workspace_id", "workspace_source_assignments.publisher_channel_id"], query: "SELECT count(*)::int AS count FROM (SELECT workspace_id, publisher_channel_id FROM workspace_source_assignments GROUP BY 1,2 HAVING count(*) > 1) d" },
  ];
  const incompatibleRows = {};
  const integrityState = { inspectionErrors, notApplicableChecks, integrityChecks, tableRowCounts, columnDetailsByTable };
  for (const check of checks) {
    const result = await runIntegrityCheck(client, check, check.query, integrityState);
    incompatibleRows[check.check] = result.value;
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
    prerequisiteUniqueProtections,
    equivalentExistingIndexes,
    genuinelyMissingIndexes,
    plannedPrerequisiteIndexes,
    uniqueIndexesByTable,
    missingForeignKeys,
    malformedForeignKeys,
    missingCheckConstraints,
    malformedCheckConstraints,
    integrityChecks,
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
    const plannedSqlClassification = classifyPlannedSql(plannedSql);
    if (apply && !applySafe) {
      return { migration: "workspace-source-assignments", mode: "apply", writes: false, applySafe, before, plannedSql, plannedSqlClassification, error: "apply_not_safe" };
    }
    if (!apply) {
      return { migration: "workspace-source-assignments", mode: "dry-run", writes: false, applySafe, ...before, plannedSql, plannedSqlClassification, plannedStatementCount: plannedSql.length, futureApplyCommand: "npm run db:migrate:workspace-source-assignments -- --apply" };
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
      return { migration: "workspace-source-assignments", mode: "apply", writes: true, appliedStatements: plannedSql.length, plannedSqlClassification, before, after, applySafe: true };
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
  classifyPlannedSql,
  inspect,
  run,
};
