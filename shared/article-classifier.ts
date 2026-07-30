import {
  ARTICLE_CATEGORIES,
  IRAQ_PROVINCES,
  type ArticleCategoryCode,
  type ArticlePriorityCode,
  type IraqProvinceCode,
} from "./article-taxonomy";

type CategoryRule = {
  category: ArticleCategoryCode;
  weight: number;
  terms: string[];
};

type ClassificationInput = {
  title?: string | null;
  content?: string | null;
  summary?: string | null;
  sourceName?: string | null;
  sourceCategory?: string | null;
  url?: string | null;
};

const CATEGORY_CODES = new Set<string>(ARTICLE_CATEGORIES.map((category) => category.code));
const DEFAULT_CATEGORY: ArticleCategoryCode = "other";

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "united_nations",
    weight: 7,
    terms: [
      "united nations", "un", "unami", "unicef", "undp", "unhcr", "iom", "who", "wfp", "unesco",
      "security council", "international organization", "international organizations",
      "الأمم المتحدة", "الامم المتحدة", "يونامي", "يونيسف", "برنامج الأمم", "مجلس الأمن", "المنظمات الدولية",
    ],
  },
  {
    category: "kurdistan_region",
    weight: 7,
    terms: [
      "kurdistan", "krg", "kurdistan regional government", "erbil-baghdad", "baghdad-erbil", "peshmerga",
      "kurdish region", "kurdistan salaries", "kurdistan oil", "erbil", "sulaymaniyah", "duhok",
      "إقليم كردستان", "اقليم كردستان", "حكومة الإقليم", "حكومة الاقليم", "أربيل", "اربيل", "دهوك",
      "السليمانية", "البيشمركة", "رواتب الإقليم", "رواتب الاقليم", "نفط الإقليم", "نفط الاقليم",
    ],
  },
  {
    category: "security_stability",
    weight: 6,
    terms: [
      "security", "stability", "military", "defense", "interior ministry", "army", "police", "counterterrorism",
      "isis", "terrorism", "attack", "strike", "airstrike", "explosion", "blast", "missile", "rocket", "drone",
      "armed group", "militia", "clashes", "killed", "wounded", "arrest", "border security", "operation",
      "أمن", "امن", "استقرار", "الجيش", "الشرطة", "الدفاع", "الداخلية", "مكافحة الإرهاب", "مكافحة الارهاب",
      "داعش", "إرهاب", "ارهاب", "هجوم", "قصف", "انفجار", "صاروخ", "صواريخ", "طائرة مسيرة", "مسيرة",
      "اشتباكات", "مقتل", "جرحى", "اعتقال", "الحشد", "عملية أمنية", "عملية امنية",
    ],
  },
  {
    category: "justice_accountability",
    weight: 6,
    terms: [
      "justice", "judiciary", "court", "supreme court", "federal court", "integrity commission", "corruption",
      "accountability", "trial", "warrant", "arrest warrant", "embezzlement", "bribery", "audit", "rule of law",
      "القضاء", "محكمة", "المحكمة الاتحادية", "النزاهة", "فساد", "مكافحة الفساد", "مساءلة", "محاكمة",
      "أمر قبض", "امر قبض", "اختلاس", "رشوة", "استرداد الأموال", "استرداد الاموال",
    ],
  },
  {
    category: "parliament_politics",
    weight: 5,
    terms: [
      "parliament", "council of representatives", "mp", "lawmakers", "legislation", "bill", "vote", "committee",
      "speaker", "political bloc", "bloc", "coalition", "party", "election", "candidate", "president",
      "political agreement", "formation", "opposition", "federal council",
      "البرلمان", "مجلس النواب", "نائب", "نواب", "تشريع", "قانون", "تصويت", "لجنة", "رئيس البرلمان",
      "كتلة", "تحالف", "حزب", "انتخابات", "مرشح", "رئيس الجمهورية", "اتفاق سياسي", "المعارضة",
    ],
  },
  {
    category: "iraqi_government",
    weight: 5,
    terms: [
      "iraqi government", "government", "prime minister", "premier", "council of ministers", "cabinet",
      "ministry", "minister", "federal government", "state agency", "official statement", "sudani", "al-sudani",
      "الحكومة العراقية", "الحكومة", "رئيس الوزراء", "مجلس الوزراء", "رئاسة الوزراء", "الكابينة",
      "وزارة", "الوزارة", "وزير", "الوزير", "الحكومة الاتحادية", "بيان رسمي", "السوداني",
    ],
  },
  {
    category: "economy_oil_finance",
    weight: 5,
    terms: [
      "economy", "economic", "budget", "public finance", "finance ministry", "central bank", "banking", "bank",
      "currency", "exchange rate", "dinar", "dollar", "inflation", "investment", "trade", "market", "oil",
      "gas", "energy", "exports", "oil exports", "barrel", "opec", "revenue", "salary", "salaries", "payroll",
      "الاقتصاد", "اقتصاد", "الموازنة", "الميزانية", "المالية العامة", "وزارة المالية", "البنك المركزي",
      "مصرف", "المصارف", "العملة", "سعر الصرف", "الدينار", "الدولار", "تضخم", "استثمار", "تجارة",
      "نفط", "النفط", "غاز", "طاقة", "صادرات", "تصدير النفط", "برميل", "أوبك", "اوبك", "إيرادات",
      "ايرادات", "رواتب",
    ],
  },
  {
    category: "development_services",
    weight: 4,
    terms: [
      "development", "public services", "services", "infrastructure", "electricity", "power", "water", "health",
      "hospital", "education", "school", "university", "municipality", "housing", "roads", "transport", "project",
      "environment", "drought", "climate", "agriculture", "reconstruction",
      "تنمية", "الخدمات العامة", "خدمات", "بنى تحتية", "البنى التحتية", "كهرباء", "الماء", "المياه",
      "صحة", "مستشفى", "تعليم", "تربية", "مدرسة", "جامعة", "بلدية", "إسكان", "اسكان", "طرق",
      "مشروع", "بيئة", "جفاف", "مناخ", "زراعة", "إعمار", "اعمار",
    ],
  },
  {
    category: "civil_society_humanitarian",
    weight: 4,
    terms: [
      "civil society", "ngo", "ngos", "humanitarian", "human rights", "public opinion", "protest", "demonstration",
      "activist", "aid", "relief", "displaced", "refugees", "minorities", "women", "youth", "labor union",
      "المجتمع المدني", "منظمة", "منظمات", "إنساني", "انساني", "حقوق الإنسان", "حقوق الانسان", "الرأي العام",
      "الرأي", "احتجاج", "تظاهرة", "متظاهر", "ناشط", "مساعدات", "إغاثة", "اغاثة", "نازحين", "لاجئين",
      "أقليات", "اقليات", "المرأة", "النساء", "الشباب", "نقابة",
    ],
  },
  {
    category: "us_iraq_international",
    weight: 4,
    terms: [
      "u.s.", "us ", "united states", "american", "u.s.-iraq", "us-iraq", "embassy", "ambassador",
      "washington", "state department", "bilateral", "diplomatic", "foreign minister", "foreign ministry",
      "iran", "turkey", "saudi", "kuwait", "jordan", "syria", "china", "russia", "eu", "european union",
      "sanctions", "official visit", "international relations", "foreign relations",
      "الولايات المتحدة", "أمريكا", "امريكا", "الأمريكي", "الامريكي", "السفارة", "سفير", "واشنطن",
      "الخارجية", "دبلوماسي", "ثنائي", "إيران", "ايران", "تركيا", "السعودية", "الكويت", "الأردن",
      "الاردن", "سوريا", "الصين", "روسيا", "الاتحاد الأوروبي", "عقوبات", "زيارة رسمية", "العلاقات الدولية",
    ],
  },
  {
    category: "media_narratives",
    weight: 4,
    terms: [
      "media narrative", "narrative", "social media", "online campaign", "coordinated campaign", "hashtag",
      "misinformation", "disinformation", "rumor", "viral", "trend", "trending", "influencer", "public discourse",
      "facebook debate", "x debate", "twitter debate", "media monitoring",
      "سردية", "سرديات", "إعلام", "اعلام", "وسائل التواصل", "التواصل الاجتماعي", "حملة إلكترونية",
      "حملة الكترونية", "هاشتاغ", "وسم", "معلومات مضللة", "شائعة", "رائج", "ترند", "مؤثر", "خطاب عام",
    ],
  },
];

