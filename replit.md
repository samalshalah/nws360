# NWS360 - News Aggregation Platform

## Overview
NWS360 is a full-stack news aggregation and intelligence platform that fetches articles from RSS feeds and websites, analyzes them with AI for sentiment and keywords, and displays them in a modern dashboard with analytics.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter (routing) + recharts (charts)
- **Backend**: Express.js + Passport.js (local auth with sessions)
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: OpenAI (gpt-4o-mini) via Replit AI Integrations for sentiment analysis, keyword/topic extraction & country detection
- **RSS Parsing**: rss-parser for fetching real RSS feeds

## Key Features
- Real RSS feed fetching from any website (auto-discovers RSS feeds)
- AI-powered sentiment analysis and keyword extraction on articles
- Background worker that auto-fetches news every 5 minutes (configurable via FEED_REFRESH_MINUTES env var)
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
- `users`: id, username, password, role (admin/client), parentId, clientId, disabled, createdAt
- `sources`: id, name, url, type, active, intervalMinutes, retentionDays, userId, lastFetchedAt, refreshPriority, country, deletedAt, createdAt
- `articles`: id, title, content, contentClean, summary, url, sourceId, publishedAt, ingestedAt, language, country, sentimentScore, sentimentLabel, keywords[], topics[], category, imageUrl, subSource, createdAt
- `keywords`: id, term, createdAt
- `bookmarks`: id, userId, articleId, createdAt (unique on userId+articleId)
- `source_fetch_logs`: id, sourceId, status, articlesFound, errorMessage, retryCount, durationMs, pipelineStep, fetchedAt
- `processing_jobs`: id, type, status, priority, payload, result, attempts, maxAttempts, runAt, startedAt, completedAt, createdAt
- `system_errors`: id, severity, component, message, stack, metadata, createdAt, resolvedAt
- `api_keys`: id, name, keyHash, keyPrefix, clientId, scopes[], rateLimit, active, lastUsedAt, expiresAt, createdAt
- `analytics_cache`: id, metricType, period, data, computedAt, expiresAt
- `clients`: id, name, organizationType, defaultLanguage, active, allowedRegions[], createdAt
- `client_keywords`: id, clientId, keyword, priority, createdAt
- `system_settings`: id, key, value, updatedAt
- `admin_audit_logs`: id, userId, action, entity, entityId, details, createdAt

## API Routes
- Auth: POST /api/login, POST /api/register, POST /api/logout, GET /api/user
- Users: GET /api/users, POST /api/users, PATCH /api/users/:id/role, DELETE /api/users/:id
- Sources: GET /api/sources, POST /api/sources, PATCH /api/sources/:id, DELETE /api/sources/:id
- Manual Fetch: POST /api/sources/:id/fetch, POST /api/fetch-all
- Articles: GET /api/articles (with search, filters, pagination, max 100/page), GET /api/articles/:id
- Bookmarks: GET /api/bookmarks, POST /api/bookmarks, DELETE /api/bookmarks/:articleId
- Bulk: POST /api/articles/bulk-delete, POST /api/articles/bulk-categorize
- Export: GET /api/articles/export (CSV)
- Urgent: GET /api/articles/urgent (breaking news)
- Source Health: GET /api/source-health, GET /api/source-health/:sourceId/logs
- Ingestion Logs: GET /api/ingestion-logs?from=&to=&limit=&offset=
- Keywords: GET /api/keywords, POST /api/keywords, DELETE /api/keywords/:id
- Analytics: GET /api/analytics/stats
- Translation: Auto-translates articles based on `lang` query param in GET /api/articles
- Admin: GET/PUT /api/admin/settings, GET /api/admin/system-health, GET /api/admin/audit-logs
- Admin: GET /api/admin/system-errors, GET /api/admin/queue-stats
- Admin: POST /api/admin/compute-analytics, POST /api/admin/run-retention
- Admin: GET/POST /api/admin/api-keys, DELETE /api/admin/api-keys/:id
- Partner API v1: GET /api/v1/articles, GET /api/v1/trending-topics, GET /api/v1/sentiment, GET /api/v1/keywords

## Performance & Scalability
- **Background Job Queue**: In-process job queue (server/processing-queue.ts) with claim/complete/fail cycle, 5-sec polling, exponential backoff retry (max 3 attempts)
- **Smart Scheduling**: Priority-based feed refresh (high=5min, medium=10min, low=15min) via refreshPriority field on sources
- **Analytics Caching**: Pre-computed metrics (volume, topics, sentiment, keywords) for 7-day and 30-day periods, refreshed every 15 minutes (server/analytics-worker.ts)
- **Data Retention**: Automated cleanup respecting per-source retentionDays, removes orphaned articles, cleans fetch logs >30d and errors >90d (server/data-retention-worker.ts)
- **Database Indexes**: 12+ indexes on articles (sourceId, publishedAt, sentimentLabel, category, country), sources (userId, active), users (username)

## Partner API
- Endpoint prefix: /api/v1/
- Authentication: Bearer token with SHA-256 hashed API keys (nws_ prefix + 32-byte hex)
- Scopes: articles:read, analytics:read
- Rate limiting: per-key, configurable (default 100/min)
- Pagination: max 50 items per request, lean responses (no raw content)
- Key management via Admin Dashboard

