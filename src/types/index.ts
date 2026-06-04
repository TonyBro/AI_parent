export type DbRow = Record<string, unknown>;

export interface BotConfig {
  botProjectId: string;
  ownerUserId: string;
  status: string;
  botTelegramId: string;
  botUsername: string;
  defaultLanguage: string;
  name: string;
  description: string;
  businessContext: string | null;
  allowedTopicsJson: string | null;
  disallowedTopicsJson: string | null;
  webhookHeaderSecret: string;
  systemPrompt: string;
  defaultPrompt: string;
  moderationPrompt: string;
  timezone: string;
  quizSetIds: string[];
  type: string;
  welcomeImageUrl?: string | null;
}

export interface ParentWizardState {
  step: "idle" | "awaiting_token" | "awaiting_name" | "awaiting_description" | "awaiting_default_language";
  childToken?: string;
  childBotUsername?: string;
  childBotId?: string;
  name?: string;
  description?: string;
}

export interface CommandContext {
  isCommand: boolean;
  commandName: string | null;
  customCommand: any | null;
  apiDataText: string;
  stopProcessing: boolean;
}

export interface BotCreationTemplate {
  originalPrompt: string;
  language: string;
  config: {
    name: string;
    description: string;
    business_context: string;
    timezone?: string;
    commands: Array<{
      command: string;
      description: string;
      ai_instructions: string;
      integrationDisplayName?: string;
      use_quiz_results?: boolean;
      quizTitles?: string[];
    }>;
    quizzes?: Array<{
      title: string;
      items: Array<{
        question: string;
        options: Array<{ key: string; label: string }>;
      }>;
    }>;
    apiIntegrations?: Array<{
      displayName: string;
      apiUrl: string;
      httpMethod: "GET" | "POST";
      authType: "none" | "bearer" | "api_key";
      aiPrompt: string;
      dynamicParams?: string;
    }>;
    scheduledBroadcasts?: Array<{
      sendTimeHour: number;
      prePrompt: string;
      integrationDisplayName?: string;
      sentenceCount?: number;
    }>;
  };
  createdAt: number;
}
