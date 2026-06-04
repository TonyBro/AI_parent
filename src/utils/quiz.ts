import { dbAll, dbGet, dbRun, nowMs } from "./db";

export type QuizOption = { key: string; label: string; profile_patch?: Record<string, unknown> };
export type QuizItem = { id: string; position: number; question: string; options: QuizOption[] };

export function mergeProfile(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = structuredClone(base);
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    if (Array.isArray(cur) && Array.isArray(v)) {
      const set = new Set([...cur.map(String), ...v.map(String)]);
      out[k] = Array.from(set);
      continue;
    }
    if (typeof cur === "string" && typeof v === "string" && k === "persona_notes") {
      out[k] = cur ? `${cur}\n${v}` : v;
      continue;
    }
    out[k] = v as unknown;
  }
  return out;
}

export async function loadQuizItems(db: D1Database, quizSetId: string): Promise<QuizItem[]> {
  const rows = await dbAll<any>(
    db,
    "SELECT id, position, question, options_json FROM quiz_items WHERE quiz_set_id = ? ORDER BY position ASC",
    [quizSetId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    position: Number(r.position),
    question: String(r.question),
    options: JSON.parse(String(r.options_json)) as QuizOption[],
  }));
}

export async function getOrCreateActiveSession(params: {
  db: D1Database;
  botProjectId: string;
  chatId: string;
  userId: string;
  quizSetId: string;
}): Promise<{ sessionId: string; currentPosition: number }> {
  const existing = await dbGet<any>(
    params.db,
    "SELECT id, current_position, quiz_set_id FROM quiz_sessions WHERE bot_project_id = ? AND chat_id = ? AND user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
    [params.botProjectId, params.chatId, params.userId],
  );
  if (existing) {
    // If language changed, we might want to update the session's quiz_set_id, 
    // but handleQuizCallback already does that.
    // Here we just ensure the quiz set still exists.
    const qset = await dbGet<any>(params.db, "SELECT id FROM quiz_sets WHERE id = ?", [existing.quiz_set_id]);
    if (qset) {
      return { sessionId: String(existing.id), currentPosition: Number(existing.current_position) };
    }
    // Quiz set no longer exists, stop this session
    await dbRun(params.db, "UPDATE quiz_sessions SET status = 'stopped', completed_at = ? WHERE id = ?", [nowMs(), existing.id]);
  }

  const id = crypto.randomUUID();
  await dbRun(
    params.db,
    "INSERT INTO quiz_sessions (id, bot_project_id, chat_id, user_id, quiz_set_id, current_position, status, started_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)",
    [id, params.botProjectId, params.chatId, params.userId, params.quizSetId, 0, nowMs()],
  );
  return { sessionId: id, currentPosition: 0 };
}

export async function recordResponseAndUpdateProfile(params: {
  db: D1Database;
  botProjectId: string;
  chatId: string;
  userId: string;
  sessionId: string;
  quizSetId: string;
  quizItemId: string;
  question: string;
  option: QuizOption;
}): Promise<void> {
  await dbRun(
    params.db,
    "INSERT INTO quiz_responses (id, session_id, quiz_item_id, option_key, option_label, profile_patch_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      crypto.randomUUID(),
      params.sessionId,
      params.quizItemId,
      params.option.key,
      params.option.label,
      // Keep DB column but store empty patch (we only use answer text now).
      "{}",
      nowMs(),
    ],
  );

  const existing = await dbGet<any>(
    params.db,
    "SELECT id, profile_json FROM user_profiles WHERE bot_project_id = ? AND chat_id = ? AND user_id = ?",
    [params.botProjectId, params.chatId, params.userId],
  );
  const base = existing ? (JSON.parse(String(existing.profile_json)) as Record<string, unknown>) : {};

  // Get parent quiz set ID if available to avoid duplicates in profile when language changes
  const setInfo = await dbGet<any>(params.db, "SELECT parent_quiz_set_id FROM quiz_sets WHERE id = ?", [params.quizSetId]);
  const parentSetId = setInfo?.parent_quiz_set_id || params.quizSetId;
  const itemInfo = await dbGet<any>(params.db, "SELECT position FROM quiz_items WHERE id = ?", [params.quizItemId]);
  const position = itemInfo?.position ?? 0;

  // Store quiz answers as text (no profile patches).
  const quizAnswers = Array.isArray((base as any).quiz_answers) ? ((base as any).quiz_answers as any[]) : [];
  
  // Filter out previous answers for the SAME quiz
  const nextAnswers = quizAnswers.filter((x) => {
    const quizSetId = String(x?.quiz_set_id_parent || x?.quiz_set_id || "");
    const isSameQuiz = quizSetId === parentSetId;
    
    if (isSameQuiz) {
      // If we are recording an answer in a NEW session, we want to clear ALL answers 
      // from any PREVIOUS sessions for this same quiz.
      // This ensures we only store the "last results" for the same quiz.
      if (x?.session_id && x.session_id !== params.sessionId) {
        return false;
      }
      
      // Handle legacy data without session_id - also treat as old if we are in a session
      if (!x?.session_id) {
        return false;
      }

      // If it's the same session and same position, we are replacing it
      if (x?.position === position) {
        return false;
      }
    }
    return true;
  });

  nextAnswers.push({
    quiz_set_id: params.quizSetId,
    quiz_set_id_parent: parentSetId,
    quiz_item_id: params.quizItemId,
    session_id: params.sessionId,
    position: position,
    question: params.question,
    answer: params.option.label,
    at: nowMs(),
  });
  const merged = { ...base, quiz_answers: nextAnswers };
  const updatedAt = nowMs();
  
  await dbRun(
    params.db,
    `INSERT INTO user_profiles (id, bot_project_id, chat_id, user_id, language, profile_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bot_project_id, chat_id, user_id) 
     DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at`,
    [crypto.randomUUID(), params.botProjectId, params.chatId, params.userId, null, JSON.stringify(merged), updatedAt],
  );
}

export async function advanceSession(params: { db: D1Database; sessionId: string }): Promise<number> {
  const row = await dbGet<any>(params.db, "SELECT current_position FROM quiz_sessions WHERE id = ?", [params.sessionId]);
  const nextPos = Number(row?.current_position ?? 0) + 1;
  await dbRun(params.db, "UPDATE quiz_sessions SET current_position = ? WHERE id = ?", [nextPos, params.sessionId]);
  return nextPos;
}

export async function completeSession(params: { db: D1Database; sessionId: string }): Promise<void> {
  await dbRun(
    params.db,
    "UPDATE quiz_sessions SET status = 'completed', completed_at = ? WHERE id = ?",
    [nowMs(), params.sessionId],
  );
}




