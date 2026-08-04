import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { sources } from "../shared/schema";
import { OFFICIAL_SOURCE_CATEGORY_CODES } from "../shared/source-categories";

type OfficialCategory = (typeof OFFICIAL_SOURCE_CATEGORY_CODES)[number];

const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");

function textOf(value: string | null | undefined): string {
  return (value || "").toLowerCase();
}

function hasAny(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker.toLowerCase()));
}

function classifyOfficialSource(source: { name: string; url: string }): OfficialCategory | null {
  const text = textOf(`${source.name} ${source.url}`);

  if (hasAny(text, [
    "uniraq",
    "un iraq",
    "united nations iraq",
    "who iraq",
    "unicef iraq",
    "iom iraq",
    "undp iraq",
    "بعثة الأمم المتحدة",
    "الأمم المتحدة",
  ])) {
    return "official_un_io";
  }

  if (hasAny(text, ["parliament", "مجلس النواب"])) return "official_parliament";

  if (hasAny(text, [
    "judiciary",
    "supreme judicial",
    "federal supreme court",
    "integrity commission",
    "القضاء",
    "مجلس القضاء",
    "المحكمة الاتحادية",
    "هيئة النزاهة",
  ])) {
    return "official_judiciary";
  }

  if (hasAny(text, [
    "ministry of defense",
    "ministry of interior",
    "mod.mil.iq",
    "moi.gov.iq",
    "security",
    "defense",
    "interior",
    "الدفاع",
    "الداخلية",
    "الأمن",
  ])) {
    return "official_security";
  }

  if (hasAny(text, [
    "central bank",
    "cbi.iq",
    "البنك المركزي",
  ])) {
    return "official_economy";
  }

  if (hasAny(text, [
    "ministry",
    "وزارة",
    "mofa.gov.iq",
    "oil.gov.iq",
    "mof.gov.iq",
    "moh.gov.iq",
    "moedu.gov.iq",
    "mohesr.gov.iq",
    "molsa.gov.iq",
  ])) {
    return "official_ministry";
  }

  if (hasAny(text, [
    "presidency",
    "prime minister",
    "council of ministers",
    "cabinet",
    "government",
    "رئاسة",
    "رئيس الوزراء",
    "مجلس الوزراء",
    "الحكومة",
    "الأمانة العامة",
    "مفوضية",
  ])) {
    return "official_government";
  }

  return null;
}

const rows = await db
  .select({
    id: sources.id,
    name: sources.name,
    url: sources.url,
    category: sources.category,
  })
  .from(sources);

const planned = rows
  .map((source) => ({ source, category: classifyOfficialSource(source) }))
  .filter((entry) => entry.category)
  .filter(({ source }) => overwrite || !source.category || source.category === "general");

const skippedExisting = rows.filter((source) => source.category && source.category !== "general").length;
const byCategory = new Map<string, number>();
for (const entry of planned) {
  byCategory.set(entry.category!, (byCategory.get(entry.category!) || 0) + 1);
}

console.log(`Official source backfill (${apply ? "apply" : "dry run"})`);
console.log(`Scanned: ${rows.length}`);
console.log(`Planned updates: ${planned.length}`);
console.log(`Skipped existing categories: ${skippedExisting}`);
for (const [category, count] of [...byCategory.entries()].sort()) {
  console.log(`  ${category}: ${count}`);
}

if (planned.length > 0) {
  console.log("Sample:");
  for (const entry of planned.slice(0, 15)) {
    console.log(`  #${entry.source.id} ${entry.category} - ${entry.source.name}`);
  }
}

if (apply) {
  for (const entry of planned) {
    await db.update(sources).set({ category: entry.category }).where(eq(sources.id, entry.source.id));
  }
  console.log(`Applied updates: ${planned.length}`);
} else {
  console.log("Dry run only. Re-run with --apply to update the database.");
}

await pool.end();
