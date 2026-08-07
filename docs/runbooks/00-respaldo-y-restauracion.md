# Runbook 00 — Respaldo y restauración

> **Qué es esto.** El procedimiento para crear un punto al que volver antes de tocar
> nada, y el procedimiento exacto para volver a él si algo sale mal.
> Léelo entero **antes** de necesitarlo.

---

## Los tres niveles de respaldo

Tenemos tres, de más barato a más pesado. Los tres son **locales**: nada de esto
se sube a GitHub hasta que tú lo digas explícitamente.

| Nivel | Qué es | Ocupa | Protege contra |
|---|---|---|---|
| 1. Etiqueta (tag) | Un nombre fijo apuntando a un commit | ~0 bytes | Un cambio que no gusta |
| 2. Rama de respaldo | Una rama congelada en ese commit | ~0 bytes | Que alguien mueva la etiqueta |
| 3. Snapshot ZIP | Copia física del código fuente | ~320 KB | Que se corrompa `.git` |

Los niveles 1 y 2 no ocupan espacio real: Git guarda **un puntero**, no una copia.
El nivel 3 sí es una copia, pero sólo del código (sin `node_modules`, sin `public/`,
sin `.next/`), por eso son 320 KB y no 500 MB.

---

## Punto de restauración actual

| | |
|---|---|
| **Etiqueta** | `v1.10.0-estable` |
| **Rama** | `respaldo/v1.10.0-estable` |
| **Snapshot** | `.backups/v1.10.0-estable_2026-08-05.zip` |
| **Commit** | `7449c4b8758712f1b73413df25566977473d5a1d` |
| **Fecha** | 2026-08-05 |
| **Estado verificado** | Build ✅ · TypeScript ✅ · **119/119 tests ✅** |
| **Qué funciona ahí** | Pipeline completo: grabar → transcribir → minuta → correos. En producción. |

`.backups/` está en `.gitignore`: los ZIP no se versionan ni se suben nunca.

---

## Cómo crear un punto de restauración nuevo

Hazlo **siempre** antes de empezar una tanda de cambios grande. Son 3 comandos.

**1. Comprueba que el árbol está limpio y que los tests pasan.**
Un respaldo de código roto no sirve de nada.

```bash
git status --short && npm test
```

**2. Crea la etiqueta y la rama** (cambia el nombre por la versión que toque):

```bash
git tag -a v1.11.0-estable -m "Punto de restauracion: descripcion de que funciona aqui" && git branch respaldo/v1.11.0-estable
```

**3. Crea el snapshot físico** (PowerShell):

```bash
powershell -Command "$r='C:\Dev\ZR Note'; $i=@(); foreach($d in @('src','supabase','scripts','extension')){$i+=(Join-Path $r $d)}; foreach($f in @('package.json','package-lock.json','next.config.js','tailwind.config.js','postcss.config.js','tsconfig.json','vercel.json','vitest.config.ts','vitest.setup.ts','CONTEXT.md','BACKLOG.md','ROADMAP_STATUS.md')){$p=Join-Path $r $f; if(Test-Path $p){$i+=$p}}; Compress-Archive -Path $i -DestinationPath (Join-Path $r '.backups\v1.11.0-estable_FECHA.zip') -CompressionLevel Optimal -Force"
```

**4. Trabaja siempre en una rama aparte**, nunca directamente sobre `main`:

```bash
git checkout -b fix/lo-que-sea
```

---

## Cómo volver atrás

Elige según lo que haya pasado. De menos a más drástico.

### Caso A — «Lo que llevo hecho en esta rama no me gusta, tíralo todo»

Descarta los cambios sin guardar y vuelve a `main` tal y como estaba:

```bash
git checkout . && git checkout main
```

La rama de trabajo sigue existiendo por si te arrepientes. Para borrarla del todo:

```bash
git branch -D fix/lo-que-sea
```

### Caso B — «Quiero ver cómo estaba el código estable sin perder mi trabajo»

```bash
git stash && git checkout v1.10.0-estable
```

Estás en modo *detached HEAD*: puedes mirar y probar, pero no commitees ahí.
Para volver a tu trabajo:

```bash
git checkout fix/v1.11-correo-y-bugs && git stash pop
```

### Caso C — «Ya hice merge a `main` y `main` está roto»

Devuelve `main` al punto estable. **Destructivo**: pierde los commits posteriores
en local (siguen en la rama de trabajo y en el reflog).

```bash
git checkout main && git reset --hard v1.10.0-estable
```

Si ya lo habías subido a GitHub, además hace falta:

```bash
git push --force-with-lease origin main
```

> ⚠️ `--force-with-lease` en vez de `--force`: aborta si alguien más ha subido algo
> mientras tanto, en vez de machacárselo.

### Caso D — «Sólo un archivo está mal»

Recupera ese archivo del punto estable, sin tocar el resto:

```bash
git checkout v1.10.0-estable -- src/lib/meeting-emails.ts
```

### Caso E — «El repositorio Git se ha corrompido»

Aquí entra el ZIP. Descomprímelo en una carpeta limpia y reinstala:

```bash
powershell -Command "Expand-Archive -Path 'C:\Dev\ZR Note\.backups\v1.10.0-estable_2026-08-05.zip' -DestinationPath 'C:\Dev\ZRNote-restaurado' -Force"
```

Luego, dentro de `C:\Dev\ZRNote-restaurado`:

```bash
npm install
```

El ZIP **no** incluye `.env` (los secretos nunca se copian). Hay que volver a
ponerlos desde el panel de Vercel.

---

## Y la base de datos, ¿qué?

**Git no respalda Supabase.** Esto es importante y es fácil olvidarlo.

- Las **migraciones** (`supabase/migrations/*.sql`) sí están en Git: son el
  historial del *esquema*, y se pueden volver a aplicar.
- Los **datos** (reuniones, minutas, compromisos) **no**. Si una migración borra
  o corrompe datos, Git no te salva.

Regla que seguimos: **toda migración es aditiva** — `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. Nunca `DROP COLUMN`,
nunca `DELETE` sin `WHERE`. Así una migración nueva nunca puede destruir lo
anterior, y revertir es opcional en vez de urgente.

Cada migración de este proyecto lleva al final, en comentarios, su propio SQL de
reversión. Ver el runbook de cada subsistema.

Supabase (plan gratuito) guarda copias diarias automáticas de los últimos 7 días:
panel → *Database* → *Backups*.

---

## Comprobar qué respaldos existen ahora mismo

```bash
git tag -l && git branch --list "respaldo/*" && ls -la .backups/
```

---

## Historial de puntos de restauración

| Etiqueta | Commit | Fecha | Estado | Motivo |
|---|---|---|---|---|
| `v1.0.8-stable` | — | (previo) | — | Respaldo antiguo |
| `v1.10.0-estable` | `7449c4b` | 2026-08-05 | 119/119 tests ✅ · **en producción** | Antes de la refactorización de correo v1.11 |
| `v1.12.0-candidata` | `8ed9573` | 2026-08-05 | 188/188 tests ✅ · **sin desplegar** | Correo endurecido + minuta pública. Pendiente: migración 022 |

> «Candidata» significa que pasa build, tipos y pruebas, pero **no se ha probado
> contra datos reales**. El punto al que volver ante cualquier duda sigue siendo
> `v1.10.0-estable`, que es lo que hay en producción hoy.
