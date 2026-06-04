-- Core users (creators)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- Child bot projects (one per creator in free plan)
CREATE TABLE IF NOT EXISTS bot_projects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL, -- active|disabled|deleted

  bot_telegram_id TEXT NOT NULL,
  bot_username TEXT NOT NULL,

  default_language TEXT NOT NULL,

  topic_title TEXT NOT NULL,
  topic_description TEXT NOT NULL,
  allowed_topics_json TEXT,
  disallowed_topics_json TEXT,

  webhook_secret TEXT NOT NULL UNIQUE,         -- used in URL path
  webhook_header_secret TEXT NOT NULL,         -- compared to X-Telegram-Bot-Api-Secret-Token

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled_at INTEGER,
  deleted_at INTEGER,

  FOREIGN KEY(owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bot_projects_owner ON bot_projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_bot_projects_status ON bot_projects(status);

-- Per-bot envelope key record (DEK wrapped by platform KEK)
CREATE TABLE IF NOT EXISTS bot_keys (
  bot_project_id TEXT PRIMARY KEY,
  dek_wrapped_b64 TEXT NOT NULL,
  dek_wrap_iv_b64 TEXT NOT NULL,
  dek_version INTEGER NOT NULL,
  kek_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  rotated_at INTEGER,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

-- Child bot token (encrypted with per-bot DEK)
CREATE TABLE IF NOT EXISTS bot_tokens (
  bot_project_id TEXT PRIMARY KEY,
  token_ciphertext_b64 TEXT NOT NULL,
  token_iv_b64 TEXT NOT NULL,
  token_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  rotated_at INTEGER,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

-- Prompts for AI behavior (topic/global rules are injected server-side too)
CREATE TABLE IF NOT EXISTS bot_prompts (
  bot_project_id TEXT PRIMARY KEY,
  system_prompt TEXT NOT NULL,
  default_prompt TEXT NOT NULL,
  moderation_prompt TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

-- Bot commands and optional per-command override prompt
CREATE TABLE IF NOT EXISTS bot_commands (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_override TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id),
  UNIQUE(bot_project_id, command)
);

CREATE INDEX IF NOT EXISTS idx_bot_commands_project ON bot_commands(bot_project_id);

-- Quiz sets and items (preference quiz)
CREATE TABLE IF NOT EXISTS quiz_sets (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_sets_project ON quiz_sets(bot_project_id);

CREATE TABLE IF NOT EXISTS quiz_items (
  id TEXT PRIMARY KEY,
  quiz_set_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL, -- [{key,label,profile_patch}]
  created_at INTEGER NOT NULL,
  FOREIGN KEY(quiz_set_id) REFERENCES quiz_sets(id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_items_set_pos ON quiz_items(quiz_set_id, position);

-- Quiz sessions and responses
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  quiz_set_id TEXT NOT NULL,
  current_position INTEGER NOT NULL,
  status TEXT NOT NULL, -- active|completed|stopped
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id),
  FOREIGN KEY(quiz_set_id) REFERENCES quiz_sets(id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_lookup ON quiz_sessions(bot_project_id, chat_id, user_id, status);

CREATE TABLE IF NOT EXISTS quiz_responses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  quiz_item_id TEXT NOT NULL,
  option_key TEXT NOT NULL,
  option_label TEXT NOT NULL,
  profile_patch_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES quiz_sessions(id),
  FOREIGN KEY(quiz_item_id) REFERENCES quiz_items(id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_session ON quiz_responses(session_id);

-- Aggregated user profiles per bot+chat+user
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  language TEXT,
  profile_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id),
  UNIQUE(bot_project_id, chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_lookup ON user_profiles(bot_project_id, chat_id, user_id);

-- Raw Telegram updates (store everything)
CREATE TABLE IF NOT EXISTS telegram_updates_raw (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  update_id INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  update_json TEXT NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id),
  UNIQUE(bot_project_id, update_id)
);

CREATE INDEX IF NOT EXISTS idx_updates_received_at ON telegram_updates_raw(received_at);

-- Parent bot raw updates (no bot_project_id)
CREATE TABLE IF NOT EXISTS parent_updates_raw (
  id TEXT PRIMARY KEY,
  update_id INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  update_json TEXT NOT NULL,
  UNIQUE(update_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_updates_received_at ON parent_updates_raw(received_at);

-- Normalized messages (in/out)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT,
  message_id INTEGER,
  direction TEXT NOT NULL, -- in|out
  text TEXT,
  language_code TEXT,
  media_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_history ON messages(bot_project_id, chat_id, created_at);

-- AI calls
CREATE TABLE IF NOT EXISTS ai_calls (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  refusal INTEGER NOT NULL DEFAULT 0,
  prompt_json TEXT NOT NULL,
  response_text TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_history ON ai_calls(bot_project_id, chat_id, created_at);

-- Conversation summaries (token control)
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id),
  UNIQUE(bot_project_id, chat_id)
);

-- Audit events
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT,
  actor_user_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at);

-- Deletion requests (creator-level)
CREATE TABLE IF NOT EXISTS deletion_requests (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  status TEXT NOT NULL, -- pending|running|completed|failed
  completed_at INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status, requested_at);


