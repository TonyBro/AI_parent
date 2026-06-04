import { useMemo } from "react";
import en from "../../../src/locales/en.json";
import ru from "../../../src/locales/ru.json";
import es from "../../../src/locales/es.json";
import uk from "../../../src/locales/uk.json";
import pt from "../../../src/locales/pt.json";
import fr from "../../../src/locales/fr.json";
import de from "../../../src/locales/de.json";
import it from "../../../src/locales/it.json";
import tr from "../../../src/locales/tr.json";

const resources: Record<string, any> = {
  en,
  ru,
  es,
  uk,
  pt,
  fr,
  de,
  it,
  tr,
};

export function useTranslation() {
  const langCode = useMemo(() => {
    const tg = (window as any).Telegram?.WebApp;
    const code = (tg?.initDataUnsafe?.user?.language_code || "en").split("-")[0];
    return resources[code] ? code : "en";
  }, []);

  const t = useMemo(() => (path: string, params?: Record<string, string | number>) => {
    const keys = path.split(".");
    let current = resources[langCode];
    let result = path;
    
    let found = true;
    for (const key of keys) {
      if (current[key] === undefined) {
        found = false;
        break;
      }
      current = current[key];
    }

    if (found) {
      result = current;
    } else {
      // Fallback to English
      let fallback = resources["en"];
      let fbFound = true;
      for (const fKey of keys) {
        if (fallback[fKey] === undefined) {
          fbFound = false;
          break;
        }
        fallback = fallback[fKey];
      }
      if (fbFound) result = fallback;
    }

    if (params && typeof result === "string") {
      Object.entries(params).forEach(([key, value]) => {
        result = result.replace(`{{${key}}}`, String(value));
      });
    }
    return result;
  }, [langCode]);

  const translateError = useMemo(() => (e: any) => {
    const msg = e?.message || String(e);
    return msg.includes('.') ? t(msg) : msg;
  }, [t]);

  return { t, langCode, translateError };
}

