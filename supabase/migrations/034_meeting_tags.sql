-- Tags for meeting organization

CREATE TABLE tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#3b82f6',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE meeting_tags (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, tag_id)
);

CREATE INDEX idx_tags_org ON tags(org_id);
CREATE INDEX idx_meeting_tags_meeting ON meeting_tags(meeting_id);
CREATE INDEX idx_meeting_tags_tag ON meeting_tags(tag_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_tags ENABLE ROW LEVEL SECURITY;

-- Tags: org members can read; any authenticated user can create/manage their own
CREATE POLICY "Org members read tags" ON tags
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users create tags" ON tags
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Tag creator manages" ON tags
  FOR ALL USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Service role all tags" ON tags
  FOR ALL USING (true) WITH CHECK (true);

-- Meeting tags: meeting owner can manage
CREATE POLICY "Meeting owner manages tags" ON meeting_tags
  FOR ALL USING (
    meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  ) WITH CHECK (
    meeting_id IN (SELECT id FROM meetings WHERE created_by = auth.uid())
  );

CREATE POLICY "Org members read meeting_tags" ON meeting_tags
  FOR SELECT USING (
    meeting_id IN (
      SELECT m.id FROM meetings m
      JOIN users u ON u.org_id = m.org_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Service role all meeting_tags" ON meeting_tags
  FOR ALL USING (true) WITH CHECK (true);
