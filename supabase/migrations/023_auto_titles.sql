-- 023 — Título generado por IA para las reuniones de "Grabar ahora"
--
-- QUÉ RESUELVE
-- "Grabar ahora" crea la reunión antes de que exista audio, así que el único
-- título posible en ese momento es la fecha y hora: "Grabación 5 ago 14:30".
-- Con diez reuniones así, la lista es indistinguible. Ahora que analyzeMeeting
-- ya lee la transcripción entera para redactar la minuta, le pedimos también un
-- título — y se lo pedimos SOLO cuando el título de partida era ese genérico
-- automático, nunca cuando la persona escribió uno a propósito.
--
-- `title_is_auto` es esa marca: se pone a TRUE al crear por "Grabar ahora" y
-- se apaga en cuanto el título deja de ser el genérico automático — al
-- aplicarse el título de la IA, o si el usuario lo edita a mano antes de que
-- termine de procesarse. Así nunca se pisa un título puesto a propósito.
--
-- ADITIVA: sólo ADD COLUMN IF NOT EXISTS.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS title_is_auto boolean NOT NULL DEFAULT false;


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   ALTER TABLE meetings DROP COLUMN IF EXISTS title_is_auto;
--
-- Sin riesgo: el código antiguo no la usa, y el código nuevo simplemente deja
-- de retitular si la columna desaparece (fallará el UPDATE de forma aislada,
-- sin afectar al resto del análisis — ver analyzeMeeting en processing.ts).
