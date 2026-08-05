# Runbook 01 — Sistema de correo

> **Versión:** v1.11 · **Estado:** SMTP de Gmail (provisional, ver «Hacia dónde va»)
> **Archivos:** `src/lib/smtp.ts` · `email-outbox.ts` · `email-service.ts` · `meeting-emails.ts` · `reminders.ts`

---

## 1. Cómo funciona ahora

```
                       ┌─ pipeline, paso «emails»  (automático, force:false)
                       │
buildMeetingEmailJobs ─┼─ botón «Enviar correos»   (manual,     force:true)
                       │
                       └─ cron de recordatorios    (diario,     force:false)
                                    │
                                    ▼
                          dispatchEmailJobs()
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            claimEmailJobs()                 (nada que enviar)
      reserva la fila en email_logs
         con status='pending'
                    │
                    ▼
            por cada correo:
              sendMail()  ──►  Gmail SMTP (transporte con pool)
                    │
          markEmailSent() / markEmailFailed()
```

**La idea central:** la fila de `email_logs` se escribe **antes** de enviar, no
después. Esa fila lleva una `dedupe_key` con índice `UNIQUE`, así que reintentar
es seguro por construcción — la unicidad la garantiza Postgres, no la aplicación.

### Los dos modos, y por qué son distintos

| | `force: false` | `force: true` |
|---|---|---|
| Quién | pipeline automático, cron | el usuario pulsando «Enviar correos» |
| Ya enviado | **se salta** | se reenvía |
| Pendiente/fallido | se reenvía | se reenvía |

La idempotencia protege del *reintento automático*, no del usuario. Si alguien
pulsa el botón, quiere que salga; ahí el duplicado es intencionado.

### La clave de deduplicación

```
{meeting_id}:{kind}:{destinatario}:{hash del HTML}
```

El hash del contenido está a propósito: **si se regenera la minuta, el HTML
cambia, la clave cambia y el reenvío se permite.** Lo que se bloquea es mandar
dos veces *el mismo* correo, no volver a informar de algo nuevo.

---

## 2. Qué se arregló en v1.11 y por qué

| # | Síntoma | Causa real | Arreglo |
|---|---|---|---|
| 1 | **Un participante recibía compromisos de otra persona** bajo «Tus compromisos» | `matchItemsToParticipant` usaba `includes()`: `"mariana gomez".includes("ana")` es `true` | Comparación por palabras completas, sin tildes, con partículas ignoradas |
| 2 | **Los nombres con tilde no coincidían nunca** | «Ana Pérez» ≠ «Ana Perez» como cadenas | `normalizeName()` descompone en NFD y quita las marcas diacríticas |
| 3 | **Correos duplicados al reintentar** | El `INSERT` en `email_logs` era uno solo, al final. Si la función moría, no quedaba constancia de lo ya enviado | Libro mayor: fila reservada antes de enviar + `dedupe_key` UNIQUE |
| 4 | **`/send-emails` se cortaba a los 10 s** | No estaba en `vercel.json`, así que corría con el `maxDuration` por defecto | `maxDuration: 60` + presupuesto interno de 45 s |
| 5 | **Los recordatorios no se registraban en ninguna parte** | `reminders.ts` tenía su propio `createTransport` y su propio HTML | Pasa por `sendMail()` y por el libro mayor, con el mismo pie legal |
| 6 | **Correos sólo-HTML** (peor puntuación antispam) | `sendMail` no aceptaba `text` | `htmlToPlainText()` genera la alternativa automáticamente |
| 7 | **Un handshake TLS por mensaje** (~1 s desperdiciado cada uno) | Transporte sin `pool` | `pool: true, maxConnections: 3` |
| 8 | El mismo compromiso ocupaba **09:00–10:00 en el .ics y 09:00–09:30 en Google** | Dos implementaciones de la hora | Las dos dicen 09:00–09:30 |
| 9 | El diagnóstico podía decir «OK» sobre una config que no se usaba | `/api/health/email` creaba su propio transporte | `verifyTransport()` verifica el transporte real |
| 10 | El mismo fallo se explicaba de 3 maneras | Comprobación de `GMAIL_*` repetida en 3 sitios | `isEmailConfigured()` + `EMAIL_NOT_CONFIGURED` |

---

## 3. Diagnóstico: «no llegan los correos»

Sigue el orden. Cada paso descarta una causa.

**1. ¿Están las credenciales?** Abre, con sesión iniciada:

```
https://zrnote.vercel.app/api/health/email
```

`ok: true` → Gmail acepta las credenciales. `ok: false` → el `verdict` dice qué falta.

**2. ¿Qué dice el libro mayor?** En el SQL Editor de Supabase:

```sql
SELECT recipient_email, type, status, attempts, last_error, created_at, sent_at
FROM email_logs
WHERE meeting_id = 'PEGA-AQUI-EL-ID'
ORDER BY created_at DESC;
```

Interpretación:

| Lo que ves | Qué significa | Qué hacer |
|---|---|---|
| Sin filas | Nunca se intentó | ¿Tiene participantes con correo la reunión? |
| `status = 'pending'` | Se reservó pero la función murió antes de enviar | Pulsar «Enviar correos» |
| `status = 'failed'` | Gmail lo rechazó | Leer `last_error` |
| `status = 'sent'` | Gmail lo **aceptó** | Ver el aviso de abajo ⚠️ |

