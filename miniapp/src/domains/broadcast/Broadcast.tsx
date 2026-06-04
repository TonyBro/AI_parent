import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  getBroadcastSettings,
  patchBroadcastSettings,
  createBroadcastSettings,
  deleteBroadcastSettings,
  sendBroadcastNow,
} from "./api";
import type { BroadcastSettings, BroadcastView } from "./types";
import { getQuizSets } from "../quiz/api";
import type { QuizSetDto } from "../quiz/types";
import { getIntegrations } from "../integration/api";
import { 
  Section,
  SectionTitle, 
  ListItem, 
  ToggleItem, 
  FormTextArea,
  FormInput,
  FormLabel,
  HintText,
  IconBroadcast,
  IconPlus,
  IconInfo,
  IconQuiz,
  IconIntegrations,
  Loader,
  Button,
  ICON_SIZES,
  CustomSelect,
  FormField
} from "../../shared/components";
import { Mail, Sparkles, Trash2, Clock } from "lucide-react";
import { useTranslation } from "../../shared/i18n";
import { Integrations } from "../integration/Integrations";

interface BroadcastProps {
  botId: string;
  view: BroadcastView;
  onViewChange: (view: BroadcastView) => void;
  onCanSaveChange?: (canSave: boolean) => void;
  saveRef?: React.MutableRefObject<() => void>;
}

