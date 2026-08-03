# Source Provisioning

Workspace source provisioning reuses the existing `sources` table and feed worker. It does not create a second ingestion engine.

## Preview

Endpoint:

```text
POST /api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/preview
```

Preview performs zero writes and returns:

- client
- workspace
- publisher
- channel
- approved publisher selection
- existing compatible source when present
- proposed inactive operational source
- proposed draft assignment
- validation warnings
- duplicate assignment warning
- provisionability result
- required test plan
- readiness impact
- creation plan

## Atomic Creation

Creation runs in one database transaction:

1. Verify client and workspace.
2. Verify approved publisher selection.
3. Verify publisher visibility.
4. Verify publisher channel.
5. Reuse a compatible client source when available.
6. Otherwise create one inactive operational source.
7. Create one draft disabled assignment.
8. Create one audit event.

If any step fails, the source, assignment, and audit event roll back together.

## Eligible Channels

Website and RSS channels normally require valid channel validation or manual override. Social channels can remain `needs_review`, but require an RSS.app feed or supported connector configuration before provisioning. Television, radio, podcast, and manual channels remain manual-only unless a supported stream/feed configuration is provided.

Google News is collector configuration, not a publisher-owned channel. Google News queries stay in source collector metadata, while the assignment keeps the actual publisher/channel where known.

## Activation

Newly provisioned sources are created with `active = false`. Assignment creation does not enqueue fetch jobs and does not insert articles. Activation is blocked until tests are current and the client/workspace are active.
