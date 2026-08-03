# Publisher Catalog

The publisher catalog is the canonical platform record for organizations that publish or produce content.

## Publisher, Channel, Source

- Publisher profile: the organization, such as Reuters, Shafaq News, Al Jazeera, Iraqi Ministry of Interior, or U.S. Embassy Baghdad.
- Publisher channel: an official external channel owned by the publisher, such as its website, RSS feed, Telegram channel, Facebook page, X account, YouTube channel, radio station, or API endpoint.
- Source: the existing operational ingestion configuration in `sources`. A source describes how NWS360 fetches content for a tenant or workspace. The publisher catalog does not replace `sources`.

A publisher channel can exist without a source. Selecting a publisher for a client does not activate monitoring, assign a workspace, enqueue a job, or create source records.

## Visibility

Publisher profiles have a `scopeType`:

- `global`: visible across the platform. `ownerClientId` must be `null`.
- `client_private`: visible only to the owning client and platform administrators. `ownerClientId` is required.

Tenant users must never see another client's private publisher. Platform administrators can manage both global and client-private publisher profiles.

## Canonical Key

`canonicalKey` is deterministic and unique:

- Global publisher: `global:shafaq-news`
- Client-private publisher: `client:14:private-monitoring-source`

The key is generated server-side when absent, validated against the publisher scope when supplied, and immutable after creation. A global publisher cannot use a `client:` key, and a client-private publisher cannot use a `global:` key or another client's owner ID.

## Domain Scope Key

Primary-domain uniqueness is enforced with a nullable `domainScopeKey`:

- `global:shafaq.com`
- `client:14:private-monitor.example`

The key is null when the publisher has no normalized primary domain. It is generated server-side from scope, owner, and normalized domain, and protected by a unique database index. The same domain can exist once globally and once per client-private owner because those are different scopes.

## Aliases

Aliases keep language-specific names and abbreviations attached to one publisher profile.

Examples:

- Iraqi News Agency
- INA
- وكالة الأنباء العراقية
- واع

Aliases are unique per publisher by normalized alias and language code. Missing or blank language is normalized to `und` so duplicate no-language aliases cannot bypass uniqueness through SQL null behavior.

## Readiness

This phase counts approved client publisher selections and eligible catalog channels only.

`sourceAssignmentsConfigured` remains `0` and monitoring remains not ready until the later workspace source-assignment model exists. A legacy `sources.publisherChannelId` link is useful metadata, but it is not a workspace assignment.

## Duplicate Preview

The preview endpoint is read-only and returns duplicate signals for:

- normalized primary domain match
- exact canonical alias match
- verified channel URL, handle, or external ID overlap
- similar name in the same country

The system does not automatically merge publishers. Manual merge is deferred.

## Google News

Google News is a collector, not a publisher.

Do not create `Google News` as a publisher profile or publisher-owned channel. Content discovered through Google News must preserve the actual publisher organization, actual publisher domain, original article URL, Google News collector URL, query, edition, language, and discovery timestamp.

## Deferred Work

This phase does not assign publisher channels to workspaces and does not change ingestion behavior. Source assignment and canonical ingestion are deferred to a later sprint.
