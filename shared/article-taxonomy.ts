export const ARTICLE_CATEGORIES = [
  {
    code: "iraqi_government",
    label: "Iraqi Government",
    labelAr: "الحكومة العراقية",
    description: "Federal executive activity, the Prime Minister, Council of Ministers, ministries, state agencies, and official government decisions.",
  },
  {
    code: "parliament_politics",
    label: "Parliament & Political Affairs",
    labelAr: "البرلمان والشؤون السياسية",
    description: "Parliament, legislation, parties, elections, coalitions, political blocs, and formal political negotiations.",
  },
  {
    code: "security_stability",
    label: "Security & Stability",
    labelAr: "الأمن والاستقرار",
    description: "Security incidents, military activity, armed groups, terrorism, public safety, border security, and stability risks.",
  },
  {
    code: "economy_oil_finance",
    label: "Economy, Oil & Public Finance",
    labelAr: "الاقتصاد والنفط والمالية العامة",
    description: "Budget, currency, banking, markets, public finance, oil, gas, energy exports, salaries, and economic policy.",
  },
  {
    code: "development_services",
    label: "Development & Public Services",
    labelAr: "التنمية والخدمات العامة",
    description: "Infrastructure, electricity, water, health, education, municipalities, housing, transportation, environment, and service delivery.",
  },
  {
    code: "justice_accountability",
    label: "Justice, Corruption & Accountability",
    labelAr: "العدالة والفساد والمساءلة",
    description: "Courts, judiciary, integrity investigations, corruption, accountability, warrants, trials, and rule-of-law issues.",
  },
  {
    code: "kurdistan_region",
    label: "Kurdistan Region",
    labelAr: "إقليم كردستان",
    description: "KRG institutions, Erbil-Baghdad disputes, Kurdistan oil and salaries, Peshmerga, and Kurdistan Region political or service issues.",
  },
  {
    code: "civil_society_humanitarian",
    label: "Civil Society, Humanitarian Affairs & Public Opinion",
    labelAr: "المجتمع المدني والشؤون الإنسانية والرأي العام",
    description: "NGOs, humanitarian needs, displaced communities, human rights, protests, activists, civil society, and public opinion.",
  },
  {
    code: "united_nations",
    label: "United Nations & International Organizations",
    labelAr: "الأمم المتحدة والمنظمات الدولية",
    description: "UNAMI, UN agencies, international organizations, multilateral programs, humanitarian agencies, and international institutional statements.",
  },
  {
    code: "us_iraq_international",
    label: "U.S.-Iraq & International Relations",
    labelAr: "العلاقات الأمريكية العراقية والدولية",
    description: "U.S.-Iraq relations, embassies, diplomatic engagement, neighboring states, foreign policy, bilateral meetings, and international relations.",
  },
  {
    code: "media_narratives",
    label: "Media Narratives & Social Trends",
    labelAr: "السرديات الإعلامية والاتجاهات الاجتماعية",
    description: "Media narratives, information campaigns, disinformation, coordinated online discourse, viral public debate, and social trend analysis.",
  },
  {
    code: "other",
    label: "Other",
    labelAr: "أخرى",
    description: "Items that do not fit a defined Iraq Daily Media Report subject category.",
  },
] as const;

export type ArticleCategoryCode = (typeof ARTICLE_CATEGORIES)[number]["code"];

export const ARTICLE_PRIORITIES = [
  { code: "routine", label: "Routine", labelAr: "اعتيادي" },
  { code: "important", label: "Important", labelAr: "مهم" },
  { code: "urgent", label: "Urgent", labelAr: "عاجل" },
  { code: "critical", label: "Critical", labelAr: "حرج" },
] as const;

export type ArticlePriorityCode = (typeof ARTICLE_PRIORITIES)[number]["code"];

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

export const ARTICLE_CATEGORY_ORDER = new Map<string, number>(
  ARTICLE_CATEGORIES.map((category, index) => [category.code, index]),
);

export const LEGACY_ARTICLE_CATEGORY_MAP: Record<string, ArticleCategoryCode> = {
  urgent: "other",
  political: "parliament_politics",
  security: "security_stability",
  economy: "economy_oil_finance",
  oil_energy: "economy_oil_finance",
  banking_currency: "economy_oil_finance",
  foreign_relations: "us_iraq_international",
  parliament_law: "parliament_politics",
  government_services: "iraqi_government",
  health: "development_services",
  education: "development_services",
  corruption_courts: "justice_accountability",
  provinces: "other",
  protests_public_opinion: "civil_society_humanitarian",
  humanitarian_ngos: "civil_society_humanitarian",
  business: "economy_oil_finance",
  tech: "other",
  environment_water: "development_services",
  culture_society: "civil_society_humanitarian",
  sports: "other",
  science: "other",
  entertainment: "other",
  general: "other",
  other: "other",
};

export function normalizeArticleCategoryCode(value: unknown, fallback: ArticleCategoryCode = "other"): ArticleCategoryCode {
  if (typeof value !== "string") return fallback;
  const code = value.trim();
  if (!code) return fallback;
  if (isArticleCategoryCode(code)) return code;
  return LEGACY_ARTICLE_CATEGORY_MAP[code] || fallback;
}

export function isArticleCategoryCode(value: unknown): value is ArticleCategoryCode {
  return typeof value === "string" && ARTICLE_CATEGORIES.some((category) => category.code === value);
}

export function getArticleCategoryLabel(code: string | null | undefined): string {
  const normalized = normalizeArticleCategoryCode(code);
  return ARTICLE_CATEGORIES.find((category) => category.code === normalized)?.label || normalized;
}

export function sortArticleCategoryRows<T extends { category: string | null | undefined }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aOrder = ARTICLE_CATEGORY_ORDER.get(normalizeArticleCategoryCode(a.category)) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = ARTICLE_CATEGORY_ORDER.get(normalizeArticleCategoryCode(b.category)) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
}

export function isArticlePriorityCode(value: unknown): value is ArticlePriorityCode {
  return typeof value === "string" && ARTICLE_PRIORITIES.some((priority) => priority.code === value);
}

export function getArticlePriorityLabel(code: string | null | undefined): string {
  if (!code) return "Routine";
  return ARTICLE_PRIORITIES.find((priority) => priority.code === code)?.label || code;
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
