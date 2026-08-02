require("dotenv/config");
const { Client } = require("pg");

const RELEVANCE_STATUSES = [
  "direct_scope_match",
  "material_scope_impact",
  "contextual",
  "not_relevant",
  "needs_review",
];

const RELEVANCE_METHODS = ["deterministic", "ai", "manual", "imported"];

const WORKSPACE_SCOPE_MODES = [
  "global",
  "regional",
  "single_country",
  "multi_country",
  "subnational",
  "topic_only",
  "hybrid",
];

const WORKSPACE_PURPOSES = [
  "diplomatic_monitoring",
  "newsroom_monitoring",
  "country_desk",
  "regional_desk",
  "global_news",
  "topic_research",
  "humanitarian_monitoring",
  "competitor_monitoring",
  "reputation_monitoring",
  "crisis_monitoring",
  "industry_intelligence",
  "custom",
];

const TABLE_COLUMNS = {
  workspaces: [
    ["purpose", "text NOT NULL DEFAULT 'custom'"],
    ["scope_mode", "text NOT NULL DEFAULT 'hybrid'"],
    ["global_scope", "boolean NOT NULL DEFAULT false"],
    ["primary_country_codes", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["secondary_country_codes", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["region_codes", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["subnational_areas", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["preferred_languages", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["timezone", "text NOT NULL DEFAULT 'UTC'"],
    ["taxonomy_template_code", "text"],
    ["relevance_profile_code", "text"],
    ["reporting_template_code", "text"],
    ["active", "boolean NOT NULL DEFAULT true"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  workspace_relevance_profiles: [
    ["id", "serial PRIMARY KEY"],
    ["workspace_id", "integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE"],
    ["topics", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["subtopics", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["industries", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["entities", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["organizations", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["people", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["projects", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["events", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["multilingual_aliases", "jsonb"],
    ["inclusion_terms", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["exclusion_terms", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["impact_terms", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["contextual_terms", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["minimum_confidence", "integer NOT NULL DEFAULT 60"],
    ["include_contextual_by_default", "boolean NOT NULL DEFAULT false"],
    ["contextual_label", "text NOT NULL DEFAULT 'Strategic Context'"],
    ["profile_version", "integer NOT NULL DEFAULT 1"],
    ["active", "boolean NOT NULL DEFAULT true"],
    ["created_at", "timestamp DEFAULT now()"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  article_workspace_relevance: [
    ["id", "serial PRIMARY KEY"],
    ["client_id", "integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE"],
    ["workspace_id", "integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE"],
    ["article_id", "integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE"],
    ["relevance_status", "text NOT NULL DEFAULT 'needs_review'"],
    ["confidence", "integer NOT NULL DEFAULT 0"],
    ["short_reason", "text"],
    ["matched_scope", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["principal_country_codes", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["materially_affected_country_codes", "text[] NOT NULL DEFAULT '{}'::text[]"],
    ["supporting_signals", "jsonb NOT NULL DEFAULT '[]'::jsonb"],
    ["evaluation_method", "text NOT NULL DEFAULT 'deterministic'"],
    ["evaluator_version", "text NOT NULL DEFAULT 'workspace-relevance-v2'"],
    ["evaluated_at", "timestamp DEFAULT now()"],
    ["manual_override", "boolean NOT NULL DEFAULT false"],
    ["reviewed_by", "integer REFERENCES users(id)"],
    ["reviewed_at", "timestamp"],
    ["review_note", "text"],
    ["reopened_at", "timestamp"],
    ["created_at", "timestamp DEFAULT now()"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  workspace_relevance_history: [
    ["id", "serial PRIMARY KEY"],
    ["client_id", "integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE"],
    ["workspace_id", "integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE"],
    ["article_id", "integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE"],
    ["previous_status", "text"],
    ["new_status", "text NOT NULL"],
    ["previous_confidence", "integer"],
    ["new_confidence", "integer NOT NULL"],
    ["evaluation_method", "text NOT NULL"],
    ["changed_by", "integer REFERENCES users(id)"],
    ["reason", "text"],
    ["created_at", "timestamp DEFAULT now()"],
  ],
};

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS workspace_relevance_profiles (${TABLE_COLUMNS.workspace_relevance_profiles.map(([name, definition]) => `${name} ${definition}`).join(", ")})`,
  `CREATE TABLE IF NOT EXISTS article_workspace_relevance (${TABLE_COLUMNS.article_workspace_relevance.map(([name, definition]) => `${name} ${definition}`).join(", ")})`,
  `CREATE TABLE IF NOT EXISTS workspace_relevance_history (${TABLE_COLUMNS.workspace_relevance_history.map(([name, definition]) => `${name} ${definition}`).join(", ")})`,
];

const INDEXES = {
  workspaces_client_idx: "CREATE INDEX IF NOT EXISTS workspaces_client_idx ON workspaces (client_id)",
  workspaces_client_active_idx: "CREATE INDEX IF NOT EXISTS workspaces_client_active_idx ON workspaces (client_id, active)",
  workspaces_id_client_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspaces_id_client_unique ON workspaces (id, client_id)",
  articles_id_client_unique: "CREATE UNIQUE INDEX IF NOT EXISTS articles_id_client_unique ON articles (id, client_id)",
  workspace_relevance_profiles_workspace_unique: "CREATE UNIQUE INDEX IF NOT EXISTS workspace_relevance_profiles_workspace_unique ON workspace_relevance_profiles (workspace_id)",
  workspace_relevance_profiles_active_idx: "CREATE INDEX IF NOT EXISTS workspace_relevance_profiles_active_idx ON workspace_relevance_profiles (workspace_id, active)",
  article_workspace_relevance_workspace_article_unique: "CREATE UNIQUE INDEX IF NOT EXISTS article_workspace_relevance_workspace_article_unique ON article_workspace_relevance (workspace_id, article_id)",
  idx_article_workspace_relevance_client: "CREATE INDEX IF NOT EXISTS idx_article_workspace_relevance_client ON article_workspace_relevance (client_id, relevance_status)",
  idx_article_workspace_relevance_workspace: "CREATE INDEX IF NOT EXISTS idx_article_workspace_relevance_workspace ON article_workspace_relevance (workspace_id, relevance_status)",
  idx_article_workspace_relevance_review: "CREATE INDEX IF NOT EXISTS idx_article_workspace_relevance_review ON article_workspace_relevance (workspace_id, relevance_status, confidence)",
  workspace_relevance_history_workspace_article_idx: "CREATE INDEX IF NOT EXISTS workspace_relevance_history_workspace_article_idx ON workspace_relevance_history (workspace_id, article_id)",
  workspace_relevance_history_client_idx: "CREATE INDEX IF NOT EXISTS workspace_relevance_history_client_idx ON workspace_relevance_history (client_id, created_at)",
};

const CHECKS = {
  workspaces_scope_mode_ck: {
    table: "workspaces",
    expression: `scope_mode IN (${WORKSPACE_SCOPE_MODES.map((item) => `'${item}'`).join(", ")})`,
  },
  workspaces_purpose_ck: {
    table: "workspaces",
    expression: `purpose IN (${WORKSPACE_PURPOSES.map((item) => `'${item}'`).join(", ")})`,
  },
  workspace_relevance_profiles_min_confidence_ck: {
    table: "workspace_relevance_profiles",
    expression: "minimum_confidence BETWEEN 0 AND 100",
  },
  article_workspace_relevance_status_ck: {
    table: "article_workspace_relevance",
    expression: `relevance_status IN (${RELEVANCE_STATUSES.map((item) => `'${item}'`).join(", ")})`,
  },
  article_workspace_relevance_method_ck: {
    table: "article_workspace_relevance",
    expression: `evaluation_method IN (${RELEVANCE_METHODS.map((item) => `'${item}'`).join(", ")})`,
  },
  article_workspace_relevance_confidence_ck: {
    table: "article_workspace_relevance",
    expression: "confidence BETWEEN 0 AND 100",
  },
  workspace_relevance_history_previous_status_ck: {
    table: "workspace_relevance_history",
    expression: `previous_status IS NULL OR previous_status IN (${RELEVANCE_STATUSES.map((item) => `'${item}'`).join(", ")})`,
  },
  workspace_relevance_history_new_status_ck: {
    table: "workspace_relevance_history",
    expression: `new_status IN (${RELEVANCE_STATUSES.map((item) => `'${item}'`).join(", ")})`,
  },
  workspace_relevance_history_method_ck: {
    table: "workspace_relevance_history",
    expression: `evaluation_method IN (${RELEVANCE_METHODS.map((item) => `'${item}'`).join(", ")})`,
  },
  workspace_relevance_history_confidence_ck: {
    table: "workspace_relevance_history",
    expression: "(previous_confidence IS NULL OR previous_confidence BETWEEN 0 AND 100) AND new_confidence BETWEEN 0 AND 100",
  },
};

const FOREIGN_KEYS = {
  article_workspace_relevance_workspace_client_fk: {
    table: "article_workspace_relevance",
    expression: "FOREIGN KEY (workspace_id, client_id) REFERENCES workspaces(id, client_id) ON DELETE CASCADE",
  },
  article_workspace_relevance_article_client_fk: {
    table: "article_workspace_relevance",
    expression: "FOREIGN KEY (article_id, client_id) REFERENCES articles(id, client_id) ON DELETE CASCADE",
  },
  workspace_relevance_history_workspace_client_fk: {
    table: "workspace_relevance_history",
    expression: "FOREIGN KEY (workspace_id, client_id) REFERENCES workspaces(id, client_id) ON DELETE CASCADE",
  },
  workspace_relevance_history_article_client_fk: {
    table: "workspace_relevance_history",
    expression: "FOREIGN KEY (article_id, client_id) REFERENCES articles(id, client_id) ON DELETE CASCADE",
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
Workspace relevance schema migration

Dry run:
  npm run db:migrate:workspace-relevance -- --dry-run

Apply:
  npm run db:migrate:workspace-relevance -- --apply
`);
}

function constraintStatement(name, spec) {
  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
    ALTER TABLE ${spec.table} ADD CONSTRAINT ${name} ${spec.expression.startsWith("FOREIGN KEY") ? spec.expression : `CHECK (${spec.expression})`};
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

async function countIfTableExists(client, table, whereSql) {
  if (!(await tableExists(client, table))) return 0;
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${whereSql}`);
  return Number(result.rows[0]?.count || 0);
}

async function countIfColumnsExist(client, table, columnNames, whereSql) {
  if (!(await hasColumns(client, table, columnNames))) return 0;
  return countIfTableExists(client, table, whereSql);
}

async function incompatibleRows(client) {
  return {
    invalidWorkspaceScopeModes: await countIfColumnsExist(client, "workspaces", ["scope_mode"], `scope_mode IS NOT NULL AND scope_mode NOT IN (${WORKSPACE_SCOPE_MODES.map((item) => `'${item}'`).join(", ")})`),
    invalidWorkspacePurposes: await countIfColumnsExist(client, "workspaces", ["purpose"], `purpose IS NOT NULL AND purpose NOT IN (${WORKSPACE_PURPOSES.map((item) => `'${item}'`).join(", ")})`),
    invalidProfileMinimumConfidence: await countIfColumnsExist(client, "workspace_relevance_profiles", ["minimum_confidence"], "minimum_confidence < 0 OR minimum_confidence > 100"),
    invalidArticleRelevanceStatus: await countIfColumnsExist(client, "article_workspace_relevance", ["relevance_status"], `relevance_status NOT IN (${RELEVANCE_STATUSES.map((item) => `'${item}'`).join(", ")})`),
    invalidArticleRelevanceMethod: await countIfColumnsExist(client, "article_workspace_relevance", ["evaluation_method"], `evaluation_method NOT IN (${RELEVANCE_METHODS.map((item) => `'${item}'`).join(", ")})`),
    invalidArticleRelevanceConfidence: await countIfColumnsExist(client, "article_workspace_relevance", ["confidence"], "confidence < 0 OR confidence > 100"),
    invalidHistoryStatus: await countIfColumnsExist(client, "workspace_relevance_history", ["previous_status", "new_status"], `(previous_status IS NOT NULL AND previous_status NOT IN (${RELEVANCE_STATUSES.map((item) => `'${item}'`).join(", ")})) OR new_status NOT IN (${RELEVANCE_STATUSES.map((item) => `'${item}'`).join(", ")})`),
    invalidHistoryMethod: await countIfColumnsExist(client, "workspace_relevance_history", ["evaluation_method"], `evaluation_method NOT IN (${RELEVANCE_METHODS.map((item) => `'${item}'`).join(", ")})`),
    invalidHistoryConfidence: await countIfColumnsExist(client, "workspace_relevance_history", ["previous_confidence", "new_confidence"], "(previous_confidence IS NOT NULL AND (previous_confidence < 0 OR previous_confidence > 100)) OR new_confidence < 0 OR new_confidence > 100"),
    articleWorkspaceTenantMismatch: await countIfColumnsExist(client, "article_workspace_relevance", ["workspace_id", "article_id", "client_id"], `NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = article_workspace_relevance.workspace_id AND w.client_id = article_workspace_relevance.client_id) OR NOT EXISTS (SELECT 1 FROM articles a WHERE a.id = article_workspace_relevance.article_id AND a.client_id = article_workspace_relevance.client_id)`),
    historyTenantMismatch: await countIfColumnsExist(client, "workspace_relevance_history", ["workspace_id", "article_id", "client_id"], `NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_relevance_history.workspace_id AND w.client_id = workspace_relevance_history.client_id) OR NOT EXISTS (SELECT 1 FROM articles a WHERE a.id = workspace_relevance_history.article_id AND a.client_id = workspace_relevance_history.client_id)`),
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

  return {
    missingWorkspaceColumns: missingColumns.workspaces,
    missingRelevanceColumns: {
      workspace_relevance_profiles: missingColumns.workspace_relevance_profiles,
      article_workspace_relevance: missingColumns.article_workspace_relevance,
      workspace_relevance_history: missingColumns.workspace_relevance_history,
    },
    missingIndexes: Object.keys(INDEXES).filter((name) => !indexSet.has(name)),
    missingUniqueConstraints: ["workspaces_id_client_unique", "articles_id_client_unique", "workspace_relevance_profiles_workspace_unique", "article_workspace_relevance_workspace_article_unique"].filter((name) => !indexSet.has(name) && !constraintSet.has(name)),
    missingForeignKeys: Object.keys(FOREIGN_KEYS).filter((name) => !constraintSet.has(name)),
    missingCheckConstraints: Object.keys(CHECKS).filter((name) => !constraintSet.has(name)),
    incompatibleRows: incompatible,
    applySafe: Object.values(incompatible).every((count) => Number(count) === 0),
  };
}

function plannedStatements() {
  const alterWorkspace = TABLE_COLUMNS.workspaces.map(([name, definition]) =>
    `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ${name} ${definition}`,
  );
  const alterRelevanceTables = Object.entries(TABLE_COLUMNS)
    .filter(([table]) => table !== "workspaces")
    .flatMap(([table, columns]) => columns
      .filter(([name]) => name !== "id")
      .map(([name, definition]) => `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${definition}`));
  return [
    ...CREATE_TABLES,
    ...alterWorkspace,
    ...alterRelevanceTables,
    ...Object.values(INDEXES),
    ...Object.entries(CHECKS).map(([name, spec]) => constraintStatement(name, spec)),
    ...Object.entries(FOREIGN_KEYS).map(([name, spec]) => constraintStatement(name, spec)),
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const before = await inspect(client);
    const statements = plannedStatements();

    if (!args.apply) {
      console.log(JSON.stringify({
        migration: "workspace-relevance",
        mode: "dry-run",
        writes: false,
        before,
        plannedStatements: statements,
        applySafe: before.applySafe,
        applyCommand: "npm run db:migrate:workspace-relevance -- --apply",
      }, null, 2));
      return;
    }

    if (!before.applySafe) {
      throw new Error(JSON.stringify({
        migration: "workspace-relevance",
        mode: "apply",
        writes: false,
        applySafe: false,
        incompatibleRows: before.incompatibleRows,
        message: "Workspace relevance migration aborted before writes because incompatible rows exist.",
      }, null, 2));
    }

    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('nws360.workspace_relevance_migration'))");
      for (const statement of statements) {
        await client.query(statement);
      }
      const afterChecks = await incompatibleRows(client);
      const safeAfter = Object.values(afterChecks).every((count) => Number(count) === 0);
      if (!safeAfter) {
        throw new Error(`Post-migration integrity check failed: ${JSON.stringify(afterChecks)}`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const after = await inspect(client);
    console.log(JSON.stringify({
      migration: "workspace-relevance",
      mode: "apply",
      writes: true,
      appliedStatements: statements.length,
      before,
      after,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
