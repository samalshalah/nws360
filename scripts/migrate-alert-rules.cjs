require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_rules (
        id serial PRIMARY KEY,
        client_id integer NOT NULL REFERENCES clients(id),
        name text NOT NULL,
        description text,
        rule_type text NOT NULL DEFAULT 'keyword',
        search_term text,
        source_id integer REFERENCES sources(id) ON DELETE SET NULL,
        source_type text,
        category text,
        province text,
        severity text NOT NULL DEFAULT 'medium',
        active boolean DEFAULT true,
        notify_in_app boolean DEFAULT true,
        match_window_hours integer NOT NULL DEFAULT 24,
        created_by integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alert_rules_client ON alert_rules (client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alert_rules_client_active ON alert_rules (client_id, active)`);
    await client.query("COMMIT");
    console.log("Alert rules migration complete");
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
