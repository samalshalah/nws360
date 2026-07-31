const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const {
  classifyArticleCategory,
  classifyArticlePriority,
} = require("../shared/article-classifier.ts");
const {
  ARTICLE_CATEGORIES,
  ARTICLE_PRIORITIES,
} = require("../shared/article-taxonomy.ts");

const MIGRATION_NAME = "iraq-report-taxonomy";
const RECLASSIFY_NAME = "iraq-report-taxonomy-targeted-reclassify";
const BACKUP_WARNING = "Create and verify a Neon database backup before applying this migration.";

const VALID_CATEGORIES = ARTICLE_CATEGORIES.map((category) => category.code);
const VALID_PRIORITIES = ARTICLE_PRIORITIES.map((priority) => priority.code);
const VALID_CATEGORY_SET = new Set(VALID_CATEGORIES);
const VALID_PRIORITY_SET = new Set(VALID_PRIORITIES);

const LEGACY_CATEGORY_MAP = new Map([
  ["us_iraq_international", "client_bilateral_relations"],
  ["bilateral_international_relations", "regional_international_relations"],
  ["political", "parliament_politics"],
  ["parliament_law", "parliament_politics"],
  ["security", "security_stability"],
  ["economy", "economy_oil_finance"],
  ["oil_energy", "economy_oil_finance"],
  ["banking_currency", "economy_oil_finance"],
  ["business", "economy_oil_finance"],
  ["government_services", "iraqi_government"],
  ["health", "development_services"],
  ["education", "development_services"],
  ["environment_water", "development_services"],
  ["corruption_courts", "justice_accountability"],
  ["protests_public_opinion", "civil_society_humanitarian"],
  ["humanitarian_ngos", "civil_society_humanitarian"],
  ["culture_society", "civil_society_humanitarian"],
]);

const FORCE_RECLASSIFY_CATEGORIES = new Set([
  "foreign_relations",
  "urgent",
  "general",
  "provinces",
  "tech",
  "sports",
  "science",
  "entertainment",
]);

const DEFAULT_TARGETED_RECLASSIFY_CATEGORIES = new Set([
  ...FORCE_RECLASSIFY_CATEGORIES,
  "other",
]);

const ARTICLE_IMMUTABLE_COLUMNS = [
  "id",
  "title",
  "content",
  "content_clean",
  "summary",
  "url",
  "source_id",
  "published_at",
  "ingested_at",
  "language",
  "country",
  "sentiment_score",
  "sentiment_label",
  "keywords",
  "topics",
  "province",
  "workflow_status",
  "manual_tags",
  "image_url",
  "sub_source",
  "engagement_likes",
  "engagement_comments",
  "engagement_shares",
  "client_id",
  "cross_posts",
  "ai_analysis_status",
  "ai_retry_count",
  "ai_last_retry_at",
  "created_at",
];

const TARGET_RELATION_SPECS = [
  { key: "comments.article-target", table: "comments", typeColumn: "target_type", idColumn: "target_id" },
  { key: "annotations.article-target", table: "annotations", typeColumn: "target_type", idColumn: "target_id" },
  { key: "tag_assignments.article-target", table: "tag_assignments", typeColumn: "target_type", idColumn: "target_id" },
  { key: "activity_events.article-target", table: "activity_events", typeColumn: "target_type", idColumn: "target_id" },
  { key: "institutional_notes.article-target", table: "institutional_notes", typeColumn: "target_type", idColumn: "target_id" },
  { key: "tasks.article-target", table: "tasks", typeColumn: "related_target_type", idColumn: "related_target_id" },
  { key: "briefing_items.report-basket-articles", table: "briefing_items", typeColumn: "item_type", idColumn: "item_ref_id" },
];

