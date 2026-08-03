const { execFileSync } = require("child_process");
const { scryptSync, timingSafeEqual } = require("crypto");

const REQUIRED_CONFIRMATION = "RESET-NWS360";
const LOCK_NAME = "nws360-platform-reset";
const SYSTEM_ADMIN_ROLE = "admin";
const PLATFORM_USER_SCOPE = "platform";
const PLATFORM_PERMISSION_CODES = ["platform:admin:any"];
const PLATFORM_APP_CAPS = [
  "admin_system_dashboard",
  "admin_tenant_switch",
  "admin_impersonate",
  "admin_audit_logs",
  "admin_operations",
  "admin_job_monitor",
  "admin_product_analytics",
];
const PLATFORM_AUTHORITY_CODES = new Set([...PLATFORM_PERMISSION_CODES, ...PLATFORM_APP_CAPS]);
const USER_SCOPE_CLIENT_CONSTRAINT = "users_scope_client_id_ck";

const TENANT_REFERENCE_COLUMNS = new Set([
  "client_id",
  "user_id",
  "source_id",
  "article_id",
  "report_id",
  "briefing_id",
  "workspace_id",
  "tenant_id",
]);

const PRESERVED_TABLE_NAMES = new Set([
  "system_settings",
  "feature_flags",
  "permission_groups",
  "permissions",
  "group_permissions",
  "platform_reset_audit",
]);

const PARTIAL_RESET_TABLE_NAMES = new Set([
  "users",
  "user_permission_groups",
  "user_permissions",
]);

const MIGRATION_TABLE_NAMES = new Set([
  "__drizzle_migrations",
  "drizzle_migrations",
  "schema_migrations",
  "_prisma_migrations",
]);

const OPERATIONAL_TABLE_NAMES = new Set([
  "activity_events",
  "admin_audit_logs",
  "ai_corrections",
  "ai_jobs",
  "ai_memory_answers",
  "ai_usage_log",
  "alert_deliveries",
  "alert_preferences",
  "alert_priority_scores",
  "alert_rules",
  "analytics_cache",
  "annotations",
  "api_keys",
  "article_ai_analysis",
  "article_workspace_relevance",
  "article_appearances",
  "article_translations",
  "articles",
  "attention_decay",
  "bookmarks",
  "briefing_deliveries",
  "briefing_items",
  "briefings",
  "change_history",
  "client_publisher_selections",
  "client_keywords",
  "client_settings",
  "clients",
  "comments",
  "custom_tags",
  "daily_briefs",
  "dashboard_preferences",
  "detected_events",
  "early_signals",
  "email_subscriptions",
  "embed_tokens",
  "entity_memory",
  "entity_mentions",
  "experiment_assignments",
  "experiments",
  "export_jobs",
  "exports",
  "forecast_results",
  "future_briefings",
  "historical_matches",
  "impersonation_logs",
  "import_connectors",
  "influence_graph",
  "insight_engagement",
  "insight_jobs",
  "institutional_notes",
  "integration_configs",
  "integration_webhooks",
  "internal_alerts",
  "keywords",
  "knowledge_entries",
  "long_range_briefings",
  "mobile_notification_prefs",
  "monitoring_workspaces",
  "narrative_shifts",
  "notification_settings",
  "notifications",
  "onboarding_state",
  "processing_jobs",
  "rejected_ingestion_items",
  "publisher_aliases",
  "publisher_channels",
  "publisher_profiles",
  "recurring_patterns",
  "rejected_ingestion_items",
  "relevance_audit_records",
  "report_baskets",
  "reports",
  "risk_scores",
  "saved_feed_views",
  "session",
  "shared_reports",
  "source_discovery_records",
  "source_fetch_logs",
  "source_pack_assignments",
  "sources",
  "sso_configs",
  "story_clusters",
  "story_timelines",
  "subscriptions",
  "support_tickets",
  "system_errors",
  "tag_assignments",
  "tasks",
  "tenant_audit_logs",
  "timeline_events",
  "topic_forecasts",
  "trend_lifecycles",
  "trend_predictions",
  "usage_metrics",
  "user_feedback",
  "value_reports",
  "watchlists",
  "webhook_deliveries",
  "white_label_settings",
  "workspace_members",
  "workspace_source_assignments",
  "workspaces",
  "workspace_relevance_history",
  "workspace_relevance_profiles",
]);

