# ZRNote — Contexto Maestro del Proyecto
> **Fuente de verdad única** — Actualizar en cada sesión. Leer al inicio de cada conversación.

---

## ⚠️ BUGS CRÍTICOS RESUELTOS — **NO REVERTIR** (2026-07-21)

> Estos fallos explican por qué "no funcionaba" durante semanas. Lee esto ANTES de tocar la grabación o los emails.

### 1. 🔴 Segmentos de audio corruptos (LA causa raíz de "no funciona")
- **Síntoma:** Solo el primer segmento (30s) se transcribía; el resto fallaba con Groq HTTP 400 ("archivo corrupto"). La minuta salía vacía o solo con los primeros 30s.
- **Causa:** `RecordButton.tsx` usaba UN solo `MediaRecorder.start(1000)` y troceaba el stream continuo cada 30s (`flushSegment`). En WebM/OGG **la cabecera del contenedor va SOLO en el primer chunk**; los trozos siguientes son fragmentos sin cabecera → indecodificables por Whisper. Ninguna versión previa (ni el commit "stop/restart") lo hacía bien: todas troceaban.
- **Fix (definitivo):** Rotación real de grabador. Cada segmento es una **sesión completa** de `MediaRecorder`: al cumplir 30s se hace `stop()` (esto FINALIZA el contenedor → archivo válido con cabecera) y en `onstop` se sube el blob y se arranca un `MediaRecorder` **nuevo** para el siguiente segmento (`startNewRecorder` / `rotateSegment`).
- **Regla:** NUNCA subir un blob que no venga de un `onstop`. NUNCA volver a trocear un stream continuo (`start(timeslice)` + slice). Un segmento = un ciclo start→stop.

### 2. 🔴 `escapeHtml` era un no-op (XSS real en emails)
- **Causa:** En `src/lib/safe-html.ts` (y `supabase/functions/_shared/safe-html.ts`) los `.replace()` sustituían `&`→`&`, `<`→`<`, etc. (las entidades HTML se habían colapsado a caracteres crudos). El escape no escapaba nada; el contenido del LLM se inyectaba tal cual en el HTML del email.
- **Fix:** Restaurar las entidades reales: `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`, `'`→`&#039;`. Cubierto por `src/lib/safe-html.test.ts`.

### 3b. 🔴 `infinite recursion detected in policy for relation "meetings"` (500 en producción)
- **Síntoma:** `POST /api/meetings` devuelve 500; al crear reunión sale "Error al crear reunión: infinite recursion detected in policy for relation meetings".
- **Causa:** Las migraciones RLS son ADITIVAS y cada una solo borra ALGUNAS políticas por nombre. La BD real quedó con un par recursivo vivo: una política de `meetings` que consulta `meeting_participants` **y** una de `meeting_participants` que consulta `meetings` → ciclo (Postgres 42P17).
- **Fix:** `supabase/migrations/018_rls_reset_no_recursion.sql` — idempotente y agnóstico al estado: un bucle DO borra TODAS las políticas de las tablas afectadas y recrea un set limpio donde **todas las referencias entre tablas pasan por funciones `SECURITY DEFINER`** (`current_user_org_id`, `is_meeting_creator`, `is_meeting_participant`) que saltan el RLS → imposible que haya ciclo. Además restringe las políticas `USING(true)` a `TO service_role` (antes exponían TODO a cualquier usuario logueado = fuga entre orgs).
- **⚠️ Aplicar manualmente:** pegar el archivo completo en Supabase → SQL Editor → Run. Vercel NO aplica migraciones de Supabase.
- **Regla:** NO añadir más migraciones RLS aditivas. Si las políticas vuelven a divergir, re-ejecutar/adaptar la 018 (reset completo), nunca parchear por nombre.

### 3d. 🟢 Subida de audio largo/pesado (40min+ .aac) — ESTRATEGIA POR NIVELES (v1.0.4)
- **Problemas del enfoque anterior:** (1) `splitAudioFile` troceaba reproduciendo en TIEMPO REAL → 40 min tardaban ~40 min. (2) FFmpeg cargaba el core desde `unpkg` pero la CSP `connect-src` no lo permitía → nunca cargaba en prod → `.aac` roto. (3) el core single-thread NO tiene `ffmpeg-core.worker.js` pero el código lo pedía.
- **Fix — `upload/page.tsx` reescrito, 4 niveles** (cada chunk ≤24MB, subida directa a Storage vía signed URL, evita el límite 4.5MB de Vercel; menos llamadas Whisper = menos espera):
  1. **≤24MB → subida entera** (1 llamada Whisper, sin procesar).
  2. **`.aac` >24MB → `splitAdtsAac`** (`lib/audio-split.ts`): corta por frames ADTS SIN decodificar → instantáneo, ligero en memoria (mobile-safe).
  3. **m4a/mp3/wav >24MB → `decodeToMono`+`chunkFloatToWav`** (`lib/audio-wav.ts`): OfflineAudioContext (más rápido que tiempo real) → WAV 16kHz mono (ideal para Whisper).
  4. **Exótico → FFmpeg.wasm** self-hosteado en `public/ffmpeg/` (carga diferida ~31MB SOLO aquí) → mp3 → re-aplica niveles.
