# Iraq Daily Media Report Taxonomy

This taxonomy classifies article subjects for embassy, NGO, and media-monitoring tenants in Iraq. Category answers: "What is this article mainly about?" It must not encode source outlet, platform, language, province, workflow status, or urgency.

Each embassy is a separate tenant. The core Iraq categories stay shared across tenants. The bilateral-relations category uses one stable internal code, `client_bilateral_relations`, and its display label and classification aliases come from the tenant embassy profile.

## Article Categories

| Order | Code | Default label | Use when the article is mainly about |
| --- | --- | --- | --- |
| 1 | `iraqi_government` | Iraqi Government | Prime Minister's Office, Presidency, Council of Ministers, federal ministries, state institutions, government decisions, appointments, programs, official statements, and executive activity. |
| 2 | `parliament_politics` | Parliament & Political Affairs | Council of Representatives, legislation, political parties, coalitions, elections, parliamentary committees, negotiations, and disputes among political actors. |
| 3 | `security_stability` | Security & Stability | Terrorism, armed groups, militias, border security, military activity, police activity, violent incidents, organized crime, demonstrations involving security concerns, and threats to stability. |
| 4 | `economy_oil_finance` | Economy, Oil & Public Finance | Federal budget, oil and gas, exports, banking, currency, salaries, employment, inflation, trade, investment, private-sector activity, and public finance. |
| 5 | `development_services` | Development & Public Services | Reconstruction, electricity, water, roads, housing, transportation, healthcare services, education services, infrastructure, municipal services, and development projects. |
| 6 | `justice_accountability` | Justice, Corruption & Accountability | Courts, judiciary, corruption investigations, Integrity Commission activity, audits, legal accountability, arrests involving public officials, and rule-of-law developments. |
| 7 | `kurdistan_region` | Kurdistan Region | Kurdistan Regional Government, Erbil-Baghdad relations, Kurdish political parties, regional salaries, oil exports, security, institutions, and Kurdistan-specific developments. |
| 8 | `civil_society_humanitarian` | Civil Society, Humanitarian Affairs & Public Opinion | NGOs, human rights, displacement, minorities, women, youth, humanitarian programs, protests, public reaction, social concerns, and civil-society activity. |
| 9 | `united_nations` | United Nations & International Organizations | UNAMI, UNDP, UNICEF, WHO, IOM, UNHCR, WFP, UNESCO, World Bank, IMF, international organizations, donor programs, and international development institutions. |
| 10 | `client_bilateral_relations` | Bilateral Relations | Relations between Iraq and the tenant embassy's home country, including embassy statements, ambassador activity, official visits, bilateral agreements, trade, investment, security cooperation, cultural programs, development projects, visas, consular issues, and mentions of the tenant country's nationals, organizations, and companies. |
| 11 | `regional_international_relations` | Regional & International Relations | Iraq's relations with countries other than the tenant embassy's home country, neighboring states, regional powers, international diplomacy, sanctions, treaties, foreign-policy developments, and multilateral relations not led by the United Nations. |
| 12 | `media_narratives` | Media Narratives & Social Trends | Major media narratives, coordinated messaging, misinformation, social-media trends, influencer activity, changes in public discourse, and differences in how outlets frame the same issue. |
| 13 | `other` | Other | Relevant Iraq coverage that cannot reasonably be assigned to another category. |

## Embassy Profile

Embassy-specific monitoring is configured at the client settings level:

| Field | Purpose |
| --- | --- |
| `homeCountryCode` | Short country code, such as `US` or `FR`. |
| `homeCountryName` | Tenant home country name, such as `United States` or `France`. |
| `homeCountryAliases` | Country aliases used by deterministic classification, including English, Arabic, abbreviations, and adjectives. |
| `embassyAliases` | Embassy/mission names used to identify direct mission coverage. |
| `ambassadorAliases` | Current or relevant ambassador names. These are configurable and are not permanently hard-coded in the taxonomy. |
| `bilateralCategoryLabel` | Optional display override for `client_bilateral_relations`. |

U.S. Embassy pilot values:

