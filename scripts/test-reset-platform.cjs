const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { randomBytes, scryptSync } = require("crypto");

const {
  REQUIRED_CONFIRMATION,
  parseResetArgs,
  runPlatformReset,
  verifyPasswordHash,
} = require("./reset-platform-lib.cjs");

const ROOT = path.resolve(__dirname, "..");
const TEST_PASSWORD = "Test!!@@";

function makeHash(password = TEST_PASSWORD) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function tableKey(schema, table) {
  return `${schema}.${table}`;
}

class MockPgClient {
  constructor(options = {}) {
    this.lockAvailable = options.lockAvailable !== false;
    this.tables = new Map();
    this.foreignKeys = [];
    this.sequences = {};
    this.constraints = new Set();
    this.transactionSnapshot = null;
    this.adminHash = options.adminHash || makeHash();
    this.addDefaultTables(options);
  }

  addTable(schema, name, columns, rows = []) {
    const key = tableKey(schema, name);
    this.tables.set(key, {
      schema,
      name,
      columns: columns.map((column) => typeof column === "string" ? { name: column, nullable: true } : column),
      rows: deepClone(rows),
    });
    if (columns.some((column) => (typeof column === "string" ? column : column.name) === "id")) {
      this.sequences[`${schema}_${name}_id_seq`] = Math.max(1, ...rows.map((row) => Number(row.id || 0) + 1));
    }
  }

  addFk(table, column, foreignTable, foreignColumn = "id", deleteRule = "NO ACTION") {
    const [schema, tableName] = table.split(".");
    const [foreignSchema, foreignTableName] = foreignTable.split(".");
    this.foreignKeys.push({
      table_schema: schema,
      table_name: tableName,
      column_name: column,
      foreign_table_schema: foreignSchema,
      foreign_table_name: foreignTableName,
      foreign_column_name: foreignColumn,
      delete_rule: deleteRule,
    });
  }

