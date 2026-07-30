-- Migration 020 — MVP hardening + legal v2
--
-- Idempotent by design: safe to run more than once, and safe to run whether or
-- not migration 019 was ever applied (019 was NOT idempotent — its CREATE POLICY
-- / CREATE INDEX / INSERT statements fail on a second run, which left several
-- projects half-migrated).
--
-- Run in: Supabase → SQL Editor → paste → Run.

-- ---------------------------------------------------------------------------
-- 1. meetings: real failure reason + recording-consent audit trail
-- ---------------------------------------------------------------------------

-- Until now a failed pipeline wrote its error into `transcript_raw`, destroying
-- the transcript and making a retry impossible. Failures get their own column.
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS error_message text;

-- Recording consent is the single biggest legal risk of this product: in most
-- of Latin America and the EU, recording a conversation without the consent of
-- every participant is a criminal offence, not just a civil one. We record WHO
-- confirmed they obtained it and WHEN, so there is an audit trail.
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recording_consent_at timestamptz;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recording_consent_by uuid;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS segments_transcribed_offset int DEFAULT 0;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Legal documents + consent log (supersedes 019, idempotent)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,
  version text NOT NULL,
  content text NOT NULL,
  effective_date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_doc_version UNIQUE (doc_type, version)
);

CREATE TABLE IF NOT EXISTS public.user_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  doc_version text NOT NULL,
  agreed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text,
  CONSTRAINT user_doc_consent_unique UNIQUE (user_id, doc_type)
);

-- 019 pinned doc_type to a closed list; widen it and keep it re-runnable.
ALTER TABLE public.legal_documents DROP CONSTRAINT IF EXISTS valid_doc_type;
ALTER TABLE public.legal_documents ADD CONSTRAINT valid_doc_type CHECK (doc_type IN (
  'terms_of_service',
  'privacy_policy',
  'cookie_policy',
  'recording_consent',
  'data_processing_agreement',
  'user_rights',
  'fair_use_policy'
));

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_documents_read" ON public.legal_documents;
CREATE POLICY "legal_documents_read" ON public.legal_documents
  FOR SELECT USING (true);

