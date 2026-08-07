# ZRNote — Contexto Maestro del Proyecto
> **Fuente de verdad única.** Leer al inicio de cada sesión, actualizar al final.

---

## 🚦 ESTADO: correo endurecido, minuta pública y título por IA (v1.13.0, 2026-08-06)

Build ✅ · TypeScript ✅ · 195 tests ✅ · Next 15 + React 19 · **En producción** en
https://zrnote.vercel.app — desplegado, commit `9a692ff` (merge de
`fix/v1.11-correo-y-bugs` a `main`).

> 📘 **Los procedimientos operativos viven en [`docs/runbooks/`](docs/runbooks/README.md)**,
> uno por subsistema, cada uno con su diagnóstico y su marcha atrás.
> Empieza por [00 — Respaldo y restauración](docs/runbooks/00-respaldo-y-restauracion.md).
> La [guía de prueba v1.12](docs/runbooks/03-guia-de-prueba-v1.12.md) cubre también el título por IA (Prueba 8).

### Migraciones — las tres aplicadas en producción

| Migración | Estado |
|---|---|
| `021_email_idempotency.sql` | ✅ aplicada |
| `022_email_unsubscribes.sql` | ✅ aplicada |
| `023_auto_titles.sql` | ✅ aplicada |

Variables de entorno: **no hizo falta ninguna nueva.** `MINUTE_LINK_SECRET` es
opcional; sin ella la clave de firma se deriva de `SUPABASE_SERVICE_ROLE_KEY`.

**Comprobación de humo tras el despliegue (2026-08-06):** `/` → 200,
`/robots.txt` → 200, `/sitemap.xml` → 200, `/llms.txt` → 200, `/login` → 200,
`/minuta/token-invalido` → 200 con «enlace no válido» (falla cerrado, no 500).

**Pendiente:** las 8 pruebas de la [guía de prueba](docs/runbooks/03-guia-de-prueba-v1.12.md)
contra producción real — en particular la Prueba 1 (enlace público desde un
correo real) y la extensión de Chrome en una reunión en vivo, que sigue sin
verificarse con audio real.

**Punto de restauración:** etiqueta `v1.10.0-estable` (commit `7449c4b`),
rama `respaldo/v1.10.0-estable`, snapshot en `.backups/`. Ver
[runbook 00](docs/runbooks/00-respaldo-y-restauracion.md) para el
procedimiento completo de vuelta atrás si algo falla en producción.

### Qué cambió (v1.11 → v1.12)

- **Fuga de compromisos entre personas**: `matchItemsToParticipant` comparaba con
  `includes()`, así que Ana recibía las tareas de Mariana como suyas. Y los
  nombres con tilde no coincidían nunca.
- **Correos duplicados**: `email_logs` se escribe ahora ANTES de enviar, con
  `dedupe_key` UNIQUE.
- **`/send-emails` se cortaba a los 10 s**: faltaba en `vercel.json`.
- **La minuta se abre sin cuenta** (`/minuta/{token}` firmado). El botón «Ver en
  ZRNote» llevaba a un 404 para todo el que no fuera el organizador.
- **Baja de un clic** (RFC 8058) con `List-Unsubscribe`.
- **Aviso de cuota**: Gmail corta a los 500/día en silencio; ahora se avisa.
- Proveedor de correo tras una interfaz: cambiar a Brevo/Resend el día que haya
  dominio propio es un `case`, no una reescritura. Ver [runbook 01 §6](docs/runbooks/01-correo.md).

### Qué cambió (v1.12 → v1.13)

- **Título por IA en "Grabar ahora".** Antes se quedaba para siempre como
  "Grabación 5 ago 14:30". Ahora, al generar la minuta, se sustituye por uno
  que la IA redacta a partir de la transcripción — nunca pisa un título que la
  persona haya escrito a mano (columna `title_is_auto`, migración `023`).

Ya aplicado en producción:
- ✅ Migración `020_mvp_hardening_and_legal_v2.sql` (vía Management API).
- ✅ `CRON_SECRET` configurado (verificado: los crons responden 401 sin él).
- ✅ Código commiteado y en GitHub — repo y producción coinciden.
- ✅ Sin vulnerabilidades explotables (ver "Auditoría pre-lanzamiento").

**Pendiente y solo tú puedes hacerlo:**
1. **Rotar la clave de firma de la extensión** — `extension.pem` estuvo versionada en un repo público, así que sigue en el historial. Genera un par nuevo desde `chrome://extensions` → "Empaquetar extensión" sin indicar clave privada.
2. **Abrir `/dashboard/diagnostico`** una vez con tu sesión iniciada: comprueba en vivo las claves de Groq/Gemini, el almacenamiento y los correos. Es lo único que no puedo verificar yo (las claves son secretas).
3. **Probar la extensión en una reunión real** (reescrita, no verificada en vivo — ver `extension/README.md`).

