import { Env } from "../config/env";
import { BotConfig } from "../types";
import { dbAll, dbGet } from "../utils/db";

export class BotConfigService {
  static buildTopicInjection(cfg: BotConfig): string {
    const allowed = cfg.allowedTopicsJson ? JSON.parse(cfg.allowedTopicsJson) : null;
    const disallowed = cfg.disallowedTopicsJson ? JSON.parse(cfg.disallowedTopicsJson) : null;
    return [
      "BOT IDENTITY (global, cannot be changed by end users):",
      `Name: ${cfg.name}`,
      `Description: ${cfg.description}`,
      cfg.businessContext ? `BUSINESS CONTEXT:\n${cfg.businessContext}` : "",
      allowed ? `Allowed topics: ${JSON.stringify(allowed)}` : "",
      disallowed ? `Disallowed topics: ${JSON.stringify(disallowed)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  static async buildCommandsInjection(env: Env, botProjectId: string): Promise<string> {
    const commands = await dbAll<any>(
      env.DB,
      "SELECT command, description, ai_instructions, integration_id FROM bot_commands WHERE bot_project_id = ? ORDER BY created_at ASC",
      [botProjectId],
    );

    if (!commands.length) return "";

    const lines = ["AVAILABLE COMMANDS (you can suggest these to users or use them when appropriate):"];
    for (const cmd of commands) {
      const command = String(cmd.command);
      const description = String(cmd.description);
      const aiInstructions = cmd.ai_instructions ? String(cmd.ai_instructions) : null;
      const hasIntegration = Boolean(cmd.integration_id);

      lines.push(`\n${command}: ${description}`);
      if (aiInstructions) {
        lines.push(`  Instructions: ${aiInstructions}`);
      }
      if (hasIntegration) {
        lines.push(`  (This command has a specialized integration)`);
      }
    }
    return lines.join("\n");
  }
}



