# Workspace Source Assignments

Workspace source assignments connect publisher catalog channels to monitored workspaces without turning monitoring on automatically.

## Concepts

- Publisher profile: the canonical publishing organization.
- Publisher channel: a website, RSS feed, social channel, video channel, newsletter, API, or manual channel owned by a publisher.
- Operational source: the existing client-scoped `sources` record used by the ingestion worker.
- Workspace source assignment: the tested decision to use one operational source in one workspace under that workspace relevance policy.

A publisher channel does not automatically create a source. A source does not automatically belong to a workspace. An assignment does not activate ingestion until it passes lifecycle checks.

## Source Reuse

Operational sources remain client-scoped. The same source may be assigned to multiple workspaces for the same client, but it must never be shared across clients.

Linked sources use `source_identity_key`:

```text
client:<clientId>:publisher-channel:<publisherChannelId>
```

Assignments use:

```text
workspace:<workspaceId>:source:<sourceId>
```

This gives deterministic dedupe for concurrent provisioning and prevents duplicate assignment of the same source or channel inside one workspace.

## Assignment Lifecycle

- `draft`: disabled setup record.
- `testing`: disabled while connectivity or relevance testing is in progress or recently run.
- `ready`: disabled, with a current passed or manually approved warning test.
- `active`: enabled only when the client, workspace, source, and current test are all valid.
- `paused`: disabled.
- `archived`: disabled and excluded from readiness.

Ready does not mean active. Activation is a separate platform-admin action and still requires an active client and active workspace.

## Tenant Protections

Storage and database constraints require:

- workspace client equals assignment client
- source client equals assignment client
- source channel equals assignment channel
- channel belongs to assignment publisher
- client publisher selection belongs to the assignment client
- private publisher belongs to the same client
- test run belongs to the same client and workspace

API errors are mapped to safe codes such as `publisher_not_approved_for_client`, `source_assignment_client_mismatch`, `source_assignment_channel_mismatch`, `source_assignment_publisher_mismatch`, `channel_not_eligible`, and `duplicate_workspace_source_assignment`.

## Readiness

Client readiness now includes:

- approved publisher profiles
- eligible source channels
- ready or active source assignments
- current passed or approved-warning tests
- stale test count
- blocked assignment count

Monitoring readiness remains blocked by inactive clients, inactive workspaces, missing assignments, missing tests, stale tests, or failed tests.
