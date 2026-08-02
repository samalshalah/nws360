export const RELEVANCE_ENGINE_VERSION = "workspace-relevance-v1";

export const ARTICLE_RELEVANCE_STATUSES = [
  "direct_scope_match",
  "material_scope_impact",
  "contextual",
  "not_relevant",
  "needs_review",
] as const;

export type ArticleRelevanceStatus = typeof ARTICLE_RELEVANCE_STATUSES[number];

export const ARTICLE_RELEVANCE_METHODS = ["deterministic", "ai", "manual", "imported"] as const;
export type ArticleRelevanceMethod = typeof ARTICLE_RELEVANCE_METHODS[number];

export const DEFAULT_REPORTING_RELEVANCE_STATUSES: ArticleRelevanceStatus[] = [
  "direct_scope_match",
  "material_scope_impact",
];

export const REPORTING_RELEVANCE_STATUSES_WITH_CONTEXT: ArticleRelevanceStatus[] = [
  ...DEFAULT_REPORTING_RELEVANCE_STATUSES,
  "contextual",
];

export const REVIEW_QUEUE_RELEVANCE_STATUSES: ArticleRelevanceStatus[] = [
  "needs_review",
  "contextual",
];

export const WORKSPACE_SCOPE_MODES = [
  "global",
  "regional",
  "single_country",
  "multi_country",
  "subnational",
  "topic_only",
  "hybrid",
] as const;

export type WorkspaceScopeMode = typeof WORKSPACE_SCOPE_MODES[number];

export const WORKSPACE_PURPOSES = [
  "diplomatic_monitoring",
  "newsroom_monitoring",
  "country_desk",
  "regional_desk",
  "global_news",
  "topic_research",
  "humanitarian_monitoring",
  "competitor_monitoring",
  "reputation_monitoring",
  "crisis_monitoring",
  "industry_intelligence",
  "custom",
] as const;

export type WorkspacePurpose = typeof WORKSPACE_PURPOSES[number];

export type WorkspaceSupportingSignal = {
  type: string;
  field: string;
  term: string;
  weight?: number;
};

export type WorkspaceMatchedScope = Record<string, string[]>;

export type WorkspaceRelevanceProfileData = {
  id?: number | null;
  workspaceId?: number | null;
  topics?: string[] | null;
  subtopics?: string[] | null;
  industries?: string[] | null;
  entities?: string[] | null;
  organizations?: string[] | null;
  people?: string[] | null;
  projects?: string[] | null;
  events?: string[] | null;
  multilingualAliases?: Record<string, string[]> | string[] | null;
  inclusionTerms?: string[] | null;
  exclusionTerms?: string[] | null;
  impactTerms?: string[] | null;
  contextualTerms?: string[] | null;
  minimumConfidence?: number | null;
  includeContextualByDefault?: boolean | null;
  contextualLabel?: string | null;
  profileVersion?: number | null;
  active?: boolean | null;

  // Legacy aliases kept so older call sites can be migrated incrementally.
  inclusionPhrases?: string[] | null;
  exclusionPhrases?: string[] | null;
  impactPhrases?: string[] | null;
  contextualPhrases?: string[] | null;
};

export type WorkspaceProfile = WorkspaceRelevanceProfileData & {
  id?: number | null;
  clientId?: number | null;
  name?: string | null;
  description?: string | null;
  purpose?: WorkspacePurpose | string | null;
  scopeMode?: WorkspaceScopeMode | string | null;
  globalScope?: boolean | null;
  primaryCountryCodes?: string[] | null;
  secondaryCountryCodes?: string[] | null;
  regionCodes?: string[] | null;
  subnationalAreas?: string[] | null;
  preferredLanguages?: string[] | null;
  timezone?: string | null;
  taxonomyTemplateCode?: string | null;
  relevanceProfileCode?: string | null;
  reportingTemplateCode?: string | null;
  active?: boolean | null;

  // Legacy aliases kept so older call sites can be migrated incrementally.
  primaryCountries?: string[] | null;
  secondaryCountries?: string[] | null;
  regions?: string[] | null;
};

