# ZRNote

Actas de reunión automáticas: graba (o sube) el audio, y ZRNote lo transcribe, redacta la minuta, extrae los compromisos y los envía por correo. Pensado para academias y equipos pequeños; corre íntegramente en capas gratuitas.

**Versión actual:** ver [`src/lib/version.ts`](src/lib/version.ts) · **Producción:** Vercel + Supabase

## Stack

| Capa | Tecnología |
|---|---|
| Web / PWA | Next.js 15 (App Router) · React 19 · Tailwind |
| Datos y auth | Supabase (Postgres + RLS, Auth, Storage, pgvector) |
| Transcripción | Groq Whisper large-v3 (y Whisper local vía ONNX en el navegador, sin conexión) |
| Redacción de la minuta | Gemini (preferente) con caída a Llama 3.3 en Groq |
| Búsqueda semántica | Jina embeddings + pgvector |
| Correo | Gmail SMTP (nodemailer) |
| Hosting / cron | Vercel |
| Cliente auxiliar | Extensión de Chrome (Manifest V3) para Meet / Zoom / Teams |

## Arranque rápido

```bash
npm install
cp .env.example .env.local     # rellena las claves; cada variable está comentada
npm run dev                    # http://localhost:3000
```

Las migraciones de base de datos están en [`supabase/migrations`](supabase/migrations) (numeradas, en orden) y se aplican desde el SQL Editor de Supabase o con la CLI.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (lo que ejecuta Vercel) |
| `npm test` | Suite de tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |

Antes de subir cambios: `npm run typecheck && npm test`.

## Estructura del repositorio

```
├── src/
│   ├── app/                 Rutas (App Router): páginas, /api/*, /minuta, /legal…
│   ├── components/          Componentes de UI, agrupados por dominio (recorder, minutes, study, legal, landing)
│   ├── lib/                 Lógica de negocio y utilidades (ver docs/architecture/overview.md)
│   │   └── supabase/        Clientes: browser, server (cookies) y admin (service role)
│   └── middleware.ts        Puerta de autenticación, refresco de sesión y CORS
├── supabase/
│   ├── migrations/          Esquema versionado (NNN_nombre.sql), cada una con su reversión comentada
│   ├── functions/           Edge Functions (Deno): pipeline alternativo del lado servidor
│   └── scripts/             SQL operativo puntual (diagnóstico, aplicación manual) — NO son migraciones
├── extension/               Extensión de Chrome (ver su README)
├── public/                  Estáticos, service worker, manifest PWA, ffmpeg.wasm
├── scripts/                 Herramientas de build (iconos)
└── docs/                    Documentación (índice en docs/README.md)
```

## Documentación

Todo está indexado en [`docs/README.md`](docs/README.md). Los puntos de entrada:

- [Visión de arquitectura](docs/architecture/overview.md) — cómo encajan las piezas y el flujo del pipeline.
- [Modelo de seguridad](docs/security/security-model.md) y [política de reporte](SECURITY.md).
- [Runbooks](docs/runbooks/README.md) — un documento operativo por subsistema.
- [ADRs](docs/adr/README.md) — el porqué de las decisiones técnicas.
- [Estado del proyecto](docs/architecture/project-context.md) y [backlog](docs/product/backlog.md).

## Convenciones

- **Migraciones:** una por cambio, numeración correlativa, nunca se edita una ya aplicada. Ver [`supabase/scripts`](supabase/scripts) para lo que no es una migración.
- **Cliente admin de Supabase:** solo a través de `getSupabaseAdmin()` en `src/lib/supabase/admin.ts`. Salta el RLS: úsalo únicamente después de autorizar la acción (sesión, token firmado o `assertCron`).
- **Rutas API:** autenticación con `getAuthedUser()` (cookie o Bearer de la extensión), validación con Zod, y límite de tasa (`checkRateLimit`) en todo lo que cuesta dinero o cuota.
- **Comentarios:** explican el *porqué* (restricción oculta, incidente pasado), no el *qué*.
- **Decisiones relevantes:** se registran como ADR en `docs/adr/`.