- **FFmpeg arreglado:** `audio-conversion.ts` carga `/ffmpeg/*` same-origin sin `workerURL`; CSP en `next.config.js`: `script-src ... blob:` + `worker-src 'self' blob:`.
- **Tests:** `audio-split.test.ts` (4) + `audio-wav.test.ts` (6). Requiere política de storage de migración `002`.

### 3e. 🔴 Groq Whisper NO acepta `.aac` + reunión "completado sin minuta" (v1.0.5)
- **Síntoma:** subes un `.aac`, la reunión queda **`completado` pero "Minuta no disponible"**. No se ve error en consola.
- **Causa 1 (raíz):** Groq Whisper solo acepta `flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm`. **`.aac` da HTTP 400.** → transcripción vacía.
- **Causa 2:** el bucle del pipeline en `upload/page.tsx` solo miraba `res.ok` (HTTP), no `data.ok`; y el paso `emails` llamaba `markMeetingCompleted` SIN verificar que existiera minuta → falso "completado".
- **Fix:**
  - `processing.ts` + Edge Function `transcribeSegment`: reetiquetan `.aac`→`.m4a` al enviar a Groq (su ffmpeg detecta el contenido real). Set `GROQ_EXTS`.
  - `process/route.ts` paso `emails`: si NO hay minuta → marca `failed` y devuelve `ok:false` (no completa en falso).
  - `upload/page.tsx`: el bucle para en `data.ok===false` y **muestra el error real en la UI** (`pipelineError`). Emails que fallan NO bloquean una minuta buena.
- **Además:** FFmpeg dejó de cargarse EAGER (quitado el `useEffect` en `useAudioConverter`) → abrir la página de subida ya NO descarga 31MB; solo carga si un formato exótico lo necesita.

### 3f. 🔴 Groq LLM 413 "Request too large" (TPM 12k) en reuniones largas (v1.0.7)
- **Síntoma:** transcripción OK pero al generar minuta: `LLM error (413) ... TPM Limit 12000, Requested 13692, rate_limit_exceeded`.
- **Causa:** Groq free tier limita llama-3.3-70b a **12.000 tokens/minuto**, y ese presupuesto cuenta **input + max_tokens**. Con `max_tokens: 8192` fijo, un transcript de ~5.500 tokens ya lo excede.
- **Fix (`analyzeMeeting` en `processing.ts` + Edge Function):** presupuesto dinámico `TPM_BUDGET=11000`: `max_tokens` = lo que quede tras el input; si el transcript es enorme se **trunca** para dejar sitio a la salida; reintento ante 429 (espera 15s). 
- **Límite conocido:** reuniones MUY largas (>~2h) pierden parte del transcript al truncar; la solución completa sería map-reduce (pendiente, post-MVP).

### 3. Race condition al subir segmentos (pérdida de segmentos)
- **Causa:** `upload-segment` hace read-modify-write de `meetings.audio_segments`; subidas concurrentes se pisaban (last-write-wins) → segmentos perdidos.
- **Fix (cliente):** Las subidas se serializan en `RecordButton` (`uploadChainRef`) — una a la vez, en orden.

---

## 📍 ESTADO ACTUAL: **MVP FUNCIONAL + RAG + EXTENSION CHROME + CONVERSIÓN AUDIO** (100% Free Tier)

### ✅ YA IMPLEMENTADO Y FUNCIONANDO

