require("dotenv").config();

const { randomBytes, scryptSync } = require("crypto");
const { Pool } = require("pg");

async function main() {
  const { DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!ADMIN_USERNAME) throw new Error("ADMIN_USERNAME is required");
  if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD is required");

  const pool = new Pool({ connectionString: DATABASE_URL });
  const clientName = process.env.ADMIN_CLIENT_NAME || "SYSTEM";

  try {
    let result = await pool.query("select id from clients where name = $1", [clientName]);
    let clientId = result.rows[0]?.id;

    if (!clientId) {
      result = await pool.query(
        `insert into clients (
          id, name, organization_type, default_language, active, ai_enabled,
          ai_tier, plan_tier, daily_token_budget, daily_job_limit
        ) values ($1, $2, $3, $4, true, false, $5, $6, 0, 0)
        returning id`,
        [9000, clientName, "system", "en", "none", "enterprise"],
      );
      clientId = result.rows[0].id;
    }

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
      [ADMIN_USERNAME, hashedPassword, "admin", "platform", "executive", clientId, []],
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
