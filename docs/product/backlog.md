# BACKLOG — ZRNote

> Lista priorizada de tareas pendientes, bugs conocidos, mejoras y deuda tecnica.  
> **Orden: Alta → Media → Baja**. Actualizar al final de cada sesion.

---

## 🔴 CRITICO (Bloquea funcionalidad core)

| # | Tarea | Detalle | Esfuerzo | Due |
|---|-------|---------|----------|-----|
| 1 | **~~Emails no llegan en produccion~~** | ✅ Resuelto en v1.10.0+. Email-outbox con idempotencia, retry con backoff, dedup por hash. Tabla `email_logs` confirma entregas. | — | Cerrado |
| 2 | **~~Migracion RLS 018 NO aplicada~~** | ✅ Aplicada en produccion. RLS sin recursion activa. | — | Cerrado |
| 3 | **Timeout Vercel 60s en reuniones largas** | Mitigado: transcripcion batch con rate limiting (20 RPM Groq), Gemini 1M context para analisis, audio persistido localmente antes de subir. Aun aplica el limite de 60s en Hobby; reuniones muy largas pueden necesitar plan Pro o mover a queue. | 2-4h | Backlog |
| 4 | **Rotar `extension.pem`** | La clave privada de la Chrome Extension esta en el repo. Generar nueva, actualizar ID de extension, re-publicar. | 1h | Inmediato |
| 5 | **Aplicar migracion 032 (atomic rate limit)** | `supabase/migrations/032_atomic_rate_limit.sql` pendiente en produccion. Necesaria para rate limiting correcto del pipeline. Pegar en Supabase → SQL Editor → Run. | 5 min | Inmediato |
| 6 | **Aplicar migracion 035 (content mode)** | `supabase/migrations/035_content_mode.sql` pendiente en produccion. Habilita modo Contenido (capitulos para podcasts/conferencias). Pegar en Supabase → SQL Editor → Run. | 5 min | Inmediato |

---

## 🟠 ALTA (Mejora significativa UX/robustez)

| # | Tarea | Detalle | Esfuerzo | Due |
|---|-------|---------|----------|-----|
| 7 | **Recall.ai bot para Meet/Zoom automatico** | Integracion oficial Recall.ai (gratis 100h/mes) → bot entra a reunion, graba, devuelve audio → elimina necesidad de PWA grabando desde el movil. | 1 semana | Proximo sprint |
| 8 | **Notificaciones realtime (Supabase Realtime)** | Push notifications ya implementadas (TWA + service worker), pero no Supabase Realtime. Suscribir a `minutes`, `action_items`, `meetings` → toast/badge en dashboard cuando cambie estado. | 3 dias | Proximo sprint |
| 9 | **Busqueda full-text minutas (pg_trgm)** | `CREATE EXTENSION pg_trgm; CREATE INDEX ... ON minutes USING gin (summary gin_trgm_ops);` + endpoint `/api/search`. | 1 dia | Proximo sprint |
| 10 | **Google Calendar OAuth + crear eventos** | Hoy se usa enfoque por URL (link directo a Calendar). Completar OAuth con token refresh, endpoint callback, UI "Conectar Calendar" en settings. Crear evento follow-up al finalizar minuta. | 3 dias | Proximo sprint |
| 11 | **Tests E2E (Playwright/Cypress)** | E2E: login → crear reunion → grabar 2 min → procesar → ver minuta → asignar tarea → email. Hoy hay 361 tests unitarios/integracion en 36 archivos, pero cero E2E. | 2 dias | Proximo sprint |
| 12 | **Subida directa >25MB (chunked upload a Storage)** | `direct-upload` hoy usa signed URL simple (limite 25MB Whisper). Para archivos >25MB: multipart upload a Supabase Storage (chunks 5MB) → concatenar en servidor → enviar a Whisper por partes. | 1 semana | Backlog |
| 13 | **Editar minuta/acuerdos a mano** | Post-generacion, el usuario no puede editar el texto de la minuta ni los action items. Agregar edicion inline con guardado. | 2-3 dias | Proximo sprint |
| 14 | **Poner fecha desde la app** | Hoy la fecha de la reunion solo se puede establecer via link de Calendar. Agregar date picker nativo en la creacion/edicion de reunion. | 1 dia | Proximo sprint |
| 15 | **Supabase quota (storage/transfer)** | El plan gratuito esta al limite de storage y transfer. Evaluar upgrade, limpiar archivos antiguos, o implementar politica de retencion mas agresiva. | 1 dia | Sprint actual |
| 16 | **Dividir `processing.ts` (~1600 lineas)** | Archivo monolitico con pipeline completo. Separar en modulos: `transcription.ts`, `analysis.ts`, `vectorization.ts`, `email-pipeline.ts`. | 1 dia | Proximo sprint |

