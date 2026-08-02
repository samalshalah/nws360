require("dotenv/config");
const { Client } = require("pg");

const WORKSPACE_COLUMNS = [
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
];

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS workspace_relevance_profiles (
    id serial PRIMARY KEY,
    workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    topics text[] NOT NULL DEFAULT '{}'::text[],
    subtopics text[] NOT NULL DEFAULT '{}'::text[],
    industries text[] NOT NULL DEFAULT '{}'::text[],
    entities text[] NOT NULL DEFAULT '{}'::text[],
    organizations text[] NOT NULL DEFAULT '{}'::text[],
    people text[] NOT NULL DEFAULT '{}'::text[],
    projects text[] NOT NULL DEFAULT '{}'::text[],
    events text[] NOT NULL DEFAULT '{}'::text[],
    multilingual_aliases jsonb,
    inclusion_terms text[] NOT NULL DEFAULT '{}'::text[],
    exclusion_terms text[] NOT NULL DEFAULT '{}'::text[],
    impact_terms text[] NOT NULL DEFAULT '{}'::text[],
    contextual_terms text[] NOT NULL DEFAULT '{}'::text[],
    minimum_confidence integer NOT NULL DEFAULT 60,
    include_contextual_by_default boolean NOT NULL DEFAULT false,
    contextual_label text NOT NULL DEFAULT 'Strategic Context',
    profile_version integer NOT NULL DEFAULT 1,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS workspace_relevance_profiles_workspace_unique
     ON workspace_relevance_profiles (workspace_id)`,
  `CREATE INDEX IF NOT EXISTS workspace_relevance_profiles_active_idx
     ON workspace_relevance_profiles (workspace_id, active)`,
  `CREATE TABLE IF NOT EXISTS article_workspace_relevance (
    id serial PRIMARY KEY,
    client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    article_id integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    relevance_status text NOT NULL DEFAULT 'needs_review',
    confidence integer NOT NULL DEFAULT 0,
    short_reason text,
    matched_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
    principal_country_codes text[] NOT NULL DEFAULT '{}'::text[],
    materially_affected_country_codes text[] NOT NULL DEFAULT '{}'::text[],
    supporting_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
    evaluation_method text NOT NULL DEFAULT 'deterministic',
    evaluator_version text NOT NULL DEFAULT 'workspace-relevance-v1',
    evaluated_at timestamp DEFAULT now(),
    manual_override boolean NOT NULL DEFAULT false,
    reviewed_by integer REFERENCES users(id),
    reviewed_at timestamp,
    review_note text,
    reopened_at timestamp,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS article_workspace_relevance_workspace_article_unique
     ON article_workspace_relevance (workspace_id, article_id)`,
  `CREATE INDEX IF NOT EXISTS idx_article_workspace_relevance_client
     ON article_workspace_relevance (client_id, relevance_status)`,
  `CREATE INDEX IF NOT EXISTS idx_article_workspace_relevance_workspace
     ON article_workspace_relevance (workspace_id, relevance_status)`,
  `CREATE INDEX IF NOT EXISTS idx_article_workspace_relevance_review
     ON article_workspace_relevance (workspace_id, relevance_status, confidence)`,
  `CREATE TABLE IF NOT EXISTS workspace_relevance_history (
    id serial PRIMARY KEY,
    client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    article_id integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    previous_status text,
    new_status text NOT NULL,
    previous_confidence integer,
    new_confidence integer NOT NULL,
    evaluation_method text NOT NULL,
    changed_by integer REFERENCES users(id),
    reason text,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS workspace_relevance_history_workspace_article_idx
     ON workspace_relevance_history (workspace_id, article_id)`,
  `CREATE INDEX IF NOT EXISTS workspace_relevance_history_client_idx
     ON workspace_relevance_history (client_id, created_at)`,
];

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

async function inspect(client) {
  const columnRows = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'workspaces'
  `);
  const existingWorkspaceColumns = new Set(columnRows.rows.map((row) => row.column_name));
  const tableRows = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('workspace_relevance_profiles', 'article_workspace_relevance', 'workspace_relevance_history')
  `);
  const existingTables = new Set(tableRows.rows.map((row) => row.table_name));
  return {
    existingWorkspaceColumns: Array.from(existingWorkspaceColumns).sort(),
    missingWorkspaceColumns: WORKSPACE_COLUMNS
      .filter(([name]) => !existingWorkspaceColumns.has(name))
      .map(([name, definition]) => ({ name, definition })),
    existingTables: Array.from(existingTables).sort(),
  };
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
    const alterStatements = WORKSPACE_COLUMNS.map(([name, definition]) =>
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ${name} ${definition}`,
    );
    const statements = [
      ...alterStatements,
      `CREATE INDEX IF NOT EXISTS workspaces_client_idx ON workspaces (client_id)`,
      `CREATE INDEX IF NOT EXISTS workspaces_client_active_idx ON workspaces (client_id, active)`,
      ...CREATE_STATEMENTS,
    ];

    if (!args.apply) {
      console.log(JSON.stringify({
        migration: "workspace-relevance",
        mode: "dry-run",
        writes: false,
        before,
        plannedStatements: statements,
        applyCommand: "npm run db:migrate:workspace-relevance -- --apply",
      }, null, 2));
      return;
    }

    await client.query("BEGIN");
    try {
      for (const statement of statements) {
        await client.query(statement);
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
