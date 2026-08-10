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
| 11 | **Responder a una minuta no le llegaba a nadie** | Sin `Reply-To`: las respuestas iban al buzón técnico | `Reply-To` = quien convocó la reunión |
| 12 | Sin forma de darse de baja | Sin `List-Unsubscribe` | Cabecera `mailto:` al organizador (ver §6) |
| 13 | **Los correos dejaban de salir sin explicación** al pasar de 500/día | Gmail corta la cuota en silencio | `getDailyEmailUsage()` avisa antes de chocar |

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

**3. ¿Se pasó el límite de Gmail?** Míralo directamente en
`/api/health/email`: los campos `enviadosHoy`, `topeDiario` y `quedanHoy`.

500 destinatarios/día en Gmail gratis, 2.000 en Workspace (ajustable con
`EMAIL_DAILY_LIMIT`). Si `quedanHoy` es 0, `dispatchEmailJobs` ni lo intenta y
devuelve un error que lo dice con todas las letras. **No hay forma de subir el
tope real**; es el techo del diseño actual (ver §6).

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

## 6. Por qué seguimos en Gmail (investigado 2026-08-05)

**Conclusión: sin dominio propio, Gmail SMTP es la única opción gratuita que
funciona. No la cambies «a algo mejor» sin leer esto.**

### El motivo

Desde 2024, Gmail, Yahoo y Microsoft exigen que el remitente esté autenticado
(SPF + DKIM + DMARC). **Un dominio gratuito como `gmail.com` no se puede
autenticar en un ESP de terceros**, porque no controlas su DNS.

Gmail SMTP funciona precisamente porque **Google firma con la clave DKIM de
`gmail.com`, que es suya**. Eres tú enviando desde tu cuenta, no un tercero
suplantándote.

