import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBots } from '../domains/bot/store';
import { useTranslation } from '../shared/i18n';
import { Section, ListItem, Avatar, Page, IconPlus } from '../components';
import { useBackButton } from '../shared/hooks/useBackButton';

export const Landing: React.FC = () => {
  const { bots, loading, error } = useBots();
  const { t } = useTranslation();
  const navigate = useNavigate();
  useBackButton();

  if (loading && bots.length === 0) {
    return (
      <Page>
        <div style={{ padding: '20px', textAlign: 'center' }}>{t('miniapp.loading')}</div>
      </Page>
    );
  }

  return (
    <Page>
      <section className="landing">
        <header className="landing-header">
          <div className="ui-avatar-container" style={{ margin: "0 auto 8px" }}>
            <Avatar 
              src="https://t.me/i/userpic/320/ai_parent_bot.jpg" 
              fallback="🤖" 
              size="large" 
            />
          </div>
          <h1>{t("miniapp.ai_parent")}</h1>
          <p className="muted-text">
            {t("parent.bot_full_description").split("\n")[0]}
          </p>
        </header>

        <Section title={t("miniapp.my_bots")}>
          <ListItem
            icon={
              <div className="ui-avatar-small" style={{ background: 'rgba(36, 129, 204, 0.1)', color: 'var(--accent)', border: '1px solid rgba(36, 129, 204, 0.2)' }}>
                <IconPlus size={16} color="currentColor" />
              </div>
            }
            label={t("miniapp.create_new_bot")}
            isAction
            onClick={() => navigate('/create/type')}
          />

          {bots.map((b: any) => (
            <ListItem
              key={b.id}
              icon={
                <div className="ui-avatar-small">
                  <Avatar 
                    src={b.bot_username ? `https://t.me/i/userpic/320/${b.bot_username}.jpg` : `/api/bots/${b.id}/avatar`} 
                    fallback={(b.name || b.bot_username || "B").trim()} 
                    size="small"
                    userId={b.id}
                  />
                </div>
              }
              label={b.name || t("miniapp.unnamed_bot")}
              subtitle={`@${b.bot_username}`}
              onClick={() => navigate(`/bot/${b.id}`)}
            />
          ))}
        </Section>
        {error && <div style={{ color: 'red', padding: '16px' }}>{error}</div>}
      </section>
    </Page>
  );
};