| Componente | Estado | Detalles |
|------------|--------|----------|
| **Auth** | ✅ | Supabase Auth (email/password), middleware protege `/dashboard` |
| **CRUD Reuniones** | ✅ | Crear, listar, ver, editar, borrar + participantes |
| **Grabación PWA** | ✅ | `RecordButton`: segmentos de **30s por rotación stop/restart** (cada segmento = archivo válido con cabecera), wake lock, media session, retry, pause/resume, subidas serializadas |
| **Subida archivos** | ✅ | Drag & drop, validación 4MB, multiarchivo, progress UI |
| **Conversión audio (FFmpeg.wasm)** | ✅ | `lib/audio-conversion.ts` + hook `useAudioConverter` — convierte .aac/.amr/.3gp etc. a MP3/Opus/WebM en el navegador (WASM), reduce bitrate (ej. 64kbps), botón "Convertir y comprimir" en UI |
| **Transcripción** | ✅ | Groq Whisper (whisper-large-v3) en Edge Function, batch 3 segmentos |
| **Generación minuta** | ✅ | Groq Llama-3.3-70b con prompt detallado en español |
| **Vista minuta** | ✅ | Render completo: resumen, temas, decisiones, proyectos, bloqueos, ideas, next steps, transcripción |
| **Action Items** | ✅ | CRUD, asignación UI, badges prioridad/estado, página "Mis Tareas" |
| **Emails** | ✅ | Nodemailer/Gmail SMTP, plantillas HTML ricas, adjuntos ICS, retry, logs |
| **Speaker mapping** | ✅ | UI para mapear "Speaker 1" → nombres reales |
| **Pipeline por pasos** | ✅ | `/process?step=transcribe\|analyze\|emails\|vectorize` + polling UI |
| **Auto-recovery (cron)** | ✅ | Vercel Cron **`*/2 * * * *`** (ver `vercel.json`) reintenta stuck/failed vía `processing_queue` + Edge Function `process-meeting` |
| **Rate limiting** | ✅ | 10 req/min por user/meeting en `/process` |
| **Logs estructurados** | ✅ | `logger.ts` JSON en prod, colores en dev |
| **Tests** | ✅ | 26 tests Vitest pasando. `safe-html.test.ts` = XSS real (habría atrapado el bug del escape). `email-service.test.ts` = 12 tests de correos (escape XSS, match tareas, retry). `processing.test.ts` = smoke (typeof) |
| **RGPD endpoints** | ✅ | `GET /api/user/export`, `POST /api/user/delete` |
| **Security headers** | ✅ | CSP, HSTS, X-Frame-Options, Permissions-Policy |
| **Retención datos (cron)** | ✅ | Diario 3AM: borra audio >30d, archiva >1a, limpia orphans |
| **Multi-tenant schema** | ✅ | `organizations`, `org_members`, RLS por org |
| **pgvector + RAG** | ✅ | Migración `012_pgvector_and_meeting_chunks.sql`, función `search_meeting_chunks` |
| **Embeddings (Jina AI)** | ✅ | `embeddings.ts` - gratis 1M tokens/mes, 1024 dims |
| **Vectorize step** | ✅ | `vectorizeMeeting()` + step `vectorize` en pipeline |
| **Agent API (RAG)** | ✅ | `POST /api/agent/query` - embedding query → pgvector search → Groq LLM + citas |
| **Chrome Extension (MV3)** | ✅ | Grabación Meet/Zoom/Teams via `getDisplayMedia()`, panel flotante, popup, background, backend URL configurable |
| **PDF Export** | ✅ | `GET /api/meetings/[id]/export-pdf` — descarga minuta en PDF usando `@react-pdf/renderer` |
| **Google Calendar link in emails** | ✅ | `generateGoogleCalendarUrl()` en emails (link público "Añadir a Calendar", sin OAuth) |
| **Rate limiter DB-based** | ✅ | `rate_limits` table reemplaza el Map en memoria (no funcionaba en serverless) |
| **Transcripción por lotes** | ✅ | `segments_transcribed_offset` + `more: true` → evita timeout Vercel 60s en reuniones largas |
| **Email service compartido** | ✅ | `email-service.ts` — `buildMinuteHtml`, `buildActionItemsHtml`, `matchItemsToParticipant`, `sendWithRetry` extraídos |
| **Rate limit cleanup cron** | ✅ | Limpieza automática de rate_limits + processing_queue expirados en el cron de retención |
| **MediaRecorder mimeType fallback** | ✅ | Detecta `audio/webm;codecs=opus` → `audio/webm` → `audio/ogg;codecs=opus` → `audio/mp4` (evita chunks corruptos después del 1er segmento) |
| **Retry segmentos fallidos** | ✅ | `transcribeMeeting` avanza offset solo por éxitos; si todo falla, salta el batch y continúa |
| **Emails a prueba de fallos** | ✅ | `sendMeetingEmails` + `email_logs` insert en try/catch → errores se loguean, NO rompen pipeline |
| **MediaRecorder mobile optimizado** | ✅ | Fuerza `audio/webm` (SIN `codecs=opus`) + `audioBitsPerSecond: 128000` → chunks válidos en grabaciones 30min-2hr en móvil |
| **Console.error override seguro** | ✅ | Override `console.error` en `processing.ts` → captura `util.format` de nodemailer/deps antes de `RangeError: %Z` |
| **Fix: Race condition finalizeRecording** | ✅ | `mediaRecorder.stop()` + espera evento `onstop` antes de `flushSegment()` → no se pierden chunks finales |
| **Fix: transcribeMeeting no salta segmentos fallidos** | ✅ | Línea 201: avanza offset solo por éxitos; fallos quedan para retry (cron los recupera) |
| **Fix: Upload page divide audio largo** | ✅ | `splitAudioFile()` usa Web Audio API → divide en segmentos 30s + compresión automática 3.5MB |
| **Conversión .aac/.amr/.3gp con FFmpeg.wasm** | ✅ | `lib/audio-conversion.ts` + `useAudioConverter` hook → convierte en navegador (WASM) a MP3 64kbps, botón "Convertir y comprimir" en UI, evita límite 25MB Whisper |
| **Worker asíncrono con processing_queue** | ✅ | Edge Function `process-meeting` procesa queue sin límite 60s Vercel; cron cada 2 min dispara worker |
| **Cron retry-stuck cada 2 min** | ✅ | Resetea queue items atascados + crea entradas para meetings sin queue + dispara Edge Function |

