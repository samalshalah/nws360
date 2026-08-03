# Publisher Channels

Publisher channels are official external channels owned by a publisher profile.

## Supported Types

- website
- rss
- telegram
- facebook
- x
- youtube
- instagram
- tiktok
- linkedin
- television
- radio
- podcast
- newsletter
- api
- other

`google_news` is intentionally not supported as a publisher channel type because Google News is collector metadata.

## Normalization

Channel normalization is shared in `shared/publisher-catalog.ts`.

Rules include:

- Website URLs use lowercase hosts, remove known tracking parameters, and normalize trailing slashes.
- RSS URLs preserve meaningful query parameters and strip only known tracking parameters.
- Telegram channels normalize to `https://t.me/<handle>` and warn on invite-style URLs.
- X and Twitter normalize to `https://x.com/<handle>`.
- YouTube prefers `/channel/<id>` when available and supports handle URLs.
- Social channel handles are normalized without creating a new publisher profile.

## Uniqueness

Each channel has a deterministic `channelKey`:

- `publisher:25:website:https://example.com/`
- `publisher:25:telegram:examplechannel`
- `publisher:25:youtube:UC12345`

The schema also protects normalized URLs so the same official URL is not created twice as active catalog identity.

Channel creation and URL changes acquire an advisory transaction lock based on the normalized channel identity, then rely on database uniqueness as the final protection. A duplicate concurrent request returns a safe conflict instead of creating a partial channel or audit row.

## Validation

The validation endpoint performs the channel test on the server. The browser cannot declare a channel `valid`.

Network-tested channels:

- `website`: reachable HTTP response and final URL compatible with the publisher domain.
- `rss`: reachable HTTP response and RSS or Atom structure.

Social channels are normalized and safety-checked, then marked `needs_review` unless a supported safe reachability test is available. Television, radio, and other manual channels require manual review.

Validation blocks unsafe destinations before request:

- localhost and loopback
- private network ranges
- link-local addresses
- cloud metadata addresses
- redirects into blocked destinations

Manual override is a separate audited action and requires a reason. It records that no network test occurred.

## Source Linkage

The existing `sources` table has optional `publisherChannelId`.

This means:

- one source may reference one publisher channel
- one publisher channel may have many source records across clients or fetch configurations
- legacy sources remain valid when `publisherChannelId` is `null`
- publisher channel creation does not create a source

Credentials do not belong in publisher channel metadata. Credentials remain in protected integration/source configuration.
