# NWS360 - News Aggregation Platform

## Overview
NWS360 is a comprehensive news aggregation and intelligence platform. Its primary purpose is to fetch articles from various sources (RSS feeds, websites, social media), analyze them using AI for sentiment and keywords, and present this information through a modern, analytics-rich dashboard. The platform aims to provide users with a streamlined way to consume and understand news, offering features like multi-language support, article categorization, and user-centric data scoping. NWS360 is designed for businesses and individuals who require real-time, AI-powered news insights from diverse sources.

## User Preferences
- I prefer clear and concise information.
- I expect the agent to prioritize high-level architectural decisions over minor implementation details.
- I appreciate a streamlined approach, avoiding redundancy.
- I want the agent to focus on essential information for guiding a replit coding agent.
- I prefer to be asked before major changes or decisions are made.

## System Architecture
NWS360 employs a modern full-stack architecture. The frontend is built with **React**, leveraging **Vite** for fast development, styled using **Tailwind CSS** and **shadcn/ui** for a responsive and aesthetically pleasing interface. **wouter** handles routing, and **recharts** is used for data visualization within the dashboard.

The backend is powered by **Express.js**, managing API routes and server-side logic. User authentication is handled via **Passport.js** with local strategies and session management.

Data persistence is achieved using **PostgreSQL** as the relational database, interfaced through **Drizzle ORM**.

AI capabilities, including sentiment analysis, keyword/topic extraction, and country detection, are integrated via **OpenAI's gpt-4o-mini model** through Replit AI Integrations.

