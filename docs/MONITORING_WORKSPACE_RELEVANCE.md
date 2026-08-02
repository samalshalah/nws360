# Monitoring Workspace Relevance

NWS360 treats a client as the organization and a workspace as the monitoring mission inside that organization. One embassy, newsroom, NGO, or commercial client can own several workspaces with different scopes.

Examples:

- Embassy client: Iraq daily monitoring, bilateral relations, security watch.
- News organization: global news, Middle East desk, Iraq desk.
- NGO client: Iraq water security, MENA displacement, global climate migration.

The canonical model is the existing `workspaces` table. The platform does not create a duplicate `monitoring_workspaces` table.

## Workspace Scope

Supported scope modes:

- `global`
- `regional`
- `single_country`
- `multi_country`
- `subnational`
- `topic_only`
- `hybrid`

Supported purposes:

- `diplomatic_monitoring`
- `newsroom_monitoring`
- `country_desk`
- `regional_desk`
- `global_news`
- `topic_research`
- `humanitarian_monitoring`
- `competitor_monitoring`
- `reputation_monitoring`
- `crisis_monitoring`
- `industry_intelligence`
- `custom`

Purpose provides defaults and recommendations only. It does not permanently restrict the workspace.

## Relevance Profile

Each workspace can have one `workspace_relevance_profiles` row. It stores editable topics, entities, aliases, inclusion terms, exclusion terms, impact terms, contextual terms, minimum confidence, and contextual-content behavior.

Relevance is not stored globally on `articles`. The source of truth is `article_workspace_relevance`, keyed by `workspace_id + article_id`, because the same article can be direct for one workspace and irrelevant for another.

## Statuses

Permanent internal statuses:

- `direct_scope_match`: the article's principal subject directly matches configured workspace scope.
- `material_scope_impact`: the principal event is outside scope but materially affects the configured scope.
- `contextual`: useful background, separate from direct coverage.
- `not_relevant`: no meaningful relationship to the workspace.
- `needs_review`: insufficient or conflicting evidence.

Default inclusion for feeds, analytics, alerts, reports, and briefings is:

- Include `direct_scope_match`
- Include `material_scope_impact`
- Exclude `contextual` unless explicitly enabled
- Exclude `not_relevant`
- Exclude `needs_review`

Contextual content must be presented in a labeled section, such as `Strategic Context`.

## Deterministic Evaluation

The first pass is deterministic. It evaluates article title, summary, content, URL, image title, article topics, article keywords, and configured workspace scope.

Signals include countries and aliases, regions, subnational locations, topics, industries, entities, organizations, people, projects, events, inclusion terms, exclusion terms, impact terms, and contextual terms.

Source country is metadata only. An Iraqi publisher can publish a Morocco story that is not relevant to an Iraq workspace, and a foreign publisher can publish a directly relevant Iraq story.

## AI Fallback

AI fallback is reserved for ambiguous cases. The expected structure is strict JSON with:

- `relevanceStatus`
- `confidence`
- `shortReason`
- `matchedScope`
- `principalCountryCodes`
- `materiallyAffectedCountryCodes`
- `supportingSignals`

Unsupported statuses, invalid JSON, timeouts, contradictory evidence, or AI gateway failure resolve to `needs_review`, not `not_relevant`.

## APIs

Workspace relevance APIs:

- `GET /api/workspaces`
- `GET /api/workspaces/:workspaceId`
- `GET /api/workspaces/:workspaceId/relevance-profile`
- `PUT /api/workspaces/:workspaceId/relevance-profile`
- `POST /api/workspaces/:workspaceId/relevance/preview`
- `GET /api/workspaces/:workspaceId/relevance/review`
- `PATCH /api/workspaces/:workspaceId/articles/:articleId/relevance`

All routes enforce workspace ownership through the authenticated tenant context. Request-body `clientId` is not trusted.

## UI

The tenant UI is available at `/workspace/relevance`. It provides:

- Workspace selector
- Relevance profile editor
- Geography, topic, entity, organization, and people lists
- Inclusion and exclusion terms
- Impact and contextual terms
- Contextual-content setting
- Relevance preview
- Needs-review queue
- Manual decision controls

Zero-client platform admin state remains unchanged.
