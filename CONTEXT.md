# ZRNote — Contexto Maestro del Proyecto
> **Fuente de verdad única.** Leer al inicio de cada sesión, actualizar al final.

---

## 🚦 ESTADO: MVP desplegado (v1.5.0, 2026-07-30)

Build ✅ · TypeScript ✅ · 80 tests ✅ · **En producción** en https://zrnote.vercel.app

Ya aplicado en producción en esta sesión:
- ✅ Migración `020_mvp_hardening_and_legal_v2.sql` ejecutada vía Management API.
- ✅ `CRON_SECRET` configurado en Vercel (verificado: `/api/cron/retention` responde 401 sin él).
- ✅ Despliegue a producción y endpoints verificados.

**Pendiente y solo tú puedes hacerlo:**
1. **Rotar la clave de firma de la extensión** — `extension.pem` estuvo versionada en un repo público.
2. **Commitear el código.** El despliegue se hizo subiendo los archivos locales, no desde GitHub: el repo sigue con la versión anterior. Si Vercel vuelve a desplegar desde `main`, revierte todo esto.
3. **Probar la extensión en una reunión real** (reescrita, no verificada en vivo — ver `extension/README.md`).

### Cómo ejecutar SQL en producción (la conexión directa está bloqueada)
`supabase db query`/`db push` cuelgan: el host `db.*.supabase.co` no publica registro A y el CLI intenta Postgres directo. La vía que funciona es la Management API por HTTPS:
```bash
curl -X POST "https://api.supabase.com/v1/projects/qmdcpcwigzebqcoeiebi/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d '{"query":"select 1"}'
```

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

| Prioridad | Qué | Por qué |
|---|---|---|
| Alta | Probar la extensión en una reunión real | Reescrita pero sin verificar en vivo |
| Alta | Procesamiento en servidor (worker) para no depender de la pestaña abierta | Es la fricción número uno que queda |
| Media | Que los participantes puedan ver la minuta sin ser el creador | Hoy la reunión es solo del creador |
| Media | Búsqueda full-text de minutas | Barata (`pg_trgm`) y muy útil |
| Baja | UI de búsqueda semántica (RAG) | El backend ya existe |

---

*Última actualización: 2026-07-30 — v1.5.0. Auditoría funcional completa (17 bugs + 8 problemas de seguridad), capa legal de consentimiento, PWA real por primera vez, grabación en segundo plano, extensión reescrita, y despliegue a producción con la migración 020 aplicada. Build ✅ · tsc ✅ · 80/80 tests ✅.*