**Core Features and Design Principles:**
- **News Ingestion**: Utilizes `rss-parser` for real RSS feed fetching, with auto-discovery of RSS feeds from website URLs. Dedicated social media scrapers handle content from YouTube, Facebook, Instagram, X/Twitter, and Telegram.
- **AI Analysis Pipeline**: A decoupled pipeline where ingestion stores articles as `aiAnalysisStatus='pending'` and enqueues `ANALYZE_ARTICLE` jobs via the processing queue (server/processing-queue.ts). AI analysis runs asynchronously with OpenAI concurrency limited to 3 simultaneous calls to prevent event-loop starvation. The pipeline applies AI for sentiment, keywords, topics, summary, category, and country detection. An extended AI Intelligence layer (server/ai-intelligence.ts) performs deep analysis: entity extraction, story clustering, narrative comparison, event detection, daily briefs, trend predictions, and a conversational insight assistant.
- **Intelligence Hub**: A dedicated /intelligence page with 6 tabs: Story Clusters, Daily Briefs, Events & Alerts, Entity Tracking, Predictions, and AI Assistant. Supports Executive/Analyst mode toggle for different presentation styles.
- **Multi-tenancy & User Hierarchy**: Supports a multi-tenant model where admins create clients, and clients manage their sub-users. Data (sources, articles) is scoped to the user hierarchy via clientId, ensuring each user sees only relevant information.
- **Enterprise RBAC & Access Control**: Granular permission system with 23 permission codes across 8 resource categories. 4 default permission groups (Platform Admin, Organization Admin, Analyst, Viewer). Permission resolution combines group grants + direct user overrides. Authorization middleware (requirePermission/requireAnyPermission) gates route access. Tables: permission_groups, permissions, group_permissions, user_permission_groups, user_permissions, impersonation_logs. Frontend uses `usePermissions()` hook for permission-based UI rendering. Admin impersonation allows platform admins to view the platform as any organization/user, with full audit logging and session-based state management via `/api/admin/impersonate/*` endpoints.
- **Internationalization**: Full multi-language UI support (English, Arabic, French, Spanish, Turkish) with RTL layout capabilities and automatic article translation based on selected UI language. Translations are cached in `articleTranslations` table and processed asynchronously via `TRANSLATE_ARTICLE` jobs.
- **Performance & Scalability**: Features an in-process background job queue for asynchronous tasks, smart scheduling for priority-based feed refreshes, pre-computed analytics caching, and automated data retention policies. Extensive database indexing optimizes query performance.
- **Admin & Ops Dashboards**: Comprehensive admin panels for source, user, and client management, system settings, and audit logging. An operations dashboard provides insights into system health, feature flags, usage metrics, and recovery options.
- **Partner API**: A versioned API (`/api/v1/`) with Bearer token authentication, SHA-256 hashed API keys, and scope-based authorization for external integrations.
- **SaaS Platform**: Subscription-based model with three tiers (Basic/Pro/Enterprise), seat-based user limits with enforcement, guided client onboarding wizard, billing-ready architecture (activate/change-plan/cancel endpoints), usage transparency dashboard, and white-label customization for Enterprise clients.
- **Executive Home**: A simplified "morning intelligence snapshot" dashboard showing top story, coverage tone, emerging topics, alerts, latest brief preview, and top entities.
- **Demo Environment**: Public /demo page with sample data for prospective customers (no auth required).
- **Help Center**: Built-in glossary of platform terms, quick help guides, and support ticket submission form.
- **External Integrations**: Webhooks (HMAC SHA-256 signed), Slack/Teams communication channels, email subscriptions, embeddable widgets, JSON/CSV data exports, SSO (Google/Microsoft/SAML), data import connectors, mobile notification preferences. Admin integration monitoring dashboard.
- **Team Collaboration**: Threaded discussions on articles/stories/entities, analyst annotations (observation/warning/hypothesis/conclusion), shared briefings with shareable links, team workspaces, custom tagging system, task tracking with assignments, persistent watchlists, internal team alerts, version history, and activity feed.
- **Knowledge Memory & Historical Intelligence**: Persistent story timelines (active/dormant/recurring), recurring event detection with confidence scoring, historical comparison mode, actor/entity memory with biography and tone evolution, narrative evolution tracking (framing term shifts over time), organizational knowledge notes (context/policy/decision/reference), memory-aware historical alerts with similarity scoring, trend lifecycle tracking (emergence→growth→peak→decline→dormant→reactivation), long-range briefings (monthly/quarterly/yearly), and memory-enhanced AI answers that use stored institutional knowledge for context-aware responses.
- **Predictive Intelligence & Forecasting**: Topic trajectory prediction (momentum, acceleration, media amplification, 24h/7d probability estimates), early warning signals (new actors, tone shifts, cross-region clustering, volume surges), AI-powered scenario modeling/what-if analysis, risk scoring (operational/reputational/escalation), influence mapping (source cascade tracking), attention lifespan estimation (decay rate, days remaining), alert priority intelligence (accelerating coverage, multi-region spread, sentiment volatility), forecast explanation transparency layer, forecast evaluation & learning accuracy tracking, and forward-looking future briefings (possible escalations, emerging actors, fading topics).
- **UI/UX**: Features a unified design token system, refined color palette (with dark mode as default), professional typography, human-readable labels, trust indicators ("Updated X min ago"), and accessibility considerations (skip-to-content, ARIA labels).

## External Dependencies
- **OpenAI**: Used for AI-powered text analysis (sentiment, keywords, topics, summary, category, country detection) via the `gpt-4o-mini` model.
- **Express.js**: Backend web framework.
- **Passport.js**: Authentication middleware.
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: TypeScript ORM for interacting with PostgreSQL.
- **React**: Frontend UI library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: UI component library.
- **wouter**: React router library.
- **recharts**: Charting library for data visualization.
- **rss-parser**: Library for parsing RSS and Atom feeds.
- **i18next**: Internationalization framework for multi-language UI.
- **sanitize-html**: For input sanitization.
- **Brave Search API**: Used for background image backfill to resolve article images.
- **RSS Bridge Services / Nitter Instances**: Utilized as fallback or primary methods for fetching content from Facebook, Instagram, and X/Twitter when direct RSS is unavailable.