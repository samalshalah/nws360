import { classifyArticleCategory, classifyArticlePriority } from "../shared/article-classifier";
import {
  US_EMBASSY_BAGHDAD_PROFILE,
  getArticleCategoryLabel,
  type ArticleCategoryCode,
  type ArticlePriorityCode,
  type EmbassyProfile,
} from "../shared/article-taxonomy";

type Example = {
  name: string;
  title: string;
  content?: string;
  category: ArticleCategoryCode;
  priority?: ArticlePriorityCode;
  profile?: EmbassyProfile | null;
};

const frenchEmbassyProfile: EmbassyProfile = {
  homeCountryCode: "FR",
  homeCountryName: "France",
  homeCountryAliases: ["France", "French", "فرنسا", "فرنسي"],
  embassyAliases: ["French Embassy Baghdad", "Embassy of France in Iraq", "السفارة الفرنسية"],
  ambassadorAliases: [],
  bilateralCategoryLabel: "France-Iraq Relations",
};

const examples: Example[] = [
  {
    name: "Council of Ministers policy",
    title: "Council of Ministers approves new federal government service policy",
    content: "The Prime Minister chaired a cabinet session and issued an official statement.",
    category: "iraqi_government",
    priority: "important",
  },
  {
    name: "Parliament votes on law",
    title: "Parliament votes on a new election law after political bloc negotiations",
    content: "Lawmakers said the Council of Representatives will hold another session this week.",
    category: "parliament_politics",
    priority: "important",
  },
  {
    name: "Security operation",
    title: "Iraqi security forces announce an operation in Diyala",
    content: "The army said the operation targeted ISIS cells and armed groups.",
    category: "security_stability",
  },
  {
    name: "Oil export figures",
    title: "Iraq announces oil-export figures as revenue rises",
    content: "Public finance officials linked budget expectations to crude prices.",
    category: "economy_oil_finance",
    priority: "important",
  },
  {
    name: "Water project",
    title: "Ministry launches a water project in Basra",
    content: "The public services program will improve local infrastructure.",
    category: "development_services",
  },
  {
    name: "Corruption investigation",
    title: "Integrity Commission announces a corruption investigation into senior official",
    content: "The judiciary confirmed an arrest warrant tied to embezzlement allegations.",
    category: "justice_accountability",
    priority: "important",
  },
  {
    name: "KRG salary dispute",
    title: "KRG and Baghdad discuss Kurdistan Region salary dispute",
    content: "Erbil officials said oil revenue and public payroll files remain unresolved.",
    category: "kurdistan_region",
    priority: "important",
  },
  {
    name: "NGO human-rights report",
    title: "Human-rights NGO releases a report on displaced families in Nineveh",
    content: "Civil society organizations called for additional humanitarian aid.",
    category: "civil_society_humanitarian",
  },
  {
    name: "UNAMI statement",
    title: "UNAMI issues statement on Iraq election preparations",
    content: "The United Nations mission urged political actors to support a credible process.",
    category: "united_nations",
    priority: "important",
  },
  {
    name: "U.S. ambassador bilateral meeting",
    title: "U.S. ambassador meets the Iraqi prime minister in Baghdad",
    content: "The ambassador discussed the United States partnership with Iraq and new bilateral cooperation.",
    category: "client_bilateral_relations",
    priority: "important",
    profile: US_EMBASSY_BAGHDAD_PROFILE,
  },
  {
    name: "Arabic U.S.-Iraq bilateral meeting",
    title: "السفارة الأمريكية تبحث التعاون مع الحكومة العراقية في بغداد",
    content: "ناقش السفير الأمريكي مع رئيس الوزراء العراقي العلاقات الثنائية والشراكة بين العراق والولايات المتحدة.",
    category: "client_bilateral_relations",
    priority: "important",
    profile: US_EMBASSY_BAGHDAD_PROFILE,
  },
  {
    name: "French ambassador bilateral meeting",
    title: "French ambassador meets an Iraqi minister in Baghdad",
    content: "France and Iraq discussed a new cultural cooperation program and bilateral partnership.",
    category: "client_bilateral_relations",
    priority: "important",
    profile: frenchEmbassyProfile,
  },
  {
    name: "French ambassador under U.S. tenant",
    title: "French ambassador meets an Iraqi minister in Baghdad",
    content: "France and Iraq discussed a new cultural cooperation program and bilateral partnership.",
    category: "regional_international_relations",
    priority: "important",
    profile: US_EMBASSY_BAGHDAD_PROFILE,
  },
  {
    name: "Turkey and Iraq water talks",
    title: "Turkey and Iraq discuss water releases during regional talks",
    content: "Foreign ministry officials said the two sides will continue diplomatic negotiations.",
    category: "regional_international_relations",
  },
  {
    name: "Campaign targeting U.S. Embassy",
    title: "Social-media misinformation campaign targeting the U.S. Embassy spreads online",
    content: "Analysts said the viral narrative moved across Facebook and X accounts.",
    category: "media_narratives",
    profile: US_EMBASSY_BAGHDAD_PROFILE,
  },
  {
    name: "Urgent diplomatic security incident",
    title: "Urgent: rocket attack near diplomatic facilities in Baghdad",
    content: "Security forces responded to the blast and reported casualties near the area.",
    category: "security_stability",
    priority: "critical",
    profile: US_EMBASSY_BAGHDAD_PROFILE,
  },
  {
    name: "U.S. incidental budget mention",
    title: "Iraq announces budget and oil revenue figures for the next fiscal year",
    content: "The United States was mentioned in a footnote, but the report focused on salaries, revenue, and public finance.",
    category: "economy_oil_finance",
    priority: "important",
    profile: US_EMBASSY_BAGHDAD_PROFILE,
  },
];

let failures = 0;

for (const example of examples) {
  const actualCategory = classifyArticleCategory(example, example.profile);
  const actualPriority = classifyArticlePriority(example, example.profile);

  if (actualCategory !== example.category) {
    failures++;
    console.error(`[FAIL] ${example.name}: category ${actualCategory}, expected ${example.category}`);
  }
  if (example.priority && actualPriority !== example.priority) {
    failures++;
    console.error(`[FAIL] ${example.name}: priority ${actualPriority}, expected ${example.priority}`);
  }
}

const labelAssertions = [
  {
    name: "U.S. tenant label",
    actual: getArticleCategoryLabel("client_bilateral_relations", US_EMBASSY_BAGHDAD_PROFILE),
    expected: "U.S.-Iraq Relations",
  },
  {
    name: "French tenant label",
    actual: getArticleCategoryLabel("client_bilateral_relations", frenchEmbassyProfile),
    expected: "France-Iraq Relations",
  },
  {
    name: "Missing tenant label",
    actual: getArticleCategoryLabel("client_bilateral_relations", null),
    expected: "Bilateral Relations",
  },
];

for (const assertion of labelAssertions) {
  if (assertion.actual !== assertion.expected) {
    failures++;
    console.error(`[FAIL] ${assertion.name}: label ${assertion.actual}, expected ${assertion.expected}`);
  }
}

if (failures > 0) {
  throw new Error(`${failures} classifier assertion${failures === 1 ? "" : "s"} failed`);
}

console.log(`Article classifier examples passed: ${examples.length}; label assertions passed: ${labelAssertions.length}`);