---

## 🟡 MEDIA (Nice-to-have)

| # | Tarea | Detalle | Esfuerzo |
|---|-------|---------|----------|
| 17 | **Notion / Linear / Slack integrations** | Webhooks salientes al crear action_item. Un webhook generico + config por org. | 1 semana c/u |
| 18 | **Multi-tenant SaaS (Stripe + onboarding)** | `organizations` ya existe; falta billing, planes, trial, portal cliente. | 2 semanas |
| 19 | **Dashboard analytics (uso, minutos, coste Groq)** | Pagina `/dashboard/analytics` con graficos Recharts. | 3 dias |
| 20 | **Idiomas (i18n)** | Next.js `next-intl` o `i18next`. Espanol/Ingles minimo. | 2 dias |
| 21 | **Speaker diarization real (pyannote/WhisperX)** | Hoy "Speaker 1/2/3" viene del modelo. Integrar WhisperX (GPU) o pyannote.audio (HuggingFace) para diarizacion real. | 1 semana |
| 22 | **Offline-first PWA (Service Worker + IndexedDB)** | Grabar sin red → cola local → sync al reconectar. Workbox. Parcialmente implementado (audio se persiste en dispositivo). | 1 semana |
| 23 | **Audio player en minuta con timestamps** | Click en parrafo → salta al audio en ese segundo. Requiere `transcript_raw` con timestamps por palabra (Whisper `verbose_json`). | 3 dias |

---

## 🟢 BAJA (Deuda tecnica / Limpieza)

| # | Tarea | Detalle |
|---|-------|---------|
| 24 | **Unificar `safe-html.ts` (app + edge function)** | Hoy hay 2 copias. Crear package `@zrnote/safe-html` o importar desde shared. |
| 25 | **TypeScript strict: `noUncheckedIndexedAccess`** | Activar en `tsconfig.json` y fixear warnings. |
| 26 | **Bundle analyzer** | `npm run analyze` → identificar chunks pesados (FFmpeg ~2MB carga on-demand, OK). |
| 27 | **Storybook para componentes UI** | Documentar `RecordButton`, `UploadDropzone`, `AssignActionItems`, etc. |
| 28 | **Pre-commit hooks (husky + lint-staged)** | Evitar commits con `any`, `console.log`, tests rotos. |

---

## 📝 HISTORIAL DE VERSIONES

| Version | Fecha | Cambios clave |
|---------|-------|---------------|
| **1.28.0** | 2026-10-03 | Modo Contenido (capitulos para podcasts/conferencias/videos), pendientes sin dueno, resumenes mas directos |
| **1.27.0** | 2026-09-20 | Security audit, repo reorganization (docs movidos a `docs/`), migracion 032 atomic rate limit |
| **1.20.0+** | 2026-09 | Audio persistido en dispositivo antes de subir, upload queue, push notifications, TWA (Android wrapper), 2 bugs de perdida de audio cerrados |
| **1.18.0–1.19.0** | 2026-08 | Modo Estudio (flashcards Leitner 3 cajas, notas Feynman), cuaderno digital |
| **1.17.0** | 2026-08 | Estilos de minuta (ejecutiva/educativa) |
| **1.15.0–1.16.0** | 2026-08 | Boton instalar PWA, pagina de ayuda, distincion eventos vs tareas |
| **1.14.0** | 2026-08 | Filtro alucinaciones Whisper, upgrade Next 15, security audit |
| **1.12.0** | 2026-08 | Email dedup, links publicos de minutas, fix matching participantes |
| **1.10.0** | 2026-07-31 | Primer pipeline end-to-end completo, AAC re-mux, Gemini model discovery, Groq 413 handling |
| **1.0.3** | 2026-07-22 | FFmpeg.wasm para conversion .aac/.amr/.3gp → MP3 64kbps en navegador; boton "Convertir y comprimir" en subida; 26 tests |
| **1.0.2** | 2026-07-21 | Subida directa .aac a Storage (signed URL), RLS reset (mig 018), tests emails (12), XSS fix |
| **1.0.1** | 2026-07-21 | Rotacion real grabadora (stop/restart), fix escapeHtml (XSS), version system (`/api/version`), badge navbar |
| **1.0.0** | 2026-07-18 | MVP completo: auth, CRUD, grabacion, transcripcion, minuta, action items, emails, RAG, Chrome Ext, PDF, RGPD, cron |