---

## 🏗️ ARQUITECTURA FINAL (100% Free Tier)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ZRNOTE STACK (FREE TIER)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │   Chrome Ext     │    │   Next.js 14     │    │    Supabase      │      │
│  │   (Manifest V3)  │───▶│   (Vercel Free)  │───▶│   (500MB DB +     │      │
│  │  getDisplayMedia │    │  App Router      │    │   1GB Storage)   │      │
│  │  MediaRecorder   │    │  Server Actions  │    │  pgvector + RLS  │      │
│  └──────────────────┘    └────────┬─────────┘    └────────┬─────────┘      │
│                                    │                      │                │
│                                    ▼                      ▼                │
│                          ┌──────────────────┐    ┌──────────────────┐      │
│                          │   Groq (Free)    │    │   Jina AI (Free) │      │
│                          │  Whisper + Llama │    │  Embeddings      │      │
│                          │  14k req/day     │    │  1M tokens/mes   │      │
│                          └──────────────────┘    └──────────────────┘      │
│                                    │                                        │
│                                    ▼                                        │
│                          ┌──────────────────┐                              │
│                          │  Gmail SMTP      │                              │
│                          │  (500/día gratis)│                              │
│                          └──────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Coste mensual: $0** (Free tiers generosos)

---

## 📁 ESTRUCTURA CLAVE

```
C:\Dev\ZR Note\
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── meetings/[id]/
│   │   │   │   ├── process/route.ts          # Pipeline por pasos (4 steps)
│   │   │   │   ├── upload-segment/route.ts   # Upload audio chunks
│   │   │   │   ├── finalize/route.ts         # Inicia pipeline
│   │   │   │   └── route.ts                  # CRUD meeting
│   │   │   ├── agent/query/route.ts          # RAG Agent API
│   │   │   ├── user/export/route.ts          # RGPD export
│   │   │   ├── user/delete/route.ts          # RGPD delete
│   │   │   ├── cron/retry-stuck/route.ts     # Auto-recovery (5min)
│   │   │   └── cron/retention/route.ts       # Retención diaria (3AM)
│   │   ├── dashboard/
│   │   │   ├── meetings/[id]/
│   │   │   │   ├── page.tsx                  # Vista minuta completa
│   │   │   │   ├── record/page.tsx           # Grabación PWA
│   │   │   │   ├── speakers/page.tsx         # Speaker mapping
│   │   │   │   └── upload/page.tsx           # Subida archivos
│   │   │   ├── action-items/page.tsx         # Mis tareas
│   │   │   └── page.tsx                      # Dashboard home
│   │   └── (auth)/login|signup/page.tsx
│   ├── components/
│   │   ├── recorder/RecordButton.tsx         # Grabadora PWA completa
│   │   └── minutes/AssignActionItems.tsx     # Asignación UI
│   ├── lib/
│   │   ├── processing.ts                     # Pipeline core (transcribe/analyze/vectorize/emails)
│   │   ├── embeddings.ts                     # Jina AI embeddings
│   │   ├── logger.ts                         # Structured logging
│   │   ├── supabase/server.ts|client.ts      # Supabase clients
│   │   └── env.ts                            # Env vars centralizadas
│   └── middleware.ts                         # Auth protection
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_fix_rls.sql
│       ... 011_perf_indexes.sql
│       └── 012_pgvector_and_meeting_chunks.sql  # RAG schema
├── extension/                                # Chrome Extension MV3
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── content.css
│   ├── popup.html|js
│   └── icons/
├── vitest.config.ts
├── next.config.js                            # Security headers + crons
├── vercel.json                               # Function durations + crons
└── CONTEXT.md                                # ESTE ARCHIVO
```