export function Broadcast({ 
  botId, 
  view, 
  onViewChange,
  onCanSaveChange,
  saveRef
}: BroadcastProps) {
  const { id: routeId } = useParams<{ id?: string }>();
  const { t, translateError } = useTranslation();
  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  
  const [broadcasts, setBroadcasts] = useState<BroadcastSettings[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [settings, setSettings] = useState<BroadcastSettings>({
    enabled: false,
    use_quiz_results: true,
    quiz_set_ids: [],
    pre_prompt: "",
    send_time_hour: 9,
    sentence_count: 3,
  });

  // Broadcast Now state
  const [nowForm, setNowForm] = useState({
    message: "",
    prompt: "",
    quiz_set_ids: [] as string[],
    quiz_set_id: "",
    sentence_count: 3,
    integration_id: null as string | null,
  });
  const [quizSets, setQuizSets] = useState<QuizSetDto[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [bs, qs, ints] = await Promise.all([
          getBroadcastSettings(botId), 
          getQuizSets(botId),
          getIntegrations(botId)
        ]);
        setBroadcasts(bs);
        setQuizSets(qs);
        setIntegrations(ints);
        if (qs.length > 0) {
          setNowForm((f) => ({ ...f, quiz_set_id: qs[0].id }));
        }

        if (view === "schedule") {
          if (routeId) {
            const found = bs.find(b => b.id === routeId);
            if (found) {
              setSettings(found);
            }
          } else if (view === "schedule") {
             // Creating new, reset settings
             setSettings({
               enabled: true,
               use_quiz_results: true,
               quiz_set_ids: [],
               pre_prompt: "",
               send_time_hour: 9,
               sentence_count: 3,
             });
          }
        }
      } catch (e: any) {
        setStatus(`${t("parent.error_general").replace("{{error}}", "")} ${translateError(e)}`);
      }
    })();
  }, [botId, t, translateError, view, routeId]);

  const onSaveSettings = useCallback(async () => {
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      if (settings.id) {
        await patchBroadcastSettings(botId, settings.id, settings);
      } else {
        await createBroadcastSettings(botId, settings);
      }
      setStatus("");
      onViewChange("schedule-list");
    } catch (e: any) {
      setStatus(t("miniapp.save_failed", { error: translateError(e) }));
    } finally {
      setSaving(false);
    }
  }, [botId, settings, t, onViewChange, translateError]);

  const onDeleteBroadcast = async () => {
    if (!settings.id) return;
    if (!confirm(t("miniapp.broadcast_delete_confirm"))) return;

    setSaving(true);
    try {
      await deleteBroadcastSettings(botId, settings.id);
      onViewChange("schedule-list");
    } catch (e: any) {
      setStatus(t("miniapp.delete_failed", { error: translateError(e) }));
    } finally {
      setSaving(false);
    }
  };

  const onSendNow = useCallback(async () => {
    let type: "regular" | "ai" | "quiz" = "regular";
    if (view === "now-ai") type = "ai";
    if (view === "now-quiz") type = "quiz";

    if (type === "regular" && !nowForm.message.trim()) {
      setStatus(t("miniapp.enter_message"));
      return;
    }
    if (type === "ai" && !nowForm.prompt.trim()) {
      setStatus(t("miniapp.enter_prompt"));
      return;
    }
    if (type === "quiz" && !nowForm.quiz_set_id) {
      setStatus(t("miniapp.select_quiz"));
      return;
    }

    setSaving(true);
    setStatus(t("miniapp.sending_broadcast"));
    try {
      const res = await sendBroadcastNow(botId, {
        type,
        message: type === "regular" ? nowForm.message.trim() : undefined,
        prompt: type === "ai" ? nowForm.prompt.trim() : undefined,
        quiz_set_ids: type === "ai" && nowForm.quiz_set_ids.length > 0 ? nowForm.quiz_set_ids : undefined,
        quiz_set_id: type === "quiz" ? nowForm.quiz_set_id : undefined,
        sentence_count: type === "ai" ? nowForm.sentence_count : undefined,
        integration_id: type === "ai" ? nowForm.integration_id : undefined,
      });
      setStatus(t("miniapp.broadcast_sent_count", { count: res.sent_count }));
      if (type === "regular") setNowForm((f) => ({ ...f, message: "" }));
      // Give a moment to see the success message then go back
      setTimeout(() => {
        onViewChange("now-menu");
        setStatus("");
      }, 2000);
    } catch (e: any) {
      setStatus(t("miniapp.send_failed", { error: translateError(e) }));
    } finally {
      setSaving(false);
    }
  }, [botId, view, nowForm, onViewChange, t, translateError]);

  useEffect(() => {
    if (saveRef) {
      if (view === "schedule") {
        saveRef.current = onSaveSettings;
      } else if (view.startsWith("now-") && view !== "now-menu") {
        saveRef.current = onSendNow;
      }
    }
  }, [view, onSaveSettings, onSendNow, saveRef]);

  useEffect(() => {
    if (onCanSaveChange) {
      if (view === "schedule") {
        onCanSaveChange(true); // Always can save schedule
      } else if (view === "now-regular") {
        onCanSaveChange(!!nowForm.message.trim());
      } else if (view === "now-ai") {
        onCanSaveChange(!!nowForm.prompt.trim());
      } else if (view === "now-quiz") {
        onCanSaveChange(!!nowForm.quiz_set_id);
      } else {
        onCanSaveChange(false);
      }
    }
  }, [view, nowForm, onCanSaveChange]);

  const toggleQuizSet = (qs: QuizSetDto) => {
    setNowForm((f) => {
      const isChecked = f.quiz_set_ids.includes(qs.id) || (!!qs.parent_quiz_set_id && f.quiz_set_ids.includes(qs.parent_quiz_set_id));
      const next = isChecked 
        ? f.quiz_set_ids.filter((x) => x !== qs.id && x !== qs.parent_quiz_set_id) 
        : [...f.quiz_set_ids, qs.id];
      return { ...f, quiz_set_ids: next };
    });
  };

  const renderContent = () => {
    if (view === "list") {
      return (
        <div>
          {status && !saving && <p className="muted" style={{ margin: "16px" }}>{status}</p>}
          <Section title={t("miniapp.broadcast_scheduled")}>
            <ListItem
              icon={<Clock size={ICON_SIZES.large} />}
              label={t("miniapp.broadcast_scheduled")}
              onClick={() => onViewChange("schedule-list")}
            />
          </Section>

          <Section title={t("miniapp.broadcast_immediate")}>
            <ListItem 
              icon={<IconPlus />} 
              label={t("miniapp.broadcast_now")} 
              onClick={() => onViewChange("now-menu")} 
            />
          </Section>

          <Section title={t("miniapp.broadcast_how_it_works")}>
            <div style={{ padding: "16px", fontSize: "14px", color: "var(--muted)" }}>
              <p style={{ margin: "0 0 8px" }}>{t("miniapp.broadcast_how_schedule")}</p>
              <p style={{ margin: "0 0 8px" }}>{t("miniapp.broadcast_how_now")}</p>
              <p style={{ margin: "0 0 8px" }}>{t("miniapp.broadcast_how_ai")}</p>
              <p style={{ margin: 0 }}>{t("miniapp.broadcast_how_users")}</p>
            </div>
          </Section>
        </div>
      );
    }

    if (view === "schedule-list") {
      return (
        <div>
          {status && !saving && <p className="muted" style={{ margin: "16px" }}>{status}</p>}
          <Section title={t("miniapp.broadcast_scheduled")}>
            {broadcasts.length === 0 ? (
              <div style={{ padding: "16px", fontSize: "14px", color: "var(--muted)" }}>
                {t("miniapp.no_scheduled_broadcasts")}
              </div>
            ) : (
              broadcasts.map(b => (
                <ListItem
                  key={b.id}
                  icon={<Clock size={ICON_SIZES.large} />}
                  label={b.pre_prompt || t("miniapp.broadcast_daily_ai")}
                  subtitle={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ color: 'var(--muted)' }}>
                        {String(b.send_time_hour).padStart(2, "0")}:00 UTC — {b.enabled ? t("miniapp.status_active") : t("miniapp.status_disabled")}
                      </div>
                      {(b.integration_id || (b.quiz_set_ids && b.quiz_set_ids.length > 0)) && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                          {b.integration_id && integrations.find(i => i.id === b.integration_id) && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <IconIntegrations size={12} />
                              {integrations.find(i => i.id === b.integration_id)?.display_name}
                            </span>
                          )}
                          {b.quiz_set_ids && b.quiz_set_ids.map(quizId => {
                            const quiz = quizSets.find(q => q.id === quizId);
                            if (!quiz) return null;
                            return (
                              <span key={quizId} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <IconQuiz size={12} />
                                {quiz.title}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  }
                  onClick={() => onViewChange(`schedule/${b.id}` as any)}
                />
              ))
            )}
          </Section>
        </div>
      );
    }

    if (view === "schedule") {
      return (
        <div>
          {status && !saving && <p className="muted" style={{ margin: "16px" }}>{status}</p>}
          <Section title={t("miniapp.broadcast_schedule")}>
            <ToggleItem
              label={t("miniapp.broadcast_enable")}
              checked={settings.enabled}
              onChange={(val) => setSettings((s) => ({ ...s, enabled: val }))}
            />
            <div style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--muted)' }}>
              {t("miniapp.broadcast_schedule_desc")}
            </div>
          </Section>

          <Section title={t("miniapp.ai_instructions")}>
            <FormTextArea
              style={{ height: '100px' }}
              value={settings.pre_prompt}
              onChange={(e) => setSettings((s) => ({ ...s, pre_prompt: e.target.value }))}
              placeholder={t("miniapp.broadcast_now_ai_placeholder")}
            />
            <HintText style={{ padding: '0 16px 16px', marginTop: '4px' }}>
              {t("miniapp.broadcast_pre_prompt_hint")}
            </HintText>
            
            <FormField
              label={t("miniapp.broadcast_sentence_count")}
              type="number" 
              min={1} 
              max={10} 
              value={settings.sentence_count} 
              onChange={(e) => setSettings(s => ({ ...s, sentence_count: Number(e.target.value) }))}
            />
          </Section>

          <Section title={t("miniapp.broadcast_send_time")}>
            <div style={{ padding: '16px' }}>
              <CustomSelect
                value={settings.send_time_hour}
                onChange={(val) => setSettings((s) => ({ ...s, send_time_hour: Number(val) }))}
                options={Array.from({ length: 24 }, (_, i) => ({
                  value: i,
                  label: `${String(i).padStart(2, "0")}:00 UTC`,
                }))}
              />
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
                {t("miniapp.broadcast_send_time_hint")}
              </div>
            </div>
          </Section>

          <Section title={t("miniapp.broadcast_now_ai_quizzes_data")}>
            <ListItem
              label={t("miniapp.broadcast_now_ai_select_quizzes")}
              subtitle={settings.quiz_set_ids && settings.quiz_set_ids.length > 0 
                ? t("miniapp.broadcast_now_ai_selected_quizzes", { count: settings.quiz_set_ids.length })
                : t("miniapp.none")}
              onClick={() => onViewChange("schedule-quizzes")}
            />
          </Section>

          <Section title={t("miniapp.broadcast_integration")}>
            <ListItem
              label={settings.integration_id ? t("miniapp.integrations") : t("miniapp.none")}
              subtitle={t("miniapp.broadcast_integration_desc")}
              onClick={() => onViewChange("schedule-integration")}
            />
          </Section>

          {settings.id && (
            <div style={{ padding: '16px' }}>
              <Button fullWidth variant="danger" onClick={onDeleteBroadcast}>
                <Trash2 size={ICON_SIZES.medium} style={{ marginRight: '8px' }} />
                {t("miniapp.delete_broadcast")}
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (view === "schedule-quizzes") {
      return (
        <Section title={t("miniapp.broadcast_now_ai_select_quizzes")}>
          {quizSets.length === 0 ? (
            <div style={{ padding: "16px", fontSize: "14px", color: "var(--muted)" }}>
              {t("miniapp.no_quiz_sets")}
            </div>
          ) : (
            quizSets.map((qs) => (
              <ToggleItem
                key={qs.id}
                checked={settings.quiz_set_ids?.includes(qs.id) || (!!qs.parent_quiz_set_id && (settings.quiz_set_ids?.includes(qs.parent_quiz_set_id) || false))}
                onChange={(val) => {
                  const current = settings.quiz_set_ids || [];
                  const isChecked = current.includes(qs.id) || (!!qs.parent_quiz_set_id && current.includes(qs.parent_quiz_set_id));
                  const next = isChecked 
                    ? current.filter(id => id !== qs.id && id !== qs.parent_quiz_set_id) 
                    : [...current, qs.id];
                  setSettings(s => ({ ...s, quiz_set_ids: next }));
                }}
                label={qs.title}
                subtitle={t("miniapp.questions_count", { count: qs.items?.length || 0 })}
              />
            ))
          )}
        </Section>
      );
    }

    if (view === "schedule-integration") {
      return (
        <Integrations
          botId={botId}
          selectionMode
          selectedId={settings.integration_id || null}
          onSelect={(id) => {
            setSettings((s) => ({ ...s, integration_id: id }));
            onViewChange("schedule");
          }}
        />
      );
    }

    if (view === "now-menu") {
      return (
        <div>
          <Section title={t("miniapp.broadcast_now")}>
            <ListItem 
              icon={<Mail size={ICON_SIZES.large} color="white" />} 
              label={t("miniapp.broadcast_now_regular")} 
              onClick={() => onViewChange("now-regular")} 
            />
            <ListItem 
              icon={<Sparkles size={ICON_SIZES.large} color="white" />} 
              label={t("miniapp.broadcast_now_ai")} 
              onClick={() => onViewChange("now-ai")} 
            />
            <ListItem 
              icon={<IconQuiz />} 
              label={t("miniapp.broadcast_now_quiz")} 
              onClick={() => onViewChange("now-quiz")} 
            />
          </Section>
        </div>
      );
    }

    return (
      <div>
        {status && !saving && <p className="muted" style={{ margin: "16px" }}>{status}</p>}
        
        {view === "now-regular" && (
          <Section title={t("miniapp.broadcast_now_regular")}>
            <FormTextArea
              style={{ height: '150px' }}
              value={nowForm.message}
              onChange={(e) => setNowForm((f) => ({ ...f, message: e.target.value }))}
              placeholder={t("miniapp.broadcast_now_regular_placeholder")}
            />
          </Section>
        )}

        {view === "now-ai" && (
          <>
            <Section title={t("miniapp.broadcast_now_ai")}>
              <FormTextArea
                style={{ height: '100px' }}
                value={nowForm.prompt}
                onChange={(e) => setNowForm((f) => ({ ...f, prompt: e.target.value }))}
                placeholder={t("miniapp.broadcast_now_ai_placeholder")}
              />
              <FormField
                label={t("miniapp.broadcast_sentence_count")}
                type="number" 
                min={1} 
                max={10} 
                value={nowForm.sentence_count} 
                onChange={(e) => setNowForm(f => ({ ...f, sentence_count: Number(e.target.value) }))}
              />
            </Section>
            <Section title={t("miniapp.broadcast_now_ai_quizzes_data")}>
              <ListItem
                label={t("miniapp.broadcast_now_ai_select_quizzes")}
                subtitle={nowForm.quiz_set_ids.length > 0 
                  ? t("miniapp.broadcast_now_ai_selected_quizzes", { count: nowForm.quiz_set_ids.length })
                  : t("miniapp.none")}
                onClick={() => onViewChange("now-ai-quizzes")}
              />
            </Section>
            <Section title={t("miniapp.broadcast_integration")}>
              <ListItem
                label={nowForm.integration_id ? t("miniapp.integrations") : t("miniapp.none")}
                subtitle={t("miniapp.broadcast_integration_desc")}
                onClick={() => onViewChange("now-ai-integration")}
              />
            </Section>
          </>
        )}

        {view === "now-ai-integration" && (
          <Integrations
            botId={botId}
            selectionMode
            selectedId={nowForm.integration_id}
            onSelect={(id) => {
              setNowForm((f) => ({ ...f, integration_id: id }));
              onViewChange("now-ai");
            }}
          />
        )}

        {view === "now-ai-quizzes" && (
          <Section title={t("miniapp.broadcast_now_ai_select_quizzes")}>
            {quizSets.length === 0 ? (
              <div style={{ padding: "16px", fontSize: "14px", color: "var(--muted)" }}>
                {t("miniapp.no_quiz_sets")}
              </div>
            ) : (
              quizSets.map((qs) => (
                <ToggleItem
                  key={qs.id}
                  checked={nowForm.quiz_set_ids.includes(qs.id) || (!!qs.parent_quiz_set_id && nowForm.quiz_set_ids.includes(qs.parent_quiz_set_id))}
                  onChange={() => toggleQuizSet(qs)}
                  label={qs.title}
                  subtitle={t("miniapp.questions_count", { count: qs.items?.length || 0 })}
                />
              ))
            )}
          </Section>
        )}

        {view === "now-quiz" && (
          <Section title={t("miniapp.broadcast_now_quiz")}>
            <div style={{ padding: '16px' }}>
              <SectionTitle>{t("miniapp.broadcast_now_quiz_select")}</SectionTitle>
              <CustomSelect
                value={nowForm.quiz_set_id}
                onChange={(val) => setNowForm((f) => ({ ...f, quiz_set_id: String(val) }))}
                options={quizSets.map((qs) => ({
                  value: qs.id,
                  label: qs.title,
                }))}
              />
              {!quizSets.length && (
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
                  {t("miniapp.no_quiz_sets")}
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    );
  };

  return (
    <>
      {saving && <Loader fullscreen text={status} />}
      {renderContent()}
    </>
  );
}
