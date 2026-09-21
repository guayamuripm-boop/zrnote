# ADR 0002 — La clave de servicio nunca es una credencial de petición

**Estado:** aceptada · **Fecha:** 2026-09-20

## Contexto

`getAuthedUser()` ya rechazaba la clave de servicio de Supabase como Bearer. Pero `/api/meetings/[id]/send-emails` tenía su propia comprobación: si la cabecera coincidía con la clave de servicio, la petición se consideraba «interna», se saltaba la autenticación y se quitaba el filtro `created_by`. Era una segunda puerta que contradecía la primera regla.

Una clave que salta todo el RLS no debería viajar nunca en una petición HTTP: cualquier log, proxy o mensaje de error que la filtre se convierte en acceso total. Además, ningún código llamaba a esa vía: el pipeline automático usa `buildMeetingEmailJobs`/`dispatchEmailJobs` directamente, sin HTTP.

## Decisión

1. **Ninguna ruta acepta la clave de servicio, ni un secreto compartido nuevo, como identidad.** La ruta `send-emails` es solo para el propietario de la reunión.
2. Se eliminó la vía «interna» en lugar de sustituirla por un `INTERNAL_API_SECRET`: un secreto compartido más es una superficie más, y aquí no había llamador que lo justificara.
3. La excepción son los crons de Vercel, que sí necesitan un secreto (`CRON_SECRET`) porque Vercel invoca por HTTP. Fallan cerrados (`assertCron`).
4. El cliente admin se obtiene únicamente con `getSupabaseAdmin()` y **después** de autorizar por otra vía.

## Consecuencias

- (+) Una sola forma de autenticarse por ruta; una fuga de la clave de servicio ya no abre `send-emails`.
- (+) Sin variable de entorno nueva que gestionar.
- (−) Si en el futuro algo ajeno necesita disparar correos por HTTP, habrá que diseñar esa vía a propósito (token de alcance limitado, no la clave maestra).
