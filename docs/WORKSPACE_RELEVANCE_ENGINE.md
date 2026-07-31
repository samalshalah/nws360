# Workspace Relevance Engine

NWS360 treats a client as an organization and a monitoring workspace as the team, desk, project, or report scope inside that organization. One client can own many workspaces, and the same article can receive different relevance decisions in different workspaces.

Examples:

- Al Jazeera: Global News, Middle East, Iraq Desk, Gulf Desk
- Research NGO: Iraq Water Security, MENA Displacement, Global Climate Migration
- U.S. Embassy Baghdad: Iraq Daily Monitoring, U.S.-Iraq Relations, Security Watch

## Permanent Statuses

The internal status values are generic and must not encode a country:

- `direct_scope_match`: The article's principal subject matches the configured workspace geography, topics, entities, organizations, industries, projects, or events.
- `material_scope_impact`: The event is outside primary scope but clearly has a material effect on it.
- `contextual`: Useful background, but not a direct or materially affecting story.
- `not_relevant`: No meaningful workspace connection.
- `needs_review`: Insufficient or conflicting evidence.

Default reporting includes only:

- `direct_scope_match`
- `material_scope_impact`

`contextual`, `not_relevant`, and `needs_review` are excluded from dashboards, sentiment, trends, categories, priority counts, alerts, reports, briefings, and exports unless a review-specific workflow explicitly requests them.

## Workspace Profile

The reusable profile shape is implemented in [shared/workspace-relevance.ts](../shared/workspace-relevance.ts):

- `scopeMode`
- `globalScope`
- `primaryCountries`
- `secondaryCountries`
- `regions`
- `subnationalAreas`
- `topics`
- `subtopics`
- `industries`
- `entities`
- `organizations`
- `people`
- `projects`
- `events`
- `multilingualAliases`
- `inclusionPhrases`
- `exclusionPhrases`
- `impactPhrases`
- `contextualPhrases`
- `preferredLanguages`

Preferred interface:

```ts
evaluateWorkspaceRelevance(article, workspaceProfile)
```

There are no country-specific evaluator functions.

## Processing Order

1. Fetch source item.
2. Identify publisher and source channel.
3. Apply optional source technical filters.
4. Evaluate workspace relevance from metadata.
5. Extract full content when necessary.
6. Re-evaluate using cleaned content.
7. Accept, reject, hold, or mark contextual.
8. Only `direct_scope_match` and `material_scope_impact` continue to taxonomy, priority, sentiment, analytics, alerts, and reporting.

`not_relevant` items are written to `rejected_ingestion_items` for audit and do not enter reporting. `needs_review` and `contextual` can be stored for analyst workflows but remain excluded from default intelligence outputs.

## Per-Workspace Decisions

Article-level relevance fields remain as a client-level compatibility fallback. Workspace-specific decisions are stored in `article_workspace_relevance`, keyed by article and workspace.

Manual analyst decisions use `manual_override = true` and block automated updates until reopened.

## AI Fallback

Deterministic logic handles clear cases. The feed worker calls the existing tenant-aware AI gateway only when deterministic confidence is low or the item is `needs_review`.

AI must return structured JSON:

```json
{
  "relevanceStatus": "needs_review",
  "confidence": 50,
  "shortReason": "Insufficient article text to decide.",
  "matchedScope": [],
  "principalCountries": [],
  "materiallyAffectedCountries": [],
  "supportingSignals": []
}
```

Chain-of-thought is never requested or stored. AI failure returns `needs_review`.

## Query Protection

Server-side query guards default to `direct_scope_match` and `material_scope_impact` in:

- article feed
- urgent feed
- analytics and sentiment queries
- source behavior
- trends and topic analytics
- report/export article lookup
- saved feed views
- briefing/report baskets that call article lookup

Workspace-specific feeds may pass `workspaceId`; `getArticles` then filters against `article_workspace_relevance`.

## Validation

Run:

```bash
npm run test:workspace-relevance
npm run test:workspace-relevance-backfill
npm run build
npm run check
```

