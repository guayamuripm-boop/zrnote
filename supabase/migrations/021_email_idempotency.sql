-- 021 — Idempotencia y estado real de entrega en los correos (v1.11)
--
-- PROBLEMA QUE RESUELVE
-- `dispatchEmailJobs` enviaba en serie y hacía UN SOLO insert en email_logs al
-- final de todo. Si la función de Vercel moría a mitad (y moría: /send-emails
-- no tenía maxDuration, así que corría con el límite por defecto de 10 s),
-- algunos correos ya habían salido pero no quedaba registro de ninguno. El
-- usuario pulsaba otra vez y los mismos destinatarios recibían duplicados.
--
-- SOLUCIÓN
-- email_logs pasa de ser un registro *a posteriori* a ser un libro mayor:
-- la fila se escribe ANTES de enviar, y `dedupe_key` (UNIQUE) hace que
-- reintentar sea seguro por construcción.
--
-- Se extiende la tabla que ya existe en vez de crear una nueva a propósito:
-- email_logs ya está conectada al export RGPD (/api/user/export) y al borrado
-- de cuenta (/api/user/delete). Una tabla nueva habría dejado direcciones de
-- correo huérfanas al borrar una cuenta — un incumplimiento del RGPD.
--
-- ADITIVA: sólo ADD COLUMN / CREATE INDEX. No borra ni reescribe datos.

-- 1. Columnas nuevas -----------------------------------------------------
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS attempts   int NOT NULL DEFAULT 0;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS subject    text;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 2. `type` admite ahora los recordatorios -------------------------------
-- reminders.ts enviaba correos que no se registraban en ninguna parte.
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_type_check;
ALTER TABLE email_logs ADD CONSTRAINT email_logs_type_check
  CHECK (type IN ('personal', 'coordinator_summary', 'reminder'));

-- 3. `status` con valores acotados ---------------------------------------
-- 'pending' = fila reservada, aún no enviada (si se queda así, la función
-- murió a mitad y hay que reintentar).
-- 'sent'    = el servidor SMTP lo aceptó. OJO: aceptado ≠ entregado. La
--             entrega real sólo se sabrá con los webhooks del ESP (v1.12).
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_status_check;
ALTER TABLE email_logs ADD CONSTRAINT email_logs_status_check
  CHECK (status IS NULL OR status IN ('pending', 'sent', 'failed'));

-- 4. Rellenar created_at y dedupe_key en las filas antiguas ---------------
-- Las filas históricas no tienen clave; se les da una sintética para poder
-- crear el índice único sin colisiones.
UPDATE email_logs SET created_at = COALESCE(created_at, sent_at, now()) WHERE created_at IS NULL;
UPDATE email_logs SET dedupe_key = 'legacy:' || id::text WHERE dedupe_key IS NULL;

-- 5. La clave de idempotencia --------------------------------------------
-- Es ESTO lo que impide los duplicados. El código hace
-- `upsert(..., { onConflict: 'dedupe_key', ignoreDuplicates: true })`:
-- Postgres resuelve la carrera, no la aplicación.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_dedupe ON email_logs(dedupe_key);

-- 6. Índice para buscar los pendientes de una reunión --------------------
CREATE INDEX IF NOT EXISTS idx_email_logs_meeting_status ON email_logs(meeting_id, status);


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
-- No hace falta salvo que se vuelva al código anterior a v1.11. Las columnas
-- nuevas son ignoradas por el código viejo, así que convivir es inofensivo.
-- Si aun así hay que deshacerlo:
--
--   DROP INDEX IF EXISTS idx_email_logs_dedupe;
--   DROP INDEX IF EXISTS idx_email_logs_meeting_status;
--   ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_status_check;
--   ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_type_check;
--   ALTER TABLE email_logs ADD CONSTRAINT email_logs_type_check
--     CHECK (type IN ('personal', 'coordinator_summary'));
--   ALTER TABLE email_logs DROP COLUMN IF EXISTS dedupe_key;
--   ALTER TABLE email_logs DROP COLUMN IF EXISTS attempts;
--   ALTER TABLE email_logs DROP COLUMN IF EXISTS last_error;
--   ALTER TABLE email_logs DROP COLUMN IF EXISTS subject;
--   ALTER TABLE email_logs DROP COLUMN IF EXISTS created_at;
--
-- OJO: eso borra el historial de intentos fallidos. Los envíos en sí no se
-- pierden (siguen las filas), pero sí el porqué de los fallos.
