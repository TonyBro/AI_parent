import { Hono } from "hono";
import { Env } from "../../../config/env";
import { dbGet, dbAll, dbRun, nowMs } from "../../../utils/db";
import { BotService } from "../../../services/bot.service";

export const commandRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

commandRoutes.get("/:botId/commands", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const commands = await dbAll<any>(
    c.env.DB,
    "SELECT id, bot_project_id, command, description, show_in_menu, integration_id, ai_instructions, quiz_set_ids_json, created_at, updated_at FROM bot_commands WHERE bot_project_id = ? ORDER BY created_at ASC",
    [botId],
  );

  return c.json({
    commands: commands.map((cmd) => ({
      id: String(cmd.id),
      bot_project_id: String(cmd.bot_project_id),
      command: String(cmd.command),
      description: String(cmd.description || ""),
      show_in_menu: Boolean(cmd.show_in_menu),
      integration_id: cmd.integration_id ? String(cmd.integration_id) : null,
      ai_instructions: cmd.ai_instructions ? String(cmd.ai_instructions) : null,
      quiz_set_ids: cmd.quiz_set_ids_json ? JSON.parse(String(cmd.quiz_set_ids_json)) : [],
      created_at: Number(cmd.created_at),
      updated_at: Number(cmd.updated_at),
    })),
  });
});

commandRoutes.post("/:botId/commands", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const command = typeof body.command === "string" ? body.command.trim().toLowerCase().replace(/^\//, "").replace(/[^a-z0-9_]/g, "_").slice(0, 32) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 256) : "";
  const showInMenu = typeof body.show_in_menu === "boolean" ? body.show_in_menu : true;
  const integrationId = body.integration_id && typeof body.integration_id === "string" ? body.integration_id : null;
  const aiInstructions = body.ai_instructions && typeof body.ai_instructions === "string" ? body.ai_instructions : null;
  const quizSetIds = Array.isArray(body.quiz_set_ids) ? body.quiz_set_ids : [];

  if (!command) return c.json({ error: "bad_request", reason: "command_required" }, 400);
  if (!description) return c.json({ error: "bad_request", reason: "description_required" }, 400);

  const id = crypto.randomUUID();
  const now = nowMs();

  await dbRun(
    c.env.DB,
    "INSERT INTO bot_commands (id, bot_project_id, command, description, show_in_menu, integration_id, ai_instructions, quiz_set_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, botId, command, description, showInMenu ? 1 : 0, integrationId, aiInstructions, JSON.stringify(quizSetIds), now, now]
  );

  if (showInMenu) {
    await BotService.syncTelegramCommandsForBot(c.env, botId);
  }

  return c.json({ ok: true, id });
});

commandRoutes.patch("/:botId/commands/:commandId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const commandId = c.req.param("commandId");
  const body = await c.req.json();

  const cmd = await dbGet<any>(
    c.env.DB,
    `SELECT bc.id, bc.command FROM bot_commands bc JOIN bot_projects bp ON bp.id = bc.bot_project_id WHERE bc.id = ? AND bc.bot_project_id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL LIMIT 1`,
    [commandId, botId, userId],
  );
  if (!cmd) return c.json({ error: "not_found" }, 404);

  const fields: string[] = [];
  const binds: any[] = [];

  if (typeof body.command === "string") {
    fields.push("command = ?");
    binds.push(body.command.trim().toLowerCase().replace(/^\//, "").replace(/[^a-z0-9_]/g, "_").slice(0, 32));
  }
  if (typeof body.description === "string") {
    fields.push("description = ?");
    binds.push(body.description.trim().slice(0, 256));
  }
  if (typeof body.show_in_menu === "boolean") {
    fields.push("show_in_menu = ?");
    binds.push(body.show_in_menu ? 1 : 0);
  }
  if (body.integration_id !== undefined) {
    fields.push("integration_id = ?");
    binds.push(body.integration_id);
  }
  if (body.ai_instructions !== undefined) {
    fields.push("ai_instructions = ?");
    binds.push(body.ai_instructions);
  }
  if (body.quiz_set_ids !== undefined) {
    fields.push("quiz_set_ids_json = ?");
    binds.push(Array.isArray(body.quiz_set_ids) ? JSON.stringify(body.quiz_set_ids) : null);
  }

  if (fields.length > 0) {
    fields.push("updated_at = ?");
    binds.push(nowMs());
    binds.push(commandId);
    await dbRun(c.env.DB, `UPDATE bot_commands SET ${fields.join(", ")} WHERE id = ?`, binds);
    await BotService.syncTelegramCommandsForBot(c.env, botId);
  }

  return c.json({ ok: true });
});

commandRoutes.delete("/:botId/commands/:commandId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const commandId = c.req.param("commandId");

  const cmd = await dbGet<any>(
    c.env.DB,
    `SELECT bc.id FROM bot_commands bc JOIN bot_projects bp ON bp.id = bc.bot_project_id WHERE bc.id = ? AND bc.bot_project_id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL LIMIT 1`,
    [commandId, botId, userId],
  );
  if (!cmd) return c.json({ error: "not_found" }, 404);

  await dbRun(c.env.DB, "DELETE FROM bot_commands WHERE id = ?", [commandId]);
  await BotService.syncTelegramCommandsForBot(c.env, botId);

  return c.json({ ok: true });
});
