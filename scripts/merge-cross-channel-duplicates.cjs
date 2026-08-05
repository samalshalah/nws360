require("dotenv").config();
const { Client } = require("pg");

const days = Number(process.env.DAYS || 14);
const clientId = process.env.CLIENT_ID ? Number(process.env.CLIENT_ID) : null;
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\w\u0600-\u06FF_]+/g, " ")
    .replace(/[@][\w.-]+/g, " ")
    .replace(/\u0640/g, "")
    .replace(/التفاصيل\s+الكاملة\s+عبر\s+الرابط\s+في\s+التعليق\s+الأول/g, " ")
    .replace(/[|\u2022]+/g, " ")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\w\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.length >= 28 && b.includes(a)) || (b.length >= 28 && a.includes(b))) return 0.94;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap++;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function normalizeSourceFamilyName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/(?:www\.|m\.)?(?:facebook\.com|twitter\.com|x\.com|instagram\.com|t\.me|telegram\.me)\/([a-z0-9_.-]+)/g, " $1 ")
    .replace(/@([a-z0-9_.-]+)/g, " $1 ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(official|page|facebook|telegram|instagram|twitter|youtube|website|google news|rss|feed|channel|tv|x)\b/g, " ")
    .replace(/\balsumariatviraq\b/g, "alsumaria")
    .replace(/\balsumariatv\b/g, "alsumaria")
    .replace(/\b([a-z0-9]+)tviraq\b/g, "$1")
    .replace(/\b([a-z0-9]+)tv\b/g, "$1")
    .replace(/\b([a-z0-9]+)page\b/g, "$1")
    .replace(/\b([a-z0-9]+)official\b/g, "$1")
    .replace(/\b(com|net|org)\b/g, " ")
    .replace(/(قناة|صفحة|تيليجرام|تليجرام|فيسبوك|انستغرام|تويتر|اكس|الرسمية|رسمي)/g, " ")
    .replace(/[^\w\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceFamilyKey(row) {
  if (row.publisher_profile_id) return `publisher:${row.publisher_profile_id}`;
  const family = normalizeSourceFamilyName(`${row.source_name || ""} ${row.source_url || ""}`);
  const tokens = Array.from(new Set(family.split(" ").filter((token) => token.length > 2)));
  return tokens.length > 0 ? `legacy:${tokens.sort().join(" ")}` : null;
}

function sourceFamilyRelated(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  if (aTokens.size === 0 || bTokens.size === 0) return false;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap++;
  return overlap / Math.min(aTokens.size, bTokens.size) >= 0.75;
}

function platformFromType(type) {
  if (type === "facebook" || type === "twitter" || type === "youtube" || type === "instagram" || type === "telegram" || type === "google_news") return type;
  if (type === "x") return "twitter";
  return "web";
}

function mergeCrossPosts(canonical, duplicate) {
  const rows = [];
  const add = (item) => {
    if (!item?.url) return;
    if (rows.some((row) => row.url === item.url)) return;
    rows.push({
      platform: item.platform || "web",
      url: item.url,
      sourceId: item.sourceId || 0,
      sourceName: item.sourceName || null,
    });
  };
  for (const item of Array.isArray(canonical.cross_posts) ? canonical.cross_posts : []) add(item);
  for (const item of Array.isArray(duplicate.cross_posts) ? duplicate.cross_posts : []) add(item);
  add({
    platform: platformFromType(duplicate.source_type),
    url: duplicate.url,
    sourceId: duplicate.source_id,
    sourceName: duplicate.channel_name || duplicate.source_name,
  });
  return rows;
}

async function mergePair(client, canonical, duplicate) {
  const crossPosts = mergeCrossPosts(canonical, duplicate);
  const updates = {
    crossPosts,
    category: canonical.category && !["general", "other"].includes(canonical.category) ? canonical.category : duplicate.category,
    priority: canonical.priority && canonical.priority !== "routine" ? canonical.priority : duplicate.priority,
    province: canonical.province || duplicate.province,
    imageUrl: canonical.image_url || duplicate.image_url,
  };

  await client.query(
    `UPDATE articles
        SET cross_posts = $2::jsonb,
            category = COALESCE($3, category),
            priority = COALESCE($4, priority),
            province = COALESCE($5, province),
            image_url = COALESCE(image_url, $6)
      WHERE id = $1`,
    [canonical.id, JSON.stringify(updates.crossPosts), updates.category, updates.priority, updates.province, updates.imageUrl],
  );

  await client.query(
    `UPDATE article_appearances
        SET article_id = $1, updated_at = NOW()
      WHERE article_id = $2`,
    [canonical.id, duplicate.id],
  );
  await client.query(
    `DELETE FROM bookmarks b
      WHERE b.article_id = $2
        AND EXISTS (
          SELECT 1 FROM bookmarks existing
           WHERE existing.user_id = b.user_id AND existing.article_id = $1
        )`,
    [canonical.id, duplicate.id],
  );
  await client.query(`UPDATE bookmarks SET article_id = $1 WHERE article_id = $2`, [canonical.id, duplicate.id]);
  await client.query(
    `DELETE FROM article_ai_analysis d
      WHERE d.article_id = $2
        AND EXISTS (SELECT 1 FROM article_ai_analysis c WHERE c.article_id = $1)`,
    [canonical.id, duplicate.id],
  );
  await client.query(`UPDATE article_ai_analysis SET article_id = $1 WHERE article_id = $2`, [canonical.id, duplicate.id]);
  await client.query(`DELETE FROM articles WHERE id = $1`, [duplicate.id]);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const params = [days];
    const clientFilter = clientId ? "AND a.client_id = $2" : "";
    if (clientId) params.push(clientId);
    const { rows } = await client.query(
      `SELECT a.id, a.client_id, a.title, a.url, a.source_id, a.published_at, a.created_at,
              a.category, a.priority, a.province, a.image_url, a.cross_posts,
              s.name AS source_name, s.url AS source_url, s.type AS source_type,
              pc.name AS channel_name, pc.publisher_profile_id
         FROM articles a
         JOIN sources s ON s.id = a.source_id
         LEFT JOIN publisher_channels pc ON pc.id = s.publisher_channel_id
        WHERE a.created_at >= NOW() - ($1::int * INTERVAL '1 day')
          ${clientFilter}
        ORDER BY a.client_id, pc.publisher_profile_id, COALESCE(a.published_at, a.created_at) DESC, a.id ASC`,
      params,
    );

    const groups = new Map();
    for (const row of rows) {
      row.normalized_title = normalizeTitle(row.title);
      if (row.normalized_title.length < 18) continue;
      const familyKey = sourceFamilyKey(row);
      if (!familyKey) continue;
      const key = `${row.client_id}:${familyKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const merges = [];
    for (const group of groups.values()) {
      const canonicalRows = [];
      for (const row of group) {
        const rowTime = new Date(row.published_at || row.created_at).getTime();
        let match = null;
        for (const candidate of canonicalRows) {
          if (candidate.source_id === row.source_id) continue;
          const candidateTime = new Date(candidate.published_at || candidate.created_at).getTime();
          if (Math.abs(candidateTime - rowTime) > 3 * 24 * 60 * 60 * 1000) continue;
          if (similarity(candidate.normalized_title, row.normalized_title) >= 0.82) {
            match = candidate;
            break;
          }
        }
        if (match) {
          merges.push({ canonical: match, duplicate: row });
        } else {
          canonicalRows.push(row);
        }
      }
    }

    console.log(`${dryRun ? "Would merge" : "Merging"} ${merges.length} duplicate cross-channel article(s)`);
    if (dryRun || merges.length === 0) return;
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nws360_merge_cross_channel_duplicates'))");
    for (const { canonical, duplicate } of merges) {
      await mergePair(client, canonical, duplicate);
      console.log(`Merged article ${duplicate.id} into ${canonical.id}: ${duplicate.channel_name || duplicate.source_name}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
