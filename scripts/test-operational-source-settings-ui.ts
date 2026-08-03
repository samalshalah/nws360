import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_OPERATIONAL_SETTINGS,
  addKeywordsToRule,
  canSaveOperationalSettings,
  normalizeOperationalPreview,
  normalizeOperationalSettingsRead,
  settingsSnapshot,
} from "../client/src/lib/operational-source-settings";

const root = process.cwd();

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(contents: string, needle: string, label: string) {
  assert.ok(contents.includes(needle), `${label}: missing ${needle}`);
}

function assertExcludes(contents: string, needle: string, label: string) {
  assert.equal(contents.includes(needle), false, `${label}: unexpected ${needle}`);
}

const page = source("client/src/pages/WorkspaceSourceAssignments.tsx");
const dialog = source("client/src/components/sources/OperationalSourceSettingsDialog.tsx");
const helper = source("client/src/lib/operational-source-settings.ts");

assertIncludes(page, "Operational Settings", "source assignment action exists");
assertIncludes(page, "button-operational-settings-", "source assignment action has stable test id");
assertIncludes(page, "isAdmin && isPlatformScope", "source assignment action is platform-admin gated");
assertIncludes(page, "sourceLinkedToAssignment", "source assignment action requires a linked source");
assertIncludes(page, "OperationalSourceSettingsDialog", "source assignment page opens settings dialog");

assertIncludes(dialog, 'apiRequest("GET", settingsPath)', "settings GET route is used");
assertIncludes(dialog, 'apiRequest("POST", `${settingsPath}/preview`, { settings })', "preview POST route is used");
assertIncludes(dialog, 'apiRequest("PATCH", settingsPath', "update PATCH route is used");
assertIncludes(dialog, "previewExpiresAt: preview.previewExpiresAt", "save sends the exact preview expiry");
assertIncludes(dialog, "button-save-operational-settings", "save button exists");
assertIncludes(dialog, "disabled={!effectiveCanSave}", "save remains disabled until save eligibility passes");
assertIncludes(dialog, "setPreviewSettingsSnapshot(null)", "field changes clear preview fingerprint");
assertIncludes(dialog, "setPreviewSettingsForSave(null)", "field changes clear preview settings");
assertIncludes(dialog, "onError: (error) =>", "preview errors are handled");
assertIncludes(dialog, "setPreview(null)", "preview failure clears preview state");
assertIncludes(dialog, "The source, assignment, channel, profile, or settings changed after preview. Run Preview again before saving.", "stale fingerprint response requires re-preview");
assertIncludes(dialog, "The source settings preview expired. Run Preview again before saving.", "expired preview response requires re-preview");
assertIncludes(dialog, "Linked assignment tests will become stale", "confirmation mentions stale tests");
assertIncludes(dialog, "assignments will remain disabled", "confirmation mentions disabled assignments");
assertIncludes(dialog, "sources will remain inactive", "confirmation mentions inactive sources");
assertIncludes(dialog, "no ingestion starts automatically", "confirmation mentions no automatic ingestion");
assertIncludes(dialog, "I understand this preview does not currently meet all content-quality thresholds.", "low-quality preview requires acknowledgement");
assertIncludes(dialog, 'target="_blank"', "external preview links open in a new tab");
assertIncludes(dialog, 'rel="noreferrer noopener"', "external preview links use safe rel attributes");
assertExcludes(dialog, "dangerouslySetInnerHTML", "preview rendering never injects source HTML");
assertExcludes(dialog, "test-connectivity", "settings dialog does not call connectivity tests");
assertExcludes(dialog, "test-relevance", "settings dialog does not call relevance tests");
assertExcludes(dialog, "test-full", "settings dialog does not call full tests");
assertExcludes(dialog, "/status", "settings dialog does not expose activation/status endpoint");
assertExcludes(dialog, "Activate", "settings dialog does not expose activation control");
assertIncludes(helper, "normalizeOperationalPreview", "defensive preview normalization exists");
assertIncludes(helper, "previewExpiresAt", "preview expiry is normalized");
assertIncludes(helper, "passesMinimumSample", "backend sample-threshold pass flag is normalized");
assertIncludes(helper, "passesRelevance", "backend relevance-threshold pass flag is normalized");
assertIncludes(helper, "passesNoise", "backend noise-threshold pass flag is normalized");
assertIncludes(helper, "normalizeOperationalSettingsRead", "defensive settings normalization exists");

const arabicKeywords = addKeywordsToRule(
  { enabled: true, keywords: ["بغداد"], fields: ["title", "description"] },
  " بغداد, هەولێر, Baghdad ",
);
assert.deepEqual(arabicKeywords.keywords, ["بغداد", "هەولێر", "Baghdad"], "Arabic, Kurdish and English keyword display text is preserved");

const duplicateKeywords = addKeywordsToRule(
  { enabled: true, keywords: ["Baghdad"], fields: ["title"] },
  "Baghdad, Baghdad, بغداد",
);
assert.deepEqual(duplicateKeywords.keywords, ["Baghdad", "بغداد"], "duplicate keyword entries are removed without lowercasing display text");

