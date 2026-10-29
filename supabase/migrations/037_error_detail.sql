-- 037 — Motivo técnico del fallo, aparte del mensaje que ve el usuario
--
-- QUÉ RESUELVE
-- `error_message` pasó a guardar el mensaje AMABLE que ve el cliente ("el
-- servicio está ocupado, reintenta"), sin tecnicismos. El motivo técnico real
-- (proveedor, código HTTP, cuerpo de la API) solo quedaba en los logs de
-- Vercel: difícil de filtrar por usuario y se borra a los pocos días.
--
-- Esta columna guarda ese detalle técnico junto a la reunión, para poder verlo
-- nosotros en el panel oculto de administración (/dashboard/admin) y saber qué
-- le pasó a cada persona y cómo actuar. NO se muestra nunca al cliente.
--
-- ADITIVA: sólo ADD COLUMN IF NOT EXISTS.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS error_detail text;


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   ALTER TABLE meetings DROP COLUMN IF EXISTS error_detail;
--
-- Sin riesgo: es una columna informativa. El código antiguo no la usa; el
-- nuevo, si desaparece, simplemente no guarda el detalle (el insert la omite
-- cuando viene vacía) y el panel la muestra como "sin detalle".
