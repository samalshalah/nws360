# Iraq Daily Media Report Taxonomy

This taxonomy classifies article subjects for diplomatic, NGO, and media-monitoring use in Iraq. Category answers: "What is this article mainly about?" It must not encode source type, social platform, language, province, workflow status, or urgency.

## Article Categories

| Order | Code | English label | Arabic label | Use when the article is mainly about | Exclude |
| --- | --- | --- | --- | --- | --- |
| 1 | `iraqi_government` | Iraqi Government | الحكومة العراقية | Prime Minister, Council of Ministers, ministries, federal agencies, executive decisions, official government statements | Parliament votes, party politics, local-only service issues |
| 2 | `parliament_politics` | Parliament & Political Affairs | البرلمان والشؤون السياسية | Parliament, legislation, parties, elections, coalitions, political blocs, formal political negotiations | Court cases, routine ministry statements |
| 3 | `security_stability` | Security & Stability | الأمن والاستقرار | Security incidents, military activity, armed groups, terrorism, border security, public safety, stability risks | Diplomatic reactions to security events unless the article is mainly about diplomacy |
| 4 | `economy_oil_finance` | Economy, Oil & Public Finance | الاقتصاد والنفط والمالية العامة | Budget, currency, banking, public finance, oil, gas, exports, salaries, markets, economic policy | Electricity or water service delivery unless tied mainly to finance/oil |
| 5 | `development_services` | Development & Public Services | التنمية والخدمات العامة | Infrastructure, electricity, water, health, education, housing, municipalities, transport, environment, service delivery | Corruption in services, which belongs in accountability |
| 6 | `justice_accountability` | Justice, Corruption & Accountability | العدالة والفساد والمساءلة | Courts, judiciary, integrity investigations, corruption, warrants, trials, audits, rule-of-law accountability | Parliament drafting laws unless enforcement/court action is central |
| 7 | `kurdistan_region` | Kurdistan Region | إقليم كردستان | KRG, Kurdistan Region institutions, Erbil-Baghdad disputes, Peshmerga, Kurdistan oil/salary files | National stories that only mention Erbil as a location |
| 8 | `civil_society_humanitarian` | Civil Society, Humanitarian Affairs & Public Opinion | المجتمع المدني والشؤون الإنسانية والرأي العام | NGOs, humanitarian needs, displaced people, refugees, minorities, human rights, activists, protests, public opinion | UN agency statements, unless the focus is local civil society response |
| 9 | `united_nations` | United Nations & International Organizations | الأمم المتحدة والمنظمات الدولية | UNAMI, UN agencies, international organizations, multilateral programs, institutional statements | Bilateral embassy activity without UN/IO involvement |
| 10 | `us_iraq_international` | U.S.-Iraq & International Relations | العلاقات الأمريكية العراقية والدولية | U.S.-Iraq relations, embassies, ambassadors, neighboring states, foreign policy, sanctions, bilateral meetings | UN activity, which uses `united_nations` |
| 11 | `media_narratives` | Media Narratives & Social Trends | السرديات الإعلامية والاتجاهات الاجتماعية | Media narratives, coordinated campaigns, misinformation, hashtags, viral debate, influencer discourse, social trend analysis | Articles merely collected from social media |
| 12 | `other` | Other | أخرى | Items outside the defined Iraq Daily Media Report taxonomy | Any item that can reasonably fit one of the above |

## Priority

Priority is separate from category.

| Code | Label | Use when |
| --- | --- | --- |
| `routine` | Routine | Normal monitoring item. Default for new articles. |
| `important` | Important | High-value policy, institutional, diplomatic, budget, oil, corruption, or KRG item that needs analyst attention but is not breaking. |
| `urgent` | Urgent | Breaking or time-sensitive item requiring prompt review. Old `urgent` category records migrate here. |
| `critical` | Critical | Major security incident, severe escalation, mass-casualty risk, or crisis-level event requiring immediate attention. |

Rules:

- Do not use `urgent` or `critical` as article categories.
- A story can be `security_stability` + `critical`, or `iraqi_government` + `important`.
- Workflow status remains separate. `for_report` means editorial/reporting workflow, not story priority.
- Province remains separate. A Baghdad electricity article is `development_services` with province `baghdad`, not a Baghdad category.

## Distinctions

- `iraqi_government` vs `development_services`: use `iraqi_government` for executive decisions and ministries as institutions; use `development_services` for service outcomes, projects, utilities, schools, hospitals, roads, and public delivery.
- `parliament_politics` vs `justice_accountability`: use `parliament_politics` for laws, votes, blocs, and elections; use `justice_accountability` for courts, warrants, corruption, and enforcement.
- `united_nations` vs `us_iraq_international`: use `united_nations` for UN/IO institutions; use `us_iraq_international` for bilateral diplomacy, embassies, neighbors, and foreign policy.
- `civil_society_humanitarian` vs `media_narratives`: use `civil_society_humanitarian` for real-world organizations, protests, rights, and humanitarian impact; use `media_narratives` for discourse, hashtags, misinformation, viral narratives, and coordinated campaigns.
- `kurdistan_region` overrides general economy, security, or politics when the article is mainly about KRG/Kurdistan Region institutions, Erbil-Baghdad disputes, Peshmerga, or Kurdistan oil/salary files.

## Backward Mapping

| Old category | New category | Priority handling |
| --- | --- | --- |
| `urgent` | Subject inferred from title/summary/content; fallback `other` | Set `priority = urgent` unless already important/urgent/critical |
| `political` | `parliament_politics` | Preserve existing priority or default routine |
| `security` | `security_stability` | Preserve existing priority or default routine |
| `economy` | `economy_oil_finance` | Preserve existing priority or default routine |
| `oil_energy` | `economy_oil_finance` | Preserve existing priority or default routine |
| `banking_currency` | `economy_oil_finance` | Preserve existing priority or default routine |
| `foreign_relations` | `us_iraq_international` | Preserve existing priority or default routine |
| `parliament_law` | `parliament_politics` | Preserve existing priority or default routine |
| `government_services` | `iraqi_government` | Preserve existing priority or default routine |
| `health` | `development_services` | Preserve existing priority or default routine |
| `education` | `development_services` | Preserve existing priority or default routine |
| `corruption_courts` | `justice_accountability` | Preserve existing priority or default routine |
| `provinces` | Subject inferred; fallback `other` | Province remains in the independent province field |
| `protests_public_opinion` | `civil_society_humanitarian` | Preserve existing priority or default routine |
| `humanitarian_ngos` | `civil_society_humanitarian` | Preserve existing priority or default routine |
| `business` | `economy_oil_finance` | Preserve existing priority or default routine |
| `tech` | Subject inferred; fallback `other` | Preserve existing priority or default routine |
| `environment_water` | `development_services` | Preserve existing priority or default routine |
| `culture_society` | `civil_society_humanitarian` | Preserve existing priority or default routine |
| `sports` | `other` | Preserve existing priority or default routine |
| `science` | `other` | Preserve existing priority or default routine |
| `entertainment` | `other` | Preserve existing priority or default routine |
| `general` | Subject inferred; fallback `other` | Preserve existing priority or default routine |
| `other` | `other` | Preserve existing priority or default routine |

## Migration And Backfill

- Schema migration: `npm run db:migrate:iraq-taxonomy`
- Deterministic classifier backfill: `npm run data:backfill-categories -- --dryRun=true`
- Apply deterministic backfill after review: `npm run data:backfill-categories`

The migration is designed to preserve tenant isolation and does not delete articles. Rows that cannot be safely inferred become `other`; those rows should be reviewed with the dry-run/backfill report before relying on historic category analytics.
