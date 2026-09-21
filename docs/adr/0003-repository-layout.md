# ADR 0003 — Organización del repositorio y de la documentación

**Estado:** aceptada · **Fecha:** 2026-09-20

## Contexto

La raíz acumulaba diez documentos sueltos (`CONTEXT.md`, `BACKLOG.md`, planes, guías de setup, `.docx`), sin `README` ni política de seguridad; había SQL operativo mezclado con las migraciones numeradas; y un snapshot completo del código (`.backup/`) estaba versionado, con el `project-ref` de Supabase dentro.

## Decisión

- **Raíz:** solo lo que un desconocido espera ver — `README.md`, `SECURITY.md`, configuración de herramientas y `package.json`.
- **`docs/`** por audiencia: `architecture/` (cómo es), `security/` (modelo y auditorías), `product/` (roadmap, backlog, planes), `setup/` (puesta en marcha), `runbooks/` (operar y diagnosticar), `adr/` (por qué), `archive/` (histórico, no se mantiene).
- **`supabase/migrations/`** solo contiene migraciones numeradas. El SQL puntual (diagnóstico, aplicación manual) va a `supabase/scripts/` con nombres en inglés y en minúsculas.
- **Snapshots y worktrees no se versionan.** El historial de git es el respaldo; `.backup/`, `.claude/worktrees/` y `supabase/.temp/` están en `.gitignore`.
- Los movimientos se hicieron con `git mv` para conservar el historial de cada archivo.

## Consecuencias

- (+) Un nuevo colaborador entiende el repo desde el `README` en cinco minutos.
- (−) Los enlaces antiguos a `CONTEXT.md`/`BACKLOG.md` en la raíz dejan de existir; se actualizaron los de `docs/`. Cualquier marcador externo debe apuntar a `docs/architecture/project-context.md` y `docs/product/backlog.md`.
- **No se reorganizó `src/`.** Renombrar ~80 módulos de `src/lib` toca cientos de imports y `vi.mock`, y merece su propia PR con `tsc` y la suite completa como red. Propuesta y agrupación en [overview](../architecture/overview.md#estructura-de-srclib-agrupada-por-dominio).
