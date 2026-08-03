import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const storage = fs.readFileSync(path.join(root, "server", "storage.ts"), "utf8");
const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
const validator = fs.readFileSync(path.join(root, "server", "publisher-channel-validator.ts"), "utf8");

function methodBody(source: string, signature: string) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing method ${signature}`);
  const next = source.indexOf("\n  async ", start + signature.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function assertIncludes(source: string, text: string, label: string) {
  assert.ok(source.includes(text), `${label} missing ${text}`);
}

const mutationMethods = [
  "async createPublisherProfileAtomic(",
  "async updatePublisherProfile(",
  "async transitionPublisherLifecycle(",
  "async createPublisherAlias(",
  "async updatePublisherAlias(",
  "async archivePublisherAlias(",
  "async createPublisherChannel(",
  "async updatePublisherChannel(",
  "async transitionPublisherChannelLifecycle(",
  "async validatePublisherChannel(",
  "async overridePublisherChannelValidation(",
  "async selectClientPublisherAtomic(",
  "async updateClientPublisherSelection(",
  "async createArticleAppearance(",
];

for (const signature of mutationMethods) {
  const body = methodBody(storage, signature);
  assertIncludes(body, "db.transaction", `${signature} transaction`);
}

for (const signature of mutationMethods.filter((item) => item !== "async createArticleAppearance(")) {
  const body = methodBody(storage, signature);
  assert.ok(/createAuditLogInTransaction|tx\.insert\(adminAuditLogs\)/.test(body), `${signature} does not audit inside the transaction`);
}

const validationBody = methodBody(storage, "async validatePublisherChannel(");
assertIncludes(validationBody, "FOR UPDATE", "channel validation row lock");
assertIncludes(validationBody, "publisherChannelValidationIdentity(current)", "channel validation initial identity");
assertIncludes(validationBody, "publisherChannelValidationIdentity(lockedCurrent)", "channel validation locked identity");
assertIncludes(validationBody, "channel_changed_during_validation", "stale validation conflict");

const appearanceBody = methodBody(storage, "async createArticleAppearance(");
assertIncludes(appearanceBody, "appearance_channel_requires_publisher", "channel without publisher rejection");
assertIncludes(appearanceBody, "appearance_source_channel_mismatch", "source/channel mismatch rejection");
assertIncludes(appearanceBody, "appearanceInput.publisherChannelId = source.publisherChannelId", "source channel derivation");
assertIncludes(appearanceBody, "appearanceInput.publisherProfileId = sourceChannel.publisherProfileId", "source publisher derivation");

const createChannelBody = methodBody(storage, "async createPublisherChannel(");
assertIncludes(createChannelBody, "nws360.publisher_channel", "channel advisory lock");
assertIncludes(createChannelBody, "duplicate_publisher_channel", "safe channel duplicate code");

const createPublisherBody = methodBody(storage, "async createPublisherProfileAtomic(");
assertIncludes(createPublisherBody, "domainScopeKey", "domain concurrency key");
assertIncludes(createPublisherBody, "duplicate_publisher_domain", "safe domain duplicate code");

assertIncludes(routes, "storage.validatePublisherChannel(publisherId, channelId, user.id)", "server-owned validation route");
assert.equal(routes.includes("req.body?.validationStatus || req.body?.status || \"valid\""), false, "validate route still trusts browser status");
assertIncludes(routes, "validation-override", "manual override route");
assertIncludes(storage, "Manual validation override requires a reason", "manual override reason storage message");
assertIncludes(routes, "if (!publisherId) return res.status(400)", "publisher id 400");
assertIncludes(routes, "if (!aliasId) return res.status(400)", "alias id 400");
assertIncludes(routes, "if (!channelId) return res.status(400)", "channel id 400");
assertIncludes(routes, "if (!selectionId) return res.status(400)", "selection id 400");
assertIncludes(routes, "safeNotFound(res)", "unknown record safe 404");
assertIncludes(routes, "requireSystemAdmin()", "platform admin route guard");

assertIncludes(validator, "approvedAddress", "validator approved address");
assertIncludes(validator, "hostname: request.approvedAddress", "pinned connection address");
assertIncludes(validator, "servername: request.hostname", "TLS SNI preservation");
assertIncludes(validator, "Host: request.url.host", "Host header preservation");
assertIncludes(validator, "resolveApprovedAddress(currentUrl", "redirect re-resolution");
assertIncludes(validator, "response_too_large", "stream size limit");
assertIncludes(validator, "url_credentials_not_allowed", "URL credential rejection");
assertIncludes(validator, "blocked_resolved_address", "mixed DNS rejection");
assert.equal(validator.includes(".arrayBuffer("), false, "validator must not use unbounded arrayBuffer()");
assert.equal(validator.includes(".text("), false, "validator must not use unbounded text()");

console.log("publisher production-path storage and route guard tests passed");
