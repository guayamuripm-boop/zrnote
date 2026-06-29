# ZRNote — Agent Roadmap v1.0
> Leer completo antes de escribir código. Este archivo es la fuente de verdad del proyecto.

---

## 0. CONTEXTO DEL PRODUCTO (leer una vez)

**Qué es:** Sistema que graba reuniones → transcribe → genera minuta estructurada con IA → envía correos personalizados por participante con sus action items.

**Org:** Academia ZR (uso interno, posible SaaS futuro)
**Idioma:** Español principal + términos técnicos en inglés
**Reuniones:** hasta 5h, se segmentan c/60min
**Modalidades:** presencial (app graba mic) + virtual (bot entra a Meet/Zoom)
**Usuarios:** coordinadores (crean reuniones), participantes (reciben correos), super admin

**Lo que genera por reunión:**
1. Minuta completa (PDF/Doc) → resumen + decisiones + cambios + action items + transcripción
2. Correo personalizado por participante → solo sus action items + resumen
3. Correo al coordinador → vista de todos los action items

---

## 1. STACK DEFINITIVO

```
Frontend:    Next.js 14 (App Router) + Tailwind CSS  → PWA (funciona en móvil sin instalar)
Backend:     Node.js + Fastify                        → API REST + webhooks
DB:          PostgreSQL via Supabase                  → auth incluido
Storage:     Cloudflare R2                            → audio files (barato)
Queue:       BullMQ + Redis (Upstash free tier)       → jobs de transcripción/análisis
Transcripción: AssemblyAI                            → español + diarización, ~$0.37/hr
LLM:         Claude Sonnet (claude-sonnet-4-6)        → análisis + generación minuta
Email:       Resend.com                               → correos personalizados
Deploy:      Railway                                  → monorepo, auto-deploy desde GitHub
```

**Variables de entorno requeridas (todas en `.env.local`):**
```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
ASSEMBLYAI_API_KEY
ANTHROPIC_API_KEY
RESEND_API_KEY
CLOUDFLARE_R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET
UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
```

---

## 2. SCHEMA DE BASE DE DATOS

Crear en este orden (respetar FKs):

```sql
-- 1. organizations
id uuid PK, name text, slug text UNIQUE, created_at timestamptz

-- 2. users (extiende auth.users de Supabase)
id uuid PK FK(auth.users), org_id uuid FK(organizations),
role text CHECK(role IN ('super_admin','coordinator','participant')),
full_name text, email text UNIQUE, created_at timestamptz

-- 3. meetings
id uuid PK, org_id uuid FK, created_by uuid FK(users),
title text, coordination text, type text CHECK(type IN ('presencial','virtual','llamada')),
status text CHECK(status IN ('scheduled','recording','processing','completed','failed')),
started_at timestamptz, ended_at timestamptz, duration_seconds int,
audio_segments jsonb DEFAULT '[]',   -- [{r2_key, segment_index, duration_s, status}]
transcript_raw text,                  -- transcripción cruda de AssemblyAI
transcript_diarized jsonb,            -- [{speaker, text, start_ms, end_ms}]
speaker_map jsonb DEFAULT '{}',       -- {"Speaker 1": "uuid_usuario"}
created_at timestamptz

-- 4. meeting_participants
id uuid PK, meeting_id uuid FK, user_id uuid FK,
email_override text,  -- para invitados sin cuenta
attended bool DEFAULT true

-- 5. minutes
id uuid PK, meeting_id uuid FK UNIQUE,
summary text, topics jsonb, decisions jsonb, changes jsonb,
next_steps jsonb, raw_llm_output text,
generated_at timestamptz, approved bool DEFAULT false

-- 6. action_items
id uuid PK, meeting_id uuid FK, minute_id uuid FK,
assignee_user_id uuid FK(users) NULLABLE,
assignee_email text,  -- fallback si no tiene cuenta
assignee_name text,
description text, due_date date NULLABLE,
priority text CHECK(priority IN ('alta','media','baja')),
status text CHECK(status IN ('pendiente','en_progreso','completado')) DEFAULT 'pendiente',
created_at timestamptz

-- 7. email_logs
id uuid PK, meeting_id uuid FK, recipient_email text,
type text CHECK(type IN ('personal','coordinator_summary')),
sent_at timestamptz, resend_id text, status text
```

---