function md5(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: false,
    confirmBackup: false,
    help: false,
    clientId: null,
    articleId: null,
    category: null,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [rawName, inlineValue] = token.includes("=") ? token.split(/=(.*)/s, 2) : [token, undefined];
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${rawName}`);
      return argv[index];
    };

    switch (rawName) {
      case "--apply":
        args.apply = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--confirm-backup":
        args.confirmBackup = true;
        break;
      case "--client-id":
        args.clientId = parsePositiveInteger(readValue(), "--client-id");
        break;
      case "--article-id":
        args.articleId = parsePositiveInteger(readValue(), "--article-id");
        break;
      case "--category":
        args.category = String(readValue()).trim();
        break;
      case "--limit":
        args.limit = parsePositiveInteger(readValue(), "--limit");
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (args.apply && args.dryRun) {
    throw new Error("Use either --apply or --dry-run, not both.");
  }

  return args;
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function assertApplyIsConfirmed(args) {
  if (args.apply && !args.confirmBackup) {
    const error = new Error(`${BACKUP_WARNING} Re-run with --apply --confirm-backup after the backup is verified.`);
    error.code = "BACKUP_CONFIRMATION_REQUIRED";
    throw error;
  }
}

function getGitSha(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function databaseIdentifier(connectionString) {
  if (!connectionString) return "DATABASE_URL not set";
  try {
    const url = new URL(connectionString);
    const databaseName = url.pathname.replace(/^\//, "") || "<default>";
    return `${url.protocol}//${url.hostname}/${databaseName}`;
  } catch {
    return "unparseable DATABASE_URL";
  }
}

function quoteIdent(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function getTableColumns(client, tableName) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function ensureArticleSchema(client) {
  await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'routine'`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_category ON articles (client_id, category)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_priority ON articles (client_id, priority)`);
}

function buildArticleSelectSql(options = {}) {
  const {
    includeClientSettings = false,
    articleColumns = new Set(),
    clientSettingsColumns = new Set(),
    selection = {},
  } = options;
  const params = [];
  const where = [];

  if (selection.clientId) {
    params.push(selection.clientId);
    where.push(`a.client_id = $${params.length}`);
  }
  if (selection.articleId) {
    params.push(selection.articleId);
    where.push(`a.id = $${params.length}`);
  }
  if (selection.category) {
    params.push(selection.category);
    where.push(`COALESCE(a.category, '<null>') = $${params.length}`);
  }

  const settingsText = (column) => (
    clientSettingsColumns.has(column) ? `cs.${quoteIdent(column)}` : "NULL::text"
  );
  const settingsTextArray = (column) => (
    clientSettingsColumns.has(column) ? `cs.${quoteIdent(column)}` : "ARRAY[]::text[]"
  );
  const settingsFields = includeClientSettings
    ? `,
      ${settingsText("home_country_code")} AS "homeCountryCode",
      ${settingsText("home_country_name")} AS "homeCountryName",
      ${settingsTextArray("home_country_aliases")} AS "homeCountryAliases",
      ${settingsTextArray("embassy_aliases")} AS "embassyAliases",
      ${settingsTextArray("ambassador_aliases")} AS "ambassadorAliases",
      ${settingsText("bilateral_category_label")} AS "bilateralCategoryLabel"`
    : "";
  const settingsJoin = includeClientSettings
    ? "LEFT JOIN client_settings cs ON cs.client_id = a.client_id"
    : "";
  const contentCleanExpression = articleColumns.has("content_clean")
    ? "a.content_clean"
    : "NULL::text";
  const priorityExpression = articleColumns.has("priority")
    ? "a.priority"
    : "NULL::text";

  if (selection.limit) {
    params.push(selection.limit);
  }

  const sql = `
    SELECT
      a.id,
      a.client_id AS "clientId",
      a.source_id AS "sourceId",
      a.title,
      a.url,
      a.summary,
      ${contentCleanExpression} AS "contentClean",
      a.content,
      a.category,
      ${priorityExpression} AS priority,
      s.name AS "sourceName",
      s.category AS "sourceCategory"
      ${settingsFields}
    FROM articles a
    LEFT JOIN sources s ON s.id = a.source_id
    ${settingsJoin}
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY a.id ASC
    ${selection.limit ? `LIMIT $${params.length}` : ""}
  `;

  return { sql, params };
}

