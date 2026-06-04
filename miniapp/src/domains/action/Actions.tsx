import React, { useEffect, useState } from "react";
import { getActions, createAction, patchAction, deleteAction } from "./api";
import type { ActionDto } from "./types";
import { Section, ListItem, FormInput, IconExternalLink, Loader } from "../../shared/components";
import { useTranslation } from "../../shared/i18n";

export type ActionsView = "list" | "picker" | "edit";

type Props = {
  botId: string;
  view: ActionsView;
  onViewChange: (v: ActionsView) => void;
  onBack?: () => void;
  onCanSaveChange?: (canSave: boolean) => void;
  onIsNewChange?: (isNew: boolean) => void;
  saveRef?: React.MutableRefObject<() => void>;

  // Props for state managed by parent to survive navigation/remounting
  selectedActionId: string | null;
  setSelectedActionId: (id: string | null) => void;
  draftType: string | null;
  setDraftType: (type: string | null) => void;
  editForm: { target_url: string; replace_to: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ target_url: string; replace_to: string }>>;
};

export function Actions({ 
  botId, 
  view, 
  onViewChange,
  onCanSaveChange,
  onIsNewChange,
  saveRef,
  selectedActionId,
  setSelectedActionId,
  draftType,
  setDraftType,
  editForm,
  setEditForm
}: Props) {
  const { t, translateError } = useTranslation();
  const [actions, setActions] = useState<ActionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const selectedAction = actions.find((a) => a.id === selectedActionId) ?? null;

  useEffect(() => {
    loadActions();
  }, [botId]);

  async function loadActions() {
    setLoading(true);
    try {
      const data = await getActions(botId);
      setActions(data);
    } catch (e: any) {
      console.error("Failed to load actions", e);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectType(type: string) {
    if (type === "word_filter") {
      alert(t("miniapp.word_filter_desc"));
      return;
    }

    setDraftType(type);
    setSelectedActionId(null);
    setEditForm({ target_url: "", replace_to: "" });
    onViewChange("edit");
  }

  const canSave = view === "edit" && (selectedActionId || draftType) && (
    editForm.target_url.trim() !== "" && editForm.replace_to.trim() !== ""
  );

  useEffect(() => {
    if (onCanSaveChange) {
      onCanSaveChange(!!canSave);
    }
  }, [canSave, onCanSaveChange]);

  useEffect(() => {
    if (onIsNewChange) {
      onIsNewChange(!!draftType);
    }
  }, [draftType, onIsNewChange, view]);

  const handleSave = React.useCallback(async () => {
    if ((!selectedActionId && !draftType) || !canSave) return;
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      if (selectedActionId) {
        await patchAction(botId, selectedActionId, {
          settings: editForm,
        });
      } else if (draftType) {
        await createAction(botId, {
          type: draftType,
          settings: editForm,
        });
      }
      await loadActions();
      setSelectedActionId(null);
      setDraftType(null);
      onViewChange("list");
    } catch (e: any) {
      alert(t("miniapp.save_failed", { error: translateError(e) }));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }, [botId, selectedActionId, draftType, editForm, canSave, onViewChange, translateError]);

  useEffect(() => {
    if (saveRef) {
      saveRef.current = handleSave;
    }
  }, [handleSave, saveRef]);

  async function handleDelete() {
    if (!selectedActionId) return;
    if (!confirm(t("miniapp.delete_action_confirm"))) return;
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      await deleteAction(botId, selectedActionId);
      await loadActions();
      setSelectedActionId(null);
      setDraftType(null);
      onViewChange("list");
    } catch (e: any) {
      alert(t("miniapp.delete_failed", { error: translateError(e) }));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }

  function handleEditAction(action: ActionDto) {
    setSelectedActionId(action.id);
    setDraftType(null);
    if (action.type === "link_rewriter") {
      setEditForm({
        target_url: String(action.settings.target_url || ""),
        replace_to: String(action.settings.replace_to || ""),
      });
    }
    onViewChange("edit");
  }

  if (loading) {
    return (
      <Section title={t("miniapp.actions_title")}>
        <p style={{ padding: "16px", textAlign: "center", opacity: 0.6 }}>{t("miniapp.loading")}</p>
      </Section>
    );
  }

  const renderContent = () => {
    if (view === "list") {
      return (
        <Section title={t("miniapp.actions_title")}>
          <p style={{ padding: "0 16px 16px", opacity: 0.6, fontSize: "14px" }}>
            {t("miniapp.actions_hint")}
          </p>

          {actions.length === 0 && (
            <p style={{ padding: "0 16px 16px", opacity: 0.4, fontSize: "14px" }}>
              {t("miniapp.actions_none")}
            </p>
          )}

          {actions.map((action) => (
            <ListItem
              key={action.id}
              icon={<IconExternalLink />}
              label={
                action.type === "link_rewriter"
                  ? t("miniapp.link_rewriter")
                  : action.type
              }
              subtitle={
                action.type === "link_rewriter"
                  ? `${action.settings.target_url || "..."} → ${action.settings.replace_to || "..."}`
                  : undefined
              }
              onClick={() => handleEditAction(action)}
            />
          ))}
        </Section>
      );
    }

    if (view === "picker") {
      return (
        <Section title={t("miniapp.add_action")}>
          <ListItem
            icon={<IconExternalLink />}
            label={t("miniapp.link_rewriter")}
            subtitle={t("miniapp.link_rewriter_desc")}
            onClick={() => handleSelectType("link_rewriter")}
          />
          <ListItem
            icon={<IconExternalLink />}
            label={t("miniapp.word_filter")}
            subtitle={t("miniapp.word_filter_desc")}
            onClick={() => handleSelectType("word_filter")}
          />
        </Section>
      );
    }

    if (view === "edit" && (selectedAction || draftType)) {
      const type = selectedAction?.type || draftType;
      return (
        <>
          <Section title={t("miniapp.action_settings")}>
            {type === "link_rewriter" && (
              <>
                <FormInput
                  placeholder={t("miniapp.target_url_placeholder")}
                  value={editForm.target_url}
                  onChange={(e) => setEditForm((f) => ({ ...f, target_url: e.target.value }))}
                  hasDivider
                />
                <FormInput
                  placeholder={t("miniapp.replace_to_placeholder")}
                  value={editForm.replace_to}
                  onChange={(e) => setEditForm((f) => ({ ...f, replace_to: e.target.value }))}
                />
              </>
            )}
          </Section>

          {selectedActionId && (
            <div style={{ padding: "0 16px 24px" }}>
              <button
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "rgba(255, 59, 48, 0.1)",
                  color: "var(--tg-theme-destructive-text-color, #ff3b30)",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                onClick={handleDelete}
              >
                {t("miniapp.delete_action")}
              </button>
            </div>
          )}
        </>
      );
    }
    return null;
  };

  return (
    <>
      {saving && <Loader fullscreen text={status} />}
      {renderContent()}
    </>
  );
}
