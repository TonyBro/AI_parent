-- Broadcast settings per bot
CREATE TABLE IF NOT EXISTS broadcast_settings (
  bot_project_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  use_quiz_results INTEGER NOT NULL DEFAULT 1,
  pre_prompt TEXT,
  send_time_hour INTEGER NOT NULL DEFAULT 9, -- 0-23, hour in user's local timezone
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

-- Track user timezone and subscription status
CREATE TABLE IF NOT EXISTS bot_subscribers (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timezone_offset INTEGER, -- minutes offset from UTC (e.g., +180 for UTC+3)
  subscribed INTEGER NOT NULL DEFAULT 1,
  last_message_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id),
  UNIQUE(bot_project_id, chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_subscribers_lookup ON bot_subscribers(bot_project_id, subscribed);
CREATE INDEX IF NOT EXISTS idx_bot_subscribers_last_message ON bot_subscribers(bot_project_id, subscribed, last_message_at);

-- Broadcast message log
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  target_hour INTEGER NOT NULL, -- the hour this broadcast is for
  message_text TEXT NOT NULL,
  generation_prompt TEXT,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_pending ON broadcast_messages(bot_project_id, completed_at);

-- Individual broadcast delivery tracking
CREATE TABLE IF NOT EXISTS broadcast_deliveries (
  id TEXT PRIMARY KEY,
  broadcast_message_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL, -- pending|sent|failed
  sent_at INTEGER,
  error TEXT,
  FOREIGN KEY(broadcast_message_id) REFERENCES broadcast_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_status ON broadcast_deliveries(broadcast_message_id, status);









