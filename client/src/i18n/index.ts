import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en";
import ar from "./ar";
import fr from "./fr";
import es from "./es";
import tr from "./tr";

export const LANGUAGES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "fr", name: "Français", dir: "ltr" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "tr", name: "Türkçe", dir: "ltr" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      fr: { translation: fr },
      es: { translation: es },
      tr: { translation: tr },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "nws360-language",
    },
  });

export default i18n;

export function getDirection(lang: string): "ltr" | "rtl" {
  const found = LANGUAGES.find((l) => l.code === lang);
  return found?.dir === "rtl" ? "rtl" : "ltr";
}
