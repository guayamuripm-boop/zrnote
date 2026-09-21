# Visión de arquitectura

Mapa de cómo encajan las piezas. El estado día a día y el historial de arreglos están en [`project-context.md`](project-context.md); aquí solo la forma del sistema.

## Diagrama

```
 Navegador / PWA ─────────────┐         Extensión de Chrome (MV3)
  · graba (MediaRecorder)     │          · captura la pestaña (Meet/Zoom/Teams)
  · guarda el audio en        │          · Bearer token de Supabase
    IndexedDB ANTES de subir  │                    │
  · cola de subida durable    │                    │
  · orquesta el pipeline      │                    │
        │  cookie de sesión   │                    │
        ▼                     ▼                    ▼
 ┌────────────────────────────────────────────────────────────┐
 │  Next.js en Vercel                                         │
 │  middleware.ts  → sesión, redirecciones, CORS              │
 │  /api/*         → getAuthedUser() + Zod + checkRateLimit() │
 │  /minuta/[token]→ página pública (token HMAC, sin cuenta)  │
 │  /api/cron/*    → assertCron() (Bearer CRON_SECRET)        │
 └───────┬───────────────────┬───────────────────┬────────────┘
         │                   │                   │
         ▼                   ▼                   ▼
   Supabase              Proveedores IA       Gmail SMTP
   · Postgres + RLS      · Groq (Whisper,     · minutas y
   · Storage (audio)       Llama)               recordatorios
   · Auth                · Gemini (minuta)
   · pgvector            · Jina (embeddings)
```

## El pipeline

El navegador orquesta; el servidor ejecuta pasos cortos e idempotentes (límite de 10–60 s por función en Vercel Hobby).

```
subir fragmentos ──► transcribir ──► analizar ──► correos          (camino crítico)
 upload-segment /    processing.ts    processing.ts   meeting-emails.ts
 direct-upload       transcribeMeeting analyzeMeeting  + email-outbox.ts
                                                         │
                                       vectorizar ◄──────┘ (aparte; nunca marca la reunión como fallida)
```

- **`src/lib/pipeline-client.ts`** — bucle del cliente: reintenta ante fallos de red y espera ante 429 en vez de rendirse.
- **`src/lib/processing.ts`** — los pasos: Whisper por lotes (pausa entre lotes por el límite de 20 RPM de Groq), redacción con Gemini y caída a Llama, parseo tolerante del JSON de la minuta.
- **`src/lib/email-outbox.ts`** — idempotencia de correos: un reintento no duplica envíos.
- **Persistencia del audio:** `recording-store.ts` (IndexedDB) guarda cada fragmento en el dispositivo antes de subirlo; `upload-queue.ts` lo sube con reintento. Ver el [runbook 05](../runbooks/05-transcripcion-y-legibilidad.md).
- **Registro atómico de fragmentos:** la RPC de la migración 027 evita que dos subidas simultáneas se pisen `meetings.audio_segments`.

## Autenticación

| Origen | Mecanismo | Dónde |
|---|---|---|
| Web/PWA | Cookies SSR de Supabase | `middleware.ts` + `lib/supabase/server.ts` |
| Extensión | `Authorization: Bearer <access token>` | `lib/api-auth.ts` → `getAuthedUser()` |
| Cron de Vercel | `Authorization: Bearer $CRON_SECRET` | `lib/cron-auth.ts` → `assertCron()` |
| Participante sin cuenta | Token HMAC firmado en la URL | `lib/minute-links.ts` |

`getAuthedUser()` rechaza explícitamente la clave de servicio como Bearer.

## Estructura de `src/lib` (agrupada por dominio)

`src/lib` es plano por historia; estos son sus dominios reales. Los prefijos de nombre ya los delatan, y una reagrupación en subcarpetas está propuesta (ver *Deuda conocida*).

| Dominio | Archivos |
|---|---|
| **Pipeline** | `processing`, `pipeline-client`, `retry-backoff`, `segment-selection`, `whisper-quality`, `llm-fallback`(test), `gemini-models`(test) |
| **Audio** | `audio-compression`, `audio-conversion`, `audio-mixer`, `audio-segments`, `audio-split`, `audio-wav`, `background-audio`, `mic-health`, `recording-store`, `upload-queue`, `offline-transcribe` |
| **Minuta** | `minute-text`, `minute-styles`, `minute-copy-format`, `minute-cache`, `minute-pdf`, `summary-length`, `study-aids`, `flashcard-deck`, `readable-text`, `auto-title` |
| **Correo** | `smtp`, `email-service`, `email-outbox`, `meeting-emails`, `reminders`, `ics`, `google-calendar` |
| **Reuniones** | `meeting-lifecycle`, `meeting-queue`, `action-items`, `share-stash` |
| **Seguridad** | `api-auth`, `cron-auth`, `cors`, `rate-limiter`, `minute-links`, `safe-html`, `validators` |
| **Plataforma** | `env`, `logger`, `app-url`, `version`, `embeddings`, `supabase/{client,server,admin}` |

## Componentes (`src/components`)

Agrupados por dominio cuando hay varios: `recorder/`, `minutes/`, `study/`, `legal/`, `landing/`. Los sueltos en la raíz son botones y widgets compartidos.

## Base de datos

31 migraciones + `032_atomic_rate_limit`. RLS activo en todas las tablas, con funciones `SECURITY DEFINER` para evitar la recursión de políticas (historia en las migraciones 007, 017 y 018). Las migraciones llevan su reversión comentada al final. El SQL que **no** es una migración vive en [`supabase/scripts`](../../supabase/scripts).

## Deuda conocida

Priorizada en [`../security/audit-2026-09-20.md`](../security/audit-2026-09-20.md#deuda-técnica). Resumen:

1. `processing.ts` (~1600 líneas) mezcla transcripción, análisis, vectorización y correo → dividir por paso.
2. Unos 120 `: any`, sobre todo el cliente de Supabase → generar tipos con `supabase gen types`.
3. `src/lib` plano de ~80 archivos → subcarpetas por dominio (mecánico, pero toca cientos de imports).
4. `supabase/functions/_shared` duplica `email-service` y `safe-html` (Deno no comparte código con Next) → riesgo de divergencia. Ese mismo patrón (dos implementaciones del correo) ya produjo un XSS entre el pipeline y la ruta manual (auditoría 2026-07-30).