function parseResetArgs(argv) {
  const options = {
    mode: "dry-run",
    confirmation: null,
    preserveAdminId: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.mode = "dry-run";
    } else if (arg === "--apply") {
      options.mode = "apply";
    } else if (arg === "--confirmation") {
      options.confirmation = argv[++i] || null;
    } else if (arg.startsWith("--confirmation=")) {
      options.confirmation = arg.slice("--confirmation=".length);
    } else if (arg === "--preserve-admin-id") {
      options.preserveAdminId = Number(argv[++i]);
    } else if (arg.startsWith("--preserve-admin-id=")) {
      options.preserveAdminId = Number(arg.slice("--preserve-admin-id=".length));
    } else {
      throw new Error(`Unknown reset argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.preserveAdminId) || options.preserveAdminId <= 0) {
    throw new Error("--preserve-admin-id <id> is required and must be a positive integer");
  }

  if (options.mode === "apply" && options.confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Apply requires --confirmation ${REQUIRED_CONFIRMATION}`);
  }

  return options;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function tableKey(table) {
  return `${table.table_schema}.${table.table_name}`;
}

function tableSql(table) {
  return `${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`;
}

function isSystemSchema(schema) {
  return schema === "pg_catalog" || schema === "information_schema" || schema.startsWith("pg_toast");
}

function isMigrationTable(table) {
  return MIGRATION_TABLE_NAMES.has(table.table_name) || table.table_schema === "drizzle";
}

function hasTrackedTenantColumn(columns) {
  return columns.some((column) => TENANT_REFERENCE_COLUMNS.has(column.column_name));
}

function getGitCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getDatabaseIdentifier(connectionString) {
  if (!connectionString) return "unknown";
  try {
    const url = new URL(connectionString);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "configured-database";
  }
}

function validatePasswordHashFormat(hash) {
  if (typeof hash !== "string") return false;
  const parts = hash.split(":");
  return parts.length === 2 && /^[a-f0-9]{16,}$/i.test(parts[0]) && /^[a-f0-9]{64,}$/i.test(parts[1]);
}

function verifyPasswordHash(password, hash) {
  const [salt, key] = String(hash || "").split(":");
  if (!salt || !key) return false;
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(key, "hex");
  return stored.length === candidate.length && timingSafeEqual(candidate, stored);
}

function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    if (value.startsWith("{") && value.endsWith("}")) {
      return value.slice(1, -1).split(",").map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
    }
    return [value];
  }
  return [];
}

function relevantPlatformAuthorityCodes(values) {
  return Array.from(new Set(normalizeStringArray(values).filter((item) => PLATFORM_AUTHORITY_CODES.has(item))));
}

