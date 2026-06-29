-- ZRNote — Initial Schema
-- Run this in Supabase SQL Editor

-- 1. organizations
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. users (extends auth.users)
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  role text CHECK (role IN ('super_admin', 'coordinator', 'participant')) DEFAULT 'participant',
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. meetings
CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  coordination text DEFAULT '',
  type text CHECK (type IN ('presencial', 'virtual', 'llamada')) DEFAULT 'presencial',
  status text CHECK (status IN ('scheduled', 'recording', 'processing', 'completed', 'failed')) DEFAULT 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  audio_segments jsonb DEFAULT '[]',
  transcript_raw text,
  transcript_diarized jsonb,
  speaker_map jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 4. meeting_participants
CREATE TABLE meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  email_override text,
  attended boolean DEFAULT true
);

-- 5. minutes
CREATE TABLE minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  summary text,
  topics jsonb DEFAULT '[]',
  decisions jsonb DEFAULT '[]',
  changes jsonb DEFAULT '[]',
  next_steps jsonb DEFAULT '[]',
  raw_llm_output text,
  generated_at timestamptz DEFAULT now(),
  approved boolean DEFAULT false
);

-- 6. action_items
CREATE TABLE action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  minute_id uuid REFERENCES minutes(id) ON DELETE CASCADE,
  assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assignee_email text,
  assignee_name text,
  description text NOT NULL,
  due_date date,
  priority text CHECK (priority IN ('alta', 'media', 'baja')) DEFAULT 'media',
  status text CHECK (status IN ('pendiente', 'en_progreso', 'completado')) DEFAULT 'pendiente',
  created_at timestamptz DEFAULT now()
);

-- 7. email_logs
CREATE TABLE email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  type text CHECK (type IN ('personal', 'coordinator_summary')),
  sent_at timestamptz DEFAULT now(),
  resend_id text,
  status text
);

-- Indexes
CREATE INDEX idx_meetings_org ON meetings(org_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX idx_action_items_meeting ON action_items(meeting_id);
CREATE INDEX idx_action_items_assignee ON action_items(assignee_user_id);
CREATE INDEX idx_email_logs_meeting ON email_logs(meeting_id);

-- RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users read own" ON users FOR SELECT USING (auth.uid() = id);

-- Users can read meetings in their org
CREATE POLICY "Org members read meetings" ON meetings FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Coordinators can create/update meetings
CREATE POLICY "Coordinators manage meetings" ON meetings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('coordinator', 'super_admin')
  ));

-- Participants can read their own meetings
CREATE POLICY "Participants read own meetings" ON meeting_participants FOR SELECT
  USING (user_id = auth.uid());

-- Minutes readable by org members
CREATE POLICY "Org members read minutes" ON minutes FOR SELECT
  USING (meeting_id IN (SELECT id FROM meetings WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

-- Action items readable by assignee or org members
CREATE POLICY "Read action items" ON action_items FOR SELECT
  USING (
    assignee_user_id = auth.uid()
    OR meeting_id IN (SELECT id FROM meetings WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))
  );

-- Service role bypass (for worker)
CREATE POLICY "Service role all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all participants" ON meeting_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all minutes" ON minutes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all action_items" ON action_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role all email_logs" ON email_logs FOR ALL USING (true) WITH CHECK (true);
