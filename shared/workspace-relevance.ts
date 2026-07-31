export const ARTICLE_RELEVANCE_STATUSES = [
  "direct_scope_match",
  "material_scope_impact",
  "contextual",
  "not_relevant",
  "needs_review",
] as const;

export type ArticleRelevanceStatus = typeof ARTICLE_RELEVANCE_STATUSES[number];

export const ARTICLE_RELEVANCE_METHODS = ["deterministic", "ai", "manual", "migration"] as const;
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
  "geographic",
  "regional",
  "topic",
  "entity",
  "mixed",
] as const;

export type WorkspaceScopeMode = typeof WORKSPACE_SCOPE_MODES[number];

export type WorkspaceProfile = {
  id?: number | null;
  clientId?: number | null;
  name?: string | null;
  scopeMode?: WorkspaceScopeMode | string | null;
  globalScope?: boolean | null;
  primaryCountries?: string[] | null;
  secondaryCountries?: string[] | null;
  regions?: string[] | null;
  subnationalAreas?: string[] | null;
  topics?: string[] | null;
  subtopics?: string[] | null;
  industries?: string[] | null;
  entities?: string[] | null;
  organizations?: string[] | null;
  people?: string[] | null;
  projects?: string[] | null;
  events?: string[] | null;
  multilingualAliases?: Record<string, string[]> | string[] | null;
  inclusionPhrases?: string[] | null;
  exclusionPhrases?: string[] | null;
  impactPhrases?: string[] | null;
  contextualPhrases?: string[] | null;
  preferredLanguages?: string[] | null;
  includeContextualByDefault?: boolean | null;
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
  matchedScope: string[];
  principalCountries: string[];
  materiallyAffectedCountries: string[];
  supportingSignals: string[];
  relevanceMethod: ArticleRelevanceMethod;
  aiRequired?: boolean;

  // Compatibility names used by the existing article schema and storage layer.
  relevanceConfidence: number;
  relevanceReason: string;
  relevanceMatchedSignals: string[];
};

type ScoredSignal = {
  scope: string;
  term: string;
  field: string;
  score: number;
};

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
  { code: "US", aliases: ["united states", "u.s.", "us", "american", "washington"], regions: ["north america", "global"] },
  { code: "FR", aliases: ["france", "french", "paris"], regions: ["europe", "global"] },
  { code: "GB", aliases: ["united kingdom", "uk", "britain", "british", "london"], regions: ["europe", "global"] },
  { code: "DE", aliases: ["germany", "german", "berlin"], regions: ["europe", "global"] },
  { code: "CN", aliases: ["china", "chinese", "beijing"], regions: ["asia", "global"] },
  { code: "RU", aliases: ["russia", "russian", "moscow"], regions: ["europe", "asia", "global"] },
];

