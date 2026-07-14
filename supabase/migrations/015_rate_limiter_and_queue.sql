-- Rate limiter table (replaces broken in-memory Map)
-- TTL-based: old entries cleaned up automatically by PostgreSQL
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count int DEFAULT 1,
  reset_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);

-- Processing queue table (enables batch processing without Vercel timeout)
CREATE TABLE IF NOT EXISTS processing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('transcribe','analyze','vectorize','emails')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','running','failed','completed')),
  attempts int DEFAULT 0,
  max_attempts int DEFAULT 5,
  batch_offset int DEFAULT 0,
  error text,
  created_at timestamptz DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON processing_queue(status, created_at);

-- Add segments_transcribed_offset to meetings (for batch processing)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS segments_transcribed_offset int DEFAULT 0;
