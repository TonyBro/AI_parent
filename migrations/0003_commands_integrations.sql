-- Add columns to bot_commands table for integrations and menu visibility
ALTER TABLE bot_commands ADD COLUMN show_in_menu INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_commands ADD COLUMN integration_id TEXT;
ALTER TABLE bot_commands ADD COLUMN ai_instructions TEXT;

-- Create bot_integrations table
CREATE TABLE IF NOT EXISTS bot_integrations (
  id TEXT PRIMARY KEY,
  bot_project_id TEXT NOT NULL,
  integration_type TEXT NOT NULL, -- 'google_calendar'
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|disabled
  
  -- OAuth tokens (encrypted with bot DEK)
  access_token_ciphertext_b64 TEXT,
  access_token_iv_b64 TEXT,
  refresh_token_ciphertext_b64 TEXT,
  refresh_token_iv_b64 TEXT,
  token_expires_at INTEGER,
  
  -- Integration-specific settings (JSON)
  settings_json TEXT,
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_bot_integrations_project ON bot_integrations(bot_project_id);


