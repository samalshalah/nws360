export type CountryRegistryEntry = {
  code: string;
  name: string;
  aliases: string[];
  regions: string[];
};

const ISO_ALPHA2_CODES = [
  "AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM", "AW", "AU", "AT", "AZ",
  "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM", "BT", "BO", "BQ", "BA", "BW", "BV", "BR",
  "IO", "BN", "BG", "BF", "BI", "CV", "KH", "CM", "CA", "KY", "CF", "TD", "CL", "CN", "CX", "CC",
  "CO", "KM", "CD", "CG", "CK", "CR", "CI", "HR", "CU", "CW", "CY", "CZ", "DK", "DJ", "DM", "DO",
  "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FK", "FO", "FJ", "FI", "FR", "GF", "PF", "TF",
  "GA", "GM", "GE", "DE", "GH", "GI", "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY",
  "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "JM",
  "JP", "JE", "JO", "KZ", "KE", "KI", "KP", "KR", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY",
  "LI", "LT", "LU", "MO", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX",
  "FM", "MD", "MC", "MN", "ME", "MS", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NC", "NZ", "NI",
  "NE", "NG", "NU", "NF", "MK", "MP", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH",
  "PN", "PL", "PT", "PR", "QA", "RE", "RO", "RU", "RW", "BL", "SH", "KN", "LC", "MF", "PM", "VC",
  "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SX", "SK", "SI", "SB", "SO", "ZA", "GS",
  "SS", "ES", "LK", "SD", "SR", "SJ", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TK",
  "TO", "TT", "TN", "TR", "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU",
  "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW",
] as const;

const AFRICA = [
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG",
  "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML",
  "MR", "MU", "YT", "MA", "MZ", "NA", "NE", "NG", "RE", "RW", "SH", "ST", "SN", "SC", "SL", "SO",
  "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "EH", "ZM", "ZW",
];
const AMERICAS = [
  "AI", "AG", "AR", "AW", "BS", "BB", "BZ", "BM", "BO", "BQ", "BV", "BR", "CA", "KY", "CL", "CO",
  "CR", "CU", "CW", "DM", "DO", "EC", "SV", "FK", "GF", "GL", "GD", "GP", "GT", "GY", "HT", "HM",
  "HN", "JM", "MQ", "MX", "MS", "NI", "PA", "PY", "PE", "PR", "BL", "KN", "LC", "MF", "PM", "VC",
  "SX", "GS", "SR", "TT", "TC", "US", "UM", "UY", "VE", "VG", "VI",
];
const ASIA = [
  "AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CN", "CX", "CC", "CY", "GE", "HK", "IN", "ID",
  "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MO", "MY", "MV", "MN", "MM", "NP",
  "KP", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "KR", "LK", "SY", "TW", "TJ", "TH", "TL", "TR",
  "TM", "AE", "UZ", "VN", "YE",
];
const EUROPE = [
  "AX", "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CZ", "DK", "EE", "FO", "FI", "FR", "DE",
  "GI", "GR", "GG", "VA", "HU", "IS", "IE", "IM", "IT", "JE", "LV", "LI", "LT", "LU", "MT", "MD",
  "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI", "ES", "SJ", "SE",
  "CH", "UA", "GB",
];
const OCEANIA = [
  "AS", "AU", "CK", "FJ", "PF", "GU", "KI", "MH", "FM", "NR", "NC", "NZ", "NU", "NF", "MP", "PW",
  "PG", "PN", "WS", "SB", "TK", "TO", "TV", "VU", "WF",
];

