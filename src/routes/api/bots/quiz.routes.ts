import { Hono } from "hono";
import { Env } from "../../../config/env";
import { dbGet, dbAll, dbRun, nowMs } from "../../../utils/db";
import { AIService } from "../../../services/ai.service";
import { SUPPORTED_LANGUAGES } from "../../../utils/i18n";
import { BotRepository } from "../../../repositories/bot.repository";
import { Logger } from "../../../utils/logger";

export const quizRoutes = new Hono<{ Bindings: Env; Variables: { userId: string; tgUser: any } }>();

quizRoutes.get("/:botId/quiz_sets", async (c) => {
  const userId = c.get("userId");
  const tgUser = c.get("tgUser");
  const userLang = (tgUser?.language_code || "en").split("-")[0];
  const botId = c.req.param("botId");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  // Fetch all parent quiz sets (those without a parent)
  const parentSets = await dbAll<any>(
    c.env.DB,
    "SELECT id, title, language, created_at FROM quiz_sets WHERE bot_project_id = ? AND parent_quiz_set_id IS NULL ORDER BY created_at ASC",
    [botId],
  );

  const quiz_sets = [];
  for (const p of parentSets) {
    let displaySet = p;
    
    // Try to find a localized version for the user's language
    if (p.language !== userLang) {
      const localized = await dbGet<any>(
        c.env.DB,
        "SELECT id, title, language, created_at FROM quiz_sets WHERE parent_quiz_set_id = ? AND language = ? LIMIT 1",
        [p.id, userLang],
      );
      if (localized) {
        displaySet = localized;
      }
    }

    const items = await dbAll<any>(
      c.env.DB,
      "SELECT id, position, question, options_json, created_at FROM quiz_items WHERE quiz_set_id = ? ORDER BY position ASC",
      [String(displaySet.id)],
    );
    quiz_sets.push({
      id: String(displaySet.id),
      bot_project_id: botId,
      parent_quiz_set_id: displaySet.parent_quiz_set_id ? String(displaySet.parent_quiz_set_id) : null,
      title: String(displaySet.title),
      language: String(displaySet.language),
      created_at: Number(displaySet.created_at),
      items: items.map((it) => ({
        id: String(it.id),
        quiz_set_id: String(displaySet.id),
        position: Number(it.position),
        question: String(it.question),
        options: JSON.parse(String(it.options_json || "[]")),
        created_at: Number(it.created_at),
      })),
    });
  }
  return c.json({ quiz_sets });
});

quizRoutes.post("/:botId/quiz_sets/generate", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id, default_language FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const count = Math.max(1, Math.min(20, Number(body.count || 5)));
  const theme = String(body.theme || "").trim();
  const dataToCollect = String(body.data_to_collect || "").trim();
  const lang = String(body.language || bot.default_language || "en");

  if (!theme) return c.json({ error: "bad_request", reason: "theme_required" }, 400);

  const saveQuizSet = async (setId: string, title: string, quizLang: string, items: any[], parentId?: string) => {
    await dbRun(
      c.env.DB,
      "INSERT INTO quiz_sets (id, bot_project_id, title, language, parent_quiz_set_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [setId, botId, title, quizLang, parentId || null, nowMs()],
    );
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await dbRun(
        c.env.DB,
        "INSERT INTO quiz_items (id, quiz_set_id, position, question, options_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), setId, i, String(item.question), JSON.stringify(item.options), nowMs()],
      );
    }
  };

  if (lang === "auto") {
    const parentLang = bot.default_language === "auto" ? "en" : (bot.default_language || "en");
    const parentQuiz = await AIService.generateQuizSetWithAI({
      env: c.env,
      botId,
      count,
      theme,
      dataToCollect,
      language: parentLang,
    });

    const parentQuizSetId = crypto.randomUUID();
    await saveQuizSet(parentQuizSetId, parentQuiz.title, parentLang, parentQuiz.items);

    // Generate translations for all other supported languages
    for (const otherLang of SUPPORTED_LANGUAGES) {
      if (otherLang === parentLang) continue;
      try {
        const translatedQuiz = await AIService.translateQuizSetWithAI({
          env: c.env,
          title: parentQuiz.title,
          items: parentQuiz.items,
          targetLanguage: otherLang,
        });
        await saveQuizSet(crypto.randomUUID(), translatedQuiz.title, otherLang, translatedQuiz.items, parentQuizSetId);
      } catch (err: any) {
        Logger.error('API', `Failed to translate quiz for language ${otherLang}: ${err.message || err}`);
        // Continue to next language even if one fails
      }
    }

    await BotRepository.invalidateBotConfigCache(c.env, botId);
    return c.json({ ok: true, id: parentQuizSetId });
  }

  const quiz = await AIService.generateQuizSetWithAI({
    env: c.env,
    botId,
    count,
    theme,
    dataToCollect,
    language: lang,
  });

  const quizSetId = crypto.randomUUID();
  await saveQuizSet(quizSetId, quiz.title, lang, quiz.items);

  await BotRepository.invalidateBotConfigCache(c.env, botId);
  return c.json({ ok: true, id: quizSetId });
});