export type WorkspaceRelevanceInput = {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  url?: string | null;
  imageTitle?: string | null;
  sourceName?: string | null;
  sourceCategory?: string | null;
  subSource?: string | null;
  language?: string | null;
  country?: string | null;
  topics?: string[] | null;
  keywords?: string[] | null;
};

export type WorkspaceRelevanceResult = {
  relevanceStatus: ArticleRelevanceStatus;
  confidence: number;
  shortReason: string;
  matchedScope: WorkspaceMatchedScope;
  principalCountryCodes: string[];
  materiallyAffectedCountryCodes: string[];
  supportingSignals: WorkspaceSupportingSignal[];
  evaluationMethod: ArticleRelevanceMethod;
  evaluatorVersion: string;
  aiRequired?: boolean;

  // Compatibility aliases for older ingestion/reporting code while it is migrated.
  relevanceConfidence: number;
  relevanceReason: string;
  relevanceMatchedSignals: string[];
  relevanceMethod: ArticleRelevanceMethod;
  principalCountries: string[];
  materiallyAffectedCountries: string[];
};

type ScoredSignal = WorkspaceSupportingSignal & { score: number };

type CountryLexicon = {
  code: string;
  aliases: string[];
  regions?: string[];
};

const COUNTRY_LEXICON: CountryLexicon[] = [
  { code: "IQ", aliases: ["iraq", "iraqi", "baghdad", "basra", "mosul", "erbil", "kurdistan region"], regions: ["mena", "middle east", "gulf"] },
  { code: "SA", aliases: ["saudi arabia", "saudi", "riyadh", "jeddah"], regions: ["mena", "middle east", "gulf"] },
  { code: "IR", aliases: ["iran", "iranian", "tehran"], regions: ["mena", "middle east"] },
  { code: "TR", aliases: ["turkey", "turkiye", "turkish", "ankara"], regions: ["mena", "middle east"] },
  { code: "SY", aliases: ["syria", "syrian", "damascus"], regions: ["mena", "middle east"] },
  { code: "JO", aliases: ["jordan", "jordanian", "amman"], regions: ["mena", "middle east"] },
  { code: "KW", aliases: ["kuwait", "kuwaiti"], regions: ["mena", "middle east", "gulf"] },
  { code: "AE", aliases: ["uae", "united arab emirates", "emirates", "abu dhabi", "dubai"], regions: ["mena", "middle east", "gulf"] },
  { code: "QA", aliases: ["qatar", "qatari", "doha"], regions: ["mena", "middle east", "gulf"] },
  { code: "BH", aliases: ["bahrain", "manama"], regions: ["mena", "middle east", "gulf"] },
  { code: "OM", aliases: ["oman", "muscat"], regions: ["mena", "middle east", "gulf"] },
  { code: "YE", aliases: ["yemen", "yemeni", "sanaa"], regions: ["mena", "middle east"] },
  { code: "LB", aliases: ["lebanon", "lebanese", "beirut"], regions: ["mena", "middle east"] },
  { code: "PS", aliases: ["palestine", "palestinian", "gaza", "west bank"], regions: ["mena", "middle east"] },
  { code: "IL", aliases: ["israel", "israeli", "tel aviv", "jerusalem"], regions: ["mena", "middle east"] },
  { code: "EG", aliases: ["egypt", "egyptian", "cairo"], regions: ["mena", "middle east", "north africa"] },
  { code: "MA", aliases: ["morocco", "moroccan", "rabat", "casablanca"], regions: ["mena", "north africa"] },
  { code: "TN", aliases: ["tunisia", "tunisian", "tunis"], regions: ["mena", "north africa"] },
  { code: "DZ", aliases: ["algeria", "algerian", "algiers"], regions: ["mena", "north africa"] },
  { code: "LY", aliases: ["libya", "libyan", "tripoli"], regions: ["mena", "north africa"] },
  { code: "SD", aliases: ["sudan", "sudanese", "khartoum"], regions: ["mena", "north africa"] },
  { code: "US", aliases: ["united states", "u.s.", "u.s", "usa", "us", "american", "washington"], regions: ["north america", "global"] },
  { code: "FR", aliases: ["france", "french", "paris"], regions: ["europe", "global"] },
  { code: "GB", aliases: ["united kingdom", "uk", "britain", "british", "london"], regions: ["europe", "global"] },
  { code: "DE", aliases: ["germany", "german", "berlin"], regions: ["europe", "global"] },
  { code: "CN", aliases: ["china", "chinese", "beijing"], regions: ["asia", "global"] },
  { code: "RU", aliases: ["russia", "russian", "moscow"], regions: ["europe", "asia", "global"] },
];

