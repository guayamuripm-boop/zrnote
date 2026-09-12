-- 029 — Retención de reuniones: 7 días de audio, 30 días de reunión salvo que
-- se guarde
--
-- QUÉ CAMBIA
-- El audio pasa de borrarse a los 30 días a los 7 (ver AUDIO_RETENTION_DAYS en
-- src/app/api/cron/retention/route.ts). Es la palanca más directa contra la
-- cuota de almacenamiento gratuita de Supabase, que el 12 sep 2026 estaba en
-- 1,19 GB sobre 1 GB.
--
-- Y se añade una segunda: una reunión que NADIE marca como "guardada" se
-- elimina por completo — transcripción, minuta, compromisos, todo — a los 30
-- días de creada. Antes una reunión vivía para siempre por defecto, así que el
-- volumen sólo podía crecer. Marcar "Guardar" la excluye de esa limpieza sin
-- fecha de caducidad.
--
-- GRANDFATHERING — esto es lo importante de esta migración
-- Ninguna reunión que exista HOY se ve afectada por la política nueva: la
-- columna se añade con DEFAULT false, pero el UPDATE de abajo pone `kept =
-- true` en todo lo que ya hay en la tabla en el momento de aplicar esto. Sólo
-- las reuniones creadas DESPUÉS de este despliegue empiezan sin guardar y
-- entran en la cuenta de 30 días. Sin este paso, aplicar la migración habría
-- sido indistinguible de borrar el trabajo de todo el que ya usa la app.
--
-- Antes de borrar nada se avisa por correo (ver meeting-lifecycle.ts): a los
-- 27 días de creada, si sigue sin guardar, se manda un aviso. Guardarla en ese
-- momento cancela la eliminación sin más.
--
-- ADITIVA: sólo ADD COLUMN y un ensanchado de un CHECK existente.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS kept boolean NOT NULL DEFAULT false;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS deletion_warned_at timestamptz;

-- El grandfathering. Sin condición a propósito: en el momento en que esto se
-- ejecuta, "todo lo que hay en la tabla" es exactamente "todo lo que existía
-- antes de la política nueva".
UPDATE meetings SET kept = true WHERE kept = false;

-- 'deletion_warning' es el tercer tipo de correo automático (junto a
-- 'reminder' de la migración 021): el aviso de que una reunión sin guardar
-- está a unos días de eliminarse.
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_type_check;
ALTER TABLE email_logs ADD CONSTRAINT email_logs_type_check
  CHECK (type IN ('personal', 'coordinator_summary', 'reminder', 'deletion_warning'));


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   ALTER TABLE meetings DROP COLUMN IF EXISTS kept;
--   ALTER TABLE meetings DROP COLUMN IF EXISTS deletion_warned_at;
--   ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_type_check;
--   ALTER TABLE email_logs ADD CONSTRAINT email_logs_type_check
--     CHECK (type IN ('personal', 'coordinator_summary', 'reminder'));
--
-- Sin riesgo de pérdida de datos propia: quitar `kept` sólo desactiva la
-- limpieza por antigüedad de reuniones (el código detecta que la columna no
-- está y se salta ese paso), no borra nada por sí sola.
