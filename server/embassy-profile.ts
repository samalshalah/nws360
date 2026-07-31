import {
  US_EMBASSY_BAGHDAD_PROFILE,
  normalizeEmbassyProfile,
  type EmbassyProfile,
} from "@shared/article-taxonomy";

type ClientProfileSource = {
  name?: string | null;
};

type ClientSettingsProfileSource = {
  homeCountryCode?: string | null;
  homeCountryName?: string | null;
  homeCountryAliases?: string[] | null;
  embassyAliases?: string[] | null;
  ambassadorAliases?: string[] | null;
  bilateralCategoryLabel?: string | null;
};

function inferEmbassyProfileFromClientName(client?: ClientProfileSource | null): EmbassyProfile | null {
  const name = String(client?.name || "").toLowerCase();
  if (!name) return null;
  const isUsEmbassy =
    name.includes("u.s. embassy") ||
    name.includes("us embassy") ||
    name.includes("united states embassy") ||
    name.includes("american embassy");
  return isUsEmbassy ? { ...US_EMBASSY_BAGHDAD_PROFILE } : null;
}

export function buildClientEmbassyProfile(
  client?: ClientProfileSource | null,
  settings?: ClientSettingsProfileSource | null,
): EmbassyProfile | null {
  const configured = normalizeEmbassyProfile(settings || null);
  if (configured) return configured;
  return inferEmbassyProfileFromClientName(client);
}
