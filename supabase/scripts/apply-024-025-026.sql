-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIONES PENDIENTES 024 + 025 + 026 — para pegar en el editor SQL
--
-- Proyecto correcto: qmdcpcwigzebqcoeiebi  (el de NEXT_PUBLIC_SUPABASE_URL)
-- https://supabase.com/dashboard/project/qmdcpcwigzebqcoeiebi/sql/new
--
-- Las tres son ADITIVAS (sólo ADD COLUMN IF NOT EXISTS): no borran nada, no
-- reescriben filas y se pueden ejecutar dos veces sin efecto. Cada una lleva
-- su reversión comentada en su propio archivo.
--
-- Este archivo es una comodidad para aplicarlas de una vez; las migraciones
-- de verdad siguen siendo 024_*.sql, 025_*.sql y 026_*.sql.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 024 — Compromisos: distinguir "evento" de "tarea" ──────────────────
-- Sin esto: todo compromiso se trata como 'tarea' (el comportamiento previo).
ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS kind text CHECK (kind IN ('tarea', 'evento')) DEFAULT 'tarea';


-- ── 025 — Estilo del acta: Ejecutiva / Clase ───────────────────────────
-- Sin esto: toda acta se redacta en estilo 'ejecutiva'.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS minute_style text DEFAULT 'ejecutiva';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS style_notes text;
ALTER TABLE users    ADD COLUMN IF NOT EXISTS default_minute_style text DEFAULT 'ejecutiva';


-- ── 026 — Apuntes de clase (modo estudio) ──────────────────────────────
-- Sin esto: los apuntes se guardan igual dentro de minutes.raw_llm_output y
-- readStudyAids() los lee de ahí. La columna sólo hace la lectura directa.
ALTER TABLE minutes ADD COLUMN IF NOT EXISTS study_aids jsonb DEFAULT '{}'::jsonb;


-- ═══════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN — ejecuta esto después; deben salir las 5 filas
-- ═══════════════════════════════════════════════════════════════════════
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('action_items', 'kind'),
    ('meetings',     'minute_style'),
    ('meetings',     'style_notes'),
    ('users',        'default_minute_style'),
    ('minutes',      'study_aids')
  )
ORDER BY table_name, column_name;