async function discoverDatabase(client) {
  const tablesResult = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `);

  const columnsResult = await client.query(`
    SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY table_schema, table_name, ordinal_position
  `);

  const foreignKeysResult = await client.query(`
    SELECT tc.table_schema,
           tc.table_name,
           kcu.column_name,
           ccu.table_schema AS foreign_table_schema,
           ccu.table_name AS foreign_table_name,
           ccu.column_name AS foreign_column_name,
           rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY tc.table_schema, tc.table_name, kcu.column_name
  `);

  const columnsByTable = new Map();
  for (const column of columnsResult.rows) {
    const key = tableKey(column);
    if (!columnsByTable.has(key)) columnsByTable.set(key, []);
    columnsByTable.get(key).push(column);
  }

  return {
    tables: tablesResult.rows,
    columns: columnsResult.rows,
    columnsByTable,
    foreignKeys: foreignKeysResult.rows,
  };
}

function classifyTables(discovery) {
  const resetTables = [];
  const partialResetTables = [];
  const preservedTables = [];
  const unhandledTables = [];

  for (const table of discovery.tables) {
    if (isSystemSchema(table.table_schema)) continue;

    const key = tableKey(table);
    const columns = discovery.columnsByTable.get(key) || [];
    const tracked = hasTrackedTenantColumn(columns);

    if (isMigrationTable(table)) {
      preservedTables.push({ ...table, key, reason: "migration history" });
      continue;
    }

    if (table.table_schema === "public" && PRESERVED_TABLE_NAMES.has(table.table_name)) {
      preservedTables.push({ ...table, key, reason: "global platform configuration" });
      continue;
    }

    if (table.table_schema === "public" && PARTIAL_RESET_TABLE_NAMES.has(table.table_name)) {
      partialResetTables.push({ ...table, key, resetMode: "partial-admin-preserve" });
      continue;
    }

    if (OPERATIONAL_TABLE_NAMES.has(table.table_name)) {
      resetTables.push({ ...table, key, resetMode: "delete-all" });
      continue;
    }

    unhandledTables.push({
      ...table,
      key,
      trackedColumns: columns.filter((column) => TENANT_REFERENCE_COLUMNS.has(column.column_name)).map((column) => column.column_name),
      reason: tracked ? "contains tenant-owned reference columns" : "unknown non-preserved table",
    });
  }

  return { resetTables, partialResetTables, preservedTables, unhandledTables };
}

function deletionRank(table) {
  if (table.table_name === "session") return -1000;
  if (table.table_name === "user_permission_groups" || table.table_name === "user_permissions") return -900;
  if (table.table_name === "users") return 9000;
  if (table.table_name === "clients") return 10000;
  return 0;
}

function buildDeletionOrder(classified, foreignKeys) {
  const nodes = [...classified.resetTables, ...classified.partialResetTables];
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const childrenByParent = new Map();

  for (const fk of foreignKeys) {
    const childKey = `${fk.table_schema}.${fk.table_name}`;
    const parentKey = `${fk.foreign_table_schema}.${fk.foreign_table_name}`;
    if (!byKey.has(childKey) || !byKey.has(parentKey)) continue;
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(childKey);
  }

  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  const cycles = [];

  function visit(key) {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      cycles.push(key);
      return;
    }
    visiting.add(key);
    const children = (childrenByParent.get(key) || [])
      .sort((a, b) => {
        const ta = byKey.get(a);
        const tb = byKey.get(b);
        return deletionRank(ta) - deletionRank(tb) || a.localeCompare(b);
      });
    for (const childKey of children) visit(childKey);
    visiting.delete(key);
    visited.add(key);
    ordered.push(byKey.get(key));
  }

  nodes
    .slice()
    .sort((a, b) => deletionRank(a) - deletionRank(b) || a.key.localeCompare(b.key))
    .forEach((node) => visit(node.key));

  if (cycles.length > 0) {
    throw new Error(`Cannot build reset deletion order due to FK cycle: ${cycles.join(", ")}`);
  }

  return ordered;
}

async function countTableRows(client, table) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableSql(table)}`);
  return Number(result.rows[0]?.count || 0);
}

async function countTables(client, tables) {
  const counts = {};
  for (const table of tables) {
    counts[table.key] = await countTableRows(client, table);
  }
  return counts;
}

async function loadAdmin(client, adminId) {
  const result = await client.query(
    `SELECT id,
            username,
            password,
            role,
            user_scope AS "userScope",
            user_type AS "userType",
            parent_id AS "parentId",
            client_id AS "clientId",
            disabled,
            capabilities,
            created_at AS "createdAt"
       FROM public.users
      WHERE id = $1`,
    [adminId],
  );
  return result.rows[0] || null;
}

async function loadEffectivePlatformPermissionCodes(client, userId, availableTables) {
  const requiredTables = [
    "public.user_permission_groups",
    "public.group_permissions",
    "public.user_permissions",
    "public.permissions",
  ];
  if (!requiredTables.every((table) => availableTables.has(table))) {
    return [];
  }

  const groupPermissions = await client.query(`
    SELECT DISTINCT p.code
      FROM public.user_permission_groups upg
      JOIN public.group_permissions gp ON gp.group_id = upg.group_id
      JOIN public.permissions p ON p.id = gp.permission_id
     WHERE upg.user_id = $1
       AND p.code = ANY($2::text[])
  `, [userId, PLATFORM_PERMISSION_CODES]);

  const directPermissions = await client.query(`
    SELECT p.code,
           up.granted
      FROM public.user_permissions up
      JOIN public.permissions p ON p.id = up.permission_id
     WHERE up.user_id = $1
       AND p.code = ANY($2::text[])
  `, [userId, PLATFORM_PERMISSION_CODES]);

  const codes = new Set(groupPermissions.rows.map((row) => row.code));
  for (const row of directPermissions.rows) {
    if (row.granted === false) {
      codes.delete(row.code);
    } else {
      codes.add(row.code);
    }
  }
  return Array.from(codes);
}

