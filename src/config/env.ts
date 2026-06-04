export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS?: Fetcher;
  API_PROXY: DurableObjectNamespace;

  PUBLIC_BASE_URL: string;
  MINIAPP_URL?: string;
  GLOBAL_DISABLE?: string;

  // Secrets
  PARENT_BOT_TOKEN: string;
  PARENT_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
  KEK_MASTER_KEY: string;
  KEK_VERSION?: string;

  TELEGRAM_API_ID: string;
  TELEGRAM_API_HASH: string;

  // Google OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // Supabase
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  FREE_PLAN_BOT_LIMIT?: string;

  DEBUG_MODE?: string;
  ENABLE_STREAMING_RESPONSES?: string;
  STREAMING_MIN_CHARS?: string;
  STREAMING_MIN_TIME_MS?: string;
  LOG_LEVEL?: string;
  LOG_DOMAINS?: string;
}

