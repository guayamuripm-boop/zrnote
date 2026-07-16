-- Add new columns to minutes for detailed minute storage
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS discussion jsonb DEFAULT '[]';
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS project_statuses jsonb DEFAULT '[]';
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS blockers jsonb DEFAULT '[]';
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS ideas jsonb DEFAULT '[]';
