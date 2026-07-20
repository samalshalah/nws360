require("dotenv").config();

const { randomBytes, scryptSync } = require("crypto");
const { Pool } = require("pg");

async function main() {
  const {
    DATABASE_URL,
    CLIENT_USERNAME,
    CLIENT_PASSWORD,
    CLIENT_NAME = "NWS360 Demo Client",
    CLIENT_ROLE = "client_admin",
    CLIENT_USER_TYPE = "executive",
  } = process.env;

  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!CLIENT_USERNAME) throw new Error("CLIENT_USERNAME is required");
  if (!CLIENT_PASSWORD) throw new Error("CLIENT_PASSWORD is required");

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const clientResult = await pool.query("select id from clients where name = $1", [CLIENT_NAME]);
    const clientId = clientResult.rows[0]?.id;
    if (!clientId) throw new Error(`Client not found: ${CLIENT_NAME}`);

    const salt = randomBytes(16).toString("hex");
    const key = scryptSync(CLIENT_PASSWORD, salt, 64).toString("hex");
    const hashedPassword = `${salt}:${key}`;

    const userResult = await pool.query(
      `insert into users (
        username, password, role, user_scope, user_type, parent_id, client_id, disabled, capabilities
      ) values ($1, $2, $3, $4, $5, null, $6, false, $7)
      on conflict (username) do update set
        password = excluded.password,
        role = excluded.role,
        user_scope = excluded.user_scope,
        user_type = excluded.user_type,
        client_id = excluded.client_id,
        disabled = false,
        capabilities = excluded.capabilities
      returning id, username, role, user_scope, user_type, client_id, disabled`,
      [CLIENT_USERNAME, hashedPassword, CLIENT_ROLE, "tenant", CLIENT_USER_TYPE, clientId, []],
    );

    console.log(JSON.stringify(userResult.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
