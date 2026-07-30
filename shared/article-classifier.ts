import {
  ARTICLE_CATEGORIES,
  IRAQ_PROVINCES,
  isArticleCategoryCode,
  type ArticleCategoryCode,
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
const DEFAULT_CATEGORY: ArticleCategoryCode = "general";

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "urgent",
    weight: 6,
    terms: ["عاجل", "breaking", "urgent", "developing", "فوري", "تنبيه"],
  },
  {
    category: "political",
    weight: 4,
    terms: [
      "سياسة", "السياسة", "سياسي", "سياسية", "انتخابات", "الانتخابات", "مرشح", "مرشحين", "حزب", "احزاب", "الأحزاب",
      "ائتلاف", "تحالف سياسي", "الاطار التنسيقي", "الإطار التنسيقي", "التيار الصدري", "الصدر", "رئيس الجمهورية",
      "رئاسة الجمهورية", "المعارضة",
      "politics", "political", "election", "candidate", "party", "coalition", "president",
      "opposition",
    ],
  },
  {
    category: "security",
    weight: 5,
    terms: [
      "امن", "أمن", "امني", "أمني", "القوات الامنية", "الجيش", "الدفاع", "الداخلية", "الحشد", "داعش",
      "قصف", "هجوم", "انفجار", "صاروخ", "صواريخ", "طائرة مسيرة", "مسيّرة", "اشتباك", "مقتل", "اعتقال",
      "ضربة", "ضربات", "غارة", "غارات", "استهداف", "شن حملة جوية",
      "ارهاب", "الإرهاب", "مكافحة الارهاب", "مكافحة الإرهاب", "سلاح", "اسلحة", "أسلحة", "حصر السلاح",
      "تحالف بحري", "بحري دفاعي", "حماية الملاحة", "قواعد عسكرية", "عمليات عسكرية", "باتريوت",
      "security", "military", "defense", "attack", "strike", "missile", "drone", "isis", "militia", "armed",
      "terrorism", "counterterrorism", "weapons", "arms", "patriot", "maritime security",
    ],
  },
  {
    category: "oil_energy",
    weight: 5,
    terms: [
      "نفط", "النفط", "الطاقة", "كهرباء", "الكهرباء", "غاز", "الغاز", "اوبك", "أوبك", "برميل", "خام",
      "مصفى", "مصافي", "تصدير النفط", "اسعار النفط", "أسعار النفط", "هرمز", "oil", "energy", "crude",
      "opec", "gas", "barrel", "refinery", "electricity", "power grid", "hormuz",
    ],
  },
  {
    category: "foreign_relations",
    weight: 4,
    terms: [
      "الخارجية", "دبلوماسي", "دبلوماسية", "سفارة", "سفير", "واشنطن", "امريكا", "أمريكا", "الولايات المتحدة",
      "امريكي", "أمريكي", "اميركي", "أميركي", "الامريكي", "الأمريكي", "الاميركي", "الأميركي", "ترامب",
      "ايران", "إيران", "تركيا", "الصين", "روسيا", "السعودية", "الكويت", "سوريا", "الاردن", "لبنان",
      "قطر", "أيرلندا", "ايرلندا", "اسرائيل", "إسرائيل", "فلسطين", "أوكرانيا", "اوكرانيا", "موسكو",
      "اتفاق", "عقوبات", "زيارة رسمية", "foreign", "diplomatic", "embassy", "ambassador", "washington",
      "iran", "turkey", "china", "russia", "qatar", "ireland", "israel", "palestine", "ukraine", "moscow", "sanctions", "bilateral",
    ],
  },
  {
    category: "parliament_law",
    weight: 4,
    terms: [
      "البرلمان", "مجلس النواب", "نائب", "نواب", "قانون", "القانون", "تشريع", "تصويت", "المحكمة",
      "القضاء", "الدستور", "اللجنة القانونية", "parliament", "law", "legal", "court", "supreme court",
      "legislation", "bill", "vote",
    ],
  },
  {
    category: "corruption_courts",
    weight: 4,
    terms: [
      "فساد", "النزاهة", "اختلاس", "رشوة", "محاكمة", "قضية فساد", "امر قبض", "أمر قبض", "استرداد الاموال",
      "corruption", "bribery", "embezzlement", "integrity commission", "trial", "warrant",
    ],
  },
  {
    category: "economy",
    weight: 3,
    terms: [
      "اقتصاد", "الاقتصاد", "المالية", "الموازنة", "ميزانية", "تضخم", "الاسعار", "أسعار", "استثمار",
      "التجارة", "النمو", "الدينار", "الدولار", "exchange rate", "economy", "economic", "budget",
      "inflation", "investment", "trade", "prices", "dinar", "dollar",
    ],
  },
  {
    category: "banking_currency",
    weight: 4,
    terms: [
      "مصرف", "المصرف", "البنك", "البنك المركزي", "مزاد العملة", "سعر الصرف", "الدينار", "الدولار",
      "حوالات", "تحويلات", "bank", "central bank", "currency", "exchange rate", "remittance",
    ],
  },
  {
    category: "government_services",
    weight: 3,
    terms: [
      "وزارة", "الوزارة", "رئيس الوزراء", "رئاسة الوزراء", "مجلس الوزراء", "السوداني", "خدمات", "رواتب", "تقاعد", "بلدية", "امانة بغداد",
      "البطاقة الوطنية", "جوازات", "منحة", "government", "ministry", "cabinet", "public services",
      "prime minister", "premier", "salary", "pension", "municipality",
    ],
  },
  {
    category: "protests_public_opinion",
    weight: 4,
    terms: [
      "تظاهرة", "تظاهرات", "احتجاج", "احتجاجات", "اعتصام", "متظاهر", "الرأي العام", "غضب شعبي",
      "protest", "demonstration", "public anger", "public opinion", "sit-in",
    ],
  },
  {
    category: "humanitarian_ngos",
    weight: 4,
    terms: [
      "منظمة", "منظمات", "الامم المتحدة", "الأمم المتحدة", "يونيسف", "مساعدات", "نازحين", "لاجئين",
      "انساني", "إنساني", "اغاثة", "ngo", "united nations", "unicef", "humanitarian", "aid", "refugees",
      "displaced",
    ],
  },
  {
    category: "health",
    weight: 4,
    terms: [
      "صحة", "الصحة", "مستشفى", "مستشفيات", "مرض", "وباء", "لقاح", "ادوية", "أدوية", "طبيب",
      "health", "hospital", "disease", "vaccine", "medicine", "medical", "doctor",
    ],
  },
  {
    category: "education",
    weight: 4,
    terms: [
      "تعليم", "التعليم", "التربية", "مدرسة", "مدارس", "جامعة", "جامعات", "طلبة", "طلاب", "امتحانات",
      "education", "school", "university", "students", "exam",
    ],
  },
  {
    category: "environment_water",
    weight: 4,
    terms: [
      "مياه", "المياه", "الماء", "جفاف", "بيئة", "البيئة", "تلوث", "مناخ", "حرائق", "زراعة",
      "water", "drought", "environment", "pollution", "climate", "agriculture",
    ],
  },
  {
    category: "business",
    weight: 3,
    terms: [
      "شركة", "شركات", "اعمال", "أعمال", "مشروع", "قطاع خاص", "سوق", "اسهم", "أرباح",
      "business", "company", "companies", "market", "stock", "profit", "private sector",
    ],
  },
  {
    category: "tech",
    weight: 3,
    terms: [
      "تكنولوجيا", "تقنية", "رقمي", "سيبراني", "ذكاء اصطناعي", "اتصالات", "انترنت", "منصة",
      "technology", "tech", "digital", "cyber", "ai", "internet", "telecom",
    ],
  },
  {
    category: "culture_society",
    weight: 3,
    terms: [
      "ثقافة", "مجتمع", "اجتماعي", "المرأة", "نساء", "شباب", "فنان", "كتاب", "تراث",
      "culture", "society", "social", "women", "youth", "heritage",
    ],
  },
  {
    category: "sports",
    weight: 4,
    terms: ["رياضة", "رياضي", "كرة", "نادي", "لاعب", "منتخب", "الدوري", "sports", "football", "club", "player", "league"],
  },
  {
    category: "entertainment",
    weight: 3,
    terms: ["فن", "فنان", "سينما", "مسلسل", "موسيقى", "ترفيه", "entertainment", "movie", "music", "film", "celebrity"],
  },
  {
    category: "science",
    weight: 3,
    terms: ["علوم", "فضاء", "بحث علمي", "science", "space", "research"],
  },
  {
    category: "provinces",
    weight: 2,
    terms: ["محافظة", "محافظات", "مجلس المحافظة", "الحكومة المحلية", "local government", "governorate"],
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
  { province: "anbar", terms: ["الانبار", "الأنبار", "رمادي", "فلوجة", "anbar", "ramadi", "fallujah"] },
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
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termHits(text: string, term: string): number {
  const normalized = normalizeText(term);
  if (!normalized) return 0;
  if (normalized.includes(" ")) return text.includes(normalized) ? 1 : 0;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const latinBoundary = /^[a-z0-9]+$/.test(normalized) ? "\\b" : "";
  const re = new RegExp(`${latinBoundary}${escaped}${latinBoundary}`, "g");
  return text.match(re)?.length || 0;
}

function normalizedSourceCategory(value: string | null | undefined): ArticleCategoryCode | null {
  const category = String(value || "").trim();
  if (!category || !isArticleCategoryCode(category)) return null;
  if (category === "general" || category === "other") return null;
  return category;
}

export function classifyArticleCategory(input: ClassificationInput): ArticleCategoryCode {
  const title = normalizeText(input.title);
  const content = normalizeText(input.summary || input.content);
  const source = normalizeText([input.sourceName, input.url].filter(Boolean).join(" "));
  const scores = new Map<ArticleCategoryCode, number>();

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const term of rule.terms) {
      score += termHits(title, term) * rule.weight * 3;
      score += Math.min(termHits(content, term), 3) * rule.weight;
      score += termHits(source, term) * Math.max(1, rule.weight - 1);
    }
    if (score > 0) scores.set(rule.category, (scores.get(rule.category) || 0) + score);
  }

  const sourceCategory = normalizedSourceCategory(input.sourceCategory);
  if (sourceCategory) {
    scores.set(sourceCategory, (scores.get(sourceCategory) || 0) + 3);
  }

  const ranked = Array.from(scores.entries())
    .filter(([category]) => CATEGORY_CODES.has(category))
    .sort((a, b) => b[1] - a[1]);

  const best = ranked[0];
  if (!best) return sourceCategory || DEFAULT_CATEGORY;
  if (best[1] < 4) return sourceCategory || DEFAULT_CATEGORY;
  return best[0];
}

export function classifyIraqProvince(input: Pick<ClassificationInput, "title" | "content" | "summary">): IraqProvinceCode | null {
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const content = normalizeText(input.content);
  const text = title || summary || content;
  const ranked = PROVINCE_TERMS.map((rule) => ({
    province: rule.province,
    score: rule.terms.reduce((total, term) => total + termHits(text, term), 0),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.province || null;
}