const PROVINCE_TERMS: Array<{ province: IraqProvinceCode; terms: string[] }> = [
  { province: "baghdad", terms: ["بغداد", "baghdad"] },
  { province: "basra", terms: ["البصرة", "بصرة", "basra"] },
  { province: "erbil", terms: ["اربيل", "أربيل", "هولير", "erbil", "hawler"] },
  { province: "sulaymaniyah", terms: ["السليمانية", "سليمانية", "sulaymaniyah", "sulaimani"] },
  { province: "duhok", terms: ["دهوك", "duhok", "dohuk"] },
  { province: "nineveh", terms: ["نينوى", "الموصل", "nineveh", "mosul"] },
  { province: "kirkuk", terms: ["كركوك", "kirkuk"] },
  { province: "anbar", terms: ["الانبار", "الأقبار", "الأانبار", "الأنبار", "رمادي", "فلوجة", "anbar", "ramadi", "fallujah"] },
  { province: "salahuddin", terms: ["صلاح الدين", "تكريت", "salahuddin", "tikrit"] },
  { province: "diyala", terms: ["ديالى", "بعقوبة", "diyala", "baqubah"] },
  { province: "najaf", terms: ["النجف", "نجف", "najaf"] },
  { province: "karbala", terms: ["كربلاء", "karbala"] },
  { province: "babil", terms: ["بابل", "الحلة", "babil", "babylon", "hilla"] },
  { province: "wasit", terms: ["واسط", "الكوت", "wasit", "kut"] },
  { province: "dhi_qar", terms: ["ذي قار", "الناصرية", "dhi qar", "nasiriyah"] },
  { province: "maysan", terms: ["ميسان", "العمارة", "maysan", "amaraa", "amara"] },
  { province: "qadisiyah", terms: ["القادسية", "الديوانية", "qadisiyah", "diwaniyah"] },
  { province: "muthanna", terms: ["المثنى", "السماوة", "muthanna", "samawah"] },
];

