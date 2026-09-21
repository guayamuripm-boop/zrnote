# BACKLOG — ZRNote

> Lista priorizada de tareas pendientes, bugs conocidos, mejoras y deuda técnica.  
> **Orden: Alta → Media → Baja**. Actualizar al final de cada sesión.

---

## 🔴 CRÍTICO (Bloquea funcionalidad core)

| # | Tarea | Detalle | Esfuerzo | Due |
|---|-------|---------|----------|-----|
| 1 | **Emails no llegan en producción** | `GMAIL_USER` y `GMAIL_APP_PASSWORD` están en Vercel, pero no hay confirmación de que funcionen. Revisar `email_logs` tabla + logs Vercel tras procesar reunión real. Si fallan: validar App Password (2FA obligatoria en cuenta Gmail) y `transporter.verify()` en `/api/health` o endpoint dedicado. | 1h | Inmediato |
| 2 | **Migración RLS 018 NO aplicada en Supabase** | El archivo está en repo (`supabase/migrations/018_rls_reset_no_recursion.sql`) pero **no se ha ejecutado en SQL Editor**. Sin ella: `infinite recursion detected in policy for relation "meetings"` al crear reuniones. **Pegar completo en Supabase → SQL Editor → Run.** | 5 min | Inmediato |
| 3 | **Timeout Vercel 60s en reuniones >45 min** | Pipeline `transcribe` usa batch de 3 segmentos y `more: true`, pero si hay muchos segmentos (>180) el loop de polling en UI puede exceder 60s. Edge Function `process-meeting` ya no tiene límite, pero el flujo **frontend-driven** (polling `/process`) sí. Mover transcripción completa a `processing_queue` + worker o aumentar `maxDuration` en `vercel.json` (máx 300s Pro, 60s Hobby). | 2-4h | Sprint actual |

---

## 🟠 ALTA (Mejora significativa UX/robustez)

| # | Tarea | Detalle | Esfuerzo | Due |
|---|-------|---------|----------|-----|
| 4 | **Recall.ai bot para Meet/Zoom automático** | Integración oficial Recall.ai (gratis 100h/mes) → bot entra a reunión, graba, devuelve audio → elimina necesidad de PWA grabando desde el móvil. | 1 semana | Próximo sprint |
| 5 | **Notificaciones realtime (Supabase Realtime)** | Suscribir a `minutes`, `action_items`, `meetings` → toast/badge en dashboard cuando cambie estado. | 3 días | Próximo sprint |
| 6 | **Búsqueda full-text minutas (pg_trgm)** | `CREATE EXTENSION pg_trgm; CREATE INDEX ... ON minutes USING gin (summary gin_trgm_ops);` + endpoint `/api/search`. | 1 día | Próximo sprint |
| 7 | **Google Calendar OAuth + crear eventos** | Completar `google-calendar.ts` con token refresh, endpoint callback, UI "Conectar Calendar" en settings. Crear evento follow-up al finalizar minuta. | 3 días | Próximo sprint |
| 8 | **Tests de integración reales (Playwright/Cypress)** | E2E: login → crear reunión → grabar 2 min → procesar → ver minuta → asignar tarea → email. Hoy solo unit tests. | 2 días | Próximo sprint |
| 9 | **Subida directa >25MB (chunked upload a Storage)** | `direct-upload` hoy usa signed URL simple (límite 25MB Whisper). Para archivos >25MB: multipart upload a Supabase Storage (chunks 5MB) → concatenar en servidor → enviar a Whisper por partes. | 1 semana | Backlog |

---

## 🟡 MEDIA (Nice-to-have)

| # | Tarea | Detalle | Esfuerzo |
|---|-------|---------|----------|
| 10 | **Notion / Linear / Slack integrations** | Webhooks salientes al crear action_item. Un webhook genérico + config por org. | 1 semana c/u |
| 11 | **Multi-tenant SaaS (Stripe + onboarding)** | `organizations` ya existe; falta billing, planes, trial, portal cliente. | 2 semanas |
| 12 | **Dashboard analytics (uso, minutos, coste Groq)** | Página `/dashboard/analytics` con gráficos Recharts. | 3 días |
| 13 | **Idiomas (i18n)** | Next.js `next-intl` o `i18next`. Español/Inglés mínimo. | 2 días |
| 14 | **Speaker diarization real (pyannote/WhisperX)** | Hoy "Speaker 1/2/3" es dummy. Integrar WhisperX (GPU) o pyannote.audio (HuggingFace) para diarización real. | 1 semana |
| 15 | **Offline-first PWA (Service Worker + IndexedDB)** | Grabar sin red → cola local → sync al reconectar. Workbox. | 1 semana |
| 16 | **Audio player en minuta con timestamps** | Click en párrafo → salta al audio en ese segundo. Requiere `transcript_raw` con timestamps por palabra (Whisper `verbose_json`). | 3 días |

---

## 🟢 BAJA (Deuda técnica / Limpieza)