---

## 🔧 PIPELINE DE PROCESAMIENTO (4 Steps)

> **IMPORTANTE — cuál corre de verdad:** El path ACTIVO tras grabar/subir es el **frontend-driven** (abajo "Modo Legacy"): `RecordButton`/upload llaman a `finalize` y luego hacen polling de `/process?step=...`. El **"Modo Worker" (processing_queue + Edge Function) NO se dispara desde `finalize`** — solo lo activa el cron `retry-stuck` como RECUPERACIÓN de reuniones atascadas/fallidas. No son el mismo flujo; comparten solo la BD.

### Modo Legacy (In-process, límite 60s Vercel) — **PATH ACTIVO**
```
POST /api/meetings/[id]/finalize
    │
    ▼ status=processing
POST /api/meetings/[id]/process?step=transcribe
    │  - Descarga segmentos de Supabase Storage
    │  - Groq Whisper (batch 3) → transcript_raw
    ▼
POST /api/meetings/[id]/process?step=analyze
    │  - Groq Llama-3.3-70b + prompt detallado
    │  - Inserta minutes + action_items
    ▼
POST /api/meetings/[id]/process?step=vectorize
    │  - Crea chunks semánticos (summary, decisions, action_items, transcript)
    │  - Jina AI embeddings (1024 dims) → pgvector meeting_chunks
    ▼
POST /api/meetings/[id]/process?step=emails
    │  - Nodemailer Gmail SMTP
    │  - Emails personalizados + ICS adjuntos
    ▼
status=completed
```

**Cada step < 60s** (límite Vercel). Polling desde UI cada 3s.

### Modo Worker (Async) — **SOLO RECUPERACIÓN vía cron, no el path normal**
```
POST /api/meetings/[id]/finalize
    │
    ▼ status=processing
Crea entradas en processing_queue (transcribe, analyze, vectorize, emails)
    │
    ▼
Cron */2 * * * * → Dispara Edge Function `process-queue`
    │
    ▼
Edge Function procesa queue items (máx 5 concurrentes)
    - transcribe: batch 9 segmentos, actualiza batch_offset, re-queue si more
    - analyze: genera minuta + action_items
    - vectorize: embeddings Jina AI → pgvector
    - emails: envía emails + marca meeting completed
    │
    ▼
status=completed
```

**Ventajas**: Sin timeout 60s, reintentos automáticos (max_attempts=5), visibilidad en `processing_queue` table.

---

## 🗄️ SCHEMA CLAVE (Supabase)

```sql
-- Organizations (multi-tenant)
organizations: id, name, slug, created_at

-- Users (extends auth.users)
users: id, org_id, role (super_admin|coordinator|participant), full_name, email

-- Meetings
meetings: id, org_id, created_by, title, coordination, type, status,
          started_at, ended_at, audio_segments[], transcript_raw, speaker_map

-- Minutes (1:1 meeting)
minutes: meeting_id, summary, discussion[], decisions[], project_statuses[],
         blockers[], ideas[], next_steps[], action_items[], raw_llm_output

-- Action Items
action_items: meeting_id, minute_id, assignee_user_id, assignee_name, assignee_email,
              description, due_date, priority (alta|media|baja), status

-- RAG Vector Store (pgvector)
meeting_chunks: org_id, meeting_id, chunk_index, content, embedding vector(1024),
                metadata(jsonb: section, speaker)

-- Function: search_meeting_chunks(org_id, query_embedding, limit, meeting_id?)
```

**RLS**: Aislamiento total por `org_id`. Service role bypass para workers.

---

