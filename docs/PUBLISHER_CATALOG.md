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

The key is not automatically changed when a display name is edited.

## Aliases

Aliases keep language-specific names and abbreviations attached to one publisher profile.

Examples:

- Iraqi News Agency
- INA
- وكالة الأنباء العراقية
- واع

Aliases are unique per publisher by normalized alias and language code.

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