async function fetchArticlesForPlan(client, selection = {}) {
  const includeClientSettings = await tableExists(client, "client_settings");
  const articleColumns = await getTableColumns(client, "articles");
  const clientSettingsColumns = includeClientSettings ? await getTableColumns(client, "client_settings") : new Set();
  const { sql, params } = buildArticleSelectSql({ includeClientSettings, articleColumns, clientSettingsColumns, selection });
  const result = await client.query(sql, params);
  return result.rows;
}

function profileFromRow(row) {
  const hasProfile = row.homeCountryCode
    || row.homeCountryName
    || (Array.isArray(row.homeCountryAliases) && row.homeCountryAliases.length > 0)
    || (Array.isArray(row.embassyAliases) && row.embassyAliases.length > 0)
    || (Array.isArray(row.ambassadorAliases) && row.ambassadorAliases.length > 0)
    || row.bilateralCategoryLabel;

  if (!hasProfile) return null;

  return {
    homeCountryCode: row.homeCountryCode || null,
    homeCountryName: row.homeCountryName || null,
    homeCountryAliases: Array.isArray(row.homeCountryAliases) ? row.homeCountryAliases : [],
    embassyAliases: Array.isArray(row.embassyAliases) ? row.embassyAliases : [],
    ambassadorAliases: Array.isArray(row.ambassadorAliases) ? row.ambassadorAliases : [],
    bilateralCategoryLabel: row.bilateralCategoryLabel || null,
  };
}

function normalizePriority(priority) {
  return VALID_PRIORITY_SET.has(priority) ? priority : "routine";
}

function hasEnoughText(row) {
  const text = [row.title, row.summary, row.contentClean, row.content]
    .filter(Boolean)
    .join(" ")
    .trim();
  return text.length >= 20;
}

function classifyRow(row, options = {}) {
  const oldCategory = row.category || null;
  const oldPriority = row.priority || null;
  const normalizedOldPriority = normalizePriority(row.priority);
  const forceCategories = options.forceReclassifyCategories || FORCE_RECLASSIFY_CATEGORIES;
  const enoughText = hasEnoughText(row);

  let nextCategory = oldCategory;
  let classificationReason = "already-valid-category";

  if (LEGACY_CATEGORY_MAP.has(oldCategory)) {
    nextCategory = LEGACY_CATEGORY_MAP.get(oldCategory);
    classificationReason = `legacy-map:${oldCategory}`;
  } else if (VALID_CATEGORY_SET.has(oldCategory) && !forceCategories.has(oldCategory)) {
    nextCategory = oldCategory;
  } else {
    nextCategory = classifyArticleCategory({
      title: row.title,
      summary: row.summary,
      content: row.contentClean || row.content,
      sourceName: row.sourceName,
      sourceCategory: row.sourceCategory,
      url: row.url,
    }, profileFromRow(row));
    classificationReason = nextCategory === "other"
      ? "deterministic-classifier:fallback-other"
      : `deterministic-classifier:${nextCategory}`;
  }

  let nextPriority = normalizedOldPriority;
  let priorityReason = "preserve-valid-priority";
  if (oldCategory === "urgent" && !["important", "urgent", "critical"].includes(normalizedOldPriority)) {
    nextPriority = "urgent";
    priorityReason = "legacy-urgent-category";
  } else if (!VALID_PRIORITY_SET.has(row.priority)) {
    nextPriority = classifyArticlePriority({
      title: row.title,
      summary: row.summary,
      content: row.contentClean || row.content,
    }, profileFromRow(row));
    priorityReason = `deterministic-priority:${nextPriority}`;
  }

  const uncertain = !enoughText || nextCategory === "other";

  return {
    id: row.id,
    clientId: row.clientId,
    title: row.title,
    oldCategory,
    oldPriority,
    nextCategory,
    nextPriority,
    classificationReason,
    priorityReason,
    insufficientTitleContent: !enoughText,
    uncertain,
    requiresUpdate: oldCategory !== nextCategory || oldPriority !== nextPriority,
  };
}

function buildPlanFromRows(rows, options = {}) {
  const classified = rows.map((row) => classifyRow(row, options));
  validatePlan(classified);
  return classified;
}

