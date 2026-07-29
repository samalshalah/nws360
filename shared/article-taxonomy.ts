export const ARTICLE_CATEGORIES = [
  { code: "urgent", label: "Urgent" },
  { code: "political", label: "Politics" },
  { code: "security", label: "Security" },
  { code: "economy", label: "Economy" },
  { code: "oil_energy", label: "Oil & Energy" },
  { code: "banking_currency", label: "Banking & Currency" },
  { code: "foreign_relations", label: "Foreign Relations" },
  { code: "parliament_law", label: "Parliament & Law" },
  { code: "government_services", label: "Government Services" },
  { code: "health", label: "Health" },
  { code: "education", label: "Education" },
  { code: "corruption_courts", label: "Corruption & Courts" },
  { code: "provinces", label: "Provinces" },
  { code: "protests_public_opinion", label: "Protests & Public Opinion" },
  { code: "humanitarian_ngos", label: "Humanitarian & NGOs" },
  { code: "business", label: "Business" },
  { code: "tech", label: "Technology" },
  { code: "environment_water", label: "Environment & Water" },
  { code: "culture_society", label: "Culture & Society" },
  { code: "sports", label: "Sports" },
  { code: "science", label: "Science" },
  { code: "entertainment", label: "Entertainment" },
  { code: "general", label: "General" },
  { code: "other", label: "Other" },
] as const;

export type ArticleCategoryCode = (typeof ARTICLE_CATEGORIES)[number]["code"];

export const ARTICLE_WORKFLOW_STATUSES = [
  { code: "new", label: "New" },
  { code: "reviewed", label: "Reviewed" },
  { code: "important", label: "Important" },
  { code: "irrelevant", label: "Irrelevant" },
  { code: "for_report", label: "For Report" },
  { code: "archived", label: "Archived" },
] as const;

export type ArticleWorkflowStatusCode = (typeof ARTICLE_WORKFLOW_STATUSES)[number]["code"];

export const IRAQ_PROVINCES = [
  { code: "baghdad", label: "Baghdad" },
  { code: "basra", label: "Basra" },
  { code: "erbil", label: "Erbil" },
  { code: "sulaymaniyah", label: "Sulaymaniyah" },
  { code: "duhok", label: "Duhok" },
  { code: "nineveh", label: "Nineveh" },
  { code: "kirkuk", label: "Kirkuk" },
  { code: "anbar", label: "Anbar" },
  { code: "salahuddin", label: "Salahuddin" },
  { code: "diyala", label: "Diyala" },
  { code: "najaf", label: "Najaf" },
  { code: "karbala", label: "Karbala" },
  { code: "babil", label: "Babil" },
  { code: "wasit", label: "Wasit" },
  { code: "dhi_qar", label: "Dhi Qar" },
  { code: "maysan", label: "Maysan" },
  { code: "qadisiyah", label: "Qadisiyah" },
  { code: "muthanna", label: "Muthanna" },
] as const;

export type IraqProvinceCode = (typeof IRAQ_PROVINCES)[number]["code"];

export function isArticleCategoryCode(value: unknown): value is ArticleCategoryCode {
  return typeof value === "string" && ARTICLE_CATEGORIES.some((category) => category.code === value);
}

export function getArticleCategoryLabel(code: string | null | undefined): string {
  if (!code) return "General";
  return ARTICLE_CATEGORIES.find((category) => category.code === code)?.label || code;
}

export function isArticleWorkflowStatusCode(value: unknown): value is ArticleWorkflowStatusCode {
  return typeof value === "string" && ARTICLE_WORKFLOW_STATUSES.some((status) => status.code === value);
}

export function getArticleWorkflowStatusLabel(code: string | null | undefined): string {
  if (!code) return "New";
  return ARTICLE_WORKFLOW_STATUSES.find((status) => status.code === code)?.label || code;
}

export function isIraqProvinceCode(value: unknown): value is IraqProvinceCode {
  return typeof value === "string" && IRAQ_PROVINCES.some((province) => province.code === value);
}

export function getIraqProvinceLabel(code: string | null | undefined): string {
  if (!code) return "";
  return IRAQ_PROVINCES.find((province) => province.code === code)?.label || code;
}
