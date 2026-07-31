require("dotenv").config({ quiet: true });

const { Pool } = require("pg");
const { parseResetArgs, runPlatformReset } = require("./reset-platform-lib.cjs");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const options = parseResetArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const report = await runPlatformReset(client, options);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    result: "failed",
    message: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
