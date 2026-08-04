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
    "\u0628\u0639\u062b\u0629 \u0627\u0644\u0623\u0645\u0645 \u0627\u0644\u0645\u062a\u062d\u062f\u0629",
    "\u0627\u0644\u0623\u0645\u0645 \u0627\u0644\u0645\u062a\u062d\u062f\u0629",
  ])) return "official_un_io";

  if (hasAny(text, [
    "presidency",
    "president",
    "presidency.iq",
    "\u0631\u0626\u0627\u0633\u0629 \u0627\u0644\u062c\u0645\u0647\u0648\u0631\u064a\u0629",
    "\u0631\u0626\u064a\u0633 \u0627\u0644\u062c\u0645\u0647\u0648\u0631\u064a\u0629",
  ])) return "official_presidency";

  if (hasAny(text, [
    "prime minister",
    "pmo",
    "media office of the prime minister",
    "\u0631\u0626\u064a\u0633 \u0645\u062c\u0644\u0633 \u0627\u0644\u0648\u0632\u0631\u0627\u0621",
    "\u0631\u0626\u064a\u0633 \u0627\u0644\u0648\u0632\u0631\u0627\u0621",
  ])) return "official_prime_minister";

  if (hasAny(text, [
    "council of ministers",
    "cabinet",
    "comsec",
    "general secretariat",
    "\u0645\u062c\u0644\u0633 \u0627\u0644\u0648\u0632\u0631\u0627\u0621",
    "\u0627\u0644\u0623\u0645\u0627\u0646\u0629 \u0627\u0644\u0639\u0627\u0645\u0629",
  ])) return "official_council_ministers";

  if (hasAny(text, [
    "parliament",
    "\u0645\u062c\u0644\u0633 \u0627\u0644\u0646\u0648\u0627\u0628",
  ])) return "official_parliament";

  if (hasAny(text, [
    "judiciary",
    "supreme judicial",
    "federal supreme court",
    "\u0627\u0644\u0642\u0636\u0627\u0621",
    "\u0645\u062c\u0644\u0633 \u0627\u0644\u0642\u0636\u0627\u0621",
    "\u0627\u0644\u0645\u062d\u0643\u0645\u0629 \u0627\u0644\u0627\u062a\u062d\u0627\u062f\u064a\u0629",
  ])) return "official_judiciary";

  if (hasAny(text, [
    "commission",
    "electoral commission",
    "election commission",
    "integrity commission",
    "human rights commission",
    "\u0645\u0641\u0648\u0636\u064a\u0629",
    "\u0647\u064a\u0626\u0629 \u0627\u0644\u0646\u0632\u0627\u0647\u0629",
    "\u0647\u064a\u0626\u0629",
  ])) return "official_commission";

  if (hasAny(text, [
    "governorate",
    "province council",
    "baghdad municipality",
    "mayoralty",
    "\u0645\u062d\u0627\u0641\u0638\u0629",
    "\u0645\u062d\u0627\u0641\u0638",
    "\u0623\u0645\u0627\u0646\u0629 \u0628\u063a\u062f\u0627\u062f",
  ])) return "official_governorate";

  if (hasAny(text, [
    "ministry of defense",
    "ministry of interior",
    "mod.mil.iq",
    "moi.gov.iq",
    "security",
    "defense",
    "interior",
    "\u0627\u0644\u062f\u0641\u0627\u0639",
    "\u0627\u0644\u062f\u0627\u062e\u0644\u064a\u0629",
    "\u0627\u0644\u0623\u0645\u0646",
  ])) return "official_security";

  if (hasAny(text, [
    "central bank",
    "cbi.iq",
    "\u0627\u0644\u0628\u0646\u0643 \u0627\u0644\u0645\u0631\u0643\u0632\u064a",
  ])) return "official_economy";

  if (hasAny(text, [
    "ministry",
    "\u0648\u0632\u0627\u0631\u0629",
    "mofa.gov.iq",
    "oil.gov.iq",
    "mof.gov.iq",
    "moh.gov.iq",
    "moedu.gov.iq",
    "mohesr.gov.iq",
    "molsa.gov.iq",
  ])) return "official_ministry";

  if (hasAny(text, [
    "government",
    "\u0627\u0644\u062d\u0643\u0648\u0645\u0629",
  ])) return "official_government";

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
  .filter(({ source, category }) => {
    if (!overwrite && source.category && source.category !== "general") return false;
    return source.category !== category;
  });

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
  for (const entry of planned.slice(0, 20)) {
    console.log(`  #${entry.source.id} ${entry.source.category || "none"} -> ${entry.category} - ${entry.source.name}`);
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
