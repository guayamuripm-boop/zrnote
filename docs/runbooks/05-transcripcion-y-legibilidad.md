# Runbook 05 — Transcripción, alucinaciones y legibilidad del acta

> **Versión:** v1.14 · **Archivos:** `src/lib/whisper-quality.ts` · `readable-text.ts` · `processing.ts` · `ShareWhatsApp.tsx` · `public/sw.js`

---

## 1. El problema de las alucinaciones

**Whisper no se calla ante el silencio.** Cuando el audio no tiene voz, no
devuelve una cadena vacía: emite fragmentos de sus datos de entrenamiento.

En español eso significa, casi siempre, coletillas de subtítulos de YouTube:

- «Subtítulos realizados por la comunidad de Amara.org»
- «¡Gracias por ver el video!»
- «Suscríbete al canal»

Y salen con léxico y acento mexicano, porque el español de su corpus es
mayoritariamente mexicano. De ahí la sensación de que «empieza a decir vainas
de México».

### Por qué llegaba hasta el acta final

El único filtro que existía era:

```js
if (result.text && result.text.trim().length > 0) return { text: result.text };
```

«Gracias por ver el video» **no está vacío**, así que pasaba. Después,
`analyzeMeeting` sólo comprobaba `transcript.trim().length === 0`, así que
también pasaba. Y el LLM, obediente, **redactaba un acta perfectamente creíble
de una reunión que nunca ocurrió**.

Es el peor fallo posible en este producto: no es un error visible que el
usuario detecte, es un documento falso con aspecto de verdadero.

### La señal que ya teníamos y tirábamos

La petición a Groq **ya pedía** `response_format: verbose_json`, que devuelve
por cada fragmento tres métricas pensadas exactamente para esto:

| Métrica | Qué significa | Umbral |
|---|---|---|
| `no_speech_prob` | Probabilidad de que no haya voz | > 0.6 |
| `avg_logprob` | Confianza media (más bajo = está adivinando) | < -1.0 |
| `compression_ratio` | Repetición: texto que se comprime demasiado | > 2.4 |

Son los umbrales de la implementación de referencia de Whisper. **El código las
recibía y sólo leía `result.text`.**

### Cómo se filtra ahora

`cleanWhisperResult()` descarta un fragmento cuando:

1. **No hay voz Y hay poca confianza.** Se exigen **las dos** a propósito:
   `no_speech_prob` alto por sí solo aparece con micrófonos lejanos o voz baja,
   y ese audio sí queremos conservarlo.
2. **Se comprime demasiado** o repite las mismas palabras (bucle).
3. **Coincide con una alucinación conocida** — incluso si las métricas parecen
   buenas, porque Whisper a veces está muy seguro de su invento.

Si tras filtrar quedan menos de 25 caracteres, se considera silencio.

### Las dos barreras

```
transcribeSegment()  → cleanWhisperResult() por fragmento
                       → error SIN_VOZ si no queda nada
                          ↓
transcribeMeeting()  → si TODOS los segmentos son SIN_VOZ:
                       "No se detectó voz audible en la grabación…"
                          ↓
analyzeMeeting()     → segunda pasada sobre el transcript completo
                       (atrapa transcripciones viejas y restos)
                          ↓
MINUTE_PROMPT        → instrucción explícita: si esto no da para un acta,
                       dilo, no la inventes
```

**La reunión se marca como fallida y no se envía ningún correo.** Es
deliberado: es preferible que el usuario sepa que su grabación no sirvió a que
reciba un acta inventada.

### 1.5. Corrección (v1.16): el filtro tenía falsos positivos reales

Reportado en producción: reuniones **perfectamente audibles** se marcaban como
silencio. Tres causas concretas, todas en el filtro de patrones de texto —
las métricas reales de Whisper (`no_speech_prob`/`avg_logprob`) nunca fueron
el problema:

1. **`/hasta la proxima/` no estaba anclado.** Coincidía con esa frase en
   CUALQUIER parte de un fragmento, y "hasta la próxima" es una despedida
   real y normalísima para cerrar una reunión o una clase. Un fragmento real
   de 20 palabras que terminara así se descartaba entero.
2. **La segunda barrera (`analyzeMeeting`) aplicaba el mismo patrón sobre la
   transcripción COMPLETA concatenada.** Una reunión entera y audible que
   simplemente cerrara con esa frase podía perder toda su transcripción de un
   plumazo — esto era lo que más probablemente causaba el bug reportado.
