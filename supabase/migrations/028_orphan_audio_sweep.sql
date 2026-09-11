-- 028 — Encontrar el audio huérfano que ningún cron podía ver
--
-- QUÉ RESUELVE
-- El cron de retención borra audio recorriendo la tabla `meetings`: para cada
-- reunión de más de 30 días coge su `audio_segments` y borra esos ficheros de
-- Storage. Eso deja un agujero: un fichero al que NINGUNA reunión apunta es
-- invisible para ese recorrido, y por tanto no se borra nunca.
--
-- El diagnóstico del 11 sep 2026 lo confirmó en producción: 90 MB en 165
-- ficheros de más de 30 días, y CERO reuniones de más de 30 días que aún
-- apuntaran a audio. Es decir, 165 ficheros que ya no eran de nadie y que iban
-- a quedarse ahí para siempre, sumando al 1 GB del plan gratuito.
--
-- De dónde salen los huérfanos (todas estas vías son reales):
--   • `storage.remove()` acepta una lista y devuelve error sólo si falla
--     entera. Si borra 8 de 10 ficheros, el cron lo daba por bueno, limpiaba
--     `audio_segments` y los 2 restantes quedaban sin dueño.
--   • Una subida que llega a Storage y luego falla al registrarse en la base
--     de datos: el fichero existe, nada lo apunta.
--   • Un reintento que sube el mismo índice con otra extensión
--     (`segment_3.webm` y `segment_3.ogg`): el array apunta a uno, el otro
--     queda suelto.
--   • Borrar una reunión a mano cuando la limpieza de Storage falló.
--
-- La función de abajo hace la pregunta al revés — mira Storage y pregunta a la
-- base de datos quién reclama cada fichero — que es la única forma de ver algo
-- a lo que nadie apunta. Es la diferencia entre limpiar lo que conoces y
-- limpiar lo que hay.
--
-- SÓLO LEE. No borra nada: devuelve la lista, y el cron decide.
-- ADITIVA: sólo CREATE FUNCTION.

CREATE OR REPLACE FUNCTION list_orphan_audio(
  p_older_than_days int DEFAULT 30,
  p_limit int DEFAULT 500
)
RETURNS TABLE (name text, size_bytes bigint, created_at timestamptz)
LANGUAGE sql
-- DEFINER porque `storage.objects` no es accesible desde PostgREST: esta
-- función es la única puerta, y sólo la abre para service_role (ver GRANT).
-- El search_path va fijado para que no se pueda secuestrar ningún nombre.
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
  SELECT
    o.name::text,
    NULLIF(o.metadata->>'size', '')::bigint,
    o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'meeting-audio'
    -- Nunca se toca audio reciente, pase lo que pase. Un fichero que acaba de
    -- subirse y cuyo registro en la base de datos aún no ha llegado NO puede
    -- confundirse con basura: tiene treinta días de margen para reclamarse.
    AND o.created_at < now() - make_interval(days => GREATEST(p_older_than_days, 1))
    AND NOT EXISTS (
      SELECT 1
      FROM meetings m
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(m.audio_segments) = 'array' THEN m.audio_segments
          ELSE '[]'::jsonb
        END
      ) AS seg
      WHERE seg->>'r2_key' = o.name
    )
  ORDER BY o.created_at
  LIMIT GREATEST(p_limit, 0);
$$;

-- Sólo el cron (service_role). Ningún usuario autenticado necesita —ni debe—
-- poder enumerar el bucket de audio de nadie.
REVOKE ALL ON FUNCTION list_orphan_audio(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_orphan_audio(int, int) TO service_role;


-- ========================================================================
-- VERLO SIN BORRAR NADA (pégalo en el editor SQL cuando quieras)
-- ========================================================================
--   SELECT count(*) AS ficheros,
--          pg_size_pretty(sum(size_bytes)) AS peso
--   FROM list_orphan_audio(30, 100000);
--
-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   DROP FUNCTION IF EXISTS list_orphan_audio(int, int);
--
-- Sin riesgo: el cron detecta que la función no está y se salta la barrida,
-- comportándose exactamente como antes.
