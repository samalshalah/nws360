# Workspace Relevance Backfill

Use this runbook when existing articles need relevance decisions recalculated for the generic workspace engine.

Do not run this against production automatically.

## Schema Migration

Dry run:

```bash
npm run db:migrate:workspace-relevance
```

Apply only after a verified backup:

```bash
npm run db:migrate:workspace-relevance -- --apply --confirm-backup
```

The migration adds:

- generic article relevance defaults
- workspace profile columns on `workspaces`
- `article_workspace_relevance`
- `rejected_ingestion_items`
- indexes for relevance filtering and analyst review

It also maps legacy status values, if present:

- legacy direct country status to `direct_scope_match`
- legacy impact status to `material_scope_impact`
- legacy regional context status to `contextual`

## Backfill

Dry run:

```bash
npm run backfill:workspace-relevance
```

Optional dry-run filters:

```bash
npm run backfill:workspace-relevance -- --client-id 1
npm run backfill:workspace-relevance -- --source-id 25 --limit 500
npm run backfill:workspace-relevance -- --article-id 123
```

Apply only after review:

```bash
npm run backfill:workspace-relevance -- --apply --confirm-backup
```

The backfill:

- does not delete articles
- does not change article IDs
- does not change tenant ownership
- does not overwrite manual relevance decisions
- reports current and proposed status counts
- verifies article count and ID checksum before commit

## Review

Before applying, review:

- articles moving to `not_relevant`
- articles moving to `needs_review`
- articles with weak content-only signals
- articles from sources without workspace profile configuration

Manual analyst decisions remain authoritative until explicitly reopened.

