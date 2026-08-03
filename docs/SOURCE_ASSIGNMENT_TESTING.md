# Source Assignment Testing

Assignment tests are non-persistent setup checks. They do not insert articles, article appearances, rejected ingestion items, reports, briefings, alerts, or processing jobs.

## Connectivity Test

Endpoint:

```text
POST /api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId/test-connectivity
```

Connectivity testing uses publisher channel and source configuration to decide whether the channel can be fetched by the existing ingestion system. It records one `workspace_source_assignment_tests` row and leaves the source inactive.

Possible outcomes include:

- reachable
- invalid configuration
- unsupported channel
- credentials required
- unreachable
- needs manual review

## Relevance Test

Endpoint:

```text
POST /api/admin/clients/:clientId/workspaces/:workspaceId/source-assignments/:assignmentId/test-relevance
```

The relevance test stores bounded safe samples only:

- headline
- normalized URL
- publication time
- language
- relevance classification
- matched signals
- rejection reason

It does not store full fetched bodies in test records.

Classifications:

- `direct_scope_match`
- `material_scope_impact`
- `contextual`
- `not_relevant`
- `needs_review`

## Default Pass Rules

`passed`:

- no fatal connectivity or configuration error
- enough usable items
- direct or material relevance meets the configured minimum
- noise remains below the configured maximum

`warning`:

- source is reachable but sample is small
- contextual coverage dominates
- direct relevance is below threshold but not fatal
- needs-review rate is elevated

`failed`:

- no usable items
- invalid configuration
- unreachable source
- noise rate exceeds threshold

Warning approval requires a reason and is audited. A warning approval preserves the original warning result.

## Stale Tests

When a workspace relevance profile version changes, non-archived assignments for that workspace are marked `stale`. Stale tests cannot move to `ready` or `active`; the assignment must be retested.
