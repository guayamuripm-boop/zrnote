# Runbook 06 — Botón de instalación y página de ayuda

> **Versión:** v1.15 · **Archivos:** `src/components/InstallAppButton.tsx` · `src/app/dashboard/ayuda/page.tsx`

---

## 1. Qué es y qué NO es

Un botón **«Instalar app»** para la PWA, colocado en la landing, en la barra
del dashboard y como sección propia en el perfil. Y una página **`/dashboard/ayuda`**
con un resumen de dónde está cada función y para qué sirve.

**No es un instalador de la extensión de Chrome.** Se descartó a propósito —
ver [runbook 04 §6.5](04-extension-chrome.md#6-5-por-qué-no-hay-un-botón-descargar-extensión-en-la-web-2026-08-08)
para el motivo (la clave de firma está comprometida, y Chrome bloquea los
`.crx` sueltos de todos modos).

---

## 2. El botón de instalar: tres navegadores, tres comportamientos

| Navegador | Qué pasa |
|---|---|
| Chrome / Edge / Android | Dispara `beforeinstallprompt`. Lo capturamos, evitamos el mini-infobar propio del navegador, y llamamos a `prompt()` nosotros cuando el usuario pulsa el botón. |
| **iOS Safari** | **Nunca dispara ese evento — Apple no lo implementa.** La única vía es manual: Compartir → «Añadir a pantalla de inicio». El botón detecta iOS por `userAgent` y muestra esos pasos en un modal en vez de intentar un `prompt()` que no existe. |
| Ya instalada | Se detecta con `matchMedia('(display-mode: standalone)')` (o `navigator.standalone` en iOS) y el componente entero se oculta: no hay nada que ofrecer. |

**Sin la rama de iOS, el botón habría funcionado en la mitad de los móviles y
desaparecido silenciosamente en la otra mitad** — que es justo el tipo de
fallo que no se nota hasta que alguien con iPhone pregunta por qué no ve
ningún botón.

### El componente se auto-oculta

`InstallAppButton` devuelve `null` cuando no hay nada accionable (ya instalada,
o ningún navegador compatible dio señales). Las páginas que lo usan —landing,
dashboard, perfil— no necesitan saber por qué: simplemente lo colocan y
confían en que aparezca sólo cuando corresponde. La variante `variant="section"`
del perfil hace lo mismo con el bloque completo (título + explicación), no
sólo con el botón.

---

## 3. La página de ayuda

`/dashboard/ayuda`: un tema por sección (grabar, acta, compromisos, correos,
buscar, compartir, instalar, privacidad), con chips de salto rápido arriba.
El contenido describe **sólo funciones que existen de verdad** — nada de
roadmap — y se enlaza desde el perfil con un botón destacado («Cómo usar
ZRNote»).

Menciona la extensión de Chrome como opción para videollamadas, pero **sin
ningún enlace de descarga**, por el mismo motivo del punto 1.

---

## 4. Diagnóstico

### «El botón de instalar no aparece»

1. **¿Ya está instalada?** El componente se oculta a propósito. Comprueba
   `chrome://apps` (Chrome) o si ya hay un icono en el escritorio/pantalla de
   inicio.
2. **¿Es Firefox de escritorio o Safari de Mac?** Ninguno soporta instalar
   PWAs de esta forma. No hay nada que mostrar — es una limitación real del
   navegador, no un fallo.
3. **¿Es Chrome/Edge y sigue sin aparecer?** El navegador puede tardar en
   evaluar los criterios de instalabilidad (manifest válido, service worker
   registrado, servido por HTTPS). Recarga la página; si persiste, comprueba
   en las herramientas de desarrollador → Application → Manifest si Chrome
   reporta algún error.

### «En iPhone el botón abre un modal en vez de instalar directo»

Es el comportamiento esperado — Apple no da otra vía. Ver punto 2.

---

## 5. Cómo retroceder

```bash
git checkout v1.14.0-estable -- src/app/page.tsx src/app/dashboard/layout.tsx src/app/dashboard/profile/page.tsx
rm -rf src/components/InstallAppButton.tsx src/app/dashboard/ayuda
```

**Consecuencia:** desaparece el botón de instalar y la página de ayuda. No
afecta a ninguna otra funcionalidad — es un cambio puramente de interfaz, sin
dependencias del resto del sistema.

---

## 6. Invariantes

1. **Nunca se ofrece descargar la extensión de Chrome desde la web** mientras
   la clave de firma siga comprometida. Ver runbook 04 §6.5.
2. **El botón se auto-oculta**, nunca deja un hueco vacío ni un botón que no
   hace nada al pulsarlo.
3. **La página de ayuda describe sólo lo que existe hoy**, no lo que está en
   el roadmap.
