require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'routine'`);
    await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS province text`);
    await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'new'`);
    await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS manual_tags text[] NOT NULL DEFAULT '{}'::text[]`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_priority ON articles (client_id, priority)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_workflow ON articles (client_id, workflow_status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_province ON articles (client_id, province)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_manual_tags_gin ON articles USING gin (manual_tags)`);
    await client.query("COMMIT");
    console.log("Article workflow migration complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
