-- ═══════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO DE CUOTA — de dónde sale el consumo
--
-- Pégalo entero en el editor SQL del proyecto de ZRNote y dale a Run.
-- SOLO LEE: ni un DELETE, ni un UPDATE, ni un ALTER.
--
-- Es UNA sola consulta a propósito: el editor de Supabase muestra únicamente
-- el resultado de la última sentencia, así que varios SELECT sueltos harían
-- que sólo vieras el último bloque.
--
-- Límites del plan gratuito, para comparar:
--   Base de datos ...... 500 MB
--   Almacenamiento ..... 1 GB
--   Transferencia ...... 5 GB/mes  ← esta NO se ve desde SQL:
--                                    Project Settings → Usage
-- ═══════════════════════════════════════════════════════════════════════

WITH tablas AS (
  SELECT
    c.relname::text                                         AS dato,
    pg_size_pretty(pg_total_relation_size(c.oid))            AS valor,
    COALESCE(s.n_live_tup, 0)::text || ' filas'              AS nota,
    pg_total_relation_size(c.oid)                            AS bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 8
),

-- Antigüedad del audio. Si aparecen bytes en «MÁS DE 30 DÍAS», el cron de
-- retención no está limpiando: la causa más probable de que el
-- almacenamiento crezca sin parar.
audio AS (
  SELECT
    CASE
      WHEN o.created_at < now() - interval '30 days' THEN 3
      WHEN o.created_at < now() - interval '7 days'  THEN 2
      ELSE 1
    END                                                      AS sub,
    CASE
      WHEN o.created_at < now() - interval '30 days' THEN 'mas de 30 dias --> DEBERIA ESTAR BORRADO'
      WHEN o.created_at < now() - interval '7 days'  THEN 'entre 7 y 30 dias'
      ELSE 'ultima semana'
    END                                                      AS dato,
    pg_size_pretty(COALESCE(SUM(NULLIF(o.metadata->>'size','')::bigint), 0)) AS valor,
    COUNT(*)::text || ' ficheros'                            AS nota
  FROM storage.objects o
  WHERE o.bucket_id = 'meeting-audio'
  GROUP BY 1, 2
),

buckets AS (
  SELECT
    o.bucket_id::text                                        AS dato,
    pg_size_pretty(COALESCE(SUM(NULLIF(o.metadata->>'size','')::bigint), 0)) AS valor,
    COUNT(*)::text || ' ficheros'                            AS nota,
    COALESCE(SUM(NULLIF(o.metadata->>'size','')::bigint), 0)  AS bytes
  FROM storage.objects o
  GROUP BY o.bucket_id
)

SELECT * FROM (

  -- 1. Tamaño de la base
  SELECT 1 AS orden, 0 AS sub,
         '1. BASE DE DATOS'      AS bloque,
         'tamano total'          AS dato,
         pg_size_pretty(pg_database_size(current_database())) AS valor,
         'limite gratuito: 500 MB' AS nota

  UNION ALL
  -- 2. Qué tabla se la come. Sospechoso: meeting_chunks (embeddings de 1536
  -- dimensiones + la transcripcion troceada de 500 en 500 caracteres).
  SELECT 2, ROW_NUMBER() OVER (ORDER BY bytes DESC)::int,
         '2. TABLAS MAS GRANDES', dato, valor, nota
  FROM tablas

  UNION ALL
  -- 3. Audio por antigüedad
  SELECT 3, sub, '3. AUDIO POR ANTIGUEDAD', dato, valor, nota
  FROM audio

  UNION ALL
  -- 4. Total por bucket, para comparar con el 1 GB
  SELECT 4, ROW_NUMBER() OVER (ORDER BY bytes DESC)::int,
         '4. ALMACENAMIENTO', dato, valor, nota
  FROM buckets

  UNION ALL
  -- 5. ¿Hace su trabajo el cron? Deberia salir 0.
  SELECT 5, 0, '5. RETENCION',
         'reuniones de +30 dias que aun apuntan a audio',
         COUNT(*)::text,
         COALESCE(MIN(created_at)::date::text, 'ninguna') || ' = la mas antigua'
  FROM meetings
  WHERE created_at < now() - interval '30 days'
    AND audio_segments IS NOT NULL
    AND jsonb_array_length(audio_segments) > 0

  UNION ALL
  -- 6. Volumen, para saber si esto es uso real o basura acumulada
  SELECT 6, 1, '6. VOLUMEN', 'reuniones', (SELECT COUNT(*) FROM meetings)::text,
         (SELECT COUNT(*) FROM meetings WHERE status = 'completed')::text || ' completadas, ' ||
         (SELECT COUNT(*) FROM meetings WHERE status = 'failed')::text || ' fallidas'
  UNION ALL
  SELECT 6, 2, '6. VOLUMEN', 'actas', (SELECT COUNT(*) FROM minutes)::text, ''
  UNION ALL
  SELECT 6, 3, '6. VOLUMEN', 'fragmentos vectorizados', (SELECT COUNT(*) FROM meeting_chunks)::text,
         'meeting_chunks'
  UNION ALL
  SELECT 6, 4, '6. VOLUMEN', 'usuarios', (SELECT COUNT(*) FROM users)::text, ''

) t
ORDER BY orden, sub;
