import assert from "node:assert/strict";
import {
  evaluateWorkspaceRelevance,
  getDefaultRelevanceStatuses,
  normalizeWorkspaceRelevanceText,
  type ArticleRelevanceStatus,
  type WorkspaceProfile,
} from "../shared/workspace-relevance";

const iraqWorkspace: WorkspaceProfile = {
  name: "Iraq Daily Monitoring",
  scopeMode: "geographic",
  primaryCountries: ["Iraq"],
  subnationalAreas: ["Baghdad", "Basra", "Erbil", "Kurdistan Region"],
  topics: ["government", "security", "oil", "energy", "water"],
  impactPhrases: ["electricity supply", "gas exports", "water releases", "border security"],
};

const saudiWorkspace: WorkspaceProfile = {
  name: "Saudi Country Desk",
  scopeMode: "geographic",
  primaryCountries: ["Saudi Arabia"],
  secondaryCountries: ["Iraq", "Iran", "Gulf"],
  topics: ["security", "oil", "diplomacy"],
};

const globalNewsroom: WorkspaceProfile = {
  name: "Global Newsroom",
  scopeMode: "global",
  globalScope: true,
  contextualPhrases: ["analysis", "background"],
};

const menaWorkspace: WorkspaceProfile = {
  name: "MENA Regional Desk",
  scopeMode: "regional",
  regions: ["MENA", "Middle East", "North Africa"],
  topics: ["tourism", "security", "energy", "migration"],
};

const tourismNgoWorkspace: WorkspaceProfile = {
  name: "MENA Tourism NGO",
  scopeMode: "topic",
  regions: ["MENA", "North Africa"],
  topics: ["tourism", "heritage", "travel"],
  inclusionPhrases: ["tourism campaign", "visitor arrivals"],
};

type Case = {
  name: string;
  profile: WorkspaceProfile;
  article: {
    title: string;
    summary?: string;
    content?: string;
    url?: string;
  };
  status: ArticleRelevanceStatus;
};

const cases: Case[] = [
  {
    name: "Iraq country workspace direct story",
    profile: iraqWorkspace,
    article: {
      title: "Iraq announces new oil export figures for June",
      summary: "The oil ministry said revenue increased.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Iraq materially affected by outside event",
    profile: iraqWorkspace,
    article: {
      title: "Iran reduces electricity supply to Iraq during summer demand surge",
      summary: "The disruption affects Iraqi power generation.",
    },
    status: "material_scope_impact",
  },
  {
    name: "Saudi desk sees Iraq electricity story as context",
    profile: saudiWorkspace,
    article: {
      title: "Iran reduces electricity supply to Iraq during summer demand surge",
      summary: "The disruption affects Iraqi power generation.",
    },
    status: "contextual",
  },
  {
    name: "Iraqi publisher Morocco tourism is not relevant for Iraq",
    profile: iraqWorkspace,
    article: {
      title: "Morocco announces new tourism campaign",
      summary: "The tourism ministry expects visitor arrivals to rise.",
      content: "Subscribe to Iraq regional headlines from this publisher footer.",
    },
    status: "not_relevant",
  },
  {
    name: "Same Morocco article is direct for MENA tourism NGO",
    profile: tourismNgoWorkspace,
    article: {
      title: "Morocco announces new tourism campaign",
      summary: "The tourism ministry expects visitor arrivals to rise.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Same Morocco article is direct for global newsroom",
    profile: globalNewsroom,
    article: {
      title: "Morocco announces new tourism campaign",
      summary: "The tourism ministry expects visitor arrivals to rise.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Regional workspace direct by region and topic",
    profile: menaWorkspace,
    article: {
      title: "Red Sea shipping risks push regional insurance costs higher",
      summary: "Middle East energy and trade analysts warn of spillover.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Short ambiguous item needs review",
    profile: iraqWorkspace,
    article: {
      title: "Official statement",
    },
    status: "needs_review",
  },
  {
    name: "Explicit exclusion wins",
    profile: {
      ...globalNewsroom,
      exclusionPhrases: ["sports results"],
    },
    article: {
      title: "Sports results from Paris friendly match",
    },
    status: "not_relevant",
  },
];

let failures = 0;

for (const testCase of cases) {
  const result = evaluateWorkspaceRelevance(testCase.article, testCase.profile);
  if (result.relevanceStatus !== testCase.status) {
    failures++;
    console.error(`[FAIL] ${testCase.name}: ${result.relevanceStatus}, expected ${testCase.status}`);
    console.error(`       reason=${result.relevanceReason}`);
    console.error(`       signals=${result.relevanceMatchedSignals.join(", ")}`);
  }
  assert.equal(result.relevanceMethod, "deterministic");
  assert.ok(result.relevanceConfidence >= 0 && result.relevanceConfidence <= 100);
  assert.ok(Array.isArray(result.matchedScope));
  assert.ok(Array.isArray(result.supportingSignals));
}

const sameArticle = {
  title: "Morocco announces new tourism campaign",
  summary: "The tourism ministry expects visitor arrivals to rise.",
};
assert.equal(evaluateWorkspaceRelevance(sameArticle, iraqWorkspace).relevanceStatus, "not_relevant");
assert.equal(evaluateWorkspaceRelevance(sameArticle, tourismNgoWorkspace).relevanceStatus, "direct_scope_match");
assert.equal(evaluateWorkspaceRelevance(sameArticle, globalNewsroom).relevanceStatus, "direct_scope_match");

assert.deepEqual(getDefaultRelevanceStatuses(), ["direct_scope_match", "material_scope_impact"]);
assert.deepEqual(getDefaultRelevanceStatuses({ includeContextual: true }), ["direct_scope_match", "material_scope_impact", "contextual"]);
assert.equal(normalizeWorkspaceRelevanceText("U.S.-Iraq Relations"), "u.s. iraq relations");

if (failures > 0) {
  throw new Error(`${failures} workspace relevance test(s) failed`);
}

console.log("Workspace relevance tests passed");
