require("dotenv").config();

const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const keepUsers = ["admin@nws360.com", "test@nws360.com"];
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query("delete from users where username <> all($1::text[])", [keepUsers]);
    const result = await pool.query(
      "select id, username, role, user_type, client_id, disabled from users order by id",
    );
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
