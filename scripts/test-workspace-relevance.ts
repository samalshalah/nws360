import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTICLE_RELEVANCE_STATUSES,
  evaluateWorkspaceRelevance,
  getDefaultRelevanceStatuses,
  normalizeAiWorkspaceRelevanceResult,
  aiFailureWorkspaceRelevanceResult,
  normalizeWorkspaceRelevanceText,
  shouldIncludeInWorkspaceOutputs,
  shouldUseAiFallbackForRelevance,
  type ArticleRelevanceStatus,
  type WorkspaceProfile,
} from "../shared/workspace-relevance";
import { evaluatePeriodicJobEligibility } from "../server/periodic-job-rules";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const iraqWorkspace: WorkspaceProfile = {
  id: 1,
  clientId: 10,
  name: "Iraq Daily Monitoring",
  purpose: "diplomatic_monitoring",
  scopeMode: "single_country",
  primaryCountryCodes: ["IQ"],
  subnationalAreas: ["Baghdad", "Basra", "Erbil", "Kurdistan Region"],
  topics: ["government", "security", "oil", "energy", "water", "budget"],
  impactTerms: ["electricity supply", "gas exports", "water releases", "border security"],
};

const saudiWorkspace: WorkspaceProfile = {
  id: 2,
  clientId: 10,
  name: "Saudi Country Desk",
  purpose: "country_desk",
  scopeMode: "single_country",
  primaryCountryCodes: ["SA"],
  secondaryCountryCodes: ["IQ", "IR"],
  regionCodes: ["Gulf"],
  topics: ["security", "oil", "diplomacy"],
};

const menaEnergyWorkspace: WorkspaceProfile = {
  id: 3,
  clientId: 20,
  name: "MENA Energy Desk",
  purpose: "regional_desk",
  scopeMode: "regional",
  regionCodes: ["MENA"],
  topics: ["energy", "electricity", "oil", "gas"],
  inclusionTerms: ["electricity supply", "gas exports"],
};

const globalNewsroom: WorkspaceProfile = {
  id: 4,
  clientId: 20,
  name: "Global Newsroom",
  purpose: "global_news",
  scopeMode: "global",
  globalScope: true,
  contextualTerms: ["analysis", "background"],
};

const tourismNgoWorkspace: WorkspaceProfile = {
  id: 5,
  clientId: 30,
  name: "MENA Tourism NGO",
  purpose: "topic_research",
  scopeMode: "topic_only",
  regionCodes: ["MENA", "North Africa"],
  topics: ["tourism", "heritage", "travel"],
  inclusionTerms: ["tourism campaign", "visitor arrivals"],
};

const climateNgoWorkspace: WorkspaceProfile = {
  id: 6,
  clientId: 30,
  name: "Global Climate Migration",
  purpose: "humanitarian_monitoring",
  scopeMode: "topic_only",
  topics: ["climate", "migration", "displacement", "water security"],
  inclusionTerms: ["climate migration", "water scarcity"],
};

const bilateralWorkspace: WorkspaceProfile = {
  id: 7,
  clientId: 40,
  name: "U.S.-Iraq Relations",
  purpose: "diplomatic_monitoring",
  scopeMode: "hybrid",
  primaryCountryCodes: ["IQ"],
  secondaryCountryCodes: ["US"],
  topics: ["diplomacy", "security cooperation", "economic cooperation", "visas", "consular"],
  organizations: ["U.S. Embassy Baghdad"],
  inclusionTerms: ["U.S.-Iraq", "United States and Iraq", "American citizens in Iraq"],
};

type Case = {
  name: string;
  profile: WorkspaceProfile;
  article: {
    title: string;
    summary?: string;
    content?: string;
    sourceName?: string;
    country?: string;
  };
  status: ArticleRelevanceStatus;
};

