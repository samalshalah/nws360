# Workspace Relevance Backfill

The backfill evaluates existing articles for one workspace or all workspaces and writes only to `article_workspace_relevance` when apply mode is explicitly used.

It never updates global article relevance fields. Relevance is workspace-specific.

## Commands

Dry run for one workspace:

```bash
npm run backfill:workspace-relevance -- --dry-run --workspace-id 1
```

Dry run for all workspaces:

```bash
npm run backfill:workspace-relevance -- --dry-run --all-workspaces
```

Apply for one workspace:

```bash
npm run backfill:workspace-relevance -- --apply --workspace-id 1
```

Apply for all workspaces:

```bash
npm run backfill:workspace-relevance -- --apply --all-workspaces
```

Options:

- `--batch-size 500`
- `--limit 1000`
- `--enable-ai`

AI is not called by default. The current command performs deterministic evaluation only and reports if `--enable-ai` is supplied.

## Safety Rules

The command defaults to dry-run and requires either `--workspace-id` or `--all-workspaces`.

It respects tenant boundaries by selecting articles from the workspace's `client_id`.

Existing manual overrides are skipped. Reopened manual decisions can be reevaluated by clearing the manual override through the review workflow.

The command is resumable and idempotent because `article_workspace_relevance` is unique by `workspace_id + article_id`.

## Reports

The output includes:

- Workspace count
- Evaluated article-workspace pairs
- Article ID checksum
- Existing counts
- Proposed counts
- Required updates
- Skipped manual overrides
- Already-current decisions
- Sample updates

## Current Production State

After the clean reset, production has zero articles and zero workspaces. A dry run should report zero candidates until a real client workspace and articles exist.
