-- 027 — Registrar un fragmento de audio de forma atómica
--
-- QUÉ RESUELVE
-- `meetings.audio_segments` es un JSONB con la lista de fragmentos subidos, y
-- hasta ahora se actualizaba con un patrón leer-modificar-escribir desde el
-- servidor de Next: SELECT del array, se le quita el índice que llega, se le
-- añade el nuevo, se ordena y se hace UPDATE del array entero.
--
-- Ese patrón sólo es correcto si NADIE MÁS escribe entre el SELECT y el
-- UPDATE. Y sí hay quien escribe: la extensión de Chrome sube por la misma
-- ruta, y desde que la cola de subida es durable (ver `upload-queue.ts`) una
-- grabación interrumpida puede acabar con DOS pestañas del mismo teléfono
-- drenando la misma cola a la vez — Android restaura la pestaña vieja y el
-- usuario abre una nueva. Dos subidas simultáneas leen el mismo array, y la
-- segunda escribe encima de la primera: el fichero queda en Storage, pero
-- nada apunta a él. El audio existe y no sale en el acta. Es el peor tipo de
-- fallo posible: silencioso, intermitente y con pérdida de datos.
--
-- La función de abajo hace lo mismo en UNA sola sentencia. Postgres toma un
-- row lock sobre la fila de la reunión durante el UPDATE, así que dos
-- llamadas concurrentes se serializan solas y ninguna pisa a la otra.
--
-- Sigue siendo IDEMPOTENTE: volver a registrar el mismo `segment_index`
-- reemplaza su entrada en vez de duplicarla, que es justo lo que necesita una
-- cola que reintenta.
--
-- ADITIVA: sólo CREATE FUNCTION. El código llama a esta función y, si no
-- existe todavía (despliegue antes de aplicar la migración), vuelve solo al
-- camino antiguo. Se puede aplicar antes o después de desplegar, en cualquier
-- orden, sin romper nada.

CREATE OR REPLACE FUNCTION append_audio_segment(
  p_meeting_id uuid,
  p_segment jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE meetings
  SET audio_segments = (
    SELECT COALESCE(jsonb_agg(s ORDER BY (s->>'segment_index')::int), '[]'::jsonb)
    FROM (
      -- Los fragmentos que ya había, menos el que llega (para que un reintento
      -- lo reemplace en vez de duplicarlo)…
      SELECT elem AS s
      FROM jsonb_array_elements(COALESCE(audio_segments, '[]'::jsonb)) AS elem
      WHERE (elem->>'segment_index')::int IS DISTINCT FROM (p_segment->>'segment_index')::int
      UNION ALL
      -- …más el que llega.
      SELECT p_segment
    ) AS merged(s)
  )
  WHERE id = p_meeting_id
  RETURNING audio_segments;
$$;

-- SECURITY INVOKER, no DEFINER: la función corre con los permisos de quien
-- llama, así que las políticas RLS de `meetings` se siguen aplicando igual que
-- en el UPDATE que sustituye. No abre ninguna puerta nueva.
GRANT EXECUTE ON FUNCTION append_audio_segment(uuid, jsonb) TO authenticated, service_role;


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   DROP FUNCTION IF EXISTS append_audio_segment(uuid, jsonb);
--
-- Sin riesgo: el código detecta que la función no está y usa el camino
-- leer-modificar-escribir de siempre.
