# NWS360 - News Aggregation Platform

## Overview
NWS360 is a full-stack news aggregation and intelligence platform that fetches articles from RSS feeds and websites, analyzes them with AI for sentiment and keywords, and displays them in a modern dashboard with analytics.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter (routing) + recharts (charts)
- **Backend**: Express.js + Passport.js (local auth with sessions)
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: OpenAI (gpt-5-nano) via Replit AI Integrations for sentiment analysis & keyword extraction
- **RSS Parsing**: rss-parser for fetching real RSS feeds

## Key Features
- Real RSS feed fetching from any website (auto-discovers RSS feeds)
- AI-powered sentiment analysis and keyword extraction on articles
- Background worker that auto-fetches news every 1 minute
- Manual fetch trigger per source or all sources
- Dashboard with analytics (sentiment distribution, trending keywords)
- Admin panel for managing sources and keywords
- User authentication (email/password with passport-local)
- Responsive design with dark mode support (light/dark/system toggle)
- Social media support: YouTube channels, Facebook pages, Instagram profiles, X/Twitter accounts, Telegram channels
- Multi-language UI (English, Arabic, French, Spanish, Turkish) with RTL support
- Auto-translation of all articles based on selected UI language
- Article categorization (political, health, tech, sports, business, entertainment, science, urgent, general)
- Filtering by channel, source type, sentiment, category, and date range (today/week/month)
- Article bookmarking with saved articles page
- Share/copy-link for articles
- Bulk article operations (select all, bulk delete)
- CSV export of filtered articles
- Breaking news notifications for urgent articles (polls every 60s)
- Multi-tenant user hierarchy (admin creates clients, clients create sub-users)
- User management with create user form (admin/client can manage their users)
- Sources and articles scoped to user hierarchy (each user sees only their own data)
- Source health monitoring with success rates and error logs
- Rate limiting (200 req/15min API, 20 req/15min auth)
- Input sanitization with sanitize-html

## Database Schema
- `users`: id, username, password, role (admin/client), parentId, createdAt
- `sources`: id, name, url, type, active, intervalMinutes, retentionDays, userId, lastFetchedAt, createdAt
- `articles`: id, title, content, summary, url, sourceId, publishedAt, language, sentimentScore, sentimentLabel, keywords[], category, imageUrl, subSource, createdAt
- `keywords`: id, term, createdAt
- `bookmarks`: id, userId, articleId, createdAt (unique on userId+articleId)
- `source_fetch_logs`: id, sourceId, status, articlesFound, errorMessage, fetchedAt

## API Routes
- Auth: POST /api/login, POST /api/register, POST /api/logout, GET /api/user
- Users: GET /api/users, POST /api/users, PATCH /api/users/:id/role, DELETE /api/users/:id
- Sources: GET /api/sources, POST /api/sources, PATCH /api/sources/:id, DELETE /api/sources/:id
- Manual Fetch: POST /api/sources/:id/fetch, POST /api/fetch-all
- Articles: GET /api/articles (with search, filters, pagination), GET /api/articles/:id
- Bookmarks: GET /api/bookmarks, POST /api/bookmarks, DELETE /api/bookmarks/:articleId
- Bulk: POST /api/articles/bulk-delete, POST /api/articles/bulk-categorize
- Export: GET /api/articles/export (CSV)
- Urgent: GET /api/articles/urgent (breaking news)
- Users (admin): GET /api/users, PATCH /api/users/:id/role, DELETE /api/users/:id
- Source Health: GET /api/source-health, GET /api/source-health/:sourceId/logs
- Keywords: GET /api/keywords, POST /api/keywords, DELETE /api/keywords/:id
- Analytics: GET /api/analytics/stats
- Translation: Auto-translates articles based on `lang` query param in GET /api/articles

