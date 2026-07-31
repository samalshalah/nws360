# Embassy Profile Configuration

NWS360 supports multiple embassy tenants with one shared Iraq taxonomy. Tenant-specific bilateral monitoring is configured through `client_settings`, not by creating country-specific article category codes.

## Fields

| Field | Type | Example |
| --- | --- | --- |
| `homeCountryCode` | text | `US`, `FR`, `GB`, `DE` |
| `homeCountryName` | text | `United States`, `France`, `United Kingdom`, `Germany` |
| `homeCountryAliases` | text array | `United States`, `U.S.`, `American`, `الولايات المتحدة` |
| `embassyAliases` | text array | `U.S. Embassy Baghdad`, `السفارة الأمريكية` |
| `ambassadorAliases` | text array | Current ambassador names and common Arabic spellings |
| `bilateralCategoryLabel` | text | `U.S.-Iraq Relations`, `France-Iraq Relations` |

## Behavior

- The internal category code is always `client_bilateral_relations`.
- The displayed label is resolved by `getArticleCategoryLabel(code, embassyProfile)`.
- If `bilateralCategoryLabel` is configured, it is used directly.
- If no label is configured but `homeCountryName` exists, the fallback is `<Home Country>-Iraq Relations`.
- If no profile exists, the label is `Bilateral Relations`.
- Deterministic classification uses aliases only for the current tenant profile.

## U.S. Embassy Pilot

Use these defaults for the U.S. Embassy Baghdad pilot:

```json
{
  "homeCountryCode": "US",
  "homeCountryName": "United States",
  "homeCountryAliases": [
    "United States",
    "United States of America",
    "U.S.",
    "US",
    "USA",
    "America",
    "American",
    "الولايات المتحدة",
    "الولايات المتحدة الأمريكية",
    "أميركا",
    "أمريكا",
    "أمريكي",
    "الأمريكية"
  ],
  "embassyAliases": [
    "U.S. Embassy Baghdad",
    "United States Embassy Baghdad",
    "U.S. Embassy in Iraq",
    "American Embassy Baghdad",
    "السفارة الأمريكية",
    "سفارة الولايات المتحدة",
    "السفارة الأميركية"
  ],
  "ambassadorAliases": [],
  "bilateralCategoryLabel": "U.S.-Iraq Relations"
}
```

Ambassador aliases are intentionally configurable. Do not hard-code a current ambassador name in taxonomy source files.
