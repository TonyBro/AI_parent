-- Add use_quiz_results to bot_commands
ALTER TABLE bot_commands ADD COLUMN use_quiz_results INTEGER NOT NULL DEFAULT 1;
