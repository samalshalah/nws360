export const CLIENT_BILATERAL_CATEGORY_CODE = "client_bilateral_relations" as const;

export type EmbassyProfile = {
  representedCountryCode?: string | null;
  homeCountryCode?: string | null;
  homeCountryName?: string | null;
  homeCountryAliases?: string[] | null;
  embassyAliases?: string[] | null;
  ambassadorAliases?: string[] | null;
  bilateralCategoryLabel?: string | null;
};

export const US_EMBASSY_BAGHDAD_PROFILE: Required<EmbassyProfile> = {
  representedCountryCode: "US",
  homeCountryCode: "US",
  homeCountryName: "United States",
  homeCountryAliases: [
    "United States",
    "United States of America",
    "U.S.",
    "US",
    "USA",
    "America",
    "American",
    "الولايات المتحدة",
    "الولايات المتحدة الأمريكية",
    "امريكا",
    "أمريكا",
    "اميركا",
    "أميركا",
    "الأمريكي",
    "الامريكي",
    "الأمريكية",
    "الامريكية",
    "أميركا",
    "أمريكا",
    "أمريكي",
    "الأمريكية",
  ],
  embassyAliases: [
    "U.S. Embassy Baghdad",
    "United States Embassy Baghdad",
    "U.S. Embassy in Iraq",
    "American Embassy Baghdad",
    "السفارة الأمريكية",
    "السفارة الامريكية",
    "سفارة الولايات المتحدة",
    "السفارة الأميركية",
    "السفارة الاميركية",
    "السفارة الأمريكية في بغداد",
    "السفارة الامريكية في بغداد",
    "السفارة الأمريكية في العراق",
    "السفارة الامريكية في العراق",
    "سفارة الولايات المتحدة",
    "السفارة الأميركية",
  ],
  ambassadorAliases: [],
  bilateralCategoryLabel: "Iraq in US News",
};

