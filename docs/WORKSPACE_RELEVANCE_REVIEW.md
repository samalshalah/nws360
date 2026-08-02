# Workspace Relevance Review

Manual review is workspace-specific. A reviewer changes the decision for one article in one workspace without changing the article's relevance for other workspaces.

## Review Queue

The queue is served by:

```text
GET /api/workspaces/:workspaceId/relevance/review
```

By default it returns `needs_review`. It can include contextual items when requested.

Recommended queue candidates:

- `needs_review`
- Optional `contextual`
- Low-confidence `material_scope_impact`
- Conflicting deterministic and AI decisions

## Manual Decisions

Manual decision endpoint:

```text
PATCH /api/workspaces/:workspaceId/articles/:articleId/relevance
```

Allowed statuses:

- `direct_scope_match`
- `material_scope_impact`
- `contextual`
- `not_relevant`
- `needs_review`

The route writes to `article_workspace_relevance`, sets `manual_override`, records reviewer and timestamp, and appends `workspace_relevance_history`.

Manual decisions override automated decisions until explicitly reopened.

## Reopen

A reopened decision can be evaluated again by automation. The previous manual decision remains available in history.

## History

History tracks:

- `workspaceId`
- `articleId`
- previous status
- new status
- previous confidence
- new confidence
- evaluation method
- reviewer or changed-by user
- reason
- timestamp

No chain-of-thought or hidden AI reasoning is stored.

## Inclusion Rules

Direct and material-impact decisions are included by default in feeds, analytics, alerts, reports, briefings, exports, and intelligence summaries.

Contextual content is excluded by default and must appear under a configured contextual label when enabled.

Not-relevant and needs-review items are excluded from workspace outputs.

## Tenant Isolation

The API verifies:

- workspace belongs to the authenticated client
- article belongs to the workspace client
- tenant users cannot review another tenant's workspace
- platform admin access follows the existing platform-admin authorization model
- request-body `clientId` is ignored
