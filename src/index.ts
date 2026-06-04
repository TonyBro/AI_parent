import { Hono } from "hono";
import { Env } from "./config/env";
import { apiRouter } from "./routes/api";
import { webhookRouter } from "./routes/webhooks";
import { BotRepository } from "./repositories/bot.repository";
import { tgApi } from "./utils/telegram";
import { AdminService } from "./services/admin.service";
import { IntegrationService } from "./services/integration.service";
import { Logger } from "./utils/logger";

// Export Durable Object
export { ApiProxyDO } from "./durable-objects/ApiProxyDO";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  Logger.init(c.env);
  await next();
});

// Webhooks
app.route("/__debug/tg", webhookRouter);
app.route("/webhooks", webhookRouter);
app.route("/tg/webhook", webhookRouter); // For compatibility with older webhook URLs

// API
app.route("/api", apiRouter);

// Avatar proxy
app.get("/avatar/:botId", async (c) => {
  const botId = c.req.param("botId");
  const env = c.env;
  
  try {
    const token = await BotRepository.getBotToken(env, botId);
    if (!token) return c.json({ error: "no_token" }, 404);

    const getMe = await tgApi<any>(token, "getMe", {});
    if (!getMe.ok) return c.json({ error: "bot_error" }, 404);

    const photosRes = await tgApi<any>(token, "getUserProfilePhotos", { user_id: getMe.result.id, limit: 1 });
    let fileId = "";
    if (photosRes.ok && photosRes.result.total_count > 0) {
      const photoVariants = photosRes.result.photos[0];
      fileId = photoVariants[photoVariants.length - 1].file_id;
    }

    if (!fileId) {
      const username = getMe.result.username;
      if (username) {
        const tgPublicUrl = `https://t.me/i/userpic/320/${username}.jpg`;
        const publicRes = await fetch(tgPublicUrl);
        if (publicRes.ok) {
          return new Response(await publicRes.arrayBuffer(), {
            headers: { "Content-Type": publicRes.headers.get("Content-Type") || "image/jpeg" },
          });
        }
      }
      return c.json({ error: "no_photo" }, 404);
    }

    const fileRes = await tgApi<any>(token, "getFile", { file_id: fileId });
    if (!fileRes.ok || !fileRes.result.file_path) return c.json({ error: "file_error" }, 404);

    const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${fileRes.result.file_path}`);
    if (!imgRes.ok) return c.json({ error: "fetch_error" }, 502);

    return new Response(await imgRes.arrayBuffer(), {
      headers: { 
        "Content-Type": imgRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600"
      },
    });
  } catch (e) {
    return c.json({ error: "server_error" }, 500);
  }
});

// OAuth callback
app.get("/oauth/google-calendar/callback", async (c) => {
  return await IntegrationService.handleGoogleOAuthCallback(c.env, c.req.raw);
});

app.all("*", async (c) => {
  const env = c.env as any;
  if (env.ASSETS) {
    const assetRes = await env.ASSETS.fetch(c.req.raw);
    if (assetRes.status !== 404) return assetRes;
    
    const accept = c.req.header("accept") ?? "";
    if (accept.includes("text/html")) {
      const u = new URL(c.req.url);
      u.pathname = "/index.html";
      u.search = "";
      return await env.ASSETS.fetch(new Request(u.toString(), c.req.raw));
    }
    return assetRes;
  }
  return c.text("Not Found", 404);
});

export default {
  fetch: app.fetch,
  async scheduled(controller: any, env: Env) {
    Logger.init(env);
    await AdminService.retentionCleanup(env);
    await AdminService.processDeletions(env);
    await AdminService.processBroadcasts(env);
  }
};