-- Only the service role may write legal documents (they are contract terms —
-- no end user should ever be able to rewrite what they agreed to).
DROP POLICY IF EXISTS "legal_documents_write" ON public.legal_documents;
CREATE POLICY "legal_documents_write" ON public.legal_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "user_consent_read" ON public.user_consent_log;
CREATE POLICY "user_consent_read" ON public.user_consent_log
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_consent_insert" ON public.user_consent_log;
CREATE POLICY "user_consent_insert" ON public.user_consent_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- The consent endpoint upserts (re-accepting a new version), which needs UPDATE.
DROP POLICY IF EXISTS "user_consent_update" ON public.user_consent_log;
CREATE POLICY "user_consent_update" ON public.user_consent_log
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_legal_documents_type_date
  ON public.legal_documents (doc_type, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_consent_user
  ON public.user_consent_log (user_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting_status
  ON public.action_items (meeting_id, status);
CREATE INDEX IF NOT EXISTS idx_action_items_assignee_email
  ON public.action_items (lower(assignee_email));

-- ---------------------------------------------------------------------------
-- 3. Legal content v2 — plain Spanish, multi-country, beta framing
-- ---------------------------------------------------------------------------
-- Deliberately written as CLEAR WARNINGS rather than as a lawyer-drafted
-- contract: this is a pilot. Before charging money or opening it to the public,
-- these must be reviewed by a lawyer in each country of operation.

INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
VALUES (
  'terms_of_service',
  '2.0',
  E'<h1>Condiciones de uso de ZRNote</h1>
<p><strong>Versión 2.0 — Julio 2026 · Software en fase de prueba (beta)</strong></p>

<div class="callout callout-warn">
<p><strong>Lee esto antes de grabar cualquier cosa.</strong> ZRNote graba voz de personas reales. Quien decide grabar eres tú, y la responsabilidad legal de esa decisión es tuya, no de ZRNote.</p>
</div>

<h2>1. Qué es ZRNote</h2>
<p>ZRNote es una herramienta que graba o recibe el audio de una reunión, lo transcribe con inteligencia artificial y redacta una minuta con los compromisos acordados. Está en <strong>fase de prueba</strong>: puede fallar, perder información o dejar de estar disponible sin aviso.</p>

<h2>2. Consentimiento para grabar — lo más importante</h2>
<p>Antes de iniciar una grabación o subir un audio, <strong>estás obligado a</strong>:</p>
<ul>
  <li>Avisar en voz alta y de forma clara a <strong>todas</strong> las personas presentes que la reunión se va a grabar.</li>
  <li>Obtener el consentimiento de <strong>todas</strong> ellas, y detener la grabación si alguna se opone.</li>
  <li>Explicarles para qué se usará el audio (transcribirlo y generar una minuta con IA).</li>
</ul>
<p>En muchos países grabar una conversación sin el consentimiento de todos los participantes es un <strong>delito penal</strong>, no una simple falta. En Venezuela, la Ley sobre Protección a la Privacidad de las Comunicaciones prevé prisión de tres a cinco años para quien grabe una comunicación sin autorización, y la jurisprudencia ha rechazado grabaciones como prueba precisamente por falta de consentimiento expreso. Reglas parecidas existen en España, la Unión Europea, México, Colombia, Argentina y varios estados de EE. UU.</p>
<p><strong>ZRNote no verifica ni puede verificar que hayas obtenido ese consentimiento.</strong> Cada vez que grabas, marcas una casilla confirmándolo, y esa confirmación queda registrada con tu usuario y la fecha. Si grabas sin consentimiento, respondes tú.</p>

<h2>3. Lo que NO puedes hacer</h2>
<ul>
  <li>Grabar a personas sin su conocimiento y consentimiento.</li>
  <li>Grabar conversaciones ajenas en las que no participas.</li>
  <li>Usar ZRNote para vigilar empleados, extorsionar, chantajear o para cualquier fin ilegal.</li>
  <li>Subir audio sobre el que no tienes derechos, o que contenga datos sensibles de terceros (salud, datos de menores, información judicial) sin base legal para tratarlos.</li>
  <li>Difundir minutas o grabaciones fuera del grupo de personas que participó, sin permiso.</li>
  <li>Intentar acceder a datos de otras cuentas u organizaciones.</li>
</ul>
<p>Podemos suspender cualquier cuenta que incumpla lo anterior, sin aviso previo.</p>

<h2>4. La minuta la genera una IA: revísala</h2>
<p>La transcripción y la minuta las produce un modelo de lenguaje automático. Puede:</p>
<ul>
  <li>entender mal palabras, nombres, cifras y fechas;</li>
  <li>atribuir una frase a la persona equivocada;</li>
  <li>omitir acuerdos o inventar detalles que nadie dijo.</li>
</ul>
<p><strong>La minuta es un borrador de apoyo, no un acta oficial ni un documento con valor probatorio.</strong> Antes de usarla para tomar decisiones, firmarla o enviarla fuera del equipo, léela y corrígela. Quien la comparte se hace responsable de su contenido.</p>

<h2>5. Sin garantías y sin responsabilidad</h2>
<p>ZRNote se ofrece <strong>"tal cual", gratis y sin ninguna garantía</strong>. No garantizamos disponibilidad, exactitud, conservación de tus datos ni resultados de ningún tipo. No hay acuerdo de nivel de servicio.</p>
<p>Hasta el máximo que permita la ley aplicable, quien desarrolla y opera ZRNote <strong>no responde</strong> por: pérdida de grabaciones o minutas, errores de transcripción, decisiones tomadas a partir de una minuta, interrupciones del servicio, ni por daños directos, indirectos, lucro cesante o daño reputacional derivados del uso de la herramienta. Tampoco responde por el uso que tú hagas de ella frente a terceros: si grabas sin permiso o difundes una minuta indebidamente, esa responsabilidad es exclusivamente tuya y te comprometes a mantenernos indemnes frente a reclamaciones de terceros por ese motivo.</p>

<h2>6. Servicios de terceros</h2>
<p>Para funcionar, ZRNote envía tu audio y tu transcripción a proveedores externos. Están enumerados en el <a href="/legal/privacy">Aviso de Privacidad</a>. Al usar ZRNote aceptas ese envío. Si no estás de acuerdo, no uses la herramienta.</p>

<h2>7. Tus datos son tuyos</h2>
<p>Las grabaciones, transcripciones y minutas te pertenecen. Puedes exportarlas o borrar tu cuenta y todo su contenido en cualquier momento desde tu perfil. No vendemos datos personales ni los cedemos con fines publicitarios.</p>

<h2>8. Edad mínima</h2>
<p>Debes ser mayor de edad en tu país para usar ZRNote.</p>

<h2>9. Cambios</h2>
<p>Podemos actualizar estas condiciones. Si el cambio es relevante, se te pedirá aceptarlas de nuevo al entrar. Seguir usando ZRNote después de un cambio significa que lo aceptas.</p>

<h2>10. Contacto</h2>
<p>Dudas, reclamos o solicitudes sobre tus datos: <a href="mailto:zr.coordinacion.tecnologia@gmail.com">zr.coordinacion.tecnologia@gmail.com</a></p>

<p class="legal-note">Este texto está escrito en lenguaje sencillo para que se entienda, y refleja cómo funciona la herramienta hoy. No sustituye la asesoría de un abogado. Antes de ofrecer ZRNote a clientes externos o cobrar por él, conviene que un profesional revise y adapte estas condiciones a cada país donde se use.</p>',
  now()
)
ON CONFLICT (doc_type, version) DO UPDATE
  SET content = EXCLUDED.content, updated_at = now();

INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
VALUES (
  'privacy_policy',
  '2.0',
  E'<h1>Aviso de Privacidad de ZRNote</h1>
<p><strong>Versión 2.0 — Julio 2026 · Software en fase de prueba (beta)</strong></p>

<h2>1. Qué datos guardamos</h2>
<ul>
  <li><strong>De tu cuenta:</strong> nombre, correo electrónico y una contraseña cifrada.</li>
  <li><strong>De tus reuniones:</strong> título, fecha, participantes que registres (nombre y correo), el audio grabado o subido, la transcripción y la minuta generada.</li>
  <li><strong>Técnicos:</strong> dirección IP y navegador cuando aceptas las condiciones (para dejar constancia), registros de errores y registro de correos enviados.</li>
</ul>
<p>El contenido del audio lo defines tú. <strong>No subas conversaciones con datos sensibles</strong> (salud, información de menores, datos judiciales, datos financieros de terceros) salvo que tengas base legal para tratarlos.</p>

<h2>2. Para qué los usamos</h2>
<p>Únicamente para prestar el servicio: transcribir el audio, generar la minuta, enviarla por correo a los participantes que tú indiques y mostrártela dentro de la aplicación. No usamos tus grabaciones ni tus minutas para entrenar modelos de inteligencia artificial, ni las vendemos, ni las cedemos con fines publicitarios.</p>

<h2>3. Con quién se comparten (encargados del tratamiento)</h2>
<table>
  <tr><th>Proveedor</th><th>Qué recibe</th><th>Para qué</th><th>Dónde</th></tr>
  <tr><td>Groq</td><td>Fragmentos de audio</td><td>Transcripción (Whisper)</td><td>EE. UU.</td></tr>
  <tr><td>Google (Gemini)</td><td>Texto de la transcripción</td><td>Redacción de la minuta</td><td>EE. UU.</td></tr>
  <tr><td>Supabase</td><td>Base de datos y archivos de audio</td><td>Almacenamiento y autenticación</td><td>Según la región del proyecto</td></tr>
  <tr><td>Vercel</td><td>Tráfico de la aplicación</td><td>Alojamiento web</td><td>EE. UU.</td></tr>
  <tr><td>Gmail (Google)</td><td>Correo, nombre y minuta</td><td>Envío de los correos con la minuta</td><td>EE. UU.</td></tr>
</table>
<p>Esto implica que tu audio y tu transcripción <strong>salen del país</strong> y se procesan en servidores de terceros. Debes informarlo a los participantes antes de grabar. Cada proveedor aplica sus propias condiciones de retención; no controlamos sus sistemas internos.</p>

<h2>4. Cuánto tiempo se conserva</h2>
<ul>
  <li><strong>Audio: se borra automáticamente a los 30 días.</strong> Es el dato más sensible y el que menos falta hace una vez generada la minuta.</li>
  <li><strong>Transcripción y minuta:</strong> se conservan hasta que tú borres la reunión o la cuenta.</li>
  <li><strong>Registro de correos enviados y de consentimiento:</strong> mientras exista la cuenta.</li>
  <li>Al borrar tu cuenta se elimina todo lo anterior, incluidos los archivos de audio y los índices de búsqueda.</li>
</ul>

<h2>5. Tus derechos</h2>
<p>Puedes en cualquier momento, desde <em>Mi Perfil</em>:</p>
<ul>
  <li><strong>Acceder y portar:</strong> descargar todos tus datos en un archivo JSON.</li>
  <li><strong>Rectificar:</strong> editar reuniones, participantes y compromisos.</li>
  <li><strong>Suprimir:</strong> borrar una reunión concreta, o tu cuenta completa con todo su contenido.</li>
</ul>
<p>Si una persona que aparece en una grabación quiere ejercer sus derechos, escríbenos y borraremos la reunión correspondiente.</p>

<h2>6. Seguridad</h2>
<ul>
  <li>Todo el tráfico va cifrado (HTTPS).</li>
  <li>Las contraseñas se guardan cifradas; nadie del equipo puede leerlas.</li>
  <li>La base de datos aplica aislamiento por fila: cada usuario solo puede leer sus propias reuniones.</li>
  <li>Los archivos de audio no son públicos: se sirven mediante enlaces firmados y temporales.</li>
</ul>
<p>Ningún sistema es infalible. Al tratarse de software en fase de prueba, evita subir información cuya filtración te causaría un daño grave.</p>

<h2>7. Cookies</h2>
<p>Solo se usan cookies necesarias para mantener tu sesión iniciada y recordar si prefieres el tema claro u oscuro. No hay cookies de publicidad ni de seguimiento de terceros.</p>

<h2>8. Contacto</h2>
<p>Para cualquier solicitud sobre tus datos: <a href="mailto:zr.coordinacion.tecnologia@gmail.com">zr.coordinacion.tecnologia@gmail.com</a>. Respondemos en un plazo razonable.</p>

<p class="legal-note">Documento redactado en lenguaje claro para una fase piloto. Si ZRNote se abre a usuarios de la Unión Europea o se comercializa, hará falta un aviso de privacidad formal con responsable identificado, base jurídica del tratamiento y contratos de encargo con cada proveedor.</p>',
  now()
)
ON CONFLICT (doc_type, version) DO UPDATE
  SET content = EXCLUDED.content, updated_at = now();

INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
VALUES (
  'cookie_policy',
  '2.0',
  E'<h1>Cookies en ZRNote</h1>
<p><strong>Versión 2.0 — Julio 2026</strong></p>
<p>ZRNote usa el mínimo indispensable. No hay analítica, ni publicidad, ni rastreadores de terceros, así que no verás un banner pidiéndote permiso: todo lo que guardamos es estrictamente necesario para que la aplicación funcione.</p>
<table>
  <tr><th>Nombre</th><th>Para qué sirve</th><th>Duración</th><th>Tipo</th></tr>
  <tr><td>sb-*-auth-token</td><td>Mantener tu sesión iniciada</td><td>Hasta cerrar sesión</td><td>Necesaria</td></tr>
  <tr><td>theme</td><td>Recordar si prefieres tema claro u oscuro</td><td>1 año</td><td>Preferencia</td></tr>
</table>
<p>Si borras las cookies del navegador, simplemente tendrás que iniciar sesión de nuevo.</p>',
  now()
)
ON CONFLICT (doc_type, version) DO UPDATE
  SET content = EXCLUDED.content, updated_at = now();

INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
VALUES (
  'recording_consent',
  '2.0',
  E'<h1>Antes de grabar: consentimiento de los participantes</h1>
<p>Esta es la parte que puede meterte en un problema legal serio. Léela una vez y ya.</p>

<h2>La regla práctica</h2>
<p><strong>Avisa en voz alta, al empezar, que estás grabando. Espera a que todos digan que sí. Si alguien dice que no, no grabes.</strong> Si haces eso, estás cubierto en casi cualquier país.</p>

<h2>Por qué importa tanto</h2>
<p>En Venezuela, grabar una comunicación privada sin autorización puede castigarse con <strong>prisión de tres a cinco años</strong>, y difundir su contenido tiene la misma pena. Los tribunales han rechazado grabaciones como prueba justamente porque no constaba el consentimiento expreso de los presentes. En España y la Unión Europea el RGPD exige informar previamente; en México y Colombia las leyes de datos personales exigen consentimiento informado; en varios estados de EE. UU. rige el consentimiento de todas las partes.</p>
<p>El criterio más exigente es también el más simple: <strong>consentimiento de todos, siempre</strong>.</p>

<h2>Qué decir (te sirve tal cual)</h2>
<p class="legal-quote">«Antes de empezar: voy a grabar esta reunión para generar la minuta automáticamente con una herramienta de inteligencia artificial. El audio se procesa en servidores externos y se borra a los 30 días. ¿Están todos de acuerdo?»</p>

<h2>Además, recuerda</h2>
<ul>
  <li>Si entra alguien a mitad de la reunión, vuelve a avisar.</li>
  <li>No grabes conversaciones en las que no participas.</li>
  <li>La minuta contiene lo que se dijo: compártela solo con quienes estuvieron.</li>
  <li>Si alguien pide después que se borre la grabación, bórrala.</li>
</ul>

<p class="legal-note">ZRNote no puede comprobar si obtuviste el consentimiento. Al marcar la casilla antes de grabar, declaras que sí lo hiciste, y esa declaración queda registrada con tu usuario y la fecha.</p>',
  now()
)
ON CONFLICT (doc_type, version) DO UPDATE
  SET content = EXCLUDED.content, updated_at = now();

-- Retire the v1 placeholders so nobody is shown the old generic text.
DELETE FROM public.legal_documents WHERE version = '1.0';

-- Consent is version-scoped: everyone must accept v2 the next time they log in.
DELETE FROM public.user_consent_log WHERE doc_version <> '2.0';