const REGION_COUNTRIES: Record<string, string[]> = {
  africa: AFRICA,
  americas: AMERICAS,
  asia: ASIA,
  europe: EUROPE,
  oceania: OCEANIA,
  global: [...ISO_ALPHA2_CODES],
  mena: ["DZ", "BH", "EG", "IR", "IQ", "IL", "JO", "KW", "LB", "LY", "MA", "OM", "PS", "QA", "SA", "SY", "TN", "TR", "AE", "YE"],
  "middle east": ["BH", "IR", "IQ", "IL", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "TR", "AE", "YE"],
  "north africa": ["DZ", "EG", "LY", "MA", "SD", "TN", "EH"],
  gulf: ["BH", "IQ", "KW", "OM", "QA", "SA", "AE", "YE"],
  asean: ["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "VN"],
};

const COMMON_ALIASES: Record<string, string[]> = {
  AE: ["uae", "united arab emirates", "emirates"],
  BO: ["bolivia"],
  BN: ["brunei"],
  CD: ["democratic republic of the congo", "dr congo", "drc"],
  CG: ["republic of the congo", "congo-brazzaville"],
  CI: ["ivory coast", "cote d ivoire"],
  CZ: ["czech republic"],
  GB: ["united kingdom", "uk", "britain", "great britain"],
  IQ: ["iraq", "iraqi"],
  IR: ["iran"],
  JO: ["jordan", "jordanian"],
  KW: ["kuwait", "kuwaiti"],
  LB: ["lebanon", "lebanese"],
  MA: ["morocco", "moroccan"],
  KP: ["north korea"],
  KR: ["south korea"],
  LA: ["laos"],
  MD: ["moldova"],
  PS: ["palestine", "palestinian territories", "west bank", "gaza"],
  RU: ["russia"],
  SA: ["saudi arabia", "saudi"],
  SY: ["syria"],
  TZ: ["tanzania"],
  TR: ["turkey", "turkiye"],
  US: ["united states", "united states of america", "u.s.", "u.s.a.", "usa"],
  VA: ["vatican", "holy see"],
  VE: ["venezuela"],
  VN: ["vietnam", "viet nam"],
};

const UNSAFE_NATURAL_ALIASES = new Set(["us"]);
const US_NATIONALITY_CONTEXT_TERMS = [
  "citizen",
  "citizens",
  "embassy",
  "official",
  "officials",
  "government",
  "forces",
  "troops",
  "companies",
  "company",
  "project",
  "projects",
  "consular",
  "visa",
  "visas",
  "state department",
];

const displayNames = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

function canonicalCountryName(code: string): string {
  return displayNames?.of(code) || code;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function regionMemberships(code: string): string[] {
  return Object.entries(REGION_COUNTRIES)
    .filter(([, codes]) => codes.includes(code))
    .map(([region]) => region);
}

export const COUNTRY_REGISTRY: CountryRegistryEntry[] = ISO_ALPHA2_CODES.map((code) => {
  const name = canonicalCountryName(code);
  return {
    code,
    name,
    aliases: unique([
      name,
      normalize(name),
      ...(COMMON_ALIASES[code] || []),
    ]).filter((alias) => !UNSAFE_NATURAL_ALIASES.has(normalize(alias))),
    regions: regionMemberships(code),
  };
});

const COUNTRIES_BY_CODE = new Map(COUNTRY_REGISTRY.map((country) => [country.code, country]));

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (COUNTRIES_BY_CODE.has(upper)) return upper;
  const normalized = normalize(raw);
  for (const country of COUNTRY_REGISTRY) {
    if (country.aliases.some((alias) => normalize(alias) === normalized)) return country.code;
  }
  return null;
}

export function normalizeCountryCodes(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return unique(values.map(normalizeCountryCode).filter((code): code is string => Boolean(code)));
}

export function getCountry(code: string | null | undefined): CountryRegistryEntry | undefined {
  const normalized = normalizeCountryCode(code);
  return normalized ? COUNTRIES_BY_CODE.get(normalized) : undefined;
}

export function getCountryNaturalAliases(code: string): string[] {
  const country = getCountry(code);
  if (!country) return [];
  return unique(country.aliases)
    .map((alias) => alias.trim())
    .filter((alias) => {
      const normalized = normalize(alias);
      if (UNSAFE_NATURAL_ALIASES.has(normalized)) return false;
      return normalized.length > 2 || normalized.includes(".");
    });
}

export function expandRegionCountryCodes(regionCodes: string[] | null | undefined): string[] {
  if (!Array.isArray(regionCodes)) return [];
  const codes: string[] = [];
  for (const region of regionCodes) {
    const normalized = normalize(region);
    codes.push(...(REGION_COUNTRIES[normalized] || []));
  }
  return unique(codes);
}

export function getRegionAliases(regionCodes: string[] | null | undefined): string[] {
  if (!Array.isArray(regionCodes)) return [];
  const regions = regionCodes.map(normalize).filter(Boolean);
  return unique(regions.flatMap((region) => [
    region,
    ...(REGION_COUNTRIES[region] || []).flatMap(getCountryNaturalAliases),
  ]));
}

export function countryCodesInNaturalText(text: string): string[] {
  const haystack = ` ${normalize(text)} `;
  const codes: string[] = [];
  for (const country of COUNTRY_REGISTRY) {
    const matched = getCountryNaturalAliases(country.code).some((alias) => {
      const normalizedAlias = normalize(alias);
      return normalizedAlias && haystack.includes(` ${normalizedAlias} `);
    });
    if (matched) codes.push(country.code);
  }
  if (
    haystack.includes(" american ") &&
    US_NATIONALITY_CONTEXT_TERMS.some((term) => haystack.includes(` ${term} `))
  ) {
    codes.push("US");
  }
  return unique(codes);
}

export function countryAliasesForCodes(codes: string[] | null | undefined): string[] {
  return unique(normalizeCountryCodes(codes).flatMap(getCountryNaturalAliases));
}
