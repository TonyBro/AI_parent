-- Link translated quiz sets to their original versions
ALTER TABLE quiz_sets ADD COLUMN parent_quiz_set_id TEXT;
CREATE INDEX IF NOT EXISTS idx_quiz_sets_parent ON quiz_sets(parent_quiz_set_id);