## Feed Worker
- Located in `server/feed-worker.ts`
- Uses rss-parser to fetch RSS/Atom feeds
- Auto-discovers RSS feed URLs from website URLs
- Runs AI analysis (sentiment + keywords) on each new article
- Deduplicates by article URL
- Runs every 1 minute automatically, with initial fetch on startup
- Supports source types: rss, website, twitter, youtube, facebook, instagram, telegram

## Social Media Fetchers (server/web-scraper.ts)
- **YouTube**: Extracts channel ID from handle/URL, fetches via YouTube RSS feeds
- **Facebook**: Tries RSS bridge services (rsshub.app), falls back to mbasic.facebook.com scraping
- **Instagram**: Tries RSS bridge services, falls back to profile page scraping for post links
- **Twitter/X**: Tries Nitter RSS instances, falls back to syndication.twitter.com scraping
- **Telegram**: Scrapes public channel preview pages via t.me/s/channel

## Recent Changes
- 2026-02-11: Google News articles show publisher favicon + name as visual fallback when article images are unavailable
- 2026-02-11: Generic Google placeholder images (lh3.googleusercontent.com) are filtered out from articles
- 2026-02-11: Background image backfill via Brave Search resolves real article URLs and fetches og:image (rate-limited, processes ~2 articles per cycle)
- 2026-02-11: Added publisher domain mapping (30+ publishers) for favicon display and URL resolution
- 2026-02-11: Google News feeds now extract sub-source publisher name (e.g., CNN, Reuters) and article images (via og:image fallback)
- 2026-02-11: Added subSource field to articles schema for tracking original publisher
- 2026-02-11: ArticleCard shows sub-source with "via" label for Google News articles
- 2026-02-11: Restructured sidebar navigation with collapsible Sources sub-menu (Add Source, Manage Sources, Keywords)
- 2026-02-11: Fixed AI sentiment analysis - switched from gpt-5-nano to gpt-4o-mini model
- 2026-02-11: Added /api/reanalyze endpoint and UI button to re-analyze articles with AI
- 2026-02-11: Improved News Feed page with pagination (24 per page), article count, clear filters
- 2026-02-11: Added sentiment validation to only accept positive/negative/neutral values
- 2026-02-10: Redesigned Admin page to rss.app-style interface with source type grid, topic categories, search bar, and inline form with sliders
- 2026-02-10: Added maxArticlesPerFetch setting per source (1-50 posts per fetch)
- 2026-02-10: Renamed sidebar "Admin" to "Add Source"
- 2026-02-10: Added Google News keyword-based source type (fetches news via Google News RSS search)
- 2026-02-10: Added website search/discovery feature in Add Source dialog (searches for news websites and detects RSS feeds)
- 2026-02-10: Added article images pulled from sources (RSS media:content, enclosures, YouTube thumbnails, Telegram photos, website images)
- 2026-02-10: Added per-source article retention setting (1-30 days) with automatic cleanup
- 2026-02-10: Added article categorization (political, health, tech, sports, business, entertainment, science, urgent, general)
- 2026-02-10: Added auto-translation of all articles based on selected UI language
- 2026-02-10: Added filtering by channel, source type, sentiment, and category
- 2026-02-10: Added Telegram channel support
- 2026-02-10: Added multi-language UI support (English, Arabic, French, Spanish, Turkish) with i18next
- 2026-02-10: Added RTL layout support for Arabic
- 2026-02-10: Added language selector in sidebar and login page
- 2026-02-10: Added YouTube, Facebook, and Instagram source type support
- 2026-02-10: Updated fetch interval to 1 minute
- 2026-02-10: Added real RSS feed fetching with rss-parser
- 2026-02-10: Replaced mock data with live feeds from TechCrunch, The Verge, BBC, Reuters, Al Jazeera
- 2026-02-10: Added manual fetch endpoints (per source and all sources)
- 2026-02-10: Analytics now uses real database aggregations for sentiment and keywords
- 2026-02-10: Auto-fetches articles when a new source is added
