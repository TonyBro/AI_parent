-- Add integration_id to scheduled_broadcasts for API integrations
ALTER TABLE scheduled_broadcasts ADD COLUMN integration_id TEXT;

-- Index for quick lookup of broadcasts using integrations
CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_integration ON scheduled_broadcasts(integration_id);
