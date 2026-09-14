-- 031 — Nivel de detalle del resumen: Breve / Normal / Detallado
--
-- QUÉ RESUELVE
-- El resumen siempre se redactaba con el mismo largo fijo, sin importar si
-- el organizador quería algo para leer en cinco segundos o algo detallado
-- con lo que repasar una clase sin volver a oír el audio.
--
-- POR QUÉ NO HAY UN `CHECK (summary_length IN (...))`
-- Mismo motivo que minute_style (ver 025_minute_style.sql): la lista de
-- niveles vive en código (`src/lib/summary-length.ts`), no en el esquema.
-- `normalizeSummaryLength()` valida contra esa lista y cualquier valor que no
-- reconozca cae a 'normal', así que un valor huérfano nunca rompe nada.
--
-- ADITIVA: sólo ADD COLUMN IF NOT EXISTS.

-- Nivel elegido para ESTA reunión.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS summary_length text DEFAULT 'normal';

-- La última elección de cada usuario, para premarcarla la próxima vez —mismo
-- patrón que default_minute_style.
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_summary_length text DEFAULT 'normal';


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   ALTER TABLE meetings DROP COLUMN IF EXISTS summary_length;
--   ALTER TABLE users DROP COLUMN IF EXISTS default_summary_length;
--
-- Sin riesgo: el código antiguo no las usa. El código nuevo, si las columnas
-- desaparecen, recibe `undefined` de Supabase y `normalizeSummaryLength()` lo
-- trata como 'normal' — el comportamiento de siempre.