const missingPreview = normalizeOperationalPreview({});
assert.equal(missingPreview.writes, false, "missing writes normalizes to false");
assert.equal(missingPreview.inspection.success, false, "missing inspection normalizes to failed technical status");
assert.deepEqual(missingPreview.safeSamples, [], "missing safe samples normalize to empty list");
assert.equal(missingPreview.previewFingerprint, null, "missing fingerprint remains null");
assert.equal(missingPreview.previewExpiresAt, null, "missing preview expiry remains null");
assert.equal(missingPreview.quality.passesMinimumSample, false, "missing quality keeps sample threshold failed");

const missingRead = normalizeOperationalSettingsRead({});
assert.equal(missingRead.source, null, "missing source normalizes to null");
assert.equal(missingRead.updateAllowed.allowed, false, "missing source identity disables updates");
assert.ok(missingRead.identityError, "missing identity fields produce a clear identity error");

const changedSettings = { ...DEFAULT_OPERATIONAL_SETTINGS, url: "https://example.com/news" };
const changedSnapshot = settingsSnapshot(changedSettings);
const validPreview = normalizeOperationalPreview({
  previewFingerprint: "f".repeat(64),
  previewExpiresAt: "2026-08-03T01:10:00.000Z",
  changedFields: ["url"],
  inspection: { success: true },
  quality: {
    minimumSampleCount: 5,
    minimumDirectMatchRate: 65,
    maximumNoiseRate: 20,
    passesMinimumSample: true,
    passesRelevance: true,
    passesNoise: true,
    outcomeStatus: "passed",
    outcomeReason: "thresholds_met",
  },
  productionCandidate: true,
});
assert.equal(validPreview.quality.minimumSampleCount, 5, "non-default backend sample threshold is preserved");
assert.equal(validPreview.quality.minimumDirectMatchRate, 65, "non-default backend relevance threshold is preserved");
assert.equal(validPreview.quality.maximumNoiseRate, 20, "non-default backend noise threshold is preserved");
assert.equal(canSaveOperationalSettings({
  dirty: true,
  updateAllowed: true,
  identityError: null,
  preview: null,
  currentSettings: changedSettings,
  previewSettingsSnapshot: null,
  acknowledgement: false,
  previewing: false,
  saving: false,
}), false, "save is disabled before preview");
assert.equal(canSaveOperationalSettings({
  dirty: true,
  updateAllowed: true,
  identityError: null,
  preview: validPreview,
  currentSettings: { ...changedSettings, retentionDays: 10 },
  previewSettingsSnapshot: changedSnapshot,
  acknowledgement: false,
  previewing: false,
  saving: false,
}), false, "editing after preview disables save");
assert.equal(canSaveOperationalSettings({
  dirty: true,
  updateAllowed: true,
  identityError: null,
  preview: validPreview,
  currentSettings: changedSettings,
  previewSettingsSnapshot: changedSnapshot,
  acknowledgement: false,
  previewing: false,
  saving: false,
}), true, "valid unchanged successful preview enables save");
assert.equal(canSaveOperationalSettings({
  dirty: true,
  updateAllowed: true,
  identityError: null,
  preview: normalizeOperationalPreview({
    previewFingerprint: "f".repeat(64),
    previewExpiresAt: "2026-08-03T01:10:00.000Z",
    changedFields: ["url"],
    inspection: { success: true },
    quality: { passesMinimumSample: true, passesRelevance: false, passesNoise: true },
    productionCandidate: false,
  }),
  currentSettings: changedSettings,
  previewSettingsSnapshot: changedSnapshot,
  acknowledgement: false,
  previewing: false,
  saving: false,
}), false, "non-production-candidate preview requires acknowledgement");
assert.equal(canSaveOperationalSettings({
  dirty: true,
  updateAllowed: true,
  identityError: null,
  preview: normalizeOperationalPreview({
    previewFingerprint: "f".repeat(64),
    previewExpiresAt: "2026-08-03T01:10:00.000Z",
    changedFields: ["url"],
    inspection: { success: true },
    quality: { passesMinimumSample: true, passesRelevance: false, passesNoise: true },
    productionCandidate: false,
  }),
  currentSettings: changedSettings,
  previewSettingsSnapshot: changedSnapshot,
  acknowledgement: true,
  previewing: false,
  saving: false,
}), true, "acknowledgement can permit a technically valid non-production-candidate preview");
assert.equal(canSaveOperationalSettings({
  dirty: true,
  updateAllowed: true,
  identityError: "Source identity is missing.",
  preview: validPreview,
  currentSettings: changedSettings,
  previewSettingsSnapshot: changedSnapshot,
  acknowledgement: true,
  previewing: false,
  saving: false,
}), false, "acknowledgement cannot bypass identity errors");

assert.equal(canSaveOperationalSettings({
  dirty: true,
  updateAllowed: true,
  identityError: null,
  preview: normalizeOperationalPreview({
    previewFingerprint: "f".repeat(64),
    previewExpiresAt: "2026-08-03T01:10:00.000Z",
    changedFields: [],
    inspection: { success: true },
    productionCandidate: true,
  }),
  currentSettings: changedSettings,
  previewSettingsSnapshot: changedSnapshot,
  acknowledgement: false,
  previewing: false,
  saving: false,
}), false, "save remains disabled when backend preview reports no effective setting changes");

console.log("operational-source-settings-ui tests passed");