const DEFAULT_IMPACT_PHRASES = [
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

const DEFAULT_CONTEXTUAL_PHRASES = [
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
  return Array.isArray(value) ? value.filter((item) => String(item || "").trim()) : [];
}

function normalizeScopeMode(value: WorkspaceProfile["scopeMode"]): WorkspaceScopeMode {
  return WORKSPACE_SCOPE_MODES.includes(value as WorkspaceScopeMode) ? value as WorkspaceScopeMode : "mixed";
}

function flattenAliases(value: WorkspaceProfile["multilingualAliases"]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return arr(value);
  return Object.values(value).flatMap((items) => arr(items));
}

export function normalizeWorkspaceProfile(profile: WorkspaceProfile): WorkspaceProfile {
  return {
    ...profile,
    scopeMode: normalizeScopeMode(profile.scopeMode),
    globalScope: Boolean(profile.globalScope || profile.scopeMode === "global"),
    primaryCountries: arr(profile.primaryCountries),
    secondaryCountries: arr(profile.secondaryCountries),
    regions: arr(profile.regions),
    subnationalAreas: arr(profile.subnationalAreas),
    topics: arr(profile.topics),
    subtopics: arr(profile.subtopics),
    industries: arr(profile.industries),
    entities: arr(profile.entities),
    organizations: arr(profile.organizations),
    people: arr(profile.people),
    projects: arr(profile.projects),
    events: arr(profile.events),
    inclusionPhrases: arr(profile.inclusionPhrases),
    exclusionPhrases: arr(profile.exclusionPhrases),
    impactPhrases: unique([...DEFAULT_IMPACT_PHRASES, ...arr(profile.impactPhrases)], 200),
    contextualPhrases: unique([...DEFAULT_CONTEXTUAL_PHRASES, ...arr(profile.contextualPhrases)], 200),
    preferredLanguages: arr(profile.preferredLanguages),
    multilingualAliases: flattenAliases(profile.multilingualAliases),
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

function scoreTerms(field: string, text: string, terms: string[], scope: string, weight: number): ScoredSignal[] {
  return terms
    .filter((term) => containsTerm(text, term))
    .map((term) => ({ field, term: normalizeWorkspaceRelevanceText(term), scope, score: weight }));
}

function unique(values: string[], limit = 16): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

function countryAliasesFor(values: string[] | null | undefined): string[] {
  const requested = arr(values).map((value) => normalizeWorkspaceRelevanceText(value));
  const aliases: string[] = [];
  for (const value of requested) {
    aliases.push(value);
    const country = COUNTRY_LEXICON.find((item) =>
      item.code.toLowerCase() === value || item.aliases.some((alias) => normalizeWorkspaceRelevanceText(alias) === value),
    );
    if (country) aliases.push(...country.aliases, country.code);
  }
  return unique(aliases, 200);
}

function countriesInText(text: string): string[] {
  const codes: string[] = [];
  for (const country of COUNTRY_LEXICON) {
    if (country.aliases.some((alias) => containsTerm(text, alias)) || containsTerm(text, country.code)) {
      codes.push(country.code);
    }
  }
  return unique(codes, 20);
}

function countryCodesFor(values: string[] | null | undefined): string[] {
  return unique(arr(values).flatMap((value) => {
    const normalized = normalizeWorkspaceRelevanceText(value);
    const country = COUNTRY_LEXICON.find((item) =>
      item.code.toLowerCase() === normalized || item.aliases.some((alias) => normalizeWorkspaceRelevanceText(alias) === normalized),
    );
    return country ? [country.code] : [value.toUpperCase()];
  }), 50);
}

function regionAliases(profile: WorkspaceProfile): string[] {
  const regions = arr(profile.regions).map((item) => normalizeWorkspaceRelevanceText(item));
  const countryAliases = COUNTRY_LEXICON
    .filter((country) => country.regions?.some((region) => regions.includes(normalizeWorkspaceRelevanceText(region))))
    .flatMap((country) => country.aliases);
  return unique([...regions, ...countryAliases], 250);
}

function workspaceTerms(profile: WorkspaceProfile) {
  const normalized = normalizeWorkspaceProfile(profile);
  return {
    primaryCountry: countryAliasesFor(normalized.primaryCountries),
    secondaryCountry: countryAliasesFor(normalized.secondaryCountries),
    region: regionAliases(normalized),
    subnational: arr(normalized.subnationalAreas),
    topic: [...arr(normalized.topics), ...arr(normalized.subtopics)],
    industry: arr(normalized.industries),
    entity: [...arr(normalized.entities), ...arr(normalized.organizations), ...arr(normalized.people)],
    project: [...arr(normalized.projects), ...arr(normalized.events)],
    alias: flattenAliases(normalized.multilingualAliases),
    inclusion: arr(normalized.inclusionPhrases),
    exclusion: arr(normalized.exclusionPhrases),
    impact: arr(normalized.impactPhrases),
    contextual: arr(normalized.contextualPhrases),
  };
}

function inputTexts(input: WorkspaceRelevanceInput) {
  const title = normalizeWorkspaceRelevanceText(input.title);
  const summary = normalizeWorkspaceRelevanceText(input.summary);
  const content = normalizeWorkspaceRelevanceText(input.content).slice(0, 10_000);
  const imageTitle = normalizeWorkspaceRelevanceText(input.imageTitle);
  const url = normalizeUrl(input.url);
  const metadata = normalizeWorkspaceRelevanceText([
    input.sourceName,
    input.sourceCategory,
    input.subSource,
    input.country,
    ...(input.topics || []),
    ...(input.keywords || []),
  ].filter(Boolean).join(" "));
  const visible = [title, summary, imageTitle, metadata].filter(Boolean).join(" ");
  const all = [visible, content, url].filter(Boolean).join(" ");
  return { title, summary, content, imageTitle, url, metadata, visible, all };
}

function scoreProfile(input: WorkspaceRelevanceInput, profile: WorkspaceProfile): ScoredSignal[] {
  const texts = inputTexts(input);
  const terms = workspaceTerms(profile);
  const directTerms = [
    ...terms.primaryCountry.map((term) => ({ term, scope: "primary_country" })),
    ...terms.subnational.map((term) => ({ term, scope: "subnational_area" })),
    ...terms.topic.map((term) => ({ term, scope: "topic" })),
    ...terms.industry.map((term) => ({ term, scope: "industry" })),
    ...terms.entity.map((term) => ({ term, scope: "entity" })),
    ...terms.project.map((term) => ({ term, scope: "project_event" })),
    ...terms.alias.map((term) => ({ term, scope: "alias" })),
    ...terms.inclusion.map((term) => ({ term, scope: "inclusion_phrase" })),
  ];

  const signals: ScoredSignal[] = [];
  for (const { term, scope } of directTerms) {
    signals.push(...scoreTerms("title", texts.title, [term], scope, 8));
    signals.push(...scoreTerms("summary", texts.summary, [term], scope, 5));
    signals.push(...scoreTerms("image", texts.imageTitle, [term], scope, 4));
    signals.push(...scoreTerms("metadata", texts.metadata, [term], scope, 4));
    signals.push(...scoreTerms("content", texts.content, [term], scope, 2));
    signals.push(...scoreTerms("url", texts.url, [term], scope, 1));
  }
  return signals;
}

function makeResult(
  relevanceStatus: ArticleRelevanceStatus,
  confidence: number,
  shortReason: string,
  relevanceMethod: ArticleRelevanceMethod,
  signals: ScoredSignal[] | string[],
  input: WorkspaceRelevanceInput,
  profile: WorkspaceProfile,
  materiallyAffectedCountries: string[] = [],
): WorkspaceRelevanceResult {
  const signalLabels = Array.isArray(signals) && typeof signals[0] === "object"
    ? (signals as ScoredSignal[]).map((signal) => `${signal.scope}:${signal.field}:${signal.term}`)
    : signals as string[];
  const texts = inputTexts(input);
  const principalCountries = unique([
    ...countryCodesFor(profile.primaryCountries).filter((code) => countriesInText(texts.visible).includes(code)),
    ...countriesInText(texts.title || texts.summary || texts.visible),
  ], 8);
  const matchedScope = unique(signalLabels.map((signal) => signal.split(":")[0]), 12);
  const supportingSignals = unique(signalLabels, 20);
  return {
    relevanceStatus,
    confidence,
    shortReason,
    matchedScope,
    principalCountries,
    materiallyAffectedCountries: unique(materiallyAffectedCountries, 8),
    supportingSignals,
    relevanceMethod,
    aiRequired: relevanceStatus === "needs_review" || confidence < 60,
    relevanceConfidence: confidence,
    relevanceReason: shortReason,
    relevanceMatchedSignals: supportingSignals,
  };
}

function hasEnoughEvidence(input: WorkspaceRelevanceInput): boolean {
  const texts = inputTexts(input);
  return [texts.title, texts.summary, texts.content, texts.metadata].join(" ").length >= 30;
}

function isOutsideCountryLead(input: WorkspaceRelevanceInput, profile: WorkspaceProfile): boolean {
  const texts = inputTexts(input);
  const titleCountries = countriesInText(texts.title);
  const primaryCodes = countryCodesFor(profile.primaryCountries);
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

export function evaluateWorkspaceRelevance(
  input: WorkspaceRelevanceInput,
  workspaceProfile: WorkspaceProfile,
): WorkspaceRelevanceResult {
  const profile = normalizeWorkspaceProfile(workspaceProfile);
  const texts = inputTexts(input);
  const terms = workspaceTerms(profile);

  const exclusionSignals = [
    ...scoreTerms("title", texts.title, terms.exclusion, "exclusion_phrase", 10),
    ...scoreTerms("summary", texts.summary, terms.exclusion, "exclusion_phrase", 8),
    ...scoreTerms("content", texts.content, terms.exclusion, "exclusion_phrase", 4),
  ];
  if (exclusionSignals.length > 0) {
    return makeResult(
      "not_relevant",
      90,
      "The item matches a configured workspace exclusion phrase.",
      "deterministic",
      exclusionSignals,
      input,
      profile,
    );
  }

  if (profile.globalScope) {
    const contextualSignals = [
      ...scoreTerms("title", texts.title, terms.contextual, "contextual_phrase", 4),
      ...scoreTerms("summary", texts.summary, terms.contextual, "contextual_phrase", 3),
      ...scoreTerms("content", texts.content, terms.contextual, "contextual_phrase", 1),
    ];
    return makeResult(
      contextualSignals.length > 0 ? "contextual" : "direct_scope_match",
      contextualSignals.length > 0 ? 76 : 84,
      contextualSignals.length > 0
        ? "The global workspace is configured to retain broad context for review."
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
    ...scoreTerms("title", texts.title, terms.impact, "impact_phrase", 8),
    ...scoreTerms("summary", texts.summary, terms.impact, "impact_phrase", 5),
    ...scoreTerms("content", texts.content, terms.impact, "impact_phrase", 2),
  ];
  const contextualSignals = [
    ...scoreTerms("title", texts.title, [...terms.secondaryCountry, ...terms.region, ...terms.contextual], "contextual_scope", 5),
    ...scoreTerms("summary", texts.summary, [...terms.secondaryCountry, ...terms.region, ...terms.contextual], "contextual_scope", 3),
    ...scoreTerms("content", texts.content, [...terms.secondaryCountry, ...terms.region, ...terms.contextual], "contextual_scope", 1),
  ];
  const primaryCountrySignals = directSignals.filter((signal) => signal.scope === "primary_country");
  const titleOrSummaryDirect = directSignals.filter((signal) => ["title", "summary", "image", "metadata"].includes(signal.field));
  const affectedCountries = countryCodesFor(profile.primaryCountries).filter((code) => primaryCountrySignals.length > 0);

  if (primaryCountrySignals.length > 0 && impactSignals.length > 0 && isOutsideCountryLead(input, profile)) {
    return makeResult(
      "material_scope_impact",
      Math.min(88, 68 + impactSignals.length * 4 + primaryCountrySignals.length * 3),
      "The event appears outside the primary scope but materially affects configured workspace scope.",
      "deterministic",
      [...primaryCountrySignals, ...impactSignals],
      input,
      profile,
      affectedCountries,
    );
  }

  if (titleOrSummaryDirect.length > 0 || directScore >= 12) {
    return makeResult(
      "direct_scope_match",
      Math.min(97, 72 + Math.min(25, directScore)),
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
      "The item has limited or ambiguous metadata and needs analyst review.",
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
  const relevanceStatus = normalizeArticleRelevanceStatus(raw.relevanceStatus);
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(100, Math.round(raw.confidence)))
    : 50;
  const shortReason = typeof raw.shortReason === "string" && raw.shortReason.trim()
    ? raw.shortReason.trim().slice(0, 500)
    : "AI relevance review returned limited explanation.";
  const matchedScope = Array.isArray(raw.matchedScope) ? raw.matchedScope.map(String).slice(0, 20) : [];
  const principalCountries = Array.isArray(raw.principalCountries) ? raw.principalCountries.map(String).slice(0, 12) : [];
  const materiallyAffectedCountries = Array.isArray(raw.materiallyAffectedCountries) ? raw.materiallyAffectedCountries.map(String).slice(0, 12) : [];
  const supportingSignals = Array.isArray(raw.supportingSignals) ? raw.supportingSignals.map(String).slice(0, 20) : [];
  return {
    relevanceStatus,
    confidence,
    shortReason,
    matchedScope,
    principalCountries,
    materiallyAffectedCountries,
    supportingSignals,
    relevanceMethod: "ai",
    aiRequired: true,
    relevanceConfidence: confidence,
    relevanceReason: shortReason,
    relevanceMatchedSignals: supportingSignals,
  };
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
    scopeMode: "mixed",
    primaryCountries: input.sourceCountry ? [input.sourceCountry] : [],
    topics: input.topics || [],
    industries: input.sourceCategory ? [input.sourceCategory] : [],
    inclusionPhrases: input.keywords || [],
    impactPhrases: [],
    contextualPhrases: [],
    preferredLanguages: [],
  };
}
