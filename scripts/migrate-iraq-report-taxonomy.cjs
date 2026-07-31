require("dotenv").config();
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");

const NEW_CATEGORIES = [
  "iraqi_government",
  "parliament_politics",
  "security_stability",
  "economy_oil_finance",
  "development_services",
  "justice_accountability",
  "kurdistan_region",
  "civil_society_humanitarian",
  "united_nations",
  "client_bilateral_relations",
  "regional_international_relations",
  "media_narratives",
  "other",
];

const US_HOME_COUNTRY_ALIASES = [
  "United States",
  "United States of America",
  "U.S.",
  "US",
  "USA",
  "America",
  "American",
  "الولايات المتحدة",
  "الولايات المتحدة الأمريكية",
  "أميركا",
  "أمريكا",
  "أمريكي",
  "الأمريكية",
];

const US_EMBASSY_ALIASES = [
  "U.S. Embassy Baghdad",
  "United States Embassy Baghdad",
  "U.S. Embassy in Iraq",
  "American Embassy Baghdad",
  "السفارة الأمريكية",
  "سفارة الولايات المتحدة",
  "السفارة الأميركية",
];

const CLASSIFICATION_CTE = `
  WITH source_rows AS (
    SELECT
      id,
      category,
      COALESCE(priority, 'routine') AS priority,
      LOWER(COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(content_clean, '') || ' ' || COALESCE(content, '')) AS subject
    FROM articles
  ),
  classified AS (
    SELECT
      id,
      category AS old_category,
      priority AS old_priority,
      CASE
        WHEN category = 'us_iraq_international' THEN 'client_bilateral_relations'
        WHEN category = 'bilateral_international_relations' THEN 'regional_international_relations'
        WHEN category = ANY($1::text[]) THEN category
        WHEN category IN ('political', 'parliament_law') THEN 'parliament_politics'
        WHEN category = 'security' THEN 'security_stability'
        WHEN category IN ('economy', 'oil_energy', 'banking_currency', 'business') THEN 'economy_oil_finance'
        WHEN category = 'government_services' THEN 'iraqi_government'
        WHEN category IN ('health', 'education', 'environment_water') THEN 'development_services'
        WHEN category = 'corruption_courts' THEN 'justice_accountability'
        WHEN category IN ('protests_public_opinion', 'humanitarian_ngos', 'culture_society') THEN 'civil_society_humanitarian'
        WHEN category = 'foreign_relations' AND subject ~* '(u\\.s\\.|united states|american|u\\.s\\.-iraq|us-iraq|u\\.s\\. embassy|us embassy)' THEN 'client_bilateral_relations'
        WHEN category = 'foreign_relations' THEN 'regional_international_relations'
        WHEN subject ~* '(united nations|unami|unicef|undp|unhcr|iom|who|wfp|unesco|world bank|imf|security council)' OR subject LIKE '%الأمم المتحدة%' OR subject LIKE '%الامم المتحدة%' OR subject LIKE '%يونامي%' THEN 'united_nations'
        WHEN subject ~* '(kurdistan|krg|peshmerga|erbil-baghdad|baghdad-erbil|kurdistan salaries|kurdistan oil)' OR subject LIKE '%كردستان%' OR subject LIKE '%أربيل%' OR subject LIKE '%اربيل%' OR subject LIKE '%البيشمركة%' THEN 'kurdistan_region'
        WHEN subject ~* '(attack|explosion|blast|missile|rocket|drone|isis|security|military|armed group|clashes|counterterrorism)' OR subject LIKE '%داعش%' OR subject LIKE '%هجوم%' OR subject LIKE '%انفجار%' OR subject LIKE '%قصف%' OR subject LIKE '%اشتباكات%' THEN 'security_stability'
        WHEN subject ~* '(integrity commission|corruption|court|judiciary|trial|warrant|embezzlement|bribery)' OR subject LIKE '%النزاهة%' OR subject LIKE '%فساد%' OR subject LIKE '%القضاء%' OR subject LIKE '%محكمة%' THEN 'justice_accountability'
        WHEN subject ~* '(parliament|council of representatives|legislation|bill|vote|committee|coalition|party|election)' OR subject LIKE '%البرلمان%' OR subject LIKE '%مجلس النواب%' OR subject LIKE '%تصويت%' OR subject LIKE '%انتخابات%' THEN 'parliament_politics'
        WHEN subject ~* '(prime minister|council of ministers|cabinet|ministry|minister|iraqi government)' OR subject LIKE '%رئيس الوزراء%' OR subject LIKE '%مجلس الوزراء%' OR subject LIKE '%وزارة%' OR subject LIKE '%السوداني%' THEN 'iraqi_government'
        WHEN subject ~* '(oil|gas|budget|central bank|currency|exchange rate|dinar|dollar|public finance|salary|salaries|revenue)' OR subject LIKE '%نفط%' OR subject LIKE '%الموازنة%' OR subject LIKE '%البنك المركزي%' OR subject LIKE '%سعر الصرف%' OR subject LIKE '%الدينار%' THEN 'economy_oil_finance'
        WHEN subject ~* '(electricity|water|health|hospital|education|school|university|municipality|infrastructure|development|services|project)' OR subject LIKE '%كهرباء%' OR subject LIKE '%المياه%' OR subject LIKE '%صحة%' OR subject LIKE '%تعليم%' OR subject LIKE '%خدمات%' THEN 'development_services'
        WHEN subject ~* '(ngo|civil society|humanitarian|human rights|public opinion|protest|displaced|refugees|aid)' OR subject LIKE '%المجتمع المدني%' OR subject LIKE '%حقوق الإنسان%' OR subject LIKE '%حقوق الانسان%' OR subject LIKE '%احتجاج%' OR subject LIKE '%نازحين%' THEN 'civil_society_humanitarian'
        WHEN subject ~* '(media narrative|social media|online campaign|coordinated campaign|hashtag|misinformation|disinformation|viral|trending|influencer)' OR subject LIKE '%وسائل التواصل%' OR subject LIKE '%هاشتاغ%' OR subject LIKE '%معلومات مضللة%' OR subject LIKE '%ترند%' THEN 'media_narratives'
        WHEN subject ~* '(u\\.s\\.|united states|american|u\\.s\\.-iraq|us-iraq|u\\.s\\. embassy|us embassy).*(bilateral|embassy|ambassador|agreement|cooperation|visit|visa|consular|partnership|support|funded)' THEN 'client_bilateral_relations'
        WHEN subject ~* '(bilateral|foreign relations|international relations|foreign policy|diplomatic|embassy|ambassador|official visit|sanctions|iran|turkey|saudi|kuwait|jordan|syria|china|russia|france|french|british|united kingdom|germany|german|european union)' OR subject LIKE '%العلاقات الدولية%' OR subject LIKE '%العلاقات الخارجية%' OR subject LIKE '%إيران%' OR subject LIKE '%ايران%' OR subject LIKE '%تركيا%' OR subject LIKE '%فرنسا%' THEN 'regional_international_relations'
        ELSE 'other'
      END AS next_category,
      CASE
        WHEN category = 'urgent' AND priority NOT IN ('important', 'urgent', 'critical') THEN 'urgent'
        WHEN priority IN ('routine', 'important', 'urgent', 'critical') THEN priority
        ELSE 'routine'
      END AS next_priority
    FROM source_rows
  )
`;

