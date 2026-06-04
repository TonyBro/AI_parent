import { Hono } from "hono";
import { Env } from "../../../config/env";
import { dbGet, dbAll, dbRun, nowMs } from "../../../utils/db";
import { IntegrationService } from "../../../services/integration.service";

export const workingHoursRoutes = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

workingHoursRoutes.get("/:botId/working-hours", async (c) => {
// ... existing get handler
});

workingHoursRoutes.post("/:botId/working-hours", async (c) => {
// ... existing post handler
});

workingHoursRoutes.post("/:botId/slots", async (c) => {
  const userId = c.get("userId");
  const botId = c.req.param("botId");
  const body = await c.req.json();
  const { date, duration } = body;

  if (!date) return c.json({ error: "bad_request", reason: "date is required" }, 400);

  const results = await IntegrationService.getAvailableSlots({
    env: c.env,
    botProjectId: botId,
    date: String(date),
    slotDurationMinutes: duration ? Number(duration) : 60
  });

  return c.json({ results });
});