quizRoutes.patch("/:botId/quiz_sets/:quizSetId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const quizSetId = c.req.param("quizSetId");
  const body = await c.req.json();

  const set = await dbGet<any>(
    c.env.DB,
    `SELECT qs.id, qs.parent_quiz_set_id, qs.language, qs.title FROM quiz_sets qs JOIN bot_projects bp ON bp.id = qs.bot_project_id WHERE qs.id = ? AND bp.id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL LIMIT 1`,
    [quizSetId, botId, userId],
  );
  if (!set) return c.json({ error: "not_found" }, 404);

  const fields: string[] = [];
  const binds: any[] = [];
  if (typeof body.title === "string") {
    fields.push("title = ?");
    binds.push(body.title.trim() || "Untitled Quiz");
  }
  if (typeof body.language === "string") {
    fields.push("language = ?");
    binds.push(body.language);
  }
  if (!fields.length) return c.json({ ok: true });
  binds.push(quizSetId);
  await dbRun(c.env.DB, `UPDATE quiz_sets SET ${fields.join(", ")} WHERE id = ?`, binds);

  // Sync title with related quiz sets if title changed
  if (typeof body.title === "string") {
    const parentId = set.parent_quiz_set_id || set.id;
    const relatedSets = await dbAll<any>(
      c.env.DB,
      "SELECT id, language FROM quiz_sets WHERE (id = ? OR parent_quiz_set_id = ?) AND id != ?",
      [parentId, parentId, quizSetId]
    );

    for (const rSet of relatedSets) {
      try {
        const translatedTitle = await AIService.translateQuizSetWithAI({
          env: c.env,
          title: body.title.trim(),
          items: [], // Title only translation
          targetLanguage: rSet.language
        });
        await dbRun(c.env.DB, "UPDATE quiz_sets SET title = ? WHERE id = ?", [translatedTitle.title, rSet.id]);
      } catch (err: any) {
        Logger.error('API', `Failed to sync quiz set title for ${rSet.language}: ${err.message || err}`);
      }
    }
  }

  return c.json({ ok: true });
});

