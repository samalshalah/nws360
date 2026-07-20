require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE sources ADD COLUMN IF NOT EXISTS collector_config jsonb");
    await client.query("ALTER TABLE sources ADD COLUMN IF NOT EXISTS feed_token uuid");
    await client.query("UPDATE sources SET feed_token = gen_random_uuid() WHERE feed_token IS NULL");
    await client.query("ALTER TABLE sources ALTER COLUMN feed_token SET DEFAULT gen_random_uuid()");
    await client.query("ALTER TABLE sources ALTER COLUMN feed_token SET NOT NULL");
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS sources_feed_token_idx ON sources(feed_token)");
    await client.query("COMMIT");
    const result = await client.query("SELECT COUNT(*)::int AS sources, COUNT(feed_token)::int AS tokens FROM sources");
    console.log(`Website collector migration complete: ${result.rows[0].tokens}/${result.rows[0].sources} sources tokenized`);
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
