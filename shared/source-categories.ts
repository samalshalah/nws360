export const SOURCE_CATEGORIES = [
  { code: "political", label: "Politics" },
  { code: "health", label: "Health" },
  { code: "business", label: "Business" },
  { code: "tech", label: "Technology" },
  { code: "sports", label: "Sports" },
  { code: "science", label: "Science" },
  { code: "entertainment", label: "Entertainment & Culture" },
] as const;

export type SourceCategoryCode = (typeof SOURCE_CATEGORIES)[number]["code"];

export function isSourceCategoryCode(value: unknown): value is SourceCategoryCode {
  return typeof value === "string" && SOURCE_CATEGORIES.some((category) => category.code === value);
}

export function getSourceCategoryLabel(code: string): string {
  return SOURCE_CATEGORIES.find((category) => category.code === code)?.label || code;
}
