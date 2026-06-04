ALTER TABLE bot_projects ADD COLUMN timezone TEXT DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS bot_working_hours (
    id TEXT PRIMARY KEY,
    bot_project_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL, -- 0 (Sunday) to 6 (Saturday)
    start_time TEXT NOT NULL, -- "HH:MM"
    end_time TEXT NOT NULL, -- "HH:MM"
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(bot_project_id) REFERENCES bot_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_bot_working_hours_project ON bot_working_hours(bot_project_id);