const CRITICAL_TERMS = [
  "mass casualty", "mass casualties", "deadly attack", "multiple killed", "killed", "fatal", "explosion", "blast",
  "missile attack", "rocket attack", "drone attack", "airstrike", "armed clashes", "isis attack",
  "هجوم", "انفجار", "قصف", "مقتل", "قتلى", "اشتباكات", "صاروخ", "مسيرة", "داعش",
];

const URGENT_TERMS = [
  "breaking", "urgent", "developing", "immediate", "emergency", "alert", "just in",
  "عاجل", "طارئ", "تنبيه", "تطور", "فوري",
];

const IMPORTANT_TERMS = [
  "prime minister", "cabinet", "council of ministers", "parliament votes", "parliament approved", "budget",
  "oil exports", "central bank", "exchange rate", "united nations", "unami", "u.s. embassy", "us embassy",
  "bilateral", "corruption investigation", "integrity commission", "krg", "salary dispute", "salary disputes", "salaries", "kurdistan salaries",
  "رئيس الوزراء", "مجلس الوزراء", "صوت البرلمان", "البرلمان يصوت", "الموازنة", "تصدير النفط",
  "البنك المركزي", "سعر الصرف", "الأمم المتحدة", "يونامي", "السفارة الأمريكية", "السفارة الامريكية",
  "النزاهة", "تحقيق فساد", "رواتب الإقليم", "رواتب الاقليم",
];

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[*_~]+/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termHits(text: string, term: string): number {
  const normalized = normalizeText(term);
  if (!normalized) return 0;
  if (normalized.includes(" ")) return text.includes(normalized) ? 1 : 0;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const latinBoundary = /^[a-z0-9.]+$/.test(normalized) ? "\\b" : "";
  const re = new RegExp(`${latinBoundary}${escaped}${latinBoundary}`, "g");
  return text.match(re)?.length || 0;
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => termHits(text, term) > 0);
}

function categoryOrder(category: ArticleCategoryCode): number {
  return ARTICLE_CATEGORIES.findIndex((item) => item.code === category);
}

export function classifyArticleCategory(input: ClassificationInput): ArticleCategoryCode {
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const content = normalizeText(input.content);
  const scores = new Map<ArticleCategoryCode, number>();

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const term of rule.terms) {
      score += termHits(title, term) * rule.weight * 4;
      score += termHits(summary, term) * rule.weight * 2;
      score += Math.min(termHits(content, term), 4) * rule.weight;
    }
    if (score > 0) scores.set(rule.category, (scores.get(rule.category) || 0) + score);
  }

  const ranked = Array.from(scores.entries())
    .filter(([category]) => CATEGORY_CODES.has(category))
    .sort((a, b) => b[1] - a[1] || categoryOrder(a[0]) - categoryOrder(b[0]));

  const best = ranked[0];
  if (!best || best[1] < 4) return DEFAULT_CATEGORY;
  return best[0];
}

export function classifyArticlePriority(input: Pick<ClassificationInput, "title" | "content" | "summary">): ArticlePriorityCode {
  const text = normalizeText([input.title, input.summary, input.content].filter(Boolean).join(" "));
  const securityCategory = classifyArticleCategory(input) === "security_stability";

  if (securityCategory && hasAnyTerm(text, CRITICAL_TERMS)) {
    return "critical";
  }
  if (hasAnyTerm(text, URGENT_TERMS)) {
    return "urgent";
  }
  if (hasAnyTerm(text, IMPORTANT_TERMS)) {
    return "important";
  }
  return "routine";
}

export function classifyIraqProvince(input: Pick<ClassificationInput, "title" | "content" | "summary">): IraqProvinceCode | null {
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const content = normalizeText(input.content);
  const text = [title, summary, content].filter(Boolean).join(" ");
  const ranked = PROVINCE_TERMS.map((rule) => ({
    province: rule.province,
    score: rule.terms.reduce((total, term) => total + termHits(text, term), 0),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.province || null;
}