> ⚠️ **`sent` no significa «entregado».** SMTP responde OK cuando el servidor
> *acepta* el mensaje, no cuando llega al buzón. Un rebote duro (dirección mal
> escrita, buzón lleno) llega después, de forma asíncrona, a la bandeja de
> `GMAIL_USER` — y hoy nadie la lee. **Esto sólo se resuelve de verdad con los
> webhooks de un ESP (v1.12).** Si `status='sent'` y el destinatario jura que no
> le llegó: mirar su carpeta de spam, y mirar la bandeja de `GMAIL_USER`.

**3. ¿Se pasó el límite de Gmail?** 500 destinatarios/día en Gmail gratis,
2.000 en Workspace. Si `last_error` menciona *rate*, *limit* o *quota*, es eso:
hay que esperar 24 h. **No hay forma de subirlo**; es el techo del diseño actual.

**4. ¿Está la migración aplicada?**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'email_logs' AND column_name = 'dedupe_key';
```

Si no devuelve nada, falta aplicar `021_email_idempotency.sql`.

---

## 4. Tareas habituales

### Reenviar la minuta de una reunión

Interfaz: entra en la reunión → botón **«Enviar correos»**. Va con `force: true`,
así que reenvía a todos aunque ya lo hubieran recibido.

### Forzar que un correo se pueda volver a enviar desde el pipeline

Basta con invalidar su fila:

```sql
UPDATE email_logs SET status = 'failed'
WHERE meeting_id = 'ID' AND recipient_email = 'persona@empresa.com';
```

### Ver los correos que se quedaron a medias en toda la app

```sql
SELECT meeting_id, recipient_email, type, created_at
FROM email_logs WHERE status = 'pending' AND created_at < now() - interval '1 hour'
ORDER BY created_at DESC;
```

Todo lo que salga ahí es un envío que murió a mitad.

### Aplicar la migración en producción

La conexión directa a Postgres está bloqueada; la vía que funciona es la
Management API (ver `CONTEXT.md`):

```bash
curl -X POST "https://api.supabase.com/v1/projects/qmdcpcwigzebqcoeiebi/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @- < supabase/migrations/021_email_idempotency.sql
```

> El SQL hay que envolverlo en `{"query": "..."}`. Lo más cómodo es pegarlo
> directamente en el **SQL Editor** del panel de Supabase.

---

## 5. Cómo retroceder

### Sólo el código, dejando la base como está

La migración es **aditiva**: el código de v1.10 ignora las columnas nuevas, así
que puede convivir con ellas sin problema. Revertir el código es suficiente.

```bash
git checkout v1.10.0-estable -- src/lib/smtp.ts src/lib/email-service.ts src/lib/email-outbox.ts src/lib/meeting-emails.ts src/lib/reminders.ts src/lib/ics.ts vercel.json
```

`email-outbox.ts` no existe en v1.10, así que ese `checkout` fallará para ese
archivo; bórralo a mano:

```bash
rm src/lib/email-outbox.ts src/lib/email-outbox.test.ts src/lib/smtp.test.ts
```

### La tanda entera

```bash
git checkout main
```

(El trabajo vive en la rama `fix/v1.11-correo-y-bugs`; `main` sigue en v1.10.)

### Revertir también la base de datos

Normalmente **no hace falta**. Si aun así: el SQL de reversión está comentado al
final de `supabase/migrations/021_email_idempotency.sql`.

> Ojo: revertir la migración borra el historial de intentos fallidos
> (`last_error`, `attempts`). Los envíos en sí no se pierden.

### Consecuencias de volver a v1.10

Vuelven los 10 bugs de la tabla del punto 2. En concreto vuelven **los correos
duplicados** y **la fuga de compromisos entre personas**. No es un estado
recomendable salvo como parada de emergencia.

---

## 6. Hacia dónde va (v1.12)

Gmail + contraseña de aplicación es un **techo duro**, no una elección:

- 500 destinatarios/día, y las ráfagas se estrangulan.
- Un pico bloquea **la cuenta entera** → se caen todos los clientes a la vez.
- El remitente es una dirección `@gmail.com`: no se puede firmar DKIM del
  dominio propio.
- **Los rebotes son invisibles.** Es la limitación más grave.

El plan es **Resend** (la columna `resend_id` existe en la tabla desde
`001_initial.sql`: era el diseño original):

- `POST /emails/batch` manda hasta 100 correos en **una** llamada (~300 ms).
  Desaparece el bucle, desaparecen las esperas y desaparece el límite de tiempo.
- Webhooks `delivered` / `bounced` / `complained` → `status` deja de mentir.
- SPF + DKIM + DMARC sobre dominio propio, y `Reply-To` al organizador.
- $20/mes para 50.000 correos ≈ 1.000 reuniones de 6 participantes.

El libro mayor de este runbook **no cambia** con esa migración: seguirá dando
idempotencia y auditoría. Lo único que cambia es quién transporta el mensaje, y
que `resend_id` por fin se rellenará.

---

## 7. Invariantes que no hay que romper

1. **Todo el correo sale por `sendMail()`.** Ya nos costó un fallo tener dos
   constructores de minutas, uno de los cuales no escapaba el HTML.
2. **Todo lo que venga del LLM o del usuario se escapa** con `escapeHtml()`
   antes de entrar en el HTML. Una transcripción puede contener `<script>`.
3. **La fila se reserva antes de enviar**, nunca después.
4. **Las migraciones son aditivas.** Nunca `DROP COLUMN`.
5. **Un fallo de registro no puede tumbar un envío correcto** — de ahí que
   `markEmailSent` sólo logee el error en vez de lanzarlo.