function assertAdminRecordUsable(admin, adminId) {
  if (!admin) throw new Error(`Preserved administrator ${adminId} does not exist`);
  if (admin.disabled) throw new Error(`Preserved administrator ${adminId} is disabled`);
  if (!validatePasswordHashFormat(admin.password)) {
    throw new Error(`Preserved administrator ${adminId} does not have a valid password hash format`);
  }
}

function buildAdminQualification(admin, platformPermissionCodes = []) {
  const capabilityAuthority = relevantPlatformAuthorityCodes(admin.capabilities);
  const permissionAuthority = relevantPlatformAuthorityCodes(platformPermissionCodes);
  const relevantEffectivePlatformCapabilities = Array.from(new Set([
    ...(admin.userScope === PLATFORM_USER_SCOPE ? ["user_scope:platform"] : []),
    ...capabilityAuthority,
    ...permissionAuthority,
  ]));

  const hasAdminRole = admin.role === SYSTEM_ADMIN_ROLE;
  const hasPlatformAuthority = admin.userScope === PLATFORM_USER_SCOPE
    || capabilityAuthority.length > 0
    || permissionAuthority.length > 0;
  const qualifies = hasAdminRole && hasPlatformAuthority;

  let reason = "Account has the platform administrator role and platform authority.";
  if (!hasAdminRole && !hasPlatformAuthority) {
    reason = "Account is not the platform administrator role and has no platform-management authority.";
  } else if (!hasAdminRole) {
    reason = `Account role '${admin.role}' is not the platform administrator role '${SYSTEM_ADMIN_ROLE}'.`;
  } else if (!hasPlatformAuthority) {
    reason = "Account has the administrator role but no platform-management authority through userScope, capabilities, or platform permissions.";
  }

  return {
    qualified: qualifies,
    role: admin.role,
    userScope: admin.userScope,
    clientId: admin.clientId,
    relevantEffectivePlatformCapabilities,
    reason,
  };
}

function validateAdminForReset(admin, adminId, qualification) {
  assertAdminRecordUsable(admin, adminId);
  if (!qualification?.qualified) {
    throw new Error(`Preserved administrator ${adminId} is not authorized for platform reset: ${qualification?.reason || "qualification failed"}`);
  }
}

async function inspectUserScopeClientCompatibility(client) {
  const result = await client.query(`
    SELECT user_scope AS "userScope",
           COUNT(*)::int AS count
      FROM public.users
     WHERE (user_scope = 'platform' AND client_id IS NOT NULL)
        OR (user_scope <> 'platform' AND client_id IS NULL)
     GROUP BY user_scope
     ORDER BY user_scope
  `);
  return result.rows;
}

