import { Hono } from "hono";
import { Env } from "../../../config/env";
import { dbGet, dbAll, dbRun, nowMs } from "../../../utils/db";

export const actionRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

actionRoutes.get("/:botId/actions", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  const actions = await dbAll<any>(
    c.env.DB,
    "SELECT id, bot_project_id, type, settings_json, status, created_at, updated_at FROM bot_actions WHERE bot_project_id = ? ORDER BY created_at ASC",
    [botId],
  );

  return c.json({
    actions: actions.map((a: any) => ({
      id: String(a.id),
      bot_project_id: String(a.bot_project_id),
      type: String(a.type),
      settings: JSON.parse(String(a.settings_json || "{}")),
      status: String(a.status),
      created_at: Number(a.created_at),
      updated_at: Number(a.updated_at),
    })),
  });
});

actionRoutes.post("/:botId/actions", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();
  const { type, settings } = body;

  const bot = await dbGet<any>(
    c.env.DB,
    "SELECT id FROM bot_projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    [botId, userId],
  );
  if (!bot) return c.json({ error: "not_found" }, 404);

  if (!type || typeof type !== "string") {
    return c.json({ error: "bad_request", reason: "type is required" }, 400);
  }

  const actionId = crypto.randomUUID();
  await dbRun(
    c.env.DB,
    "INSERT INTO bot_actions (id, bot_project_id, type, settings_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
    [actionId, botId, type, JSON.stringify(settings || {}), nowMs(), nowMs()],
  );

  return c.json({ ok: true, id: actionId });
});

actionRoutes.patch("/:botId/actions/:actionId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const actionId = c.req.param("actionId");
  const body = await c.req.json();

  const action = await dbGet<any>(
    c.env.DB,
    `SELECT ba.id FROM bot_actions ba
     JOIN bot_projects bp ON bp.id = ba.bot_project_id
     WHERE ba.id = ? AND ba.bot_project_id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL`,
    [actionId, botId, userId],
  );
  if (!action) return c.json({ error: "not_found" }, 404);

  const fields: string[] = [];
  const binds: any[] = [];

  if (typeof body.settings === "object") {
    fields.push("settings_json = ?");
    binds.push(JSON.stringify(body.settings));
  }
  if (typeof body.status === "string") {
    fields.push("status = ?");
    binds.push(body.status);
  }

  if (fields.length > 0) {
    fields.push("updated_at = ?");
    binds.push(nowMs());
    binds.push(actionId);
    await dbRun(c.env.DB, `UPDATE bot_actions SET ${fields.join(", ")} WHERE id = ?`, binds);
  }

  return c.json({ ok: true });
});

actionRoutes.delete("/:botId/actions/:actionId", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const actionId = c.req.param("actionId");

  const action = await dbGet<any>(
    c.env.DB,
    `SELECT ba.id FROM bot_actions ba
     JOIN bot_projects bp ON bp.id = ba.bot_project_id
     WHERE ba.id = ? AND ba.bot_project_id = ? AND bp.owner_user_id = ? AND bp.deleted_at IS NULL`,
    [actionId, botId, userId],
  );
  if (!action) return c.json({ error: "not_found" }, 404);

  await dbRun(c.env.DB, "DELETE FROM bot_actions WHERE id = ?", [actionId]);

  return c.json({ ok: true });
});