### Cómo ejecutar SQL en producción (la conexión directa está bloqueada)
`supabase db query`/`db push` cuelgan: el host `db.*.supabase.co` no publica registro A y el CLI intenta Postgres directo. La vía que funciona es la Management API por HTTPS:
```bash
curl -X POST "https://api.supabase.com/v1/projects/qmdcpcwigzebqcoeiebi/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d '{"query":"select 1"}'
```

### Cómo probar la app localmente
`vercel env pull` **no** descarga las variables marcadas como sensibles: escribe `[SENSITIVE]` y la app da 500 en todo lo que toque Supabase. Para pruebas locales basta con la URL y la clave anónima (ambas públicas por diseño, viajan al navegador):
```
NEXT_PUBLIC_SUPABASE_URL=https://qmdcpcwigzebqcoeiebi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon, desde el panel de Supabase>
```
Eso permite verificar páginas públicas, login y middleware. Transcripción y correos requieren las claves reales.

---

## 🔴 AUDITORÍA 2026-07-30 — QUÉ ESTABA ROTO Y CÓMO SE ARREGLÓ

### Bugs que impedían que la app funcionara

| # | Síntoma para el usuario | Causa real | Arreglo |
|---|---|---|---|
| 1 | **"Reintentar" nunca funcionaba** si la minuta ya se había generado alguna vez | `minutes.meeting_id` es `UNIQUE`; `analyzeMeeting` hacía `INSERT` siempre → error de clave duplicada → la reunión se marcaba `failed`. Bucle infinito de fallos. | `analyzeMeeting` ahora borra la minuta y sus action items previos antes de insertar. Idempotente. |
| 2 | **Los correos nunca salían** en reuniones con compromisos con fecha | `generateGoogleCalendarUrl` usaba `date-fns` con el patrón `yyyyMMddTHHmmssZ`. En date-fns `T` y `Z` son *tokens*, no literales → `RangeError` en **cada** llamada, lanzado desde dentro de la construcción del email. | Reescrito sin date-fns, formateando desde los componentes UTC. Cubierto por `google-calendar.test.ts`. |
| 3 | **"Minuta no disponible"** con la minuta existiendo | `.single()` sobre `minutes` devolvía error si había 0 o 2 filas. | `.maybeSingle()` en todas las lecturas de `minutes`. |
| 4 | **Todo el proceso fallaba** si faltaba la migración de pgvector o la key de Jina | El paso `vectorize` era obligatorio en el pipeline del cliente. | Sacado del camino crítico. El pipeline es ahora **transcribir → minuta → correos**. `vectorize` sigue existiendo pero se invoca aparte y nunca marca la reunión como fallida. |
| 5 | **Fallo al procesar audios largos** en el móvil (pestaña que se cierra sola) | `decodeToMono` materializa TODO el audio como PCM: 2 h en estéreo 48 kHz ≈ 2,7 GB. | Audios de más de 15 min se cortan con FFmpeg en modo `-c copy` (sin decodificar, memoria ≈ tamaño del archivo, instantáneo). |
| 6 | **Subir audio dos veces sobreescribía la primera tanda** | La página siempre numeraba los fragmentos desde 0. | Nueva fase `begin` en `/direct-upload` que devuelve el siguiente índice libre. Los segmentos se ordenan siempre por `segment_index`. |
| 7 | **Un archivo con error bloqueaba toda la subida** sin salida | `allDone = files.every(done)` — sin reintento ni continuación parcial. | Botones separados: reintentar los fallidos, o generar la minuta con lo ya subido. |
| 8 | **Un corte de red abortaba todo el procesamiento** | El bucle del cliente devolvía error al primer `catch`. | `runMeetingPipeline` reintenta ante errores de red y espera ante 429 en lugar de rendirse. |
| 9 | **"Mis Tareas" salía vacía** para quien organizó la reunión | Solo mostraba items con `assignee_email`/`assignee_user_id`, pero la IA asigna por NOMBRE. | Ahora incluye también todos los compromisos de las reuniones que creaste, marcando cuáles son "a tu nombre". |
| 10 | Prioridades desordenadas | `.order('priority')` ordena alfabéticamente: alta, **baja**, media. | `sortActionItems()` con orden real (estado → prioridad → fecha). Cubierto por tests. |
| 11 | **No se podían añadir participantes** después de crear la reunión | "Grabar ahora" lo prometía pero no existía UI ni endpoint. | `PATCH /api/meetings/[id]` acepta `participants` + componente `MeetingParticipants`. |
| 12 | **Correos perdidos sin forma de reenviar** | Solo se enviaban dentro del pipeline. | Botón "Enviar correos" en la minuta (`ResendEmailsButton`). |
| 13 | **"La reunión falló"** sin decir por qué | El error se escribía en `transcript_raw`, **destruyendo la transcripción**. | Columna `meetings.error_message`; la UI muestra el motivo real. |
| 14 | Un compromiso con prioridad rara ("urgente") tumbaba el `INSERT` completo | `priority` tiene CHECK y `due_date` es DATE. | `normalizePriority` / `normalizeDueDate`. Cubierto por tests. |
| 15 | Fechas de vencimiento casi siempre `null` | El prompt no sabía qué día era la reunión. | Se le pasa la fecha real para resolver "el viernes". |
| 16 | Modal de términos que **dejaba fuera de la app** | El checkbox exigía llegar al final del scroll, pero un documento corto nunca dispara `scroll` → checkbox deshabilitado para siempre, con `required` = bloqueo total. | Se mide el scroll en lugar de esperar el evento; y si el documento no carga, se falla en abierto. |
| 17 | Documentos legales ilegibles | Usaban clases `prose` de `@tailwindcss/typography`, que **no está instalado**. | CSS propio `.legal-doc` en `globals.css`. |

