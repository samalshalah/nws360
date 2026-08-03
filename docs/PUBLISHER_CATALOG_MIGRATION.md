# Publisher Catalog Migration

Migration command:

```bash
npm run db:migrate:publisher-catalog -- --dry-run
```

Apply command:

```bash
npm run db:migrate:publisher-catalog -- --apply
```

Do not run apply against production until the dry-run output has been reviewed.

## What The Migration Does

The migration creates or repairs the publisher catalog schema:

- `publisher_profiles`
- `publisher_aliases`
- `publisher_channels`
- `client_publisher_selections`
- `article_appearances`
- optional `sources.publisher_channel_id`

It also adds indexes, uniqueness protections, foreign keys, and check constraints for lifecycle, verification, channel validation, appearance types, and global/client-private ownership consistency.

## Dry Run

Dry-run is the default behavior. It performs no writes and reports:

- missing tables
- missing columns
- missing indexes
- missing unique constraints
- missing foreign keys
- missing check constraints
- incompatible row counts
- tenant mismatch counts
- unsafe partial schema risks
- table row counts
- planned SQL statements

## Apply Safety

Apply mode:

- runs in one transaction
- acquires an advisory transaction lock
- aborts before writes if unsafe rows or partial schema risks exist
- rolls back on failure
- is idempotent
- does not create publisher records
- does not create clients, workspaces, sources, articles, jobs, or demo data

## Zero-State Compatibility

The migration supports the current clean platform state:

- one platform administrator
- zero clients
- zero workspaces
- zero sources
- zero articles
- preserved `platform_reset_audit`

The migration only changes schema.
