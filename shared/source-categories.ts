export const SOURCE_CATEGORIES = [
  { code: "general", label: "General" },
  { code: "political", label: "Politics" },
  { code: "security", label: "Security" },
  { code: "economy", label: "Economy" },
  { code: "oil_energy", label: "Oil & Energy" },
  { code: "banking_currency", label: "Banking & Currency" },
  { code: "foreign_relations", label: "Foreign Relations" },
  { code: "parliament_law", label: "Parliament & Law" },
  { code: "government_services", label: "Government Services" },
  { code: "health", label: "Health" },
  { code: "education", label: "Education" },
  { code: "corruption_courts", label: "Corruption & Courts" },
  { code: "provinces", label: "Provinces" },
  { code: "protests_public_opinion", label: "Protests & Public Opinion" },
  { code: "humanitarian_ngos", label: "Humanitarian & NGOs" },
  { code: "business", label: "Business" },
  { code: "tech", label: "Technology" },
  { code: "environment_water", label: "Environment & Water" },
  { code: "culture_society", label: "Culture & Society" },
  { code: "sports", label: "Sports" },
  { code: "science", label: "Science" },
  { code: "entertainment", label: "Entertainment" },
  { code: "other", label: "Other" },
] as const;

export type SourceCategoryCode = (typeof SOURCE_CATEGORIES)[number]["code"];

export function isSourceCategoryCode(value: unknown): value is SourceCategoryCode {
  return typeof value === "string" && SOURCE_CATEGORIES.some((category) => category.code === value);
}

export function getSourceCategoryLabel(code: string): string {
  return SOURCE_CATEGORIES.find((category) => category.code === code)?.label || code;
}
