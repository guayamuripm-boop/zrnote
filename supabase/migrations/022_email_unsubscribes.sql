-- 022 — Lista de bajas de correo (v1.12)
--
-- QUÉ RESUELVE
-- Los correos de minuta llevaban una cabecera `List-Unsubscribe` con un
-- `mailto:` al organizador, porque no había dónde registrar una baja. Ahora que
-- existen los enlaces firmados podemos ofrecer baja de un clic (RFC 8058), que
-- es lo que Gmail y Yahoo premian de verdad en la puntuación de remitente.
--
-- Sin esta tabla no se puede honrar una baja, y prometer en una cabecera algo
-- que no se cumple penaliza más que no ofrecerlo.
--
-- ADITIVA: sólo CREATE ... IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS email_unsubscribes (
  email      text PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  -- 'one-click' (cliente de correo), 'pagina' (botón en /baja/...)
  source     text,
  -- De qué reunión venía el enlace. Informativo: la baja es GLOBAL, no por
  -- reunión. Alguien que no quiere recibir minutas no quiere recibir ninguna.
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL
);

ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- Sólo el service role. El endpoint de baja es público (lo abre el cliente de
-- correo del destinatario, sin sesión), así que usa el cliente admin tras
-- verificar la firma del token. Ningún usuario autenticado debe poder leer
-- quién se ha dado de baja: es una lista de correos de terceros.
DROP POLICY IF EXISTS "email_unsubscribes_service_role" ON email_unsubscribes;
CREATE POLICY "email_unsubscribes_service_role" ON email_unsubscribes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_created ON email_unsubscribes(created_at);


-- ========================================================================
-- DECISIÓN DE RGPD: la baja SOBREVIVE al borrado de cuenta
-- ========================================================================
-- `/api/user/delete` borra las filas de email_logs del usuario, pero NO borra
-- su fila de esta tabla. Es deliberado y puede parecer contradictorio, así que
-- queda escrito:
--
-- Si al borrar la cuenta borráramos también la baja, esa persona volvería a
-- recibir correos en cuanto alguien la añadiera a una reunión. Es decir,
-- ejercer el derecho de supresión reactivaría un consentimiento que había
-- retirado expresamente. Mantener una lista de supresión mínima es la práctica
-- correcta y está reconocida: se conserva el dato ESTRICTAMENTE necesario
-- (la dirección) con el único fin de no volver a escribirle.
--
-- La fila sí aparece en `/api/user/export` (derecho de acceso), y quien quiera
-- volver a recibir correos sólo tiene que pedir que se borre su fila.


-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   DROP TABLE IF EXISTS email_unsubscribes;
--
-- OJO: eso borra las bajas. Quien se hubiera dado de baja volvería a recibir
-- correos, que es exactamente lo que no debe pasar. Si hay que revertir el
-- código, deja la tabla: el código antiguo simplemente la ignora.
