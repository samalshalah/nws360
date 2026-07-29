require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS saved_feed_views (
        id serial PRIMARY KEY,
        name text NOT NULL,
        filters jsonb NOT NULL,
        is_shared boolean NOT NULL DEFAULT true,
        user_id integer NOT NULL REFERENCES users(id),
        client_id integer NOT NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_saved_feed_views_client ON saved_feed_views (client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_saved_feed_views_user ON saved_feed_views (user_id)`);
    await client.query("COMMIT");
    console.log("Saved feed views migration complete");
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