---

## 🛠️ COMANDOS UTILES

```bash
# Desarrollo
npm run dev                    # Next.js dev server
npx vitest run                 # 361 tests en 36 archivos
npm run build                  # Build produccion (verifica tipos + lint)

# Deploy
git add -A && git commit -m "msg" && git push origin main  # Vercel auto-deploy
npx vercel deploy --prod --force                           # Deploy manual

# Debug produccion
npx vercel logs --level error --limit 20 --no-branch --expand
npx vercel inspect <deployment-url>
curl https://zrnote.vercel.app/api/version

# Supabase
# Migraciones: pegar SQL en Dashboard → SQL Editor → Run
# Logs: Dashboard → Logs → Postgres / Auth / Storage / Realtime / Edge Functions
```

---

## 🔑 SECRETOS EN VERCEL (Settings → Environment Variables)

| Variable | Requerida | Donde |
|----------|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Vercel + `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Vercel + `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Solo Vercel (Server) |
| `GROQ_API_KEY` | ✅ | Solo Vercel |
| `GEMINI_API_KEY` | ✅ | Solo Vercel |
| `JINA_API_KEY` | ✅ | Solo Vercel |
| `GMAIL_USER` | ✅ | Solo Vercel |
| `GMAIL_APP_PASSWORD` | ✅ | Solo Vercel (App Password 16 digitos, 2FA on) |
| `CRON_SECRET` | ✅ | Solo Vercel (protege endpoints cron) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Vercel (`https://zrnote.vercel.app`) |
| `MINUTE_LINK_SECRET` | Opcional | Solo Vercel (firma links publicos de minutas) |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | Auto | Inyectado por Vercel en build |
| `VERCEL_GIT_COMMIT_SHA` | Auto | Inyectado por Vercel en build |

> **Nota:** `.env.local` local es un stub (valores vacios). Los secretos reales **solo estan en Vercel**.

---

## 📂 ARCHIVOS CLAVE (para auditoria rapida)

| Archivo | Que hace |
|---------|----------|
| `src/components/recorder/RecordButton.tsx` | **Motor de grabacion** — rotacion stop/restart 30s, wake lock, media session, subidas serializadas |
| `src/lib/processing.ts` | Pipeline core (~1600 lineas): `transcribeMeeting`, `analyzeMeeting`, `vectorizeMeeting`, `sendMeetingEmails` |
| `src/lib/pipeline-client.ts` | Cliente frontend del pipeline: polling, retry, estado UI |
| `src/lib/minute-styles.ts` | Estilos de minuta: ejecutiva, educativa, modo contenido |
| `src/lib/study-aids.ts` | Generacion de ayudas de estudio: flashcards, notas Feynman |
| `src/lib/chapters.ts` | Deteccion de capitulos/secciones para modo Contenido |
| `src/lib/flashcard-deck.ts` | Motor de flashcards con algoritmo Leitner (3 cajas) |
| `src/lib/audio-conversion.ts` | **FFmpeg.wasm** — hook `useAudioConverter`, convierte .aac/.amr/.3gp → MP3/Opus en navegador |
| `src/app/dashboard/meetings/[id]/upload/page.tsx` | UI subida: drag&drop, split 30s, compresion, direct-upload .aac |
| `src/app/api/meetings/[id]/direct-upload/route.ts` | Signed URL upload a Supabase Storage (bypass 4.5MB Vercel) |
| `src/app/api/meetings/[id]/process/route.ts` | Pipeline por pasos: `transcribe`, `analyze`, `vectorize`, `emails` |
| `src/lib/email-service.ts` | Emails: `buildMinuteHtml`, `matchItemsToParticipant`, `sendWithRetry` |
| `src/lib/safe-html.ts` | `escapeHtml` — **XSS fix** (entidades reales) |
| `vercel.json` | Function durations + crons (`retry-stuck` cada 2min, `retention` 3AM) |

---

*Actualizado: 2026-10-05 — v1.28.0 en desarrollo (branch develop)*
