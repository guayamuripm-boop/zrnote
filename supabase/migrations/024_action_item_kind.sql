-- 024 — Distinguir compromisos que son "evento" de los que son "tarea"
--
-- QUÉ RESUELVE
-- Todo compromiso se presentaba igual, como un bloque de 30 minutos en
-- Calendar a las 9:00 — tenga sentido o no. "Enviar la cotización" y "Reunión
-- de seguimiento con el proveedor" no son la misma clase de cosa: la primera
-- se completa ANTES de una fecha (una tarea), la segunda ocurre EN un momento
-- concreto (un evento). Forzar las dos al mismo molde de "evento a las 9am"
-- es lo que hacía que el calendario se llenara de bloques sin sentido real.
--
-- La IA ya clasifica esto al redactar el acta (ver MINUTE_PROMPT en
-- processing.ts); esta columna es donde se guarda esa clasificación.
--
-- ADITIVA: sólo ADD COLUMN IF NOT EXISTS. 'tarea' es el valor por defecto
-- porque es, de lejos, el caso más común — la mayoría de compromisos de una
-- reunión son "hacer algo antes de", no "estar en algún sitio a cierta hora".

ALTER TABLE action_items ADD COLUMN IF NOT EXISTS kind text CHECK (kind IN ('tarea', 'evento')) DEFAULT 'tarea';


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   ALTER TABLE action_items DROP COLUMN IF EXISTS kind;
--
-- Sin riesgo: el código antiguo no la usa. El código nuevo, si la columna
-- desaparece, recibe `undefined` de Supabase y `normalizeItemKind()` lo trata
-- como 'tarea' — la app entera degrada al comportamiento anterior a esta
-- migración sin caerse.
