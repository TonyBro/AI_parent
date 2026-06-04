import React, { useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import { useBots } from '../../domains/bot/store';
import { useTranslation } from '../../shared/i18n';
import { createBot, uploadBotPhoto, analyzePrompt, storeTemplate, clearTemplate } from '../bot/api';
import { 
  Section, 
  Page, 
  FormInput, 
  FormTextArea, 
  Loader, 
  Avatar, 
  Button, 
  ConfirmModal,
  ICON_SIZES, 
  HintText,
  IconInfo,
  IconBroadcast,
  IconCommands,
  IconIntegrations,
  IconQuiz
} from '../../shared/components';
import { Camera } from 'lucide-react';
import { LanguageSelector } from '../../shared/LanguageSelector';
import { LanguagePicker } from './LanguagePicker';
import { useBackButton } from '../../shared/hooks/useBackButton';
import { useMainButton } from '../../shared/hooks/useMainButton';

export const CreateBot: React.FC = () => {
  const { refreshBots, updateBotAvatar } = useBots();
  const { t, langCode: systemLanguage, translateError } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const query = new URLSearchParams(location.search);
  const botType = (query.get('type') as 'assistant' | 'manager') || 'assistant';

  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzingPrompt, setAnalyzingPrompt] = useState(false);
  const [showPromptInfo, setShowPromptInfo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    bot_token: "",
    bot_prompt: "",
    default_language: "auto",
    type: botType,
  });

  const [promptAnalysis, setPromptAnalysis] = useState<{
    apiIntegrations?: any[];
    commands?: any[];
    scheduledBroadcasts?: any[];
    quizzes?: any[];
  } | null>(null);
  const [hasAnalyzedCurrentPrompt, setHasAnalyzedCurrentPrompt] = useState(false);

  useBackButton(() => {
    navigate(-1);
  });

  const canCreate = useMemo(() => {
    if (!form.bot_token.trim()) return false;
    if (!form.bot_prompt.trim()) return false;
    if (!form.default_language.trim()) return false;
    return true;
  }, [form]);

  async function onAnalyzePrompt() {
    if (!form.bot_prompt.trim()) return;

    setAnalyzingPrompt(true);
    setStatus(t("miniapp.analyzing_prompt"));
    try {
      const result = await analyzePrompt({
        prompt: form.bot_prompt,
        language: form.default_language,
      });
      setPromptAnalysis({
        apiIntegrations: result.config.apiIntegrations,
        commands: result.config.commands,
        scheduledBroadcasts: result.config.scheduledBroadcasts,
        quizzes: result.config.quizzes,
      });
      
      // Store template for later use
      try {
        await storeTemplate({
          config: result.config,
          originalPrompt: form.bot_prompt,
          language: form.default_language,
        });
      } catch (e: any) {
        // Non-critical error, log but continue
        console.warn('Failed to store template:', e);
      }
      
      setHasAnalyzedCurrentPrompt(true);
      setStatus(t("miniapp.analysis_complete"));
    } catch (e: any) {
      setStatus(t("miniapp.analysis_failed", { error: translateError(e) }));
    } finally {
      setAnalyzingPrompt(false);
    }
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(t("miniapp.invalid_file_type"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert(t("miniapp.file_too_large"));
      return;
    }

    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  async function onCreate() {
    if (!canCreate || saving || analyzingPrompt) return;
    setSaving(true);
    setStatus(t("miniapp.creating_bot_status"));
    try {
      const result = await createBot({
        bot_token: form.bot_token.trim(),
        bot_prompt: form.bot_prompt.trim(),
        default_language: form.default_language.trim() || "en",
        type: form.type,
      });

      if (photo) {
        setStatus(t("miniapp.saving"));
        await uploadBotPhoto(result.bot.id, photo);
        updateBotAvatar(result.bot.id);
      }
      
      await refreshBots();
      setStatus("");
      navigate(`/bot/${result.bot.id}/settings`, { replace: true });
    } catch (e: any) {
      setStatus(t("miniapp.create_failed", { error: translateError(e) }));
    } finally {
      setSaving(false);
    }
  }

  const isLanguageRoute = location.pathname.endsWith('/language');

  useMainButton({
    text: hasAnalyzedCurrentPrompt ? t("miniapp.create_bot") : t("miniapp.design_bot_with_ai"),
    onClick: hasAnalyzedCurrentPrompt ? onCreate : onAnalyzePrompt,
    isVisible: !isLanguageRoute,
    isEnabled: canCreate && !saving && !analyzingPrompt
  });

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
          <ConfirmModal
            isOpen={showPromptInfo}
            title={t("miniapp.bot_prompt")}
            message={t("miniapp.bot_instructions_info")}
            confirmText={t("miniapp.got_it")}
            onConfirm={() => setShowPromptInfo(false)}
            variant="primary"
          />
          <div style={{ padding: '0 16px' }}>
            {(saving || analyzingPrompt) && <Loader fullscreen text={status} />}
            {status && !saving && !analyzingPrompt && (
              <div style={{ padding: '16px 16px 0', textAlign: 'right' }}>
                <p className="muted" style={{ margin: 0 }}>{status}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '20px', paddingBottom: '10px' }}>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept="image/*"
                onChange={handleFileChange}
              />
              <div style={{ width: '80px', height: '80px' }}>
                <Avatar 
                  src={photoPreview || undefined} 
                  fallback={"B"} 
                  size="large"
                  onEdit={handleAvatarClick}
                />
              </div>
              <div style={{ marginTop: '12px' }}>
                <Button 
                  variant="secondary" 
                  onClick={handleAvatarClick}
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
            </div>

            <Section title={
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span>{t("miniapp.bot_token")}</span>
                <span style={{ fontSize: '13px', fontWeight: 'normal', textTransform: 'none', color: 'var(--muted)' }}>
                  ({t("miniapp.from")} <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>@BotFather</a>)
                </span>
              </div>
            }>
              <FormInput
                placeholder={t("miniapp.paste_token")}
                value={form.bot_token}
                onChange={(e) => setForm((f) => ({ ...f, bot_token: e.target.value }))}
                type="password"
              />
            </Section>

            <Section title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{t("miniapp.bot_prompt")}</span>
                <button 
                  onClick={() => setShowPromptInfo(true)}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    padding: 0, 
                    display: 'flex', 
                    alignItems: 'center',
                    color: 'var(--accent)',
                    cursor: 'pointer'
                  }}
                >
                  <IconInfo />
                </button>
              </div>
            }>
              <FormTextArea
                style={{ height: '120px' }}
                placeholder={t("miniapp.bot_prompt_placeholder")}
                value={form.bot_prompt}
                onChange={(e) => {
                  setForm((f) => ({ ...f, bot_prompt: e.target.value }));
                  if (promptAnalysis || hasAnalyzedCurrentPrompt) {
                    setPromptAnalysis(null);
                    setHasAnalyzedCurrentPrompt(false);
                    // Clear template from backend
                    clearTemplate().catch(() => {
                      // Non-critical error, ignore
                    });
                  }
                }}
              />
              <div style={{ padding: '0 16px 16px' }}>
                <HintText>
                  {t("miniapp.bot_prompt_hint")}
                </HintText>

                {promptAnalysis && (
                  <div style={{ marginTop: '16px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--accent)' }}>{t("miniapp.prompt_analysis_result")}</h4>
                    
                    {promptAnalysis.apiIntegrations && promptAnalysis.apiIntegrations.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <IconIntegrations /> {t("miniapp.detected_integrations")}
                        </div>
                        {promptAnalysis.apiIntegrations.map((api, idx) => (
                          <div key={idx} style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', marginBottom: '4px', fontSize: '12px' }}>
                            <div style={{ fontWeight: '600' }}>{api.displayName}</div>
                            <div style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{api.apiUrl}</div>
                            {api.dynamicParams && (
                              <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                <div style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '2px' }}>
                                  {t("miniapp.url_construction_rules")}:
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.4' }}>
                                  {api.dynamicParams}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {promptAnalysis.commands && promptAnalysis.commands.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <IconCommands /> {t("miniapp.detected_commands")}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {promptAnalysis.commands.map((cmd, idx) => (
                            <div key={idx} style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', fontSize: '12px' }}>
                              <div style={{ fontWeight: '600', color: 'var(--accent)' }}>{cmd.command}</div>
                              <div style={{ color: 'var(--muted)', marginTop: '2px' }}>{cmd.description}</div>
                              {(cmd.integrationDisplayName || (cmd.quizTitles && cmd.quizTitles.length > 0)) && (
                                <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                  {cmd.integrationDisplayName && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <IconIntegrations size={12} />
                                      {cmd.integrationDisplayName}
                                    </span>
                                  )}
                                  {cmd.quizTitles && cmd.quizTitles.map((title: string, qIdx: number) => (
                                    <span key={qIdx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <IconQuiz size={12} />
                                      {title}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {promptAnalysis.quizzes && promptAnalysis.quizzes.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <IconQuiz /> {t("miniapp.detected_quizzes")}
                        </div>
                        {promptAnalysis.quizzes.map((quiz, idx) => (
                          <div key={idx} style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', marginBottom: '4px', fontSize: '12px' }}>
                            <div style={{ fontWeight: '600' }}>{quiz.title}</div>
                            <div style={{ color: 'var(--muted)' }}>
                              {t("miniapp.questions_count", { count: quiz.items.length })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {promptAnalysis.scheduledBroadcasts && promptAnalysis.scheduledBroadcasts.length > 0 && (
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <IconBroadcast /> {t("miniapp.detected_broadcasts")}
                        </div>
                        {promptAnalysis.scheduledBroadcasts.map((broadcast, idx) => (
                          <div key={idx} style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', marginBottom: '4px', fontSize: '12px' }}>
                            <div style={{ fontWeight: '600' }}>{broadcast.sendTimeHour}:00 (Local)</div>
                            <div style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{broadcast.prePrompt}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Section>

            <Section title={t("miniapp.language")}>
              <div style={{ padding: '0 16px' }}>
                <LanguageSelector
                  value={form.default_language}
                  onClick={() => navigate('language')}
                />
              </div>
            </Section>
          </div>
        </Page>
      } />
    </Routes>
  );
};