quizRoutes.delete("/:botId/quiz_sets/:quizSetId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const quizSetId = c.req.param("quizSetId");

  const set = await dbGet<any>(
    c.env.DB,
    `SELECT qs.id, qs.parent_quiz_set_id FROM quiz_sets qs JOIN bot_projects bp ON bp.id = qs.bot_project_id WHERE qs.id = ? AND bp.id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL LIMIT 1`,
    [quizSetId, botId, userId],
  );
  if (!set) return c.json({ error: "not_found" }, 404);

  const parentId = set.parent_quiz_set_id || set.id;

  // Find all related quiz sets (parent + all children)
  const allRelatedSets = await dbAll<any>(
    c.env.DB,
    "SELECT id FROM quiz_sets WHERE id = ? OR parent_quiz_set_id = ?",
    [parentId, parentId],
  );

  const allSetIds = allRelatedSets.map(s => String(s.id));

  for (const s of allRelatedSets) {
    const sId = String(s.id);
    // Get all items in the quiz set
    const items = await dbAll<any>(
      c.env.DB,
      "SELECT id FROM quiz_items WHERE quiz_set_id = ?",
      [sId],
    );

    // Delete all responses for all items
    for (const item of items) {
      await dbRun(c.env.DB, "DELETE FROM quiz_responses WHERE quiz_item_id = ?", [String(item.id)]);
    }

    // Delete all items
    await dbRun(c.env.DB, "DELETE FROM quiz_items WHERE quiz_set_id = ?", [sId]);

    // Delete the quiz set
    await dbRun(c.env.DB, "DELETE FROM quiz_sets WHERE id = ?", [sId]);
  }

  // Remove quiz_set_id references from bot_commands
  const commands = await dbAll<any>(
    c.env.DB,
    "SELECT id, quiz_set_ids_json FROM bot_commands WHERE bot_project_id = ? AND quiz_set_ids_json IS NOT NULL AND quiz_set_ids_json != '[]'",
    [botId],
  );
  for (const cmd of commands) {
    try {
      const quizIds = JSON.parse(String(cmd.quiz_set_ids_json || "[]"));
      const filtered = quizIds.filter((id: string) => !allSetIds.includes(id));
      if (filtered.length !== quizIds.length) {
        await dbRun(c.env.DB, "UPDATE bot_commands SET quiz_set_ids_json = ? WHERE id = ?", [JSON.stringify(filtered), cmd.id]);
      }
    } catch (e) {
      // Skip invalid JSON
    }
  }

  // Remove quiz_set_id references from scheduled_broadcasts
  const broadcasts = await dbAll<any>(
    c.env.DB,
    "SELECT id, quiz_set_ids_json FROM scheduled_broadcasts WHERE bot_project_id = ? AND quiz_set_ids_json IS NOT NULL AND quiz_set_ids_json != '[]'",
    [botId],
  );
  for (const broadcast of broadcasts) {
    try {
      const quizIds = JSON.parse(String(broadcast.quiz_set_ids_json || "[]"));
      const filtered = quizIds.filter((id: string) => !allSetIds.includes(id));
      if (filtered.length !== quizIds.length) {
        await dbRun(c.env.DB, "UPDATE scheduled_broadcasts SET quiz_set_ids_json = ? WHERE id = ?", [JSON.stringify(filtered), broadcast.id]);
      }
    } catch (e) {
      // Skip invalid JSON
    }
  }

  await BotRepository.invalidateBotConfigCache(c.env, botId);
  return c.json({ ok: true });
});

quizRoutes.post("/:botId/quiz_sets/:quizSetId/items", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const quizSetId = c.req.param("quizSetId");
  let body: any;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "bad_request", reason: "invalid_json" }, 400);
  }

  const set = await dbGet<any>(
    c.env.DB,
    `SELECT qs.id, qs.parent_quiz_set_id FROM quiz_sets qs JOIN bot_projects bp ON bp.id = qs.bot_project_id WHERE qs.id = ? AND bp.id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL LIMIT 1`,
    [quizSetId, botId, userId],
  );
  if (!set) return c.json({ error: "not_found" }, 404);

  const question = String(body.question || "").trim();
  const options = Array.isArray(body.options) ? body.options : [];

  if (!question) return c.json({ error: "bad_request", reason: "question_required" }, 400);

  // Get the next position
  const maxPos = await dbGet<any>(
    c.env.DB,
    "SELECT MAX(position) as maxPos FROM quiz_items WHERE quiz_set_id = ?",
    [quizSetId],
  );
  const nextPosition = (maxPos?.maxPos ?? -1) + 1;

  const itemId = crypto.randomUUID();
  await dbRun(
    c.env.DB,
    "INSERT INTO quiz_items (id, quiz_set_id, position, question, options_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [itemId, quizSetId, nextPosition, question, JSON.stringify(options), nowMs()],
  );

  // Sync with related quiz sets
  const parentId = set.parent_quiz_set_id || set.id;
  const relatedSets = await dbAll<any>(
    c.env.DB,
    "SELECT id, language FROM quiz_sets WHERE (id = ? OR parent_quiz_set_id = ?) AND id != ?",
    [parentId, parentId, quizSetId]
  );

  for (const rSet of relatedSets) {
    try {
      // Map options to only key/label for translation, but keep profile_patch
      const optionsToTranslate = options.map((o: any) => ({ key: o.key, label: o.label }));

      const translated = await AIService.translateQuizItemWithAI({
        env: c.env,
        item: { question, options: optionsToTranslate },
        targetLanguage: rSet.language
      });

      // Merge translated labels back with original profile_patches
      const mergedOptions = translated.options.map((tOpt: any) => {
        const originalOpt = options.find((o: any) => o.key === tOpt.key);
        return {
          ...tOpt,
          profile_patch: originalOpt?.profile_patch || {}
        };
      });

      await dbRun(
        c.env.DB,
        "INSERT INTO quiz_items (id, quiz_set_id, position, question, options_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), rSet.id, nextPosition, translated.question, JSON.stringify(mergedOptions), nowMs()],
      );
    } catch (err: any) {
      Logger.error('API', `Failed to translate/sync new quiz item for ${rSet.language}: ${err.message || err}`);
    }
  }

  return c.json({ ok: true, id: itemId });
});

