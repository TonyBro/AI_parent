import { Env } from "../config/env";
import { openaiChatStream, openaiChat, OpenAIChatMessage } from "../utils/openai";
import { tgSendMessage, tgEditMessageText, tgSendMessageDraft, tgSendChatAction, tgGetMe } from "../utils/telegram";
import { Logger } from "../utils/logger";

export class StreamingService {
  /**
   * Send an AI response with optional real-time streaming
   * Controlled by ENABLE_STREAMING_RESPONSES environment variable
   */
  static async sendStreamingResponse(params: {
    env: Env;
    token: string;
    chatId: string;
    apiKey: string;
    model: string;
    messages: OpenAIChatMessage[];
    maxOutputTokens?: number;
    tools?: any[];
    tool_choice?: string | object;
    replyToMessageId?: number;
  }): Promise<{
    text: string;
    tool_calls?: any[];
    usage?: { input_tokens?: number; output_tokens?: number };
  }> {
    Logger.debug('STREAMING', `Called with chatId: ${params.chatId}, streaming enabled: ${params.env.ENABLE_STREAMING_RESPONSES}`);
    const { env, token, chatId, apiKey, model, messages, maxOutputTokens, tools, tool_choice, replyToMessageId } = params;

    // Check if streaming is enabled via environment variable
    const streamingEnabled = env.ENABLE_STREAMING_RESPONSES === "true";
    Logger.debug('STREAMING', `Streaming enabled: ${streamingEnabled}, Has tools: ${tools?.length || 0}`);

    // Enable streaming even with tools - we'll detect if AI wants to use them
    const shouldStream = streamingEnabled;
    Logger.debug('STREAMING', `Should stream: ${shouldStream}`);

    if (!shouldStream) {
      Logger.debug('STREAMING', `Using classic non-streaming mode (streaming disabled in env)`);
      // Classic mode: wait for full response, then send
      const result = await openaiChat({
        apiKey,
        model,
        messages,
        maxOutputTokens,
        tools,
        tool_choice,
      });
      
      Logger.debug('STREAMING', `Got result from OpenAI, length: ${result.text.length}`);
      // Send the message to the user
      if (result.text.trim()) {
        await tgSendMessage({ 
          token, 
          chat_id: chatId, 
          text: result.text,
          reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined
        });
        Logger.debug('STREAMING', `Message sent via tgSendMessage`);
      }
      
      return result;
    }

    // Streaming mode: stream partial messages as AI generates response
    Logger.info('STREAMING', `Starting stream for chat ${chatId}`);
    
    // Check if bot has forum topic mode enabled (required for sendMessageDraft)
    const botInfo = await tgGetMe(token);
    const hasTopicsEnabled = botInfo.ok && botInfo.result?.has_topics_enabled;
    Logger.debug('STREAMING', `Bot has_topics_enabled: ${hasTopicsEnabled}`);
    
    if (!hasTopicsEnabled) {
      Logger.warn('STREAMING', `sendMessageDraft requires forum topic mode. Enable it via @BotFather > Bot Settings > Forum Topic Mode`);
      Logger.warn('STREAMING', `Falling back to editMessageText method`);
    }
    
    await tgSendChatAction({ token, chat_id: chatId, action: "typing" });
    
    let fullText = "";
    let lastSentText = "";
    let lastUpdateTime = 0;
    let buffer = "";
    let messageId: number | null = null;
    const DRAFT_ID = 1; // Fixed draft_id for sendMessageDraft

    // Safe rate limits to avoid Telegram API throttling
    const MIN_CHARS_BETWEEN_UPDATES = parseInt(params.env.STREAMING_MIN_CHARS || "15", 10);
    const MIN_TIME_BETWEEN_UPDATES_MS = parseInt(params.env.STREAMING_MIN_TIME_MS || "800", 10);

    const updateMessage = async (text: string, force = false) => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTime;
      const charsSinceLastUpdate = text.length - lastSentText.length;

      // Skip if not enough time/chars passed and not forced
      if (!force && (
        timeSinceLastUpdate < MIN_TIME_BETWEEN_UPDATES_MS ||
        charsSinceLastUpdate < MIN_CHARS_BETWEEN_UPDATES
      )) {
        return;
      }

      // Skip if text hasn't changed
      if (text === lastSentText) {
        return;
      }

      try {
        if (hasTopicsEnabled) {
          // Method 1: Use sendMessageDraft (requires forum topic mode)
          Logger.debug('STREAMING', `Sending draft update (draft_id: ${DRAFT_ID}, ${text.length} chars)`);
          const result = await tgSendMessageDraft({
            token,
            chat_id: chatId,
            draft_id: DRAFT_ID,
            text: text + " ▌", // Add typing cursor
            reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined
          });
          
          if (result.ok) {
            lastSentText = text;
            lastUpdateTime = now;
            Logger.debug('STREAMING', `Draft sent successfully`);
          } else {
            Logger.error('STREAMING', `sendMessageDraft failed: ${result.description}`);
          }
        } else {
          // Method 2: Use editMessageText (fallback, works without forum mode)
          if (!messageId) {
            // Send initial message
            Logger.debug('STREAMING', `Sending initial message (${text.length} chars)`);
            const result = await tgSendMessage({ 
              token, 
              chat_id: chatId, 
              text: text + " ▌",
              reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined
            });
            
            if (result.ok && result.result?.message_id) {
              messageId = result.result.message_id;
              lastSentText = text;
              lastUpdateTime = now;
              Logger.debug('STREAMING', `Initial message sent, ID: ${messageId}`);
            } else {
              Logger.warn('STREAMING', `Failed to send initial message: ${JSON.stringify(result)}`);
            }
          } else {
            // Edit existing message
            Logger.debug('STREAMING', `Editing message ${messageId} (${text.length} chars, +${charsSinceLastUpdate})`);
            const result = await tgEditMessageText({
              token,
              chat_id: chatId,
              message_id: messageId,
              text: text + " ▌"
            });
            
            if (result.ok) {
              lastSentText = text;
              lastUpdateTime = now;
              Logger.debug('STREAMING', `Message edited successfully`);
            } else {
              Logger.warn('STREAMING', `Failed to edit message: ${result.description} ${JSON.stringify(result)}`);
            }
          }
        }
      } catch (error: any) {
        Logger.error('STREAMING', `Update failed: ${error.message || error}`);
      }
    };

