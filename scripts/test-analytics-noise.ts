import assert from "node:assert/strict";
import { isGenericAnalyticsTerm } from "../server/analytics-noise";

const genericTerms = [
  "images",
  "Getty",
  "Getty Images",
  "subscribers",
  "AFP",
  "CNN",
  "analysis",
  "file",
  "file photo",
  "live updates",
  "news analysis",
  "ago",
  "CNN Underscored",
  "investigates",
];

for (const term of genericTerms) {
  assert.equal(isGenericAnalyticsTerm(term), true, `${term} should be filtered`);
}

const signalTerms = [
  "oil",
  "iraq",
  "Iraqi oil",
  "Australia",
  "Saudi Arabia",
  "AI",
  "climate change",
];

for (const term of signalTerms) {
  assert.equal(isGenericAnalyticsTerm(term), false, `${term} should remain available`);
}

console.log("Analytics noise filter tests passed");