## 🌐 ENDPOINTS CLAVE

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/meetings` | Crear reunión + participantes |
| `GET` | `/api/meetings` | Listar reuniones del usuario |
| `GET/PATCH/DELETE` | `/api/meetings/[id]` | CRUD reunión |
| `POST` | `/api/meetings/[id]/upload-segment` | Subir chunk audio |
| `POST` | `/api/meetings/[id]/finalize` | Iniciar pipeline (status=processing) |
| `POST` | `/api/meetings/[id]/process` | Step: `transcribe\|analyze\|vectorize\|emails` |
| `POST` | `/api/agent/query` | RAG query: `{query, orgId, meetingId?, topK?, filters?}` |
| `GET` | `/api/user/export` | RGPD: exporta todos los datos del usuario |
| `POST` | `/api/user/delete` | RGPD: elimina cuenta + datos (requiere password) |
| `GET` | `/api/cron/retry-stuck` | Cron 5min: recupera stuck/failed |
| `GET` | `/api/cron/retention` | Cron 3AM: limpieza retención |

---

## 🧪 TESTS

```bash
npm run test        # Vitest - 9 tests passing
npm run build       # Next.js build OK
npm run lint        # ESLint (si configurado)
```

---

## 📦 CHROME EXTENSION (C:\Dev\ZR Note\extension)

**Instalación local:**
```
1. Chrome → chrome://extensions → "Modo desarrollador" ON
2. "Cargar descomprimida" → C:\Dev\ZR Note\extension
3. En Meet: icono ZRNote → "Iniciar Grabación"
```

**Funciona en:** Meet, Zoom, Teams, Jitsi (cualquier pestaña con `getDisplayMedia`)

---

## 🚀 DEPLOY CHECKLIST

### Variables Vercel (Settings → Environment Variables)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GROQ_API_KEY=gsk_...
JINA_API_KEY=jina_...                    # Gratis en jina.ai
GMAIL_USER=tu-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx   # App Password (no contraseña normal)
NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
```

### Migración Supabase (SQL Editor)
```sql
-- Ejecutar en Supabase SQL Editor:
-- Copiar contenido de supabase/migrations/012_pgvector_and_meeting_chunks.sql
```

### Deploy
```bash
git add .
git commit -m "feat: pipeline completo + RAG + Chrome extension"
git push origin main
# Vercel auto-deploy + registra crons automáticamente
```

---

## 🎯 PRÓXIMOS PASOS OPCIONALES (Post-MVP)

| Prioridad | Feature | Esfuerzo |
|-----------|---------|----------|
| Alta | Recall.ai bot para Meet/Zoom automático | 1 semana |
| Alta | PDF export minuta (@react-pdf/renderer) | 2 días |
| Media | Notificaciones realtime (Supabase Realtime) | 3 días |
| Media | Búsqueda full-text minutas (pg_trgm) | 1 día |
| Baja | Google Calendar sync (crear follow-up events) | 3 días |
| Baja | Notion/Linear/Trello/Slack integrations | 1 semana c/u |
| Baja | Multi-tenant SaaS (Stripe + onboarding) | 2 semanas |

---

## 🔑 GOOGLE CALENDAR OAUTH 2.0 SETUP (PASOS)

Para habilitar Google Calendar REST API (crear eventos automáticos desde ZRNote):

### 1. Google Cloud Console
1. Ir a https://console.cloud.google.com → Crear proyecto o seleccionar existente
2. Habilitar **Google Calendar API** (Biblioteca de APIs → buscar "Google Calendar API" → Habilitar)
3. Ir a **Credenciales** → **Crear credenciales** → **ID de cliente OAuth**
4. Tipo de aplicación: **Aplicación web**
5. **Orígenes autorizados de JavaScript**: `https://zrnote.vercel.app`
6. **URI de redireccionamiento autorizados**: `https://zrnote.vercel.app/api/auth/calendar/callback`
7. Copiar **Client ID** y **Client Secret**

### 2. Configurar OAuth Consent Screen
1. Ir a **Pantalla de consentimiento de OAuth**
2. User Type: **Externo** (o Interno si solo uso del equipo)
3. Añadir scopes: `.../auth/calendar.events` (crear eventos)
4. Añadir como usuario de prueba tu email @gmail.com

### 3. Obtener Refresh Token (una vez)
```bash
# 1. Construir URL de autorización:
https://accounts.google.com/o/oauth2/v2/auth?client_id=TU_CLIENT_ID&redirect_uri=https://zrnote.vercel.app/api/auth/calendar/callback&response_type=code&scope=https://www.googleapis.com/auth/calendar.events&access_type=offline&prompt=consent

# 2. Visitar URL, autorizar, serás redirigido a:
#    https://zrnote.vercel.app/api/auth/calendar/callback?code=AUTH_CODE

# 3. Canjear code por refresh_token (POST):
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=TU_CLIENT_ID" \
  -d "client_secret=TU_CLIENT_SECRET" \
  -d "code=EL_CODE" \
  -d "redirect_uri=https://zrnote.vercel.app/api/auth/calendar/callback" \
  -d "grant_type=authorization_code"
# → Devuelve { "refresh_token": "1//xxxxx", "access_token": "...", "expires_in": 3600 }
```

### 4. Variables de Entorno (Vercel)
```bash
GOOGLE_CALENDAR_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_CALENDAR_REFRESH_TOKEN=1//xxxxx
GOOGLE_CALENDAR_REDIRECT_URI=https://zrnote.vercel.app/api/auth/calendar/callback
```

