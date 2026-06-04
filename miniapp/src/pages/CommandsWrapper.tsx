import React, { useState, useRef } from 'react';
import { useParams, Routes, Route, useNavigate } from 'react-router-dom';
import { useBots } from '../domains/bot/store';
import { useTranslation } from '../shared/i18n';
import { Commands } from '../Commands';
import { Page, ProfileHeader, Avatar, Loader } from '../components';
import { useBackButton } from '../shared/hooks/useBackButton';
import { useMainButton } from '../shared/hooks/useMainButton';

export const CommandsWrapper: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();
  const { getBotById, loading: botsLoading } = useBots();
  const { t } = useTranslation();
  const navigate = useNavigate();
  useBackButton(() => navigate(-1));

  const bot = botId ? getBotById(botId) : null;

  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [canSaveCommand, setCanSaveCommand] = useState(false);
  const commandSaveRef = useRef<() => void>(() => {});

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
            <CommandsList 
              botId={bot.id} 
              onEdit={(id: string | null) => {
                setEditingCommandId(id);
                navigate(`/bot/${bot.id}/commands/edit`);
              }} 
              onAdd={() => {
                setEditingCommandId(null);
                navigate(`/bot/${bot.id}/commands/edit`);
              }}
            />
          } />
          <Route path="edit" element={
            <CommandEdit 
              botId={bot.id} 
              editingId={editingCommandId}
              canSave={canSaveCommand}
              onCanSaveChange={setCanSaveCommand}
              saveRef={commandSaveRef}
              onBack={() => navigate(-1)}
            />
          } />
        </Routes>
      </div>
    </Page>
  );
};

const CommandsList: React.FC<any> = ({ botId, onEdit, onAdd }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useBackButton(() => navigate(-1)); // Added back navigation
  useMainButton({
    text: "+ " + t("miniapp.add_command"),
    onClick: onAdd,
    isVisible: true
  });
  return <Commands botId={botId} view="list" onEdit={onEdit} />;
};

import { Integrations } from '../Integrations';

const CommandEdit: React.FC<any> = ({ botId, editingId, canSave, onCanSaveChange, saveRef, onBack }) => {
  const { t } = useTranslation();
  const [isPickingIntegration, setIsPickingIntegration] = useState(false);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [onIntegrationSelect, setOnIntegrationSelect] = useState<((id: string | null) => void) | null>(null);

  useBackButton(isPickingIntegration ? () => setIsPickingIntegration(false) : onBack);

  useMainButton({
    text: t("miniapp.save"),
    onClick: () => saveRef.current(),
    isVisible: !isPickingIntegration,
    isEnabled: canSave
  });

  return (
    <>
      <div style={{ display: isPickingIntegration ? 'none' : 'block' }}>
        <Commands 
          botId={botId} 
          view="edit" 
          editingId={editingId}
          onCanSaveChange={onCanSaveChange}
          saveRef={saveRef}
          onBack={onBack}
          onSelectIntegration={(currentId, callback) => {
            setSelectedIntegrationId(currentId);
            setOnIntegrationSelect(() => callback);
            setIsPickingIntegration(true);
          }}
        />
      </div>
      
      {isPickingIntegration && (
        <Integrations 
          botId={botId}
          selectionMode
          selectedId={selectedIntegrationId}
          onSelect={(id) => {
            onIntegrationSelect?.(id);
            setIsPickingIntegration(false);
          }}
        />
      )}
    </>
  );
};

