-- One-time cleanup script for soft-deleted bots
-- This removes ALL soft-deleted bots and their associated data immediately
-- WARNING: This permanently deletes data - make sure you have backups!

-- First, check how many bots will be deleted (uncomment to preview):
-- SELECT COUNT(*) as soft_deleted_count FROM bot_projects WHERE deleted_at IS NOT NULL;

-- Delete all related data in correct cascade order
-- Using direct subqueries instead of temp tables for Wrangler D1 compatibility

-- Broadcast deliveries (child of broadcast_messages)
DELETE FROM broadcast_deliveries 
WHERE broadcast_message_id IN (
  SELECT id FROM broadcast_messages 
  WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL)
);

-- Broadcast messages
DELETE FROM broadcast_messages 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Bot subscribers
DELETE FROM bot_subscribers 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Broadcast settings
DELETE FROM broadcast_settings 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Scheduled broadcasts
DELETE FROM scheduled_broadcasts 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- AI calls
DELETE FROM ai_calls 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Messages
DELETE FROM messages 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Telegram updates raw
DELETE FROM telegram_updates_raw 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Conversation summaries
DELETE FROM conversation_summaries 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- User profiles
DELETE FROM user_profiles 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Quiz responses (child of quiz_sessions)
DELETE FROM quiz_responses 
WHERE session_id IN (
  SELECT id FROM quiz_sessions 
  WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL)
);

-- Quiz sessions
DELETE FROM quiz_sessions 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Quiz items (child of quiz_sets)
DELETE FROM quiz_items 
WHERE quiz_set_id IN (
  SELECT id FROM quiz_sets 
  WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL)
);

-- Quiz sets
DELETE FROM quiz_sets 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Bot commands
DELETE FROM bot_commands 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Bot integrations
DELETE FROM bot_integrations 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Bot actions
DELETE FROM bot_actions 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Bot working hours
DELETE FROM bot_working_hours 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Bot prompts
DELETE FROM bot_prompts 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Bot tokens
DELETE FROM bot_tokens 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Bot keys
DELETE FROM bot_keys 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Audit events
DELETE FROM audit_events 
WHERE bot_project_id IN (SELECT id FROM bot_projects WHERE deleted_at IS NOT NULL);

-- Finally delete bot_projects themselves
DELETE FROM bot_projects WHERE deleted_at IS NOT NULL;

-- Show summary
SELECT 'Cleanup complete! All soft-deleted bots and their data have been removed.' as status;
