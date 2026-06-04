export function getLanguageName(code: string): string {
  if (code === "auto") return "User's system language";
  const languageNames: Record<string, string> = {
    en: "English",
    ru: "Russian (Русский)",
    uk: "Ukrainian (Українська)",
    es: "Spanish (Español)",
    pt: "Portuguese (Português)",
    fr: "French (Français)",
    de: "German (Deutsch)",
    it: "Italian (Italiano)",
    tr: "Turkish (Türkçe)",
  };
  return languageNames[code] || "English";
}


