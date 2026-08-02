import {
  getDefaultRelevanceStatuses,
  isArticleRelevanceStatus,
  type ArticleRelevanceStatus,
} from "./workspace-relevance";

export type WorkspaceIdParseResult =
  | { supplied: false; workspaceId?: undefined; error?: undefined }
  | { supplied: true; workspaceId: number; error?: undefined }
  | { supplied: true; workspaceId?: undefined; error: string };

export type WorkspaceTenantAccessInput = {
  workspaceExists: boolean;
  workspaceClientId?: number | null;
  clientId?: number | null;
  isSystemAdmin?: boolean;
};

export type WorkspaceTenantAccessResult =
  | { allowed: true }
  | { allowed: false; status: 403 | 404; reason: string };

export type RelevanceStatusAccessInput = {
  requestedStatuses?: ArticleRelevanceStatus[] | null;
  includeContextual?: boolean;
  includeNeedsReview?: boolean;
  includeNotRelevant?: boolean;
  isReviewer?: boolean;
};

export type RelevanceStatusAccessResult =
  | {
      allowed: true;
      statuses: ArticleRelevanceStatus[];
      reviewOnlyRequested: boolean;
      contextualRequested: boolean;
    }
  | {
      allowed: false;
      statuses: ArticleRelevanceStatus[];
      status: 403;
      reason: string;
      reviewOnlyRequested: boolean;
      contextualRequested: boolean;
    };

function firstQueryValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : value;
  return value;
}

export function parseWorkspaceIdInput(value: unknown): WorkspaceIdParseResult {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === null || raw === "") return { supplied: false };
  if (Array.isArray(raw)) {
    return { supplied: true, error: "workspaceId must be a single positive integer" };
  }
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0
      ? { supplied: true, workspaceId: raw }
      : { supplied: true, error: "workspaceId must be a positive integer" };
  }
  const text = String(raw).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    return { supplied: true, error: "workspaceId must be a positive integer" };
  }
  const workspaceId = Number(text);
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) {
    return { supplied: true, error: "workspaceId must be a positive integer" };
  }
  return { supplied: true, workspaceId };
}

export function normalizeRelevanceStatusFilter(value: unknown): ArticleRelevanceStatus[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const rawValues = Array.isArray(value) ? value : String(value).split(",");
  const statuses = rawValues
    .map((item) => String(item).trim())
    .filter(isArticleRelevanceStatus);
  return statuses.length > 0 ? Array.from(new Set(statuses)) : undefined;
}

export function validateWorkspaceTenantAccess(input: WorkspaceTenantAccessInput): WorkspaceTenantAccessResult {
  if (!input.workspaceExists) {
    return { allowed: false, status: 404, reason: "Workspace not found" };
  }
  if (!input.isSystemAdmin && !input.clientId) {
    return { allowed: false, status: 403, reason: "No organization assigned" };
  }
  if (input.clientId && input.workspaceClientId !== input.clientId) {
    return { allowed: false, status: 404, reason: "Workspace not found" };
  }
  return { allowed: true };
}

export function resolveRelevanceStatusAccess(input: RelevanceStatusAccessInput): RelevanceStatusAccessResult {
  const statuses = input.requestedStatuses?.length
    ? Array.from(new Set(input.requestedStatuses.filter(isArticleRelevanceStatus)))
    : getDefaultRelevanceStatuses({
        includeContextual: input.includeContextual,
        includeNeedsReview: input.includeNeedsReview,
        includeNotRelevant: input.includeNotRelevant,
      });
  const reviewOnlyRequested = statuses.some((status) => status === "needs_review" || status === "not_relevant");
  const contextualRequested = statuses.includes("contextual");

  if (reviewOnlyRequested && !input.isReviewer) {
    return {
      allowed: false,
      status: 403,
      reason: "Insufficient permissions for relevance review scope",
      statuses,
      reviewOnlyRequested,
      contextualRequested,
    };
  }
  if (contextualRequested && !input.includeContextual && !input.isReviewer) {
    return {
      allowed: false,
      status: 403,
      reason: "Contextual relevance access must be explicitly enabled",
      statuses,
      reviewOnlyRequested,
      contextualRequested,
    };
  }

  return {
    allowed: true,
    statuses,
    reviewOnlyRequested,
    contextualRequested,
  };
}
