# Canonical Ingestion Linkage

Linked sources preserve the existing ingestion engine and add publisher-channel appearances for accepted stories.

## Legacy Behavior

Sources with `publisher_channel_id = null` continue to use the previous ingestion behavior. They do not require article appearances and are not forced into workspace assignments.

## Linked Sources

For sources with `publisher_channel_id`:

- active workspace assignments determine which workspace relevance profiles are evaluated
- accepted fetched items create an `article_appearances` row
- the appearance stores publisher channel, source, original URL, normalized URL, collector metadata, headline, caption, language, publication time, and engagement metadata
- duplicate appearances are ignored safely

## Canonical Boundary

Canonical article matching remains client-scoped and publisher-aware.

Safe matching order:

1. Exact normalized original URL.
2. Exact publisher external ID when available.
3. Existing strict canonical fingerprint only when confidence is high.

The same publisher story across website, RSS, and social can become one canonical article with multiple appearances. Different publishers covering the same event remain separate articles.

## Google News

Google News remains a collector. It is not counted as the publisher when the sub-source is known. Collector URL, query, edition, and source metadata stay in source or appearance metadata.

No historical article appearance backfill is included in this sprint.
