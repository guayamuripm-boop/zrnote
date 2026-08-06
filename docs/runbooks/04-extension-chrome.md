# Runbook 04 — Extensión de Chrome

> **Versión:** 2.0.1 · **Archivos:** `extension/manifest.json` · `background.js` · `content.js` · `popup.js` · `offscreen.js`

---

## 0. LO PRIMERO SI ALGO FALLA

Casi todos los fallos de una extensión se arreglan con esto, en este orden:

1. Abre `chrome://extensions`
2. Pulsa **«Actualizar»** (el icono de refrescar) sobre ZRNote
3. **Recarga la pestaña de la reunión** (F5)

**Es obligatorio hacerlo cada vez que cambia el código de la extensión.** Chrome
no recarga solo ni la extensión ni los scripts ya inyectados en pestañas
abiertas.

---

## 1. Cómo está montada

Una extensión MV3 tiene cuatro piezas, y cada una existe por un motivo concreto:

```
┌─ popup.js ──────────┐   Se abre al pulsar el icono de la barra.
│  (barra del         │   AQUÍ SE INICIA la grabación — no en la página.
│   navegador)        │
└──────────┬──────────┘
           │ chrome.runtime.sendMessage
           ▼
┌─ background.js ─────┐   Service worker. Dueño de la sesión, crea la reunión
│  (service worker)   │   en ZRNote, captura la pestaña y dirige la grabación.
└──────────┬──────────┘
           │ chrome.runtime.sendMessage  ({target:'offscreen'})
           ▼
┌─ offscreen.js ──────┐   Página oculta con MediaRecorder. Trocea el audio en
│  (documento oculto) │   segmentos de 60 s y los sube a la API.
└─────────────────────┘

┌─ content.js ────────┐   Panel flotante DENTRO de Meet/Zoom/Teams.
│  (en la página)     │   Sólo muestra estado y permite DETENER.
└─────────────────────┘
```

### Por qué la grabación empieza en el popup y no en el panel

`chrome.tabCapture.getMediaStreamId()` sólo funciona si la extensión ha sido
«invocada» en esa pestaña, y **pulsar el icono de la barra es exactamente esa
invocación**. Un botón dentro de la página no la concede: fallaría con
*"Extension has not been invoked for the current page"*.

### Por qué la grabación ocurre en un documento oculto

Un content script no puede capturar el audio de la pestaña en MV3, y el service
worker no tiene DOM ni `MediaRecorder`. El documento oculto tiene ambos, y
además su origen es `chrome-extension://…`, así que puede subir a la API sin
problemas de cookies entre sitios ni CORS.

### Por qué el token se lee de la cookie y no se usa `credentials: 'include'`

La cookie de sesión de Supabase es `SameSite=Lax`: el navegador **nunca** la
adjunta a peticiones desde otro sitio. La versión anterior de la extensión hacía
justo eso y **todas** sus llamadas devolvían 401. Ahora el token se lee
explícitamente con `chrome.cookies` y viaja como `Authorization: Bearer …`.

---

## 2. Qué se arregló en 2.0.1

| # | Síntoma | Causa real | Arreglo |
|---|---|---|---|
| 1 | **«Error de conexión — Could not establish connection. Receiving end does not exist.»** en el popup y en el panel | En MV3 el service worker **se apaga tras ~30 s sin actividad**. Al abrir el popup, Chrome tiene que arrancarlo otra vez; si el mensaje llega antes de que termine, falla con ese texto. No estaba roto: era el ciclo de vida normal de MV3, sin reintento. | `send()` reintenta hasta 5 veces con espera creciente, sólo ante errores de esa clase. Un error real (sin sesión, servidor caído) no se reintenta. |
| 2 | El popup mostraba **«Grabar» y «Detener» a la vez**, incluso con error o sin sesión | El atributo `hidden` es sólo `display:none` en la hoja del navegador, así que la regla `button.btn { display: block }` lo anulaba por completo. `hidden` no hacía nada. | `[hidden] { display: none !important }` en `popup.html` y en `content.css`. |
| 3 | **La grabación no arrancaba** aunque todo lo demás estuviera bien | `chrome.offscreen.createDocument()` resuelve cuando el documento EXISTE, no cuando su script ya registró `onMessage`. El `START` caía en ese hueco y se perdía. | `sendToOffscreen()` reintenta mientras el documento termina de arrancar. |
| 4 | El panel se quedaba reintentando para siempre tras actualizar la extensión | El sondeo cada 5 s seguía corriendo con el contexto ya muerto, llenando la consola de la reunión de errores. | Se detecta `chrome.runtime.id` ausente, se para el sondeo y se pide recargar la pestaña. |
| 5 | Mensajes de error crípticos en inglés | Se mostraba tal cual el texto interno de Chrome. | Mensajes accionables: qué hacer, no qué falló. |

---

## 3. Diagnóstico

### «Error de conexión» / «Receiving end does not exist»

Con 2.0.1 esto ya se reintenta solo. Si **persiste** tras el botón «Reintentar»:

