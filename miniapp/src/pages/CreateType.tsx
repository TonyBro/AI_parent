import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../shared/i18n';
import { Section, ListItem, Page, IconQuiz, IconExternalLink } from '../components';
import { useBackButton } from '../shared/hooks/useBackButton';

export const CreateType: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useBackButton(() => navigate(-1));

  return (
    <Page className="no-padding" style={{ paddingBottom: 0 }}>
      <div style={{ 
        padding: '0 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '100vh',
        marginTop: '-24px' // Subtle adjustment to account for the top navigation area in TMA
      }}>
        <Section>
          <ListItem
            icon={<IconQuiz />}
            label={t("miniapp.bot_type_assistant")}
            subtitle={t("miniapp.bot_type_assistant_desc")}
            onClick={() => navigate('/create?type=assistant')}
          />
          <ListItem
            icon={<IconExternalLink />}
            label={t("miniapp.bot_type_manager")}
            subtitle={t("miniapp.bot_type_manager_desc")}
            onClick={() => navigate('/create?type=manager')}
          />
        </Section>
      </div>
    </Page>
  );
};


