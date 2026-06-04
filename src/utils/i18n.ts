import i18next from "i18next";
import en from "../locales/en.json";
import ru from "../locales/ru.json";
import es from "../locales/es.json";
import uk from "../locales/uk.json";
import pt from "../locales/pt.json";
import fr from "../locales/fr.json";
import de from "../locales/de.json";
import it from "../locales/it.json";
import tr from "../locales/tr.json";

export const RESOURCES = {
  en: { translation: en },
  ru: { translation: ru },
  es: { translation: es },
  uk: { translation: uk },
  pt: { translation: pt },
  fr: { translation: fr },
  de: { translation: de },
  it: { translation: it },
  tr: { translation: tr },
} as const;

export type SupportedLanguage = keyof typeof RESOURCES;
export const SUPPORTED_LANGUAGES = Object.keys(RESOURCES) as SupportedLanguage[];

export async function initI18n(lang: string) {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: lang,
    fallbackLng: "en",
    resources: RESOURCES,
    interpolation: {
      escapeValue: false,
    },
  });
  return i18n;
}

export type I18n = Awaited<ReturnType<typeof initI18n>>;

