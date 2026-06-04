import React, { useState, useRef } from 'react';
import { useParams, Routes, Route, useNavigate } from 'react-router-dom';
import { useBots } from '../domains/bot/store';
import { useTranslation } from '../shared/i18n';
import { Broadcast, type BroadcastView } from '../Broadcast';
import { Page, ProfileHeader, Avatar, Loader } from '../components';
import { useBackButton } from '../shared/hooks/useBackButton';
import { useMainButton } from '../shared/hooks/useMainButton';

export const BroadcastWrapper: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();
  const { getBotById, loading: botsLoading } = useBots();
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const bot = botId ? getBotById(botId) : null;

  const [canSaveBroadcast, setCanSaveBroadcast] = useState(false);
  const [currentView, setCurrentView] = useState<BroadcastView>('list');
  const broadcastSaveRef = useRef<() => void>(() => {});

  // Smart back navigation based on current view
  const handleBack = () => {
    const viewHierarchy: Record<string, string> = {
      'schedule-list': 'list',
      'schedule': 'schedule-list',
      'schedule-quizzes': 'schedule',
      'schedule-integration': 'schedule',
      'now-menu': 'list',
      'now-regular': 'now-menu',
      'now-ai': 'now-menu',
      'now-ai-quizzes': 'now-ai',
      'now-ai-integration': 'now-ai',
      'now-quiz': 'now-menu',
    };

    const parentView = viewHierarchy[currentView];
    if (parentView) {
      handleViewChange(parentView as BroadcastView);
    } else {
      // Default to going back to bot details if we're at the top level
      navigate(`/bot/${botId}`);
    }
  };

  useBackButton(handleBack);

  const handleViewChange = (v: BroadcastView) => {
    setCurrentView(v);
    if (v === 'list') {
      navigate(`/bot/${botId}/broadcast`, { replace: false });
    } else {
      navigate(`/bot/${botId}/broadcast/${v}`, { replace: false });
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
            <BroadcastSubPage 
              botId={bot.id} 
              view="list" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('list')}
            />
          } />
          <Route path="schedule-list" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="schedule-list" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('schedule-list')}
            />
          } />
          <Route path="schedule" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="schedule" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('schedule')}
            />
          } />
          <Route path="schedule/:id" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="schedule" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('schedule')}
            />
          } />
          <Route path="schedule-quizzes" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="schedule-quizzes" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('schedule-quizzes')}
            />
          } />
          <Route path="schedule-integration" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="schedule-integration" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('schedule-integration')}
            />
          } />
          <Route path="now-menu" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="now-menu" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('now-menu')}
            />
          } />
          <Route path="now-regular" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="now-regular" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('now-regular')}
            />
          } />
          <Route path="now-ai" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="now-ai" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('now-ai')}
            />
          } />
          <Route path="now-ai-quizzes" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="now-ai-quizzes" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('now-ai-quizzes')}
            />
          } />
          <Route path="now-ai-integration" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="now-ai-integration" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('now-ai-integration')}
            />
          } />
          <Route path="now-quiz" element={
            <BroadcastSubPage 
              botId={bot.id} 
              view="now-quiz" 
              onViewChange={handleViewChange}
              onCanSaveChange={setCanSaveBroadcast}
              saveRef={broadcastSaveRef}
              onViewMounted={() => setCurrentView('now-quiz')}
            />
          } />
        </Routes>
      </div>
    </Page>
  );
};

interface BroadcastSubPageProps {
  botId: string;
  view: BroadcastView;
  onViewChange: (v: BroadcastView) => void;
  onCanSaveChange: (canSave: boolean) => void;
  saveRef: React.MutableRefObject<() => void>;
  onViewMounted: () => void;
}

const BroadcastSubPage: React.FC<BroadcastSubPageProps> = ({ botId, view, onViewChange, onCanSaveChange, saveRef, onViewMounted }) => {
  const { t } = useTranslation();
  const isScheduleList = view === "schedule-list";
  const isMainButtonVisible = view !== "list" && view !== "now-menu";
  const isSchedule = view === "schedule";
  const isQuizzesSelection = view === "now-ai-quizzes" || view === "schedule-quizzes";

  // Notify parent when this view is mounted
  React.useEffect(() => {
    onViewMounted();
  }, [onViewMounted]);

  useMainButton({
    text: isScheduleList ? "+ " + t("miniapp.create_new") : (isQuizzesSelection ? t("miniapp.save") : (isSchedule ? t("miniapp.save") : t("miniapp.broadcast_now_send"))),
    onClick: isScheduleList ? () => onViewChange("schedule") : (isQuizzesSelection ? () => onViewChange(view === "now-ai-quizzes" ? "now-ai" : "schedule") : () => saveRef.current()),
    isVisible: isMainButtonVisible || isScheduleList,
    isEnabled: true // Broadcast handles its own validation for now
  });

  return (
    <Broadcast 
      botId={botId} 
      view={view}
      onViewChange={onViewChange}
      onCanSaveChange={onCanSaveChange}
      saveRef={saveRef}
    />
  );
};
