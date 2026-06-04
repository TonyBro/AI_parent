import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  createQuizItem,
  deleteQuizItem,
  deleteQuizSet,
  getQuizSets,
  patchQuizItem,
  patchQuizSet,
  reorderQuizItems,
  type QuizItemDto,
  type QuizOptionDto,
  type QuizSetDto,
} from "./api";
import { generateQuizWithAI } from "./api";
import { LanguageSelector } from "./LanguageSelector";
import { useTranslation } from "./shared/i18n";
import { Section, FormInput, FormTextArea, ListItem, IconQuiz, IconPlus, IconCross, IconDrag, Loader } from "./components";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem(props: { id: string; children: React.ReactNode | ((props: any) => React.ReactNode); handle?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.6 : 1,
    position: 'relative' as const,
    touchAction: props.handle ? 'auto' : 'none',
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    willChange: 'transform',
    WebkitBackfaceVisibility: 'hidden' as const,
    backfaceVisibility: 'hidden' as const,
  };

  const dragHandleProps = { 
    ...attributes, 
    ...listeners
  };

  return (
    <div ref={setNodeRef} style={style} {...(!props.handle && typeof props.children !== 'function' ? dragHandleProps : {})}>
      {typeof props.children === 'function' ? (
        props.children({ dragHandleProps })
      ) : (
        React.Children.map(props.children, child => {
          if (React.isValidElement(child) && props.handle) {
            return React.cloneElement(child as React.ReactElement<any>, { 
              dragHandleProps
            });
          }
          return child;
        })
      )}
    </div>
  );
}

function slugifyKey(input: string): string {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeUniqueKey(desired: string, used: Set<string>): string {
  const base = desired || `opt_${Date.now().toString(36)}`;
  let k = base;
  let i = 1;
  while (used.has(k)) {
    i++;
    k = `${base}_${i}`;
  }
  return k;
}

function newOptionKeyFromLabel(label: string, existingKeys: string[]): string {
  const used = new Set(existingKeys.map((x) => String(x)));
  const desired = slugifyKey(label);
  return makeUniqueKey(desired || `opt_${Date.now().toString(36)}`, used);
}

function optionFromDto(o: QuizOptionDto): OptionDraft {
  return { 
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2), 
    key: String(o.key), 
    label: String(o.label), 
    keyLocked: true 
  };
}

type OptionDraft = { id: string; key: string; label: string; keyLocked?: boolean };

type Props = { 
  botId: string; 
  view: "list" | "quiz-edit" | "questions" | "question-edit";
  selectedSetId?: string | null;
  onSelectSet?: (id: string) => void;
  selectedQuestionId?: string | null;
  onSelectQuestion?: (id: string) => void;
  onBack?: () => void;
  defaultLanguage?: string;
  quizLanguage?: string;
  onLanguageClick?: () => void;
  onCanSaveQuizChange?: (can: boolean) => void;
  quizSaveRef?: React.MutableRefObject<() => void>;
  onCanSaveQuestionChange?: (can: boolean) => void;
  questionSaveRef?: React.MutableRefObject<() => void>;
  quizForm: {
    title: string;
    language: string;
    useAI: boolean;
    aiTheme: string;
    aiDataToCollect: string;
    aiCount: number;
  };
  onQuizFormChange: React.Dispatch<React.SetStateAction<{
    title: string;
    language: string;
    useAI: boolean;
    aiTheme: string;
    aiDataToCollect: string;
    aiCount: number;
  }>>;
};