### 5. Código existente
- `src/lib/google-calendar.ts` — funciones `createCalendarEvent`, `createMeetingCalendarEvent`, `createActionItemCalendarEvent`
- Falta: endpoint de callback OAuth y UI de conexión en settings del dashboard
- Actualmente los emails usan `generateGoogleCalendarUrl()` (link público, SIN OAuth) para "Añadir a Calendar"

---

## 🔍 DEBUGGING — Comandos exactos para ver errores

| Qué buscar | Comando |
|------------|---------|
| **Errores 500 en producción** | `npx vercel logs --level error --limit 20 --no-branch --expand` |
| **Pipeline completo (últimos 30 min)** | `npx vercel logs --level info --limit 50 --no-branch --expand --since 30m` |
| **Errores de transcripción (Groq)** | `npx vercel logs --query "Segment transcription failed" --level error --no-branch --expand` |
| **Errores de emails** | `npx vercel logs --query "Email step crashed" --level error --no-branch --expand` |
| **Tests locales** | `npx vitest run` |
| **Build local** | `npm run build` |
| **Estado migraciones Supabase** | `psql -h db.xxx.supabase.co -U postgres -d postgres -c "SELECT * FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename;"` |

### Logs clave a vigilar en cada paso:

| Paso | Log éxito | Log fallo |
|------|-----------|-----------|
| `transcribe` | `Segment transcribed` + `Transcription batch completed` | `Segment transcription failed` (status 400 = archivo corrupto) |
| `analyze` | `Minute generated` + `actionItems: N` | `LLM error` / `Failed to parse LLM JSON` |
| `vectorize` | `Vectorization completed` + `chunksCreated: N` | `Could not find table meeting_chunks` (falta migración 012) |
| `emails` | `Email send failed:` (solo log, no crashea) | `Email step crashed:` (RangeError = bug en logger/format) |

---

## 📝 NOTAS PARA PRÓXIMA SESIÓN

1. **Leer este archivo completo** al inicio
2. **Verificar**: `npx vitest run` y `npm run build` pasan
3. **Continuar** desde donde quedamos (ver "PRÓXIMOS PASOS" arriba)
4. **Actualizar** este archivo al final de cada sesión
5. **Migraciones pendientes**: Las migraciones `012` a `018` deben ejecutarse en Supabase SQL Editor ANTES de grabar una reunión (012=RAG, 013=índices, 014=RGPD, 015=rate_limiter+queue, 016=RLS multi-tenant, 018=RLS reset no recursion)
6. **Emails**: revisar `email_logs` en Supabase + logs Vercel tras procesar reunión real. Si fallan: validar `GMAIL_APP_PASSWORD` (16 dígitos, 2FA activada en la cuenta Gmail).
7. **FFmpeg.wasm**: está en `lib/audio-conversion.ts` + hook `useAudioConverter`. Carga lazy (~2MB WASM) solo cuando hay archivos que fallan al decodificar. Botón "Convertir y comprimir" aparece en archivos con error. Convierte a MP3 64kbps. Probar con `.aac` real de 30+ min en móvil.

---

## 🔴 CANDADO DE 10 MIN EN "REINTENTAR" — REUNIONES ATASCADAS SIN SALIDA (v1.2.1)
- **Síntoma:** reunión queda en `procesando` para siempre (p.ej. si cierras la app o pierdes conexión a mitad del pipeline). Al pulsar "Reintentar" sale: `Error al reiniciar: La reunión ya se está procesando` — y sigue igual sin importar cuántas veces lo intentes en los primeros minutos.
- **Causa:** `finalize/route.ts` tenía `STALE_PROCESSING_MS = 10 * 60 * 1000` — un candado anti-doble-click pensado para evitar llamadas duplicadas, pero cualquier interrupción real (pestaña cerrada, red caída, app en segundo plano) dejaba la reunión en `processing` sin que nada la moviera, y el usuario no podía forzar un reintento manual hasta pasados 10 minutos completos, sin ninguna pista de cuánto faltaba.
- **Fix:** bajado a **90 segundos** (cada llamada a `/process` tiene `maxDuration: 60` en Vercel, así que si algo estuviera realmente en curso se resolvería en menos de un minuto — 90s es margen de sobra). El error ahora incluye `retryAfterSec`, y `RetryButton` **espera automáticamente y reintenta solo** si topa con el candado, en vez de dejar al usuario clicando a ciegas.
- **Nota:** el cron `retry-stuck` (recuperación automática, corre 1x/día en plan Hobby) dispara una Edge Function de Supabase que requiere `supabase functions deploy` manual y no se mantiene sincronizada con los fixes de `processing.ts` (aac, Gemini, budget de tokens). No es crítico porque ahora "Reintentar" manual funciona de inmediato, pero es deuda técnica pendiente si se quiere recuperación 100% automática.