## 3. ESTRUCTURA DE CARPETAS

```
zrnote/
├── apps/
│   ├── web/                          # Next.js 14
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── signup/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx              # home: lista reuniones recientes
│   │   │   │   ├── meetings/
│   │   │   │   │   ├── page.tsx          # historial
│   │   │   │   │   ├── new/page.tsx      # crear reunión
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx      # vista reunión + minuta
│   │   │   │   │       ├── record/page.tsx   # grabación (PWA)
│   │   │   │   │       └── speakers/page.tsx # mapeo hablantes
│   │   │   │   ├── action-items/page.tsx # mis tareas pendientes
│   │   │   │   └── admin/page.tsx        # super_admin only
│   │   │   └── api/
│   │   │       ├── meetings/
│   │   │       │   ├── route.ts          # GET list, POST create
│   │   │       │   └── [id]/
│   │   │       │       ├── route.ts      # GET, PATCH, DELETE
│   │   │       │       ├── upload-segment/route.ts
│   │   │       │       ├── finalize/route.ts
│   │   │       │       └── speaker-map/route.ts
│   │   │       ├── webhooks/
│   │   │       │   └── assemblyai/route.ts
│   │   │       └── jobs/
│   │   │           └── process-meeting/route.ts
│   │   ├── components/
│   │   │   ├── recorder/
│   │   │   │   ├── RecordButton.tsx      # botón grande, estado visual
│   │   │   │   ├── RecordTimer.tsx
│   │   │   │   └── SegmentAlert.tsx      # notif cada 60min
│   │   │   ├── minutes/
│   │   │   │   ├── MinuteView.tsx        # render completo minuta
│   │   │   │   ├── ActionItemsTable.tsx
│   │   │   │   └── SpeakerMapper.tsx     # UI para asignar nombres
│   │   │   └── ui/                       # shadcn components
│   │   └── lib/
│   │       ├── supabase/
│   │       │   ├── client.ts
│   │       │   └── server.ts
│   │       ├── r2.ts                     # upload/download Cloudflare R2
│   │       ├── assemblyai.ts             # submit + poll transcription
│   │       ├── claude.ts                 # generate minute from transcript
│   │       ├── resend.ts                 # send emails
│   │       └── queue.ts                  # BullMQ producers
│   └── worker/                       # proceso separado para jobs
│       ├── index.ts                  # BullMQ consumers
│       ├── jobs/
│       │   ├── transcribe.ts         # llama a AssemblyAI
│       │   ├── analyze.ts            # llama a Claude
│       │   └── send-emails.ts        # llama a Resend
│       └── prompts/
│           └── minute.ts             # prompt de Claude (ver sección 6)
├── packages/
│   └── types/                        # tipos compartidos TS
│       └── index.ts
├── supabase/
│   └── migrations/
│       └── 001_initial.sql           # todo el schema de arriba
├── .env.local
├── package.json                      # workspaces: ["apps/*","packages/*"]
└── railway.json
```

---

## 4. FLUJO DE DATOS (cómo conectan los módulos)

```
PRESENCIAL:
User → /record → graba mic → cada 60min: POST /upload-segment (audio → R2)
→ User presiona "Finalizar" → POST /finalize
→ finalize: cambia status a 'processing', encola job TRANSCRIBE_MEETING

VIRTUAL (Fase 2):
Bot Recall.ai → webhook → guarda audio en R2 → encola TRANSCRIBE_MEETING

WORKER — job TRANSCRIBE_MEETING(meeting_id):
  1. Lee audio_segments del meeting (R2 keys)
  2. Sube cada segmento a AssemblyAI (language_code: 'es', speaker_labels: true)
  3. Guarda transcript_ids en meeting
  4. AssemblyAI llama webhook /api/webhooks/assemblyai cuando termina cada segmento
  5. Cuando todos los segmentos = completed → une transcripciones → guarda transcript_raw + transcript_diarized
  6. Encola job ANALYZE_MEETING

WORKER — job ANALYZE_MEETING(meeting_id):
  1. Lee transcript_diarized
  2. Llama a Claude con prompt de sección 6
  3. Parsea JSON de respuesta → inserta en minutes + action_items
  4. Cambia status meeting → 'completed'
  5. Encola job SEND_EMAILS

WORKER — job SEND_EMAILS(meeting_id):
  1. Lee minutes + action_items + meeting_participants
  2. Para cada participante con action_items: envía correo personal (Resend)
  3. Envía correo resumen al coordinador
  4. Registra en email_logs
```

