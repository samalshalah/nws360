import { classifyArticleCategory, classifyArticlePriority } from "../shared/article-classifier";
import type { ArticleCategoryCode, ArticlePriorityCode } from "../shared/article-taxonomy";

type Example = {
  name: string;
  title: string;
  content?: string;
  category: ArticleCategoryCode;
  priority?: ArticlePriorityCode;
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
    name: "Parliament budget amendment",
    title: "Parliament votes on budget amendment after political bloc negotiations",
    content: "Lawmakers said the Council of Representatives will hold another session this week.",
    category: "parliament_politics",
    priority: "important",
  },
  {
    name: "Security operation",
    title: "Iraqi security forces launch counterterrorism operation in Diyala",
    content: "The army said the operation targeted ISIS cells and armed groups.",
    category: "security_stability",
  },
  {
    name: "Oil and currency",
    title: "Oil exports rise as central bank moves to stabilize the dinar exchange rate",
    content: "Public finance officials linked revenue expectations to crude prices and banking reforms.",
    category: "economy_oil_finance",
    priority: "important",
  },
  {
    name: "Services project",
    title: "Electricity and water infrastructure project opens in Basra",
    content: "The municipality said the public services program will improve local service delivery.",
    category: "development_services",
  },
  {
    name: "Corruption investigation",
    title: "Integrity Commission opens corruption investigation into senior official",
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
    title: "NGO publishes human rights report on displaced families in Nineveh",
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
    name: "U.S.-Iraq bilateral meeting",
    title: "U.S. Embassy and Iraqi foreign minister hold bilateral meeting in Baghdad",
    content: "The ambassador discussed sanctions, regional diplomacy, and Washington's partnership with Iraq.",
    category: "us_iraq_international",
    priority: "important",
  },
  {
    name: "Media narrative",
    title: "Coordinated social media hashtag campaign spreads disinformation about oil talks",
    content: "Analysts said the viral narrative moved across Facebook and X accounts.",
    category: "media_narratives",
  },
  {
    name: "Urgent security event",
    title: "Breaking: explosion kills two during security incident near Baghdad",
    content: "Police reported a blast and emergency response in the area.",
    category: "security_stability",
    priority: "critical",
  },
];

let failures = 0;

for (const example of examples) {
  const actualCategory = classifyArticleCategory(example);
  const actualPriority = classifyArticlePriority(example);

  if (actualCategory !== example.category) {
    failures++;
    console.error(`[FAIL] ${example.name}: category ${actualCategory}, expected ${example.category}`);
  }
  if (example.priority && actualPriority !== example.priority) {
    failures++;
    console.error(`[FAIL] ${example.name}: priority ${actualPriority}, expected ${example.priority}`);
  }
}

if (failures > 0) {
  throw new Error(`${failures} classifier assertion${failures === 1 ? "" : "s"} failed`);
}

console.log(`Article classifier examples passed: ${examples.length}`);
