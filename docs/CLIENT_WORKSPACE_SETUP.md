# Client Workspace Setup

The client setup page is the platform-admin workspace for finishing a newly enrolled client's configuration.

## Route

```text
/admin/clients/:clientId/setup
```

This route requires platform-admin access. Tenant users cannot open another client's setup.

## Page Sections

Organization:

- name
- slug
- organization type
- lifecycle status
- represented country
- host country
- headquarters country
- timezone
- preferred languages
- contact

Monitoring Workspaces:

- workspace name
- purpose
- scope mode
- countries and regions
- status
- active or inactive state

Readiness Checklist:

- organization configured
- workspace count
- relevance profiles configured
- publisher profiles configured
- source channels configured
- source assignments configured
- monitoring ready
- blockers

## Readiness Model

The readiness API returns values equivalent to:

```json
{
  "organizationConfigured": true,
  "workspaceCount": 1,
  "activeWorkspaceCount": 0,
  "relevanceProfilesConfigured": 1,
  "publisherProfilesConfigured": 0,
  "sourceChannelsConfigured": 0,
  "sourceAssignmentsConfigured": 0,
  "monitoringReady": false,
  "blockers": [
    "publisher_profiles_missing",
    "source_channels_missing",
    "source_assignments_missing",
    "workspace_inactive"
  ]
}
```

Publisher and source values stay zero until the publisher/source setup sprint.

## Admin Actions

The setup page supports:

- Edit Organization
- Edit Workspace
- Configure Relevance Rules
- Add Another Workspace
- Add Team Member
- Continue to Publisher Setup

Publisher setup is visibly marked as the next stage. It is not implemented in this sprint.

## Admin Relevance Route

```text
/admin/clients/:clientId/workspaces/:workspaceId/relevance
```

This route reuses the workspace relevance UI with explicit admin context. It does not require the platform administrator to have a tenant `clientId`, and it does not weaken the tenant `/workspace/relevance` route.

The API verifies that the workspace belongs to the URL client ID. Mismatched client/workspace IDs return not found.

## Activation

Draft workspaces remain inactive. Existing activation paths must not bypass readiness checks.

Monitoring activation is deferred until publisher profiles, source channels, and source assignments exist.
