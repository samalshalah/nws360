# Iraq Taxonomy Migration Runbook

Use this runbook when reclassifying existing Iraq articles into the embassy-ready taxonomy. This process is designed to preserve historical content and update only article `category` and `priority`.

## Production Sequence

1. Confirm the code version.

   ```bash
   git status --short --branch
   git rev-parse HEAD
   ```

2. Run the dry-run preview.

   ```bash
   npm run db:migrate:iraq-taxonomy
   ```

   Review the JSON report for total article count, current/proposed category and priority counts, movements, updates required, unchanged count, records ending in `other`, insufficient-content count, per-client counts, uncertain samples, git SHA, and database identifier.

3. Create and verify a Neon backup.

   Do not continue until the backup is visible in Neon and restoration is understood. The migration apply command requires this acknowledgement.

4. Apply the migration.

   ```bash
   npm run db:migrate:iraq-taxonomy -- --apply --confirm-backup
   ```

   Apply mode runs in a database transaction. If any integrity check fails, the transaction rolls back and the command exits non-zero.

5. Save the structured JSON audit output.

   The audit includes migration name, timestamp, mode, git SHA, database environment identifier without credentials, reviewed/updated totals, category and priority movements, uncertain count, integrity checks, duration, and success/failure.

6. Re-run dry-run to confirm idempotency.

   ```bash
   npm run db:migrate:iraq-taxonomy
   ```

   Expected result after a successful apply: zero additional required updates unless new articles arrived between the apply and this check.

## Integrity Checks

Before and after apply, the script verifies:

- Article count unchanged
- Distinct article IDs unchanged
- Article ID checksum unchanged
- Non-taxonomy article fields unchanged, including tenant/source ownership, title/content/summary, URL, dates, language, country/province, keywords/topics, workflow status, manual tags, images, engagement, cross-posts, and AI status fields
- Relationship counts and article-link checksums unchanged for tables with `article_id`
- Relationship counts and link checksums unchanged for comments, annotations, tag assignments, tasks, activity events, institutional notes, and briefing/report-basket article items
- Resulting categories and priorities are valid taxonomy codes

## Uncertain Articles

Uncertain articles are preserved in place. The migration flags them in audit output when the classifier falls back to `other` or when title/content is insufficient. It does not overwrite workflow status or append manual tags during the global migration.

Use targeted reclassification for selected unclear records:

```bash
npm run reclassify:iraq-taxonomy -- --dry-run
npm run reclassify:iraq-taxonomy -- --category other --limit 50 --dry-run
npm run reclassify:iraq-taxonomy -- --client-id <id> --category other --limit 100 --dry-run
npm run reclassify:iraq-taxonomy -- --article-id <id> --apply --confirm-backup
```

The targeted command defaults to `category=other` and `limit=50` when no filter is provided. It uses the current deterministic classifier only; no AI calls are made automatically.

## Do Not Do

- Do not run this before verifying a Neon backup.
- Do not run production apply without `--confirm-backup`.
- Do not truncate, delete, purge, or re-import articles as part of this migration.
- Do not manually edit tenant ownership, source ownership, URLs, workflow status, manual tags, report basket records, bookmarks, translations, discussions, annotations, or tasks during the migration window.
- Do not merge the branch until tests, build, and TypeScript comparison are reviewed.