const DEFAULT_IMPACT_TERMS = [
  "affect",
  "affected",
  "impact",
  "disrupt",
  "shortage",
  "supply",
  "exports",
  "imports",
  "border",
  "sanctions",
  "security",
  "water",
  "electricity",
  "gas",
  "oil",
  "refugees",
  "migration",
  "displacement",
  "spillover",
  "cross-border",
  "trade",
  "investment",
  "aid",
  "humanitarian",
];

const DEFAULT_CONTEXTUAL_TERMS = [
  "regional",
  "background",
  "context",
  "neighboring",
  "summit",
  "diplomatic",
  "talks",
  "negotiations",
  "conference",
  "analysis",
  "overview",
];

const AMBIGUOUS_TERMS = [
  "official statement",
  "urgent",
  "breaking",
  "minister",
  "president",
  "prime minister",
  "parliament",
  "security meeting",
  "regional meeting",
];

function arr(value: string[] | null | undefined): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function unique(values: string[], limit = 16): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

function normalizeScopeMode(value: WorkspaceProfile["scopeMode"]): WorkspaceScopeMode {
  return WORKSPACE_SCOPE_MODES.includes(value as WorkspaceScopeMode) ? value as WorkspaceScopeMode : "hybrid";
}

function normalizePurpose(value: WorkspaceProfile["purpose"]): WorkspacePurpose {
  return WORKSPACE_PURPOSES.includes(value as WorkspacePurpose) ? value as WorkspacePurpose : "custom";
}

function flattenAliases(value: WorkspaceProfile["multilingualAliases"]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return arr(value);
  return Object.values(value).flatMap((items) => arr(items));
}

function normalizeCodes(values: string[] | null | undefined): string[] {
  return unique(arr(values).map((value) => value.trim().toUpperCase()), 100);
}

function termsFrom(profile: WorkspaceProfile, key: keyof WorkspaceRelevanceProfileData, legacyKey?: keyof WorkspaceRelevanceProfileData): string[] {
  return unique([...arr(profile[key] as string[] | null | undefined), ...arr(legacyKey ? profile[legacyKey] as string[] | null | undefined : undefined)], 200);
}

export function normalizeWorkspaceProfile(profile: WorkspaceProfile): WorkspaceProfile {
  const primaryCountryCodes = normalizeCodes([...(profile.primaryCountryCodes || []), ...(profile.primaryCountries || [])]);
  const secondaryCountryCodes = normalizeCodes([...(profile.secondaryCountryCodes || []), ...(profile.secondaryCountries || [])]);
  const regionCodes = normalizeCodes([...(profile.regionCodes || []), ...(profile.regions || [])]);
  return {
    ...profile,
    purpose: normalizePurpose(profile.purpose),
    scopeMode: normalizeScopeMode(profile.scopeMode),
    globalScope: Boolean(profile.globalScope || profile.scopeMode === "global"),
    primaryCountryCodes,
    secondaryCountryCodes,
    regionCodes,
    subnationalAreas: arr(profile.subnationalAreas),
    preferredLanguages: arr(profile.preferredLanguages),
    topics: arr(profile.topics),
    subtopics: arr(profile.subtopics),
    industries: arr(profile.industries),
    entities: arr(profile.entities),
    organizations: arr(profile.organizations),
    people: arr(profile.people),
    projects: arr(profile.projects),
    events: arr(profile.events),
    multilingualAliases: flattenAliases(profile.multilingualAliases),
    inclusionTerms: termsFrom(profile, "inclusionTerms", "inclusionPhrases"),
    exclusionTerms: termsFrom(profile, "exclusionTerms", "exclusionPhrases"),
    impactTerms: unique([...DEFAULT_IMPACT_TERMS, ...termsFrom(profile, "impactTerms", "impactPhrases")], 250),
    contextualTerms: unique([...DEFAULT_CONTEXTUAL_TERMS, ...termsFrom(profile, "contextualTerms", "contextualPhrases")], 250),
    minimumConfidence: profile.minimumConfidence ?? 60,
    includeContextualByDefault: Boolean(profile.includeContextualByDefault),
    active: profile.active !== false,
  };
}

