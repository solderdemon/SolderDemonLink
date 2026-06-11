import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import uk from "./locales/uk.json";

export const supportedLanguages = ["en", "uk"] as const;
export type AppLanguage = (typeof supportedLanguages)[number];

const fallbackLanguage: AppLanguage = "en";
const storageKey = "sd.lang";

function resolveInitialLanguage(): AppLanguage {
  const saved = localStorage.getItem(storageKey);
  if (saved === "uk" || saved === "en") return saved;

  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith("uk")) return "uk";
  return fallbackLanguage;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    uk: { translation: uk },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: fallbackLanguage,
  supportedLngs: supportedLanguages,
  interpolation: {
    escapeValue: false,
  },
});

void i18n.on("languageChanged", (language) => {
  localStorage.setItem(storageKey, language);
  document.documentElement.lang = language;
});

document.documentElement.lang = i18n.language;

export default i18n;
