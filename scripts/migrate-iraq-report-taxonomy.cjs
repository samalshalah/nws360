require("dotenv").config();
const { Client } = require("pg");

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
  "us_iraq_international",
  "media_narratives",
  "other",
];

async function countBy(client, column) {
  const result = await client.query(`
    SELECT COALESCE(${column}, '<null>') AS value, COUNT(*)::int AS count
    FROM articles
    GROUP BY COALESCE(${column}, '<null>')
    ORDER BY count DESC, value ASC
  `);
  return result.rows;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const beforeCategories = await countBy(client, "category");
    await client.query("BEGIN");
    await client.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'routine'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_category ON articles (client_id, category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_articles_client_priority ON articles (client_id, priority)`);

    const updateResult = await client.query(`
      WITH classified AS (
        SELECT
          id,
          CASE
            WHEN category = ANY($1::text[]) THEN category
            WHEN category IN ('political', 'parliament_law') THEN 'parliament_politics'
            WHEN category = 'security' THEN 'security_stability'
            WHEN category IN ('economy', 'oil_energy', 'banking_currency', 'business') THEN 'economy_oil_finance'
            WHEN category = 'government_services' THEN 'iraqi_government'
            WHEN category IN ('health', 'education', 'environment_water') THEN 'development_services'
            WHEN category = 'corruption_courts' THEN 'justice_accountability'
            WHEN category IN ('protests_public_opinion', 'humanitarian_ngos', 'culture_society') THEN 'civil_society_humanitarian'
            WHEN category = 'foreign_relations' THEN 'us_iraq_international'
            WHEN subject ~* '(united nations|unami|unicef|undp|unhcr|iom|who|wfp|security council)' OR subject LIKE '%الأمم المتحدة%' OR subject LIKE '%الامم المتحدة%' OR subject LIKE '%يونامي%' THEN 'united_nations'
            WHEN subject ~* '(kurdistan|krg|peshmerga|erbil-baghdad|baghdad-erbil|kurdistan salaries)' OR subject LIKE '%كردستان%' OR subject LIKE '%أربيل%' OR subject LIKE '%اربيل%' OR subject LIKE '%البيشمركة%' THEN 'kurdistan_region'
            WHEN subject ~* '(attack|explosion|blast|missile|rocket|drone|isis|security|military|armed group|clashes|counterterrorism)' OR subject LIKE '%داعش%' OR subject LIKE '%هجوم%' OR subject LIKE '%انفجار%' OR subject LIKE '%قصف%' OR subject LIKE '%اشتباكات%' THEN 'security_stability'
            WHEN subject ~* '(integrity commission|corruption|court|judiciary|trial|warrant|embezzlement|bribery)' OR subject LIKE '%النزاهة%' OR subject LIKE '%فساد%' OR subject LIKE '%القضاء%' OR subject LIKE '%محكمة%' THEN 'justice_accountability'
            WHEN subject ~* '(parliament|council of representatives|legislation|bill|vote|committee|coalition|party|election)' OR subject LIKE '%البرلمان%' OR subject LIKE '%مجلس النواب%' OR subject LIKE '%تصويت%' OR subject LIKE '%انتخابات%' THEN 'parliament_politics'
            WHEN subject ~* '(prime minister|council of ministers|cabinet|ministry|minister|iraqi government)' OR subject LIKE '%رئيس الوزراء%' OR subject LIKE '%مجلس الوزراء%' OR subject LIKE '%وزارة%' OR subject LIKE '%السوداني%' THEN 'iraqi_government'
            WHEN subject ~* '(oil|gas|budget|central bank|currency|exchange rate|dinar|dollar|public finance|salary|salaries)' OR subject LIKE '%نفط%' OR subject LIKE '%الموازنة%' OR subject LIKE '%البنك المركزي%' OR subject LIKE '%سعر الصرف%' OR subject LIKE '%الدينار%' THEN 'economy_oil_finance'
            WHEN subject ~* '(electricity|water|health|hospital|education|school|university|municipality|infrastructure|development|services|project)' OR subject LIKE '%كهرباء%' OR subject LIKE '%المياه%' OR subject LIKE '%صحة%' OR subject LIKE '%تعليم%' OR subject LIKE '%خدمات%' THEN 'development_services'
            WHEN subject ~* '(ngo|civil society|humanitarian|human rights|public opinion|protest|displaced|refugees|aid)' OR subject LIKE '%المجتمع المدني%' OR subject LIKE '%حقوق الإنسان%' OR subject LIKE '%حقوق الانسان%' OR subject LIKE '%احتجاج%' OR subject LIKE '%نازحين%' THEN 'civil_society_humanitarian'
            WHEN subject ~* '(u\\.s\\.|united states|american|embassy|ambassador|washington|bilateral|diplomatic|iran|turkey|saudi|kuwait|jordan|syria|china|russia|sanctions)' OR subject LIKE '%الولايات المتحدة%' OR subject LIKE '%أمريكا%' OR subject LIKE '%امريكا%' OR subject LIKE '%السفارة%' OR subject LIKE '%واشنطن%' OR subject LIKE '%إيران%' OR subject LIKE '%ايران%' THEN 'us_iraq_international'
            WHEN subject ~* '(media narrative|social media|online campaign|coordinated campaign|hashtag|misinformation|disinformation|viral|trending|influencer)' OR subject LIKE '%وسائل التواصل%' OR subject LIKE '%هاشتاغ%' OR subject LIKE '%معلومات مضللة%' OR subject LIKE '%ترند%' THEN 'media_narratives'
            ELSE 'other'
          END AS next_category,
          CASE
            WHEN category = 'urgent' AND priority NOT IN ('important', 'urgent', 'critical') THEN 'urgent'
            WHEN priority IN ('routine', 'important', 'urgent', 'critical') THEN priority
            ELSE 'routine'
          END AS next_priority
        FROM (
          SELECT
            id,
            category,
            COALESCE(priority, 'routine') AS priority,
            LOWER(COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(content_clean, '') || ' ' || COALESCE(content, '')) AS subject
          FROM articles
        ) rows_to_classify
      )
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
    const afterCategories = await countBy(client, "category");
    const afterPriorities = await countBy(client, "priority");
    console.log(JSON.stringify({
      migration: "iraq-report-taxonomy",
      updatedRows: updateResult.rowCount || 0,
      beforeCategories,
      afterCategories,
      afterPriorities,
      fallbackOtherCount: afterCategories.find((row) => row.value === "other")?.count || 0,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
