import React from "react";
import { IconChevron } from "./components";
import { useTranslation } from "./i18n";

export const PRESET_LANGUAGES: Array<{ code: string; label: string; flag: string }> = [
  { code: "auto", label: "miniapp.system_language", flag: "🌐" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "uk", label: "Українська", flag: "🇺🇦" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
];

interface LanguageSelectorProps {
  value: string;
  onClick: () => void;
}

export function LanguageSelector({ value, onClick }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const lang = PRESET_LANGUAGES.find(l => l.code === value);
  const label = lang ? (lang.label.includes('.') ? t(lang.label) : lang.label) : value;
  
  return (
    <div className="ui-list-item" onClick={onClick} style={{ padding: '16px 0' }}>
      <div className="ui-list-item-content">
        <div className="ui-list-item-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{lang?.flag || "🌐"}</span>
          <span>{label}</span>
        </div>
      </div>
      <div className="ui-list-item-arrow">
        <IconChevron />
      </div>
    </div>
  );
}

