export type BotDto = {
  id: string;
  status: "active" | "disabled" | string;
  bot_username: string;
  default_language: string;
  name: string;
  description: string;
  type?: string;
  bot_token?: string;
  subscriber_count?: number;
};