### Vulnerabilidades corregidas

| Gravedad | Problema | Arreglo |
|---|---|---|
| 🔴 Crítica | **`/api/cron/retention` y `/api/cron/retry-stuck` sin ninguna autenticación.** Cualquiera en internet podía borrar el audio y la transcripción de todas las reuniones de más de 30 días, o poner todas las reuniones en "procesando". | `assertCron()` exige `Authorization: Bearer $CRON_SECRET`. **Falla cerrado**: sin la variable, responde 503 y no hace nada. |
| 🔴 Crítica | **`extension.pem` (clave privada de firma) versionada en un repo público de GitHub.** Permite publicar una actualización maliciosa firmada con la misma identidad. | Añadida a `.gitignore`. **La clave debe considerarse comprometida y regenerarse** (ver checklist). |
| 🟠 Alta | **El borrado de cuenta nunca borraba el audio.** Filtraba por `f.name.includes(meetingId)` sobre un listado que solo devuelve carpetas. También quedaban los embeddings (fragmentos literales de la conversación). | Se borra por `r2_key` real, en lotes, más `meeting_chunks` y `user_consent_log`. |
| 🟠 Alta | **Borrar una reunión dejaba su audio en Storage para siempre.** | `DELETE /api/meetings/[id]` borra los archivos. |
| 🟠 Alta | **XSS en los correos del pipeline.** El título de la reunión y los nombres se inyectaban sin escapar (la ruta manual sí escapaba; había dos implementaciones divergentes). | Una sola implementación en `lib/meeting-emails.ts`, con escape y adjunto `.ics`. Test de XSS. |
| 🟠 Alta | **CORS con credenciales para `meet.google.com`, `zoom.us`, `teams.microsoft.com`.** Cualquier script en esas páginas podía actuar como el usuario. | Solo `chrome-extension://` (y `localhost` fuera de producción). |
| 🟡 Media | `/api/test-storage` permitía a cualquier usuario listar el Storage y gastar cuota de Groq. | Eliminado. |
| 🟡 Media | Contraseñas de 6 caracteres. | Mínimo 8. |
| 🟡 Media | La retención borraba `transcript_raw` junto al audio, impidiendo regenerar la minuta. | Solo borra el audio, como dice el aviso de privacidad. |

### Limpieza
- Eliminado: `/api/test-storage`, `/dashboard/meetings/[id]/speakers` y `/api/meetings/[id]/speaker-map` (funciones huérfanas, sin UI ni uso en el pipeline), `LegalDisclaimer.tsx` (sin usar).
- Eliminadas las dependencias `googleapis` (~86 paquetes) y `lucide-react`: no se importaban en ninguna parte.
- Tres copias divergentes del bucle del pipeline unificadas en `lib/pipeline-client.ts`.
- Dos implementaciones de correo unificadas en `lib/meeting-emails.ts`.

---

## ⚖️ CAPA LEGAL (nueva)

Escrita como **advertencias claras en lenguaje llano**, no como contrato de abogado: ZRNote está en fase piloto. Textos en `020_mvp_hardening_and_legal_v2.sql`, editables desde SQL sin redesplegar.