export const ARTICLE_CATEGORIES = [
  {
    code: "iraqi_government",
    label: "Iraqi Government",
    labelAr: "الحكومة العراقية",
    description: "Prime Minister's Office, Presidency, Council of Ministers, federal ministries, state institutions, government decisions, appointments, programs, official statements, and executive activity.",
  },
  {
    code: "parliament_politics",
    label: "Parliament & Political Affairs",
    labelAr: "البرلمان والشؤون السياسية",
    description: "Council of Representatives, legislation, political parties, coalitions, elections, parliamentary committees, negotiations, and disputes among political actors.",
  },
  {
    code: "security_stability",
    label: "Security & Stability",
    labelAr: "الأمن والاستقرار",
    description: "Terrorism, armed groups, militias, border security, military activity, police activity, violent incidents, organized crime, demonstrations involving security concerns, and threats to stability.",
  },
  {
    code: "economy_oil_finance",
    label: "Economy, Oil & Public Finance",
    labelAr: "الاقتصاد والنفط والمالية العامة",
    description: "Federal budget, oil and gas, exports, banking, currency, salaries, employment, inflation, trade, investment, private-sector activity, and public finance.",
  },
  {
    code: "development_services",
    label: "Development & Public Services",
    labelAr: "التنمية والخدمات العامة",
    description: "Reconstruction, electricity, water, roads, housing, transportation, healthcare services, education services, infrastructure, municipal services, and development projects.",
  },
  {
    code: "justice_accountability",
    label: "Justice, Corruption & Accountability",
    labelAr: "العدالة والفساد والمساءلة",
    description: "Courts, judiciary, corruption investigations, Integrity Commission activity, audits, legal accountability, arrests involving public officials, and rule-of-law developments.",
  },
  {
    code: "kurdistan_region",
    label: "Kurdistan Region",
    labelAr: "إقليم كردستان",
    description: "Kurdistan Regional Government, Erbil-Baghdad relations, Kurdish political parties, regional salaries, oil exports, security, institutions, and Kurdistan-specific developments.",
  },
  {
    code: "civil_society_humanitarian",
    label: "Civil Society, Humanitarian Affairs & Public Opinion",
    labelAr: "المجتمع المدني والشؤون الإنسانية والرأي العام",
    description: "NGOs, human rights, displacement, minorities, women, youth, humanitarian programs, protests, public reaction, social concerns, and civil-society activity.",
  },
  {
    code: "united_nations",
    label: "United Nations & International Organizations",
    labelAr: "الأمم المتحدة والمنظمات الدولية",
    description: "UNAMI, UNDP, UNICEF, WHO, IOM, UNHCR, WFP, UNESCO, World Bank, IMF, international organizations, donor programs, and international development institutions.",
  },
  {
    code: CLIENT_BILATERAL_CATEGORY_CODE,
    label: "Bilateral Relations",
    labelAr: "العلاقات الثنائية",
    description: "Relations between Iraq and the tenant embassy's home country, including embassy statements, ambassador activity, official visits, bilateral agreements, trade, investment, security cooperation, cultural programs, development projects, visas, consular issues, and mentions of the tenant country's nationals, organizations, and companies.",
  },
  {
    code: "regional_international_relations",
    label: "Regional & International Relations",
    labelAr: "العلاقات الإقليمية والدولية",
    description: "Iraq's relations with countries other than the tenant embassy's home country, neighboring states, regional powers, international diplomacy, sanctions, treaties, foreign-policy developments, and multilateral relations not led by the United Nations.",
  },
  {
    code: "media_narratives",
    label: "Media Narratives & Social Trends",
    labelAr: "السرديات الإعلامية والاتجاهات الاجتماعية",
    description: "Major media narratives, coordinated messaging, misinformation, social-media trends, influencer activity, changes in public discourse, and differences in how outlets frame the same issue.",
  },
  {
    code: "other",
    label: "Other",
    labelAr: "أخرى",
    description: "Relevant Iraq coverage that cannot reasonably be assigned to another category.",
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
  foreign_relations: "regional_international_relations",
  us_iraq_international: CLIENT_BILATERAL_CATEGORY_CODE,
  bilateral_international_relations: "regional_international_relations",
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

function uniqueTrimmed(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function cleanedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned || null;
}

function normalizeBilateralCategoryLabel(value: unknown): string | null {
  const cleaned = cleanedString(value);
  if (!cleaned) return null;
  return cleaned === "U.S.-Iraq Relations" ? "Iraq in US News" : cleaned;
}

export function normalizeEmbassyProfile(profile?: EmbassyProfile | null): EmbassyProfile | null {
  if (!profile) return null;
  const representedCountryCode =
    cleanedString(profile.representedCountryCode)?.toUpperCase() ||
    cleanedString(profile.homeCountryCode)?.toUpperCase() ||
    null;
  const normalized: EmbassyProfile = {
    representedCountryCode,
    homeCountryCode: representedCountryCode,
    homeCountryName: cleanedString(profile.homeCountryName),
    homeCountryAliases: uniqueTrimmed(profile.homeCountryAliases),
    embassyAliases: uniqueTrimmed(profile.embassyAliases),
    ambassadorAliases: uniqueTrimmed(profile.ambassadorAliases),
    bilateralCategoryLabel: normalizeBilateralCategoryLabel(profile.bilateralCategoryLabel),
  };

  const hasProfileValue = Boolean(
    normalized.representedCountryCode ||
    normalized.homeCountryCode ||
    normalized.homeCountryName ||
    normalized.bilateralCategoryLabel ||
    normalized.homeCountryAliases?.length ||
    normalized.embassyAliases?.length ||
    normalized.ambassadorAliases?.length,
  );
  return hasProfileValue ? normalized : null;
}

export function getEmbassyProfileTerms(profile?: EmbassyProfile | null): string[] {
  const normalized = normalizeEmbassyProfile(profile);
  if (!normalized) return [];
  const defaultAliases =
    normalized.representedCountryCode === "US" || normalized.homeCountryCode === "US"
      ? ["U.S.", "US", "USA", "United States", "United States of America", "America", "American"]
      : [];
  return uniqueTrimmed([
    normalized.homeCountryCode,
    normalized.homeCountryName,
    ...defaultAliases,
    ...(normalized.homeCountryAliases || []),
    ...(normalized.embassyAliases || []),
    ...(normalized.ambassadorAliases || []),
  ]);
}

export function getBilateralCategoryLabel(profile?: EmbassyProfile | null): string {
  const normalized = normalizeEmbassyProfile(profile);
  if (!normalized) return "Bilateral Relations";
  if (normalized.bilateralCategoryLabel) return normalized.bilateralCategoryLabel;
  const representedCountryCode = normalized.representedCountryCode || normalized.homeCountryCode;
  if (representedCountryCode === "US") return "Iraq in US News";
  if (normalized.homeCountryName) return `${normalized.homeCountryName}-Iraq Relations`;
  return "Bilateral Relations";
}

export function normalizeArticleCategoryCode(value: unknown, fallback: ArticleCategoryCode = "other"): ArticleCategoryCode {
  if (typeof value !== "string") return fallback;
  const code = value.trim();
  if (!code) return fallback;
  if (isArticleCategoryCode(code)) return code;
  return LEGACY_ARTICLE_CATEGORY_MAP[code] || fallback;
}

export function getArticleCategoryFilterCodes(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const code = value.trim();
  if (!code) return [];

  const isCurrentCode = isArticleCategoryCode(code);
  const isLegacyCode = Object.prototype.hasOwnProperty.call(LEGACY_ARTICLE_CATEGORY_MAP, code);
  if (!isCurrentCode && !isLegacyCode) return [code];

  const normalized = normalizeArticleCategoryCode(code);
  const codes = new Set<string>([normalized, code]);
  for (const [legacyCode, currentCode] of Object.entries(LEGACY_ARTICLE_CATEGORY_MAP)) {
    if (currentCode === normalized) codes.add(legacyCode);
  }
  return Array.from(codes);
}

export function isArticleCategoryCode(value: unknown): value is ArticleCategoryCode {
  return typeof value === "string" && ARTICLE_CATEGORIES.some((category) => category.code === value);
}

export function getArticleCategoryLabel(code: string | null | undefined, embassyProfile?: EmbassyProfile | null): string {
  const normalized = normalizeArticleCategoryCode(code);
  if (normalized === CLIENT_BILATERAL_CATEGORY_CODE) {
    return getBilateralCategoryLabel(embassyProfile);
  }
  return ARTICLE_CATEGORIES.find((category) => category.code === normalized)?.label || normalized;
}

export function sortArticleCategoryRows<T extends { category: string | null | undefined }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aOrder = ARTICLE_CATEGORY_ORDER.get(normalizeArticleCategoryCode(a.category)) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = ARTICLE_CATEGORY_ORDER.get(normalizeArticleCategoryCode(b.category)) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
}

export function mergeArticleCategoryRows<T extends { category: string | null | undefined }>(rows: T[]): T[] {
  const merged = new Map<ArticleCategoryCode, any>();

  for (const row of rows) {
    const category = normalizeArticleCategoryCode(row.category);
    const current = merged.get(category);
    if (!current) {
      merged.set(category, { ...row, category });
      continue;
    }

    for (const [key, value] of Object.entries(row)) {
      if (key === "category") continue;
      if (typeof value === "number" && typeof current[key] === "number") {
        current[key] += value;
      }
    }
  }

  return sortArticleCategoryRows(Array.from(merged.values())) as T[];
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
