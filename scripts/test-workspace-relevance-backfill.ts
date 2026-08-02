import assert from "node:assert/strict";
import crypto from "node:crypto";
import { evaluateWorkspaceRelevance, type ArticleRelevanceStatus, type WorkspaceProfile } from "../shared/workspace-relevance";

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
};

type MockRelevance = {
  workspaceId: number;
  articleId: number;
  clientId: number;
  relevanceStatus: ArticleRelevanceStatus;
  confidence: number;
  evaluationMethod: "deterministic" | "manual";
  manualOverride: boolean;
  shortReason: string;
};

type MockHistory = {
  workspaceId: number;
  articleId: number;
  previousStatus: ArticleRelevanceStatus | null;
  newStatus: ArticleRelevanceStatus;
  evaluationMethod: string;
};

const iraqWorkspace: WorkspaceProfile = {
  id: 1,
  clientId: 1,
  name: "Iraq Daily Monitoring",
  scopeMode: "single_country",
  primaryCountryCodes: ["IQ"],
  topics: ["government", "security", "oil", "energy", "budget"],
  impactTerms: ["electricity supply", "gas exports"],
};

const tourismWorkspace: WorkspaceProfile = {
  id: 2,
  clientId: 1,
  name: "MENA Tourism Monitor",
  scopeMode: "topic_only",
  regionCodes: ["MENA"],
  topics: ["tourism", "travel"],
  inclusionTerms: ["tourism campaign"],
};

const otherTenantWorkspace: WorkspaceProfile = {
  id: 3,
  clientId: 2,
  name: "Other Tenant Iraq Desk",
  scopeMode: "single_country",
  primaryCountryCodes: ["IQ"],
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
  },
  {
    id: 11,
    clientId: 1,
    sourceId: 5,
    title: "Morocco announces new tourism campaign",
    content: "The tourism ministry expects visitor arrivals to rise.",
    category: "other",
    priority: "routine",
    workflowStatus: "new",
    manualTags: [],
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
  },
  {
    id: 13,
    clientId: 2,
    sourceId: 8,
    title: "Iraq signs a water agreement",
    content: "This belongs to another tenant.",
    category: "government",
    priority: "routine",
    workflowStatus: "new",
    manualTags: [],
  },
];

const existing: MockRelevance[] = [
  {
    workspaceId: 1,
    articleId: 12,
    clientId: 1,
    relevanceStatus: "material_scope_impact",
    confidence: 100,
    evaluationMethod: "manual",
    manualOverride: true,
    shortReason: "Analyst confirmed material impact.",
  },
];

function checksumIds(rows: MockArticle[]) {
  return crypto.createHash("sha256").update(rows.map((row) => row.id).join(",")).digest("hex");
}

function simulateBackfill(workspace: WorkspaceProfile, rows: MockArticle[], relevanceRows: MockRelevance[]) {
  const history: MockHistory[] = [];
  const scopedRows = rows.filter((row) => row.clientId === workspace.clientId);
  const next = [...relevanceRows];
  for (const row of scopedRows) {
    const existingIndex = next.findIndex((entry) => entry.workspaceId === workspace.id && entry.articleId === row.id);
    const current = existingIndex >= 0 ? next[existingIndex] : null;
    if (current?.manualOverride) continue;

    const relevance = evaluateWorkspaceRelevance({ title: row.title, content: row.content }, workspace);
    const proposed: MockRelevance = {
      workspaceId: Number(workspace.id),
      articleId: row.id,
      clientId: row.clientId,
      relevanceStatus: relevance.relevanceStatus,
      confidence: relevance.confidence,
      evaluationMethod: "deterministic",
      manualOverride: false,
      shortReason: relevance.shortReason,
    };

    if (
      current?.relevanceStatus === proposed.relevanceStatus &&
      current?.confidence === proposed.confidence &&
      current?.evaluationMethod === proposed.evaluationMethod
    ) {
      continue;
    }

    history.push({
      workspaceId: proposed.workspaceId,
      articleId: proposed.articleId,
      previousStatus: current?.relevanceStatus ?? null,
      newStatus: proposed.relevanceStatus,
      evaluationMethod: proposed.evaluationMethod,
    });
    if (existingIndex >= 0) next[existingIndex] = proposed;
    else next.push(proposed);
  }
  return { relevanceRows: next, history };
}

const beforeArticleChecksum = checksumIds(articles);
const iraqRun = simulateBackfill(iraqWorkspace, articles, existing);
const secondIraqRun = simulateBackfill(iraqWorkspace, articles, iraqRun.relevanceRows);
const tourismRun = simulateBackfill(tourismWorkspace, articles, iraqRun.relevanceRows);
const otherTenantRun = simulateBackfill(otherTenantWorkspace, articles, tourismRun.relevanceRows);

assert.equal(checksumIds(articles), beforeArticleChecksum, "backfill must not rewrite article rows");
assert.equal(iraqRun.relevanceRows.find((row) => row.articleId === 10 && row.workspaceId === 1)?.relevanceStatus, "direct_scope_match");
assert.equal(iraqRun.relevanceRows.find((row) => row.articleId === 11 && row.workspaceId === 1)?.relevanceStatus, "not_relevant");
assert.equal(iraqRun.relevanceRows.find((row) => row.articleId === 12 && row.workspaceId === 1)?.relevanceStatus, "material_scope_impact");
assert.equal(iraqRun.relevanceRows.find((row) => row.articleId === 12 && row.workspaceId === 1)?.evaluationMethod, "manual");
assert.deepEqual(secondIraqRun.relevanceRows, iraqRun.relevanceRows, "backfill must be idempotent");
assert.equal(secondIraqRun.history.length, 0, "idempotent run must not create history");
assert.equal(tourismRun.relevanceRows.find((row) => row.articleId === 11 && row.workspaceId === 2)?.relevanceStatus, "direct_scope_match");
assert.equal(otherTenantRun.relevanceRows.some((row) => row.workspaceId === 3 && row.clientId !== 2), false, "workspace backfill must stay inside tenant boundary");
assert.equal(iraqRun.history.length, 2, "history tracks automatic relevance changes");

for (let index = 0; index < articles.length; index += 1) {
  assert.equal(articles[index].id, [10, 11, 12, 13][index]);
  assert.equal(articles[index].category, ["parliament_politics", "other", "development_services", "government"][index]);
  assert.equal(articles[index].workflowStatus, ["for_report", "new", "new", "new"][index]);
}

console.log("Workspace relevance backfill safety tests passed");
