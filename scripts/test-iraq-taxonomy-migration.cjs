require("tsx/cjs");

const assert = require("node:assert/strict");
const {
  BACKUP_WARNING,
  applyPlanToMockState,
  buildPlanFromRows,
  compareIntegritySnapshots,
  createMockIntegritySnapshot,
  planReport,
  validatePlan,
} = require("./iraq-taxonomy-migration-lib.cjs");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const baseState = {
  articles: [
    {
      id: 10,
      clientId: 1,
      sourceId: 100,
      title: "Parliament votes on new election law",
      summary: "Council of Representatives committee members discussed the bill.",
      content: "The political blocs negotiated before the vote.",
      contentClean: "The political blocs negotiated before the vote.",
      url: "https://example.com/10",
      category: "political",
      priority: "routine",
      workflowStatus: "in_review",
      manualTags: ["lead"],
    },
    {
      id: 11,
      clientId: 1,
      sourceId: 101,
      title: "U.S. ambassador meets Iraqi prime minister",
      summary: "The meeting focused on United States cooperation with Iraq.",
      content: "The U.S. Embassy discussed bilateral programs.",
      contentClean: "The U.S. Embassy discussed bilateral programs.",
      url: "https://example.com/11",
      category: "us_iraq_international",
      priority: "important",
      workflowStatus: "new",
      manualTags: [],
    },
    {
      id: 12,
      clientId: 2,
      sourceId: 102,
      title: "Short",
      summary: "",
      content: "",
      contentClean: "",
      url: "https://example.com/12",
      category: "general",
      priority: "unknown",
      workflowStatus: "new",
      manualTags: ["keep"],
    },
  ],
  relationships: {
    bookmarks: [{ id: 1, articleId: 10 }, { id: 2, articleId: 11 }],
    articleTranslations: [{ id: 7, articleId: 11, targetLanguage: "fr" }],
    reportBasket: [{ id: 9, itemType: "article", itemRefId: 10 }],
    comments: [{ id: 5, targetType: "article", targetId: 12 }],
    annotations: [{ id: 6, targetType: "article", targetId: 10 }],
    tasks: [{ id: 8, relatedTargetType: "article", relatedTargetId: 11 }],
  },
};

const dryRunState = clone(baseState);
const dryRunPlan = buildPlanFromRows(dryRunState.articles);
const dryRunBefore = createMockIntegritySnapshot(dryRunState);
applyPlanToMockState(dryRunState, dryRunPlan, { apply: false });
assert.deepEqual(dryRunState, baseState, "dry-run must not mutate article or relationship data");
assert.deepEqual(createMockIntegritySnapshot(dryRunState), dryRunBefore, "dry-run snapshot must remain unchanged");

const applyState = clone(baseState);
const before = createMockIntegritySnapshot(applyState);
const plan = buildPlanFromRows(applyState.articles);
const report = planReport(applyState.articles, plan);
assert.equal(report.reviewedArticleCount, 3);
assert.equal(report.updatesRequired, 3);
assert.equal(report.uncertainCount, 1);
assert.equal(report.endingOtherCount, 1);
assert.equal(report.insufficientTitleContentCount, 1);
assert.equal(report.uncertainSamples.length, 1);
assert.equal(report.uncertainSamples[0].id, 12);

assert.throws(
  () => applyPlanToMockState(clone(baseState), plan, { apply: true }),
  new RegExp(BACKUP_WARNING),
  "apply without confirmed backup must abort before mutation",
);

applyPlanToMockState(applyState, plan, { apply: true, confirmBackup: true });
const after = createMockIntegritySnapshot(applyState);
const integrity = compareIntegritySnapshots(before, after);
assert.equal(integrity.passed, true, "article IDs/counts, immutable fields, and relationships must be unchanged");

const article10 = applyState.articles.find((article) => article.id === 10);
const article11 = applyState.articles.find((article) => article.id === 11);
const article12 = applyState.articles.find((article) => article.id === 12);
assert.equal(article10.category, "parliament_politics");
assert.equal(article10.priority, "routine");
assert.equal(article10.clientId, 1);
assert.equal(article10.sourceId, 100);
assert.deepEqual(article10.manualTags, ["lead"]);
assert.equal(article10.workflowStatus, "in_review");
assert.equal(article11.category, "client_bilateral_relations");
assert.equal(article11.priority, "important");
assert.equal(article12.category, "other");
assert.equal(article12.priority, "routine");
assert.equal(article12.clientId, 2);
assert.deepEqual(article12.manualTags, ["keep"], "unclear records must be preserved without overwriting manual tags");

const secondPlan = buildPlanFromRows(applyState.articles);
assert.equal(secondPlan.filter((row) => row.requiresUpdate).length, 0, "second migration pass must be idempotent");

assert.throws(
  () => validatePlan([{ id: 99, nextCategory: "bad_category", nextPriority: "routine" }]),
  /Invalid category/,
  "invalid categories cannot be written",
);
assert.throws(
  () => validatePlan([{ id: 99, nextCategory: "other", nextPriority: "bad_priority" }]),
  /Invalid priority/,
  "invalid priorities cannot be written",
);

assert.deepEqual(applyState.relationships, baseState.relationships, "bookmarks, translations, report basket, comments, annotations, and tasks must stay linked");

console.log("Iraq taxonomy migration safety tests passed");