async function buildResetReport(client, options, discovery, classified, deletionOrder, beforeAdmin, adminQualification) {
  const plannedTables = [...classified.resetTables, ...classified.partialResetTables];
  const currentCounts = await countTables(client, plannedTables);
  const scopeClientCompatibility = await inspectUserScopeClientCompatibility(client);

  const userCountsResult = await client.query(`
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE id <> $1)::int AS users_to_delete,
      COUNT(*) FILTER (WHERE user_scope = 'tenant')::int AS tenant_users,
      COUNT(*) FILTER (WHERE client_id IS NOT NULL)::int AS users_with_client
    FROM public.users
  `, [options.preserveAdminId]);

  const expectedFinalCounts = {};
  for (const table of classified.resetTables) {
    expectedFinalCounts[table.key] = 0;
  }
  expectedFinalCounts["public.users"] = 1;
  if (currentCounts["public.user_permission_groups"] !== undefined) {
    const preservedGroups = await client.query(
      "SELECT COUNT(*)::int AS count FROM public.user_permission_groups WHERE user_id = $1",
      [options.preserveAdminId],
    );
    expectedFinalCounts["public.user_permission_groups"] = Number(preservedGroups.rows[0]?.count || 0);
  }
  if (currentCounts["public.user_permissions"] !== undefined) {
    const preservedPerms = await client.query(
      "SELECT COUNT(*)::int AS count FROM public.user_permissions WHERE user_id = $1",
      [options.preserveAdminId],
    );
    expectedFinalCounts["public.user_permissions"] = Number(preservedPerms.rows[0]?.count || 0);
  }

  const summaryCounts = {
    clientCount: currentCounts["public.clients"] || 0,
    tenantUserCount: Number(userCountsResult.rows[0]?.tenant_users || 0),
    sourceCount: currentCounts["public.sources"] || 0,
    articleCount: currentCounts["public.articles"] || 0,
    reportCount: (currentCounts["public.shared_reports"] || 0) + (currentCounts["public.reports"] || 0) + (currentCounts["public.report_baskets"] || 0),
    alertCount: (currentCounts["public.alert_rules"] || 0) + (currentCounts["public.alert_preferences"] || 0) + (currentCounts["public.internal_alerts"] || 0),
    briefingCount: (currentCounts["public.daily_briefs"] || 0) + (currentCounts["public.briefing_items"] || 0) + (currentCounts["public.briefings"] || 0),
    jobCount: (currentCounts["public.processing_jobs"] || 0) + (currentCounts["public.insight_jobs"] || 0) + (currentCounts["public.export_jobs"] || 0),
  };

  return {
    mode: options.mode,
    readyForApply: classified.unhandledTables.length === 0 && adminQualification.qualified,
    confirmationRequired: options.mode === "dry-run" ? REQUIRED_CONFIRMATION : undefined,
    preservedAdmin: {
      id: beforeAdmin.id,
      username: beforeAdmin.username,
      role: beforeAdmin.role,
      userScope: beforeAdmin.userScope,
      clientId: beforeAdmin.clientId,
      disabled: beforeAdmin.disabled,
    },
    adminQualification,
    summaryCounts,
    currentUserCounts: userCountsResult.rows[0],
    userScopeClientCompatibility: scopeClientCompatibility,
    discoveredOperationalTables: plannedTables.map((table) => table.key),
    currentRowCountByTable: currentCounts,
    proposedDeletionOrder: deletionOrder.map((table) => ({
      table: table.key,
      mode: table.resetMode,
    })),
    preservedTables: classified.preservedTables.map((table) => ({
      table: table.key,
      reason: table.reason,
    })),
    unhandledTableRisks: classified.unhandledTables,
    requiredSchemaChanges: [
      "ALTER TABLE public.users ALTER COLUMN client_id DROP NOT NULL",
      `ALTER TABLE public.users ADD CONSTRAINT ${USER_SCOPE_CLIENT_CONSTRAINT}`,
      "ALTER TABLE public.admin_audit_logs ALTER COLUMN client_id DROP NOT NULL",
      "ALTER TABLE public.api_keys ALTER COLUMN client_id DROP NOT NULL",
      "CREATE TABLE IF NOT EXISTS public.platform_reset_audit",
    ],
    expectedFinalCounts,
  };
}

async function ensureSupportSchema(client) {
  await client.query("ALTER TABLE IF EXISTS public.users ALTER COLUMN client_id DROP NOT NULL");
  await client.query("ALTER TABLE IF EXISTS public.admin_audit_logs ALTER COLUMN client_id DROP NOT NULL");
  await client.query("ALTER TABLE IF EXISTS public.api_keys ALTER COLUMN client_id DROP NOT NULL");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.platform_reset_audit (
      id serial PRIMARY KEY,
      preserved_admin_id integer NOT NULL,
      preserved_admin_username text NOT NULL,
      git_commit_sha text,
      database_identifier text,
      before_counts jsonb NOT NULL,
      deleted_counts jsonb NOT NULL,
      final_counts jsonb NOT NULL,
      duration_ms integer NOT NULL,
      result text NOT NULL,
      created_at timestamp DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_platform_reset_audit_created
      ON public.platform_reset_audit (created_at)
  `);
}

async function ensureUserScopeClientConstraint(client) {
  const incompatible = await inspectUserScopeClientCompatibility(client);
  if (incompatible.length > 0) {
    throw new Error(`Cannot add ${USER_SCOPE_CLIENT_CONSTRAINT}; incompatible users remain: ${JSON.stringify(incompatible)}`);
  }
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = '${USER_SCOPE_CLIENT_CONSTRAINT}'
           AND conrelid = 'public.users'::regclass
      ) THEN
        ALTER TABLE public.users
          ADD CONSTRAINT ${USER_SCOPE_CLIENT_CONSTRAINT}
          CHECK (
            (user_scope = 'platform' AND client_id IS NULL)
            OR
            (user_scope <> 'platform' AND client_id IS NOT NULL)
          );
      END IF;
    END
    $$;
  `);
}

async function acquireAdvisoryLock(client) {
  const result = await client.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [LOCK_NAME]);
  if (!result.rows[0]?.locked) {
    throw new Error("Another platform reset is already running");
  }
}

