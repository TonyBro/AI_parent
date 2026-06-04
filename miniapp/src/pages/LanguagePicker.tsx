import React from 'react';
import { useTranslation } from '../shared/i18n';
import { ListItem, Page } from '../components';
import { PRESET_LANGUAGES } from '../LanguageSelector';
import { useBackButton } from '../shared/hooks/useBackButton';

interface LanguagePickerProps {
  onSelect: (langCode: string) => void;
  onBack: () => void;
}

export const LanguagePicker: React.FC<LanguagePickerProps> = ({ onSelect, onBack }) => {
  const { t } = useTranslation();
  useBackButton(onBack);

  return (
    <Page className="no-padding" style={{ paddingBottom: 0 }}>
      <div style={{ 
        padding: '0 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '100vh',
        marginTop: '-24px'
      }}>
        <div className="ui-card">
          {PRESET_LANGUAGES.map((l) => (
            <ListItem
              key={l.code}
              icon={l.flag}
              label={l.label.includes('.') ? t(l.label) : l.label}
              onClick={() => onSelect(l.code)}
            />
          ))}
        </div>
      </div>
    </Page>
  );
};

