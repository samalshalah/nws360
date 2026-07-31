require("dotenv").config();

const { randomBytes, scryptSync } = require("crypto");
const { Pool } = require("pg");

async function main() {
  const { DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!ADMIN_USERNAME) throw new Error("ADMIN_USERNAME is required");
  if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD is required");

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const salt = randomBytes(16).toString("hex");
    const key = scryptSync(ADMIN_PASSWORD, salt, 64).toString("hex");
    const hashedPassword = `${salt}:${key}`;

    const upsert = await pool.query(
      `insert into users (
        username, password, role, user_scope, user_type, client_id, disabled, capabilities
      ) values ($1, $2, $3, $4, $5, $6, false, $7)
      on conflict (username) do update set
        password = excluded.password,
        role = excluded.role,
        user_scope = excluded.user_scope,
        user_type = excluded.user_type,
        client_id = excluded.client_id,
        disabled = false
      returning id, username, role, user_scope, user_type, client_id`,
      [ADMIN_USERNAME, hashedPassword, "admin", "platform", "executive", null, []],
    );

    console.log(JSON.stringify(upsert.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
