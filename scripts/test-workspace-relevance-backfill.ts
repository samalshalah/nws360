import assert from "node:assert/strict";
import crypto from "node:crypto";
import { evaluateWorkspaceRelevance, type WorkspaceProfile } from "../shared/workspace-relevance";

type MockArticle = {
  id: number;
  clientId: number;
  sourceId: number;
  title: string;
  content: string;
  category: string;
  priority: string;
  workflowStatus: string;
  manualTags: string[];
  relevanceStatus: string | null;
  relevanceMethod: string | null;
};

const iraqWorkspace: WorkspaceProfile = {
  name: "Iraq Daily Monitoring",
  scopeMode: "geographic",
  primaryCountries: ["Iraq"],
  topics: ["government", "security", "oil", "energy"],
  impactPhrases: ["electricity supply", "gas exports"],
};

const articles: MockArticle[] = [
  {
    id: 10,
    clientId: 1,
    sourceId: 5,
    title: "Iraqi Parliament approves the federal budget",
    content: "Council of Representatives members voted in Baghdad.",
    category: "parliament_politics",
    priority: "important",
    workflowStatus: "for_report",
    manualTags: ["budget"],
    relevanceStatus: null,
    relevanceMethod: "migration",
  },
  {
    id: 11,
    clientId: 1,
    sourceId: 5,
    title: "Morocco holds national elections",
    content: "The story is domestic and does not discuss the workspace scope.",
    category: "other",
    priority: "routine",
    workflowStatus: "new",
    manualTags: [],
    relevanceStatus: null,
    relevanceMethod: "migration",
  },
  {
    id: 12,
    clientId: 1,
    sourceId: 6,
    title: "Iran reduces gas exports, causing electricity shortages in Iraq",
    content: "The energy disruption affects Iraqi power supply.",
    category: "development_services",
    priority: "important",
    workflowStatus: "new",
    manualTags: ["energy"],
    relevanceStatus: "material_scope_impact",
    relevanceMethod: "manual",
  },
];

function checksumIds(rows: MockArticle[]) {
  return crypto.createHash("sha256").update(rows.map((row) => row.id).join(",")).digest("hex");
}

function simulateBackfill(rows: MockArticle[]) {
  return rows.map((row) => {
    if (row.relevanceMethod === "manual") return { ...row };
    const relevance = evaluateWorkspaceRelevance({
      title: row.title,
      content: row.content,
    }, iraqWorkspace);
    return {
      ...row,
      relevanceStatus: relevance.relevanceStatus,
      relevanceMethod: relevance.relevanceMethod,
    };
  });
}

const beforeChecksum = checksumIds(articles);
const after = simulateBackfill(articles);
const secondRun = simulateBackfill(after);

assert.equal(after.length, articles.length);
assert.equal(checksumIds(after), beforeChecksum);
assert.equal(after[0].relevanceStatus, "direct_scope_match");
assert.equal(after[1].relevanceStatus, "not_relevant");
assert.equal(after[2].relevanceStatus, "material_scope_impact");
assert.equal(after[2].relevanceMethod, "manual");

for (let index = 0; index < articles.length; index += 1) {
  assert.equal(after[index].id, articles[index].id);
  assert.equal(after[index].clientId, articles[index].clientId);
  assert.equal(after[index].sourceId, articles[index].sourceId);
  assert.equal(after[index].category, articles[index].category);
  assert.equal(after[index].priority, articles[index].priority);
  assert.equal(after[index].workflowStatus, articles[index].workflowStatus);
  assert.deepEqual(after[index].manualTags, articles[index].manualTags);
}

assert.deepEqual(secondRun, after);

console.log("Workspace relevance backfill safety tests passed");
