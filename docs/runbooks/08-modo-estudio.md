# Runbook 08 — Modo estudio (apuntes de clase)

> **Versión:** v1.19 · **Archivos:** `src/lib/study-aids.ts` · `src/lib/flashcard-deck.ts` · `src/components/study/StudySection.tsx` · `src/lib/minute-styles.ts` · `src/lib/processing.ts` (MINUTE_PROMPT) · `src/lib/minute-pdf.tsx` · migración `026_study_aids.sql`

---

## 1. Qué resuelve

El estilo «Clase» (runbook 07) cambiaba **el tono** con que se redactaba el
acta, pero no **lo que se extraía**: seguía produciendo decisiones, bloqueos y
estados de proyecto. Para una clase eso es el envoltorio, no el contenido.

Un estudiante que faltó, o que estuvo pero no lo entendió a la primera, no
necesita saber «qué se decidió». Necesita el temario, qué significa cada
término nuevo, cómo se resolvió el ejemplo de la pizarra, qué preguntas
debería saber responder y qué dijo el profesor que entra en el examen.

Ahora el estilo «Clase» produce, **además del acta normal**, un bloque de
apuntes con nueve secciones, y una interfaz para estudiarlos.

---

## 2. Cómo está montado

El estilo ya no gobierna sólo el tono: gobierna también el **esquema de
salida**. `MinuteStyleDef` lleva tres campos nuevos que se inyectan en el
prompt, así que un estilo futuro puede pedir sus propios campos sin tocar
`processing.ts`.

```
MINUTE_STYLES.educativa
  ├─ roleFraming        → apertura del prompt         (ya existía)
  ├─ commitmentExamples → señales de compromiso       (ya existía)
  ├─ summaryInstruction → qué debe contar el resumen  ⬅ nuevo
  ├─ extraRules         → reglas de los apuntes       ⬅ nuevo
  ├─ extraSchema        → campos extra del JSON       ⬅ nuevo
  └─ producesStudyAids  → gobierna la interfaz        ⬅ nuevo
            │
            ▼
   respuesta del modelo: { summary, action_items, …, study_aids: {…} }
            │
            ▼
   normalizeStudyAids()  ── acepta cualquier cosa, devuelve forma válida
            │
            ├─→ minutes.study_aids (jsonb)   ← migración 026
            └─→ minutes.raw_llm_output       ← respaldo, siempre presente
                        │
                        ▼
                 readStudyAids(minute)
                        │
       ┌────────────────┼────────────────┬──────────────┐
       ▼                ▼                ▼              ▼
  página de la     minuta pública    página del     meeting_chunks
    reunión          (/minuta)          PDF          (búsqueda RAG)
```

### Las nueve secciones

| Campo | Qué es | Pestaña |
|---|---|---|
| `outline` | Temario real de la sesión, en orden | Apuntes |
| `key_concepts` | Glosario, definido **con las palabras de clase** | Apuntes |
| `worked_examples` | Ejercicios resueltos en la pizarra | Apuntes |
| `common_mistakes` | Errores de los que advirtió el docente | Apuntes |
| `exam_notes` | Lo que se dijo de la evaluación | Apuntes (destacado) |
| `resources` | Libros y materiales mencionados por su nombre | Apuntes |
| `open_questions` | Preguntas que quedaron sin responder | Apuntes |
| `study_questions` | Preguntas de repaso con respuesta | Repaso |
| `flashcards` | Anverso / reverso para memorizar | Tarjetas |

### La regla que sostiene todo esto

**El modelo sabe de estos temas, y ése es el peligro.** Si el docente definió
mal un término, o a medias, los apuntes recogen lo que él dijo — no lo que el
modelo sabe. El prompt lo repite tres veces (en `extraRules`, en el esquema y
en la lista de comprobación final) porque es el único fallo de esta función
que sería **invisible**: unos apuntes correctos pero que no corresponden a esta
clase se leen igual de bien, y llevan al estudiante a responder a un profesor
distinto del que le va a examinar.

Si la sesión no fue una clase (un claustro, una tutoría administrativa), todos
los arrays van vacíos y la sección no aparece. Es la respuesta correcta.

### Por qué una columna `jsonb` y no nueve columnas

Las nueve listas siempre se leen juntas: se pintan de una vez, se exportan de
una vez, y nunca se consultan por separado. Nueve columnas serían nueve
migraciones cada vez que se añada una sección. La búsqueda semántica no
depende de esta columna: `createChunks()` vectoriza el glosario, las preguntas
y los errores frecuentes en `meeting_chunks`.