function validatePlan(plan) {
  for (const row of plan) {
    if (!VALID_CATEGORY_SET.has(row.nextCategory)) {
      throw new Error(`Invalid category planned for article ${row.id}: ${row.nextCategory}`);
    }
    if (!VALID_PRIORITY_SET.has(row.nextPriority)) {
      throw new Error(`Invalid priority planned for article ${row.id}: ${row.nextPriority}`);
    }
  }
}

function increment(map, key, amount = 1) {
  const normalizedKey = key == null ? "<null>" : String(key);
  map.set(normalizedKey, (map.get(normalizedKey) || 0) + amount);
}

function sortedCounts(map, keyName) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ [keyName]: key, count }));
}

function planReport(rows, plan, options = {}) {
  const currentCategories = new Map();
  const currentPriorities = new Map();
  const proposedCategories = new Map();
  const proposedPriorities = new Map();
  const categoryMovements = new Map();
  const priorityMovements = new Map();
  const byClient = new Map();

  for (const row of plan) {
    increment(currentCategories, row.oldCategory);
    increment(currentPriorities, row.oldPriority);
    increment(proposedCategories, row.nextCategory);
    increment(proposedPriorities, row.nextPriority);

    if (row.oldCategory !== row.nextCategory) {
      increment(categoryMovements, `${row.oldCategory || "<null>"} -> ${row.nextCategory}`);
    }
    if (row.oldPriority !== row.nextPriority) {
      increment(priorityMovements, `${row.oldPriority || "<null>"} -> ${row.nextPriority}`);
    }

    const clientKey = row.clientId == null ? "<null>" : String(row.clientId);
    if (!byClient.has(clientKey)) {
      byClient.set(clientKey, {
        clientId: clientKey,
        reviewed: 0,
        updatesRequired: 0,
        unchanged: 0,
        uncertain: 0,
        endingOther: 0,
      });
    }
    const clientReport = byClient.get(clientKey);
    clientReport.reviewed += 1;
    if (row.requiresUpdate) clientReport.updatesRequired += 1;
    else clientReport.unchanged += 1;
    if (row.uncertain) clientReport.uncertain += 1;
    if (row.nextCategory === "other") clientReport.endingOther += 1;
  }

  const updatesRequired = plan.filter((row) => row.requiresUpdate).length;
  const uncertainSamples = plan
    .filter((row) => row.uncertain)
    .slice(0, options.sampleLimit || 20)
    .map((row) => ({
      id: row.id,
      clientId: row.clientId,
      title: String(row.title || "").slice(0, 180),
      oldCategory: row.oldCategory,
      newCategory: row.nextCategory,
      oldPriority: row.oldPriority,
      newPriority: row.nextPriority,
      classificationReason: row.classificationReason,
    }));

  return {
    totalArticleCount: options.totalArticleCount ?? rows.length,
    reviewedArticleCount: rows.length,
    currentCategories: sortedCounts(currentCategories, "category"),
    currentPriorities: sortedCounts(currentPriorities, "priority"),
    proposedCategories: sortedCounts(proposedCategories, "category"),
    proposedPriorities: sortedCounts(proposedPriorities, "priority"),
    categoryMovements: sortedCounts(categoryMovements, "movement"),
    priorityMovements: sortedCounts(priorityMovements, "movement"),
    updatesRequired,
    unchangedCount: plan.length - updatesRequired,
    endingOtherCount: plan.filter((row) => row.nextCategory === "other").length,
    insufficientTitleContentCount: plan.filter((row) => row.insufficientTitleContent).length,
    uncertainCount: plan.filter((row) => row.uncertain).length,
    byClientId: Array.from(byClient.values()).sort((a, b) => a.clientId.localeCompare(b.clientId)),
    uncertainSamples,
    uncertainHandling: "Preserved in place and flagged in this audit output. No workflow or manual tag fields are changed by this migration.",
  };
}

