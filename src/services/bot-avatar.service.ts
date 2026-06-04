import { TelegramClient, Api, client } from "telegram";
import { StringSession } from "telegram/sessions";
import { Env } from "../config/env";
import { Logger } from "../utils/logger";

export class BotAvatarService {
  /**
   * Updates the profile photo of a bot using MTProto (GramJS).
   * 
   * @param env - The environment bindings containing Telegram API credentials.
   * @param botToken - The bot token for authentication.
   * @param photoBuffer - The image data as an ArrayBuffer.
   */
  static async updateBotPhoto(env: Env, botToken: string, photoBuffer: ArrayBuffer): Promise<void> {
    if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH) {
      throw new Error("TELEGRAM_API_ID or TELEGRAM_API_HASH is not configured.");
    }

    const apiId = Number(env.TELEGRAM_API_ID);
    const apiHash = env.TELEGRAM_API_HASH;
    
    // We use an empty StringSession for a one-off connection
    const session = new StringSession("");
    
    const tgClient = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });

    try {
      // Connect and login as a bot
      await tgClient.start({
        botAuthToken: botToken,
      });

      Logger.debug('BOT', `[BotAvatarService] Logged in as bot via GramJS`);

      // Upload the photo
      // client.uploads.CustomFile wraps the buffer for gramjs
      const uploadedFile = await tgClient.uploadFile({
        file: new client.uploads.CustomFile("avatar.jpg", photoBuffer.byteLength, "", Buffer.from(photoBuffer)),
        workers: 1,
      });

      // Update the profile photo
      await tgClient.invoke(
        new Api.photos.UploadProfilePhoto({
          file: uploadedFile,
        })
      );

      Logger.debug('BOT', `[BotAvatarService] Bot photo updated successfully`);

    } catch (error: any) {
      Logger.error('BOT', `[BotAvatarService] Failed to update bot photo: ${error.message}`);
      throw error;
    } finally {
      // Ensure the client is disconnected
      await tgClient.disconnect();
    }
  }
}