## ⚠️ FASE 1 + PASADA UX/UI COMPLETA (v1.1.0 → v1.2.0, 2026-07-23/24)

### Backend / Fase 1
- **Minuta híbrida Gemini/Groq**: si hay `GEMINI_API_KEY` usa Gemini 2.0 Flash (contexto 1M, sin truncar reuniones largas); si no, cae a Groq/Llama con el budget dinámico de tokens. No rompe si falta la key.
- **Estados de action items**: `PATCH /api/action-items/[id]` (creador o responsable por email), componente `ActionItemStatus` (pendiente → en progreso → completado).
- **Recordatorios**: `lib/reminders.ts`, enganchado al cron de retención diario (Hobby = máx 2 crons), avisa al responsable el día antes del vencimiento.
- **Google Calendar por tarea**: link en el email personal para cada action item con fecha.
- **Diagnóstico de email**: `GET /api/health/email` verifica SMTP sin enviar nada.

### Bugs de UX corregidos
- **404 al cerrar sesión**: `signout/route.ts` construía la URL de redirect con `NEXT_PUBLIC_APP_URL` (podía no coincidir con el dominio real) → ahora usa `new URL('/login', request.url)`, el origen real de la petición.
- **404 al borrar reunión**: `DeleteMeetingButton` hacía `router.refresh()` en la misma URL de detalle (que ya no existe) → ahora `router.push('/dashboard/meetings')`.
- **404 global feo**: no existía `src/app/not-found.tsx` → Next mostraba su 404 genérico. Ahora hay uno de marca con botones a Dashboard/Login.
- **Conteo de "tareas pendientes" inconsistente**: dashboard home contaba solo por `assignee_user_id` (casi siempre vacío, la IA asigna por email); "Mis Tareas" ya incluía email. Unificado.
- **`confirm()`/`alert()` nativos** reemplazados por `ConfirmDialog` y banners en línea (Delete, Retry, Nueva Reunión) — más coherente visualmente.
- **Cuenta RGPD sin UI**: el endpoint `POST /api/user/delete` existía pero no tenía botón → añadido en Perfil (`DeleteAccountSection`, con contraseña de confirmación).

### UX de la vista de reunión (reordenada)
- **Action Items (ahora "Compromisos") promovidos** justo debajo del resumen — antes estaban casi al final, después de la transcripción. Ahora tienen el toggle de estado también desde aquí (no solo desde "Mis Tareas").
- Decisiones y Bloqueos mantienen su peso visual fuerte (son críticos).
- Discusión / Estados de proyecto / Ideas / Próximos pasos se agruparon en una sola sección "Más detalle" con estilo más ligero (sin caja-icono repetida) — menos sobrecarga visual.
- **WhatsApp ahora comparte la minuta COMPLETA** (resumen, decisiones, bloqueos, compromisos con prioridad/fecha/responsable, próximos pasos) con emojis, no solo el resumen. Ver `ShareWhatsApp.tsx`.

Verificado: build ✅, tsc ✅, 36 tests ✅. **Pendiente de validar por el usuario**: Redeploy en Vercel tras añadir `GEMINI_API_KEY`; recordatorios reales (depende de Gmail, ya confirmado SMTP OK).

---

*Última actualización: 2026-07-23 (tarde) — **v1.0.5: fix Groq no acepta .aac + reunión "completado sin minuta"**. Groq Whisper rechaza `.aac` (400) → ahora se reetiqueta a `.m4a` en el servidor. El paso emails ya no marca "completado" sin minuta; el bucle de subida para y MUESTRA el error real. FFmpeg ya no carga eager (0 coste al abrir subida). Build ✅, tsc ✅, 36 tests ✅. Ver bug 3e arriba. — v1.0.4 previo: subida de audio por niveles (aac 40min+) + FFmpeg self-hosted + CSP**. Rediseño de la subida: 4 niveles (entero ≤24MB → ADTS split → decode+WAV 16kHz → FFmpeg) con subida directa a Storage vía signed URL. Corregidos 3 bugs que rompían audio largo: troceo en tiempo real, FFmpeg bloqueado por CSP, workerURL inexistente. FFmpeg self-hosteado en `public/ffmpeg/`. Nuevas libs puras testeadas: `audio-split.ts` + `audio-wav.ts`. Verificado: build ✅, typecheck ✅, 36 tests ✅. **Pendiente de validar por el usuario**: subir un `.aac` real de 40min desde el móvil + confirmar emails (GMAIL_APP_PASSWORD en Vercel). Migración 018 (RLS) ya aplicada en Supabase.*