export function normalizeWorkspaceRelevanceText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/www\.\S+/g, " ")
    .replace(/[^A-Za-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value: string | null | undefined): string {
  return normalizeWorkspaceRelevanceText(
    String(value || "")
      .replace(/^https?:\/\//i, " ")
      .replace(/[/?#=&._:-]+/g, " "),
  );
}

function containsTerm(text: string, term: string): boolean {
  const normalized = normalizeWorkspaceRelevanceText(term);
  if (!text || !normalized) return false;
  return ` ${text} `.includes(` ${normalized} `);
}

function scoreTerms(field: string, text: string, terms: string[], type: string, weight: number): ScoredSignal[] {
  return terms
    .filter((term) => containsTerm(text, term))
    .map((term) => ({ field, term: normalizeWorkspaceRelevanceText(term), type, score: weight, weight }));
}

function countryFor(value: string): CountryLexicon | undefined {
  const normalized = normalizeWorkspaceRelevanceText(value);
  return COUNTRY_LEXICON.find((item) =>
    item.code.toLowerCase() === normalized ||
    item.aliases.some((alias) => normalizeWorkspaceRelevanceText(alias) === normalized),
  );
}

function countryCodesFor(values: string[] | null | undefined): string[] {
  return unique(arr(values).flatMap((value) => {
    const country = countryFor(value);
    return country ? [country.code] : [value.toUpperCase()];
  }), 100);
}

function countryAliasesFor(values: string[] | null | undefined): string[] {
  const aliases: string[] = [];
  for (const value of arr(values)) {
    aliases.push(value);
    const country = countryFor(value);
    if (country) aliases.push(country.code, ...country.aliases);
  }
  return unique(aliases, 300);
}

function countriesInText(text: string): string[] {
  const codes: string[] = [];
  for (const country of COUNTRY_LEXICON) {
    if (country.aliases.some((alias) => containsTerm(text, alias)) || containsTerm(text, country.code)) {
      codes.push(country.code);
    }
  }
  return unique(codes, 30);
}

function regionAliases(profile: WorkspaceProfile): string[] {
  const regions = arr(profile.regionCodes).map((item) => normalizeWorkspaceRelevanceText(item));
  const countryAliases = COUNTRY_LEXICON
    .filter((country) => country.regions?.some((region) => regions.includes(normalizeWorkspaceRelevanceText(region))))
    .flatMap((country) => country.aliases);
  return unique([...regions, ...countryAliases], 300);
}

function workspaceTerms(profile: WorkspaceProfile) {
  const normalized = normalizeWorkspaceProfile(profile);
  return {
    primaryCountry: countryAliasesFor(normalized.primaryCountryCodes),
    secondaryCountry: countryAliasesFor(normalized.secondaryCountryCodes),
    region: regionAliases(normalized),
    subnational: arr(normalized.subnationalAreas),
    topic: [...arr(normalized.topics), ...arr(normalized.subtopics)],
    industry: arr(normalized.industries),
    entity: [...arr(normalized.entities), ...arr(normalized.organizations), ...arr(normalized.people)],
    project: [...arr(normalized.projects), ...arr(normalized.events)],
    alias: flattenAliases(normalized.multilingualAliases),
    inclusion: arr(normalized.inclusionTerms),
    exclusion: arr(normalized.exclusionTerms),
    impact: arr(normalized.impactTerms),
    contextual: arr(normalized.contextualTerms),
  };
}

function inputTexts(input: WorkspaceRelevanceInput) {
  const title = normalizeWorkspaceRelevanceText(input.title);
  const summary = normalizeWorkspaceRelevanceText(input.summary);
  const content = normalizeWorkspaceRelevanceText(input.content).slice(0, 12_000);
  const imageTitle = normalizeWorkspaceRelevanceText(input.imageTitle);
  const url = normalizeUrl(input.url);
  const articleMetadata = normalizeWorkspaceRelevanceText([
    ...(input.topics || []),
    ...(input.keywords || []),
  ].filter(Boolean).join(" "));
  const sourceMetadata = normalizeWorkspaceRelevanceText([
    input.sourceName,
    input.sourceCategory,
    input.subSource,
  ].filter(Boolean).join(" "));
  const visible = [title, summary, imageTitle, articleMetadata].filter(Boolean).join(" ");
  const all = [visible, content, url].filter(Boolean).join(" ");
  return { title, summary, content, imageTitle, url, articleMetadata, sourceMetadata, visible, all };
}

function scoreProfile(input: WorkspaceRelevanceInput, profile: WorkspaceProfile): ScoredSignal[] {
  const texts = inputTexts(input);
  const terms = workspaceTerms(profile);
  const directTerms = [
    ...terms.primaryCountry.map((term) => ({ term, type: "primary_country" })),
    ...terms.subnational.map((term) => ({ term, type: "subnational_area" })),
    ...terms.topic.map((term) => ({ term, type: "topic" })),
    ...terms.industry.map((term) => ({ term, type: "industry" })),
    ...terms.entity.map((term) => ({ term, type: "entity" })),
    ...terms.project.map((term) => ({ term, type: "project_event" })),
    ...terms.alias.map((term) => ({ term, type: "alias" })),
    ...terms.inclusion.map((term) => ({ term, type: "inclusion_term" })),
  ];

  const signals: ScoredSignal[] = [];
  for (const { term, type } of directTerms) {
    signals.push(...scoreTerms("title", texts.title, [term], type, 8));
    signals.push(...scoreTerms("summary", texts.summary, [term], type, 5));
    signals.push(...scoreTerms("image", texts.imageTitle, [term], type, 4));
    signals.push(...scoreTerms("article_metadata", texts.articleMetadata, [term], type, 4));
    signals.push(...scoreTerms("content", texts.content, [term], type, 2));
    signals.push(...scoreTerms("url", texts.url, [term], type, 1));
  }
  return signals;
}

function makeMatchedScope(signals: WorkspaceSupportingSignal[] | string[]): WorkspaceMatchedScope {
  const scope: WorkspaceMatchedScope = {};
  for (const signal of signals) {
    if (typeof signal === "string") {
      const [type = "signal", field = "unknown", term = signal] = signal.split(":");
      scope[type] = unique([...(scope[type] || []), `${field}:${term}`], 20);
    } else {
      scope[signal.type] = unique([...(scope[signal.type] || []), signal.term], 20);
    }
  }
  return scope;
}

function signalLabels(signals: WorkspaceSupportingSignal[] | string[]): string[] {
  return signals.map((signal) =>
    typeof signal === "string" ? signal : `${signal.type}:${signal.field}:${signal.term}`,
  );
}

function makeResult(
  relevanceStatus: ArticleRelevanceStatus,
  confidence: number,
  shortReason: string,
  evaluationMethod: ArticleRelevanceMethod,
  signals: WorkspaceSupportingSignal[] | string[],
  input: WorkspaceRelevanceInput,
  profile: WorkspaceProfile,
  materiallyAffectedCountryCodes: string[] = [],
): WorkspaceRelevanceResult {
  const texts = inputTexts(input);
  const labels = unique(signalLabels(signals), 30);
  const principalCountryCodes = unique([
    ...countryCodesFor(profile.primaryCountryCodes).filter((code) => countriesInText(texts.visible).includes(code)),
    ...countriesInText(texts.title || texts.summary || texts.visible),
  ], 12);
  const supportingSignals = signals.map((signal) => typeof signal === "string"
    ? { type: signal.split(":")[0] || "signal", field: signal.split(":")[1] || "unknown", term: signal.split(":").slice(2).join(":") || signal }
    : signal,
  ).slice(0, 30);
  const roundedConfidence = Math.max(0, Math.min(100, Math.round(confidence)));
  return {
    relevanceStatus,
    confidence: roundedConfidence,
    shortReason,
    matchedScope: makeMatchedScope(supportingSignals),
    principalCountryCodes,
    materiallyAffectedCountryCodes: unique(materiallyAffectedCountryCodes, 12),
    supportingSignals,
    evaluationMethod,
    evaluatorVersion: RELEVANCE_ENGINE_VERSION,
    aiRequired: relevanceStatus === "needs_review" || roundedConfidence < Number(profile.minimumConfidence ?? 60),
    relevanceConfidence: roundedConfidence,
    relevanceReason: shortReason,
    relevanceMatchedSignals: labels,
    relevanceMethod: evaluationMethod,
    principalCountries: principalCountryCodes,
    materiallyAffectedCountries: unique(materiallyAffectedCountryCodes, 12),
  };
}

function hasEnoughEvidence(input: WorkspaceRelevanceInput): boolean {
  const texts = inputTexts(input);
  return [texts.title, texts.summary, texts.content, texts.articleMetadata].join(" ").length >= 30;
}

function hasOutsideCountryLead(input: WorkspaceRelevanceInput, profile: WorkspaceProfile): boolean {
  const texts = inputTexts(input);
  const titleCountries = countriesInText(texts.title);
  const primaryCodes = countryCodesFor(profile.primaryCountryCodes);
  return titleCountries.some((code) => !primaryCodes.includes(code));
}

export function isArticleRelevanceStatus(value: unknown): value is ArticleRelevanceStatus {
  return typeof value === "string" && ARTICLE_RELEVANCE_STATUSES.includes(value as ArticleRelevanceStatus);
}

export function normalizeArticleRelevanceStatus(value: unknown): ArticleRelevanceStatus {
  return isArticleRelevanceStatus(value) ? value : "needs_review";
}

export function getDefaultRelevanceStatuses(options?: {
  includeContextual?: boolean;
  includeRegionalContext?: boolean;
  includeNeedsReview?: boolean;
  includeNotRelevant?: boolean;
}): ArticleRelevanceStatus[] {
  const statuses = [...DEFAULT_REPORTING_RELEVANCE_STATUSES];
  if (options?.includeContextual || options?.includeRegionalContext) statuses.push("contextual");
  if (options?.includeNeedsReview) statuses.push("needs_review");
  if (options?.includeNotRelevant) statuses.push("not_relevant");
  return statuses;
}

export function shouldIncludeInWorkspaceOutputs(
  status: ArticleRelevanceStatus,
  options?: { includeContextual?: boolean },
): boolean {
  return status === "direct_scope_match" ||
    status === "material_scope_impact" ||
    Boolean(options?.includeContextual && status === "contextual");
}

export function evaluateWorkspaceRelevance(
  input: WorkspaceRelevanceInput,
  workspaceProfile: WorkspaceProfile,
): WorkspaceRelevanceResult {
  const profile = normalizeWorkspaceProfile(workspaceProfile);
  const texts = inputTexts(input);
  const terms = workspaceTerms(profile);

  const exclusionSignals = [
    ...scoreTerms("title", texts.title, terms.exclusion, "exclusion_term", 10),
    ...scoreTerms("summary", texts.summary, terms.exclusion, "exclusion_term", 8),
    ...scoreTerms("content", texts.content, terms.exclusion, "exclusion_term", 4),
  ];
  if (exclusionSignals.length > 0) {
    return makeResult("not_relevant", 92, "The item matches a configured workspace exclusion term.", "deterministic", exclusionSignals, input, profile);
  }

  if (profile.globalScope || profile.scopeMode === "global") {
    const contextualSignals = [
      ...scoreTerms("title", texts.title, terms.contextual, "contextual_term", 4),
      ...scoreTerms("summary", texts.summary, terms.contextual, "contextual_term", 3),
      ...scoreTerms("content", texts.content, terms.contextual, "contextual_term", 1),
    ];
    return makeResult(
      contextualSignals.length > 0 && profile.includeContextualByDefault
        ? "contextual"
        : "direct_scope_match",
      contextualSignals.length > 0 ? 76 : 84,
      contextualSignals.length > 0 && profile.includeContextualByDefault
        ? "The global workspace is configured to retain broad contextual coverage."
        : "The workspace is configured for global monitoring.",
      "deterministic",
      contextualSignals.length > 0 ? contextualSignals : ["global_scope:workspace:global"],
      input,
      profile,
    );
  }

  const directSignals = scoreProfile(input, profile);
  const directScore = directSignals.reduce((total, signal) => total + signal.score, 0);
  const impactSignals = [
    ...scoreTerms("title", texts.title, terms.impact, "impact_term", 8),
    ...scoreTerms("summary", texts.summary, terms.impact, "impact_term", 5),
    ...scoreTerms("content", texts.content, terms.impact, "impact_term", 2),
  ];
  const contextualSignals = [
    ...scoreTerms("title", texts.title, [...terms.secondaryCountry, ...terms.region, ...terms.contextual], "contextual_scope", 5),
    ...scoreTerms("summary", texts.summary, [...terms.secondaryCountry, ...terms.region, ...terms.contextual], "contextual_scope", 3),
    ...scoreTerms("content", texts.content, [...terms.secondaryCountry, ...terms.region, ...terms.contextual], "contextual_scope", 1),
  ];

  const primaryCountrySignals = directSignals.filter((signal) => signal.type === "primary_country");
  const affectedCountries = countryCodesFor(profile.primaryCountryCodes).filter(() => primaryCountrySignals.length > 0);
  const visibleDirectSignals = directSignals.filter((signal) => ["title", "summary", "image", "article_metadata"].includes(signal.field));
  const nonCountryVisibleSignals = visibleDirectSignals.filter((signal) => !["primary_country", "entity"].includes(signal.type));
  const strongDirectCountrySignals = visibleDirectSignals.filter((signal) => ["primary_country", "subnational_area"].includes(signal.type));
  const explicitConfiguredSubjectSignals = visibleDirectSignals.filter((signal) =>
    ["alias", "entity", "project_event", "inclusion_term"].includes(signal.type),
  );

  if (
    primaryCountrySignals.length > 0 &&
    impactSignals.length > 0 &&
    hasOutsideCountryLead(input, profile) &&
    explicitConfiguredSubjectSignals.length === 0
  ) {
    return makeResult(
      "material_scope_impact",
      Math.min(90, 68 + impactSignals.length * 4 + primaryCountrySignals.length * 3),
      "The principal event appears outside the primary scope but materially affects the configured workspace scope.",
      "deterministic",
      [...primaryCountrySignals, ...impactSignals],
      input,
      profile,
      affectedCountries,
    );
  }

  if (nonCountryVisibleSignals.length > 0 || strongDirectCountrySignals.length > 0 || directScore >= 14) {
    return makeResult(
      "direct_scope_match",
      Math.min(97, 70 + Math.min(27, directScore)),
      "The principal article subject matches configured workspace scope.",
      "deterministic",
      directSignals,
      input,
      profile,
    );
  }

  if (directSignals.length > 0 && impactSignals.length > 0) {
    return makeResult(
      "material_scope_impact",
      72,
      "The item has workspace scope signals plus material-impact language.",
      "deterministic",
      [...directSignals, ...impactSignals],
      input,
      profile,
      affectedCountries,
    );
  }

  const strongContextualSignals = contextualSignals.filter((signal) => signal.field !== "content");
  if (strongContextualSignals.length > 0 || contextualSignals.length >= 2) {
    return makeResult(
      "contextual",
      contextualSignals.some((signal) => signal.field === "title") ? 74 : 64,
      "The article is useful context for the workspace but is not a direct or material match.",
      "deterministic",
      contextualSignals,
      input,
      profile,
    );
  }

  const ambiguousSignals = [
    ...scoreTerms("title", texts.title, AMBIGUOUS_TERMS, "ambiguous", 4),
    ...scoreTerms("summary", texts.summary, AMBIGUOUS_TERMS, "ambiguous", 3),
  ];
  if (!hasEnoughEvidence(input) || ambiguousSignals.length > 0) {
    return makeResult(
      "needs_review",
      42,
      "The item has limited or ambiguous evidence and needs analyst review.",
      "deterministic",
      ambiguousSignals,
      input,
      profile,
    );
  }

  return makeResult(
    "not_relevant",
    78,
    "No configured workspace scope, impact, or contextual signal was found.",
    "deterministic",
    [],
    input,
    profile,
  );
}

export function shouldUseAiFallbackForRelevance(result: WorkspaceRelevanceResult): boolean {
  return result.relevanceStatus === "needs_review" || result.confidence < 60;
}

export function normalizeAiWorkspaceRelevanceResult(value: unknown): WorkspaceRelevanceResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isArticleRelevanceStatus(raw.relevanceStatus)) {
    return makeResult(
      "needs_review",
      35,
      "AI relevance review returned an unsupported status.",
      "ai",
      ["ai_validation:error:unsupported_status"],
      {},
      {},
    );
  }
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(100, Math.round(raw.confidence)))
    : 50;
  const shortReason = typeof raw.shortReason === "string" && raw.shortReason.trim()
    ? raw.shortReason.trim().slice(0, 500)
    : "AI relevance review returned limited explanation.";
  const matchedScope = raw.matchedScope && typeof raw.matchedScope === "object" && !Array.isArray(raw.matchedScope)
    ? raw.matchedScope as WorkspaceMatchedScope
    : {};
  const principalCountryCodes = Array.isArray(raw.principalCountryCodes) ? raw.principalCountryCodes.map(String).slice(0, 12) : [];
  const materiallyAffectedCountryCodes = Array.isArray(raw.materiallyAffectedCountryCodes) ? raw.materiallyAffectedCountryCodes.map(String).slice(0, 12) : [];
  const supportingSignals = Array.isArray(raw.supportingSignals)
    ? raw.supportingSignals.map((signal) => typeof signal === "string"
      ? { type: "ai", field: "response", term: signal.slice(0, 120) }
      : {
        type: String((signal as any)?.type || "ai"),
        field: String((signal as any)?.field || "response"),
        term: String((signal as any)?.term || "").slice(0, 120),
      }).slice(0, 20)
    : [];
  const labels = signalLabels(supportingSignals);
  return {
    relevanceStatus: raw.relevanceStatus,
    confidence,
    shortReason,
    matchedScope,
    principalCountryCodes,
    materiallyAffectedCountryCodes,
    supportingSignals,
    evaluationMethod: "ai",
    evaluatorVersion: RELEVANCE_ENGINE_VERSION,
    aiRequired: true,
    relevanceConfidence: confidence,
    relevanceReason: shortReason,
    relevanceMatchedSignals: labels,
    relevanceMethod: "ai",
    principalCountries: principalCountryCodes,
    materiallyAffectedCountries: materiallyAffectedCountryCodes,
  };
}

export function aiFailureWorkspaceRelevanceResult(reason = "AI relevance review failed; analyst review required."): WorkspaceRelevanceResult {
  return makeResult("needs_review", 35, reason, "ai", ["ai_failure:error:needs_review"], {}, {});
}

export function buildDefaultWorkspaceProfile(input: {
  clientId?: number | null;
  name?: string | null;
  sourceCountry?: string | null;
  sourceCategory?: string | null;
  topics?: string[] | null;
  keywords?: string[] | null;
}): WorkspaceProfile {
  return {
    clientId: input.clientId,
    name: input.name || "Default Monitoring Workspace",
    scopeMode: "topic_only",
    primaryCountryCodes: [],
    topics: input.topics || [],
    industries: input.sourceCategory ? [input.sourceCategory] : [],
    inclusionTerms: input.keywords || [],
    impactTerms: [],
    contextualTerms: [],
    preferredLanguages: [],
  };
}
