-- Missing indexes for performance (see audit 2026-07-14)
-- Run in Supabase SQL Editor

CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_action_items_assignee_email ON action_items(assignee_email);
