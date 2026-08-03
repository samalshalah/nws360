# Workspace Source Assignment Migration

Migration commands:

```bash
npm run db:migrate:workspace-source-assignments -- --dry-run
npm run db:migrate:workspace-source-assignments -- --apply
```

The command defaults to dry-run. Do not run `--apply` against production until the dry-run report is reviewed and approved.

## What It Adds

- `workspace_source_assignments`
- `workspace_source_assignment_tests`
- `sources.source_identity_key`
- uniqueness for client/source identity
- uniqueness for workspace/source assignment
- uniqueness for workspace/channel assignment
- composite client/workspace/source/channel foreign-key protections
- status, priority, role, count, rate, and enabled/status checks

## Dry Run

Dry-run inspects schema and data and returns structured JSON:

- missing tables
- missing columns
- missing indexes
- missing unique constraints
- missing foreign keys
- missing check constraints
- incompatible row counts
- unsafe partial schema risks
- empty partial schema repairs
- table row counts
- every planned SQL statement
- future apply command

Dry-run does not start a write transaction, create business data, or modify records.

## Apply Safeguards

Apply uses one transaction and an advisory migration lock. It aborts before writes when incompatible rows or unsafe partial schemas are detected. A failed apply rolls back fully.

The migration is idempotent and creates no clients, publishers, channels, assignments, sources, articles, appearances, jobs, demo data, reset data, enrollment data, ingestion data, or backfill data.

## Production Status

This migration prepares the database for workspace-level source setup. It does not activate monitoring and does not import articles.
