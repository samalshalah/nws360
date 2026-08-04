require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nws360_ai_token_budgets'))");
    await client.query(`
      ALTER TABLE client_settings
      ADD COLUMN IF NOT EXISTS ai_token_budgets jsonb
    `);
    await client.query(`
      UPDATE client_settings
      SET ai_token_budgets = jsonb_build_object(
        'analysis', 0,
        'translation', 0,
        'summaries', 0
      )
      WHERE ai_token_budgets IS NULL
    `);
    await client.query("COMMIT");
    console.log("AI token budgets migration complete");
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
