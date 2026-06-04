import { Context, Next } from "hono";
import { validateTelegramInitData } from "../utils/tma";
import { Env } from "../config/env";
import { UserRepository } from "../repositories/user.repository";

export const tmaAuth = async (c: Context<{ Bindings: Env; Variables: { userId: string; tgUser: any } }>, next: Next) => {
  const auth = c.req.header("authorization") ?? "";
  const m = auth.match(/^tma\s+(.+)$/i);
  if (!m) return c.json({ error: "unauthorized" }, 401);
  const initData = m[1];

  const validated = await validateTelegramInitData({
    initData,
    botToken: c.env.PARENT_BOT_TOKEN,
    maxAgeSeconds: 3600,
  });

  if (!validated.ok) {
    return c.json({ error: "unauthorized", reason: validated.reason }, 401);
  }

  const tgUserId = String(validated.user?.id ?? "");
  if (!tgUserId) return c.json({ error: "unauthorized" }, 401);

  const creatorDbId = await UserRepository.ensureUser(c.env, tgUserId);
  c.set("userId", creatorDbId);
  c.set("tgUser", validated.user);

  await next();
};