    try {
      const streamResult = await openaiChatStream({
        apiKey,
        model,
        messages,
        maxOutputTokens,
        tools,
        tool_choice,
        onChunk: async (chunk: string) => {
          fullText += chunk;
          buffer += chunk;

          // Check for word boundaries (space, punctuation, newline)
          const hasWordBoundary = /[\s,.!?;:\n]$/.test(buffer);

          if (hasWordBoundary && buffer.length >= MIN_CHARS_BETWEEN_UPDATES) {
            await updateMessage(fullText);
            buffer = "";
          }
        },
      });

      // Check if AI decided to use tool calls
      if (streamResult.tool_calls && streamResult.tool_calls.length > 0) {
        Logger.info('STREAMING', `AI requested tool calls, falling back to non-streaming for tool execution`);
        
        // Delete any draft/partial message we sent
        if (messageId && !hasTopicsEnabled) {
          try {
            await tgEditMessageText({
              token,
              chat_id: chatId,
              message_id: messageId,
              text: "⏳ Processing your request..."
            });
          } catch (e: any) {
            Logger.warn('STREAMING', `Failed to update message for tool processing: ${e.message || e}`);
          }
        }
        
        // Fall back to non-streaming mode to handle tool calls properly
        const result = await openaiChat({
          apiKey,
          model,
          messages,
          maxOutputTokens,
          tools,
          tool_choice,
        });
        
        // Send/update with final result
        if (messageId && !hasTopicsEnabled) {
          await tgEditMessageText({
            token,
            chat_id: chatId,
            message_id: messageId,
            text: result.text
          });
        } else {
          await tgSendMessage({ 
            token, 
            chat_id: chatId, 
            text: result.text,
            reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined
          });
        }
        
        return result;
      }

      // Send final message without typing cursor
      Logger.debug('STREAMING', `Stream complete, total text: ${fullText.length} chars, updates sent: ${lastSentText.length > 0 ? 'yes' : 'no'}`);
      
      if (hasTopicsEnabled) {
        // For sendMessageDraft, send final message with sendMessage
        Logger.debug('STREAMING', `Sending final message via sendMessage`);
        await tgSendMessage({ 
          token, 
          chat_id: chatId, 
          text: fullText,
          reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined
        });
      } else {
        // For editMessageText, remove cursor from last edit
        if (messageId) {
          Logger.debug('STREAMING', `Removing cursor from message ${messageId}`);
          await tgEditMessageText({
            token,
            chat_id: chatId,
            message_id: messageId,
            text: fullText
          });
        } else {
          // No message was sent during streaming, send now
          Logger.debug('STREAMING', `No updates sent during stream, sending final message`);
          if (fullText.trim()) {
            await tgSendMessage({ 
              token, 
              chat_id: chatId, 
              text: fullText,
              reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined
            });
          }
        }
      }

      return {
        text: fullText,
        tool_calls: streamResult.tool_calls,
        usage: streamResult.usage,
      };
    } catch (error: any) {
      Logger.error('STREAMING', `Streaming error: ${error.message || error}`);

      // Fallback: if streaming completely fails, send/edit with accumulated text
      if (fullText.trim()) {
        if (messageId) {
          await tgEditMessageText({
            token,
            chat_id: chatId,
            message_id: messageId,
            text: fullText
          });
        } else {
          await tgSendMessage({ 
            token, 
            chat_id: chatId, 
            text: fullText,
            reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined
          });
        }
        return { text: fullText, tool_calls: undefined, usage: undefined };
      }

      // If no text accumulated, fall back to non-streaming
      Logger.warn('STREAMING', `Streaming failed with no accumulated text, falling back to regular chat`);
      const result = await openaiChat({
        apiKey,
        model,
        messages,
        maxOutputTokens,
        tools,
        tool_choice,
      });
      
      if (result.text.trim()) {
        await tgSendMessage({ 
          token, 
          chat_id: chatId, 
          text: result.text,
          reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined
        });
      }
      
      return result;
    }
  }
}
1