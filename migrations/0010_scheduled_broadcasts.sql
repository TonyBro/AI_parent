-- Multiple scheduled broadcasts per bot
CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  use_quiz_results INTEGER NOT NULL DEFAULT 1,
  quiz_set_ids_json TEXT,
  pre_prompt TEXT,
  send_time_hour INTEGER NOT NULL DEFAULT 9,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_bot ON scheduled_broadcasts(bot_project_id);

-- Migrate existing settings if any
INSERT INTO scheduled_broadcasts (id, bot_project_id, enabled, use_quiz_results, quiz_set_ids_json, pre_prompt, send_time_hour, created_at, updated_at)
SELECT 
  'legacy_' || bot_project_id, 
  bot_project_id, 
  enabled, 
  use_quiz_results, 
  quiz_set_ids_json, 
  pre_prompt, 
  send_time_hour, 
  updated_at, 
  updated_at
FROM broadcast_settings;




