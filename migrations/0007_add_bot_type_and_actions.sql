-- Add type column to bot_projects (default 'assistant' for existing bots)
ALTER TABLE bot_projects ADD COLUMN type TEXT NOT NULL DEFAULT 'assistant';

-- Create bot_actions table for manager bot rules
CREATE TABLE IF NOT EXISTS bot_actions (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'link_rewriter', 'word_filter', etc.
  settings_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|disabled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_bot_actions_project ON bot_actions(bot_project_id);






