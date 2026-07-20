import assert from "node:assert/strict";
import {
  filterSourceItems,
  normalizeSourceFilterConfig,
  sourceFilterDecision,
} from "../shared/source-filter";

const article = {
  title: "Iraq raises oil production",
  content: "OPEC members discuss energy policy.",
  url: "https://example.com/business/iraq-oil",
  imageTitle: "Oil field in Basra",
};

const whitelist = normalizeSourceFilterConfig({
  whitelist: { enabled: true, keywords: ["iraq"], fields: ["title"] },
});
assert.equal(sourceFilterDecision(article, whitelist).accepted, true);
assert.equal(sourceFilterDecision({ ...article, title: "Regional markets" }, whitelist).accepted, false);

const blacklist = normalizeSourceFilterConfig({
  blacklist: { enabled: true, keywords: ["opinion"], fields: ["link"] },
});
assert.equal(sourceFilterDecision({ ...article, url: "https://example.com/opinion/oil" }, blacklist).accepted, false);

const imageFilter = normalizeSourceFilterConfig({
  whitelist: { enabled: true, keywords: ["basra"], fields: ["imageTitle"] },
});
assert.equal(sourceFilterDecision(article, imageFilter).accepted, true);

const precedence = normalizeSourceFilterConfig({
  whitelist: { enabled: true, keywords: ["oil"], fields: ["title"] },
  blacklist: { enabled: true, keywords: ["iraq"], fields: ["title"] },
});
assert.deepEqual(sourceFilterDecision(article, precedence), { accepted: false, reason: "blacklist" });
assert.equal(filterSourceItems([article, { ...article, title: "Sports results" }], whitelist).length, 1);

console.log("Source filter tests passed");
