# Workspace Relevance Migration

The migration extends the existing `workspaces` table and creates workspace-scoped relevance tables. It does not create clients, workspaces, sources, articles, reports, alerts, or demo records.

## Commands

Dry run:

```bash
npm run db:migrate:workspace-relevance -- --dry-run
```

Apply:

```bash
npm run db:migrate:workspace-relevance -- --apply
```

Do not run apply against production until the change is reviewed and the deployment is ready for the new schema.

## Workspace Columns

The migration adds missing columns with `ADD COLUMN IF NOT EXISTS`:

- `purpose`
- `scope_mode`
- `global_scope`
- `primary_country_codes`
- `secondary_country_codes`
- `region_codes`
- `subnational_areas`
- `preferred_languages`
- `timezone`
- `taxonomy_template_code`
- `relevance_profile_code`
- `reporting_template_code`
- `active`
- `updated_at`

## New Tables

`workspace_relevance_profiles` stores one editable profile per workspace.

`article_workspace_relevance` stores relevance decisions per article and workspace, with a unique constraint on `workspace_id + article_id`.

`workspace_relevance_history` stores previous and new relevance decisions for audit and manual review history.

## Idempotency

The migration uses:

- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

It is safe to rerun. The dry run reports existing columns, missing columns, existing tables, and planned statements.

## Empty-State Behavior

The migration supports a database with one platform administrator and zero clients. It does not seed tenant data or recreate demo records.