---

## 5. REGLAS DE GRABACIÓN (RecordButton / PWA)

```typescript
// Orden de implementación en RecordButton.tsx:
// 1. navigator.mediaDevices.getUserMedia({ audio: true })
// 2. MediaRecorder con mimeType: 'audio/webm;codecs=opus'
// 3. Cada 60 min: dataavailable event → blob → POST /upload-segment → reset recorder
// 4. WakeLock API para mantener pantalla (navigator.wakeLock.request('screen'))
// 5. Si pierde conexión: guardar blob en IndexedDB → retry cuando vuelva internet
// 6. Al finalizar: POST /finalize con total_segments count

// Estado visual del botón:
// idle → 'Iniciar Reunión' (gris)
// recording → 'Grabando...' + timer + pulso animado (rojo)
// uploading_segment → 'Guardando segmento...' (amarillo, no interrumpir)
// finalizing → 'Procesando...' (azul)
```

---

## 6. PROMPT DE CLAUDE (prompt/minute.ts)

```typescript
export const MINUTE_PROMPT = (transcript: string) => `
Eres ZRNote, sistema de minutas de Academia ZR.
Analiza la transcripción y responde SOLO con un JSON válido, sin texto adicional.

ESTRUCTURA JSON REQUERIDA:
{
  "summary": "string — resumen ejecutivo 3-5 oraciones",
  "topics": ["string"],
  "decisions": ["string"],
  "changes": ["string — qué cambia respecto a qué"],
  "action_items": [
    {
      "assignee_name": "string — nombre del responsable",
      "description": "string — tarea específica",
      "due_date": "YYYY-MM-DD o null",
      "priority": "alta|media|baja"
    }
  ],
  "next_steps": ["string"]
}

REGLAS:
- Si un hablante no tiene nombre, usa el label de la transcripción (ej: "Speaker 1")
- Solo extrae action items que sean compromisos reales (no sugerencias vagas)
- decisions = acuerdos oficiales tomados (afirmativo: "Se aprueba...", "Se decide...")
- changes = modificaciones a algo que ya existía
- Responde SOLO JSON. Cero texto fuera del JSON.

TRANSCRIPCIÓN:
${transcript}
`;
```

---

## 7. EMAILS — TEMPLATES (resend.ts)

```typescript
// Template personal (un correo por participante con action items):
// Asunto: [ZRNote] {meeting.title} — Tus compromisos
// Body: HTML con:
//   - H1: nombre del meeting + fecha
//   - Sección "Resumen": minute.summary
//   - Sección "Tus compromisos": tabla con SUS action_items solamente
//   - CTA: "Ver minuta completa" → link a /meetings/{id}
//   - Footer: "Generado automáticamente por ZRNote · Academia ZR"

// Template coordinador (uno por reunión):
// Asunto: [ZRNote] {meeting.title} — Resumen completo
// Body: HTML con:
//   - Todos los action items agrupados por responsable
//   - Tabla: Responsable | Tarea | Fecha límite | Prioridad
//   - Link a minuta completa
```

---

## 8. FASES DE DESARROLLO

### FASE 1 — MVP (implementar en este orden exacto)

```
[ ] 1. Setup monorepo (pnpm workspaces) + Supabase + Railway
[ ] 2. Schema SQL (supabase/migrations/001_initial.sql) + tipos TS compartidos
[ ] 3. Auth: login/signup con Supabase Auth (email/password)
[ ] 4. CRUD meetings: crear reunión, listar, ver detalle
[ ] 5. RecordButton PWA: grabación + segmentación c/60min + upload a R2
[ ] 6. Worker setup: BullMQ + Upstash Redis
[ ] 7. Job TRANSCRIBE_MEETING + webhook AssemblyAI
[ ] 8. Job ANALYZE_MEETING (Claude) + parseo JSON → DB
[ ] 9. MinuteView: render minuta completa en /meetings/[id]
[10. SpeakerMapper: UI para asignar "Speaker 1" → usuario real
[11. Job SEND_EMAILS (Resend) + email_logs
[12. Dashboard home: reuniones recientes + mis action items
[13. PWA manifest + service worker (para uso móvil offline)
```

