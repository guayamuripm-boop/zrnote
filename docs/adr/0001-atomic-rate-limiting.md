# ADR 0001 — Limitación de tasa atómica en Postgres

**Estado:** aceptada · **Fecha:** 2026-09-20

## Contexto

El limitador guardaba un contador por clave en la tabla `rate_limits` y operaba con tres sentencias: leer, comparar, escribir. Con peticiones concurrentes todas leían el mismo valor, todas pasaban la comprobación y todas escribían el mismo incremento. Diez peticiones simultáneas contaban como una. Cada petición extra a `/process` o `/agent/query` consume cuota real de Groq/Gemini/Jina.

Ya hay Postgres en el stack y el plan gratuito no incluye Redis, así que un almacén nuevo no compensa.

## Decisión

La decisión se toma **dentro** de la base, en una sola sentencia: `check_rate_limit(key, max, window_ms)` hace `INSERT … ON CONFLICT DO UPDATE … RETURNING count`. El bloqueo de fila que toma `ON CONFLICT` serializa las llamadas concurrentes sobre la misma clave.

- `SECURITY DEFINER` y `EXECUTE` solo para `service_role`: un usuario no puede resetear ni leer contadores.
- El cliente la llama por RPC; **falla abierto** ante errores de infraestructura (registrando `error`), porque un limitador caído no debe tumbar la app.
- Si la función no existe aún (`PGRST202`), cae a la ruta antigua y avisa en los logs, para que el despliegue del código no dependa de aplicar la migración en el mismo minuto.

## Consecuencias

- (+) Sin ventana de carrera; sin infraestructura nueva.
- (+) Los topes se ajustan por llamada (`{ max, windowMs }`).
- (−) Una ida a la base por petición limitada (ya era así).
- (−) Ventana fija, no deslizante: en el borde entre ventanas se admiten hasta 2× el tope. Aceptable para proteger cuota; si hiciera falta precisión, pasar a *token bucket* en la misma función.
- La ruta antigua es temporal: **borrar `legacyCheck` cuando la migración 032 esté aplicada en producción.**