async function neutralizeActiveTenantJobs(client, availableTables) {
  const counts = {};
  if (availableTables.has("public.processing_jobs")) {
    const result = await client.query(`
      UPDATE public.processing_jobs
         SET status = 'failed',
             last_error = 'Neutralized by platform reset',
             completed_at = NOW()
       WHERE status IN ('pending', 'running')
    `);
    counts["public.processing_jobs"] = result.rowCount || 0;
  }
  if (availableTables.has("public.insight_jobs")) {
    const result = await client.query(`
      UPDATE public.insight_jobs
         SET status = 'expired',
             completed_at = NOW()
       WHERE status IN ('queued', 'scheduled', 'running', 'blocked_budget')
    `);
    counts["public.insight_jobs"] = result.rowCount || 0;
  }
  if (availableTables.has("public.export_jobs")) {
    const result = await client.query(`
      UPDATE public.export_jobs
         SET status = 'failed',
             completed_at = NOW()
       WHERE status IN ('pending', 'running', 'queued', 'scheduled')
    `);
    counts["public.export_jobs"] = result.rowCount || 0;
  }
  return counts;
}

async function convertAdmin(client, adminId) {
  const result = await client.query(`
    UPDATE public.users
       SET user_scope = 'platform',
           role = 'admin',
           client_id = NULL,
           disabled = false
     WHERE id = $1
     RETURNING id,
               username,
               password,
               role,
               user_scope AS "userScope",
               user_type AS "userType",
               parent_id AS "parentId",
               client_id AS "clientId",
               disabled,
               capabilities,
               created_at AS "createdAt"
  `, [adminId]);
  if (result.rows.length !== 1) {
    throw new Error("Admin conversion failed: exactly one preserved admin must be updated");
  }
  return result.rows[0];
}

async function deleteTableRows(client, table, adminId) {
  if (table.table_schema === "public" && table.table_name === "users") {
    const result = await client.query("DELETE FROM public.users WHERE id <> $1", [adminId]);
    return result.rowCount || 0;
  }
  if (table.table_schema === "public" && table.table_name === "user_permission_groups") {
    const result = await client.query("DELETE FROM public.user_permission_groups WHERE user_id <> $1", [adminId]);
    return result.rowCount || 0;
  }
  if (table.table_schema === "public" && table.table_name === "user_permissions") {
    const result = await client.query("DELETE FROM public.user_permissions WHERE user_id <> $1", [adminId]);
    return result.rowCount || 0;
  }
  const result = await client.query(`DELETE FROM ${tableSql(table)}`);
  return result.rowCount || 0;
}

async function executeDeletionPlan(client, deletionOrder, adminId) {
  const deletedCounts = {};
  for (const table of deletionOrder) {
    deletedCounts[table.key] = await deleteTableRows(client, table, adminId);
  }
  return deletedCounts;
}

