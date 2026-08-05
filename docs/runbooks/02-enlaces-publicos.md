# Runbook 02 — Enlaces públicos y bajas

> **Versión:** v1.12 · **Archivos:** `src/lib/minute-links.ts` · `src/app/minuta/[token]/` · `src/app/baja/[token]/` · `src/app/api/baja/[token]/`

---

## 1. Qué resuelve

El botón «Ver en ZRNote» de cada correo apuntaba a `/dashboard/meetings/{id}`,
y esa página filtra por `created_by = user.id`. **El destinatario veía un login
y, tras iniciar sesión, un 404.** El llamado a la acción principal de todos
nuestros correos estaba roto para todo el que no fuera el organizador — que son
casi todos los que lo reciben.

Ahora cada participante recibe un enlace firmado, personal, que abre la minuta
sin necesidad de cuenta.

---

## 2. Cómo funciona

```
token = base64url({meetingId, email, exp}) + "." + HMAC-SHA256(payload, clave)
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
/minuta/{token}                    /api/baja/{token}
vista pública de la minuta         baja de un clic (POST, RFC 8058)
                                   GET → redirige a /baja/{token}
```

**El mismo token sirve para las dos cosas a propósito:** quien puede leer la
minuta es exactamente quien puede darse de baja de ella. No hacen falta dos
secretos ni dos caducidades.

### La clave de firma

Se busca en este orden:

1. `MINUTE_LINK_SECRET` — si existe, se usa tal cual.
2. Si no, se **deriva** de `SUPABASE_SERVICE_ROLE_KEY`:
   `sha256("zrnote-minute-link:" + clave)`.

La derivación es de un solo sentido, así que un token filtrado nunca puede
revelar la credencial de la que salió. Gracias a esto **no hace falta configurar
nada nuevo en Vercel**: funciona con lo que ya está.

> Si quieres una clave dedicada (recomendable a medio plazo), añade
> `MINUTE_LINK_SECRET` en Vercel con una cadena aleatoria larga. **Ojo: al
> ponerla, todos los enlaces emitidos hasta ese momento dejan de funcionar.**

### Caducidad

90 días por defecto. Pasado ese plazo el enlace muestra «Este enlace ha
caducado» y sugiere pedir el reenvío.

### Qué se ve y qué NO

La página pública muestra: título, fecha, **los compromisos de esa persona**,
resumen, decisiones y los compromisos de los demás.

**No muestra la transcripción.** Es deliberado: la transcripción literal de una
reunión es mucho más sensible que su acta, y el correo nunca prometió darla.
La página lleva `robots: noindex` para que no acabe en un buscador.

---

## 3. La baja

| Vía | Método | Quién la usa |
|---|---|---|
| `/api/baja/{token}` | **POST** | El cliente de correo (Gmail, Yahoo, Outlook) al pulsar «Cancelar suscripción» |
| `/baja/{token}` | página con botón | Una persona que abre el enlace en el navegador |
| `/api/baja/{token}` | GET | Redirige a la página. **Nunca da de baja.** |

**Por qué el GET no da de baja:** los prefetch del navegador, los antivirus
corporativos y los escáneres de enlaces del propio correo abren URLs sin que
nadie las pulse. Si el GET diera de baja, daría de baja a gente que no quería.

**Por qué el POST no pide confirmación:** la RFC 8058 exige que el POST baste.
Una página intermedia incumple la norma y Gmail penaliza al remitente por ello.

La baja es **global**, no por reunión: quien dice que no quiere recibir minutas
no quiere ninguna. Afecta también a los recordatorios.

### Cabeceras que se envían