### Por qué el progreso de las tarjetas vive en `localStorage`

Es una ayuda personal, no un dato del acta. Guardarlo en el servidor obligaría
a decidir de quién es el progreso cuando la clase se comparte con veinte
personas — y la vista pública (`/minuta/[token]`) no tiene sesión con la que
responder a eso. Clave: `zrnote:flashcards:<minuteId>`.

### Por qué la aritmética del mazo está en su propio archivo

`flashcard-deck.ts` es puro y probado (18 pruebas). El índice de la tarjeta
actual apunta a una lista que **encoge** cada vez que se pulsa «Me la sé»: un
`position + 1` ingenuo en ese momento se salta una tarjeta. Y saltarse
tarjetas en una app de estudio es un fallo silencioso — nadie lo reporta,
simplemente no se aprende lo que se saltó.

---

## 3. Si la migración 026 no está aplicada

**No pasa nada, y es deliberado.** Hay dos redes:

1. `analyzeMeeting` detecta el error de columna desconocida en el `INSERT` y
   **reintenta sin ella**. Perder el acta entera por una sección opcional sería
   absurdo.
2. `readStudyAids()` cae a `minutes.raw_llm_output`, donde el JSON completo del
   modelo se guarda siempre. La sección de estudio se ve igual.

La columna sólo hace la lectura directa y barata. Aplicarla es recomendable,
no urgente.

---

## 4. Diagnóstico

**«Elegí Clase y no aparecen los apuntes».** En orden:

1. ¿El acta es anterior a v1.19? Los apuntes se generan al analizar. Reanaliza
   la reunión (botón «Reintentar») para que se produzcan.
2. `select minute_style from meetings where id = '…'` → ¿dice `educativa`?
   Si dice `ejecutiva`, el estilo no llegó a guardarse al crear la reunión.
3. `select study_aids, raw_llm_output from minutes where meeting_id = '…'`
   → si `study_aids` está vacío pero `raw_llm_output` contiene `"study_aids"`,
   la columna no existe o el insert cayó al camino de respaldo: busca en los
   logs `Columna study_aids ausente`.
4. Si `raw_llm_output` tampoco lo trae, el modelo no devolvió el bloque. Mira
   los logs: `Study aids generated` sólo se registra cuando llegó algo.

**«Los apuntes dicen cosas que el profesor no dijo».** Es el fallo grave.
Compara `raw_llm_output` con `meetings.transcript_raw`. Si la transcripción no
contiene el concepto, el modelo lo puso de su cosecha: refuerza la prohibición
en `extraRules` de `minute-styles.ts` y reanaliza. No es un fallo de datos, es
un fallo de prompt.

**«El contador de tarjetas dice 8 de 4».** No debería: `sanitizeKnown()` filtra
los índices que sobran cuando el acta se regeneró con menos tarjetas. Si pasa,
mira esa función. Solución del usuario mientras tanto: «Reiniciar progreso».

---

## 5. Cómo retroceder

**Quitar sólo la sección de estudio, dejando el resto:** en
`src/lib/minute-styles.ts`, borra `producesStudyAids`, `extraRules` y
`extraSchema` de `educativa`. El modelo deja de generar el bloque y la interfaz
deja de mostrarlo — el estilo «Clase» vuelve a ser exactamente v1.17. No hace
falta tocar la base de datos ni borrar nada.

**Revertir la migración:** `ALTER TABLE minutes DROP COLUMN IF EXISTS study_aids;`
Sin pérdida: el contenido sigue en `raw_llm_output` y `readStudyAids()` lo
recupera de ahí.

---

## 6. Qué NO se hizo, y por qué

- **Repaso espaciado de verdad (SM-2, intervalos por tarjeta).** Necesita
  guardar el progreso por persona en el servidor, y eso choca con la vista
  pública sin sesión. El «Me la sé» actual, con localStorage, cubre el 90 % del
  valor sin ese problema. Si se hace, va detrás de cuentas de estudiante.
- **Editar los apuntes a mano.** Se descartó por ahora: la salida es de sólo
  lectura como el resto del acta. Reanalizar es la vía para corregir.
- **Generar apuntes para actas ejecutivas.** No. Un acta de junta con
  flashcards es ruido, y el coste del modelo se paga en cada análisis.
