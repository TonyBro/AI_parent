import React, { useState, useRef } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router-dom';
import { useBots } from '../domains/bot/store';
import { useTranslation } from '../shared/i18n';
import { Actions, type ActionsView } from '../Actions';
import { Page, ProfileHeader, Avatar, Loader } from '../components';
import { useBackButton } from '../shared/hooks/useBackButton';
import { useMainButton } from '../shared/hooks/useMainButton';

export const ActionsWrapper: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();
  const { getBotById, loading: botsLoading } = useBots();
  const { t } = useTranslation();
  const navigate = useNavigate();
  useBackButton(() => navigate(-1));

  const bot = botId ? getBotById(botId) : null;

  const [canSaveAction, setCanSaveAction] = useState(false);
  const [isNewAction, setIsNewAction] = useState(false);
  const actionSaveRef = useRef<() => void>(() => {});

  // State for editing/creating actions
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [draftType, setDraftType] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ target_url: "", replace_to: "" });

  const handleViewChange = (v: ActionsView) => {
    if (v === 'list') {
      navigate(`/bot/${botId}/actions`);
    } else {
      navigate(`/bot/${botId}/actions/${v}`);
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
            <ActionsSubPage 
              botId={bot.id} 
              view="list" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveAction}
              onIsNewChange={setIsNewAction}
              saveRef={actionSaveRef}
              selectedActionId={selectedActionId}
              setSelectedActionId={setSelectedActionId}
              draftType={draftType}
              setDraftType={setDraftType}
              editForm={editForm}
              setEditForm={setEditForm}
            />
          } />
          <Route path="picker" element={
            <ActionsSubPage 
              botId={bot.id} 
              view="picker" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveAction}
              onIsNewChange={setIsNewAction}
              saveRef={actionSaveRef}
              selectedActionId={selectedActionId}
              setSelectedActionId={setSelectedActionId}
              draftType={draftType}
              setDraftType={setDraftType}
              editForm={editForm}
              setEditForm={setEditForm}
            />
          } />
          <Route path="edit" element={
            <ActionsSubPage 
              botId={bot.id} 
              view="edit" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveAction}
              onIsNewChange={setIsNewAction}
              saveRef={actionSaveRef}
              selectedActionId={selectedActionId}
              setSelectedActionId={setSelectedActionId}
              draftType={draftType}
              setDraftType={setDraftType}
              editForm={editForm}
              setEditForm={setEditForm}
            />
          } />
        </Routes>
      </div>
    </Page>
  );
};

const ActionsSubPage: React.FC<any> = ({ 
  botId, view, onViewChange, onCanSaveChange, onIsNewChange, saveRef,
  selectedActionId, setSelectedActionId, draftType, setDraftType, editForm, setEditForm
}) => {
  const { t } = useTranslation();

  useMainButton({
    text: view === "list" ? "+ " + t("miniapp.add_action") : (view === "edit" ? t("miniapp.save") : ""),
    onClick: () => {
      if (view === "list") {
        onViewChange("picker");
      } else if (view === "edit") {
        saveRef.current();
      }
    },
    isVisible: view !== "picker",
    isEnabled: view === "list" || true // validation handled by component
  });

  return (
    <Actions 
      botId={botId} 
      view={view}
      onViewChange={onViewChange}
      onCanSaveChange={onCanSaveChange}
      onIsNewChange={onIsNewChange}
      saveRef={saveRef}
      selectedActionId={selectedActionId}
      setSelectedActionId={setSelectedActionId}
      draftType={draftType}
      setDraftType={setDraftType}
      editForm={editForm}
      setEditForm={setEditForm}
    />
  );
};