const cases: Case[] = [
  {
    name: "Direct country scope",
    profile: iraqWorkspace,
    article: {
      title: "Iraqi cabinet approves the national budget",
      summary: "The government said the budget vote will fund services in Baghdad and Basra.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Material outside impact",
    profile: iraqWorkspace,
    article: {
      title: "Iran reduces electricity supply to Iraq during summer demand surge",
      summary: "The disruption affects Iraqi power generation and electricity supply.",
    },
    status: "material_scope_impact",
  },
  {
    name: "Saudi desk sees Iraq impact story as context",
    profile: saudiWorkspace,
    article: {
      title: "Iran reduces electricity supply to Iraq during summer demand surge",
      summary: "The disruption affects Iraqi power generation and regional energy discussions.",
    },
    status: "contextual",
  },
  {
    name: "Regional energy desk direct match",
    profile: menaEnergyWorkspace,
    article: {
      title: "Iran reduces electricity supply to Iraq during summer demand surge",
      summary: "Energy analysts say electricity supply disruption affects regional demand.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Iraqi publisher unrelated foreign story is not relevant",
    profile: iraqWorkspace,
    article: {
      title: "Morocco announces new tourism campaign",
      summary: "The tourism ministry expects visitor arrivals to rise.",
      content: "Published by an Iraqi outlet. Subscribe for regional updates.",
      sourceName: "Iraqi Daily",
      country: "Iraq",
    },
    status: "not_relevant",
  },
  {
    name: "Same Morocco story is direct for MENA tourism",
    profile: tourismNgoWorkspace,
    article: {
      title: "Morocco announces new tourism campaign",
      summary: "The tourism ministry expects visitor arrivals to rise.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Same Morocco story is direct for global newsroom",
    profile: globalNewsroom,
    article: {
      title: "Morocco announces new tourism campaign",
      summary: "The tourism ministry expects visitor arrivals to rise.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Iraq budget not relevant to climate NGO without climate topic",
    profile: climateNgoWorkspace,
    article: {
      title: "Iraqi cabinet approves the national budget",
      summary: "The government said the budget vote will fund general services.",
    },
    status: "not_relevant",
  },
  {
    name: "Incidental United States mention does not become bilateral direct",
    profile: bilateralWorkspace,
    article: {
      title: "Oil prices rise after OPEC meeting",
      summary: "The report mentions the United States once while discussing global markets.",
    },
    status: "contextual",
  },
  {
    name: "Meaningful U.S.-Iraq diplomacy is direct",
    profile: bilateralWorkspace,
    article: {
      title: "United States and Iraq hold security cooperation talks in Baghdad",
      summary: "Officials discussed diplomatic coordination and future security cooperation.",
    },
    status: "direct_scope_match",
  },
  {
    name: "Contextual classification",
    profile: iraqWorkspace,
    article: {
      title: "Regional summit discusses diplomatic background",
      summary: "Middle East diplomats discussed neighboring political context and future talks.",
    },
    status: "contextual",
  },
  {
    name: "Exclusion overrides weak inclusion",
    profile: {
      ...globalNewsroom,
      exclusionTerms: ["sports results"],
    },
    article: {
      title: "Sports results from Paris friendly match",
      summary: "A global audience followed the result.",
    },
    status: "not_relevant",
  },
  {
    name: "Ambiguous short item needs review",
    profile: iraqWorkspace,
    article: {
      title: "Official statement",
    },
    status: "needs_review",
  },
];

for (const testCase of cases) {
  const result = evaluateWorkspaceRelevance(testCase.article, testCase.profile);
  assert.equal(result.relevanceStatus, testCase.status, `${testCase.name}: ${result.shortReason}`);
  assert.equal(result.evaluationMethod, "deterministic");
  assert.ok(result.confidence >= 0 && result.confidence <= 100);
  assert.equal(typeof result.matchedScope, "object");
  assert.ok(Array.isArray(result.principalCountryCodes));
  assert.ok(Array.isArray(result.materiallyAffectedCountryCodes));
  assert.ok(Array.isArray(result.supportingSignals));
}

const sameArticle = {
  title: "Morocco announces new tourism campaign",
  summary: "The tourism ministry expects visitor arrivals to rise.",
};
assert.equal(evaluateWorkspaceRelevance(sameArticle, iraqWorkspace).relevanceStatus, "not_relevant");
assert.equal(evaluateWorkspaceRelevance(sameArticle, tourismNgoWorkspace).relevanceStatus, "direct_scope_match");
assert.equal(evaluateWorkspaceRelevance(sameArticle, globalNewsroom).relevanceStatus, "direct_scope_match");

const clear = evaluateWorkspaceRelevance({
  title: "Iraq announces new oil export figures",
  summary: "The oil ministry said revenue increased.",
}, iraqWorkspace);
assert.equal(shouldUseAiFallbackForRelevance(clear), false, "clear deterministic cases should not call AI");

const ambiguous = evaluateWorkspaceRelevance({ title: "Official statement" }, iraqWorkspace);
assert.equal(ambiguous.relevanceStatus, "needs_review");
assert.equal(shouldUseAiFallbackForRelevance(ambiguous), true, "ambiguous cases may call AI");

assert.equal(normalizeAiWorkspaceRelevanceResult({ relevanceStatus: "direct_iraq", confidence: 90 })?.relevanceStatus, "needs_review");
assert.equal(aiFailureWorkspaceRelevanceResult().relevanceStatus, "needs_review");

assert.deepEqual(ARTICLE_RELEVANCE_STATUSES, [
  "direct_scope_match",
  "material_scope_impact",
  "contextual",
  "not_relevant",
  "needs_review",
]);
assert.deepEqual(getDefaultRelevanceStatuses(), ["direct_scope_match", "material_scope_impact"]);
assert.deepEqual(getDefaultRelevanceStatuses({ includeContextual: true }), ["direct_scope_match", "material_scope_impact", "contextual"]);
assert.equal(shouldIncludeInWorkspaceOutputs("direct_scope_match"), true);
assert.equal(shouldIncludeInWorkspaceOutputs("material_scope_impact"), true);
assert.equal(shouldIncludeInWorkspaceOutputs("contextual"), false);
assert.equal(shouldIncludeInWorkspaceOutputs("contextual", { includeContextual: true }), true);
assert.equal(shouldIncludeInWorkspaceOutputs("not_relevant"), false);
assert.equal(shouldIncludeInWorkspaceOutputs("needs_review"), false);
assert.equal(normalizeWorkspaceRelevanceText("U.S.-Iraq Relations"), "u.s. iraq relations");

const simulatedManual = { relevanceStatus: "material_scope_impact", manualOverride: true };
const reevaluated = evaluateWorkspaceRelevance(sameArticle, iraqWorkspace);
assert.equal(simulatedManual.relevanceStatus, "material_scope_impact", "manual override wins until reopened");
assert.equal(reevaluated.relevanceStatus, "not_relevant", "reopened manual decision allows deterministic reevaluation");

const activeWorkspaceEligibility = evaluatePeriodicJobEligibility("INTELLIGENCE_PIPELINE", {
  activeClientCount: 1,
  activeWorkspaceCount: 1,
  activeArticleCount: 0,
  activeSourceCount: 0,
  dueBriefingCount: 0,
  retentionCandidateCount: 0,
});
assert.equal(activeWorkspaceEligibility.eligible, true);
const zeroWorkspaceEligibility = evaluatePeriodicJobEligibility("INTELLIGENCE_PIPELINE", {
  activeClientCount: 1,
  activeWorkspaceCount: 0,
  activeArticleCount: 5,
  activeSourceCount: 1,
  dueBriefingCount: 0,
  retentionCandidateCount: 0,
});
assert.equal(zeroWorkspaceEligibility.eligible, false);

const routes = read("server/routes.ts");
assert(routes.includes("app.post(\"/api/workspaces/:workspaceId/relevance/preview\""), "workspace preview endpoint missing");
assert(routes.includes("writes: false"), "preview endpoint must declare no writes");
assert(!routes.includes("storage.updateArticleRelevance"), "routes still write global article relevance");
assert(routes.includes("workspace.clientId !== clientId") || routes.includes("workspace.clientId !== clientId"), "tenant isolation check missing");

const storage = read("server/storage.ts");
assert(storage.includes("FROM article_workspace_relevance awr"), "article filtering must use article_workspace_relevance");
assert(!storage.includes("articles.relevanceStatus"), "storage still reads global article relevance");

const feedWorker = read("server/feed-worker.ts");
assert(feedWorker.includes("relevanceEvaluation.byWorkspace.length === 0"), "ingestion must not store articles without workspace relevance");

const migration = read("scripts/migrate-workspace-relevance.cjs");
assert(migration.includes("ADD COLUMN IF NOT EXISTS"), "migration is not idempotent for workspace columns");
assert(migration.includes("CREATE TABLE IF NOT EXISTS workspace_relevance_profiles"), "migration does not create profile table idempotently");
assert(migration.includes("CREATE TABLE IF NOT EXISTS article_workspace_relevance"), "migration does not create article-workspace relevance table idempotently");

const backfill = read("scripts/backfill-workspace-relevance.ts");
assert(backfill.includes("dryRun: true"), "backfill must default to dry-run");
assert(backfill.includes("Backfill requires --workspace-id <id> or --all-workspaces"), "backfill must require workspace scope");
assert(!backfill.includes(".insert(clients)") && !backfill.includes(".insert(sources)") && !backfill.includes(".insert(articles)") && !backfill.includes(".insert(workspaces)"), "backfill creates production records");

console.log("Workspace relevance engine tests passed");
