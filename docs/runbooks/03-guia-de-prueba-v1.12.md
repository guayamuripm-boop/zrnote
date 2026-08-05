# Guía de prueba — v1.12

> Qué comprobar antes de dar por bueno el trabajo de correo y minuta pública.
> Empieza por el paso 0: sin él, nada de lo demás funciona.

**Rama:** `fix/v1.11-correo-y-bugs` · **Etiqueta:** `v1.12.0-candidata`
**Volver atrás:** [runbook 00](00-respaldo-y-restauracion.md)

---

## Paso 0 — Aplicar la migración 022

**Obligatorio.** Sin ella, dar de baja a alguien devuelve error 500.

Pega `supabase/migrations/022_email_unsubscribes.sql` en el **SQL Editor** de
Supabase. Para confirmar que entró:

```sql
SELECT COUNT(*) FROM email_unsubscribes;
```

Si responde `0`, está lista. Si dice que la tabla no existe, no se aplicó.

> La `021` ya está aplicada.
> **No hace falta ninguna variable de entorno nueva.** `MINUTE_LINK_SECRET` es
> opcional: sin ella la clave se deriva de `SUPABASE_SERVICE_ROLE_KEY`.

---

## Prueba 1 — El enlace del correo funciona para un participante

**Lo que arregla:** el botón llevaba a un login y luego a un 404 para todo el
que no fuera el organizador.

1. Crea una reunión y añade un participante con **un correo tuyo distinto** del
   de la cuenta (otro Gmail, el del móvil, el que sea).
2. Graba algo corto (30 s valen) y procésala.
3. Abre el correo **en esa otra cuenta** — no en la del organizador.
4. Pulsa **«Ver la minuta completa»**.

| Debe pasar | No debe pasar |
|---|---|
| Se abre la minuta directamente, sin login | Que pida iniciar sesión |
| Sale «Hola *tu nombre*» | Un 404 o «no encontrada» |
| Aparece el bloque «Tus compromisos» | Que se vea la transcripción completa |

5. En el correo del **organizador**, el mismo botón debe llevar al panel de
   siempre (`/dashboard/meetings/...`). Ahí sí se pide sesión: es lo correcto.

---

## Prueba 2 — Los compromisos son de quien son

**Lo que arregla:** el bug más grave. `"mariana gomez".includes("ana")` daba
`true`, así que Ana recibía las tareas de Mariana bajo «Tus compromisos».

Monta una reunión con dos participantes cuyos nombres **se contengan uno a
otro**, que es donde fallaba:

- `Ana Pérez` y `Mariana Gómez` ← el caso exacto del bug
- o `Luis` y `Luisa`

En la reunión, que cada uno se comprometa a algo distinto.

| Debe pasar | No debe pasar |
|---|---|
| Ana ve **solo** lo suyo en «Tus compromisos» | Que Ana vea la tarea de Mariana como suya |
| Lo de Mariana aparece en «Otros compromisos» | — |

**Prueba también las tildes:** que un participante se llame `Pérez`, `Muñoz` o
`Ibáñez`. Antes esos nombres **no coincidían nunca** y la persona recibía el
correo sin ninguno de sus compromisos.

---

## Prueba 3 — No se duplican los correos

**Lo que arregla:** al reintentar, quien ya había recibido la minuta la recibía
otra vez.

1. Procesa una reunión y espera a que lleguen los correos.
2. Entra en la reunión y pulsa **«Enviar correos»**.
   → **Debe** volver a enviarlos. Es una acción explícita tuya.
3. Ahora pulsa **«Reintentar»** en una reunión ya completada.
   → **No debe** llegar ningún correo repetido.

Para verlo por dentro:

```sql
SELECT recipient_email, type, status, attempts, dedupe_key, created_at, sent_at
FROM email_logs WHERE meeting_id = 'PEGA-EL-ID' ORDER BY created_at;
```

Cada destinatario debe tener **una fila por contenido enviado**, no una por
intento.

---

## Prueba 4 — La baja

1. En el correo de un participante, pulsa **«Date de baja»** (al final).
2. Confirma con el botón.
3. Comprueba:

```sql
SELECT * FROM email_unsubscribes;
```

4. Vuelve a pulsar **«Enviar correos»** en la reunión.
   → A esa persona **no** le llega nada. A los demás sí.

**En Gmail**, además, debería aparecer «Cancelar suscripción» junto al remitente,
arriba del todo. Eso es la cabecera `List-Unsubscribe` funcionando; es lo que
mejora la reputación del remitente.

