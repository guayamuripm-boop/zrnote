# Runbooks de ZRNote

Un runbook por subsistema. Cada uno responde a las mismas cuatro preguntas:

1. **Cómo funciona** — el diagrama y la idea central, no el detalle del código.
2. **Qué se arregló y por qué** — el síntoma que veía el usuario, la causa real.
3. **Diagnóstico** — qué mirar, en qué orden, cuando falla.
4. **Cómo retroceder** — los comandos exactos y qué se pierde al hacerlo.

> Regla: si tuviste que investigar algo más de diez minutos, va al runbook.
> El objetivo es no volver a investigarlo nunca.

| # | Runbook | Cubre |
|---|---|---|
| [00](00-respaldo-y-restauracion.md) | Respaldo y restauración | Puntos de restauración, cómo volver atrás, respaldo de la base |
| [01](01-correo.md) | Sistema de correo | Minutas, recordatorios, idempotencia, cuota, diagnóstico de «no llegan» |
| [02](02-enlaces-publicos.md) | Enlaces públicos y bajas | Vista de minuta sin cuenta, tokens firmados, baja de un clic |
| [03](03-guia-de-prueba-v1.12.md) | **Guía de prueba v1.12** | Qué comprobar antes de dar por buena esta versión |

## Pendientes de escribir

| Subsistema | Cuándo |
|---|---|
| Pipeline de procesado (transcribir → minuta → correos) | Al tocarlo la próxima vez |
| Audio: grabación, troceado y subida | Al tocarlo la próxima vez |
| Autenticación y RLS | Al tocarlo la próxima vez |
| Legal: consentimiento, retención, RGPD | Al tocarlo la próxima vez |

## Documentos relacionados

- [`CONTEXT.md`](../../CONTEXT.md) — estado general del proyecto, fuente de verdad
- [`BACKLOG.md`](../../BACKLOG.md) — tareas pendientes priorizadas
- `supabase/migrations/*.sql` — cada migración lleva su propio SQL de reversión comentado al final
