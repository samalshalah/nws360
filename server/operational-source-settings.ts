import { createHmac } from "node:crypto";
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
  assignmentId: number;
  assignmentUpdatedAt?: string | null;
  channelId: number;
  channelUpdatedAt?: string | null;
  relevanceProfileVersion: number;
  settings: OperationalSourceSettings;
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

function fingerprintSecret(): string {
  return process.env.SESSION_SECRET
    || process.env.REPL_ID
    || process.env.DATABASE_URL
    || "nws360-development-operational-source-settings";
}

export function operationalSettingsFingerprint(input: OperationalSettingsFingerprintInput): string {
  return createHmac("sha256", fingerprintSecret())
    .update(stableOperationalSettingsJson(input))
    .digest("hex");
}
