-- 025 — Estilo del acta: Ejecutiva / Educativa (y las que vengan después)
--
-- QUÉ RESUELVE
-- El acta siempre se redactaba con el mismo criterio: juntas, comités,
-- seguimiento de equipo. Si la cuenta se usa también para clases o tutorías,
-- ese mismo criterio no encaja — "yo me encargo" y "para la próxima clase
-- traigan el ensayo" son la misma clase de señal, pero un jefe de gabinete no
-- reconoce la segunda como un compromiso.
--
-- POR QUÉ NO HAY UN `CHECK (minute_style IN (...))`
-- A propósito. La lista de estilos vive en código (`src/lib/minute-styles.ts`)
-- y no en el esquema: añadir un tercer estilo más adelante —comités formales,
-- reuniones de obra— es entonces un cambio de código, no una migración nueva.
-- `normalizeMinuteStyle()` valida contra esa lista y cualquier valor que no
-- reconozca cae a 'ejecutiva', así que un valor huérfano (de un estilo que se
-- haya retirado) nunca rompe nada, sólo degrada al comportamiento por defecto.
--
-- ADITIVA: sólo ADD COLUMN IF NOT EXISTS.

-- Estilo elegido para ESTA reunión.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS minute_style text DEFAULT 'ejecutiva';

-- Notas cortas y opcionales del organizador para esta acta en concreto
-- ("somos un colegio, usa 'estudiantes' en vez de 'participantes'"). Se tratan
-- SIEMPRE como contexto para la IA, nunca como una instrucción que pueda
-- anular las reglas del prompt — ver MINUTE_PROMPT en processing.ts.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS style_notes text;

-- La última elección de cada usuario, para premarcarla la próxima vez y que
-- grabar rápido no obligue a elegir estilo cada vez.
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_minute_style text DEFAULT 'ejecutiva';


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   ALTER TABLE meetings DROP COLUMN IF EXISTS minute_style;
--   ALTER TABLE meetings DROP COLUMN IF EXISTS style_notes;
--   ALTER TABLE users DROP COLUMN IF EXISTS default_minute_style;
--
-- Sin riesgo: el código antiguo no las usa. El código nuevo, si las columnas
-- desaparecen, recibe `undefined` de Supabase y `normalizeMinuteStyle()` lo
-- trata como 'ejecutiva' — el comportamiento de siempre.