- `homeCountryCode`: `US`
- `homeCountryName`: `United States`
- `homeCountryAliases`: `United States`, `United States of America`, `U.S.`, `US`, `USA`, `America`, `American`, `الولايات المتحدة`, `الولايات المتحدة الأمريكية`, `أميركا`, `أمريكا`, `أمريكي`, `الأمريكية`
- `embassyAliases`: `U.S. Embassy Baghdad`, `United States Embassy Baghdad`, `U.S. Embassy in Iraq`, `American Embassy Baghdad`, `السفارة الأمريكية`, `سفارة الولايات المتحدة`, `السفارة الأميركية`
- `ambassadorAliases`: tenant-configurable; no ambassador name is hard-coded
- `bilateralCategoryLabel`: `U.S.-Iraq Relations`

French Embassy example:

- `homeCountryCode`: `FR`
- `homeCountryName`: `France`
- `homeCountryAliases`: `France`, `French`, `فرنسا`, `فرنسي`
- `embassyAliases`: `French Embassy Baghdad`, `Embassy of France in Iraq`, `السفارة الفرنسية`
- `bilateralCategoryLabel`: `France-Iraq Relations`

## Label Resolution

Use the centralized helper:

```ts
getArticleCategoryLabel("client_bilateral_relations", clientProfile)
```

Expected behavior:

| Tenant profile | Displayed label |
| --- | --- |
| U.S. Embassy | U.S.-Iraq Relations |
| French Embassy | France-Iraq Relations |
| Missing configuration | Bilateral Relations |

Do not duplicate label-generation logic in React components, exports, analytics pages, saved views, or category selectors.

## Classification Rules

Each article has exactly one primary category. `client_bilateral_relations` applies only when Iraq's relationship with the tenant embassy's home country is the dominant subject. A passing mention of the tenant country is not enough.

Precedence examples:

| Article | Category |
| --- | --- |
| U.S. Embassy announces a bilateral education initiative | `client_bilateral_relations` for the U.S. Embassy tenant |
| Iraqi Ministry of Education launches a nationwide program partly funded by the U.S., but the main subject is the ministry program | `iraqi_government` or `development_services` |
| Parliament debates the presence of U.S. forces | `parliament_politics` if the debate is dominant; `client_bilateral_relations` if the bilateral relationship is dominant |
| Security forces conduct an operation with U.S. support | `security_stability` if the operation is dominant; `client_bilateral_relations` if the security partnership is dominant |
| Iran and Iraq discuss regional security | `regional_international_relations` |
| UNAMI issues an Iraq statement | `united_nations` |
| A coordinated social narrative attacks the U.S. Embassy | `media_narratives` if the campaign is dominant; `client_bilateral_relations` if the diplomatic relationship is dominant |
| French ambassador meets an Iraqi minister, viewed by a French Embassy tenant | `client_bilateral_relations` |
| French ambassador meets an Iraqi minister, viewed by a U.S. Embassy tenant | `regional_international_relations` unless it directly involves the United States |

## Not Categories

Do not turn these dimensions into article categories:

- Source outlet
- Television, radio, website, Facebook, X, Instagram, Telegram, Threads, YouTube
- Arabic, Kurdish, English, French, or any other language
- Baghdad, Erbil, Basra, or any other province
- Urgency or workflow status

Preserve these separate dimensions:

- `article.province`
- `article.language`
- `article.topics`
- `article.keywords`
- `article.manualTags`
- `article.priority`
- `article.workflowStatus`
- `source.type`
- `source.country`
- `source.category`
- source name and platform data

## Priority

Priority is separate from category.

| Code | Label | Use when |
| --- | --- | --- |
| `routine` | Routine | Normal monitoring item. Default for new articles. |
| `important` | Important | High-value policy, institutional, diplomatic, budget, oil, corruption, or KRG item that needs analyst attention but is not breaking. |
| `urgent` | Urgent | Breaking or time-sensitive item requiring prompt review. |
| `critical` | Critical | Major security incident, severe escalation, mass-casualty risk, or crisis-level event requiring immediate attention. |

Urgency must never return as an article category. A story can be `client_bilateral_relations` plus `urgent`, or `security_stability` plus `critical`.

## Backward Mapping