Si mandas desde una dirección `@gmail.com` **a través de** Brevo/Resend/etc., no
hay alineación DKIM y los correos hacia destinatarios de Gmail **fallan en
silencio**: sin error, sin rebote, sin nada. Documentado
[aquí](https://dev.to/tigawanna/brevo-smtp-emails-to-other-gmail-accounts-silently-failing-verified-domain-to-the-rescue-1d78)
y confirmado en la ayuda de Brevo: *«los dominios de remitente gratuitos no se
pueden autenticar»*.

Migrar a un ESP sin dominio dejaría el correo **peor** de lo que está.

### El estado de los planes gratuitos (agosto 2026)

| Proveedor | Gratis | ¿Sirve sin dominio? |
|---|---|---|
| **Gmail SMTP** (actual) | 500/día | ✅ **La única** |
| Brevo | 300/día = 9.000/mes, webhooks de rebote incluidos | ❌ Fallos silenciosos |
| Resend | 3.000/mes (100/día) | ❌ |
| MailerSend | 3.000/mes | ❌ |
| SendGrid | Plan gratuito **eliminado**; hoy es prueba de 60 días | ❌ |

Detalle de Brevo: **cada destinatario cuenta**. Una reunión de 5 participantes
gasta 5 de los 300, no 1.

### Qué desbloquea un dominio (~10 €/año)

Un `.com` cuesta ~9-11 $/año en Cloudflare o Porkbun (mismo precio en la
renovación; Namecheap y GoDaddy descuentan el primer año y lo recuperan
después). No es una suscripción: es una vez al año.

Con dominio se abre **Brevo gratis**: 9.000 correos/mes (18× lo de hoy),
webhooks de rebote reales —lo que arregla que `status='sent'` sea una verdad a
medias— y `minutas@tudominio.com` en vez de una dirección de Gmail personal.

**Cómo se haría el cambio:** `smtp.ts` ya tiene el proveedor detrás de una
interfaz `MailProvider`. Añadir Brevo es un `const brevoProvider` y un `case` en
`activeProvider()`; se activa con `MAIL_PROVIDER=brevo`. El libro mayor, la
idempotencia y los constructores de HTML **no cambian**.

### Lo que sigue sin resolverse mientras estemos en Gmail

- **Los rebotes son invisibles.** `status='sent'` significa «Gmail lo aceptó»,
  no «llegó». Los rebotes duros vuelven a la bandeja de `GMAIL_USER`, que no lee
  nadie. Sólo lo arreglan los webhooks de un ESP.
- **Un pico bloquea la cuenta entera**, o sea todos los usuarios a la vez.
- El tope de 500/día no se puede subir (2.000 con Workspace).

### Mitigaciones aplicadas mientras tanto (v1.11)

- **`Reply-To` al organizador**: responder a la minuta le llega a quien convocó
  la reunión, no al buzón técnico.
- **`List-Unsubscribe`** apuntando a ese mismo organizador. Es un `mailto:`, no
  una URL de un clic, deliberadamente: RFC 8058 exige que una URL responda a un
  POST y dé de baja de verdad; prometerlo sin implementarlo penaliza más que no
  ponerlo. Pasará a URL cuando existan los enlaces firmados.
- **Aviso de cuota**: `getDailyEmailUsage()` cuenta lo enviado hoy y
  `dispatchEmailJobs` se niega a intentarlo si no queda margen, explicando por
  qué. Antes te quedabas sin correos sin saber la razón. Visible en
  `/api/health/email` (`enviadosHoy`, `topeDiario`, `quedanHoy`).

---

## 7. Compromisos: evento vs. tarea (v1.16)

Cada compromiso se clasifica ahora en `kind`: `'evento'` (ocurre en un momento
concreto — una reunión, una llamada, una visita) o `'tarea'` (se completa
ANTES de una fecha — enviar, revisar, preparar; el valor por defecto, y el más
común con diferencia). Lo decide el LLM al redactar el acta, en el mismo JSON
que ya devuelve — sin llamada adicional.

**Por qué importa para el correo y el calendario:** antes, TODO compromiso con
fecha se ofrecía como un bloque de 30 minutos a las 9:00 en Google Calendar,
tuviera sentido o no. "Enviar la cotización" no ocurre "de 9:00 a 9:30" — eso
es forzar un molde de evento sobre algo que no lo es.

| | Con fecha | Sin fecha |
|---|---|---|
| **Evento** | Bloque de tiempo, 09:00–09:30 (o la hora acordada) | Se propone mañana 9:00, editable — un evento sin ningún horario no es accionable |
| **Tarea** | Google Calendar de **todo el día** (`allDay`), no un bloque | **Sin enlace a Calendar.** En su lugar, enlaza a `/dashboard/action-items`, donde de verdad se puede poner fecha o marcarla como hecha — no se inventa una fecha falsa |

Se aplica en tres sitios en paralelo, y los tres deben decir lo mismo:
`actionItemCalendarLink()` (el botón del correo), `generateGoogleCalendarUrl()`
con `allDay: true` (mismo mecanismo, formato `dates=YYYYMMDD/YYYYMMDD` sin
hora — el final es EXCLUSIVO en la API de Google), y `generateICS()` (el
adjunto `.ics`, con `DTSTART;VALUE=DATE:` en vez de `DTSTART:...T090000`).

**Por qué NO hay integración con Google Tasks.** Se investigó: a diferencia de
Calendar, Google Tasks no tiene una URL de "añadir rápido" sin autenticación
— cualquier creación programática exige la API de Tasks con OAuth. Eso
implica que cada usuario autorizara a ZRNote a acceder a su cuenta de Google,
una pieza de infraestructura y de consentimiento que no se monta sin decisión
explícita. La distinción evento/tarea de arriba consigue casi el mismo
resultado práctico —que una tarea no ocupe un hueco falso en el calendario—
sin necesitar ninguna autenticación nueva.

Migración: `024_action_item_kind.sql`, aditiva, `kind` con `DEFAULT 'tarea'`.

---

## 8. Invariantes que no hay que romper

1. **Todo el correo sale por `sendMail()`.** Ya nos costó un fallo tener dos
   constructores de minutas, uno de los cuales no escapaba el HTML.
2. **Todo lo que venga del LLM o del usuario se escapa** con `escapeHtml()`
   antes de entrar en el HTML. Una transcripción puede contener `<script>`.
3. **La fila se reserva antes de enviar**, nunca después.
4. **Las migraciones son aditivas.** Nunca `DROP COLUMN`.
5. **Un fallo de registro no puede tumbar un envío correcto** — de ahí que
   `markEmailSent` sólo logee el error en vez de lanzarlo.
6. **`kind` no reconocido degrada a `'tarea'`**, nunca a `'evento'` — es el
   comportamiento que ya existía, y equivocarse hacia "evento" fabricaría
   bloques de calendario falsos sobre algo que no lo es.
