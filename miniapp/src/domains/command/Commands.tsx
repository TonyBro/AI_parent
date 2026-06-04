import React, { useEffect, useState, useCallback } from "react";
import {
  getCommands,
  createCommand,
  patchCommand,
  deleteCommand,
} from "./api";
import type { CommandDto } from "./types";
import { getIntegrations } from "../integration/api";
import type { IntegrationDto } from "../integration/types";
import { getQuizSets } from "../quiz/api";
import type { QuizSetDto } from "../quiz/types";
import { 
  Section, 
  ListItem, 
  ToggleItem, 
  FormInput, 
  FormTextArea,
  IconCommands,
  IconIntegrations,
  IconQuiz,
  IconPlus,
  Loader
} from "../../shared/components";
import { useTranslation } from "../../shared/i18n";

type Props = {
  botId: string;
  view: "list" | "edit";
  editingId?: string | null;
  onEdit?: (id: string | null) => void;
  onBack?: () => void;
  onCanSaveChange?: (canSave: boolean) => void;
  saveRef?: React.MutableRefObject<() => void>;
  onSelectIntegration?: (currentId: string | null, callback: (id: string | null) => void) => void;
};

export function Commands({ 
  botId, 
  view, 
  editingId, 
  onEdit, 
  onBack, 
  onCanSaveChange, 
  saveRef,
  onSelectIntegration,
  ...props
}: Props) {
  const { t, translateError } = useTranslation();
  const [commands, setCommands] = useState<CommandDto[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationDto[]>([]);
  const [quizSets, setQuizSets] = useState<QuizSetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastInitializedId = React.useRef<string | null | undefined>(undefined);

  const [form, setForm] = useState({
    command: "",
    description: "",
    show_in_menu: true,
    integration_id: "",
    ai_instructions: "",
    quiz_set_ids: [] as string[],
    use_quiz_results: true,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [cmds, ints, qs] = await Promise.all([
        getCommands(botId),
        getIntegrations(botId),
        getQuizSets(botId)
      ]);
      setCommands(cmds);
      setIntegrations(ints);
      setQuizSets(qs);
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    loadData();
  }, [botId, loadData]);

  useEffect(() => {
    if (view === "edit") {
      if (lastInitializedId.current !== editingId) {
        if (editingId) {
          const cmd = commands.find(c => c.id === editingId);
          if (cmd) {
            setForm({
              command: cmd.command,
              description: cmd.description,
              show_in_menu: cmd.show_in_menu,
              integration_id: cmd.integration_id || "",
              ai_instructions: cmd.ai_instructions || "",
              quiz_set_ids: cmd.quiz_set_ids || [],
              use_quiz_results: cmd.use_quiz_results ?? true,
            });
            lastInitializedId.current = editingId;
          }
        } else {
          // Reset form for new command
          setForm({
            command: "",
            description: "",
            show_in_menu: true,
            integration_id: "",
            ai_instructions: "",
            quiz_set_ids: [],
            use_quiz_results: true,
          });
          lastInitializedId.current = null;
        }
      }
    } else {
      lastInitializedId.current = undefined;
    }
  }, [view, editingId, commands]);

  const isCommandValid = (cmd: string) => {
    const withoutSlash = cmd.trim().startsWith("/") ? cmd.trim().slice(1) : cmd.trim();
    return /^[a-z0-9_]{1,32}$/i.test(withoutSlash);
  };

  const canSave = form.command.trim() && form.description.trim() && isCommandValid(form.command) && form.description.trim().length <= 256;

  useEffect(() => {
    if (onCanSaveChange) {
      onCanSaveChange(!!canSave);
    }
  }, [canSave, onCanSaveChange]);

  const handleSave = useCallback(async () => {
    if (!canSave) {
      const withoutSlash = form.command.trim().startsWith("/") ? form.command.trim().slice(1) : form.command.trim();
      if (!/^[a-z0-9_]+$/i.test(withoutSlash)) {
        setError(t("miniapp.error_command_chars"));
      } else if (withoutSlash.length > 32) {
        setError(t("miniapp.error_command_too_long"));
      } else if (form.description.trim().length > 256) {
        setError(t("miniapp.error_description_too_long"));
      } else {
        setError(t("miniapp.error_command_required"));
      }
      return;
    }
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      setError(null);
      const payload = {
        command: form.command.trim().toLowerCase(),
        description: form.description.trim(),
        show_in_menu: form.show_in_menu,
        integration_id: form.integration_id || null,
        ai_instructions: form.ai_instructions.trim() || null,
        quiz_set_ids: form.quiz_set_ids,
        use_quiz_results: form.use_quiz_results,
      };
      
      if (!editingId) {
        await createCommand(botId, payload);
      } else {
        await patchCommand(botId, editingId, payload);
      }
      await loadData();
      if (onBack) onBack();
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }, [botId, editingId, form, onBack, canSave, loadData, translateError]);

  useEffect(() => {
    if (saveRef) {
      saveRef.current = handleSave;
    }
  }, [handleSave, saveRef]);

  async function handleDelete(commandId: string) {
    if (!confirm(t("miniapp.commands_delete_confirm"))) return;
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      setError(null);
      await deleteCommand(botId, commandId);
      await loadData();
      if (onBack) onBack();
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }

  function toggleQuizSet(set: QuizSetDto) {
    setForm(f => {
      const isChecked = f.quiz_set_ids.includes(set.id) || (!!set.parent_quiz_set_id && f.quiz_set_ids.includes(set.parent_quiz_set_id));
      let next;
      if (isChecked) {
        next = f.quiz_set_ids.filter(id => id !== set.id && id !== set.parent_quiz_set_id);
      } else {
        next = [...f.quiz_set_ids, set.id];
      }
      return { ...f, quiz_set_ids: next };
    });
  }

  if (loading) return <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>{t("miniapp.loading")}</div>;

  const renderContent = () => {
    if (view === "list") {
      return (
        <div>
          <Section title={t("miniapp.commands_title")}>
            {commands.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                {t("miniapp.commands_none")}
              </div>
            ) : (
              commands.map((cmd) => (
                <ListItem
                  key={cmd.id}
                  icon={<IconCommands />}
                  label={cmd.command}
                  subtitle={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ color: 'var(--fg)' }}>{cmd.description}</div>
                      {(cmd.integration_id || (cmd.quiz_set_ids && cmd.quiz_set_ids.length > 0)) && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                          {cmd.integration_id && (() => {
                            const integration = integrations.find(i => i.id === cmd.integration_id);
                            if (integration) {
                              return (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <IconIntegrations size={12} />
                                  {integration.display_name}
                                </span>
                              );
                            } else {
                              return (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger)' }}>
                                  <IconIntegrations size={12} />
                                  {t("miniapp.integration_not_found")}
                                </span>
                              );
                            }
                          })()}
                          {cmd.quiz_set_ids && cmd.quiz_set_ids.map(quizId => {
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
                  onClick={() => onEdit?.(cmd.id)}
                />
              ))
            )}
            <ListItem
              icon={
                <div className="ui-avatar-small" style={{ background: 'rgba(36, 129, 204, 0.1)', color: 'var(--accent)', border: '1px solid rgba(36, 129, 204, 0.2)' }}>
                  <IconPlus size={16} color="currentColor" />
                </div>
              }
              label={t("miniapp.add_command")}
              isAction
              onClick={() => onEdit?.(null)}
            />
            <div style={{ padding: "12px 16px", fontSize: "14px", color: "var(--muted)" }}>
              {t("miniapp.commands_hint")}
            </div>
          </Section>
        </div>
      );
    }

    return (
      <div className="command-edit-flow">
        {error && <p className="error" style={{ margin: "16px" }}>{error}</p>}
        
        <Section title={t("miniapp.commands_general")}>
          <FormInput
            placeholder={t("miniapp.commands_command_placeholder")}
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            hasDivider
            autoComplete="off"
          />
          <FormInput
            placeholder={t("miniapp.commands_desc_placeholder")}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            autoComplete="off"
          />
        </Section>

        <Section>
          <ToggleItem
            label={t("miniapp.commands_show_in_menu")}
            subtitle={t("miniapp.commands_show_in_menu_desc")}
            checked={form.show_in_menu}
            onChange={(val) => setForm({ ...form, show_in_menu: val })}
          />
        </Section>

        <Section title={t("miniapp.commands_integration")}>
          <ListItem
            icon={<IconIntegrations />}
            label={
              integrations.find((i) => i.id === form.integration_id)?.display_name || t("miniapp.commands_integration_none")
            }
            subtitle={t("miniapp.commands_integration_hint")}
            onClick={() => 
              onSelectIntegration?.(form.integration_id, (id) => 
                setForm(f => ({ ...f, integration_id: id || "" }))
              )
            }
          />
        </Section>

        <Section title={t("miniapp.commands_ai_instructions")}>
          <FormTextArea
            rows={4}
            style={{ height: "auto" }}
            value={form.ai_instructions}
            onChange={(e) => setForm({ ...form, ai_instructions: e.target.value })}
            placeholder={t("miniapp.commands_ai_instructions_placeholder")}
          />
        </Section>

        <Section title={t("miniapp.commands_quizzes_data")}>
          <ToggleItem
            label={t("miniapp.commands_use_quiz_results")}
            subtitle={t("miniapp.commands_use_quiz_results_desc")}
            checked={form.use_quiz_results}
            onChange={(val) => setForm({ ...form, use_quiz_results: val })}
          />
          {quizSets.length === 0 ? (
            <div style={{ padding: "16px", fontSize: "14px", color: "var(--muted)" }}>
              {t("miniapp.commands_no_quizzes")}
            </div>
          ) : (
            quizSets.map(s => (
              <ToggleItem
                key={s.id}
                checked={form.quiz_set_ids.includes(s.id) || (!!s.parent_quiz_set_id && form.quiz_set_ids.includes(s.parent_quiz_set_id))}
                onChange={() => toggleQuizSet(s)}
                label={s.title}
                subtitle={t("miniapp.questions_count", { count: s.items?.length || 0 })}
              />
            ))
          )}
        </Section>

        {editingId && (
          <div style={{ padding: "0 16px 24px", marginTop: "16px" }}>
            <button 
              className="ui-btn-revoke" 
              style={{ width: "100%", background: "rgba(255, 59, 48, 0.1)", color: "#ff3b30" }}
              onClick={() => handleDelete(editingId)}
            >
              {t("miniapp.commands_delete")}
            </button>
          </div>
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
