# Article Appearances

`article_appearances` prepares NWS360 for one canonical article with multiple channel appearances.

## Purpose

The table preserves each place where a story appeared without treating every cross-post as a separate story.

Examples for one canonical article:

- original website article
- RSS item pointing to the article
- Telegram post
- Facebook post
- Google News collector result

Different publishers covering the same event remain separate canonical articles. Event clustering is separate and deferred.

## Fields

Important fields include:

- `clientId`
- `articleId`
- `publisherProfileId`
- `publisherChannelId`
- `sourceId`
- `appearanceKey`
- `appearanceType`
- `originalUrl`
- `normalizedOriginalUrl`
- `collectorUrl`
- `collectorType`
- `collectorQuery`
- `collectorEdition`
- `externalId`
- `headline`
- `caption`
- `languageCode`
- `publishedAt`
- `discoveredAt`
- `engagementMetadata`
- `metadata`
- `isPrimary`

## Google News

Google News data belongs on the appearance:

- collector URL
- query
- edition
- language
- discovery timestamp

The actual publisher remains the publisher profile.

## Tenant Consistency

An appearance must stay inside one client boundary:

- `(articleId, clientId)` must match an article owned by that client.
- `(sourceId, clientId)` must match a source owned by that client when a source is present.
- `(publisherChannelId, publisherProfileId)` must match a channel owned by that publisher when both are present.
- Client-private publishers can only appear for their owning client.

The migration adds composite uniqueness and foreign-key protections for these relationships, and storage validates the same rules before insert.

## Primary Selection

Primary appearance selection is deterministic and prefers:

1. original publisher website article
2. official publisher RSS article pointing to the original
3. official long-form publisher channel
4. official social channel
5. collector result

The system preserves all appearances even when one is selected as primary.

## Deferred Integration

This phase adds schema and pure helpers only. Feed-worker integration and production backfill are deferred.