  addDefaultTables(options) {
    const disabledAdmin = !!options.disabledAdmin;
    const commonClientColumns = [
      { name: "id", nullable: false },
      { name: "client_id", nullable: false },
      "created_at",
    ];

    this.addTable("public", "users", [
      { name: "id", nullable: false },
      { name: "username", nullable: false },
      { name: "password", nullable: false },
      { name: "role", nullable: false },
      { name: "user_scope", nullable: false },
      "user_type",
      "parent_id",
      { name: "client_id", nullable: false },
      "disabled",
      "capabilities",
      "created_at",
    ], [
      { id: 10, username: "admin@nws360.com", password: this.adminHash, role: "admin", user_scope: "platform", user_type: "executive", parent_id: null, client_id: null, disabled: disabledAdmin, capabilities: ["admin_system_dashboard"], created_at: "2026-01-01T00:00:00.000Z" },
      { id: 11, username: "test@nws360.com", password: makeHash("Test@@##"), role: "client", user_scope: "tenant", user_type: "reader", parent_id: 10, client_id: 1, disabled: false, capabilities: [], created_at: "2026-01-02T00:00:00.000Z" },
      { id: 12, username: "test2@nws360.com", password: makeHash("Test@@##"), role: "client", user_scope: "tenant", user_type: "reader", parent_id: 10, client_id: 2, disabled: false, capabilities: [], created_at: "2026-01-03T00:00:00.000Z" },
    ]);
    Object.assign(this.tables.get("public.users").rows[0], options.adminOverrides || {});

    this.addTable("public", "clients", [
      { name: "id", nullable: false },
      { name: "name", nullable: false },
      "organization_type",
      "created_at",
    ], [
      { id: 1, name: "Iraqi Report", organization_type: "media", created_at: "2026-01-01T00:00:00.000Z" },
      { id: 2, name: "Test Client", organization_type: "embassy", created_at: "2026-01-02T00:00:00.000Z" },
    ]);

    const singleClientRows = [{ id: 1, client_id: 1, created_at: "2026-01-01T00:00:00.000Z" }];
    for (const name of [
      "client_settings",
      "client_keywords",
      "sources",
      "articles",
      "article_translations",
      "bookmarks",
      "saved_feed_views",
      "keywords",
      "admin_audit_logs",
      "api_keys",
      "analytics_cache",
      "alert_rules",
      "alert_preferences",
      "daily_briefs",
      "shared_reports",
      "workspaces",
      "comments",
      "annotations",
      "tasks",
      "watchlists",
      "activity_events",
      "processing_jobs",
      "insight_jobs",
      "export_jobs",
      "source_fetch_logs",
      "system_errors",
      "usage_metrics",
      "impersonation_logs",
      "user_feedback",
      "notification_settings",
      "dashboard_preferences",
      "mobile_notification_prefs",
      "support_tickets",
      "white_label_settings",
      "subscriptions",
      "onboarding_state",
      "story_clusters",
      "article_ai_analysis",
      "detected_events",
      "entity_mentions",
      "trend_predictions",
      "insight_engagement",
      "ai_corrections",
      "knowledge_entries",
      "value_reports",
      "integration_webhooks",
      "webhook_deliveries",
      "email_subscriptions",
      "integration_configs",
      "embed_tokens",
      "sso_configs",
      "import_connectors",
      "workspace_members",
      "briefing_items",
      "custom_tags",
      "tag_assignments",
      "change_history",
      "internal_alerts",
      "story_timelines",
      "timeline_events",
      "recurring_patterns",
      "entity_memory",
      "narrative_shifts",
      "institutional_notes",
      "historical_matches",
      "trend_lifecycles",
      "long_range_briefings",
      "ai_memory_answers",
      "topic_forecasts",
      "early_signals",
      "risk_scores",
      "influence_graph",
      "attention_decay",
      "alert_priority_scores",
      "forecast_results",
      "future_briefings",
      "ai_usage_log",
    ]) {
      this.addTable("public", name, commonClientColumns, singleClientRows);
    }

    this.tables.get("public.processing_jobs").columns.push(
      { name: "status", nullable: true },
      { name: "last_error", nullable: true },
      { name: "completed_at", nullable: true },
    );
    this.tables.get("public.processing_jobs").rows = [
      { id: 1, client_id: 1, status: "pending", last_error: null, completed_at: null },
      { id: 2, client_id: 1, status: "running", last_error: null, completed_at: null },
    ];
    this.tables.get("public.insight_jobs").columns.push(
      { name: "status", nullable: true },
      { name: "completed_at", nullable: true },
    );
    this.tables.get("public.insight_jobs").rows = [
      { id: 1, client_id: 1, status: "queued", completed_at: null },
      { id: 2, client_id: 2, status: "running", completed_at: null },
    ];
    this.tables.get("public.export_jobs").columns.push(
      { name: "status", nullable: true },
      { name: "completed_at", nullable: true },
    );
    this.tables.get("public.export_jobs").rows = [
      { id: 1, client_id: 1, status: "pending", completed_at: null },
    ];

    this.addTable("public", "session", ["sid", "sess", "expire"], [{ sid: "s1", sess: "{}", expire: "2026-12-31" }]);
    this.addTable("public", "system_settings", ["id", "key", "value"], [{ id: 1, key: "feedRefreshMinutes", value: "5" }]);
    this.addTable("public", "feature_flags", ["id", "key", "enabled"], [{ id: 1, key: "reset_test", enabled: true }]);
    this.addTable("public", "permission_groups", ["id", "name", "is_system"], [{ id: 1, name: "Platform Admin", is_system: true }]);
    this.addTable("public", "permissions", ["id", "code"], [{ id: 1, code: "platform:admin:any" }]);
    this.addTable("public", "group_permissions", ["id", "group_id", "permission_id"], [{ id: 1, group_id: 1, permission_id: 1 }]);
    this.addTable("public", "user_permission_groups", ["id", "user_id", "group_id"], [
      { id: 1, user_id: 10, group_id: 1 },
      { id: 2, user_id: 11, group_id: 1 },
    ]);
    this.addTable("public", "user_permissions", ["id", "user_id", "permission_id"], [
      { id: 1, user_id: 10, permission_id: 1 },
      { id: 2, user_id: 12, permission_id: 1 },
    ]);
    this.addTable("drizzle", "__drizzle_migrations", ["id", "hash"], [{ id: 1, hash: "migration" }]);
    this.addTable("taxonomy_rehearsal_20260731_183638", "articles", commonClientColumns, singleClientRows);

    if (options.includeUnhandled) {
      this.addTable("public", "tenant_surprises", ["id", "client_id"], [{ id: 1, client_id: 1 }]);
    }

    this.addFk("public.client_settings", "client_id", "public.clients");
    this.addFk("public.sources", "client_id", "public.clients");
    this.addFk("public.articles", "source_id", "public.sources");
    this.addFk("public.article_translations", "article_id", "public.articles");
    this.addFk("public.bookmarks", "user_id", "public.users");
    this.addFk("public.bookmarks", "article_id", "public.articles");
    this.addFk("public.user_permission_groups", "user_id", "public.users", "id", "CASCADE");
    this.addFk("public.user_permission_groups", "group_id", "public.permission_groups", "id", "CASCADE");
    this.addFk("public.user_permissions", "user_id", "public.users", "id", "CASCADE");
    this.addFk("public.user_permissions", "permission_id", "public.permissions", "id", "CASCADE");
    this.addFk("public.briefing_items", "report_id", "public.shared_reports");
  }

