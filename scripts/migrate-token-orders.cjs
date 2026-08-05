require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nws360_token_orders'))");

    await client.query(`
      CREATE TABLE IF NOT EXISTS token_orders (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        requested_by INTEGER NOT NULL REFERENCES users(id),
        tokens_requested INTEGER NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        admin_note TEXT,
        resolved_by INTEGER REFERENCES users(id),
        resolved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_token_orders_client ON token_orders (client_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_token_orders_status ON token_orders (status)
    `);

    await client.query("COMMIT");
    console.log("Token orders migration complete");
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