**El control más importante: `RecordingConsentGate`.** Antes de grabar o subir audio hay que marcar una casilla confirmando que se informó a todos los participantes y que dieron su consentimiento. Queda registrado en `meetings.recording_consent_at` / `recording_consent_by`.

Por qué es lo primero que hay que tener bien: en Venezuela, la [Ley sobre Protección a la Privacidad de las Comunicaciones](https://www.asambleanacional.gob.ve/leyes/sancionadas/ley-sobre-proteccion-a-la-privacidad-de-las-comunicaciones) castiga con **3 a 5 años de prisión** grabar una comunicación sin autorización, y la [jurisprudencia laboral ha rechazado grabaciones como prueba](https://perezcalzadilla.com/normativas-y-jurisprudencia-relacionada-con-grabaciones-de-voz-como-medios-probatorios/) por falta de consentimiento expreso, aunque quien grabara participara en la conversación. España/UE (RGPD), México (LFPDPPP) y Colombia (Ley 1581) exigen consentimiento informado. El criterio más exigente es el más simple: **consentimiento de todos, siempre**.

Documentos publicados (`/legal`):
- `/legal/consentimiento` — guía práctica de qué decir antes de grabar.
- `/legal/terminos` — condiciones de uso, fase beta, sin garantías, responsabilidad del usuario.
- `/legal/privacidad` — qué se guarda, qué proveedor lo procesa, 30 días de retención de audio, derechos.
- `/legal/cookies` — solo cookies necesarias.

Contacto declarado: `zr.coordinacion.tecnologia@gmail.com`.

Enganches en la UI: casilla obligatoria en el registro, `TermsGate` al entrar al dashboard, enlaces en el pie del dashboard y de la landing, sección "Tus datos" en el perfil (descarga RGPD + borrado de cuenta).

**Sigue pendiente** (no es urgente en piloto, sí antes de cobrar o abrir al público): razón social y domicilio del responsable, revisión por un abogado en cada país, contratos de encargo con los proveedores, registro ante la autoridad de datos si aplica.

---

## 🔧 CÓMO FUNCIONA EL PROCESAMIENTO

```
Grabar (RecordButton)              Subir audio (upload/page.tsx)
   │ segmentos de 60s                 │ trocea por DURACIÓN real (180s/trozo)
   │ 1 segmento = 1 sesión            │ ADTS→frames · largo→FFmpeg -c copy
   │ completa de MediaRecorder        │ medio→WAV 16k mono · raro→transcodifica
   │ subida serializada               │ subida directa a Storage (URL firmada)
   ▼                                  ▼
        lib/pipeline-client.ts → runMeetingPipeline()
   │
   ├─ POST /process?step=transcribe   Groq Whisper, lotes de 3, presupuesto 40s,
   │                                  repite mientras `more:true`
   ├─ POST /process?step=analyze      Gemini 2.0 Flash (o Groq/Llama), minuta +
   │                                  action items. IDEMPOTENTE.
   └─ POST /process?step=emails       Correos personalizados + .ics. Un fallo aquí
                                      es AVISO, no error: la minuta ya existe.
   ▼
status=completed
```

Reglas que no hay que romper:
- **Un segmento = un ciclo `start()`→`stop()`.** Nunca trocear un stream continuo: en WebM/OGG la cabecera va solo en el primer trozo y el resto es indecodificable (esto costó semanas de "no funciona").
- **Nunca subir un blob que no venga de un `onstop`.**
- **Nunca decidir el troceado por bytes**: un `.aac` de voz mete 40 min en 18 MB y revienta el límite de 60 s de Vercel. Siempre por duración real.
- **`analyze` y `vectorize` deben ser idempotentes**: cualquier reintento los vuelve a ejecutar.
- **Los correos no pueden tumbar una minuta buena.**

---

## 📁 ARCHIVOS CLAVE

```
src/
├── lib/
│   ├── pipeline-client.ts      # Bucle único del pipeline (cliente)
│   ├── processing.ts           # transcribe / analyze / vectorize (servidor)
│   ├── meeting-emails.ts       # Constructor único de los correos
│   ├── action-items.ts         # Consulta y orden de compromisos
│   ├── cron-auth.ts            # Guardia de /api/cron/*
│   ├── audio-split.ts          # ADTS AAC sin decodificar
│   ├── audio-wav.ts            # Decodificación → WAV 16k mono
│   └── audio-conversion.ts     # FFmpeg.wasm: segmentar (-c copy) y transcodificar
├── components/
│   ├── recorder/RecordButton.tsx
│   ├── legal/RecordingConsentGate.tsx   # ⬅ control legal principal
│   ├── legal/TermsGate.tsx · TermsModal.tsx
│   ├── MeetingParticipants.tsx · ResendEmailsButton.tsx
│   └── minutes/AssignActionItems.tsx
└── app/api/meetings/[id]/
    ├── process/route.ts        # transcribe|analyze|emails|vectorize
    ├── direct-upload/route.ts  # begin|sign|register
    ├── consent/route.ts        # consentimiento de grabación
    └── send-emails/route.ts    # reenvío manual
```

---

## 🚀 CHECKLIST DE DESPLIEGUE

### 1. Migración (obligatorio, manual — Vercel no aplica migraciones)
Supabase → SQL Editor → pegar y ejecutar:
```
supabase/migrations/020_mvp_hardening_and_legal_v2.sql
```
Es idempotente: se puede ejecutar varias veces y funciona aunque la 019 nunca se aplicara. Añade `error_message`, el consentimiento de grabación y los textos legales v2.

Verificar:
```sql
select doc_type, version from public.legal_documents order by doc_type;
select column_name from information_schema.columns
 where table_name='meetings' and column_name in ('error_message','recording_consent_at');
```

### 2. Variables de entorno (Vercel → Settings → Environment Variables)
Ver `.env.example`. La nueva y obligatoria es **`CRON_SECRET`** (`openssl rand -hex 32`): sin ella los crons responden 503 y no se ejecutan, a propósito.

### 3. Rotar la clave de la extensión de Chrome
`extension.pem` está en el historial de un repo público. Cualquiera puede firmar una actualización con esa identidad.
```bash
git rm --cached extension.pem extension.crx
git commit -m "chore: dejar de versionar la clave de firma de la extensión"
```
Luego generar un par de claves nuevo en `chrome://extensions` (Empaquetar extensión, sin indicar clave privada). El ID de la extensión cambiará: hay que reinstalarla.

### 4. Comprobaciones
```bash
npm run typecheck && npm run test && npm run build
```

---

## 🔍 DIAGNÓSTICO

| Qué mirar | Cómo |
|---|---|
| ¿Por qué falló una reunión? | Se muestra en la propia página de la reunión (`meetings.error_message`) |
| Errores en producción | `npx vercel logs --level error --limit 20 --no-branch --expand` |
| ¿Gmail está bien configurado? | `GET /api/health/email` con sesión iniciada (no envía nada) |
| Correos enviados | Tabla `email_logs` en Supabase |
| Transcripción | Buscar `Segment transcribed` / `Segment transcription failed` |

---

## ✅ EL PIPELINE COMPLETO YA FUNCIONA (v1.9.1 → v1.10.0, 2026-07-31)

Primera reunión procesada de extremo a extremo. Los tres fallos que lo impedían,
diagnosticados con evidencia y no por suposición:

### 1. Los `.aac` subidos fallaban al transcribir
`400 file must be one of the following types: [flac mp3 mp4 mpeg mpga m4a ogg opus wav webm]` en los 15 segmentos.

Se descargó un segmento real del storage: `ff f1 50 40…` — **ADTS AAC perfectamente válido**, 2,2 MB, 180 s. El troceado estaba bien. **Groq valida el CONTENIDO**, no la extensión ni el `Content-Type`: rechaza AAC sin contenedor se llame como se llame. El reetiquetado a `.m4a` que traía el código (documentado como "el fix de v1.0.5") nunca podía funcionar. Un primer intento arreglando sólo el MIME tampoco bastó — el reintento volvió a dar 400 con `offset 0`, lo que lo confirmó.

**Arreglo:** el ADTS se re-muxea a MP4/M4A con FFmpeg **antes de subirlo** (`-c copy`: envuelve el mismo audio, sin recodificar ni perder calidad). Si el stream copy no produce un contenedor válido, cae a MP3 recodificado. Como ffmpeg no siempre falla de forma ruidosa, `looksLikeContainer()` verifica los magic bytes de cada segmento (`ftyp`, `ID3`/sync, `RIFF+WAVE`, `OggS`, EBML) y descarta la salida si no es un contenedor real.

**Los archivos ya en storage no se pueden salvar desde el servidor** (Node no trae decodificador AAC), así que se detectan por su sync word y se devuelve un mensaje accionable —"vuelve a subir el archivo"— en vez de un 400 que "Reintentar" no puede resolver.

### 2. Gemini: modelos retirados, dos veces
- `gemini-2.0-flash` → `429 … free_tier_requests, limit: 0` (cuota CERO, no un límite que se pueda esperar).
- `gemini-2.5-flash-lite` → `404 … no longer available to new users`.

Fijar un nombre de modelo es una apuesta perdida contra Google. Ahora `discoverGeminiModels()` **lista los modelos de la propia clave** (`GET /v1beta/models`), filtra los que soportan `generateContent` y los ordena: flash primero, alias `latest` arriba, preview/experimental y generaciones viejas al fondo. Cachea 10 min. `GEMINI_MODEL` sigue mandando si se quiere fijar uno.

**Además**, Groq sólo se usaba cuando FALTABA la clave de Gemini, así que al fallar Gemini la minuta se perdía con el respaldo configurado y ocioso. Ahora cualquier fallo de Gemini cae a Groq.

### 3. Groq: `413 Request too large — Limit 12000`
El estimador usaba `caracteres/4`, demasiado optimista para español con acentos, así que el recorte "para que quepa" se quedaba corto. Pasa a `caracteres/3`, presupuesto 10 500, y ante un 413 recorta al 55 % y reintenta en vez de rendirse.

---

## ✍️ EL PROMPT DE LA MINUTA (v1.8.0 → v1.10.0)

Revisado mirando una transcripción **real** de producción:
> *"bueno este muchacho voy a grabar la reunión voy a utilizar bueno una aplicación…"*

Texto corrido, sin puntuación y **sin ninguna marca de hablante**. Sobre eso, el prompt pedía *"infiere quién se comprometió; si no hay nombre usa el label ('Speaker 1')"*. Se le pedía atribuir responsabilidades sobre un texto que no contiene atribución: inventaba nombres o escribía "Speaker 1". Y la lista de participantes estaba en la base de datos sin usarse.

**Qué se hizo:**
- `getMeetingContext()` carga título, área y participantes, y alimenta a **ambos** pasos.
- **Whisper recibe por fin su `prompt`** (sólo se enviaba si existían "speaker hints", que nada en la app crea). Es un *prior* de estilo y vocabulario: una frase bien puntuada le devuelve la puntuación, y los nombres propios hacen que los escriba bien en vez de adivinarlos.
- El prompt declara **cómo es el texto que va a leer**, prohíbe inventar y limita los responsables a los convocados o a nombres dichos en claro; ante la duda, `null`.
- **Clasifica primero el tipo de reunión** (seguimiento / decisión / lluvia de ideas / informativa) porque cambia qué merece guardarse. Una informativa con 0 compromisos es un resultado correcto.
- **Reglas para transcripciones largas**: recorrerla entera antes de escribir, y que lo dicho AL FINAL prevalezca sobre lo corregido antes — los acuerdos se cierran al cierre.
- **Jerarquía de sacrificio declarada**: si sobra material se recorta `discussion` e `ideas`, nunca compromisos, decisiones ni bloqueos.
- **Compromiso vs idea** con señales lingüísticas y desempate explícito ("ante la duda es idea"): un compromiso falso destruye la confianza en toda la minuta.
- Guía de prioridad, para que deje de marcar todo como "media".
- Lista de repaso final antes de responder.

`parseMinuteJson()` sustituye al `/\{[\s\S]*\}/` (primera llave a **última** llave del texto, que se rompía con cualquier frase final con llaves): recorre llaves balanceadas ignorando las de dentro de strings, quita fences de markdown y desenvuelve el array en el que Gemini a veces mete la minuta.

**Consecuencia esperada y buscada:** más compromisos sin responsable y sin fecha que antes. Es correcto — un responsable equivocado manda la tarea a la bandeja de quien no es.

---

## 📧 CORREOS: FECHA POR DEFINIR (v1.10.0)

El enlace de Google Calendar **sólo se generaba si el compromiso ya traía fecha**, así que desaparecía justo en los casos que más lo necesitan. Ahora:
- **Todos** los compromisos llevan enlace. Con fecha: *"Añadir a Calendar"*. Sin fecha: propone mañana 9:00 y dice *"Ponerle fecha"* — Google abre la pantalla con el día editable para que lo elija el responsable.
- Una fecha ausente se muestra como **"Por definir"** en ámbar, no como un guion: es una decisión pendiente, no una celda vacía.
- La tabla del coordinador también lleva enlace por fila.

---

## 🔐 AUDITORÍA PRE-LANZAMIENTO (v1.6.0, 2026-07-31)

### Next.js 14 → 15: no era opcional
`next@14.2.18` arrastraba una vulnerabilidad **crítica**: *Authorization Bypass in Next.js Middleware* (GHSA-f82v-jwr5-mffw). El middleware de ZRNote es justo lo que protege `/dashboard`. Además Next 14 ya no recibe parches de seguridad (sólo se mantienen la mayor actual y la anterior).

Se actualizó a **Next 15.5.22 + React 19 + @supabase/ssr 0.12 + supabase-js 2.111**. Se eligió 15 y no 16 a propósito: 15 sigue soportada y el salto es mucho menos arriesgado justo antes de lanzar.

Cambios que exigió la migración:
- `cookies()` es asíncrono → `createServerSupabase()` ahora es `async` y **todas** sus llamadas llevan `await` (23 archivos).
- `@supabase/ssr` 0.12: se pasó de `get/set/remove` a `getAll/setAll`. El triple antiguo está deprecado y maneja mal las cookies partidas de sesiones grandes.
- `params` de rutas y páginas dinámicas es ahora `Promise` → migrados 12 archivos.
- `experimental.serverComponentsExternalPackages` → `serverExternalPackages`.

### Estado de vulnerabilidades
| Paquete | Estado |
|---|---|
| next | ✅ Resuelto (15.5.22) |
| sharp (libvips CVEs) | ✅ Forzado a ^0.35.3 vía `overrides`. Además `images.unoptimized: true` elimina el endpoint `/_next/image`, que es lo único que usaba sharp. |
| postcss (nivel raíz) | ✅ Subido a ^8.5.25 |
| postcss (empaquetado dentro de next) | ⚠️ **Riesgo aceptado.** Next fija 8.4.31 dentro de su propio paquete y no acepta `overrides`. **No es explotable aquí**: es una herramienta de *build* que procesa únicamente nuestro propio CSS (nunca entrada de usuario) y no llega al navegador. Se resolverá solo cuando Next actualice su dependencia. |

### Verificación en ejecución real (no sólo compilación)
Se levantó el build de producción localmente contra la base de datos real y se comprobó:
- `/`, `/login`, `/signup`, `/legal` y los 4 documentos legales → **200**, con el contenido v2 leído de Supabase.
- `/dashboard` sin sesión → **307 a /login** (el middleware protege de verdad).
- `/api/health/services` sin sesión → **401**.
- `/api/legal/documents` → devuelve los documentos v2.

**Esto atrapó un fallo real**: en el primer intento todo daba 500. Era `.env.local` con valores `[SENSITIVE]` (Vercel no descarga variables marcadas como sensibles), no un fallo de código — pero de no haberlo probado en ejecución, el diagnóstico habría sido imposible de distinguir de una migración rota.

### Comprobado en la base de datos de producción
- Bucket `meeting-audio`: existe, **privado**, con 3 políticas.
- RLS activo en las 7 tablas con datos personales.
- Migración 018 aplicada (funciones `SECURITY DEFINER` que evitan la recursión de políticas).
- Datos: 16 reuniones completadas, 14 minutas → 2 reuniones quedaron "completadas sin minuta" por el bug antiguo de falso éxito. El código nuevo lo impide y la UI ahora ofrece "Reintentar" en ese caso.

### Nueva página: `/dashboard/diagnostico`
Los fallos que de verdad tumban ZRNote son invisibles en el código: una clave revocada, un modelo que el proveedor retiró, un bucket que falta. La página los prueba **en vivo** y los muestra en verde/ámbar/rojo, marcando cuáles bloquean la app. Enlazada desde *Mi Perfil*.

Es la forma de responder «¿está todo bien?» sin leer logs ni preguntarle a un desarrollador — y de detectar el día que Groq retire `whisper-large-v3` o Google retire `gemini-2.0-flash`.

---

## 📱 PWA Y GRABACIÓN CON LA PANTALLA APAGADA (v1.5.0)

**El service worker existía en `public/` desde el principio pero nadie llamaba nunca a `register()`.** ZRNote no era una PWA instalable: Chrome en Android solo ofrece instalación real si hay un worker registrado con handler de `fetch`. Y si se hubiera registrado tal como estaba, habría sido peor: cacheaba **toda** respuesta GET —incluido el HTML autenticado del dashboard y `/api/`— en una caché compartida.

Qué se hizo:
- `ServiceWorkerRegistrar` lo registra (solo en producción).
- `sw.js` reescrito: cachea únicamente estáticos inmutables (`/_next/static/`, iconos, ffmpeg) y sirve `/offline.html` cuando no hay red. **Nunca** toca `/api/` ni HTML de sesión.
- `manifest.json` con `id`, `scope`, icono `maskable` y accesos directos.
- Quitado `maximumScale: 1 / userScalable: false`, que impedía hacer zoom.

**Por qué la grabación se cortaba con la pantalla apagada:** la rotación de segmentos dependía de `setInterval`, y el navegador estrangula los temporizadores a ~1 tick/minuto en segundo plano. El segmento nunca se cerraba, crecía sin control y acababa superando el tope de 4 MB de subida — se perdía entero.

Arreglo (`src/lib/background-audio.ts` + `RecordButton`):
- **El reloj de rotación es ahora `ondataavailable`**, que lo dispara el hilo de medios, no un temporizador de JS. Sigue funcionando con la pantalla apagada.
- **Keep-alive**: un clip de silencio en bucle mantiene la pestaña como "reproduciendo medios", que es lo que impide que el sistema la congele, y `mediaSession` muestra la notificación del SO con pausa/reanudar.
- **El tiempo transcurrido se recalcula desde timestamps**, no contando ticks.
- `backgroundRecordingSupport()` avisa por adelantado según el dispositivo.

**iOS sigue sin poder** grabar en segundo plano: Safari suspende la captura al salir de primer plano y ninguna API web lo cambia. La UI lo dice antes de empezar, en vez de dejar que se descubra perdiendo una reunión. En Android se puede bloquear la pantalla.

---

## ⚠️ LÍMITES CONOCIDOS (documentados, no son bugs)

- **Hay que dejar la pestaña abierta** mientras se procesa. El pipeline lo dirige el navegador. Si se cierra, la reunión queda en `processing`; el cron diario la libera a `failed` con un mensaje claro y "Reintentar" continúa desde donde quedó sin perder nada.
- **iPhone/iPad: no se puede bloquear la pantalla** mientras se graba (limitación de Safari, no del código).
- **Extensión de Chrome**: reescrita por completo en la v2.0.0 y **pendiente de prueba en vivo**. Ver `extension/README.md` para qué estaba roto y qué falta verificar.
- **RAG / `/api/agent/query`**: funciona técnicamente pero no tiene UI y requiere `org_id`. Fase 2.
- **Crons diarios** (plan Hobby de Vercel, máximo 2). La recuperación automática ocurre una vez al día; el botón "Reintentar" es inmediato.
- Reuniones de más de ~2 h con Groq/Llama pierden parte de la transcripción por el límite de 12k tokens/minuto. Con `GEMINI_API_KEY` configurada no se recorta nada.

---

## 🎯 SIGUIENTE (post-MVP)

| Prioridad | Qué | Por qué / esfuerzo |
|---|---|---|
| **Alta** | **Editar la minuta a mano** | La IA se equivoca y hoy no hay forma de corregir un compromiso, un responsable o el resumen. Es lo que más confianza da. ~2 días |
| **Alta** | **Poner fecha desde la app** (selector en cada compromiso) | Hoy sólo se puede desde el correo → Google Calendar. Debería poder hacerse en "Compromisos". ~1 día |
| **Alta** | Procesamiento en servidor (worker) | Quita la fricción de tener que dejar la pestaña abierta. Es el cambio de arquitectura pendiente. ~1 semana |
| **Alta** | Probar la extensión en una reunión real | Reescrita pero sin verificar en vivo |
| Media | Que los participantes vean la minuta sin ser el creador | Hoy la reunión es sólo del creador; limita el uso en equipo. ~2 días |
| Media | Recordatorio de compromisos sin fecha | Cierra el círculo de "Por definir": avisar a los 2 días si nadie le puso fecha. ~1 día |
| Media | Búsqueda full-text de minutas | Barata (`pg_trgm`) y muy útil cuando haya 50 reuniones. ~1 día |
| Media | Plantillas por tipo de reunión | El prompt ya clasifica el tipo; dejar elegirlo a mano afinaría más la extracción. ~2 días |
| Baja | Resumen semanal por correo | "Esto es lo que asumiste esta semana". Fideliza. ~2 días |
| Baja | Exportar a Notion / Trello / Slack | Sólo cuando se sepa qué usa el equipo de verdad |
| Baja | UI de búsqueda semántica (RAG) | El backend ya existe, falta la interfaz |

---

*Última actualización: 2026-07-31 — v1.10.0. Primera reunión procesada de extremo a extremo: arreglados el rechazo de .aac por Groq (re-mux a MP4 antes de subir), los modelos de Gemini retirados (descubrimiento en runtime) y el 413 de Groq. Prompt de minuta rediseñado con criterio editorial. Enlace de calendario en todos los compromisos, con "fecha por definir". Build ✅ · tsc ✅ · 119/119 tests ✅.*
