require("dotenv/config");
const { Client } = require("pg");

const PUBLISHER_TABLES = [
  "publisher_profiles",
  "publisher_aliases",
  "publisher_channels",
  "client_publisher_selections",
  "article_appearances",
];

const TABLE_COLUMNS = {
  publisher_profiles: [
    ["id", "serial PRIMARY KEY"],
    ["canonical_key", "text NOT NULL"],
    ["domain_scope_key", "text"],
    ["name", "text NOT NULL"],
    ["slug", "text NOT NULL"],
    ["legal_name", "text"],
    ["organization_type", "text NOT NULL DEFAULT 'other'"],
    ["description", "text"],
    ["primary_domain", "text"],
    ["normalized_primary_domain", "text"],
    ["website_url", "text"],
    ["logo_url", "text"],
    ["country_code", "text"],
    ["operating_country_codes", "text[] NOT NULL DEFAULT ARRAY[]::text[]"],
    ["language_codes", "text[] NOT NULL DEFAULT ARRAY[]::text[]"],
    ["ownership_type", "text NOT NULL DEFAULT 'unknown'"],
    ["parent_organization_name", "text"],
    ["official_status", "text NOT NULL DEFAULT 'unknown'"],
    ["verification_status", "text NOT NULL DEFAULT 'unverified'"],
    ["verified_at", "timestamp"],
    ["verified_by", "integer"],
    ["scope_type", "text NOT NULL DEFAULT 'global'"],
    ["owner_client_id", "integer"],
    ["status", "text NOT NULL DEFAULT 'draft'"],
    ["metadata", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["created_by", "integer"],
    ["created_at", "timestamp DEFAULT now()"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  publisher_aliases: [
    ["id", "serial PRIMARY KEY"],
    ["publisher_profile_id", "integer NOT NULL"],
    ["alias", "text NOT NULL"],
    ["normalized_alias", "text NOT NULL"],
    ["language_code", "text NOT NULL DEFAULT 'und'"],
    ["alias_type", "text NOT NULL DEFAULT 'name'"],
    ["created_at", "timestamp DEFAULT now()"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  publisher_channels: [
    ["id", "serial PRIMARY KEY"],
    ["publisher_profile_id", "integer NOT NULL"],
    ["channel_key", "text NOT NULL"],
    ["name", "text NOT NULL"],
    ["channel_type", "text NOT NULL"],
    ["url", "text"],
    ["normalized_url", "text"],
    ["external_id", "text"],
    ["handle", "text"],
    ["country_code", "text"],
    ["language_codes", "text[] NOT NULL DEFAULT ARRAY[]::text[]"],
    ["is_primary", "boolean NOT NULL DEFAULT false"],
    ["verification_status", "text NOT NULL DEFAULT 'unverified'"],
    ["verified_at", "timestamp"],
    ["verified_by", "integer"],
    ["lifecycle_status", "text NOT NULL DEFAULT 'draft'"],
    ["fetch_strategy", "text"],
    ["metadata", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["last_validated_at", "timestamp"],
    ["validation_status", "text NOT NULL DEFAULT 'untested'"],
    ["created_by", "integer"],
    ["created_at", "timestamp DEFAULT now()"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  client_publisher_selections: [
    ["id", "serial PRIMARY KEY"],
    ["client_id", "integer NOT NULL"],
    ["publisher_profile_id", "integer NOT NULL"],
    ["status", "text NOT NULL DEFAULT 'candidate'"],
    ["priority", "text NOT NULL DEFAULT 'standard'"],
    ["notes", "text"],
    ["selected_by", "integer"],
    ["selected_at", "timestamp DEFAULT now()"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  article_appearances: [
    ["id", "serial PRIMARY KEY"],
    ["client_id", "integer NOT NULL"],
    ["article_id", "integer NOT NULL"],
    ["publisher_profile_id", "integer"],
    ["publisher_channel_id", "integer"],
    ["source_id", "integer"],
    ["appearance_key", "text NOT NULL"],
    ["appearance_type", "text NOT NULL"],
    ["original_url", "text"],
    ["normalized_original_url", "text"],
    ["collector_url", "text"],
    ["collector_type", "text"],
    ["collector_query", "text"],
    ["collector_edition", "text"],
    ["external_id", "text"],
    ["headline", "text"],
    ["caption", "text"],
    ["language_code", "text"],
    ["published_at", "timestamp"],
    ["discovered_at", "timestamp DEFAULT now()"],
    ["engagement_metadata", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["metadata", "jsonb NOT NULL DEFAULT '{}'::jsonb"],
    ["is_primary", "boolean NOT NULL DEFAULT false"],
    ["created_at", "timestamp DEFAULT now()"],
    ["updated_at", "timestamp DEFAULT now()"],
  ],
  sources: [
    ["publisher_channel_id", "integer"],
  ],
};

const TABLE_CREATE_SQL = {
  publisher_profiles: `CREATE TABLE IF NOT EXISTS publisher_profiles (
  id serial PRIMARY KEY,
  canonical_key text NOT NULL,
  domain_scope_key text,
  name text NOT NULL,
  slug text NOT NULL,
  legal_name text,
  organization_type text NOT NULL DEFAULT 'other',
  description text,
  primary_domain text,
  normalized_primary_domain text,
  website_url text,
  logo_url text,
  country_code text,
  operating_country_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  language_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  ownership_type text NOT NULL DEFAULT 'unknown',
  parent_organization_name text,
  official_status text NOT NULL DEFAULT 'unknown',
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_at timestamp,
  verified_by integer,
  scope_type text NOT NULL DEFAULT 'global',
  owner_client_id integer,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by integer,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)`,
  publisher_aliases: `CREATE TABLE IF NOT EXISTS publisher_aliases (
  id serial PRIMARY KEY,
  publisher_profile_id integer NOT NULL,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  language_code text NOT NULL DEFAULT 'und',
  alias_type text NOT NULL DEFAULT 'name',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)`,
  publisher_channels: `CREATE TABLE IF NOT EXISTS publisher_channels (
  id serial PRIMARY KEY,
  publisher_profile_id integer NOT NULL,
  channel_key text NOT NULL,
  name text NOT NULL,
  channel_type text NOT NULL,
  url text,
  normalized_url text,
  external_id text,
  handle text,
  country_code text,
  language_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_primary boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_at timestamp,
  verified_by integer,
  lifecycle_status text NOT NULL DEFAULT 'draft',
  fetch_strategy text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_validated_at timestamp,
  validation_status text NOT NULL DEFAULT 'untested',
  created_by integer,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)`,
  client_publisher_selections: `CREATE TABLE IF NOT EXISTS client_publisher_selections (
  id serial PRIMARY KEY,
  client_id integer NOT NULL,
  publisher_profile_id integer NOT NULL,
  status text NOT NULL DEFAULT 'candidate',
  priority text NOT NULL DEFAULT 'standard',
  notes text,
  selected_by integer,
  selected_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)`,
  article_appearances: `CREATE TABLE IF NOT EXISTS article_appearances (
  id serial PRIMARY KEY,
  client_id integer NOT NULL,
  article_id integer NOT NULL,
  publisher_profile_id integer,
  publisher_channel_id integer,
  source_id integer,
  appearance_key text NOT NULL,
  appearance_type text NOT NULL,
  original_url text,
  normalized_original_url text,
  collector_url text,
  collector_type text,
  collector_query text,
  collector_edition text,
  external_id text,
  headline text,
  caption text,
  language_code text,
  published_at timestamp,
  discovered_at timestamp DEFAULT now(),
  engagement_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)`,
};

const INDEXES = {
  publisher_profiles_canonical_key_unique: "CREATE UNIQUE INDEX IF NOT EXISTS publisher_profiles_canonical_key_unique ON publisher_profiles (canonical_key)",
  publisher_profiles_domain_scope_key_unique: "CREATE UNIQUE INDEX IF NOT EXISTS publisher_profiles_domain_scope_key_unique ON publisher_profiles (domain_scope_key) WHERE domain_scope_key IS NOT NULL",
  publisher_profiles_scope_idx: "CREATE INDEX IF NOT EXISTS publisher_profiles_scope_idx ON publisher_profiles (scope_type, owner_client_id)",
  publisher_profiles_domain_idx: "CREATE INDEX IF NOT EXISTS publisher_profiles_domain_idx ON publisher_profiles (normalized_primary_domain)",
  publisher_profiles_country_idx: "CREATE INDEX IF NOT EXISTS publisher_profiles_country_idx ON publisher_profiles (country_code)",
  publisher_aliases_profile_alias_language_unique: "CREATE UNIQUE INDEX IF NOT EXISTS publisher_aliases_profile_alias_language_unique ON publisher_aliases (publisher_profile_id, normalized_alias, language_code)",
  publisher_aliases_normalized_idx: "CREATE INDEX IF NOT EXISTS publisher_aliases_normalized_idx ON publisher_aliases (normalized_alias)",
  publisher_channels_channel_key_unique: "CREATE UNIQUE INDEX IF NOT EXISTS publisher_channels_channel_key_unique ON publisher_channels (channel_key)",
  publisher_channels_normalized_url_unique: "CREATE UNIQUE INDEX IF NOT EXISTS publisher_channels_normalized_url_unique ON publisher_channels (normalized_url)",
  publisher_channels_id_profile_unique: "CREATE UNIQUE INDEX IF NOT EXISTS publisher_channels_id_profile_unique ON publisher_channels (id, publisher_profile_id)",
  publisher_channels_profile_idx: "CREATE INDEX IF NOT EXISTS publisher_channels_profile_idx ON publisher_channels (publisher_profile_id)",
  publisher_channels_type_idx: "CREATE INDEX IF NOT EXISTS publisher_channels_type_idx ON publisher_channels (channel_type)",
  client_publisher_selections_client_publisher_unique: "CREATE UNIQUE INDEX IF NOT EXISTS client_publisher_selections_client_publisher_unique ON client_publisher_selections (client_id, publisher_profile_id)",
  client_publisher_selections_client_status_idx: "CREATE INDEX IF NOT EXISTS client_publisher_selections_client_status_idx ON client_publisher_selections (client_id, status)",
  article_appearances_client_key_unique: "CREATE UNIQUE INDEX IF NOT EXISTS article_appearances_client_key_unique ON article_appearances (client_id, appearance_key)",
  article_appearances_article_idx: "CREATE INDEX IF NOT EXISTS article_appearances_article_idx ON article_appearances (article_id)",
  article_appearances_source_idx: "CREATE INDEX IF NOT EXISTS article_appearances_source_idx ON article_appearances (source_id)",
  article_appearances_client_publisher_idx: "CREATE INDEX IF NOT EXISTS article_appearances_client_publisher_idx ON article_appearances (client_id, publisher_profile_id)",
  article_appearances_channel_idx: "CREATE INDEX IF NOT EXISTS article_appearances_channel_idx ON article_appearances (publisher_channel_id)",
  articles_id_client_unique: "CREATE UNIQUE INDEX IF NOT EXISTS articles_id_client_unique ON articles (id, client_id)",
  sources_id_client_unique: "CREATE UNIQUE INDEX IF NOT EXISTS sources_id_client_unique ON sources (id, client_id)",
  sources_publisher_channel_idx: "CREATE INDEX IF NOT EXISTS sources_publisher_channel_idx ON sources (publisher_channel_id)",
};

const UNIQUE_INDEX_NAMES = new Set([
  "publisher_profiles_canonical_key_unique",
  "publisher_profiles_domain_scope_key_unique",
  "publisher_aliases_profile_alias_language_unique",
  "publisher_channels_channel_key_unique",
  "publisher_channels_normalized_url_unique",
  "publisher_channels_id_profile_unique",
  "client_publisher_selections_client_publisher_unique",
  "article_appearances_client_key_unique",
  "articles_id_client_unique",
  "sources_id_client_unique",
]);

const CHECKS = {
  publisher_profiles_scope_owner_ck: {
    table: "publisher_profiles",
    expression: "(scope_type = 'global' AND owner_client_id IS NULL) OR (scope_type = 'client_private' AND owner_client_id IS NOT NULL)",
  },
  publisher_profiles_scope_type_ck: { table: "publisher_profiles", expression: "scope_type IN ('global', 'client_private')" },
  publisher_profiles_organization_type_ck: { table: "publisher_profiles", expression: "organization_type IN ('news_agency', 'newspaper', 'magazine', 'television', 'radio', 'digital_news', 'government', 'diplomatic_mission', 'international_organization', 'ngo', 'think_tank', 'research_organization', 'corporate', 'social_only', 'other')" },
  publisher_profiles_ownership_type_ck: { table: "publisher_profiles", expression: "ownership_type IN ('public', 'private', 'state_owned', 'nonprofit', 'international', 'unknown')" },
  publisher_profiles_official_status_ck: { table: "publisher_profiles", expression: "official_status IN ('official', 'independent', 'state_affiliated', 'unofficial', 'unknown')" },
  publisher_profiles_verification_status_ck: { table: "publisher_profiles", expression: "verification_status IN ('unverified', 'verified', 'disputed')" },
  publisher_profiles_lifecycle_status_ck: { table: "publisher_profiles", expression: "status IN ('draft', 'active', 'paused', 'archived')" },
  publisher_aliases_alias_type_ck: { table: "publisher_aliases", expression: "alias_type IN ('name', 'abbreviation', 'former_name', 'translated_name', 'social_name', 'domain_name', 'other')" },
  publisher_channels_channel_type_ck: { table: "publisher_channels", expression: "channel_type IN ('website', 'rss', 'telegram', 'facebook', 'x', 'youtube', 'instagram', 'tiktok', 'linkedin', 'television', 'radio', 'podcast', 'newsletter', 'api', 'other')" },
  publisher_channels_not_google_news_ck: { table: "publisher_channels", expression: "channel_type <> 'google_news'" },
  publisher_channels_verification_status_ck: { table: "publisher_channels", expression: "verification_status IN ('unverified', 'verified', 'disputed')" },
  publisher_channels_lifecycle_status_ck: { table: "publisher_channels", expression: "lifecycle_status IN ('draft', 'active', 'paused', 'archived')" },
  publisher_channels_validation_status_ck: { table: "publisher_channels", expression: "validation_status IN ('untested', 'valid', 'invalid', 'unreachable', 'needs_review')" },
  client_publisher_selections_status_ck: { table: "client_publisher_selections", expression: "status IN ('candidate', 'approved', 'blocked', 'archived')" },
  client_publisher_selections_priority_ck: { table: "client_publisher_selections", expression: "priority IN ('critical', 'high', 'standard', 'low')" },
  article_appearances_type_ck: { table: "article_appearances", expression: "appearance_type IN ('original', 'rss', 'republished', 'social', 'video', 'broadcast', 'collector')" },
  article_appearances_collector_type_ck: { table: "article_appearances", expression: "collector_type IS NULL OR collector_type IN ('google_news', 'rss_app', 'direct', 'manual', 'other')" },
};

const FOREIGN_KEYS = {
  publisher_profiles_owner_client_fk: { table: "publisher_profiles", column: "owner_client_id", references: "clients(id)", onDelete: "CASCADE" },
  publisher_profiles_verified_by_fk: { table: "publisher_profiles", column: "verified_by", references: "users(id)" },
  publisher_profiles_created_by_fk: { table: "publisher_profiles", column: "created_by", references: "users(id)" },
  publisher_aliases_profile_fk: { table: "publisher_aliases", column: "publisher_profile_id", references: "publisher_profiles(id)", onDelete: "CASCADE" },
  publisher_channels_profile_fk: { table: "publisher_channels", column: "publisher_profile_id", references: "publisher_profiles(id)", onDelete: "CASCADE" },
  publisher_channels_verified_by_fk: { table: "publisher_channels", column: "verified_by", references: "users(id)" },
  publisher_channels_created_by_fk: { table: "publisher_channels", column: "created_by", references: "users(id)" },
  client_publisher_selections_client_fk: { table: "client_publisher_selections", column: "client_id", references: "clients(id)", onDelete: "CASCADE" },
  client_publisher_selections_profile_fk: { table: "client_publisher_selections", column: "publisher_profile_id", references: "publisher_profiles(id)", onDelete: "CASCADE" },
  client_publisher_selections_selected_by_fk: { table: "client_publisher_selections", column: "selected_by", references: "users(id)" },
  sources_publisher_channel_fk: { table: "sources", column: "publisher_channel_id", references: "publisher_channels(id)" },
  article_appearances_client_fk: { table: "article_appearances", column: "client_id", references: "clients(id)", onDelete: "CASCADE" },
  article_appearances_article_fk: { table: "article_appearances", column: "article_id", references: "articles(id)", onDelete: "CASCADE" },
  article_appearances_publisher_fk: { table: "article_appearances", column: "publisher_profile_id", references: "publisher_profiles(id)" },
  article_appearances_channel_fk: { table: "article_appearances", column: "publisher_channel_id", references: "publisher_channels(id)" },
  article_appearances_source_fk: { table: "article_appearances", column: "source_id", references: "sources(id)" },
  article_appearances_article_client_fk: { table: "article_appearances", columns: ["article_id", "client_id"], references: "articles(id, client_id)", onDelete: "CASCADE" },
  article_appearances_source_client_fk: { table: "article_appearances", columns: ["source_id", "client_id"], references: "sources(id, client_id)" },
  article_appearances_channel_publisher_fk: { table: "article_appearances", columns: ["publisher_channel_id", "publisher_profile_id"], references: "publisher_channels(id, publisher_profile_id)" },
};

const SAFE_REPAIR_STATEMENTS = [
  `UPDATE publisher_profiles
      SET domain_scope_key = CASE
        WHEN normalized_primary_domain IS NULL OR trim(normalized_primary_domain) = '' THEN NULL
        WHEN scope_type = 'global' THEN 'global:' || normalized_primary_domain
        WHEN scope_type = 'client_private' AND owner_client_id IS NOT NULL THEN 'client:' || owner_client_id::text || ':' || normalized_primary_domain
        ELSE NULL
      END
    WHERE domain_scope_key IS DISTINCT FROM CASE
        WHEN normalized_primary_domain IS NULL OR trim(normalized_primary_domain) = '' THEN NULL
        WHEN scope_type = 'global' THEN 'global:' || normalized_primary_domain
        WHEN scope_type = 'client_private' AND owner_client_id IS NOT NULL THEN 'client:' || owner_client_id::text || ':' || normalized_primary_domain
        ELSE NULL
      END`,
  "UPDATE publisher_aliases SET language_code = 'und' WHERE language_code IS NULL OR trim(language_code) = ''",
  "ALTER TABLE publisher_aliases ALTER COLUMN language_code SET DEFAULT 'und'",
  "ALTER TABLE publisher_aliases ALTER COLUMN language_code SET NOT NULL",
];

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`
Publisher catalog schema migration

Dry run:
  npm run db:migrate:publisher-catalog -- --dry-run

Apply:
  npm run db:migrate:publisher-catalog -- --apply
`);
}

async function tableExists(client, tableName) {
  const result = await client.query(`
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = $1
  `, [tableName]);
  return result.rowCount > 0;
}

async function existingColumns(client, tableName) {
  const result = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
  `, [tableName]);
  return new Set(result.rows.map((row) => row.column_name));
}

async function existingIndexes(client) {
  const result = await client.query(`
    SELECT indexname
      FROM pg_indexes
     WHERE schemaname = 'public'
  `);
  return new Set(result.rows.map((row) => row.indexname));
}

async function existingConstraints(client) {
  const result = await client.query(`
    SELECT conname
      FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace
  `);
  return new Set(result.rows.map((row) => row.conname));
}

async function countRowsIfTableExists(client, table) {
  if (!(await tableExists(client, table))) return 0;
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return Number(result.rows[0]?.count || 0);
}

async function hasColumns(client, tableName, columnNames) {
  if (!(await tableExists(client, tableName))) return false;
  const columns = await existingColumns(client, tableName);
  return columnNames.every((column) => columns.has(column));
}

async function countIfColumnsExist(client, table, columns, whereSql) {
  if (!(await hasColumns(client, table, columns))) return 0;
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${whereSql}`);
  return Number(result.rows[0]?.count || 0);
}

async function duplicateCount(client, table, columns, whereSql = "TRUE") {
  if (!(await hasColumns(client, table, columns))) return 0;
  const expression = columns.map((column) => `COALESCE(${column}::text, '')`).join(" || ':' || ");
  const result = await client.query(`
    SELECT COALESCE(SUM(duplicate_count - 1), 0)::int AS count
      FROM (
        SELECT ${expression} AS key, COUNT(*)::int AS duplicate_count
          FROM ${table}
         WHERE ${whereSql}
         GROUP BY ${expression}
        HAVING COUNT(*) > 1
      ) duplicates
  `);
  return Number(result.rows[0]?.count || 0);
}

async function duplicateByExpression(client, table, requiredColumns, expression, whereSql = "TRUE") {
  if (!(await hasColumns(client, table, requiredColumns))) return 0;
  const result = await client.query(`
    SELECT COALESCE(SUM(duplicate_count - 1), 0)::int AS count
      FROM (
        SELECT ${expression} AS key, COUNT(*)::int AS duplicate_count
          FROM ${table}
         WHERE ${whereSql}
         GROUP BY ${expression}
        HAVING COUNT(*) > 1
      ) duplicates
  `);
  return Number(result.rows[0]?.count || 0);
}

async function incompatibleRows(client) {
  return {
    invalidPublisherScopeOwner: await countIfColumnsExist(client, "publisher_profiles", ["scope_type", "owner_client_id"], "NOT ((scope_type = 'global' AND owner_client_id IS NULL) OR (scope_type = 'client_private' AND owner_client_id IS NOT NULL))"),
    invalidPublisherLifecycle: await countIfColumnsExist(client, "publisher_profiles", ["status"], "status NOT IN ('draft', 'active', 'paused', 'archived')"),
    invalidPublisherVerification: await countIfColumnsExist(client, "publisher_profiles", ["verification_status"], "verification_status NOT IN ('unverified', 'verified', 'disputed')"),
    invalidChannelLifecycle: await countIfColumnsExist(client, "publisher_channels", ["lifecycle_status"], "lifecycle_status NOT IN ('draft', 'active', 'paused', 'archived')"),
    invalidChannelValidation: await countIfColumnsExist(client, "publisher_channels", ["validation_status"], "validation_status NOT IN ('untested', 'valid', 'invalid', 'unreachable', 'needs_review')"),
    googleNewsPublisherChannels: await countIfColumnsExist(client, "publisher_channels", ["channel_type"], "channel_type = 'google_news'"),
    invalidSelectionStatus: await countIfColumnsExist(client, "client_publisher_selections", ["status"], "status NOT IN ('candidate', 'approved', 'blocked', 'archived')"),
    invalidAppearanceType: await countIfColumnsExist(client, "article_appearances", ["appearance_type"], "appearance_type NOT IN ('original', 'rss', 'republished', 'social', 'video', 'broadcast', 'collector')"),
    duplicateCanonicalKeys: await duplicateCount(client, "publisher_profiles", ["canonical_key"], "trim(canonical_key) <> ''"),
    duplicateNormalizedDomains: await duplicateCount(client, "publisher_profiles", ["scope_type", "owner_client_id", "normalized_primary_domain"], "normalized_primary_domain IS NOT NULL AND trim(normalized_primary_domain) <> ''"),
    duplicateDomainScopeKeys: await duplicateCount(client, "publisher_profiles", ["domain_scope_key"], "domain_scope_key IS NOT NULL AND trim(domain_scope_key) <> ''"),
    duplicateDomainScopeExpressions: await duplicateByExpression(
      client,
      "publisher_profiles",
      ["scope_type", "owner_client_id", "normalized_primary_domain"],
      "CASE WHEN normalized_primary_domain IS NULL OR trim(normalized_primary_domain) = '' THEN NULL WHEN scope_type = 'global' THEN 'global:' || normalized_primary_domain WHEN scope_type = 'client_private' AND owner_client_id IS NOT NULL THEN 'client:' || owner_client_id::text || ':' || normalized_primary_domain ELSE NULL END",
      "normalized_primary_domain IS NOT NULL AND trim(normalized_primary_domain) <> ''",
    ),
    aliasLanguageCollapseDuplicates: await duplicateByExpression(
      client,
      "publisher_aliases",
      ["publisher_profile_id", "normalized_alias", "language_code"],
      "publisher_profile_id::text || ':' || normalized_alias || ':' || COALESCE(NULLIF(language_code, ''), 'und')",
    ),
    duplicateChannelKeys: await duplicateCount(client, "publisher_channels", ["channel_key"], "trim(channel_key) <> ''"),
    duplicateChannelUrls: await duplicateCount(client, "publisher_channels", ["normalized_url"], "normalized_url IS NOT NULL AND trim(normalized_url) <> ''"),
    duplicateClientSelections: await duplicateCount(client, "client_publisher_selections", ["client_id", "publisher_profile_id"]),
  };
}

async function tenantMismatchCounts(client) {
  return {
    clientPrivatePublisherMissingClient: await countIfColumnsExist(client, "publisher_profiles", ["scope_type", "owner_client_id"], "scope_type = 'client_private' AND owner_client_id IS NULL"),
    clientSelectionOfOtherPrivatePublisher: await hasColumns(client, "client_publisher_selections", ["client_id", "publisher_profile_id"]) && await hasColumns(client, "publisher_profiles", ["id", "scope_type", "owner_client_id"])
      ? Number((await client.query(`
          SELECT COUNT(*)::int AS count
            FROM client_publisher_selections cps
            JOIN publisher_profiles pp ON pp.id = cps.publisher_profile_id
           WHERE pp.scope_type = 'client_private'
             AND pp.owner_client_id <> cps.client_id
        `)).rows[0]?.count || 0)
      : 0,
    appearanceArticleClientMismatch: await hasColumns(client, "article_appearances", ["article_id", "client_id"]) && await hasColumns(client, "articles", ["id", "client_id"])
      ? Number((await client.query(`
          SELECT COUNT(*)::int AS count
            FROM article_appearances aa
            LEFT JOIN articles a ON a.id = aa.article_id AND a.client_id = aa.client_id
           WHERE a.id IS NULL
        `)).rows[0]?.count || 0)
      : 0,
    appearanceSourceClientMismatch: await hasColumns(client, "article_appearances", ["source_id", "client_id"]) && await hasColumns(client, "sources", ["id", "client_id"])
      ? Number((await client.query(`
          SELECT COUNT(*)::int AS count
            FROM article_appearances aa
            LEFT JOIN sources s ON s.id = aa.source_id AND s.client_id = aa.client_id
           WHERE aa.source_id IS NOT NULL
             AND s.id IS NULL
        `)).rows[0]?.count || 0)
      : 0,
    appearanceChannelPublisherMismatch: await hasColumns(client, "article_appearances", ["publisher_channel_id", "publisher_profile_id"]) && await hasColumns(client, "publisher_channels", ["id", "publisher_profile_id"])
      ? Number((await client.query(`
          SELECT COUNT(*)::int AS count
            FROM article_appearances aa
            LEFT JOIN publisher_channels pc ON pc.id = aa.publisher_channel_id AND pc.publisher_profile_id = aa.publisher_profile_id
           WHERE aa.publisher_channel_id IS NOT NULL
             AND aa.publisher_profile_id IS NOT NULL
             AND pc.id IS NULL
        `)).rows[0]?.count || 0)
      : 0,
    appearancePrivatePublisherClientMismatch: await hasColumns(client, "article_appearances", ["publisher_profile_id", "client_id"]) && await hasColumns(client, "publisher_profiles", ["id", "scope_type", "owner_client_id"])
      ? Number((await client.query(`
          SELECT COUNT(*)::int AS count
            FROM article_appearances aa
            JOIN publisher_profiles pp ON pp.id = aa.publisher_profile_id
           WHERE pp.scope_type = 'client_private'
             AND pp.owner_client_id <> aa.client_id
        `)).rows[0]?.count || 0)
      : 0,
    sourceChannelPublisherMismatch: await hasColumns(client, "sources", ["publisher_channel_id"]) && await hasColumns(client, "publisher_channels", ["id"])
      ? Number((await client.query(`
          SELECT COUNT(*)::int AS count
            FROM sources s
            LEFT JOIN publisher_channels pc ON pc.id = s.publisher_channel_id
           WHERE s.publisher_channel_id IS NOT NULL
             AND pc.id IS NULL
        `)).rows[0]?.count || 0)
      : 0,
    sourceChannelPrivatePublisherClientMismatch: await hasColumns(client, "sources", ["client_id", "publisher_channel_id"]) && await hasColumns(client, "publisher_channels", ["id", "publisher_profile_id"]) && await hasColumns(client, "publisher_profiles", ["id", "scope_type", "owner_client_id"])
      ? Number((await client.query(`
          SELECT COUNT(*)::int AS count
            FROM sources s
            JOIN publisher_channels pc ON pc.id = s.publisher_channel_id
            JOIN publisher_profiles pp ON pp.id = pc.publisher_profile_id
           WHERE s.publisher_channel_id IS NOT NULL
             AND pp.scope_type = 'client_private'
             AND pp.owner_client_id <> s.client_id
        `)).rows[0]?.count || 0)
      : 0,
  };
}

async function inspect(client) {
  const missingColumns = {};
  const missingTables = [];
  for (const [tableName, columns] of Object.entries(TABLE_COLUMNS)) {
    const exists = await tableExists(client, tableName);
    if (!exists && PUBLISHER_TABLES.includes(tableName)) missingTables.push(tableName);
    const existing = exists ? await existingColumns(client, tableName) : new Set();
    missingColumns[tableName] = columns
      .filter(([name]) => !existing.has(name))
      .map(([name, definition]) => ({ name, definition }));
  }

  const indexSet = await existingIndexes(client);
  const constraintSet = await existingConstraints(client);
  const incompatible = await incompatibleRows(client);
  const tenantMismatches = await tenantMismatchCounts(client);
  const tableRowCounts = {};
  for (const table of [...PUBLISHER_TABLES, "sources", "articles", "clients", "users", "platform_reset_audit"]) {
    tableRowCounts[table] = await countRowsIfTableExists(client, table);
  }

  const unsafePartialSchemaRisks = [];
  for (const table of PUBLISHER_TABLES) {
    const exists = await tableExists(client, table);
    const unsafeMissingNotNull = missingColumns[table]?.some((column) =>
      /NOT NULL/i.test(column.definition)
      && !(table === "publisher_aliases" && column.name === "language_code")
    );
    if (exists && tableRowCounts[table] > 0 && unsafeMissingNotNull) {
      unsafePartialSchemaRisks.push(`${table} has rows but is missing NOT NULL catalog columns`);
    }
  }

  return {
    missingTables,
    missingColumns,
    missingIndexes: Object.keys(INDEXES).filter((name) => !indexSet.has(name)),
    missingUniqueConstraints: Object.keys(INDEXES).filter((name) => UNIQUE_INDEX_NAMES.has(name) && !indexSet.has(name) && !constraintSet.has(name)),
    missingForeignKeys: Object.keys(FOREIGN_KEYS).filter((name) => !constraintSet.has(name)),
    missingCheckConstraints: Object.keys(CHECKS).filter((name) => !constraintSet.has(name)),
    incompatibleRows: incompatible,
    tenantMismatches,
    unsafePartialSchemaRisks,
    tableRowCounts,
    applySafe: Object.values(incompatible).every((count) => Number(count) === 0)
      && Object.values(tenantMismatches).every((count) => Number(count) === 0)
      && unsafePartialSchemaRisks.length === 0,
  };
}

function constraintStatement(name, spec) {
  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
    ALTER TABLE ${spec.table} ADD CONSTRAINT ${name} CHECK (${spec.expression});
  END IF;
END $$`;
}

function foreignKeyStatement(name, spec) {
  const onDelete = spec.onDelete ? ` ON DELETE ${spec.onDelete}` : "";
  const columns = Array.isArray(spec.columns) ? spec.columns.join(", ") : spec.column;
  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
    ALTER TABLE ${spec.table} ADD CONSTRAINT ${name} FOREIGN KEY (${columns}) REFERENCES ${spec.references}${onDelete};
  END IF;
END $$`;
}

function plannedStatements() {
  const createTables = PUBLISHER_TABLES.map((table) => TABLE_CREATE_SQL[table]);
  const alterColumns = Object.entries(TABLE_COLUMNS).flatMap(([table, columns]) =>
    columns
      .filter(([name]) => name !== "id")
      .map(([name, definition]) => `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${definition}`),
  );
  return [
    ...createTables,
    ...alterColumns,
    ...SAFE_REPAIR_STATEMENTS,
    ...Object.values(INDEXES),
    ...Object.entries(FOREIGN_KEYS).map(([name, spec]) => foreignKeyStatement(name, spec)),
    ...Object.entries(CHECKS).map(([name, spec]) => constraintStatement(name, spec)),
  ];
}

async function runPublisherCatalogMigration(client, args) {
  const before = await inspect(client);
  const statements = plannedStatements();
  if (!args.apply) {
    return {
      migration: "publisher-catalog",
      mode: "dry-run",
      writes: false,
      before,
      plannedStatements: statements,
      plannedStatementCount: statements.length,
      applySafe: before.applySafe,
      applyCommand: "npm run db:migrate:publisher-catalog -- --apply",
    };
  }

  if (!before.applySafe) {
    const error = new Error("Publisher catalog migration aborted before writes because unsafe rows or partial schemas exist.");
    error.report = {
      migration: "publisher-catalog",
      mode: "apply",
      writes: false,
      applySafe: false,
      incompatibleRows: before.incompatibleRows,
      tenantMismatches: before.tenantMismatches,
      unsafePartialSchemaRisks: before.unsafePartialSchemaRisks,
      message: error.message,
    };
    throw error;
  }

  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nws360.publisher_catalog_migration'))");
    for (const statement of statements) {
      await client.query(statement);
    }
    const after = await inspect(client);
    if (!after.applySafe) {
      throw new Error(`Post-migration integrity check failed: ${JSON.stringify({
        incompatibleRows: after.incompatibleRows,
        tenantMismatches: after.tenantMismatches,
        unsafePartialSchemaRisks: after.unsafePartialSchemaRisks,
      })}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return {
    migration: "publisher-catalog",
    mode: "apply",
    writes: true,
    appliedStatements: statements.length,
    before,
    after: await inspect(client),
  };
}

async function main(argv = process.argv.slice(2), ClientImpl = Client) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new ClientImpl({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const report = await runPublisherCatalogMigration(client, args);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.report ? JSON.stringify(error.report, null, 2) : error.message || error);
    process.exit(1);
  });
}

module.exports = {
  CHECKS,
  FOREIGN_KEYS,
  INDEXES,
  PUBLISHER_TABLES,
  TABLE_COLUMNS,
  TABLE_CREATE_SQL,
  UNIQUE_INDEX_NAMES,
  countIfColumnsExist,
  countRowsIfTableExists,
  duplicateCount,
  existingColumns,
  existingConstraints,
  existingIndexes,
  hasColumns,
  incompatibleRows,
  inspect,
  main,
  parseArgs,
  plannedStatements,
  runPublisherCatalogMigration,
  tableExists,
  tenantMismatchCounts,
};
