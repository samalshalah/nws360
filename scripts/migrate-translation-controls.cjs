require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nws360_translation_controls'))");

    await client.query(`
      ALTER TABLE client_settings
      ADD COLUMN IF NOT EXISTS translation_enabled boolean NOT NULL DEFAULT false
    `);
    await client.query(`
      ALTER TABLE client_settings
      ADD COLUMN IF NOT EXISTS allowed_translation_pairs jsonb DEFAULT '[]'
    `);
    await client.query(`
      ALTER TABLE article_translations
      ADD COLUMN IF NOT EXISTS source_language text
    `);

    // Preserve existing auto-translation behavior: clients that already had
    // auto_translation_enabled=true (which always targets "en") relied on
    // translation working with no separate master switch. Since
    // translation_enabled now gates both manual and automatic translation and
    // defaults to false for everyone, seed it on (with an ar->en pair) for any
    // client that was already actively auto-translating, so this migration does
    // not silently disable a feature already in production use. Clients without
    // allowed_translation_pairs configured yet are targeted; clients that already
    // have pairs set (e.g. re-running this migration) are left untouched.
    await client.query(`
      UPDATE client_settings
      SET translation_enabled = true,
          allowed_translation_pairs = '[{"source":"ar","target":"en"}]'::jsonb
      WHERE auto_translation_enabled = true
        AND translation_enabled = false
        AND (allowed_translation_pairs IS NULL OR allowed_translation_pairs = '[]'::jsonb)
    `);

    await client.query("COMMIT");
    console.log("Translation controls migration complete");
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
