# Client Enrollment Migration

The client enrollment migration adds schema support for the platform-admin enrollment workflow.

## Commands

Dry run:

```bash
npm run db:migrate:client-enrollment -- --dry-run
```

Apply:

```bash
npm run db:migrate:client-enrollment -- --apply
```

Apply must not be run during development unless explicitly approved for the target database.

## What The Migration Adds

`clients`:

- `slug`
- `lifecycle_status`
- `enrollment_key`
- `enrollment_request_fingerprint`
- `updated_at`

`client_settings`:

- `represented_country_code`
- `host_country_code`
- `headquarters_country_code`
- `default_timezone`
- `default_languages`
- `website_url`
- `contact_name`
- `contact_email`

`workspaces`:

- `normalized_name`
- `status`
- `activated_at`
- `activated_by`

Indexes and checks:

- unique client slug
- unique enrollment key
- unique workspace name per client using `client_id + normalized_name`
- client lifecycle status check
- organization type check
- workspace status check

## Safety Behavior

The migration:

- defaults to dry run
- reports planned SQL
- supports the current zero-client database
- uses a transaction in apply mode
- uses a Postgres advisory lock in apply mode
- detects duplicate slugs
- detects duplicate enrollment keys
- detects duplicate client-scoped workspace names
- detects invalid lifecycle, organization type, and workspace status values
- aborts before writes when incompatible rows exist
- rolls back on failure
- never creates client, tenant, source, article, workspace, or demo data

## Review Checklist

Before apply:

- dry-run output has `applySafe: true`
- incompatible row counts are all zero
- duplicate slug count is zero
- duplicate enrollment-key count is zero
- duplicate workspace-name count is zero
- planned SQL matches this document
- no production client data is expected to be created

After apply:

- required columns exist
- required indexes and constraints exist
- existing row counts did not change unexpectedly
- no source, article, tenant user, processing job, or demo row was created
