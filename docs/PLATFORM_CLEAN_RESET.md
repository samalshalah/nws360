# NWS360 Platform Clean Reset

This runbook describes the intentional reset that deletes all current operational and tenant data while preserving exactly one explicitly selected platform administrator.

## Purpose

Use this reset only when the existing clients, users, sources, articles, reports, alerts, jobs, and test data should be permanently discarded.

The final state is:

- One enabled platform administrator
- Zero clients
- Zero tenant users
- Zero sources
- Zero articles
- Zero reports, briefings, alerts, jobs, workspaces, and tenant-owned records
- Preserved database schema and migration history
- Preserved essential global system settings and RBAC definitions
- One reset audit record

## Platform Admin Model

The preserved administrator is converted to platform scope:

- `user_scope = 'platform'`
- `role = 'admin'`
- `client_id = NULL`
- `disabled = false`

The selected account must already qualify as a platform administrator before apply mode is allowed. It must use the existing platform administrator role (`admin`) and already carry platform-management authority through platform scope, a platform admin capability, or the legacy `platform:admin:any` permission model. A tenant user, analyst, editor, or client administrator is not promoted just because its ID is passed to the command.

The reset preserves the administrator's:

- `id`
- `username`
- `password` hash
- `capabilities`
- `created_at`

Tenant users must keep `user_scope = 'tenant'` and require a real `client_id`. The reset does not create a fake client for the administrator.

The users table is protected by `users_scope_client_id_ck`:

- `user_scope = 'platform'` requires `client_id IS NULL`
- every non-platform scope requires `client_id IS NOT NULL`

## Dry Run

Dry run makes no database changes:

```bash
npm run reset:platform -- --dry-run --preserve-admin-id <id>
```

Review the JSON output before applying. It reports:

- Preserved admin ID and username
- Admin qualification status, role, user scope, relevant platform capabilities, and qualification reason
- Client, tenant-user, source, article, report, alert, briefing, and job counts
- Every discovered operational table
- Current row counts by table
- Proposed deletion order
- Preserved tables
- Unhandled table risks
- Expected final counts

If `unhandledTableRisks` is not empty, do not apply the reset until the table is either added to the explicit deletion plan or intentionally preserved.

## Apply

Apply requires the exact confirmation text:

```bash
npm run reset:platform -- --apply --confirmation RESET-NWS360 --preserve-admin-id <id>
```

There is no backup confirmation flag. The reset assumes the current data is intentionally being discarded.

## Safety Behavior

Apply mode:

- Aborts if the preserved admin ID is missing, invalid, or disabled
- Aborts if the preserved admin is not already an authorized platform administrator
- Aborts if the confirmation text is wrong
- Aborts if an unhandled operational table is discovered
- Uses a PostgreSQL advisory transaction lock to prevent concurrent resets
- Runs inside one transaction
- Rolls back on any failure
- Neutralizes active processing, AI, and export jobs before deleting them
- Converts the selected admin before deleting clients
- Deletes operational data with explicit table handling
- Avoids blind `CASCADE` resets
- Resets sequences for empty operational tables
- Keeps the users sequence above the preserved admin ID
- Verifies final counts and foreign-key orphans before commit

The reset also applies the minimal support DDL needed for the target model:

- `public.users.client_id` nullable
- `public.users` protected by `users_scope_client_id_ck`
- `public.admin_audit_logs.client_id` nullable
- `public.api_keys.client_id` nullable
- `public.platform_reset_audit` exists

No table is dropped.

## Deleted Data

The deletion plan includes clients, client settings, tenant users, sources, source logs, articles, translations, bookmarks, saved feed views, keywords, reports, briefings, alerts, jobs, API keys, sessions, analytics caches, workspaces, comments, annotations, tasks, tags, watchlists, operational audit logs, usage metrics, AI records, integration records, notifications, and related tenant-owned records.

The script also deletes matching operational tables discovered outside `public`, such as previous rehearsal article tables, when their table name is in the explicit operational plan.

## Preserved Data

The reset preserves:

- The selected platform administrator
- The administrator's permission-group and direct-permission assignments
- `system_settings`
- `feature_flags`
- `permission_groups`
- `permissions`
- `group_permissions`
- Migration history tables, including Drizzle migration tables
- `platform_reset_audit`

Old `admin_audit_logs` are deleted. The reset audit is written to `platform_reset_audit` and does not store credentials or article content.

## Worker Shutdown

Run the reset while application workers are stopped or paused. The reset neutralizes active job rows inside the transaction, but an already-running external process could still be doing work until deployment infrastructure stops it.

Recommended operational order:

1. Stop the Railway web/worker processes or pause scheduled workers.
2. Run the dry run.
3. Review the deletion plan.
4. Run the apply command.
5. Start the application again.
6. Log in as the preserved platform administrator.

## Zero-State Behavior

After reset, the platform admin lands in the control center with no selected tenant. The Clients tab shows:

- "No clients have been enrolled yet."
- "Create First Client"

Use Create First Client to start a new tenant enrollment, then add tenant users, sources, keywords, alerts, and reporting configuration.
