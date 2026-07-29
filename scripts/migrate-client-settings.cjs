require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_settings (
        id serial PRIMARY KEY,
        client_id integer NOT NULL REFERENCES clients(id),
        feed_live_update_enabled boolean DEFAULT true,
        feed_live_update_interval_seconds integer DEFAULT 60,
        feed_live_update_mode text NOT NULL DEFAULT 'notify',
        default_feed_date_range text NOT NULL DEFAULT 'all',
        default_article_retention_days integer DEFAULT 7,
        default_source_interval_minutes integer DEFAULT 15,
        default_max_articles_per_fetch integer DEFAULT 10,
        auto_translation_enabled boolean DEFAULT false,
        default_target_language text DEFAULT 'en',
        report_export_format text NOT NULL DEFAULT 'txt',
        report_include_summaries boolean DEFAULT true,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_client_settings_client ON client_settings (client_id)`);
    await client.query(`
      INSERT INTO client_settings (client_id)
      SELECT id FROM clients
      ON CONFLICT (client_id) DO NOTHING
    `);
    await client.query("COMMIT");
    console.log("Client settings migration complete");
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
