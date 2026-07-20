require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("ALTER TABLE sources ADD COLUMN IF NOT EXISTS filter_config jsonb");
    const result = await client.query("SELECT COUNT(*)::int AS sources FROM sources");
    console.log(`Source filter migration complete: ${result.rows[0].sources} sources ready`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
