# Modelo de seguridad

Qué protege ZRNote, contra quién, y con qué control. Cada fila apunta al archivo donde vive el control, para poder verificarlo.

## Activos

| Activo | Por qué importa |
|---|---|
| Audio y transcripciones de reuniones | Contenido privado de terceros (a menudo menores y alumnos); afecta al RGPD |
| Clave de servicio de Supabase | Salta todo el RLS: quien la tenga lee la base entera |
| Claves de IA y Gmail | Coste y cuota reales; una fuga es dinero |
| Clave de firma de la extensión | Permite publicar una actualización maliciosa a todos los instalados |
| `MINUTE_LINK_SECRET` | Permite fabricar enlaces a cualquier minuta |

## Superficies y controles

| Superficie | Amenaza | Control | Dónde |
|---|---|---|---|
| Rutas `/api/*` | Acceso sin sesión | `getAuthedUser()`; RLS como segunda barrera | `lib/api-auth.ts` |
| Rutas `/api/*` | Usar la clave de servicio como credencial | Rechazo explícito como Bearer; ninguna ruta acepta la clave como identidad | `lib/api-auth.ts`, [ADR 0002](../adr/0002-no-service-key-as-credential.md) |
| Crons | Invocación anónima (borran audio) | `assertCron()`, falla cerrado (503 sin secreto) | `lib/cron-auth.ts` |
| Coste de IA/correo | Ráfagas que agotan cuota | `checkRateLimit()` atómico; ver tabla de límites | `lib/rate-limiter.ts`, [ADR 0001](../adr/0001-atomic-rate-limiting.md) |
| Navegador | CSRF de acciones con efecto | Cookies `SameSite=Lax`, CORS por lista blanca, sin acciones por GET (el logout es POST) | `middleware.ts`, `lib/cors.ts`, `api/auth/signout` |
| Navegador | CORS con credenciales desde webs de terceros | Solo `chrome-extension://<32 letras>` y localhost fuera de producción | `lib/cors.ts` |
| Navegador | XSS | CSP completa; `escapeHtml()` en todo el HTML de correo; sanitizador para documentos legales | `next.config.js`, `lib/safe-html.ts` |
| Navegador | Clickjacking / sniffing | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS en producción | `next.config.js` |
| Enlaces públicos | Fabricar o adivinar enlaces | HMAC-SHA256, `timingSafeEqual`, caducidad, `noindex`; no expone la transcripción literal | `lib/minute-links.ts`, `app/minuta/[token]` |
| Subidas | Tipos peligrosos, path traversal, tamaño | Lista blanca de tipos, tope de tamaño, extensión saneada, ruta construida con `org_id` de la base | `api/meetings/[id]/upload-segment`, `direct-upload` |
| Datos personales | Consentimiento falso o ruido en el registro | Zod con lista cerrada de `doc_type` (espejo del CHECK de la base) | `api/legal/consent` |
| Cuenta | Borrado accidental o por sesión robada | Exige confirmación textual y reautenticación con contraseña | `api/user/delete` |
| Secretos | Fuga en URLs/logs | Claves de IA por cabecera, no por query string; sin `NEXT_PUBLIC_` en secretos | `lib/processing.ts`, `lib/env.ts` |

### Límites de tasa vigentes

| Clave | Ruta | Límite |
|---|---|---|
| `<userId>:<meetingId>:process` | `/api/meetings/[id]/process` | 10 / min por reunión |
| `agent:<userId>` | `/api/agent/query` | 10 / min |
| `send-emails:<userId>` | `/api/meetings/[id]/send-emails` | 10 / min |
| `<userId>:process:all` | `/api/meetings/[id]/process` | 40 / min por usuario, todas las reuniones |
| `upload:<userId>` | `/upload-segment` | 120 / min (una cola offline se vacía en ráfagas) |
| `create-meeting:<userId>` | `POST /api/meetings` | 30 / min |

## Reglas para código nuevo

1. **Ninguna ruta se autentica con un secreto compartido salvo los crons.** Si hace falta una llamada máquina-a-máquina, se hace directamente en el código servidor, no por HTTP.
2. **El cliente admin (`getSupabaseAdmin()`) solo después de autorizar** por sesión, token firmado o `assertCron`. Y filtra por dueño explícitamente: el RLS no te protege con esa clave.
3. **Todo lo que gasta cuota lleva `checkRateLimit`.**
4. **Entrada de usuario con Zod**; los enums espejan los CHECK de la base.
5. **Errores al cliente sin `error.message` crudo de Supabase** (revela tablas y columnas). Usa `serverError()` (`lib/api-errors.ts`).
6. **Secretos**: ni en URLs, ni en logs, ni en `NEXT_PUBLIC_*`.

## Riesgos aceptados

| Riesgo | Por qué se acepta | Mitigación |
|---|---|---|
| CSP con `unsafe-eval` y `unsafe-inline` | ffmpeg.wasm y el runtime de Next lo exigen hoy | Todo el HTML dinámico se escapa; ver plan de aislar ffmpeg en un Worker en la auditoría |
| Sin CSRF token explícito | `SameSite=Lax` + CORS por lista blanca cubren los navegadores actuales | No hay acciones por GET |
| Rate limiter falla abierto ante un error de base de datos | Una caída del limitador no debe tumbar la app | Se registra con `logger.error` |
