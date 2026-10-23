# Puesta en marcha — lo que tienes que hacer tú

Lista de todo lo que **no se puede hacer desde el código** para que ZR Note funcione
completa: claves, base de datos, despliegue y app Android. Ordenada por prioridad.

- 🔴 **Imprescindible** — sin esto, algo central no funciona.
- 🟡 **Recomendado** — funciona sin ello, pero peor o con una función apagada.
- ⚪ **Opcional** — mejoras finas.

> Atajo: cuando termines, entra en la app → **Ajustes → Diagnóstico del sistema**.
> Revisa en vivo cada servicio de esta lista y te dice exactamente qué falta.

---

## 1. Variables de entorno en Vercel

Vercel → proyecto `zrnote` → **Settings → Environment Variables**. Ponlas en
**Production y Preview** (si no, el preview de cada PR no funciona igual que producción).
La plantilla completa, con explicaciones, está en [`.env.example`](../../.env.example).

| Prioridad | Variable | Para qué | Dónde se saca |
|---|---|---|---|
| 🔴 | `NEXT_PUBLIC_SUPABASE_URL` | Base de datos | Supabase → Project Settings → API |
| 🔴 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Base de datos (navegador) | Supabase → Project Settings → API |
| 🔴 | `SUPABASE_SERVICE_ROLE_KEY` | Base de datos (servidor) | Supabase → Project Settings → API |
| 🔴 | `GROQ_API_KEY` | Transcribir el audio | <https://console.groq.com> |
| 🔴 | `MINUTE_LINK_SECRET` | Firmar los enlaces públicos de minutas | `openssl rand -hex 32` |
| 🔴 | `CRON_SECRET` | Limpieza de audio y recordatorios | `openssl rand -hex 32` |
| 🟡 | `GEMINI_API_KEY` | Redactar la minuta **más rápido y sin recortar** reuniones largas | <https://aistudio.google.com/apikey> |
| 🟡 | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Notificaciones push | `npx web-push generate-vapid-keys` |
| 🟡 | `VAPID_PRIVATE_KEY` | Notificaciones push | (mismo comando) |
| 🟡 | `VAPID_SUBJECT` | Notificaciones push | `mailto:tu-correo@…` |
| 🟡 | `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Enviar la minuta por correo | Gmail con 2 pasos → contraseña de aplicación |
| 🟡 | `NEXT_PUBLIC_APP_URL` | Enlaces de los correos | `https://zrnote.vercel.app` (sin barra final) |
| ⚪ | `JINA_API_KEY` | Búsqueda semántica (aún sin pantalla) | <https://jina.ai> |
| ⚪ | `GEMINI_MODEL`, `EMAIL_DAILY_LIMIT`, `MAIL_PROVIDER` | Ajustes finos | ver `.env.example` |
| ⚪ | `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | SEO | Search Console / Bing Webmaster |

**Después de cambiar variables hay que volver a desplegar** (Vercel → Deployments →
⋯ → Redeploy): las variables no se aplican a un despliegue que ya existe.

### Por qué importan las VAPID 🟡
Las fases nuevas se apoyan en las notificaciones: «Tu minuta está lista» y «Revisa
tu grabación» cuando se corta con la pantalla bloqueada. **Sin las tres claves VAPID
no llega ningún aviso**, aunque el usuario dé permiso. Generarlas es un solo comando y
no se vuelven a tocar (si las cambias, cada usuario tiene que reactivar los avisos).

---

## 2. Base de datos (Supabase)

🔴 **Comprueba que el proyecto de ZR Note tiene aplicadas las migraciones 001 → 036**
(`supabase/migrations/`), ejecutándolas en orden en **Supabase → SQL Editor** las que falten.

- Tu `.env.local` apunta al proyecto `qmdcpcwigzebqcoeiebi`. **Ese proyecto no está
  en la cuenta de Supabase conectada a Claude** (allí sólo están `zr-prod`,
  `zr-staging` y `zr-mecademy`, que son la otra app de la academia), así que no lo pude
  revisar desde aquí. Confirma también que Vercel usa ese mismo proyecto.
- El diagnóstico de la app ahora detecta las migraciones **025, 026, 029, 031, 033,
  034 y 035**: si falta alguna, te dice cuál y qué función apaga.
- La **032** (límite de peticiones atómico) y la **036** (avisos del Security Advisor)
  no se pueden detectar sin efectos secundarios: revísalas a mano en el historial de
  migraciones de Supabase.

🔴 **Bucket de almacenamiento `meeting-audio`** debe existir y ser **privado**
(Supabase → Storage). El diagnóstico lo comprueba.

---

## 3. Vercel: plan y tiempos (los «error 504»)

El arreglo del PR #1 hace que la app **reintente sola** cuando un paso pasa del límite,
así que el «error 504» ya no debería tumbar una minuta. Para que además **cada paso
sea más rápido**:

- 🟡 **Pon `GEMINI_API_KEY`** (punto 1): Gemini redacta la minuta bastante más rápido
  que el respaldo de Groq y no recorta reuniones de más de ~40 min.
- ⚪ **Plan Hobby vs Pro.** En Hobby cada función tiene como mucho **60 s**, y el
  `maxDuration: 120` de `upload-segment` en `vercel.json` se queda en 60. Si con lo
  anterior siguen apareciendo esperas largas en reuniones de más de una hora, el plan
  Pro permite subir el límite a 300 s (dímelo y ajusto `vercel.json`).
- En Hobby los **crons** sólo pueden correr una vez al día; los de ZR Note ya están
  programados así (02:00 y 03:00 UTC), no hay que cambiar nada.

---

## 4. App Android (Play Store / APK)

🟡 Para que **«Compartir → ZR Note»** aparezca al compartir un audio desde la grabadora:

1. Instala Bubblewrap (`npm i -g @bubblewrap/cli`), JDK 11+ y el Android SDK.
2. Ejecuta `twa/build.sh` — lee el `shareTarget` nuevo de `twa/twa-manifest.json`.
3. Sube la versión (`appVersionCode` +1) y publica el `.aab` en Play Console.
4. Verifica que `public/.well-known/assetlinks.json` tiene la huella del keystore con
   el que firmas (`keytool -list -v -keystore zrnote-keystore.jks -alias zrnote`); si
   no coincide, la app se abre con barra de navegador.

En **iPhone** no hay nada que hacer: iOS no deja que una web reciba «Compartir». La app
ya guía al usuario por el camino que sí funciona (Notas de Voz → «Subir audio»).

---

## 5. Seguridad pendiente

- 🔴 **Rotar la clave de la extensión de Chrome.** `extension.pem` estuvo en el
  historial de un repositorio público (`git log --all -- extension.pem`) y sigue
  comprometida aunque ahora esté en `.gitignore`. Genera una nueva, guárdala **fuera
  del repo** y vuelve a publicar la extensión. Detalle en
  [`docs/security/audit-2026-09-20.md`](../security/audit-2026-09-20.md).
- 🟡 Guarda el keystore de Android (`twa/*.jks`) en un gestor de contraseñas: si se
  pierde, no podrás publicar actualizaciones de la app en Play Store.

---

## 6. Al final: publicar y comprobar

1. Revisa el preview del PR #1 en el móvil (enlace en el comentario de Vercel del PR).
2. Mergea el PR #1 a `main` → Vercel lo publica en producción.
3. En producción: **Ajustes → Diagnóstico del sistema** → todo en verde (o sólo avisos
   que hayas decidido aceptar).
4. En **Ajustes**, activa «Avísame cuando esté lista» y graba una reunión corta de
   prueba de principio a fin.