  snapshot() {
    return {
      tables: deepClone(Object.fromEntries([...this.tables.entries()].map(([key, table]) => [key, table.rows]))),
      nullable: deepClone(Object.fromEntries([...this.tables.entries()].map(([key, table]) => [key, Object.fromEntries(table.columns.map((column) => [column.name, column.nullable]))]))),
      sequences: deepClone(this.sequences),
      constraints: [...this.constraints],
    };
  }

  restore(snapshot) {
    for (const key of [...this.tables.keys()]) {
      if (!Object.prototype.hasOwnProperty.call(snapshot.tables, key)) {
        this.tables.delete(key);
      }
    }
    for (const [key, rows] of Object.entries(snapshot.tables)) {
      this.tables.get(key).rows = rows;
    }
    for (const [key, nullableByColumn] of Object.entries(snapshot.nullable)) {
      const table = this.tables.get(key);
      for (const column of table.columns) {
        if (Object.prototype.hasOwnProperty.call(nullableByColumn, column.name)) {
          column.nullable = nullableByColumn[column.name];
        }
      }
    }
    this.sequences = snapshot.sequences;
    this.constraints = new Set(snapshot.constraints || []);
  }

  getTable(schema, name) {
    const table = this.tables.get(tableKey(schema, name));
    if (!table) throw new Error(`Mock table missing: ${schema}.${name}`);
    return table;
  }

