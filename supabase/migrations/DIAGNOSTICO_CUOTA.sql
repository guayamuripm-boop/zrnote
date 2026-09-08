-- ═══════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO DE CUOTA — de dónde sale el consumo
--
-- Pégalo entero en el editor SQL del proyecto de ZRNote y ejecútalo.
-- SOLO LEE: ni un DELETE, ni un UPDATE, ni un ALTER. Se puede correr las
-- veces que haga falta.
--
-- Límites del plan gratuito, para comparar:
--   Base de datos ...... 500 MB
--   Almacenamiento ..... 1 GB
--   Transferencia ...... 5 GB/mes   ← esta NO se ve desde SQL, mírala en
--                                     Project Settings → Usage
-- ═══════════════════════════════════════════════════════════════════════


-- ── 1. ¿Cuánto ocupa la base, y qué tabla se la come? ──────────────────
-- Sospechoso principal: meeting_chunks. Cada fragmento lleva un embedding de
-- 1536 dimensiones (~6 KB) y la transcripción entera se trocea en pedazos de
-- 500 caracteres — o sea, decenas de filas gordas por reunión.
SELECT
  'BASE DE DATOS' AS bloque,
  pg_size_pretty(pg_database_size(current_database())) AS total_ocupado,
  '500 MB en el plan gratuito' AS limite;

SELECT
  relname AS tabla,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS ocupa,
  n_live_tup AS filas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 12;


-- ── 2. ¿Cuánto audio hay guardado, y de qué antigüedad? ────────────────
-- Si aparecen bytes en la fila "MÁS DE 30 DÍAS (debería estar borrado)",
-- el cron de retención NO está limpiando: es la causa más probable de que
-- el almacenamiento crezca sin parar.
SELECT
  CASE
    WHEN o.created_at < now() - interval '30 days' THEN 'MÁS DE 30 DÍAS (debería estar borrado)'
    WHEN o.created_at < now() - interval '7 days'  THEN 'entre 7 y 30 días'
    ELSE 'última semana'
  END AS antiguedad,
  count(*) AS ficheros,
  pg_size_pretty(sum((o.metadata->>'size')::bigint)) AS ocupan
FROM storage.objects o
WHERE o.bucket_id = 'meeting-audio'
GROUP BY 1
ORDER BY 1;

-- Total del bucket, para comparar con el 1 GB.
SELECT
  'ALMACENAMIENTO' AS bloque,
  o.bucket_id AS bucket,
  count(*) AS ficheros,
  pg_size_pretty(sum((o.metadata->>'size')::bigint)) AS total_ocupado
FROM storage.objects o
GROUP BY o.bucket_id
ORDER BY sum((o.metadata->>'size')::bigint) DESC;


-- ── 3. ¿Está el cron de retención haciendo su trabajo? ─────────────────
-- Reuniones de más de 30 días que TODAVÍA apuntan a ficheros de audio.
-- Debería salir 0. Si no, el cron no corre, falla, o no llega a terminar.
SELECT
  'RETENCIÓN' AS bloque,
  count(*) AS reuniones_viejas_con_audio_sin_borrar,
  min(created_at)::date AS la_mas_antigua
FROM meetings
WHERE created_at < now() - interval '30 days'
  AND audio_segments IS NOT NULL
  AND jsonb_array_length(audio_segments) > 0;


-- ── 4. Volumen general, para saber si esto es uso real o basura ────────
SELECT
  'VOLUMEN' AS bloque,
  (SELECT count(*) FROM meetings)                                   AS reuniones,
  (SELECT count(*) FROM meetings WHERE status = 'completed')        AS completadas,
  (SELECT count(*) FROM meetings WHERE status = 'failed')           AS fallidas,
  (SELECT count(*) FROM minutes)                                    AS actas,
  (SELECT count(*) FROM meeting_chunks)                             AS fragmentos_vectorizados,
  (SELECT count(*) FROM users)                                      AS usuarios;
