-- 035 — Modo Contenido (podcasts, conferencias, videos), opcional por usuario
--
-- QUÉ RESUELVE
-- El estilo "Contenido" resume grabaciones que no son reuniones —un podcast,
-- una conferencia, un video— y las divide en capítulos cronológicos con su
-- hora. No es para todo el mundo, así que no aparece en el selector hasta que
-- la persona lo activa en su perfil.
--
-- POR QUÉ UNA COLUMNA BOOLEANA Y NO UNA LISTA DE ESTILOS
-- Hoy hay un único estilo opcional. Si mañana hay varios, se cambia entonces:
-- una lista en base de datos que nadie usa es complejidad prematura.
-- El estilo en sí (`meetings.minute_style = 'contenido'`) NO necesita
-- migración: la lista de estilos vive en código (ver 025_minute_style.sql).
-- Los capítulos viajan en `minutes.raw_llm_output`, que ya existe.
--
-- ADITIVA: sólo ADD COLUMN IF NOT EXISTS.

ALTER TABLE users ADD COLUMN IF NOT EXISTS content_mode_enabled boolean NOT NULL DEFAULT false;


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   ALTER TABLE users DROP COLUMN IF EXISTS content_mode_enabled;
--
-- Sin riesgo: el código nuevo trata la ausencia de la columna como "no
-- activado" (el estilo Contenido deja de ofrecerse y cae a 'ejecutiva').