| # | Tarea | Detalle |
|---|-------|---------|
| 17 | **Migrar `processing.test.ts` a tests reales** | Hoy solo `typeof transcribeMeeting === 'function'`. Mockear Groq + Supabase y probar flujo completo. |
| 18 | **Eliminar `console.error` override en `processing.ts`** | Parche temporal para bug `RangeError: %Z` de nodemailer. Mejor: fixear nodemailer o usar `pino` logger. |
| 19 | **Unificar `safe-html.ts` (app + edge function)** | Hoy hay 2 copias. Crear package `@zrnote/safe-html` o importar desde shared. |
| 20 | **TypeScript strict: `noUncheckedIndexedAccess`** | Activar en `tsconfig.json` y fixear warnings. |
| 21 | **Bundle analyzer** | `npm run analyze` → identificar chunks pesados (FFmpeg ~2MB carga on-demand, OK). |
| 22 | **Storybook para componentes UI** | Documentar `RecordButton`, `UploadDropzone`, `AssignActionItems`, etc. |
| 23 | **Pre-commit hooks (husky + lint-staged)** | Evitar commits con `any`, `console.log`, tests rotos. |

---

## 📝 HISTORIAL DE VERSIONES

| Versión | Fecha | Cambios clave |
|---------|-------|---------------|
| **1.0.3** | 2026-07-22 | FFmpeg.wasm para conversión .aac/.amr/.3gp → MP3 64kbps en navegador; botón "Convertir y comprimir" en subida; 26 tests |
| **1.0.2** | 2026-07-21 | Subida directa .aac a Storage (signed URL), RLS reset (mig 018), tests emails (12), XSS fix |
| **1.0.1** | 2026-07-21 | Rotación real grabadora (stop/restart), fix escapeHtml (XSS), version system (`/api/version`), badge navbar |
| **1.0.0** | 2026-07-18 | MVP completo: auth, CRUD, grabación, transcripción, minuta, action items, emails, RAG, Chrome Ext, PDF, RGPD, cron |

---

## 🛠️ COMANDOS ÚTILES

```bash
# Desarrollo
npm run dev                    # Next.js dev server
npx vitest run                 # Tests unitarios
npm run build                  # Build producción (verifica tipos + lint)

# Deploy
git add -A && git commit -m "msg" && git push origin main  # Vercel auto-deploy
npx vercel deploy --prod --force                           # Deploy manual

# Debug producción
npx vercel logs --level error --limit 20 --no-branch --expand
npx vercel inspect <deployment-url>
curl https://zrnote.vercel.app/api/version

# Supabase
# Migraciones: pegar SQL en Dashboard → SQL Editor → Run
# Logs: Dashboard → Logs → Postgres / Auth / Storage / Realtime / Edge Functions
```

---

## 🔑 SECRETOS EN VERCEL (Settings → Environment Variables)

| Variable | Requerida | Dónde |
|----------|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Vercel + `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Vercel + `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Solo Vercel (Server) |
| `GROQ_API_KEY` | ✅ | Solo Vercel |
| `JINA_API_KEY` | ✅ | Solo Vercel |
| `GMAIL_USER` | ✅ | Solo Vercel |
| `GMAIL_APP_PASSWORD` | ✅ | Solo Vercel (App Password 16 dígitos, 2FA on) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Vercel (`https://zrnote.vercel.app`) |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | Auto | Inyectado por Vercel en build |
| `VERCEL_GIT_COMMIT_SHA` | Auto | Inyectado por Vercel en build |

> **Nota:** `.env.local` local es un stub (valores vacíos). Los secretos reales **solo están en Vercel**.

---

## 📂 ARCHIVOS CLAVE (para auditoría rápida)

| Archivo | Qué hace |
|---------|----------|
| `src/components/recorder/RecordButton.tsx` | **Motor de grabación** — rotación stop/restart 30s, wake lock, media session, subidas serializadas |
| `src/lib/processing.ts` | Pipeline core: `transcribeMeeting`, `analyzeMeeting`, `vectorizeMeeting`, `sendMeetingEmails` |
| `src/lib/audio-conversion.ts` | **FFmpeg.wasm** — hook `useAudioConverter`, convierte .aac/.amr/.3gp → MP3/Opus en navegador |
| `src/app/dashboard/meetings/[id]/upload/page.tsx` | UI subida: drag&drop, split 30s, compresión, **botón "Convertir y comprimir"**, direct-upload .aac |
| `src/app/api/meetings/[id]/direct-upload/route.ts` | Signed URL upload a Supabase Storage (bypass 4.5MB Vercel) para formatos indecodificables |
| `src/app/api/meetings/[id]/process/route.ts` | Pipeline por pasos: `transcribe`, `analyze`, `vectorize`, `emails` |
| `supabase/functions/process-meeting/index.ts` | Edge Function worker asíncrono (sin límite 60s) |
| `vercel.json` | Function durations + crons (`retry-stuck` cada 2min, `retention` 3AM) |
| `supabase/migrations/018_rls_reset_no_recursion.sql` | **Fix crítico RLS** — ejecutar en SQL Editor |
| `src/lib/email-service.ts` | Emails: `buildMinuteHtml`, `matchItemsToParticipant`, `sendWithRetry` |
| `src/lib/safe-html.ts` | `escapeHtml` — **XSS fix** (entidades reales) |

---

*Actualizado: 2026-07-22 — v1.0.3 desplegado*