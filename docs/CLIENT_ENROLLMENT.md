# Client Enrollment

Client enrollment is a platform-admin workflow for creating a new NWS360 customer organization and its first monitoring workspace.

## Core Model

- A client is the organization.
- A workspace is what a team, desk, mission, project, report, or monitoring operation watches.
- One client may own multiple workspaces.
- Organization context is not monitoring scope.

Example:

- Client: U.S. Embassy Baghdad
- Organization context: represented country `US`, host country `IQ`
- Workspace: Iraq Daily Monitoring
- Monitoring scope: primary country `IQ`

The represented country must never be copied into workspace monitoring scope automatically.

## Supported Organization Types

The canonical organization types are:

- `embassy`
- `diplomatic_mission`
- `government_agency`
- `international_organization`
- `media`
- `media_company`
- `newsroom`
- `tv_station`
- `ngo`
- `humanitarian_organization`
- `research_organization`
- `university`
- `commercial_intelligence`
- `corporate`
- `other`

The type controls defaults and validation hints only. It must not permanently restrict features.

## Organization Profile

Organization profile fields live in `client_settings`:

- `representedCountryCode`
- `hostCountryCode`
- `headquartersCountryCode`
- `defaultTimezone`
- `defaultLanguages`
- `websiteUrl`
- `contactName`
- `contactEmail`

Diplomatic organizations require represented and host country codes. Non-diplomatic organizations may omit represented and host country codes.

Existing embassy helpers use `representedCountryCode` first, then fall back to legacy `homeCountryCode`. During diplomatic enrollment, the legacy home-country fields are synchronized for compatibility with existing category and reporting code.

## Lifecycle

Client lifecycle statuses:

- `setup`
- `active`
- `suspended`
- `archived`

Workspace statuses:

- `draft`
- `ready`
- `active`
- `paused`
- `archived`

Enrollment creates:

- client `active = true`
- client `lifecycleStatus = setup`
- first workspace `status = draft`
- first workspace `active = false`

This allows admins to manage setup without starting monitoring jobs.

## Idempotency

Every enrollment request must include `enrollmentKey`.

Retry behavior:

- same key and same normalized request returns the existing result
- same key and different normalized request returns conflict
- new key and duplicate slug returns conflict

The server stores a request fingerprint so browser retries cannot create duplicate clients.

## Atomic Writes

`POST /api/admin/client-enrollments` creates these records in one transaction:

1. client
2. client settings/profile
3. first draft workspace
4. workspace relevance profile
5. admin audit log

The endpoint does not create sources, publishers, channels, tenant users, articles, subscriptions, demo data, or processing jobs.

## Preview

`POST /api/admin/client-enrollments/preview` performs no writes. It validates and normalizes:

- slug
- countries
- regions
- workspace scope rules
- diplomatic country requirements
- creation plan

The response always declares `writes: false`.

## Authorization

Enrollment routes are platform-admin only and live under `/api/admin`.

The preserved platform administrator remains:

- `userScope = platform`
- `clientId = null`

The platform admin is not assigned to enrolled clients. Admin setup routes use explicit client and workspace IDs.
