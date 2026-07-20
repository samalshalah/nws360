export interface GoogleNewsEdition {
  code: string;
  name: string;
  locale: string;
  language: string;
}

export const GOOGLE_NEWS_EDITIONS: readonly GoogleNewsEdition[] = [
  { code: "US", name: "United States", locale: "en-US", language: "en" },
  { code: "CA", name: "Canada", locale: "en-CA", language: "en" },
  { code: "MX", name: "Mexico", locale: "es-419", language: "es-419" },
  { code: "BR", name: "Brazil", locale: "pt-BR", language: "pt-419" },
  { code: "AR", name: "Argentina", locale: "es-419", language: "es-419" },
  { code: "CL", name: "Chile", locale: "es-419", language: "es-419" },
  { code: "CO", name: "Colombia", locale: "es-419", language: "es-419" },
  { code: "GB", name: "United Kingdom", locale: "en-GB", language: "en" },
  { code: "FR", name: "France", locale: "fr", language: "fr" },
  { code: "DE", name: "Germany", locale: "de", language: "de" },
  { code: "IT", name: "Italy", locale: "it", language: "it" },
  { code: "ES", name: "Spain", locale: "es", language: "es" },
  { code: "PT", name: "Portugal", locale: "pt-PT", language: "pt-150" },
  { code: "NL", name: "Netherlands", locale: "nl", language: "nl" },
  { code: "CH", name: "Switzerland", locale: "de", language: "de" },
  { code: "SE", name: "Sweden", locale: "sv", language: "sv" },
  { code: "SA", name: "Saudi Arabia", locale: "ar", language: "ar" },
  { code: "AE", name: "United Arab Emirates", locale: "ar", language: "ar" },
  { code: "EG", name: "Egypt", locale: "ar", language: "ar" },
  { code: "LB", name: "Lebanon", locale: "ar", language: "ar" },
  { code: "IL", name: "Israel", locale: "he", language: "he" },
  { code: "TR", name: "Turkey", locale: "tr", language: "tr" },
  { code: "AU", name: "Australia", locale: "en-AU", language: "en" },
  { code: "NZ", name: "New Zealand", locale: "en-NZ", language: "en" },
  { code: "IN", name: "India", locale: "en-IN", language: "en" },
  { code: "SG", name: "Singapore", locale: "en-SG", language: "en" },
  { code: "MY", name: "Malaysia", locale: "en-MY", language: "en" },
  { code: "PH", name: "Philippines", locale: "en-PH", language: "en" },
  { code: "ID", name: "Indonesia", locale: "id", language: "id" },
  { code: "JP", name: "Japan", locale: "ja", language: "ja" },
  { code: "KR", name: "South Korea", locale: "ko", language: "ko" },
  { code: "TW", name: "Taiwan", locale: "zh-TW", language: "zh-Hant" },
  { code: "ZA", name: "South Africa", locale: "en-ZA", language: "en" },
  { code: "NG", name: "Nigeria", locale: "en-NG", language: "en" },
  { code: "KE", name: "Kenya", locale: "en-KE", language: "en" },
] as const;

export function getGoogleNewsEdition(code?: string | null): GoogleNewsEdition {
  const normalized = code?.trim().toUpperCase() || "US";
  return GOOGLE_NEWS_EDITIONS.find((edition) => edition.code === normalized) || GOOGLE_NEWS_EDITIONS[0];
}

export function isGoogleNewsEditionCode(code?: string | null): boolean {
  if (!code) return false;
  const normalized = code.trim().toUpperCase();
  return GOOGLE_NEWS_EDITIONS.some((edition) => edition.code === normalized);
}
