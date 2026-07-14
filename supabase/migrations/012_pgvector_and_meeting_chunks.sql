-- 012_pgvector_and_meeting_chunks.sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Meeting chunks table for RAG/vector search
CREATE TABLE meeting_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding vector(1024),  -- Jina AI v3 = 1024 dims
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_meeting_chunks_org ON meeting_chunks(org_id);
CREATE INDEX idx_meeting_chunks_meeting ON meeting_chunks(meeting_id);

-- HNSW index for fast vector search (pgvector >= 0.5.0)
CREATE INDEX meeting_chunks_embedding_idx 
  ON meeting_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS
ALTER TABLE meeting_chunks ENABLE ROW LEVEL SECURITY;

-- Org members can read chunks from their org
CREATE POLICY "Org members read chunks" ON meeting_chunks FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Service role can do everything (for worker)
CREATE POLICY "Service role all chunks" ON meeting_chunks FOR ALL
  USING (true) WITH CHECK (true);

-- Function to search similar chunks (for RAG)
CREATE OR REPLACE FUNCTION search_meeting_chunks(
  p_org_id uuid,
  p_query_embedding vector(1024),
  p_limit int DEFAULT 10,
  p_meeting_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  meeting_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    mc.id,
    mc.meeting_id,
    mc.chunk_index,
    mc.content,
    mc.metadata,
    1 - (mc.embedding <=> p_query_embedding) AS similarity
  FROM meeting_chunks mc
  WHERE mc.org_id = p_org_id
    AND (p_meeting_id IS NULL OR mc.meeting_id = p_meeting_id)
    AND mc.embedding IS NOT NULL
  ORDER BY mc.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;