quizRoutes.put("/:botId/quiz_sets/:quizSetId/items_order", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const quizSetId = c.req.param("quizSetId");
  let body: any;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "bad_request", reason: "invalid_json" }, 400);
  }

  const set = await dbGet<any>(
    c.env.DB,
    `SELECT qs.id, qs.parent_quiz_set_id FROM quiz_sets qs JOIN bot_projects bp ON bp.id = qs.bot_project_id WHERE qs.id = ? AND bp.id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL LIMIT 1`,
    [quizSetId, botId, userId],
  );
  if (!set) return c.json({ error: "not_found" }, 404);

  const itemIds = Array.isArray(body.item_ids) ? body.item_ids : [];
  if (itemIds.length === 0) return c.json({ ok: true });

  // Get current order to find mapping
  const currentItems = await dbAll<any>(
    c.env.DB,
    "SELECT id, position FROM quiz_items WHERE quiz_set_id = ? ORDER BY position ASC",
    [quizSetId]
  );

  // Update positions for the current set
  const statements = itemIds.map((id: string, index: number) =>
    c.env.DB.prepare("UPDATE quiz_items SET position = ? WHERE id = ? AND quiz_set_id = ?").bind(index, String(id), quizSetId)
  );
  await c.env.DB.batch(statements);

  // Sync with related quiz sets
  const parentId = set.parent_quiz_set_id || set.id;
  const relatedSets = await dbAll<any>(
    c.env.DB,
    "SELECT id FROM quiz_sets WHERE (id = ? OR parent_quiz_set_id = ?) AND id != ?",
    [parentId, parentId, quizSetId]
  );

  for (const rSet of relatedSets) {
    const rItems = await dbAll<any>(
      c.env.DB,
      "SELECT id, position FROM quiz_items WHERE quiz_set_id = ? ORDER BY position ASC",
      [rSet.id]
    );

    // Apply the same permutation based on position mapping
    const rStatements = [];
    for (let newPos = 0; newPos < itemIds.length; newPos++) {
      const itemId = itemIds[newPos];
      const oldPos = currentItems.find(it => it.id === itemId)?.position;
      if (typeof oldPos === 'number') {
        const rItem = rItems.find(it => it.position === oldPos);
        if (rItem) {
          rStatements.push(
            c.env.DB.prepare("UPDATE quiz_items SET position = ? WHERE id = ?").bind(newPos, rItem.id)
          );
        }
      }
    }
    if (rStatements.length > 0) {
      await c.env.DB.batch(rStatements);
    }
  }

  return c.json({ ok: true });
});