async function countBy(client, column) {
  const result = await client.query(`
    SELECT COALESCE(${column}, '<null>') AS value, COUNT(*)::int AS count
    FROM articles
    GROUP BY COALESCE(${column}, '<null>')
    ORDER BY count DESC, value ASC
  `);
  return result.rows;
}

async function preview(client) {
  const beforeCategories = await countBy(client, "category");
  const beforePriorities = await countBy(client, "priority");
  const proposedCategories = await client.query(`
    ${CLASSIFICATION_CTE}
    SELECT next_category AS category, COUNT(*)::int AS count
    FROM classified
    GROUP BY next_category
    ORDER BY count DESC, category ASC
  `, [NEW_CATEGORIES]);
  const proposedMoves = await client.query(`
    ${CLASSIFICATION_CTE}
    SELECT COALESCE(old_category, '<null>') AS from_category, next_category AS to_category, COUNT(*)::int AS count
    FROM classified
    WHERE old_category IS DISTINCT FROM next_category
    GROUP BY COALESCE(old_category, '<null>'), next_category
    ORDER BY count DESC, from_category ASC, to_category ASC
  `, [NEW_CATEGORIES]);
  const priorityChanges = await client.query(`
    ${CLASSIFICATION_CTE}
    SELECT COALESCE(old_priority, '<null>') AS from_priority, next_priority AS to_priority, COUNT(*)::int AS count
    FROM classified
    WHERE old_priority IS DISTINCT FROM next_priority
    GROUP BY COALESCE(old_priority, '<null>'), next_priority
    ORDER BY count DESC, from_priority ASC, to_priority ASC
  `, [NEW_CATEGORIES]);
  const unsafe = await client.query(`
    ${CLASSIFICATION_CTE}
    SELECT COUNT(*)::int AS count
    FROM classified
    WHERE next_category = 'other'
      AND COALESCE(old_category, 'other') NOT IN ('other', 'general', 'tech', 'sports', 'science', 'entertainment', 'provinces')
  `, [NEW_CATEGORIES]);
  const total = await client.query(`SELECT COUNT(*)::int AS count FROM articles`);

  return {
    beforeCategories,
    beforePriorities,
    proposedCategories: proposedCategories.rows,
    proposedMoves: proposedMoves.rows,
    priorityChanges: priorityChanges.rows,
    recordsThatCannotBeClassifiedSafely: unsafe.rows[0]?.count || 0,
    finalTotalRecordCount: total.rows[0]?.count || 0,
  };
}