```
List-Unsubscribe: <https://…/api/baja/{token}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

`List-Unsubscribe-Post` **sólo** se manda cuando hay URL. Anunciarlo con un
`mailto:` sería mentirle al cliente de correo —un mailto no responde a un POST—
y eso penaliza más que no ofrecer nada.

---

## 4. Degradación: qué pasa si falta la clave

**Los correos siguen saliendo.** `canSignLinks()` comprueba si se puede firmar;
si no:

- El botón apunta al panel en vez de a la vista pública.
- No hay enlace ni cabecera de baja.

Es deliberado y hay una prueba que lo fija. Una variable de entorno ausente no
puede dejar a nadie sin minuta: es exactamente el patrón que ya rompió los
correos en v1.10, cuando `generateGoogleCalendarUrl` lanzaba desde dentro de la
construcción del HTML y **ningún** correo salía.

---

## 5. Diagnóstico

### «Me dice que el enlace no es válido»

1. **¿Está cortado?** Es la causa más frecuente. Algunos clientes de correo
   parten los enlaces largos al reenviar. Que copie el enlace entero.
2. **¿Se cambió `MINUTE_LINK_SECRET`?** Rotar la clave invalida todos los
   enlaces anteriores. Es el mecanismo de revocación de emergencia — pero si se
   hizo sin querer, hay que volver a poner la anterior.
3. **¿Se rotó la service key?** Si no había `MINUTE_LINK_SECRET`, la clave se
   derivaba de ella: rotarla invalidó todos los enlaces.

### «Dice que ha caducado»

Han pasado más de 90 días. Que el organizador pulse «Enviar correos» y se emiten
tokens nuevos.

### «Se dio de baja pero le siguen llegando correos»

```sql
SELECT * FROM email_unsubscribes WHERE email = 'persona@empresa.com';
```

- Sin fila → la baja no se registró. Mirar los logs de `/api/baja`.
- Con fila → mirar si el correo salió antes de la baja:
  ```sql
  SELECT recipient_email, type, status, sent_at FROM email_logs
  WHERE recipient_email = 'persona@empresa.com' ORDER BY sent_at DESC LIMIT 5;
  ```

### Volver a dar de alta a alguien

```sql
DELETE FROM email_unsubscribes WHERE email = 'persona@empresa.com';
```

Sólo a petición de esa persona. Borrarlo por iniciativa propia es reactivar un
consentimiento que retiró.

---

## 6. Revocar un enlace filtrado

No hay revocación individual: el token no se guarda en ninguna parte (por eso no
hace falta escribir en base de datos para emitirlo). Las opciones son:

- **Rotar `MINUTE_LINK_SECRET`** → invalida TODOS los enlaces de TODAS las
  reuniones. Es la palanca de emergencia.
- **Borrar la reunión** → la página responde «Esta reunión ya no existe».

Si algún día hace falta revocación fina, la vía es una tabla de tokens
revocados consultada en `verifyMinuteToken`. No se ha hecho porque añade una
consulta a cada apertura para un caso que aún no ha ocurrido.

---

## 7. Cómo retroceder

### Sólo el código

```bash
git checkout v1.10.0-estable -- src/lib/meeting-emails.ts src/lib/reminders.ts src/lib/smtp.ts
```

Y borrar lo que no existía antes:

```bash
rm -rf src/lib/minute-links.ts src/lib/minute-links.test.ts src/app/minuta src/app/baja src/app/api/baja src/components/UnsubscribeForm.tsx
```

Consecuencia: vuelve el botón roto para los participantes y desaparece la baja.
Las cabeceras `List-Unsubscribe` dejan de enviarse, lo que empeora la reputación
del remitente ante Gmail.

### La base de datos

**Deja `email_unsubscribes` donde está.** El código antiguo la ignora, y
borrarla haría que quien se dio de baja volviera a recibir correos — justo lo
que no debe pasar. El SQL de reversión está comentado en la migración 022 por
completitud, no como recomendación.

---

## 8. Invariantes

1. **`verifyMinuteToken` falla cerrado.** Cualquier duda es un no.
2. **La comparación de la firma es en tiempo constante** (`timingSafeEqual`).
   Con `===`, un atacante podría deducir la firma midiendo tiempos de respuesta.
3. **La página pública nunca sirve `transcript_raw`.**
4. **Un GET jamás cambia estado.**
5. **Sin clave de firma, los correos salen igual** (degradado).