## Feed Worker
- Located in `server/feed-worker.ts`
- Uses rss-parser to fetch RSS/Atom feeds
- Auto-discovers RSS feed URLs from website URLs
- Deterministic pipeline: FETCH -> CLEAN -> STRUCTURE -> ANALYZE -> STORE
- AI analysis extracts: sentiment, keywords, topics, summary, category, country
- Retry logic: up to 3 retries with exponential backoff per source
- Failed sources are skipped without crashing the worker
- Structured logging with source name, duration, success/failure, article count
- Deduplicates by article URL
- Runs every 5 minutes by default (configurable via FEED_REFRESH_MINUTES env var)
- Supports source types: rss, website, twitter, youtube, facebook, instagram, telegram, google_news

## Social Media Fetchers (server/web-scraper.ts)
- **YouTube**: Extracts channel ID from handle/URL, fetches via YouTube RSS feeds
- **Facebook**: Tries RSS bridge services (rsshub.app), falls back to mbasic.facebook.com scraping
- **Instagram**: Tries RSS bridge services, falls back to profile page scraping for post links
- **Twitter/X**: Tries Nitter RSS instances, falls back to syndication.twitter.com scraping
- **Telegram**: Scrapes public channel preview pages via t.me/s/channel

## Recent Changes
- 2026-02-12: Added Partner API v1 with Bearer token authentication, SHA-256 hashed API keys, scope-based authorization
- 2026-02-12: Added API key management UI in Admin Dashboard (create, deactivate, copy key)
- 2026-02-12: Added background processing queue with claim/complete/fail cycle and exponential backoff
- 2026-02-12: Added analytics caching worker (7-day and 30-day metrics, refreshed every 15min)
- 2026-02-12: Added data retention worker (per-source cleanup, orphan removal, log cleanup)
- 2026-02-12: Enhanced Admin Logs & Health tab with sub-tabs: System Health, System Errors, API Keys, Audit Logs
- 2026-02-12: Added queue stats, compute analytics, and run retention admin actions
- 2026-02-12: Added 12+ database indexes for query optimization
- 2026-02-12: Added processing_jobs, system_errors, api_keys, analytics_cache tables
- 2026-02-12: Added Admin Dashboard page (/admin/dashboard) with 5 tabs: Sources, Clients, Users & Permissions, System Settings, Logs & Health
- 2026-02-12: Added clients table for multi-tenant client profiles (name, orgType, language, regions)
- 2026-02-12: Added client_keywords table for per-client keyword tracking with priority
- 2026-02-12: Added system_settings table for key-value system configuration
- 2026-02-12: Added admin_audit_logs table for tracking all admin mutations
- 2026-02-12: Extended users with clientId FK, disabled boolean, viewer role support
- 2026-02-12: Extended sources with country, refreshPriority, deletedAt (soft-delete pattern)
- 2026-02-12: Added 11 admin-only API routes with requireAdmin guard and automatic audit logging
- 2026-02-12: Sources now support soft-delete with restore capability
- 2026-02-12: Admin sidebar link visible only to admin-role users
- 2026-02-11: Google News articles show publisher favicon + name as visual fallback when article images are unavailable
- 2026-02-11: Generic Google placeholder images (lh3.googleusercontent.com) are filtered out from articles
- 2026-02-11: Background image backfill via Brave Search resolves real article URLs and fetches og:image (rate-limited, processes ~2 articles per cycle)
- 2026-02-11: Added publisher domain mapping (30+ publishers) for favicon display and URL resolution
- 2026-02-11: Google News feeds now extract sub-source publisher name (e.g., CNN, Reuters) and article images (via og:image fallback)
- 2026-02-11: Added subSource field to articles schema for tracking original publisher
- 2026-02-11: ArticleCard shows sub-source with "via" label for Google News articles
- 2026-02-11: Restructured sidebar navigation with collapsible Sources sub-menu (Add Source, Manage Sources, Keywords)
- 2026-02-11: Fixed AI sentiment analysis - switched from gpt-5-nano to gpt-4o-mini model
- 2026-02-12: Comprehensive visual identity overhaul: unified design tokens, refined color palette (light/dark), professional typography
- 2026-02-12: Dark mode as default theme for new users; theme persists via localStorage
- 2026-02-12: Human-readable labels across the app (Sentiment → Tone of Coverage, Ingestion → Source Activity, etc.)
- 2026-02-12: Trust signals: "Updated X min ago" indicators on Dashboard, Analytics, and Right Panel
- 2026-02-12: Click-to-explore: category badges, sentiment badges, topics, sources all navigate to filtered feed views
- 2026-02-12: Export capabilities: chart PNG export, CSV data export buttons on all analytics charts
- 2026-02-12: Daily brief PDF export utility with branded NWS360 template
- 2026-02-12: Accessibility: skip-to-content link, ARIA labels on main regions, semantic aside/main roles, keyboard-friendly theme toggle
- 2026-02-12: Reusable components: UpdatedAt (relative timestamps), ExportButton (PNG/CSV dropdown)
- 2026-02-12: Smooth animations: animate-fade-in, animate-slide-up with prefers-reduced-motion support
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