quizRoutes.patch("/:botId/quiz_items/:quizItemId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const quizItemId = c.req.param("quizItemId");
  let body: any;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "bad_request", reason: "invalid_json" }, 400);
  }

  const item = await dbGet<any>(
    c.env.DB,
    `SELECT qi.id, qi.quiz_set_id, qi.position, qi.question, qi.options_json, qs.parent_quiz_set_id 
     FROM quiz_items qi 
     JOIN quiz_sets qs ON qs.id = qi.quiz_set_id 
     JOIN bot_projects bp ON bp.id = qs.bot_project_id 
     WHERE qi.id = ? AND bp.id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL LIMIT 1`,
    [quizItemId, botId, userId],
  );
  if (!item) return c.json({ error: "not_found" }, 404);

  const fields: string[] = [];
  const binds: any[] = [];
  if (typeof body.question === "string") {
    fields.push("question = ?");
    binds.push(body.question.trim() || "Question");
  }
  if (typeof body.position === "number") {
    fields.push("position = ?");
    binds.push(Math.max(0, Math.floor(body.position)));
  }
  if (Array.isArray(body.options)) {
    fields.push("options_json = ?");
    binds.push(JSON.stringify(body.options));
  }
  if (!fields.length) return c.json({ ok: true });
  
  const updatedQuestion = typeof body.question === "string" ? body.question.trim() : item.question;
  const updatedOptions = Array.isArray(body.options) ? body.options : JSON.parse(item.options_json || "[]");
  const updatedPosition = typeof body.position === "number" ? Math.max(0, Math.floor(body.position)) : item.position;

  binds.push(quizItemId);
  await dbRun(c.env.DB, `UPDATE quiz_items SET ${fields.join(", ")} WHERE id = ?`, binds);

  // Sync with related quiz sets
  const parentId = item.parent_quiz_set_id || item.quiz_set_id;
  const relatedSets = await dbAll<any>(
    c.env.DB,
    "SELECT id, language FROM quiz_sets WHERE (id = ? OR parent_quiz_set_id = ?) AND id != ?",
    [parentId, parentId, item.quiz_set_id]
  );

  if (relatedSets.length > 0) {
    for (const rSet of relatedSets) {
      const rItem = await dbGet<any>(
        c.env.DB,
        "SELECT id FROM quiz_items WHERE quiz_set_id = ? AND position = ?",
        [rSet.id, item.position]
      );

      if (rItem) {
        const rFields: string[] = [];
        const rBinds: any[] = [];

        if (typeof body.question === "string" || Array.isArray(body.options)) {
          try {
            // Map options to only key/label for translation, but keep profile_patch
            const optionsToTranslate = updatedOptions.map((o: any) => ({ key: o.key, label: o.label }));
            
            const translated = await AIService.translateQuizItemWithAI({
              env: c.env,
              item: { question: updatedQuestion, options: optionsToTranslate },
              targetLanguage: rSet.language
            });

            // Merge translated labels back with original profile_patches
            const mergedOptions = translated.options.map((tOpt: any) => {
              const originalOpt = updatedOptions.find((o: any) => o.key === tOpt.key);
              return {
                ...tOpt,
                profile_patch: originalOpt?.profile_patch || {}
              };
            });

            rFields.push("question = ?");
            rBinds.push(translated.question);
            rFields.push("options_json = ?");
            rBinds.push(JSON.stringify(mergedOptions));
          } catch (err: any) {
            Logger.error('API', `Failed to translate/sync quiz item for ${rSet.language}: ${err.message || err}`);
          }
        }

        if (typeof body.position === "number") {
          rFields.push("position = ?");
          rBinds.push(updatedPosition);
        }

        if (rFields.length > 0) {
          rBinds.push(rItem.id);
          await dbRun(c.env.DB, `UPDATE quiz_items SET ${rFields.join(", ")} WHERE id = ?`, rBinds);
        }
      }
    }
  }

  return c.json({ ok: true });
});

quizRoutes.delete("/:botId/quiz_items/:quizItemId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const quizItemId = c.req.param("quizItemId");

  const item = await dbGet<any>(
    c.env.DB,
    `SELECT qi.id, qi.quiz_set_id, qi.position, qs.parent_quiz_set_id FROM quiz_items qi JOIN quiz_sets qs ON qs.id = qi.quiz_set_id JOIN bot_projects bp ON bp.id = qs.bot_project_id WHERE qi.id = ? AND bp.id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL LIMIT 1`,
    [quizItemId, botId, userId],
  );
  if (!item) return c.json({ error: "not_found" }, 404);

  const parentId = item.parent_quiz_set_id || item.quiz_set_id;
  const relatedSets = await dbAll<any>(
    c.env.DB,
    "SELECT id FROM quiz_sets WHERE (id = ? OR parent_quiz_set_id = ?)",
    [parentId, parentId]
  );

  for (const rSet of relatedSets) {
    const rItemToDelete = await dbGet<any>(
      c.env.DB,
      "SELECT id FROM quiz_items WHERE quiz_set_id = ? AND position = ?",
      [rSet.id, item.position]
    );
    if (rItemToDelete) {
      await dbRun(c.env.DB, "DELETE FROM quiz_responses WHERE quiz_item_id = ?", [rItemToDelete.id]);
      await dbRun(c.env.DB, "DELETE FROM quiz_items WHERE id = ?", [rItemToDelete.id]);

      // Re-order remaining items in this set to close the gap
      const remaining = await dbAll<any>(
        c.env.DB,
        "SELECT id FROM quiz_items WHERE quiz_set_id = ? ORDER BY position ASC, created_at ASC",
        [rSet.id],
      );

      if (remaining.length > 0) {
        const statements = remaining.map((it, i) => 
          c.env.DB.prepare("UPDATE quiz_items SET position = ? WHERE id = ?").bind(i, String(it.id))
        );
        await c.env.DB.batch(statements);
      }
    }
  }

  await BotRepository.invalidateBotConfigCache(c.env, botId);
  return c.json({ ok: true });
});