3. **`isRepetitionLoop` se aplicaba también sobre texto real** con métricas de
   Whisper sanas. El español hablado repite conectores constantemente
   ("bueno", "entonces", "o sea"); el umbral de 25% de palabras únicas sobre
   sólo 12 palabras confundía conversación normal con un bucle.

**La corrección, con un principio distinto:** las alucinaciones de Whisper son
SIEMPRE frases cortas y enlatadas — nunca aparecen incrustadas en una oración
real y larga. `looksLikeHallucination()` ahora ignora cualquier texto de más
de 80 caracteres (`MAX_HALLUCINATION_CANDIDATE_LEN`), sea lo que sea que
contenga. Eso protege el contenido real sin tener que mantener una lista
perfecta de frases prohibidas. Además:

- Se quitaron del listado `hasta la proxima` y las URLs genéricas — ambas
  cosas se dicen de verdad en reuniones reales.
- `isRepetitionLoop` sólo se usa cuando Whisper **no** mandó
  `compression_ratio` para ese fragmento — si la métrica real está disponible,
  se usa ella y no la heurística de texto. El umbral también subió (20
  palabras mínimo, 15% en vez de 25%) para el caso en que sí hace falta.

Ver los tests de regresión en `whisper-quality.test.ts` — reproducen
literalmente el caso reportado (una reunión real que cierra con "hasta la
próxima").

---

## 2. Legibilidad del acta

### El problema

El resumen se generaba como un bloque de 3-5 frases y se mostraba tal cual en
**cuatro sitios**: la página de la reunión, el correo, la minuta pública y
WhatsApp. En un móvil, cinco frases seguidas son un muro que se salta entero.

### La solución, en dos capas

**Al generar:** el prompt pide ahora 2-3 párrafos cortos separados por `\n\n`,
máximo 2 frases por párrafo.

**Al mostrar:** `toParagraphs()` parte el texto igualmente. Hacen falta las dos
capas porque:

1. Un modelo no garantiza el formato; a veces devuelve el bloque igual.
2. **Las actas ya guardadas** están en un solo bloque y hay que mostrarlas bien
   sin regenerarlas.

Si el texto ya trae saltos dobles, se respetan: el modelo sabe mejor dónde está
el corte natural entre ideas.

> El corte de frases exige punto **seguido de mayúscula**. Sin esa condición,
> «Sr. Pérez» o «9 a.m.» partían la frase por la mitad.

### WhatsApp: qué se manda y qué no

Antes se volcaba el acta entera —resumen, decisiones, bloqueos, hasta 12
compromisos y próximos pasos— con un tope de **3.500 caracteres**.

Ahora el mensaje lleva sólo **lo accionable** y ronda los **600**:

| Sección | ¿Va al chat? |
|---|---|
| Título y fecha | ✅ |
| Resumen | ✅ en párrafos cortos |
| Compromisos | ✅ hasta 6, luego «…y N más» |
| Decisiones | ✅ sólo si son 3 o menos |
| Bloqueos | ❌ está en el enlace |
| Próximos pasos | ❌ está en el enlace |
| Enlace al acta completa | ✅ |

Esto es posible porque desde la v1.12 el enlace público lo abre cualquier
participante **sin cuenta** (ver [runbook 02](02-enlaces-publicos.md)).

---

## 3. El logo de la PWA

### No faltaba: estaba envenenado en caché

Los ficheros de icono siempre estuvieron bien y producción los servía con 200.
El fallo estaba en el service worker:

```js
const VERSION = 'zrnote-v3';                       // fijado en v1.5.0
function isCacheableAsset(url) {
  return ... || /\.(png|svg|ico|woff2?)$/.test(url.pathname);   // cache-first
}
```

El historial lo confirma: `zrnote-v3` se fijó en **v1.5.0**, y los iconos se
cambiaron al isotipo de marca después, en **v1.7.0**.

Como **`/icon-512.png` no lleva hash en el nombre**, la URL no cambia cuando
cambia el contenido. Con cache-first sin revalidar, la copia vieja se servía
indefinidamente: las PWA instaladas conservaban el icono anterior a la marca.

### El arreglo

Se separan dos clases de recurso que antes iban en el mismo saco:

| Clase | Ejemplo | Estrategia |
|---|---|---|
| **Inmutable** | `/_next/static/…`, `/ffmpeg/…` | Cache-first. La URL lleva hash: no puede quedar obsoleta. |
| **Mutable** | `/icon-512.png`, `/manifest.json` | **Stale-while-revalidate**: responde ya con lo cacheado y actualiza por detrás. |

Con stale-while-revalidate, un icono cambiado entra solo en la siguiente
visita, **sin depender de que nadie se acuerde de subir `VERSION`**.

Y `VERSION` sube a `zrnote-v4`, lo que borra todas las cachés anteriores
(el handler `activate` ya lo hacía) y desbloquea a quien tenga el icono viejo.

### Si tu PWA instalada sigue con el icono viejo

El sistema operativo cachea el icono **en el momento de instalar**, aparte del
service worker. Tras desplegar esto:

1. Abre la web en el navegador (no la app instalada) y recarga con `Ctrl+Shift+R`
2. **Desinstala la PWA** y vuelve a instalarla

Sin el paso 2 el icono del escritorio puede seguir siendo el viejo, porque ya
no depende de nosotros sino del registro de aplicaciones del sistema.

---

## 4. Diagnóstico

### «Salió un acta de una reunión donde no se oía nada»

No debería volver a pasar, pero si ocurre:

```sql
SELECT LEFT(transcript_raw, 300), status, error_message
FROM meetings WHERE id = 'PEGA-EL-ID';
```

- ¿El transcript contiene «Amara», «gracias por ver», «suscríbete»? →
  una alucinación se coló. Añade el patrón a `HALLUCINATION_PATTERNS` en
  `whisper-quality.ts` y añade una prueba.
- ¿El transcript es texto real pero sin sentido? → el audio tenía voz de fondo
  (TV, radio). Los umbrales no pueden distinguir eso; es un límite conocido.

En los logs busca `Segment discarded as silence/hallucination` — trae los
contadores y una vista previa del texto descartado.

### «Dice que no se detectó voz pero sí se oía»

Los umbrales pueden ser demasiado estrictos con audio muy bajo. Comprueba en
los logs `dropped` frente a `total`. Si se descartan fragmentos con voz real,
lo que hay que subir es `NO_SPEECH_THRESHOLD` (de 0.6 hacia 0.8), no quitar el
filtro.

Recuerda que **se exigen dos condiciones** para descartar: si un fragmento con
voz baja se está perdiendo, mira también `avg_logprob`.

### «El resumen sigue saliendo en un bloque»

`toParagraphs()` respeta los saltos dobles que ya trae el texto. Si el modelo
devolvió un único bloque sin puntuación clara (frases sin punto final), no hay
por dónde cortar. Es un límite del texto de origen, no del partidor.

---

## 5. Cómo retroceder

```bash
git checkout v1.13.0-estable -- src/lib/processing.ts src/lib/email-service.ts src/components/ShareWhatsApp.tsx public/sw.js
rm src/lib/whisper-quality.ts src/lib/whisper-quality.test.ts src/lib/readable-text.ts src/lib/readable-text.test.ts
```

Y revertir a mano los `import` en `src/app/dashboard/meetings/[id]/page.tsx` y
`src/app/minuta/[token]/page.tsx`.

**Consecuencia:** vuelven las actas inventadas sobre grabaciones mudas. No es
un estado recomendable ni como parada de emergencia — es el fallo que más daño
hace a la confianza en el producto.

---

## 6. Invariantes

1. **Ningún acta se genera sobre una transcripción sin voz reconocible.** Las
   dos barreras (transcripción y análisis) existen por separado a propósito.
2. **Se exigen DOS condiciones para descartar por silencio** (`no_speech_prob`
   alto **y** `avg_logprob` bajo). Una sola descarta voz lejana legítima.
3. **Un fallo de transcripción por silencio NO se reintenta con éxito.**
   Reintentar sobre silencio da silencio: el mensaje dice qué revisar.
4. **El corte en párrafos ocurre al MOSTRAR, no sólo al generar** — si no, las
   actas antiguas se seguirían viendo como un muro.
5. **Sólo `/_next/static/` y `/ffmpeg/` se cachean para siempre.** Todo lo
   demás va con revalidación: no lleva hash y puede cambiar.