| Old category | New category | Priority handling |
| --- | --- | --- |
| `us_iraq_international` | `client_bilateral_relations` | Preserve existing priority or default routine |
| `bilateral_international_relations` | `regional_international_relations` | Preserve existing priority or default routine |
| `foreign_relations` | Subject inferred; fallback `regional_international_relations` | Preserve existing priority or default routine |
| `urgent` | Subject inferred; fallback `other` | Set `priority = urgent` unless already important/urgent/critical |
| `political`, `parliament_law` | `parliament_politics` | Preserve existing priority or default routine |
| `security` | `security_stability` | Preserve existing priority or default routine |
| `economy`, `oil_energy`, `banking_currency`, `business` | `economy_oil_finance` | Preserve existing priority or default routine |
| `government_services` | `iraqi_government` | Preserve existing priority or default routine |
| `health`, `education`, `environment_water` | `development_services` | Preserve existing priority or default routine |
| `corruption_courts` | `justice_accountability` | Preserve existing priority or default routine |
| `protests_public_opinion`, `humanitarian_ngos`, `culture_society` | `civil_society_humanitarian` | Preserve existing priority or default routine |
| `provinces`, `tech`, `sports`, `science`, `entertainment`, `general`, `other` | Subject inferred; fallback `other` | Preserve existing priority or default routine |

## Migration And Backfill

- Preview migration only: `npm run db:migrate:iraq-taxonomy`
- Apply migration after a verified Neon backup: `npm run db:migrate:iraq-taxonomy -- --apply --confirm-backup`
- Preview selected unclear articles: `npm run reclassify:iraq-taxonomy -- --dry-run`
- Deterministic classifier backfill preview: `npm run data:backfill-categories -- --dryRun=true --clientId=<id>`
- Apply deterministic backfill for one tenant after review: `npm run data:backfill-categories -- --clientId=<id>`

## Safe Migration of Existing Articles

The Iraq taxonomy migration is dry-run by default. `npm run db:migrate:iraq-taxonomy` must not change the database. It reviews existing articles in place and proposes only two article-field changes:

- `category`
- `priority`

The migration must not delete articles, re-import feeds, regenerate IDs, change tenant/source ownership, rewrite titles/content/summaries/URLs/dates/language/country/province, overwrite keywords/topics/manual tags/workflow fields, or break bookmarks, translations, report-basket items, discussions, annotations, tasks, alerts, or other article relationships.

Dry-run output includes:

- Number of records using every old category
- Number of records using every old priority
- Proposed new category counts
- Proposed new priority counts
- Number of records moved to each category
- Priority changes
- Records requiring updates and records unchanged
- Records ending in `other`
- Records with insufficient title/content
- Counts grouped by `clientId`
- Up to 20 uncertain samples with article ID, client ID, title, old/new category, old/new priority, and classification reason
- Final total article count
- Structured JSON audit metadata with migration name, timestamp, mode, git SHA, database identifier without credentials, movements, integrity snapshot, duration, and success/failure

Apply mode is intentionally gated:

```bash
npm run db:migrate:iraq-taxonomy -- --apply --confirm-backup
```

`--apply` without `--confirm-backup` aborts before connecting to the database. The command prints:

```text
Create and verify a Neon database backup before applying this migration.
```

Apply mode runs in a transaction. Before and after the update it verifies:

- Article count and article IDs are unchanged
- Tenant ownership, source ownership, URL, workflow status, manual tags, title/content/summary/date/language/location/engagement/cross-post fields are unchanged
- Relationship counts and article-link checksums are unchanged for `article_id` tables and article-target collaboration/report tables
- Only valid category and priority codes are written

If any integrity check fails, the transaction rolls back and exits non-zero.

Uncertain records are preserved. The migration reports them for review but does not overwrite workflow status or manual tags. Use targeted reclassification for selected unclear articles:

```bash
npm run reclassify:iraq-taxonomy -- --dry-run
npm run reclassify:iraq-taxonomy -- --category other --limit 50 --dry-run
npm run reclassify:iraq-taxonomy -- --client-id <id> --category other --limit 100 --dry-run
npm run reclassify:iraq-taxonomy -- --article-id <id> --apply --confirm-backup
```

The migration is idempotent, preserves tenant isolation, and does not delete article records.
