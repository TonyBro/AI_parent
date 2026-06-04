import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, Routes, Route, useLocation } from 'react-router-dom';
import { useBots } from '../domains/bot/store';
import { useTranslation } from '../shared/i18n';
import { patchBot, deleteBot, uploadBotPhoto } from '../api';
import { Section, ToggleItem, Page, ProfileHeader, Avatar, FormInput, FormTextArea, ListItem, Loader, Button, ICON_SIZES } from '../components';
import { Camera } from 'lucide-react';
import { LanguageSelector } from '../LanguageSelector';
import { LanguagePicker } from './LanguagePicker';
import { useBackButton } from '../shared/hooks/useBackButton';
import { useMainButton } from '../shared/hooks/useMainButton';

export const BotSettings: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();
  const { getBotById, refreshBots, loading: botsLoading } = useBots();
  const { t, translateError } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  
  const bot = botId ? getBotById(botId) : null;

  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    status: "active",
    default_language: "en",
    name: "",
    description: "",
  });

  useBackButton(() => {
    navigate(-1);
  });

  useEffect(() => {
    if (bot) {
      setForm({
        status: bot.status || "active",
        default_language: bot.default_language || "en",
        name: bot.name || "",
        description: bot.description || "",
      });
    }
  }, [bot]);

  const hasChanged = useMemo(() => {
    if (!bot) return false;
    return (
      form.status !== (bot.status || "active") ||
      form.default_language !== (bot.default_language || "en") ||
      form.name.trim() !== (bot.name || "").trim() ||
      form.description.trim() !== (bot.description || "").trim()
    );
  }, [bot, form]);

  const canSave = useMemo(() => {
    if (!form.name.trim()) return false;
    if (!form.description.trim()) return false;
    if (!form.default_language.trim()) return false;
    return hasChanged;
  }, [form, hasChanged]);

  async function onSave() {
    if (!bot || !canSave || saving) return;
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      await patchBot(bot.id, {
        status: form.status,
        default_language: form.default_language.trim() || "en",
        name: form.name.trim(),
        description: form.description.trim(),
      });
      await refreshBots();
      setStatus("");
      navigate(`/bot/${bot.id}`);
    } catch (e: any) {
      setStatus(t("miniapp.save_failed", { error: translateError(e) }));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!bot || deleting) return;
    if (!window.confirm(t("miniapp.delete_bot_confirm"))) return;

    setDeleting(true);
    setStatus(t("miniapp.deleting_bot"));
    try {
      await deleteBot(bot.id);
      await refreshBots();
      navigate('/');
    } catch (e: any) {
      setStatus(t("miniapp.delete_failed", { error: translateError(e) }));
      setDeleting(false);
    }
  }

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

  const isLanguageRoute = location.pathname.endsWith('/language');

  useMainButton({
    text: t("miniapp.save"),
    onClick: onSave,
    isVisible: !isLanguageRoute,
    isEnabled: canSave && !saving
  });

  if (botsLoading && !bot) return <Page><Loader /></Page>;
  if (!bot) return <Page><div>{t("miniapp.bot_not_found")}</div></Page>;

  return (
    <Routes>
      <Route path="/language" element={
        <LanguagePicker 
          onSelect={(code) => {
            setForm(f => ({ ...f, default_language: code }));
            navigate(-1);
          }}
          onBack={() => navigate(-1)}
        />
      } />
      <Route path="/" element={
        <Page className="no-padding">
          <div style={{ padding: '0 16px' }}>
            {(saving || deleting || uploading) && <Loader fullscreen text={status || (uploading ? t("miniapp.saving") : "")} />}
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
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-12px', marginBottom: '16px' }}>
                <Button 
                  variant="secondary" 
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  style={{ 
                    borderRadius: '20px', 
                    padding: '8px 20px', 
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <Camera size={ICON_SIZES.small} />
                  {t("miniapp.set_new_photo")}
                </Button>
              </div>
            </header>

            {status && !saving && !deleting && (
              <div style={{ padding: '0 16px 16px', textAlign: 'right' }}>
                <p className="muted" style={{ margin: 0 }}>{status}</p>
              </div>
            )}

            <Section title={t("miniapp.status")}>
              <ToggleItem 
                label={form.status === "active" ? t("miniapp.status_active") : t("miniapp.status_disabled")}
                subtitle={form.status === "active" ? t("miniapp.status_active_desc") : t("miniapp.status_disabled_desc")}
                checked={form.status === "active"}
                onChange={(checked: boolean) => setForm((f) => ({ ...f, status: checked ? "active" : "disabled" }))}
              />
            </Section>

            <Section title={t("miniapp.language")}>
              <div style={{ padding: '0 16px' }}>
                <LanguageSelector 
                  value={form.default_language} 
                  onClick={() => navigate('language')} 
                />
              </div>
            </Section>

            <Section title={t("miniapp.bot_identity")}>
              <FormInput
                placeholder={t("miniapp.bot_name")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                hasDivider
                autoComplete="off"
              />
              <FormTextArea
                style={{ height: '100px' }}
                placeholder={t("miniapp.description")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                autoComplete="off"
              />
            </Section>

            <Section title={t("miniapp.bot_management")}>
              <ListItem
                label={t("miniapp.delete_bot")}
                isDanger
                onClick={onDelete}
              />
            </Section>
          </div>
        </Page>
      } />
    </Routes>
  );
};

