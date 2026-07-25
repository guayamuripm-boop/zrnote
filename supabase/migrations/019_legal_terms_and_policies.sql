-- Migration 019: Agregar tabla de términos legales, políticas y permisos de usuario
-- Para compliance RGPD, TOS, Privacy Policy

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL, -- 'terms_of_service', 'privacy_policy', 'data_processing_agreement', 'cookie_policy'
  version text NOT NULL, -- e.g., '1.0', '1.1'
  content text NOT NULL, -- HTML content of the document
  effective_date timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT valid_doc_type CHECK (doc_type IN (
    'terms_of_service',
    'privacy_policy',
    'data_processing_agreement',
    'cookie_policy',
    'user_rights',
    'fair_use_policy'
  )),
  CONSTRAINT unique_doc_version UNIQUE(doc_type, version)
);

-- Tabla para rastrear consentimiento del usuario
CREATE TABLE IF NOT EXISTS public.user_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  doc_version text NOT NULL,
  agreed_at timestamp with time zone DEFAULT now(),
  ip_address text,
  user_agent text,

  CONSTRAINT user_doc_consent_unique UNIQUE(user_id, doc_type)
);

-- RLS Policies
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consent_log ENABLE ROW LEVEL SECURITY;

-- Legal documents: readable by all (authenticated)
CREATE POLICY "legal_documents_read" ON public.legal_documents
  FOR SELECT USING (true);

-- User consent: users can see their own, service_role can write
CREATE POLICY "user_consent_read" ON public.user_consent_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_consent_insert" ON public.user_consent_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_legal_documents_type_date
  ON public.legal_documents(doc_type, effective_date DESC);

CREATE INDEX idx_user_consent_user
  ON public.user_consent_log(user_id, doc_type);

-- Initial data: Términos de Servicio (2026-07-25)
INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
VALUES (
  'terms_of_service',
  '1.0',
  E'<h1>Términos de Servicio - ZRNote</h1>
<p><strong>Última actualización: 25 de julio de 2026</strong></p>

<h2>1. Aceptación de Términos</h2>
<p>Al acceder y utilizar ZRNote, aceptas estar vinculado por estos Términos de Servicio. Si no estás de acuerdo, no uses la plataforma.</p>

<h2>2. Descripción del Servicio</h2>
<p>ZRNote es una herramienta SaaS para grabación, transcripción y generación de minutas de reuniones utilizando:</p>
<ul>
  <li>Grabación de audio via navegador o extensión Chrome</li>
  <li>Transcripción mediante Groq Whisper (IA)</li>
  <li>Análisis y generación de minutas con Gemini/Groq LLM</li>
  <li>Almacenamiento en Supabase (PostgreSQL + Storage)</li>
  <li>Búsqueda vectorial con pgvector</li>
</ul>

<h2>3. Limitaciones de Uso</h2>
<h3>Free Tier (100% del servicio actual):</h3>
<ul>
  <li>10 reuniones/mes (ajustable por organización)</li>
  <li>Groq API: 14,400 requests/día (free tier)</li>
  <li>Supabase: 500MB DB + 1GB Storage</li>
  <li>Transcripción: ilimitada (sujeta a cuota Groq)</li>
  <li>Sin garantía de SLA</li>
</ul>

<h3>Prohibiciones:</h3>
<ul>
  <li>NO grabar sin consentimiento de los participantes</li>
  <li>NO compartir grabaciones/minutas sin autorización</li>
  <li>NO usar para fines ilegales o discriminatorios</li>
  <li>NO intentar acceder a otros usuarios'' datos (RLS protege esto)</li>
  <li>NO realizar scraping o automatización excesiva</li>
  <li>NO distribuir grabaciones terceros sin permiso escrito</li>
</ul>

<h2>4. Consentimiento de Grabación</h2>
<p><strong>IMPORTANTE</strong>: Eres responsable de obtener consentimiento informado de todos los participantes antes de grabar. Las leyes de grabación varían por jurisdicción. En algunas regiones:</p>
<ul>
  <li><strong>Consentimiento Bilateral</strong> (USA, muchos países): Todos deben saber que se graba</li>
  <li><strong>Consentimiento Unilateral</strong> (algunos estados USA): Solo el grabador debe conocerlo</li>
  <li><strong>Prohibiciones</strong> (GDPR, algunos países): Requiere consentimiento explícito escrito</li>
</ul>
<p><strong>ZRNote no es responsable de violaciones de leyes de grabación locales. El usuario es responsable legal.</strong></p>

<h2>5. Privacidad y Datos</h2>
<p>Ver Política de Privacidad para detalles. Resumido:</p>
<ul>
  <li>Tus datos están en Supabase (Irlanda, GDPR compliant)</li>
  <li>Groq procesa audio en transcripción (no lo almacena)</li>
  <li>Gemini/Groq LLM procesa transcripciones (ver políticas de retención de IA)</li>
  <li>RLS (Row-Level Security) aísla datos por organización</li>
  <li>Puedes exportar/eliminar datos via API GDPR</li>
</ul>

<h2>6. Limitación de Responsabilidad</h2>
<p>ZRNOTE SE PROPORCIONA "COMO ESTÁ". NO GARANTIZAMOS:</p>
<ul>
  <li>Disponibilidad 24/7 (Free tier, sin SLA)</li>
  <li>Precisión de transcripciones (LLM puede errar)</li>
  <li>Seguridad contra todos los ataques</li>
  <li>Recuperación de datos eliminados</li>
</ul>
<p><strong>Máxima responsabilidad: Monto pagado en los últimos 30 días (en free tier: $0)</strong></p>

<h2>7. Propiedad Intelectual</h2>
<ul>
  <li>Eres dueño de tus grabaciones, minutas y datos</li>
  <li>ZRNote puede usar datos agregados/anonimizados para mejorar el servicio</li>
  <li>No vendemos datos personales de usuarios</li>
</ul>

<h2>8. Cambios a los Términos</h2>
<p>Podemos cambiar estos términos en cualquier momento. Los cambios son efectivos cuando se publican. Uso continuado = aceptación.</p>

<h2>9. Contacto</h2>
<p>Preguntas: zriagnosis@gmail.com</p>',
  now()
);

