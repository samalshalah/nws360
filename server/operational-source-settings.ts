import { createHmac, timingSafeEqual } from "node:crypto";
import * as cheerio from "cheerio";
import {
  stableOperationalSettingsJson,
  type OperationalSourceSettings,
} from "@shared/operational-source-settings";

export type OperationalSelectorValidationError = {
  field: string;
  message: string;
};

export type OperationalSettingsFingerprintInput = {
  clientId: number;
  workspaceId: number;
  sourceId: number;
  sourceIdentity: string;
  sourceUpdatedAt?: string | null;
  requestedAssignmentId: number;
  requestedWorkspaceId: number;
  linkedAssignments: Array<{
    id: number;
    workspaceId: number;
    status: string;
    enabled: boolean;
    testStatus?: string | null;
    updatedAt?: string | null;
  }>;
  channelId: number;
  channelUpdatedAt?: string | null;
  relevanceProfileVersion: number;
  expiresAt: string;
  settings: OperationalSourceSettings;
};

export type OperationalSettingsClock = {
  now(): Date;
};

export const OPERATIONAL_SETTINGS_PREVIEW_TTL_MS = 10 * 60 * 1000;

export const systemOperationalSettingsClock: OperationalSettingsClock = {
  now: () => new Date(),
};

const SELECTOR_VALIDATION_HTML = `
  <main>
    <article class="card">
      <a class="link" href="/story/example"><h2 class="title">Example story title</h2></a>
      <p class="summary">Example summary text for selector validation.</p>
      <img class="image" src="/image.jpg" alt="Example image title" />
      <time class="date" datetime="2026-08-03T10:00:00Z">August 3, 2026</time>
    </article>
  </main>
`;

const SELECTOR_FIELDS = ["item", "link", "title", "summary", "image", "date"] as const;

function boundedSelectorError(field: string, error: unknown): OperationalSelectorValidationError {
  const message = error instanceof Error ? error.message : "Invalid selector";
  return {
    field,
    message: message.replace(/\s+/g, " ").slice(0, 180) || "Invalid selector",
  };
}

export function validateOperationalSourceSelectors(settings: OperationalSourceSettings): {
  valid: boolean;
  errors: OperationalSelectorValidationError[];
} {
  const selectors = settings.collectorConfig.selectors || {};
  const $ = cheerio.load(SELECTOR_VALIDATION_HTML, { scriptingEnabled: false } as any);
  const errors: OperationalSelectorValidationError[] = [];
  for (const field of SELECTOR_FIELDS) {
    const selector = selectors[field];
    if (!selector) continue;
    try {
      $(selector).length;
    } catch (error) {
      errors.push(boundedSelectorError(field, error));
    }
  }
  return { valid: errors.length === 0, errors };
}

function operationalSettingsConfigError(message: string) {
  return Object.assign(new Error(message), {
    status: 503,
    code: "operational_settings_hmac_secret_missing",
  });
}

function fingerprintSecret(secretOverride?: string): string {
  const secret = secretOverride
    || process.env.OPERATIONAL_SETTINGS_HMAC_SECRET
    || process.env.SESSION_SECRET
    || (process.env.NODE_ENV !== "production" ? process.env.OPERATIONAL_SETTINGS_TEST_HMAC_SECRET : undefined);
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw operationalSettingsConfigError("Operational source settings HMAC secret is not configured.");
  }
  return secret;
}

export function assertOperationalSettingsPreviewNotExpired(
  expiresAt: string,
  clock: OperationalSettingsClock = systemOperationalSettingsClock,
) {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) {
    throw Object.assign(new Error("Operational source settings preview expiry is invalid."), {
      status: 400,
      code: "invalid_operational_source_settings_preview_expiry",
    });
  }
  if (expires.getTime() <= clock.now().getTime()) {
    throw Object.assign(new Error("Operational source settings preview expired."), {
      status: 409,
      code: "operational_source_settings_preview_expired",
    });
  }
}

export function operationalSettingsPreviewExpiresAt(
  clock: OperationalSettingsClock = systemOperationalSettingsClock,
): string {
  return new Date(clock.now().getTime() + OPERATIONAL_SETTINGS_PREVIEW_TTL_MS).toISOString();
}

export function operationalSettingsFingerprint(
  input: OperationalSettingsFingerprintInput,
  options: { secret?: string } = {},
): string {
  return createHmac("sha256", fingerprintSecret(options.secret))
    .update(stableOperationalSettingsJson(input))
    .digest("hex");
}

export function verifyOperationalSettingsFingerprint(
  receivedFingerprint: string,
  input: OperationalSettingsFingerprintInput,
  options: { secret?: string } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(receivedFingerprint)) {
    return { ok: false, reason: "malformed_fingerprint" as const };
  }
  const expected = operationalSettingsFingerprint(input, options);
  const received = Buffer.from(receivedFingerprint, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (received.length !== expectedBuffer.length) {
    return { ok: false, reason: "fingerprint_mismatch" as const };
  }
  const matched = timingSafeEqual(received, expectedBuffer);
  return {
    ok: matched,
    reason: matched ? "matched" as const : "fingerprint_mismatch" as const,
  };
}