**1. ¿Está vivo el service worker?**
En `chrome://extensions` → ZRNote → pulsa el enlace **«service worker»**. Se
abre una consola. Escribe:

```js
chrome.runtime.sendMessage({type:'PING'}, console.log)
```

- Responde `{ok: true, version: "2.0.1"}` → el worker está bien; el problema
  está en otra parte.
- No responde o da error → el worker está caído. Mira la pestaña **«Errores»**
  en `chrome://extensions`: ahí aparece el fallo real de arranque.

**2. ¿Es la versión correcta?**
El popup enseña la versión arriba a la derecha. Si no dice `v2.0.1`, no
recargaste la extensión (paso 0).

### «Sin sesión iniciada» aunque tengas la sesión abierta

La extensión lee la cookie del dominio configurado en **Configuración
avanzada** del popup. Comprueba que coincide **exactamente** con donde iniciaste
sesión (`https://zrnote.vercel.app`, sin barra final).

En la consola del service worker:

```js
chrome.cookies.getAll({url:'https://zrnote.vercel.app'}).then(c => console.log(c.map(x=>x.name)))
```

Debe aparecer al menos una cookie `sb-…-auth-token`. Si no hay ninguna, no hay
sesión en ese dominio: abre ZRNote e inicia sesión.

### La grabación empieza pero no llega audio

El troceo y la subida ocurren en el documento oculto. Para ver su consola:
`chrome://extensions` → ZRNote → en «Inspeccionar vistas» aparece
`offscreen.html`.

Ahí se ven los errores de subida de cada segmento. Causas típicas: token
caducado (la sesión expiró a mitad de la reunión) o segmentos de más de 4 MB
(el límite de Vercel), que se descartan con un mensaje explícito.

### El organizador no se oye en la minuta

Es lo esperado si el micrófono fue denegado. La captura de pestaña graba **sólo
lo que la pestaña reproduce**, es decir a los demás participantes. El micrófono
se mezcla aparte, y si Chrome lo bloquea, `offscreen.js` deja un aviso en
consola y sigue grabando sólo la reunión.

---

## 4. Probar en una reunión real

1. `chrome://extensions` → «Actualizar» sobre ZRNote.
2. Abre ZRNote en otra pestaña y **comprueba que tienes la sesión iniciada**.
3. Entra a la reunión (Meet, Zoom o Teams) y **recarga la pestaña**.
4. Deberías ver el panel flotante de ZRNote abajo a la derecha, diciendo
   **«Listo para grabar»**.
5. **Avisa en voz alta que vas a grabar y espera a que todos digan que sí.**
   No es una formalidad: ver el aviso legal del punto 6.
6. Pulsa el icono de ZRNote en la barra → marca la casilla de consentimiento →
   **«Grabar esta reunión»**.
7. El icono muestra el distintivo rojo **REC** y el panel un cronómetro.
8. Al terminar: **«Detener y generar minuta»**, desde el popup o desde el panel.
9. Se abre sola la pestaña de la minuta cuando termina de procesarse.

> Durante la grabación **no cierres la pestaña de la reunión**. Si se cierra,
> `chrome.tabs.onRemoved` detiene la grabación y procesa lo capturado hasta ahí.

---

## 5. Cómo retroceder

La extensión no se despliega con la web: vive en el navegador de cada persona.
Revertirla es volver el código y recargarla.

```bash
git checkout v1.10.0-estable -- extension/
```

Luego `chrome://extensions` → «Actualizar».

Consecuencia: vuelven los cinco fallos de la tabla del punto 2 — en particular
el «Error de conexión» sin reintento y la grabación que no arranca.

---

## 6. Aviso legal (no es opcional)

Grabar una conversación **sin el consentimiento de todos los participantes es
delito** en Venezuela y en la mayoría de los países. La extensión obliga a
marcar una casilla antes de grabar y registra esa declaración en el servidor
(`POST /api/meetings/:id/consent`), pero **no puede verificar que de verdad
avisaste**. La responsabilidad es de quien graba.

---

## 7. Invariantes

1. **La grabación se inicia desde el popup**, nunca desde la página — es un
   requisito de `chrome.tabCapture`, no una preferencia de diseño.
2. **Un segmento = una sesión completa `start()`→`stop()` de MediaRecorder.**
   En WebM/OGG la cabecera del contenedor sólo existe en el primer trozo:
   cortar un flujo continuo produce fragmentos sin cabecera que Whisper
   rechaza.
3. **Las subidas van en serie.** El servidor hace lectura-modificación-escritura
   de `meetings.audio_segments`; dos escrituras a la vez pierden segmentos en
   silencio.
4. **El content script nunca llama a la API.** Corre en el origen de la reunión
   y no puede autenticarse contra ZRNote — por eso la versión anterior no
   consiguió subir ni un solo segmento.
5. **Los listeners de `onMessage` se registran de forma síncrona** en el nivel
   superior del archivo. Registrarlos dentro de un `await` hace que Chrome
   despierte el worker y no encuentre a nadie escuchando.