async function tableHasColumn(client, table, columnName) {
  const result = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
      LIMIT 1`,
    [table.table_schema, table.table_name, columnName],
  );
  return (result.rowCount || 0) > 0;
}

async function resetSequences(client, deletionOrder, adminId) {
  const reset = [];
  for (const table of deletionOrder) {
    if (!(await tableHasColumn(client, table, "id"))) continue;

    const sequenceResult = await client.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence_name", [tableSql(table)]);
    const sequenceName = sequenceResult.rows[0]?.sequence_name;
    if (!sequenceName) continue;

    if (table.table_schema === "public" && table.table_name === "users") {
      await client.query(
        "SELECT setval($1::regclass, GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.users), $2), true)",
        [sequenceName, adminId],
      );
      reset.push({ table: table.key, sequenceName, mode: "above-preserved-admin" });
      continue;
    }

    const finalCount = await countTableRows(client, table);
    if (finalCount === 0) {
      await client.query("SELECT setval($1::regclass, 1, false)", [sequenceName]);
      reset.push({ table: table.key, sequenceName, mode: "empty-table-reset" });
    }
  }
  return reset;
}

async function countOrphans(client, foreignKeys) {
  const results = [];
  for (const fk of foreignKeys) {
    const child = { table_schema: fk.table_schema, table_name: fk.table_name };
    const parent = { table_schema: fk.foreign_table_schema, table_name: fk.foreign_table_name };
    const result = await client.query(`
      SELECT COUNT(*)::int AS count
        FROM ${tableSql(child)} child_table
        LEFT JOIN ${tableSql(parent)} parent_table
          ON child_table.${quoteIdent(fk.column_name)} = parent_table.${quoteIdent(fk.foreign_column_name)}
       WHERE child_table.${quoteIdent(fk.column_name)} IS NOT NULL
         AND parent_table.${quoteIdent(fk.foreign_column_name)} IS NULL
    `);
    const count = Number(result.rows[0]?.count || 0);
    if (count > 0) {
      results.push({
        table: tableKey(child),
        column: fk.column_name,
        parentTable: tableKey(parent),
        count,
      });
    }
  }
  return results;
}

async function verifyFinalState(client, classified, adminBefore, adminId) {
  const finalAdmin = await loadAdmin(client, adminId);
  if (!finalAdmin) throw new Error("Final integrity check failed: preserved admin is missing");
  if (finalAdmin.id !== adminBefore.id) throw new Error("Final integrity check failed: admin ID changed");
  if (finalAdmin.username !== adminBefore.username) throw new Error("Final integrity check failed: admin username changed");
  if (finalAdmin.password !== adminBefore.password) throw new Error("Final integrity check failed: admin password hash changed");
  if (finalAdmin.userScope !== "platform") throw new Error("Final integrity check failed: admin scope is not platform");
  if (finalAdmin.role !== "admin") throw new Error("Final integrity check failed: admin role is not admin");
  if (finalAdmin.clientId !== null) throw new Error("Final integrity check failed: admin clientId is not null");
  if (finalAdmin.disabled) throw new Error("Final integrity check failed: admin is disabled");
  if (!validatePasswordHashFormat(finalAdmin.password)) {
    throw new Error("Final integrity check failed: admin password hash format is invalid");
  }

  const usersCount = await client.query("SELECT COUNT(*)::int AS count FROM public.users");
  if (Number(usersCount.rows[0]?.count || 0) !== 1) {
    throw new Error("Final integrity check failed: more than one user remains");
  }

  const tenantUsers = await client.query(`
    SELECT COUNT(*)::int AS count
      FROM public.users
     WHERE user_scope = 'tenant'
        OR client_id IS NOT NULL
        OR id <> $1
  `, [adminId]);
  if (Number(tenantUsers.rows[0]?.count || 0) !== 0) {
    throw new Error("Final integrity check failed: tenant users or client-bound users remain");
  }

  for (const table of classified.resetTables) {
    const count = await countTableRows(client, table);
    if (count !== 0) {
      throw new Error(`Final integrity check failed: ${table.key} still has ${count} row(s)`);
    }
  }

  const permissionGroups = classified.partialResetTables.find((table) => table.key === "public.user_permission_groups");
  if (permissionGroups) {
    const stale = await client.query("SELECT COUNT(*)::int AS count FROM public.user_permission_groups WHERE user_id <> $1", [adminId]);
    if (Number(stale.rows[0]?.count || 0) !== 0) {
      throw new Error("Final integrity check failed: user permission groups remain for deleted users");
    }
  }

  const directPermissions = classified.partialResetTables.find((table) => table.key === "public.user_permissions");
  if (directPermissions) {
    const stale = await client.query("SELECT COUNT(*)::int AS count FROM public.user_permissions WHERE user_id <> $1", [adminId]);
    if (Number(stale.rows[0]?.count || 0) !== 0) {
      throw new Error("Final integrity check failed: user permissions remain for deleted users");
    }
  }

  return finalAdmin;
}

async function insertResetAudit(client, audit) {
  await client.query(`
    INSERT INTO public.platform_reset_audit (
      preserved_admin_id,
      preserved_admin_username,
      git_commit_sha,
      database_identifier,
      before_counts,
      deleted_counts,
      final_counts,
      duration_ms,
      result
    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
  `, [
    audit.preservedAdminId,
    audit.preservedAdminUsername,
    audit.gitCommitSha,
    audit.databaseIdentifier,
    JSON.stringify(audit.beforeCounts),
    JSON.stringify(audit.deletedCounts),
    JSON.stringify(audit.finalCounts),
    audit.durationMs,
    audit.result,
  ]);
}

async function runPlatformReset(client, options) {
  const startedAt = Date.now();
  const discovery = await discoverDatabase(client);
  const classified = classifyTables(discovery);
  const deletionOrder = buildDeletionOrder(classified, discovery.foreignKeys);
  const availableTables = new Set(discovery.tables.map((table) => tableKey(table)));
  const adminBefore = await loadAdmin(client, options.preserveAdminId);
  assertAdminRecordUsable(adminBefore, options.preserveAdminId);
  const platformPermissionCodes = await loadEffectivePlatformPermissionCodes(client, options.preserveAdminId, availableTables);
  const adminQualification = buildAdminQualification(adminBefore, platformPermissionCodes);
  const dryRunReport = await buildResetReport(client, options, discovery, classified, deletionOrder, adminBefore, adminQualification);

  if (options.mode === "dry-run") {
    return dryRunReport;
  }

  validateAdminForReset(adminBefore, options.preserveAdminId, adminQualification);

  if (classified.unhandledTables.length > 0) {
    throw new Error(`Unhandled operational table(s) discovered: ${classified.unhandledTables.map((table) => table.key).join(", ")}`);
  }

  const beforeCounts = dryRunReport.currentRowCountByTable;
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await acquireAdvisoryLock(client);
    await ensureSupportSchema(client);

    const rediscovery = await discoverDatabase(client);
    const reclassified = classifyTables(rediscovery);
    if (reclassified.unhandledTables.length > 0) {
      throw new Error(`Unhandled operational table(s) discovered after support schema check: ${reclassified.unhandledTables.map((table) => table.key).join(", ")}`);
    }
    const refreshedDeletionOrder = buildDeletionOrder(reclassified, rediscovery.foreignKeys);
    const refreshedAvailableTables = new Set(rediscovery.tables.map((table) => tableKey(table)));

    const convertedAdmin = await convertAdmin(client, options.preserveAdminId);
    if (convertedAdmin.username !== adminBefore.username || convertedAdmin.password !== adminBefore.password) {
      throw new Error("Admin conversion changed immutable credentials");
    }

    const neutralizedJobs = await neutralizeActiveTenantJobs(client, refreshedAvailableTables);
    const deletedCounts = await executeDeletionPlan(client, refreshedDeletionOrder, options.preserveAdminId);

    if (options.simulateFailureAt === "after-delete") {
      throw new Error("Simulated reset failure after deletion");
    }

    const sequences = await resetSequences(client, refreshedDeletionOrder, options.preserveAdminId);
    const finalAdmin = await verifyFinalState(client, reclassified, adminBefore, options.preserveAdminId);
    await ensureUserScopeClientConstraint(client);
    const orphanedRecords = await countOrphans(client, rediscovery.foreignKeys);
    if (orphanedRecords.length > 0) {
      throw new Error(`Final integrity check failed: orphaned records remain: ${JSON.stringify(orphanedRecords)}`);
    }

    const finalCounts = await countTables(client, [...reclassified.resetTables, ...reclassified.partialResetTables]);
    if (refreshedAvailableTables.has("public.platform_reset_audit")) {
      const auditCount = await countTableRows(client, { table_schema: "public", table_name: "platform_reset_audit", key: "public.platform_reset_audit" });
      finalCounts["public.platform_reset_audit"] = auditCount + 1;
    }

    await insertResetAudit(client, {
      preservedAdminId: finalAdmin.id,
      preservedAdminUsername: finalAdmin.username,
      gitCommitSha: getGitCommitSha(),
      databaseIdentifier: getDatabaseIdentifier(process.env.DATABASE_URL),
      beforeCounts,
      deletedCounts,
      finalCounts,
      durationMs: Date.now() - startedAt,
      result: "success",
    });

    await client.query("COMMIT");
    transactionOpen = false;

    return {
      ...dryRunReport,
      mode: "apply",
      result: "success",
      neutralizedJobs,
      deletedCounts,
      finalCounts,
      sequences,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The original reset failure is the actionable error.
      }
    }
    throw error;
  }
}

module.exports = {
  REQUIRED_CONFIRMATION,
  LOCK_NAME,
  OPERATIONAL_TABLE_NAMES,
  PARTIAL_RESET_TABLE_NAMES,
  PRESERVED_TABLE_NAMES,
  parseResetArgs,
  quoteIdent,
  tableKey,
  tableSql,
  discoverDatabase,
  classifyTables,
  buildDeletionOrder,
  runPlatformReset,
  validatePasswordHashFormat,
  verifyPasswordHash,
};
