import { Env } from "../config/env";

/**
 * ParentBotService handles webhooks for the parent bot (the main bot that users interact with to manage their child bots).
 * The parent bot primarily uses the miniapp for interactions, so webhook handling is minimal.
 */
export class ParentBotService {
  static async handleParentWebhook(env: Env, update: any): Promise<void> {
    // The parent bot uses the miniapp for most interactions
    // This webhook handler can be used for future direct message handling if needed
    // For now, we just acknowledge the update
    const msg = update?.message ?? update?.edited_message;
    const cb = update?.callback_query;
    
    // Log update for debugging if needed
    if (msg || cb) {
      // Future: Handle direct messages or callbacks to parent bot if needed
      // Currently, all parent bot interactions happen through the miniapp
    }
  }
}