async function ensureSchema(client) {
  await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'routine'`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_category ON articles (client_id, category)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_priority ON articles (client_id, priority)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS client_settings (
      id serial PRIMARY KEY,
      client_id integer NOT NULL REFERENCES clients(id),
      feed_live_update_enabled boolean DEFAULT true,
      feed_live_update_interval_seconds integer DEFAULT 60,
      feed_live_update_mode text NOT NULL DEFAULT 'notify',
      default_feed_date_range text NOT NULL DEFAULT 'all',
      default_article_retention_days integer DEFAULT 7,
      default_source_interval_minutes integer DEFAULT 15,
      default_max_articles_per_fetch integer DEFAULT 10,
      auto_translation_enabled boolean DEFAULT false,
      default_target_language text DEFAULT 'en',
      report_export_format text NOT NULL DEFAULT 'txt',
      report_include_summaries boolean DEFAULT true,
      home_country_code text,
      home_country_name text,
      home_country_aliases text[],
      embassy_aliases text[],
      ambassador_aliases text[],
      bilateral_category_label text,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_client_settings_client ON client_settings (client_id)`);
  await client.query(`ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS home_country_code text`);
  await client.query(`ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS home_country_name text`);
  await client.query(`ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS home_country_aliases text[]`);
  await client.query(`ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS embassy_aliases text[]`);
  await client.query(`ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS ambassador_aliases text[]`);
  await client.query(`ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS bilateral_category_label text`);
}

async function seedUsEmbassyPilotProfile(client) {
  const result = await client.query(`
    INSERT INTO client_settings (
      client_id,
      home_country_code,
      home_country_name,
      home_country_aliases,
      embassy_aliases,
      ambassador_aliases,
      bilateral_category_label
    )
    SELECT
      id,
      'US',
      'United States',
      $1::text[],
      $2::text[],
      ARRAY[]::text[],
      'U.S.-Iraq Relations'
    FROM clients
    WHERE lower(name) LIKE '%u.s. embassy%'
       OR lower(name) LIKE '%us embassy%'
       OR lower(name) LIKE '%united states embassy%'
       OR lower(name) LIKE '%american embassy%'
    ON CONFLICT (client_id) DO UPDATE SET
      home_country_code = COALESCE(client_settings.home_country_code, EXCLUDED.home_country_code),
      home_country_name = COALESCE(client_settings.home_country_name, EXCLUDED.home_country_name),
      home_country_aliases = COALESCE(client_settings.home_country_aliases, EXCLUDED.home_country_aliases),
      embassy_aliases = COALESCE(client_settings.embassy_aliases, EXCLUDED.embassy_aliases),
      ambassador_aliases = COALESCE(client_settings.ambassador_aliases, EXCLUDED.ambassador_aliases),
      bilateral_category_label = COALESCE(client_settings.bilateral_category_label, EXCLUDED.bilateral_category_label),
      updated_at = now()
  `, [US_HOME_COUNTRY_ALIASES, US_EMBASSY_ALIASES]);
  return result.rowCount || 0;
}

async function applyMigration(client) {
  await client.query("BEGIN");
  try {
    await ensureSchema(client);
    const seededUsPilotRows = await seedUsEmbassyPilotProfile(client);
    const updateResult = await client.query(`
      ${CLASSIFICATION_CTE}
      UPDATE articles AS a
      SET category = classified.next_category,
          priority = classified.next_priority
      FROM classified
      WHERE a.id = classified.id
        AND (
          a.category IS DISTINCT FROM classified.next_category
          OR a.priority IS DISTINCT FROM classified.next_priority
        )
    `, [NEW_CATEGORIES]);
    await client.query("COMMIT");
    return {
      updatedRows: updateResult.rowCount || 0,
      seededUsPilotRows,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const before = await preview(client);
    let applied = null;
    let after = null;
    if (APPLY) {
      applied = await applyMigration(client);
      after = await preview(client);
    }
    console.log(JSON.stringify({
      migration: "iraq-report-taxonomy",
      mode: APPLY ? "apply" : "dry-run",
      note: APPLY ? "Database changes were committed." : "No database changes were made. Re-run with --apply to execute.",
      before,
      applied,
      after,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
