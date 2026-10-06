-- 036 — Corregir hallazgos del Security Advisor de Supabase
--
-- QUÉ RESUELVE
--
-- 1. Políticas "Service role all *" con USING (true) en tags, meeting_tags
--    y meeting_chunks. Estas políticas aplican a TODOS los roles, no solo a
--    service_role (que ya puentea RLS automáticamente en Supabase). Efecto:
--    cualquier usuario autenticado podía leer/escribir filas de cualquier org.
--
-- 2. search_meeting_chunks sin SET search_path — vulnerable a search_path
--    hijacking (CVE genérica de funciones PL/pgSQL sin search_path fijo).
--
-- 3. Funciones huérfanas append_audit_segment y visit_orphan_audits que no
--    usa ningún código del proyecto pero son ejecutables por PUBLIC.
--
-- 4. Las funciones SECURITY DEFINER de RLS (current_user_org_id,
--    is_meeting_creator, is_meeting_participant) eran ejecutables por anon
--    y PUBLIC. Solo las necesita authenticated (las llaman las policies).
--
-- 5. check_rate_limit (032) ya estaba bien (solo service_role). Confirmamos.
--
-- ADITIVA: solo DROP POLICY / CREATE POLICY / ALTER FUNCTION / REVOKE+GRANT.
-- SEGURA: si algo falla, las funciones y tablas siguen existiendo.

-- =========================================================================
-- 1. Eliminar políticas "USING (true)" que abren tablas a todos los roles
-- =========================================================================

-- meeting_chunks: eliminar la política abierta
DROP POLICY IF EXISTS "Service role all chunks" ON meeting_chunks;

-- tags: eliminar la política abierta
DROP POLICY IF EXISTS "Service role all tags" ON tags;

-- meeting_tags: eliminar la política abierta
DROP POLICY IF EXISTS "Service role all meeting_tags" ON meeting_tags;

-- Nota: service_role NO necesita políticas — puentea RLS por defecto.
-- Las políticas restantes (org members read, creator manages, etc.) son
-- suficientes para el acceso de usuarios autenticados.

-- =========================================================================
-- 2. Fijar search_path en search_meeting_chunks
-- =========================================================================

CREATE OR REPLACE FUNCTION public.search_meeting_chunks(
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
SET search_path = public
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

-- =========================================================================
-- 3. Eliminar funciones huérfanas (no están en el código, no se usan)
-- =========================================================================

DROP FUNCTION IF EXISTS public.append_audit_segment(uuid, text);
DROP FUNCTION IF EXISTS public.append_audit_segment(uuid, text, text);
DROP FUNCTION IF EXISTS public.append_audit_segment();
DROP FUNCTION IF EXISTS public.visit_orphan_audits(integer, integer);
DROP FUNCTION IF EXISTS public.visit_orphan_audits();

-- =========================================================================
-- 4. Restringir EXECUTE de funciones SECURITY DEFINER a authenticated
-- =========================================================================

-- RLS helpers: solo authenticated las necesita (las policies las invocan)
REVOKE ALL ON FUNCTION public.current_user_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated;

REVOKE ALL ON FUNCTION public.is_meeting_creator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_meeting_creator(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_meeting_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_meeting_participant(uuid) TO authenticated;

-- search_meeting_chunks: solo authenticated (búsqueda RAG requiere sesión)
REVOKE ALL ON FUNCTION public.search_meeting_chunks(uuid, vector, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_meeting_chunks(uuid, vector, int, uuid) TO authenticated, service_role;


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--
-- 1. Recrear las políticas abiertas:
--   CREATE POLICY "Service role all chunks" ON meeting_chunks FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "Service role all tags" ON tags FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "Service role all meeting_tags" ON meeting_tags FOR ALL USING (true) WITH CHECK (true);
--
-- 2. Quitar search_path de search_meeting_chunks (recrear sin SET search_path)
--
-- 3. Restaurar permisos abiertos:
--   GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.is_meeting_creator(uuid) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.is_meeting_participant(uuid) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.search_meeting_chunks(...) TO PUBLIC;
