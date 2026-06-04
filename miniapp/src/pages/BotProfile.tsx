import React, { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBots } from '../domains/bot/store';
import { useTranslation } from '../shared/i18n';
import { 
  Section, ListItem, ProfileHeader, Avatar, Page, 
  IconQuiz, IconBroadcast, IconCommands, IconIntegrations, IconExternalLink, IconInfo, Loader 
} from '../components';
import { useBackButton } from '../shared/hooks/useBackButton';
import { uploadBotPhoto } from '../api';

export const BotProfile: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();
  const { getBotById, loading: botsLoading, refreshBots } = useBots();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useBackButton(() => navigate('/'));

  const bot = botId ? getBotById(botId) : null;

  const handleAvatarClick = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !botId) return;

    if (!file.type.startsWith('image/')) {
      alert(t("miniapp.invalid_file_type"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert(t("miniapp.file_too_large"));
      return;
    }

    setUploading(true);
    try {
      await uploadBotPhoto(botId, file);
      await refreshBots();
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || t("miniapp.photo_update_failed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (botsLoading && !bot) return <Page><Loader /></Page>;
  if (!bot) {
    return <Page><div>{t("miniapp.bot_not_found")}</div></Page>;
  }

  return (
    <Page className="no-padding">
      <div style={{ padding: '0 16px' }}>
        <header className="header bot-details-header">
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            accept="image/*"
            onChange={handleFileChange}
          />
          <ProfileHeader
            avatar={
              <Avatar 
                src={bot.bot_username ? `https://t.me/i/userpic/320/${bot.bot_username}.jpg?t=${Date.now()}` : `/api/bots/${bot.id}/avatar`} 
                fallback={(bot.name || bot.bot_username || "B").trim()} 
                size="large"
                userId={bot.id}
                onEdit={handleAvatarClick}
                loading={uploading}
              />
            }
            name={bot.name || t("miniapp.unnamed_bot")}
            username={`@${bot.bot_username}`}
            subscriberCount={bot.subscriber_count}
          />
        </header>

        <Section title={t("miniapp.bot_management")}>
          {(bot.type === "assistant" || !bot.type) && (
            <>
              <ListItem 
                icon={<IconQuiz />} 
                label={t("miniapp.quizzes")} 
                subtitle={t("miniapp.quizzes_desc")}
                onClick={() => navigate(`/bot/${bot.id}/quizzes`)} 
              />
              <ListItem 
                icon={<IconBroadcast />} 
                label={t("miniapp.broadcast")} 
                subtitle={t("miniapp.broadcast_desc")}
                onClick={() => navigate(`/bot/${bot.id}/broadcast`)} 
              />
              <ListItem 
                icon={<IconCommands />} 
                label={t("miniapp.commands")} 
                subtitle={t("miniapp.commands_desc")}
                onClick={() => navigate(`/bot/${bot.id}/commands`)} 
              />
              <ListItem 
                icon={<IconIntegrations />} 
                label={t("miniapp.integrations")} 
                subtitle={t("miniapp.integrations_desc")}
                onClick={() => navigate(`/bot/${bot.id}/integrations`)} 
              />
            </>
          )}
          {bot.type === "manager" && (
            <ListItem 
              icon={<IconExternalLink />} 
              label={t("miniapp.actions")} 
              subtitle={t("miniapp.actions_desc")}
              onClick={() => navigate(`/bot/${bot.id}/actions`)} 
            />
          )}
          <ListItem 
            icon={<IconInfo />} 
            label={t("miniapp.settings")} 
            subtitle={t("miniapp.settings_desc")}
            onClick={() => navigate(`/bot/${bot.id}/settings`)}
          />
        </Section>
      </div>
    </Page>
  );
};