-- Privacy Policy
INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
VALUES (
  'privacy_policy',
  '1.0',
  E'<h1>Política de Privacidad - ZRNote</h1>
<p><strong>Última actualización: 25 de julio de 2026</strong></p>

<h2>1. Información que Recopilamos</h2>
<h3>Directamente de ti:</h3>
<ul>
  <li>Email, nombre, contraseña (autenticación)</li>
  <li>Grabaciones de audio (subidas por ti)</li>
  <li>Metadatos de reuniones (título, participantes, fechas)</li>
</ul>

<h3>Automáticamente:</h3>
<ul>
  <li>IP, User-Agent, cookies de sesión</li>
  <li>Eventos de uso (crear reunión, procesar, descargar)</li>
  <li>Errores y logs de sistema (con PII redactada)</li>
</ul>

<h2>2. Cómo Usamos Tus Datos</h2>
<ul>
  <li><strong>Servicio</strong>: Grabar, transcribir, almacenar, buscar</li>
  <li><strong>Mejora</strong>: Agregado/anonimizado para entrenar modelos (opt-out disponible)</li>
  <li><strong>Legal</strong>: Cumplir leyes, responder solicitudes gubernamentales con orden judicial</li>
  <li><strong>Seguridad</strong>: Detectar fraude, abuso, ataques</li>
</ul>

<h2>3. Con Quién Compartimos</h2>
<ul>
  <li><strong>Groq</strong>: Audio para transcripción (no almacenado)</li>
  <li><strong>Gemini/Anthropic</strong>: Transcripción para análisis (según política de IA)</li>
  <li><strong>Supabase</strong>: Almacenamiento (Irlanda, GDPR)</li>
  <li><strong>Vercel</strong>: Hosting (USA, Privacy Shield/SCCs)</li>
  <li><strong>NO VENDEMOS A TERCEROS</strong></li>
</ul>

<h2>4. Tus Derechos (GDPR/CCPA)</h2>
<ul>
  <li>Acceso: Descargar tus datos (GET /api/user/export)</li>
  <li>Rectificación: Cambiar email/nombre en perfil</li>
  <li>Eliminación: Borrar cuenta + datos (POST /api/user/delete)</li>
  <li>Portabilidad: Exportar en formato estándar</li>
  <li>Objeción: Opt-out de análisis/ML</li>
</ul>

<h2>5. Retención de Datos</h2>
<ul>
  <li><strong>Grabaciones/Minutas</strong>: Hasta que elimines o cuenta se cierre</li>
  <li><strong>Logs de Actividad</strong>: 30 días</li>
  <li><strong>Cookies</strong>: 30 días (sesión)</li>
  <li><strong>Backups</strong>: Pueden retener datos 30 días post-eliminación</li>
</ul>

<h2>6. Seguridad</h2>
<ul>
  <li>HTTPS para toda comunicación</li>
  <li>Contraseñas hasheadas (Supabase Auth)</li>
  <li>RLS (Row-Level Security) aísla datos por org</li>
  <li>Sin logging de contenido sensible</li>
</ul>

<h2>7. Transferencias Internacionales</h2>
<p>Tus datos se almacenan en Irlanda (Supabase) / USA (Vercel). Usamos Standard Contractual Clauses (SCCs) para cumplir GDPR.</p>

<h2>8. Cambios a Esta Política</h2>
<p>Actualizaciones se notificarán por email. Continuidad = aceptación.</p>

<h2>9. Contacto</h2>
<p>DPO/Privacy: zriagnosis@gmail.com</p>',
  now()
);

-- Cookie Policy
INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
VALUES (
  'cookie_policy',
  '1.0',
  E'<h1>Política de Cookies - ZRNote</h1>
<p><strong>Última actualización: 25 de julio de 2026</strong></p>

<h2>Cookies que Usamos</h2>

<table border="1" cellpadding="10">
  <tr>
    <th>Cookie</th>
    <th>Propósito</th>
    <th>Duración</th>
    <th>Tipo</th>
  </tr>
  <tr>
    <td>sb-auth-token</td>
    <td>Autenticación (Supabase)</td>
    <td>30 días</td>
    <td>Esencial</td>
  </tr>
  <tr>
    <td>sb-refresh-token</td>
    <td>Renovar sesión</td>
    <td>1 año</td>
    <td>Esencial</td>
  </tr>
  <tr>
    <td>theme-preference</td>
    <td>Guardar tema (claro/oscuro)</td>
    <td>1 año</td>
    <td>Preferencia</td>
  </tr>
</table>

<h2>Consentimiento</h2>
<p>Solo cookies esenciales se usan sin consentimiento. Cookies de preferencia requieren opt-in.</p>',
  now()
);

COMMIT;
