-- Add name column to meeting_participants
ALTER TABLE meeting_participants ADD COLUMN name text;

-- Populate from users table where possible
UPDATE meeting_participants mp
SET name = u.full_name
FROM users u
WHERE mp.user_id = u.id AND mp.name IS NULL;
