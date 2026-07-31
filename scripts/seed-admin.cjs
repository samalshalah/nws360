require("dotenv").config();

const { Pool } = require("pg");
const { randomBytes, scryptSync } = require("crypto");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const username = "admin@nws360.local";
  const password = `Nws360-${randomBytes(6).toString("base64url")}!`;
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  const hashedPassword = `${salt}:${key}`;

  await pool.query(
    `insert into users (
      username, password, role, user_scope, user_type, client_id, disabled, capabilities
    ) values ($1, $2, $3, $4, $5, $6, false, $7)
    on conflict (username) do update set
      password = excluded.password,
      role = excluded.role,
      user_scope = excluded.user_scope,
      client_id = excluded.client_id,
      disabled = false`,
    [username, hashedPassword, "admin", "platform", "executive", null, []],
  );

  await pool.end();
  console.log(JSON.stringify({ username, password, clientId: null }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