async function getTotalArticleCount(client) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM articles`);
  return result.rows[0]?.count || 0;
}

async function collectIntegritySnapshot(client, options = {}) {
  const articleColumns = await getTableColumns(client, "articles");
  const includedColumns = ARTICLE_IMMUTABLE_COLUMNS.filter((column) => articleColumns.has(column));
  const immutableParts = includedColumns.map((column) => `COALESCE(to_jsonb(a.${quoteIdent(column)})::text, 'null')`);
  const hasArticleScope = Array.isArray(options.articleIds);
  const whereSql = hasArticleScope
    ? `WHERE a.id = ANY($1::int[])`
    : "";
  const params = hasArticleScope ? [options.articleIds] : [];
  const articleResult = await client.query(
    `
      SELECT
        COUNT(*)::int AS article_count,
        COUNT(DISTINCT a.id)::int AS distinct_article_ids,
        COALESCE(md5(COALESCE(string_agg(a.id::text, '|' ORDER BY a.id), '')), '') AS article_ids_checksum,
        COALESCE(md5(COALESCE(string_agg(CONCAT_WS(chr(31), ${immutableParts.join(", ")}), chr(30) ORDER BY a.id), '')), '') AS immutable_article_checksum
      FROM articles a
      ${whereSql}
    `,
    params,
  );

  return {
    scope: hasArticleScope ? "selected-articles" : "all-articles",
    articles: {
      count: articleResult.rows[0]?.article_count || 0,
      distinctArticleIds: articleResult.rows[0]?.distinct_article_ids || 0,
      articleIdsChecksum: articleResult.rows[0]?.article_ids_checksum || "",
      immutableArticleChecksum: articleResult.rows[0]?.immutable_article_checksum || "",
      immutableColumns: includedColumns,
    },
    relationships: await collectRelationshipSnapshot(client),
  };
}

async function collectRelationshipSnapshot(client) {
  const relationships = {};
  const articleIdTables = await client.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'article_id'
        AND table_name <> 'articles'
      ORDER BY table_name, column_name
    `,
  );

  for (const row of articleIdTables.rows) {
    const key = `${row.table_name}.${row.column_name}`;
    relationships[key] = await relationCountAndChecksum(client, {
      table: row.table_name,
      idColumn: row.column_name,
      whereSql: `${quoteIdent(row.column_name)} IS NOT NULL`,
    });
  }

  for (const spec of TARGET_RELATION_SPECS) {
    if (!(await tableExists(client, spec.table))) continue;
    const columns = await getTableColumns(client, spec.table);
    if (!columns.has(spec.typeColumn) || !columns.has(spec.idColumn)) continue;
    relationships[spec.key] = await relationCountAndChecksum(client, {
      table: spec.table,
      idColumn: spec.idColumn,
      whereSql: `${quoteIdent(spec.typeColumn)} = 'article' AND ${quoteIdent(spec.idColumn)} IS NOT NULL`,
    });
  }

  return relationships;
}

async function relationCountAndChecksum(client, spec) {
  const columns = await getTableColumns(client, spec.table);
  const orderColumn = columns.has("id") ? "id" : spec.idColumn;
  const result = await client.query(
    `
      SELECT
        COUNT(*)::int AS count,
        COALESCE(md5(COALESCE(string_agg(${quoteIdent(spec.idColumn)}::text, '|' ORDER BY ${quoteIdent(orderColumn)}), '')), '') AS checksum
      FROM ${quoteIdent(spec.table)}
      WHERE ${spec.whereSql}
    `,
  );
  return {
    count: result.rows[0]?.count || 0,
    checksum: result.rows[0]?.checksum || "",
  };
}