  parseQualified(sql) {
    const match = sql.match(/(?:FROM|DELETE FROM|JOIN)\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\.(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i);
    if (!match) return null;
    return {
      schema: match[1] || match[2],
      name: match[3] || match[4],
    };
  }

  toAdminRow(row) {
    return {
      id: row.id,
      username: row.username,
      password: row.password,
      role: row.role,
      userScope: row.user_scope,
      userType: row.user_type,
      parentId: row.parent_id,
      clientId: row.client_id,
      disabled: row.disabled,
      capabilities: row.capabilities,
      createdAt: row.created_at,
    };
  }

  async query(text, params = []) {
    const sql = String(text).replace(/\s+/g, " ").trim();

    if (sql === "BEGIN") {
      this.transactionSnapshot = this.snapshot();
      return { rows: [], rowCount: 0 };
    }
    if (sql === "COMMIT") {
      this.transactionSnapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (sql === "ROLLBACK") {
      this.restore(this.transactionSnapshot);
      this.transactionSnapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("pg_try_advisory_xact_lock")) {
      return { rows: [{ locked: this.lockAvailable }], rowCount: 1 };
    }

    if (sql.startsWith("SELECT table_schema, table_name FROM information_schema.tables")) {
      return {
        rows: [...this.tables.values()].map((table) => ({ table_schema: table.schema, table_name: table.name }))
          .sort((a, b) => tableKey(a.table_schema, a.table_name).localeCompare(tableKey(b.table_schema, b.table_name))),
        rowCount: this.tables.size,
      };
    }
    if (sql.startsWith("SELECT table_schema, table_name, column_name")) {
      const rows = [];
      for (const table of this.tables.values()) {
        for (const column of table.columns) {
          rows.push({
            table_schema: table.schema,
            table_name: table.name,
            column_name: column.name,
            data_type: column.name === "id" || column.name.endsWith("_id") ? "integer" : "text",
            is_nullable: column.nullable ? "YES" : "NO",
            column_default: column.name === "id" ? `nextval('${table.schema}_${table.name}_id_seq'::regclass)` : null,
          });
        }
      }
      return { rows, rowCount: rows.length };
    }
    if (sql.startsWith("SELECT tc.table_schema")) {
      return { rows: deepClone(this.foreignKeys), rowCount: this.foreignKeys.length };
    }

    if (sql.startsWith("SELECT id, username, password")) {
      const row = this.getTable("public", "users").rows.find((user) => user.id === params[0]);
      return { rows: row ? [this.toAdminRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (sql.startsWith("SELECT DISTINCT p.code FROM public.user_permission_groups")) {
      const userId = params[0];
      const allowed = new Set(params[1] || []);
      const groups = this.getTable("public", "user_permission_groups").rows.filter((row) => row.user_id === userId);
      const groupIds = new Set(groups.map((row) => row.group_id));
      const permissionIds = new Set(this.getTable("public", "group_permissions").rows
        .filter((row) => groupIds.has(row.group_id))
        .map((row) => row.permission_id));
      const rows = this.getTable("public", "permissions").rows
        .filter((row) => permissionIds.has(row.id) && allowed.has(row.code))
        .map((row) => ({ code: row.code }));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith("SELECT p.code, up.granted FROM public.user_permissions")) {
      const userId = params[0];
      const allowed = new Set(params[1] || []);
      const direct = this.getTable("public", "user_permissions").rows.filter((row) => row.user_id === userId);
      const rows = direct.map((row) => {
        const permission = this.getTable("public", "permissions").rows.find((perm) => perm.id === row.permission_id);
        return permission && allowed.has(permission.code) ? { code: permission.code, granted: row.granted } : null;
      }).filter(Boolean);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith("SELECT user_scope AS \"userScope\"")) {
      const counts = new Map();
      for (const row of this.getTable("public", "users").rows) {
        const incompatible = (row.user_scope === "platform" && row.client_id !== null && row.client_id !== undefined)
          || (row.user_scope !== "platform" && (row.client_id === null || row.client_id === undefined));
        if (incompatible) {
          counts.set(row.user_scope, (counts.get(row.user_scope) || 0) + 1);
        }
      }
      const rows = [...counts.entries()].map(([userScope, count]) => ({ userScope, count }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes("COUNT(*) FILTER") && sql.includes("FROM public.users")) {
      const rows = this.getTable("public", "users").rows;
      return {
        rows: [{
          total_users: rows.length,
          users_to_delete: rows.filter((row) => row.id !== params[0]).length,
          tenant_users: rows.filter((row) => row.user_scope === "tenant").length,
          users_with_client: rows.filter((row) => row.client_id !== null && row.client_id !== undefined).length,
        }],
        rowCount: 1,
      };
    }

    if (sql.startsWith("SELECT COUNT(*)::int AS count FROM public.user_permission_groups WHERE user_id = $1")) {
      const rows = this.getTable("public", "user_permission_groups").rows.filter((row) => row.user_id === params[0]);
      return { rows: [{ count: rows.length }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT COUNT(*)::int AS count FROM public.user_permissions WHERE user_id = $1")) {
      const rows = this.getTable("public", "user_permissions").rows.filter((row) => row.user_id === params[0]);
      return { rows: [{ count: rows.length }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT COUNT(*)::int AS count FROM public.user_permission_groups WHERE user_id <> $1")) {
      const rows = this.getTable("public", "user_permission_groups").rows.filter((row) => row.user_id !== params[0]);
      return { rows: [{ count: rows.length }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT COUNT(*)::int AS count FROM public.user_permissions WHERE user_id <> $1")) {
      const rows = this.getTable("public", "user_permissions").rows.filter((row) => row.user_id !== params[0]);
      return { rows: [{ count: rows.length }], rowCount: 1 };
    }
    if (sql.includes("FROM public.users") && sql.includes("user_scope = 'tenant'")) {
      const rows = this.getTable("public", "users").rows.filter((row) => row.user_scope === "tenant" || row.client_id !== null || row.id !== params[0]);
      return { rows: [{ count: rows.length }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT COUNT(*)::int AS count FROM public.users")) {
      return { rows: [{ count: this.getTable("public", "users").rows.length }], rowCount: 1 };
    }

    if (sql.startsWith("SELECT COUNT(*)::int AS count FROM") && sql.includes("LEFT JOIN")) {
      const fromMatch = sql.match(/FROM\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\.(?:"([^"]+)"|([a-z_][a-z0-9_]*)) child_table LEFT JOIN\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\.(?:"([^"]+)"|([a-z_][a-z0-9_]*)) parent_table/i);
      const colMatch = sql.match(/child_table\."?([a-z_][a-z0-9_]*)"? = parent_table\."?([a-z_][a-z0-9_]*)"?/i);
      const child = this.getTable(fromMatch[1] || fromMatch[2], fromMatch[3] || fromMatch[4]);
      const parent = this.getTable(fromMatch[5] || fromMatch[6], fromMatch[7] || fromMatch[8]);
      const childColumn = colMatch[1];
      const parentColumn = colMatch[2];
      const count = child.rows.filter((row) => row[childColumn] !== null && row[childColumn] !== undefined && !parent.rows.some((parentRow) => parentRow[parentColumn] === row[childColumn])).length;
      return { rows: [{ count }], rowCount: 1 };
    }

    if (sql.startsWith("SELECT COUNT(*)::int AS count FROM")) {
      const qualified = this.parseQualified(sql);
      const table = this.getTable(qualified.schema, qualified.name);
      return { rows: [{ count: table.rows.length }], rowCount: 1 };
    }

    if (sql.startsWith("ALTER TABLE IF EXISTS public.")) {
      const match = sql.match(/ALTER TABLE IF EXISTS public\.([a-z_][a-z0-9_]*) ALTER COLUMN ([a-z_][a-z0-9_]*) DROP NOT NULL/i);
      if (match) {
        const table = this.getTable("public", match[1]);
        const column = table.columns.find((item) => item.name === match[2]);
        if (column) column.nullable = true;
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith("CREATE TABLE IF NOT EXISTS public.platform_reset_audit")) {
      if (!this.tables.has("public.platform_reset_audit")) {
        this.addTable("public", "platform_reset_audit", [
          "id",
          "preserved_admin_id",
          "preserved_admin_username",
          "git_commit_sha",
          "database_identifier",
          "before_counts",
          "deleted_counts",
          "final_counts",
          "duration_ms",
          "result",
          "created_at",
        ], []);
      }
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("CREATE INDEX IF NOT EXISTS")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("DO $$ BEGIN")) {
      this.constraints.add("users_scope_client_id_ck");
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith("UPDATE public.users")) {
      const rows = this.getTable("public", "users").rows;
      const row = rows.find((user) => user.id === params[0]);
      if (!row) return { rows: [], rowCount: 0 };
      row.user_scope = "platform";
      row.role = "admin";
      row.client_id = null;
      row.disabled = false;
      return { rows: [this.toAdminRow(row)], rowCount: 1 };
    }

    if (sql.startsWith("UPDATE public.processing_jobs")) {
      const table = this.getTable("public", "processing_jobs");
      let count = 0;
      for (const row of table.rows) {
        if (["pending", "running"].includes(row.status)) {
          row.status = "failed";
          row.last_error = "Neutralized by platform reset";
          row.completed_at = new Date().toISOString();
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }
    if (sql.startsWith("UPDATE public.insight_jobs")) {
      const table = this.getTable("public", "insight_jobs");
      let count = 0;
      for (const row of table.rows) {
        if (["queued", "scheduled", "running", "blocked_budget"].includes(row.status)) {
          row.status = "expired";
          row.completed_at = new Date().toISOString();
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }
    if (sql.startsWith("UPDATE public.export_jobs")) {
      const table = this.getTable("public", "export_jobs");
      let count = 0;
      for (const row of table.rows) {
        if (["pending", "running", "queued", "scheduled"].includes(row.status)) {
          row.status = "failed";
          row.completed_at = new Date().toISOString();
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }

    if (sql.startsWith("DELETE FROM public.users WHERE id <> $1")) {
      const table = this.getTable("public", "users");
      const before = table.rows.length;
      table.rows = table.rows.filter((row) => row.id === params[0]);
      return { rows: [], rowCount: before - table.rows.length };
    }
    if (sql.startsWith("DELETE FROM public.user_permission_groups WHERE user_id <> $1")) {
      const table = this.getTable("public", "user_permission_groups");
      const before = table.rows.length;
      table.rows = table.rows.filter((row) => row.user_id === params[0]);
      return { rows: [], rowCount: before - table.rows.length };
    }
    if (sql.startsWith("DELETE FROM public.user_permissions WHERE user_id <> $1")) {
      const table = this.getTable("public", "user_permissions");
      const before = table.rows.length;
      table.rows = table.rows.filter((row) => row.user_id === params[0]);
      return { rows: [], rowCount: before - table.rows.length };
    }
    if (sql.startsWith("DELETE FROM")) {
      const qualified = this.parseQualified(sql);
      const table = this.getTable(qualified.schema, qualified.name);
      const count = table.rows.length;
      table.rows = [];
      return { rows: [], rowCount: count };
    }

    if (sql.startsWith("SELECT pg_get_serial_sequence")) {
      const qualified = String(params[0]).replace(/"/g, "").split(".");
      const [schema, name] = qualified;
      const table = this.getTable(schema, name);
      const hasId = table.columns.some((column) => column.name === "id");
      return { rows: [{ sequence_name: hasId ? `${schema}_${name}_id_seq` : null }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT setval")) {
      this.sequences[params[0]] = sql.includes("GREATEST") ? Math.max(params[1], ...this.getTable("public", "users").rows.map((row) => row.id)) + 1 : 1;
      return { rows: [{ setval: this.sequences[params[0]] }], rowCount: 1 };
    }

    if (sql.startsWith("INSERT INTO public.platform_reset_audit")) {
      const table = this.getTable("public", "platform_reset_audit");
      table.rows.push({
        id: table.rows.length + 1,
        preserved_admin_id: params[0],
        preserved_admin_username: params[1],
        git_commit_sha: params[2],
        database_identifier: params[3],
        before_counts: JSON.parse(params[4]),
        deleted_counts: JSON.parse(params[5]),
        final_counts: JSON.parse(params[6]),
        duration_ms: params[7],
        result: params[8],
        created_at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unhandled mock SQL: ${sql}`);
  }
}

function assertTableEmpty(client, key) {
  assert.strictEqual(client.tables.get(key)?.rows.length || 0, 0, `${key} should be empty`);
}

async function testDryRunChangesNothing() {
  const client = new MockPgClient();
  const before = client.snapshot();
  const report = await runPlatformReset(client, { mode: "dry-run", preserveAdminId: 10 });
  assert.deepStrictEqual(client.snapshot(), before, "dry run changed mock database state");
  assert.strictEqual(report.mode, "dry-run");
  assert.strictEqual(report.readyForApply, true, "authorized admin dry-run should be ready for apply");
  assert.strictEqual(report.preservedAdmin.id, 10);
  assert.strictEqual(report.preservedAdmin.username, "admin@nws360.com");
  assert.strictEqual(report.adminQualification.qualified, true);
  assert.strictEqual(report.adminQualification.role, "admin");
  assert.strictEqual(report.adminQualification.userScope, "platform");
  assert(report.adminQualification.relevantEffectivePlatformCapabilities.includes("user_scope:platform"));
  assert(!JSON.stringify(report).includes(before.tables["public.users"][0].password), "dry-run report exposed password hash");
  assert(report.discoveredOperationalTables.includes("public.clients"));
  assert(report.proposedDeletionOrder.some((entry) => entry.table === "public.clients"));
}

async function testAdminQualification() {
  const authorizedByPermission = new MockPgClient({
    adminOverrides: {
      user_scope: "tenant",
      client_id: 1,
      capabilities: [],
    },
  });
  const permissionReport = await runPlatformReset(authorizedByPermission, { mode: "dry-run", preserveAdminId: 10 });
  assert.strictEqual(permissionReport.adminQualification.qualified, true, "admin role with platform permission should qualify");
  assert(permissionReport.adminQualification.relevantEffectivePlatformCapabilities.includes("platform:admin:any"));

  const normalTenant = new MockPgClient();
  const normalReport = await runPlatformReset(normalTenant, { mode: "dry-run", preserveAdminId: 11 });
  assert.strictEqual(normalReport.readyForApply, false, "normal tenant user should not be ready for apply");
  assert.strictEqual(normalReport.adminQualification.qualified, false);
  assert.match(normalReport.adminQualification.reason, /not the platform administrator role/i);
  await assert.rejects(
    () => runPlatformReset(new MockPgClient(), { mode: "apply", preserveAdminId: 11, confirmation: REQUIRED_CONFIRMATION }),
    /not authorized for platform reset/,
  );

  const clientAdmin = new MockPgClient({
    adminOverrides: {
      role: "client_admin",
      user_scope: "tenant",
      client_id: 1,
      capabilities: [],
    },
  });
  const clientAdminReport = await runPlatformReset(clientAdmin, { mode: "dry-run", preserveAdminId: 10 });
  assert.strictEqual(clientAdminReport.readyForApply, false, "client admin without platform authority should not be ready");
  assert.strictEqual(clientAdminReport.adminQualification.qualified, false);
  await assert.rejects(
    () => runPlatformReset(new MockPgClient({
      adminOverrides: {
        role: "client_admin",
        user_scope: "tenant",
        client_id: 1,
        capabilities: [],
      },
    }), { mode: "apply", preserveAdminId: 10, confirmation: REQUIRED_CONFIRMATION }),
    /not authorized for platform reset/,
  );
}

function testArgumentValidation() {
  assert.throws(
    () => parseResetArgs(["--apply", "--confirmation", "WRONG", "--preserve-admin-id", "10"]),
    /confirmation RESET-NWS360/,
  );
  const parsed = parseResetArgs(["--apply", "--confirmation", REQUIRED_CONFIRMATION, "--preserve-admin-id", "10"]);
  assert.strictEqual(parsed.mode, "apply");
  assert.strictEqual(parsed.preserveAdminId, 10);
}

async function testInvalidAndDisabledAdminAbort() {
  await assert.rejects(
    () => runPlatformReset(new MockPgClient(), { mode: "dry-run", preserveAdminId: 999 }),
    /does not exist/,
  );
  await assert.rejects(
    () => runPlatformReset(new MockPgClient({ adminHash: "not-a-valid-hash" }), { mode: "dry-run", preserveAdminId: 10 }),
    /valid password hash format/,
  );
  await assert.rejects(
    () => runPlatformReset(new MockPgClient({ disabledAdmin: true }), { mode: "dry-run", preserveAdminId: 10 }),
    /disabled/,
  );
}

async function testUnhandledTableBlocksApply() {
  await assert.rejects(
    () => runPlatformReset(new MockPgClient({ includeUnhandled: true }), { mode: "apply", preserveAdminId: 10, confirmation: REQUIRED_CONFIRMATION }),
    /Unhandled operational table/,
  );
}

async function testSuccessfulApply() {
  const client = new MockPgClient();
  const beforeSettings = deepClone(client.tables.get("public.system_settings").rows);
  const beforeMigrations = deepClone(client.tables.get("drizzle.__drizzle_migrations").rows);
  const beforeAdmin = deepClone(client.tables.get("public.users").rows.find((row) => row.id === 10));

  const report = await runPlatformReset(client, { mode: "apply", preserveAdminId: 10, confirmation: REQUIRED_CONFIRMATION });
  assert.strictEqual(report.result, "success");

  const users = client.tables.get("public.users").rows;
  assert.strictEqual(users.length, 1, "exactly one user remains");
  assert.strictEqual(users[0].id, beforeAdmin.id, "admin ID changed");
  assert.strictEqual(users[0].username, beforeAdmin.username, "admin username changed");
  assert.strictEqual(users[0].password, beforeAdmin.password, "admin password hash changed");
  assert.strictEqual(users[0].user_scope, "platform", "admin userScope was not converted");
  assert.strictEqual(users[0].role, "admin", "admin role was not normalized");
  assert.strictEqual(users[0].client_id, null, "admin clientId was not nulled");
  assert.strictEqual(users[0].disabled, false, "admin disabled changed incorrectly");
  assert.deepStrictEqual(users[0].capabilities, beforeAdmin.capabilities, "admin capabilities changed");
  assert.strictEqual(users[0].created_at, beforeAdmin.created_at, "admin createdAt changed");
  assert(verifyPasswordHash(TEST_PASSWORD, users[0].password), "admin cannot authenticate with unchanged hash");

  for (const key of [
    "public.clients",
    "public.client_settings",
    "public.sources",
    "public.source_fetch_logs",
    "public.articles",
    "public.article_translations",
    "public.bookmarks",
    "public.shared_reports",
    "public.briefing_items",
    "public.alert_rules",
    "public.processing_jobs",
    "public.insight_jobs",
    "public.workspace_members",
    "public.workspaces",
    "public.admin_audit_logs",
    "public.analytics_cache",
    "public.api_keys",
    "public.session",
    "taxonomy_rehearsal_20260731_183638.articles",
  ]) {
    assertTableEmpty(client, key);
  }

  assert.deepStrictEqual(client.tables.get("public.system_settings").rows, beforeSettings, "system settings were not preserved");
  assert.deepStrictEqual(client.tables.get("drizzle.__drizzle_migrations").rows, beforeMigrations, "migration history was not preserved");
  assert.strictEqual(client.tables.get("public.user_permission_groups").rows.length, 1, "admin permission group was not preserved alone");
  assert.strictEqual(client.tables.get("public.user_permission_groups").rows[0].user_id, 10);
  assert.strictEqual(client.tables.get("public.user_permissions").rows.length, 1, "admin direct permission was not preserved alone");
  assert.strictEqual(client.tables.get("public.user_permissions").rows[0].user_id, 10);
  assert.strictEqual(client.tables.get("public.platform_reset_audit").rows.length, 1, "reset audit row was not recorded");
  assert(client.constraints.has("users_scope_client_id_ck"), "user scope/client check constraint was not added");
  assert(client.sequences.public_users_id_seq > 10, "users sequence was not kept above preserved admin");
  assert.strictEqual(client.sequences.public_clients_id_seq, 1, "client sequence was not reset");
}

async function testRollbackAndLock() {
  const rollbackClient = new MockPgClient();
  const before = rollbackClient.snapshot();
  await assert.rejects(
    () => runPlatformReset(rollbackClient, { mode: "apply", preserveAdminId: 10, confirmation: REQUIRED_CONFIRMATION, simulateFailureAt: "after-delete" }),
    /Simulated reset failure/,
  );
  assert.deepStrictEqual(rollbackClient.snapshot(), before, "simulated failure did not roll back");

  await assert.rejects(
    () => runPlatformReset(new MockPgClient({ lockAvailable: false }), { mode: "apply", preserveAdminId: 10, confirmation: REQUIRED_CONFIRMATION }),
    /already running/,
  );
}

function testZeroStateAndNoDemoRecreation() {
  const adminDashboard = fs.readFileSync(path.join(ROOT, "client/src/pages/AdminDashboard.tsx"), "utf8");
  assert(adminDashboard.includes("No clients have been enrolled yet."), "admin zero-client empty state is missing");
  assert(adminDashboard.includes("Create First Client"), "admin zero-client CTA is missing");

  const storage = fs.readFileSync(path.join(ROOT, "server/storage.ts"), "utf8");
  const seedDefaultPermissions = storage.slice(storage.indexOf("async seedDefaultPermissions"));
  assert(!seedDefaultPermissions.includes("SYSTEM and DEMO clients ensured"), "startup still recreates demo/system clients");
  assert(!seedDefaultPermissions.includes("organizationType: \"demo\""), "startup still defines demo client seed data");
}

async function main() {
  const checks = [
    ["dry-run changes nothing", testDryRunChangesNothing],
    ["admin qualification", testAdminQualification],
    ["argument validation", testArgumentValidation],
    ["invalid and disabled admin abort", testInvalidAndDisabledAdminAbort],
    ["unhandled table blocks apply", testUnhandledTableBlocksApply],
    ["successful reset apply", testSuccessfulApply],
    ["rollback and concurrent lock", testRollbackAndLock],
    ["zero-state UI and no demo recreation", testZeroStateAndNoDemoRecreation],
  ];

  for (const [name, fn] of checks) {
    await fn();
    console.log(`PASS ${name}`);
  }

  console.log("PASS reset platform coverage: dry-run, confirmation/admin validation, single preserved admin, operational deletion, preserved settings/migrations, rollback, advisory lock, zero-state UI, auth hash, sequence reset, and no automatic demo recreation");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