export function Quizzes({ 
  botId, 
  view,
  selectedSetId,
  onSelectSet,
  selectedQuestionId,
  onSelectQuestion,
  onBack,
  defaultLanguage, 
  quizLanguage, 
  onLanguageClick,
  onCanSaveQuizChange,
  quizSaveRef,
  onCanSaveQuestionChange,
  questionSaveRef,
  quizForm,
  onQuizFormChange,
  ...props
}: Props) {
  const { t, translateError } = useTranslation();
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sets, setSets] = useState<QuizSetDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 10,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (quizLanguage) {
      onQuizFormChange((f) => ({ ...f, language: quizLanguage }));
    }
  }, [quizLanguage, onQuizFormChange]);

  // Question Edit Form
  const [questionForm, setQuestionForm] = useState({
    question: "",
    options: [] as OptionDraft[]
  });

  // Synchronize question form when selected question or view changes to avoid flicker
  useEffect(() => {
    if (view === "question-edit") {
      const currentSet = sets.find(s => s.id === selectedSetId);
      if (selectedQuestionId) {
        const item = currentSet?.items?.find(i => i.id === selectedQuestionId);
        if (item) {
          setQuestionForm({
            question: item.question,
            options: (item.options || []).map(optionFromDto)
          });
        } else {
          // Clear stale data if item not found in current sets (will be populated by refresh)
          setQuestionForm({ question: "", options: [] });
        }
      } else {
        // New question
        setQuestionForm({
          question: "",
          options: [
            { id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2), key: "opt_1", label: "" },
            { id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2), key: "opt_2", label: "" }
          ]
        });
      }
    }
    
    // Also sync quizForm if we have the set, but avoid loops
    if (view === "quiz-edit" && selectedSetId) {
       const currentSet = sets.find(s => s.id === selectedSetId);
       if (currentSet && (quizForm.title !== currentSet.title || quizForm.language !== currentSet.language)) {
         onQuizFormChange(f => ({ ...f, title: currentSet.title, language: currentSet.language }));
       }
    }
  }, [selectedQuestionId, view, selectedSetId, quizForm.title, quizForm.language, sets]); // Sync when sets load to populate form

  const refresh = useCallback(async () => {
    if (loading) return; // Prevent multiple simultaneous refreshes
    setLoading(true);
    setError(null);
    try {
      const s = await getQuizSets(botId);
      // Sort items within each set by position
      const sortedSets = s.map(set => ({
        ...set,
        items: (set.items || []).slice().sort((a, b) => a.position - b.position)
      }));
      setSets(sortedSets);
      
      // If we are in questions view, update the question form if needed
      if (selectedSetId) {
        const set = sortedSets.find(x => x.id === selectedSetId);
        if (set) {
          if (view === "quiz-edit") {
             onQuizFormChange((f) => ({ ...f, title: set.title, language: set.language }));
          }
          if (selectedQuestionId) {
            const item = set.items?.find(x => x.id === selectedQuestionId);
            if (item) {
              setQuestionForm({
                question: item.question,
                options: (item.options || []).map(optionFromDto)
              });
            }
          }
        }
      }
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setLoading(false);
    }
  }, [botId, selectedSetId, selectedQuestionId, view, translateError, onQuizFormChange]);

  useEffect(() => {
    refresh();
  }, [botId, refresh]);

  async function handleDragEndQuestions(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedSetId) return;

    const set = sets.find(s => s.id === selectedSetId);
    if (!set || !set.items) return;

    const oldIndex = set.items.findIndex((item) => item.id === active.id);
    const newIndex = set.items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newItems = arrayMove(set.items, oldIndex, newIndex).map((item, index) => ({
      ...item,
      position: index
    }));
    
    const updatedItemIds = newItems.map(i => i.id);

    // Update local state immediately for smooth UI
    setSets(prevSets => prevSets.map(s => s.id === selectedSetId ? { ...s, items: newItems } : s));

    try {
      await reorderQuizItems(botId, selectedSetId, updatedItemIds);
    } catch (e: any) {
      setError(translateError(e));
      refresh(); // Revert on error
    }
  }

  function handleDragEndOptions(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = questionForm.options.findIndex((o) => o.id === active.id);
    const newIndex = questionForm.options.findIndex((o) => o.id === over.id);

    const next = arrayMove(questionForm.options, oldIndex, newIndex);
    setQuestionForm({ ...questionForm, options: next });
  }

  // Handle Quiz Set Save
  const handleSaveQuiz = useCallback(async () => {
    if (quizForm.language === "auto" && !selectedSetId) {
      if (!confirm(t("miniapp.confirm_system_lang_quiz", { count: 9 }))) {
        return;
      }
    }
    setSaving(true);
    setStatus(quizForm.useAI ? t("miniapp.generating") : t("miniapp.saving"));
    try {
      if (quizForm.useAI) {
        await generateQuizWithAI(botId, {
          count: quizForm.aiCount,
          theme: quizForm.aiTheme.trim(),
          data_to_collect: quizForm.aiDataToCollect.trim(),
          language: quizForm.language || undefined,
        });
      } else {
        if (selectedSetId) {
          await patchQuizSet(botId, selectedSetId, { 
            title: quizForm.title.trim(),
            language: quizForm.language
          });
        } else {
          // Manual creation not directly supported by current API without AI? 
          // Actually getQuizSets doesn't have a direct "create manual set" in api.ts
          // For now we'll stick to AI generation or editing existing sets.
          // If the user wants manual creation, they'd typically use AI first or edit the default one.
          alert(t("miniapp.manual_creation_soon"));
          setSaving(false);
          setStatus("");
          return;
        }
      }
      await refresh();
      if (onBack) onBack();
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }, [botId, quizForm, selectedSetId, refresh, onBack, translateError]);

  useEffect(() => {
    if (quizSaveRef) quizSaveRef.current = handleSaveQuiz;
  }, [handleSaveQuiz, quizSaveRef]);

  const canSaveQuiz = useMemo(() => {
    if (quizForm.useAI) {
      return !!quizForm.aiTheme.trim() && quizForm.aiCount >= 1 && quizForm.aiCount <= 19;
    }
    return !!quizForm.title.trim();
  }, [quizForm]);

  useEffect(() => {
    if (onCanSaveQuizChange) onCanSaveQuizChange(canSaveQuiz);
  }, [canSaveQuiz, onCanSaveQuizChange]);

  // Handle Question Save
  const handleSaveQuestion = useCallback(async () => {
    if (!selectedSetId) return;
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      const built = buildOptionsPayload(questionForm.options);
      if (!built.ok) {
        setError(built.error);
        setSaving(false);
        setStatus("");
        return;
      }

      if (selectedQuestionId) {
        await patchQuizItem(botId, selectedQuestionId, {
          question: questionForm.question.trim(),
          options: built.options
        });
      } else {
        await createQuizItem(botId, selectedSetId, {
          question: questionForm.question.trim(),
          options: built.options
        });
      }
      await refresh();
      if (onBack) onBack();
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }, [botId, selectedSetId, selectedQuestionId, questionForm, refresh, onBack, translateError]);

  useEffect(() => {
    if (questionSaveRef) questionSaveRef.current = handleSaveQuestion;
  }, [handleSaveQuestion, questionSaveRef]);

  const canSaveQuestion = useMemo(() => {
    return !!questionForm.question.trim() && questionForm.options.length > 0 && questionForm.options.every(o => !!o.label.trim());
  }, [questionForm]);

  useEffect(() => {
    if (onCanSaveQuestionChange) onCanSaveQuestionChange(canSaveQuestion);
  }, [canSaveQuestion, onCanSaveQuestionChange]);

  async function handleDeleteSet(setId: string) {
    if (!confirm(t("miniapp.delete_set_confirm"))) return;
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      await deleteQuizSet(botId, setId);
      await refresh();
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm(t("miniapp.delete_item_confirm"))) return;
    setSaving(true);
    setStatus(t("miniapp.saving"));
    try {
      await deleteQuizItem(botId, itemId);
      await refresh();
    } catch (e: any) {
      setError(translateError(e));
    } finally {
      setSaving(false);
      setStatus("");
    }
  }

  function buildOptionsPayload(opts: OptionDraft[]): { ok: true; options: QuizOptionDto[] } | { ok: false; error: string } {
    const out: QuizOptionDto[] = [];
    const used = new Set<string>();
    for (const o of opts) {
      const label = (o.label ?? "").trim();
      if (!label) return { ok: false, error: t("miniapp.answer_needs_text") };
      const desiredKey = (o.key ?? "").trim() || newOptionKeyFromLabel(label, Array.from(used));
      const key = makeUniqueKey(desiredKey, used);
      used.add(key);
      out.push({ key, label, profile_patch: {} });
    }
    return { ok: true, options: out };
  }

  if (loading && sets.length === 0) {
    return <Loader text={status || t("miniapp.loading")} />;
  }

  const renderContent = () => {
    // View: List of Quiz Sets
    if (view === "list") {
      return (
        <>
          {error && <p className="error" style={{ margin: "16px" }}>{error}</p>}
          <Section title={t("miniapp.quizzes")}>
          {sets.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
              {t("miniapp.no_quiz_sets")}
            </div>
          ) : (
            sets.map((s) => (
              <ListItem
                key={s.id}
                icon={<IconQuiz />}
                label={s.title}
                subtitle={t("miniapp.questions_count", { count: s.items?.length || 0 })}
                onClick={() => onSelectSet?.(s.id)}
              />
            ))
          )}
        </Section>
        </>
      );
    }

    // View: Create/Edit Quiz Set
    if (view === "quiz-edit") {
      return (
        <div className="quiz-edit-flow">
          {error && <p className="error" style={{ margin: "16px" }}>{error}</p>}
          {status && !saving && <p className="muted" style={{ margin: "16px" }}>{status}</p>}

          <Section title={t("miniapp.quiz_name")}>
            <FormInput
              placeholder={t("miniapp.quiz_name")}
              value={quizForm.title}
              onChange={(e) => onQuizFormChange({ ...quizForm, title: e.target.value })}
            />
          </Section>

          <Section title={t("miniapp.language")}>
            <div style={{ padding: '0 16px' }}>
              <LanguageSelector
                value={quizForm.language}
                onClick={onLanguageClick || (() => {})}
              />
            </div>
          </Section>

          {!selectedSetId && (
            <Section title={t("miniapp.generate_quiz_ai")}>
              <FormInput
                placeholder={t("miniapp.quiz_theme")}
                value={quizForm.aiTheme}
                onChange={(e) => onQuizFormChange({ ...quizForm, aiTheme: e.target.value, useAI: true })}
                hasDivider
              />
              <FormTextArea
                placeholder={t("miniapp.quiz_data_collect")}
                value={quizForm.aiDataToCollect}
                onChange={(e) => onQuizFormChange({ ...quizForm, aiDataToCollect: e.target.value, useAI: true })}
                hasDivider
                style={{ height: '80px' }}
              />
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', color: 'var(--muted)' }}>{t("miniapp.quiz_length")}</span>
                <input
                  type="number"
                  min={1}
                  max={19}
                  value={quizForm.aiCount || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      onQuizFormChange({ ...quizForm, aiCount: 0, useAI: true });
                      return;
                    }
                    let num = parseInt(val, 10);
                    if (isNaN(num)) return;
                    if (num > 19) num = 19;
                    onQuizFormChange({ ...quizForm, aiCount: num, useAI: true });
                  }}
                  onBlur={() => {
                    if (quizForm.aiCount < 1) {
                      onQuizFormChange({ ...quizForm, aiCount: 1 });
                    }
                  }}
                  className="ui-styled-input no-spin"
                  style={{ width: '60px', textAlign: 'center' }}
                />
              </div>
            </Section>
          )}
      </div>
      );
    }

    // View: List of Questions
    if (view === "questions") {
      const set = sets.find(s => s.id === selectedSetId);
      if (!set) {
        if (loading) return <Loader text={t("miniapp.loading")} />;
        return <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>{t("miniapp.no_quiz_sets")}</div>;
      }
      const items = set.items || [];

      return (
        <>
        {error && <p className="error" style={{ margin: "16px" }}>{error}</p>}
        <Section title={set.title}>
          {items.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
              {t("miniapp.no_questions_yet")}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEndQuestions}
            >
              <SortableContext
                items={items.map(i => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableItem key={item.id} id={item.id} handle>
                    {(sortableProps: any) => (
                      <ListItem
                        label={item.question}
                        subtitle={t("miniapp.answers_count", { count: item.options?.length || 0 })}
                        onClick={() => onSelectQuestion?.(item.id)}
                        dragHandleProps={sortableProps?.dragHandleProps}
                      />
                    )}
                  </SortableItem>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </Section>

        <Section>
          <ListItem
            label={t("miniapp.delete_quiz")}
            isDanger
            onClick={async () => {
              await handleDeleteSet(set.id);
              if (onBack) onBack();
            }}
          />
        </Section>
      </>
      );
    }

    // View: Edit Question & Answers
    if (view === "question-edit") {
      return (
        <div className="question-edit-flow">
          {error && <p className="error" style={{ margin: "16px" }}>{error}</p>}
          {status && !saving && <p className="muted" style={{ margin: "16px" }}>{status}</p>}

          <Section title={t("miniapp.new_question")}>
            <FormTextArea
              placeholder={t("miniapp.question_text_placeholder")}
              value={questionForm.question}
              onChange={(e) => setQuestionForm({ ...questionForm, question: e.target.value })}
              rows={3}
            />
          </Section>

          <Section title={t("miniapp.options")}>
            <div className="stack">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndOptions}
              >
                <SortableContext
                  items={questionForm.options.map(o => o.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {questionForm.options.map((o, idx) => (
                    <SortableItem key={o.id} id={o.id}>
                      {(sortableProps: any) => (
                        <div className="ui-list-item-container" style={{ display: 'flex', alignItems: 'center' }}>
                          <div 
                            {...(sortableProps?.dragHandleProps || {})} 
                            className="ui-sortable-handle"
                          >
                            <IconDrag />
                          </div>
                          <FormInput
                            value={o.label}
                            onChange={(e) => {
                              const label = e.target.value;
                              const next = [...questionForm.options];
                              next[idx] = { ...o, label };
                              setQuestionForm({ ...questionForm, options: next });
                            }}
                            placeholder={`${t("miniapp.option")} ${idx + 1}`}
                            style={{ flex: 1, paddingRight: '40px' }}
                            hasDivider={idx < questionForm.options.length - 1}
                          />
                          <button
                            onClick={() => {
                              const next = questionForm.options.filter((_, i) => i !== idx);
                              setQuestionForm({ ...questionForm, options: next });
                            }}
                            className="delete-button-inline"
                            disabled={questionForm.options.length <= 1}
                            style={{ 
                              position: 'absolute', 
                              right: '12px', 
                              top: '50%', 
                              transform: 'translateY(-50%)',
                              zIndex: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <IconCross />
                          </button>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </SortableContext>
              </DndContext>
              <div 
                className="ui-list-item action" 
                style={{ cursor: 'pointer', padding: '0 16px' }}
                onClick={() => {
                  const existingKeys = questionForm.options.map(o => o.key);
                  setQuestionForm({
                    ...questionForm,
                    options: [
                      ...questionForm.options,
                      { 
                        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2), 
                        key: makeUniqueKey(`opt_${Date.now().toString(36)}`, new Set(existingKeys)), 
                        label: "" 
                      }
                    ]
                  });
                }}
              >
                <div className="ui-list-item-icon" style={{ color: 'var(--accent)' }}>
                  <IconPlus size={16} color="currentColor" />
                </div>
                <FormInput
                  readOnly
                  value={t("miniapp.add_option")}
                  wrapperClassName="no-padding"
                  style={{ color: 'var(--accent)', cursor: 'pointer', paddingLeft: 0 }}
                />
              </div>
            </div>
          </Section>

          {selectedQuestionId && (
            <Section>
              <ListItem
                label={t("miniapp.delete_question")}
                isDanger
                onClick={async () => {
                  await handleDeleteItem(selectedQuestionId);
                  if (onBack) onBack();
                }}
              />
            </Section>
          )}
      </div>
      );
    }
    return null;
  };

  return (
    <>
      {saving && <Loader fullscreen text={status || t("miniapp.saving")} />}
      {renderContent()}
    </>
  );
}