function compareIntegritySnapshots(before, after) {
  const checks = [];
  const addCheck = (name, pass, beforeValue, afterValue) => {
    checks.push({ name, pass, before: beforeValue, after: afterValue });
  };

  addCheck("article-count-unchanged", before.articles.count === after.articles.count, before.articles.count, after.articles.count);
  addCheck("distinct-article-ids-unchanged", before.articles.distinctArticleIds === after.articles.distinctArticleIds, before.articles.distinctArticleIds, after.articles.distinctArticleIds);
  addCheck("article-ids-unchanged", before.articles.articleIdsChecksum === after.articles.articleIdsChecksum, before.articles.articleIdsChecksum, after.articles.articleIdsChecksum);
  addCheck("article-immutable-fields-unchanged", before.articles.immutableArticleChecksum === after.articles.immutableArticleChecksum, before.articles.immutableArticleChecksum, after.articles.immutableArticleChecksum);

  const keys = new Set([...Object.keys(before.relationships), ...Object.keys(after.relationships)]);
  for (const key of keys) {
    const beforeRelation = before.relationships[key] || { count: 0, checksum: "" };
    const afterRelation = after.relationships[key] || { count: 0, checksum: "" };
    addCheck(`${key}-count-unchanged`, beforeRelation.count === afterRelation.count, beforeRelation.count, afterRelation.count);
    addCheck(`${key}-article-links-unchanged`, beforeRelation.checksum === afterRelation.checksum, beforeRelation.checksum, afterRelation.checksum);
  }

  return {
    passed: checks.every((check) => check.pass),
    checks,
  };
}

async function validateStoredTaxonomyValues(client, options = {}) {
  const params = [VALID_CATEGORIES, VALID_PRIORITIES];
  const hasArticleScope = Array.isArray(options.articleIds);
  const whereSql = hasArticleScope
    ? "AND id = ANY($3::int[])"
    : "";
  if (hasArticleScope) params.push(options.articleIds);

  const result = await client.query(
    `
      SELECT COUNT(*)::int AS invalid_count
      FROM articles
      WHERE (
        category IS NULL
        OR NOT category = ANY($1::text[])
        OR priority IS NULL
        OR NOT priority = ANY($2::text[])
      )
      ${whereSql}
    `,
    params,
  );

  const invalidCount = result.rows[0]?.invalid_count || 0;
  return {
    passed: invalidCount === 0,
    invalidCount,
  };
}

async function applyPlan(client, plan) {
  const updates = plan.filter((row) => row.requiresUpdate);
  let updatedRows = 0;
  const batchSize = 500;

  for (let offset = 0; offset < updates.length; offset += batchSize) {
    const batch = updates.slice(offset, offset + batchSize);
    const params = [];
    const values = batch.map((row) => {
      params.push(row.id, row.nextCategory, row.nextPriority);
      const base = params.length - 2;
      return `($${base}::int, $${base + 1}::text, $${base + 2}::text)`;
    });
    const result = await client.query(
      `
        UPDATE articles AS a
        SET category = v.next_category,
            priority = v.next_priority
        FROM (VALUES ${values.join(", ")}) AS v(id, next_category, next_priority)
        WHERE a.id = v.id
          AND (
            a.category IS DISTINCT FROM v.next_category
            OR a.priority IS DISTINCT FROM v.next_priority
          )
      `,
      params,
    );
    updatedRows += result.rowCount || 0;
  }

  return updatedRows;
}

function buildAuditBase({ name, mode, cwd, env }) {
  return {
    migration: name,
    timestamp: new Date().toISOString(),
    mode,
    gitSha: getGitSha(cwd),
    database: {
      identifier: databaseIdentifier(env.DATABASE_URL),
    },
    backupWarning: BACKUP_WARNING,
  };
}

function printJson(logger, payload) {
  logger.log(JSON.stringify(payload, null, 2));
}

function backupAbortAudit({ name, cwd, env, startedAt, logger }) {
  const audit = {
    ...buildAuditBase({ name, mode: "apply-aborted", cwd, env }),
    success: false,
    error: `${BACKUP_WARNING} Apply aborted. Use npm run db:migrate:iraq-taxonomy -- --apply --confirm-backup after backup verification.`,
    durationMs: Date.now() - startedAt,
  };
  logger.error(BACKUP_WARNING);
  printJson(logger, audit);
  process.exitCode = 1;
}

async function previewWithClient(client, options = {}) {
  const rows = await fetchArticlesForPlan(client, options.selection || {});
  const plan = buildPlanFromRows(rows, options.classification || {});
  const totalArticleCount = await getTotalArticleCount(client);
  return {
    rows,
    plan,
    report: planReport(rows, plan, { totalArticleCount, sampleLimit: 20 }),
  };
}

