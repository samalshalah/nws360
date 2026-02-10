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
- Responsive design with dark mode support
- Social media support: YouTube channels, Facebook pages, Instagram profiles, X/Twitter accounts
- Multi-language UI (English, Arabic, French, Spanish, Turkish) with RTL support
- AI-powered article translation to any supported language

## Database Schema
- `users`: id, username, password, role (admin/client), createdAt
- `sources`: id, name, url, type, active, intervalMinutes, lastFetchedAt, createdAt
- `articles`: id, title, content, summary, url, sourceId, publishedAt, language, sentimentScore, sentimentLabel, keywords[], createdAt
- `keywords`: id, term, createdAt

## API Routes
- Auth: POST /api/login, POST /api/register, POST /api/logout, GET /api/user
- Sources: GET /api/sources, POST /api/sources, PATCH /api/sources/:id, DELETE /api/sources/:id
- Manual Fetch: POST /api/sources/:id/fetch, POST /api/fetch-all
- Articles: GET /api/articles (with search, filters, pagination), GET /api/articles/:id
- Keywords: GET /api/keywords, POST /api/keywords, DELETE /api/keywords/:id
- Analytics: GET /api/analytics/stats
- Translation: POST /api/articles/:id/translate (body: { targetLanguage })

## Feed Worker
- Located in `server/feed-worker.ts`
- Uses rss-parser to fetch RSS/Atom feeds
- Auto-discovers RSS feed URLs from website URLs
- Runs AI analysis (sentiment + keywords) on each new article
- Deduplicates by article URL
- Runs every 1 minute automatically, with initial fetch on startup
- Supports source types: rss, website, twitter, youtube, facebook, instagram

## Social Media Fetchers (server/web-scraper.ts)
- **YouTube**: Extracts channel ID from handle/URL, fetches via YouTube RSS feeds
- **Facebook**: Tries RSS bridge services (rsshub.app), falls back to mbasic.facebook.com scraping
- **Instagram**: Tries RSS bridge services, falls back to profile page scraping for post links
- **Twitter/X**: Tries Nitter RSS instances, falls back to syndication.twitter.com scraping

## Recent Changes
- 2026-02-10: Added multi-language UI support (English, Arabic, French, Spanish, Turkish) with i18next
- 2026-02-10: Added RTL layout support for Arabic
- 2026-02-10: Added AI-powered article translation via OpenAI
- 2026-02-10: Added language selector in sidebar and login page
- 2026-02-10: Added YouTube, Facebook, and Instagram source type support
- 2026-02-10: Updated fetch interval to 1 minute
- 2026-02-10: Added real RSS feed fetching with rss-parser
- 2026-02-10: Replaced mock data with live feeds from TechCrunch, The Verge, BBC, Reuters, Al Jazeera
- 2026-02-10: Added manual fetch endpoints (per source and all sources)
- 2026-02-10: Analytics now uses real database aggregations for sentiment and keywords
- 2026-02-10: Auto-fetches articles when a new source is added
