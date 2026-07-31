require("dotenv").config();
const { Client } = require("pg");

const STATEMENTS = [
  `ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_status text NOT NULL DEFAULT 'direct_scope_match'`,
  `ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_confidence integer`,
  `ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_reason text`,
  `ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_method text NOT NULL DEFAULT 'migration'`,
  `ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_matched_signals text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_evaluated_at timestamp`,
  `ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_reviewed_by integer REFERENCES users(id)`,
  `ALTER TABLE articles ADD COLUMN IF NOT EXISTS relevance_reviewed_at timestamp`,
  `UPDATE articles
      SET relevance_status = CASE relevance_status
        WHEN 'direct_iraq' THEN 'direct_scope_match'
        WHEN 'iraq_impact' THEN 'material_scope_impact'
        WHEN 'regional_context' THEN 'contextual'
        ELSE relevance_status
      END
    WHERE relevance_status IN ('direct_iraq', 'iraq_impact', 'regional_context')`,
  `CREATE INDEX IF NOT EXISTS idx_articles_client_relevance ON articles (client_id, relevance_status)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_relevance_review ON articles (client_id, relevance_status, relevance_evaluated_at)`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'mixed'`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS global_scope boolean NOT NULL DEFAULT false`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS primary_countries text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS secondary_countries text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS regions text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS subnational_areas text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS subtopics text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS industries text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS entities text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS organizations text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS people text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS projects text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS events text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS multilingual_aliases jsonb`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS inclusion_phrases text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS exclusion_phrases text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS impact_phrases text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS contextual_phrases text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS preferred_languages text[] NOT NULL DEFAULT '{}'::text[]`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS include_contextual_by_default boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS article_workspace_relevance (
    id serial PRIMARY KEY,
    article_id integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    client_id integer NOT NULL,
    relevance_status text NOT NULL DEFAULT 'needs_review',
    confidence integer NOT NULL DEFAULT 0,
    short_reason text,
    matched_scope text[] NOT NULL DEFAULT '{}'::text[],
    principal_countries text[] NOT NULL DEFAULT '{}'::text[],
    materially_affected_countries text[] NOT NULL DEFAULT '{}'::text[],
    supporting_signals text[] NOT NULL DEFAULT '{}'::text[],
    relevance_method text NOT NULL DEFAULT 'deterministic',
    manual_override boolean NOT NULL DEFAULT false,
    reviewed_by integer REFERENCES users(id),
    reviewed_at timestamp,
    reopened_at timestamp,
    evaluated_at timestamp DEFAULT now(),
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS article_workspace_relevance_unique ON article_workspace_relevance (article_id, workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_article_workspace_relevance_client ON article_workspace_relevance (client_id, relevance_status)`,
  `CREATE INDEX IF NOT EXISTS idx_article_workspace_relevance_workspace ON article_workspace_relevance (workspace_id, relevance_status)`,
  `CREATE TABLE IF NOT EXISTS rejected_ingestion_items (
    id serial PRIMARY KEY,
    client_id integer NOT NULL,
    source_id integer REFERENCES sources(id) ON DELETE CASCADE,
    url text,
    title text,
    published_at timestamp,
    rejection_status text NOT NULL,
    rejection_reason text,
    matched_signals text[] NOT NULL DEFAULT '{}'::text[],
    dedupe_key text NOT NULL,
    evaluated_at timestamp DEFAULT now(),
    expires_at timestamp,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rejected_items_client_source_key ON rejected_ingestion_items (client_id, source_id, dedupe_key)`,
  `CREATE INDEX IF NOT EXISTS idx_rejected_items_client_status ON rejected_ingestion_items (client_id, rejection_status)`,
  `CREATE INDEX IF NOT EXISTS idx_rejected_items_source ON rejected_ingestion_items (source_id)`,
];

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    confirmBackup: argv.includes("--confirm-backup"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`
Workspace relevance schema migration

Dry run:
  npm run db:migrate:workspace-relevance

Apply, only after a verified Neon backup:
  npm run db:migrate:workspace-relevance -- --apply --confirm-backup
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.apply) {
    console.log(JSON.stringify({
      migration: "workspace-relevance",
      mode: "dry-run",
      changes: STATEMENTS,
      writes: false,
      applyCommand: "npm run db:migrate:workspace-relevance -- --apply --confirm-backup",
    }, null, 2));
    return;
  }

  if (!args.confirmBackup) {
    throw new Error("--apply requires --confirm-backup. Create and verify a Neon backup before applying.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const statement of STATEMENTS) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ migration: "workspace-relevance", mode: "apply", appliedStatements: STATEMENTS.length }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