### FASE 2 — Virtual + Pulido

```
[ ] Bot Recall.ai para Zoom/Meet/Teams
[ ] Notificaciones en tiempo real (Supabase Realtime) durante procesamiento
[ ] Exportar minuta a PDF (puppeteer o @react-pdf/renderer)
[ ] Panel admin: todas las reuniones de la organización
[ ] Búsqueda en minutas (pg full-text search)
```

### FASE 3 — Integraciones

```
[ ] Google Calendar: crear evento seguimiento al generar minuta
[ ] Notion API: crear página por reunión en workspace del equipo
[ ] Trello/Linear: crear tarjetas por action item
[ ] Slack: notificación al canal cuando la minuta está lista
```

### FASE 4 — SaaS

```
[ ] Multi-tenant: cada org tiene su schema aislado
[ ] Onboarding: signup org → invitar equipo → primera reunión
[ ] Stripe: planes de pago (Free / Pro / Team)
[ ] Landing page pública + marketing
```

---

## 9. CONVENCIONES DE CÓDIGO

```
- TypeScript estricto en todo. No usar 'any'.
- Server Components por defecto en Next.js. Client Components solo donde haya interactividad.
- API routes: validar con zod antes de tocar DB.
- Errores: siempre loggear con contexto (meeting_id, job_id). No swallowing errors.
- Jobs: siempre idempotentes (si se re-ejecutan no rompen ni duplican).
- Supabase: usar service_key solo en server/worker. Nunca en cliente.
- R2: las keys de audio siguen patrón: `{org_id}/{meeting_id}/segment_{n}.webm`
- Commits: feat/fix/chore + scope corto (ej: `feat(recorder): add wake lock`)
```

---

## 10. DECISIONES YA TOMADAS (no re-discutir)

| Decisión | Elegido | Razón |
|---|---|---|
| Transcripción | AssemblyAI | Mejor español + diarización nativa |
| LLM | Claude Sonnet | Contexto largo (200k), preciso en español |
| Storage audio | Cloudflare R2 | 10x más barato que S3 |
| Email | Resend | 3k/mes gratis, API limpia |
| DB | Supabase (Postgres) | Auth incluido, free tier generoso |
| Queue | BullMQ + Upstash | Sin infraestructura extra, free tier suficiente |
| Deploy | Railway | Monorepo, auto-deploy, barato vs AWS |
| Formato audio | webm/opus | Mejor compresión, soportado en todos los browsers modernos |
| Segmentación | 60 min | Balance entre tamaño de archivo y continuidad |

---

## 11. PREGUNTAS ABIERTAS (preguntar antes de implementar)

1. **Mapeo de usuarios**: ¿existe lista de correos del equipo para importar o se invitan manualmente?
2. **Presupuesto**: ~$35–50 USD/mes para MVP, ¿aprobado?
3. **Reuniones simultáneas**: ¿máximo cuántas al mismo tiempo? (define workers necesarios)
4. **Fase 1 virtual**: ¿incluir bot Meet/Zoom desde MVP o solo presencial?
5. **Dominio**: ¿tienen dominio propio para Railway deploy o usar el subdominio gratuito?

---

## 12. PARA EL AGENTE — CÓMO USAR ESTE ARCHIVO

```
INICIO DE SESIÓN:
  → Lee secciones 0, 1, 2 (contexto + stack + schema)
  → Pregunta en cuál fase estás y cuál ítem de la sección 8 toca implementar

DURANTE IMPLEMENTACIÓN:
  → Sección 3 = estructura de carpetas (no crear carpetas fuera de esto)
  → Sección 4 = flujo de datos (antes de tocar jobs o API)
  → Sección 6 = prompt exacto de Claude (no modificar sin avisar)
  → Sección 9 = convenciones (TypeScript estricto, zod, idempotencia)

CUANDO TENGAS DUDAS:
  → Sección 10 = decisiones ya tomadas (no re-preguntar)
  → Sección 11 = preguntas abiertas (sí preguntar)

TOKEN EFFICIENCY:
  → No re-leer secciones 0-2 en cada mensaje
  → Referenciar por número: "implementando sección 8 ítem 7"
  → Si algo no está en este archivo, preguntar antes de asumir
```

---

*ZRNote Roadmap v1.0 · Academia ZR · Junio 2026*
