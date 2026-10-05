# Runbook 09 — Modo contenido (podcasts, conferencias, videos)

> **Versión:** v1.28 · **Archivos:** `src/lib/minute-styles.ts` (estilo `contenido`) · `src/lib/chapters.ts` · `src/lib/processing.ts` (timestamps) · `src/components/ChaptersSection.tsx` · `src/components/ContentModeToggle.tsx` · `src/app/api/user/preferences/route.ts`

---

## 1. Qué resuelve

ZRNote nació para reuniones de trabajo, pero graba igual de bien una
conferencia, un podcast o un video subido. El estilo «Contenido» adapta
el prompt para que la IA resuma **cronológicamente** por capítulos en vez
de extraer compromisos y decisiones (que normalmente no existen en un
contenido grabado).

---

## 2. Cómo está montado

### El estilo

Es una entrada más en `MINUTE_STYLES` (`minute-styles.ts`), con:

- `producesChapters: true` — marca que la salida incluye `chapters`.
- `optIn: true` — no aparece en el selector hasta que la persona lo activa.
- `extraRules` — instrucciones para dividir por capítulos cronológicos.
- `extraSchema` — el bloque `chapters` en el JSON de respuesta del modelo.

### Los capítulos

```
chapters: [
  { time: "12:30", title: "Por qué fallan los cohetes", summary: "...", key_points: [...] },
  ...
]
```

Viajan dentro de `minutes.raw_llm_output` (JSON íntegro del modelo), no
en una columna propia. `readChapters()` (`chapters.ts`) los lee y
normaliza defensivamente.

### Los timestamps

Para que el modelo sepa **cuándo** ocurrió cada cosa, `transcribeMeeting()`
antepone `[mm:ss]` a cada fragmento de transcripción cuando el estilo
produce capítulos. Los offsets se calculan sumando las duraciones reales
de los trozos de audio (`startOffsetsSeconds()`). Si no se conocen las
duraciones, no se ponen marcas — nunca se inventan.

### El gate de opt-in

```
users.content_mode_enabled (boolean, default false)
        │
        ├─→ ContentModeToggle.tsx (perfil)
        │     └─→ PATCH /api/user/preferences
        │
        ├─→ availableMinuteStyles(enabled) → filtra el selector
        │
        └─→ resolveMinuteStyle(value, enabled) → degrada a ejecutiva si no activó
              └─→ usado en POST /api/meetings y en /dashboard/meetings/new
```

**Sin la migración 035**, el toggle muestra «Esta opción aún no está
disponible» (HTTP 503 con mensaje amable) y `resolveMinuteStyle()` degrada
`contenido` a `ejecutiva`.

### Dónde se muestran los capítulos

- Página de la reunión (`meetings/[id]/page.tsx`)
- Enlace público (`minuta/[token]/page.tsx`)
- Exportación en texto (`minuta/[token]/texto/route.ts`)
- Correo de la minuta (`email-service.ts`)
- Copiar al portapapeles (`minute-copy-format.ts`)
- WhatsApp (`ShareWhatsApp.tsx`)
- Chunks RAG (`createChunks` en `processing.ts`)

**Aún no está en el PDF.**

---

## 3. Diagnóstico

### «El estilo Contenido no aparece en el selector»

1. ¿La migración 035 está aplicada?
   ```sql
   SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'content_mode_enabled';
   ```
2. ¿La persona lo activó en su perfil?
   ```sql
   SELECT content_mode_enabled FROM users WHERE id = 'PEGA-EL-ID';
   ```

### «Los capítulos no tienen hora»

Las horas salen de `audio_segments[].duration_s`. Si el audio se subió
sin metadatos de duración (un archivo suelto, sin pasar por la
grabadora), `startOffsetsSeconds()` devuelve `null` y los capítulos salen
numerados en vez de con hora. Es un comportamiento correcto, no un bug.

### «Los últimos capítulos faltan»

Si Gemini falla y el modelo cae a Groq (Llama), la transcripción se
recorta para caber en el presupuesto de 10.500 tokens. El modelo no ve
el final de la grabación, así que no puede generar capítulos para él.
Con `GEMINI_API_KEY` configurada (1M de contexto) esto no pasa.

---

## 4. Cómo retroceder

```bash
git checkout <commit-anterior> -- \
  src/lib/minute-styles.ts \
  src/lib/processing.ts \
  src/components/NewMeetingForm.tsx \
  src/app/api/meetings/route.ts \
  src/app/dashboard/meetings/new/page.tsx \
  src/app/dashboard/profile/page.tsx

rm src/lib/chapters.ts src/lib/chapters.test.ts \
   src/components/ChaptersSection.tsx \
   src/components/ContentModeToggle.tsx \
   src/app/api/user/preferences/route.ts
```

**Consecuencia:** el estilo `contenido` ya guardado en reuniones
existentes degrada a `ejecutiva` al regenerar la minuta. Los capítulos
en `raw_llm_output` se quedan pero no se muestran (nadie los lee).
La columna `content_mode_enabled` puede quedarse en la base sin efecto.

---

## 5. Invariantes

1. **Los capítulos viajan en `raw_llm_output`**, no en una columna propia.
   Esto evita una migración sobre `minutes` para un dato que solo un
   estilo produce.
2. **Sin marcas de tiempo fiables, `time` es `null`**, nunca inventado.
3. **Un estilo opt-in que no está activado degrada a `ejecutiva`** —
   tanto en la interfaz como en el servidor. La extensión de Chrome u
   otro cliente que mande `contenido` sin activación recibe `ejecutiva`.
4. **Los capítulos se indexan en RAG** para que el agente pueda responder
   «qué se dijo sobre X» y señalar el momento.