Para volver a darte de alta:

```sql
DELETE FROM email_unsubscribes WHERE email = 'tu@correo.com';
```

---

## Prueba 5 — Responder al correo

Responde a una minuta desde la cuenta del participante.

→ La respuesta debe ir **a quien convocó la reunión**, no a la cuenta técnica
desde la que sale el correo. Antes caía en un buzón que no lee nadie.

---

## Prueba 6 — Enlaces que no valen

Pega estas URLs en el navegador. Sirven para confirmar que **falla cerrado**:

| URL | Debe salir |
|---|---|
| `/minuta/inventado.falso` | «Enlace no válido» |
| `/minuta/` + token con una letra cambiada | «Enlace no válido» |
| `/baja/inventado.falso` | «Enlace no válido» |

*(Verificado ya en local, pero conviene confirmarlo en el entorno real.)*

---

## Prueba 7 — La cuota

Abre, con sesión iniciada:

```
/api/health/email
```

Debe devolver `enviadosHoy`, `topeDiario` (500) y `quedanHoy`. Si `quedanHoy`
llega a 0, los envíos se niegan **explicando por qué** en vez de fallar sin
motivo aparente.

---

## Prueba 8 — Título generado por IA (v1.13)

**Lo que arregla:** "Grabar ahora" ponía "Grabación 5 ago 14:30" como título y
se quedaba así para siempre. Con diez reuniones así, la lista es
indistinguible. Ahora, en cuanto se genera la minuta, ese título se sustituye
por uno que la IA redacta a partir de lo que de verdad se habló.

**Requiere la migración `023_auto_titles.sql`.** Sin ella el análisis sigue
funcionando (el `UPDATE` del título falla solo, en silencio, y queda registrado
en los logs como advertencia) pero el título nunca cambia.

1. Pulsa **«Grabar ahora»** (no el formulario normal). Comprueba que el título
   queda como `Grabación 5 ago 14:30`.
2. Graba algo con un tema reconocible — p. ej. habla 30-60 s sobre un
   presupuesto, o sobre el seguimiento de una obra.
3. Espera a que termine de procesarse.

| Debe pasar | No debe pasar |
|---|---|
| El título cambia a algo relacionado con el contenido | Que se quede en la fecha/hora |
| El título es corto (3-8 palabras), sin comillas | Un título larguísimo, o con `"` al principio/final |
| Si grabaste algo sin tema claro, sale algo como «Reunión sin tema definido» | Que la IA se invente un tema que no hubo |

4. **Ahora prueba que NO se pisa un título puesto a mano.** Crea una reunión
   con el formulario normal (no "Grabar ahora"), ponle un título tú mismo,
   grábala y procésala.
   → El título debe quedar **exactamente** como lo escribiste. La IA no debe
   tocarlo.

5. **Y que un título tecleado a mitad de proceso gana.** Con "Grabar ahora",
   antes de que termine de procesarse, edita el título manualmente (si hay
   forma de hacerlo en tu entorno; si no, salta este paso).
   → Cuando termine el análisis, debe quedar el título que tú pusiste, no el
   de la IA.

Para verlo por dentro:

```sql
SELECT title, title_is_auto FROM meetings WHERE id = 'PEGA-EL-ID';
```

Tras un análisis exitoso de una reunión de "Grabar ahora", `title_is_auto`
debe quedar en `false` — es la señal de que ya no se debe volver a tocar.

---

## Si algo falla

1. Mira `email_logs` (consulta de la prueba 3): la columna `last_error` dice el
   motivo real.
2. [Runbook 01 §3](01-correo.md) — diagnóstico de «no llegan los correos».
3. [Runbook 02 §6](02-enlaces-publicos.md) — diagnóstico de los enlaces.
4. Para volver atrás: [runbook 00](00-respaldo-y-restauracion.md). El punto
   seguro es `v1.10.0-estable`, que es lo que hay en producción.

---

## Lo que NO se arregla en esta versión

**Los rebotes siguen siendo invisibles.** `status = 'sent'` significa «Gmail lo
aceptó», no «llegó». Si alguien jura que no le llegó nada y la fila dice `sent`:
mira su carpeta de spam, y mira la bandeja de entrada de `GMAIL_USER`, que es
donde caen los avisos de rebote.

Esto sólo se resuelve con los webhooks de un proveedor de correo, y eso exige
un dominio propio (~10 €/año). El razonamiento completo está en
[runbook 01 §6](01-correo.md).
