# Extensión de Chrome — ZRNote

Graba una reunión de Meet, Zoom o Teams desde el navegador y genera la minuta,
sin tener que subir nada a mano.

> **Estado: reescrita en la v2.0.0, pendiente de probar en vivo.**
> La versión anterior (1.0.1) **no funcionaba en absoluto** — ver "Qué estaba
> roto" más abajo. La v2 corrige la causa, pero necesita una prueba en una
> reunión real antes de darla por buena.

---

## Instalación

1. `chrome://extensions` → activa **Modo de desarrollador** (arriba a la derecha).
2. **Cargar descomprimida** → selecciona esta carpeta (`extension/`).
3. Abre `https://zrnote.vercel.app` e **inicia sesión**. La extensión reutiliza esa
   sesión; no hay que configurar ninguna clave.

## Uso

1. Entra a la reunión (Meet, Zoom o Teams).
2. Pulsa el **icono de ZRNote** en la barra del navegador.
3. Marca la casilla de consentimiento y pulsa **Grabar esta reunión**.
4. Al terminar, **Detener y generar minuta** (desde el icono o desde el panel de
   la esquina). Se abre sola la minuta cuando está lista.

El inicio está en el icono y no en el panel de la página **a propósito**:
`chrome.tabCapture` solo autoriza la captura si la extensión fue invocada desde
su propio icono. Un botón dentro de la página no concede ese permiso.

## Qué graba

- **El audio de la pestaña** → todos los demás participantes.
- **Tu micrófono** → tu propia voz, mezclada en la misma pista.

Ambas cosas hacen falta: capturar solo la pestaña deja fuera a quien está
grabando, que era el comportamiento anterior. Si niegas el micrófono, se graba
igual pero sin tu voz.

Mientras se captura, sigues oyendo la reunión con normalidad (el audio se
reencamina a los altavoces; sin eso, capturar una pestaña la silencia).

## Qué estaba roto en la v1 (y por qué nunca funcionó)

| Problema | Consecuencia |
|---|---|
| Usaba el código de sala de Meet (`abc-defg-hij`) como si fuera el ID de la reunión en ZRNote | El servidor esperaba un UUID. **Nunca creaba la reunión y el 100 % de las subidas fallaba.** |
| `credentials: 'include'` desde `meet.google.com` | La cookie de Supabase es `SameSite=Lax`: el navegador nunca la envía en peticiones cross-site. **Todas las llamadas eran 401.** |
| Grababa solo el audio de la pestaña | Quien organizaba la reunión no aparecía en su propia minuta. |
| `background.js` reinyectaba `content.js` en cada carga, además del `content_scripts` del manifest | Dos instancias, dos paneles, listeners duplicados. |
| `maybeCompressAudio` usaba `resolve` fuera del alcance de su Promise | `ReferenceError` al comprimir; además re-grababa en tiempo real (30 s de audio = 30 s de espera). |
| El panel esperaba clases CSS ofuscadas de Google (`.G5t3rd`) | Google las cambia sin avisar: a menudo el panel no aparecía nunca. |
| Sin consentimiento de grabación | El control legal principal del producto no existía aquí. |

## Cómo está construida ahora

```
popup.html/js        Inicio y parada. Aquí vive la casilla de consentimiento.
background.js        Sesión, creación de la reunión, captura, orquestación.
offscreen.html/js    Grabación real + subida (origen chrome-extension://).
content.js/css       Panel de estado dentro de la reunión. Sin red.
```

El `offscreen document` es la pieza clave: un content script no puede capturar
audio de pestaña en MV3, y el service worker no tiene `MediaRecorder`. El
documento offscreen tiene ambos, y su origen es `chrome-extension://…`, así que
puede subir a la API sin problemas de CORS ni de cookies.

Reglas de segmentación (las mismas que la PWA, aprendidas a la mala):

- **Un segmento = un ciclo completo `start()`→`stop()`.** En WebM/OGG la cabecera
  del contenedor solo está en el primer trozo; trocear un stream continuo produce
  fragmentos sin cabecera que Whisper rechaza.
- El reloj de rotación es `ondataavailable` (hilo de medios), no `setInterval`,
  que el navegador estrangula en segundo plano.
- Las subidas van serializadas: el servidor hace read-modify-write de
  `audio_segments` y las escrituras concurrentes pierden segmentos.

## Firma y publicación

`extension.pem` (la clave privada de firma) estuvo versionada en un repositorio
**público**, así que debe considerarse comprometida. Antes de publicar en la
Chrome Web Store hay que generar un par de claves nuevo; el ID de la extensión
cambiará.

## Qué falta probar en vivo

- [ ] Captura de audio real en una reunión de Meet con varias personas.
- [ ] Permiso de micrófono desde el documento offscreen (la primera vez lo pide).
- [ ] Reuniones largas (>1 h): rotación de segmentos y consumo de memoria.
- [ ] Zoom y Teams (el selector de pestaña es el mismo, pero no está verificado).
