-- Performance: index the columns that every request and RLS policy filters on.
-- Run this in Supabase SQL Editor (same as previous migrations).

-- Almost every query and RLS policy on meetings filters by created_by and
-- sorts by created_at; without this index those become full table scans.
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON meetings(created_by, created_at DESC);

-- The "Participants: creator manages" / participant-read RLS policies filter
-- meeting_participants by user_id; there was previously no index for it.
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON meeting_participants(user_id);