async function runIraqTaxonomyMigration({ Client, argv, cwd, env, logger }) {
  const startedAt = Date.now();
  const args = parseArgs(argv);
  if (args.help) {
    logger.log("Usage: npm run db:migrate:iraq-taxonomy [-- --apply --confirm-backup]");
    return;
  }

  if (args.apply && !args.confirmBackup) {
    backupAbortAudit({ name: MIGRATION_NAME, cwd, env, startedAt, logger });
    return;
  }
  assertApplyIsConfirmed(args);

  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  logger.error(BACKUP_WARNING);

  const mode = args.apply ? "apply" : "dry-run";
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    if (!args.apply) {
      const preview = await previewWithClient(client);
      const integrityBefore = await collectIntegritySnapshot(client);
      printJson(logger, {
        ...buildAuditBase({ name: MIGRATION_NAME, mode, cwd, env }),
        success: true,
        note: "Dry-run only. No database changes were made.",
        applyCommand: "npm run db:migrate:iraq-taxonomy -- --apply --confirm-backup",
        reviewed: preview.report.reviewedArticleCount,
        updated: 0,
        report: preview.report,
        integrityChecks: {
          mode: "dry-run-before-snapshot",
          snapshot: integrityBefore,
        },
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    await client.query("BEGIN");
    try {
      await ensureArticleSchema(client);
      const preview = await previewWithClient(client);
      const before = await collectIntegritySnapshot(client);
      const updatedRows = await applyPlan(client, preview.plan);
      const taxonomyValidation = await validateStoredTaxonomyValues(client);
      if (!taxonomyValidation.passed) {
        throw new Error(`Taxonomy validation failed: ${taxonomyValidation.invalidCount} invalid article categories/priorities remain.`);
      }
      const after = await collectIntegritySnapshot(client);
      const integrity = compareIntegritySnapshots(before, after);
      if (!integrity.passed) {
        throw new Error("Integrity validation failed. Rolling back; see integrityChecks for failed checks.");
      }
      await client.query("COMMIT");
      printJson(logger, {
        ...buildAuditBase({ name: MIGRATION_NAME, mode, cwd, env }),
        success: true,
        note: "Database changes were committed. Only article category and priority were updated.",
        reviewed: preview.report.reviewedArticleCount,
        updated: updatedRows,
        report: preview.report,
        integrityChecks: {
          taxonomyValidation,
          ...integrity,
        },
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      printJson(logger, {
        ...buildAuditBase({ name: MIGRATION_NAME, mode: "apply-rolled-back", cwd, env }),
        success: false,
        error: error.message,
        durationMs: Date.now() - startedAt,
      });
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

function buildTargetedSelection(args) {
  const selection = {
    clientId: args.clientId,
    articleId: args.articleId,
    category: args.category,
    limit: args.limit,
  };

  if (!selection.clientId && !selection.articleId && !selection.category) {
    selection.category = "other";
    selection.limit = selection.limit || 50;
    selection.defaulted = true;
  }

  if (!selection.limit && !selection.articleId) {
    selection.limit = 100;
  }

  return selection;
}

async function runIraqTaxonomyReclassifier({ Client, argv, cwd, env, logger }) {
  const startedAt = Date.now();
  const args = parseArgs(argv);
  if (args.help) {
    logger.log("Usage: npm run reclassify:iraq-taxonomy -- [--dry-run] [--client-id N] [--article-id N] [--category other] [--limit N] [--apply --confirm-backup]");
    return;
  }

  if (args.apply && !args.confirmBackup) {
    backupAbortAudit({ name: RECLASSIFY_NAME, cwd, env, startedAt, logger });
    return;
  }
  assertApplyIsConfirmed(args);

  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  logger.error(BACKUP_WARNING);

  const selection = buildTargetedSelection(args);
  const mode = args.apply ? "apply" : "dry-run";
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    if (!args.apply) {
      const preview = await previewWithClient(client, {
        selection,
        classification: { forceReclassifyCategories: DEFAULT_TARGETED_RECLASSIFY_CATEGORIES },
      });
      printJson(logger, {
        ...buildAuditBase({ name: RECLASSIFY_NAME, mode, cwd, env }),
        success: true,
        note: "Dry-run only. No database changes were made. No AI calls were made.",
        selection,
        aiAssisted: false,
        applyCommand: "npm run reclassify:iraq-taxonomy -- --apply --confirm-backup --category other --limit 50",
        reviewed: preview.report.reviewedArticleCount,
        updated: 0,
        report: preview.report,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    await client.query("BEGIN");
    try {
      await ensureArticleSchema(client);
      const preview = await previewWithClient(client, {
        selection,
        classification: { forceReclassifyCategories: DEFAULT_TARGETED_RECLASSIFY_CATEGORIES },
      });
      const selectedIds = preview.plan.map((row) => row.id);
      const before = await collectIntegritySnapshot(client, { articleIds: selectedIds });
      const updatedRows = await applyPlan(client, preview.plan);
      const taxonomyValidation = await validateStoredTaxonomyValues(client, { articleIds: selectedIds });
      if (!taxonomyValidation.passed) {
        throw new Error(`Taxonomy validation failed: ${taxonomyValidation.invalidCount} invalid selected article categories/priorities remain.`);
      }
      const after = await collectIntegritySnapshot(client, { articleIds: selectedIds });
      const integrity = compareIntegritySnapshots(before, after);
      if (!integrity.passed) {
        throw new Error("Integrity validation failed. Rolling back selected reclassification.");
      }
      await client.query("COMMIT");
      printJson(logger, {
        ...buildAuditBase({ name: RECLASSIFY_NAME, mode, cwd, env }),
        success: true,
        note: "Selected records were updated. Only article category and priority were changed. No AI calls were made.",
        selection,
        aiAssisted: false,
        reviewed: preview.report.reviewedArticleCount,
        updated: updatedRows,
        report: preview.report,
        integrityChecks: {
          taxonomyValidation,
          ...integrity,
        },
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      printJson(logger, {
        ...buildAuditBase({ name: RECLASSIFY_NAME, mode: "apply-rolled-back", cwd, env }),
        success: false,
        selection,
        aiAssisted: false,
        error: error.message,
        durationMs: Date.now() - startedAt,
      });
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

function createMockIntegritySnapshot(state) {
  const articleRows = state.articles
    .map((article) => ({
      ...article,
      category: undefined,
      priority: undefined,
    }))
    .sort((a, b) => a.id - b.id);
  const ids = articleRows.map((article) => article.id).join("|");
  const relationships = {};

  for (const [key, values] of Object.entries(state.relationships || {})) {
    const refs = values.map((value) => value.articleId ?? value.targetId ?? value.itemRefId).filter((value) => value != null);
    relationships[key] = {
      count: refs.length,
      checksum: md5(refs.join("|")),
    };
  }

  return {
    articles: {
      count: articleRows.length,
      distinctArticleIds: new Set(articleRows.map((article) => article.id)).size,
      articleIdsChecksum: md5(ids),
      immutableArticleChecksum: md5(JSON.stringify(articleRows)),
    },
    relationships,
  };
}

function applyPlanToMockState(state, plan, options = {}) {
  if (options.apply && !options.confirmBackup) {
    throw new Error(BACKUP_WARNING);
  }
  validatePlan(plan);
  if (!options.apply) return state;

  const byId = new Map(plan.map((row) => [row.id, row]));
  for (const article of state.articles) {
    const planned = byId.get(article.id);
    if (!planned || !planned.requiresUpdate) continue;
    article.category = planned.nextCategory;
    article.priority = planned.nextPriority;
  }
  return state;
}

module.exports = {
  BACKUP_WARNING,
  DEFAULT_TARGETED_RECLASSIFY_CATEGORIES,
  MIGRATION_NAME,
  RECLASSIFY_NAME,
  VALID_CATEGORIES,
  VALID_PRIORITIES,
  applyPlanToMockState,
  buildPlanFromRows,
  compareIntegritySnapshots,
  createMockIntegritySnapshot,
  databaseIdentifier,
  parseArgs,
  planReport,
  runIraqTaxonomyMigration,
  runIraqTaxonomyReclassifier,
  validatePlan,
};
