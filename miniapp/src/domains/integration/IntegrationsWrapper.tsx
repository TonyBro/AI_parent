import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router-dom';
import { useBots } from '../../domains/bot/store';
import { useTranslation } from '../../shared/i18n';
import { Integrations, type IntegrationsView } from './Integrations';
import { Page, ProfileHeader, Avatar, Loader } from '../../shared/components';
import { useBackButton } from '../../shared/hooks/useBackButton';
import { useMainButton } from '../../shared/hooks/useMainButton';

export const IntegrationsWrapper: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();
  const { getBotById, loading: botsLoading } = useBots();
  const { t } = useTranslation();
  const navigate = useNavigate();
  useBackButton(() => navigate(-1));

  const bot = botId ? getBotById(botId) : null;

  const [activeIntegration, setActiveIntegration] = useState<any>(null);
  const [canSaveIntegrations, setCanSaveIntegrations] = useState(false);
  const integrationsSaveRef = useRef<() => void>(() => {});
  const historyStateRef = useRef<number>(0);

  // Track navigation to settings page
  useEffect(() => {
    const currentPath = window.location.pathname;
    if (currentPath.includes('/integrations/settings')) {
      historyStateRef.current = window.history.length;
    }
  }, []);

  const handleViewChange = (v: string) => {
    if (v === 'active-list') {
      navigate(`/bot/${botId}/integrations`);
    } else if (v === 'available') {
      navigate(`/bot/${botId}/integrations/available`);
    } else {
      navigate(`/bot/${botId}/integrations/${v}`);
    }
  };

  const handleNavigateToList = (replace?: boolean) => {
    if (replace) {
      // Go back to where we were before opening settings
      // This effectively removes the settings page from history
      navigate(-1);
    } else {
      navigate(`/bot/${botId}/integrations`);
    }
  };

  if (botsLoading && !bot) return <Page><Loader /></Page>;
  if (!bot) return <Page><div>{t("miniapp.bot_not_found")}</div></Page>;

  return (
    <Page className="no-padding">
      <div style={{ padding: '0 16px' }}>
        <header className="header bot-details-header">
          <ProfileHeader
            avatar={
              <Avatar 
                src={bot.bot_username ? `https://t.me/i/userpic/320/${bot.bot_username}.jpg` : `/api/bots/${bot.id}/avatar`} 
                fallback={(bot.name || bot.bot_username || "B").trim()} 
                size="large"
                userId={bot.id}
              />
            }
            name={bot.name || t("miniapp.unnamed_bot")}
            username={`@${bot.bot_username}`}
          />
        </header>

        <Routes>
          <Route index element={
            <IntegrationsSubPage 
              botId={bot.id} 
              view="active-list" 
              onViewChange={handleViewChange}
              onNavigateToList={handleNavigateToList}
              activeIntegration={activeIntegration}
              onActiveIntegrationChange={setActiveIntegration}
              onCanSaveChange={setCanSaveIntegrations}
              saveRef={integrationsSaveRef}
            />
          } />
          <Route path="available" element={
            <IntegrationsSubPage 
              botId={bot.id} 
              view="available" 
              onViewChange={handleViewChange}
              onNavigateToList={handleNavigateToList}
              activeIntegration={activeIntegration}
              onActiveIntegrationChange={setActiveIntegration}
              onCanSaveChange={setCanSaveIntegrations}
              saveRef={integrationsSaveRef}
            />
          } />
          <Route path="settings" element={
            <IntegrationsSubPage 
              botId={bot.id} 
              view="settings" 
              onViewChange={handleViewChange}
              onNavigateToList={handleNavigateToList}
              activeIntegration={activeIntegration}
              onActiveIntegrationChange={setActiveIntegration}
              onCanSaveChange={setCanSaveIntegrations}
              saveRef={integrationsSaveRef}
            />
          } />
          <Route path="working-hours" element={
            <IntegrationsSubPage 
              botId={bot.id} 
              view="working-hours" 
              onViewChange={handleViewChange}
              onNavigateToList={handleNavigateToList}
              activeIntegration={activeIntegration}
              onActiveIntegrationChange={setActiveIntegration}
              onCanSaveChange={setCanSaveIntegrations}
              saveRef={integrationsSaveRef}
            />
          } />
        </Routes>
      </div>
    </Page>
  );
};

const IntegrationsSubPage: React.FC<any> = ({ botId, view, onViewChange, onNavigateToList, activeIntegration, onActiveIntegrationChange, onCanSaveChange, saveRef }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [canSave, setCanSave] = useState(false);
  const isMainButtonVisible = view === "working-hours" || (view === "settings" && activeIntegration?.type?.type === "custom_api");
  
  // Show "Add Integration" button on active-list view
  const showAddButton = view === "active-list";

  useMainButton({
    text: isMainButtonVisible ? t("miniapp.save") : t("miniapp.integrations_add"),
    onClick: () => {
      if (isMainButtonVisible) {
        saveRef.current();
      } else if (showAddButton) {
        navigate(`/bot/${botId}/integrations/available`);
      }
    },
    isVisible: isMainButtonVisible || showAddButton,
    isEnabled: true
  });

  return (
    <Integrations 
      botId={botId} 
      view={view}
      onViewChange={onViewChange}
      onNavigateToList={onNavigateToList}
      activeIntegration={activeIntegration}
      onActiveIntegrationChange={onActiveIntegrationChange}
      onCanSaveChange={onCanSaveChange}
      saveRef={saveRef}
    />
  );
};
