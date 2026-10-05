# ZRNote — Revisión estratégica (octubre 2026)

> Evaluación honesta del producto, la metodología y la proyección.

---

## 1. Qué es ZRNote hoy

Una app que graba reuniones, las transcribe y genera minutas
estructuradas con IA. PWA instalable, extensión de Chrome (sin publicar),
APK Android (sin publicar). Stack 100% capa gratuita: Next.js en Vercel
Hobby, Supabase Free, Groq Free, Gemini Free, Gmail SMTP, Jina Free.

**Números reales:**
- ~16 reuniones procesadas en producción (dato de la auditoría de julio)
- 1 usuario activo (el desarrollador)
- 0 ingresos
- 35 migraciones SQL, 361 tests, ~1.600 líneas solo en processing.ts
- Código equivalente a un equipo de 3-4 personas durante 3 meses

---

## 2. Qué funciona bien (fortalezas reales)

1. **El pipeline es robusto.** Transcribir → analizar → correos funciona
   de extremo a extremo, con fallback Gemini→Groq, rate limiting,
   idempotencia, y recuperación del audio aunque falle todo lo demás.
   Costó semanas arreglarlo, pero ahora es sólido.

2. **El prompt es maduro.** Pendientes sin dueño, contexto de reunión
   (participantes, título, fecha), clasificación del tipo de sesión,
   barrido final, resúmenes directos. Es de los mejores prompts de
   generación de minutas que se pueden escribir sin speaker diarization.

3. **La arquitectura de estilos es extensible.** Añadir un estilo nuevo
   es una entrada en `MINUTE_STYLES` — no toca la base ni el pipeline.
   Se probó con tres estilos (ejecutiva, clase, contenido) y funciona.

4. **La auditoría de seguridad fue seria.** RLS en todo, CORS acotado,
   CSRF protegido, XSS cubierto, retención con borrado real del audio.

5. **La documentación existe y es útil.** 9 runbooks, 3 ADRs, contexto
   maestro actualizado, auditorías con hallazgos verificados.

---

## 3. Qué NO funciona (debilidades honestas)

### 3.1 Producto sin usuarios

El mayor problema de ZRNote no es técnico: es que **nadie lo usa** más
allá de ti. 16 reuniones en 3 meses de existencia no son tracción, son
pruebas del desarrollador. No se ha validado que alguien pagaría por esto
o siquiera lo usaría gratis.

**Consecuencia:** cada feature nueva (modo contenido, cuaderno digital,
capítulos con timestamps) es una apuesta sobre qué querrán usuarios
que aún no existen. Puede que acierten todas. Puede que ninguna importe.

### 3.2 Features antes de distribución

La extensión de Chrome no está publicada. El APK no está en Play Store.
No hay landing page con CTA claro. No hay onboarding para alguien que
no sea el desarrollador. Se han construido 41 features pero no hay un
canal por el que alguien nuevo pueda llegar.

### 3.3 Deuda técnica creciente

- `processing.ts` lleva meses en ~1.600 líneas con el TODO de dividirlo.
- 120+ `: any` sin tipar.
- La migración 032 (seguridad) y la 035 (feature) llevan semanas sin
  aplicar en producción.
- `extension.pem` sigue comprometida.

### 3.4 Infraestructura frágil

- Supabase marcó la cuenta como "EXCEEDING USAGE LIMITS". El audio y
  los embeddings se comen la cuota de 500MB/1GB.
- Gmail SMTP tiene un techo de 500 correos/día y cualquier día lo cortan
  sin aviso.
- Groq Free Tier es 20 RPM y 12k TPM. Un equipo de 5 personas con
  reuniones diarias lo reventaría.

### 3.5 Precio: $0 perpetuo

No hay plan de cobrar. No hay Stripe. No hay ningún mecanismo para
convertir uso en ingreso. La capa gratuita tiene límites que impiden
escalar, y no hay un modelo de negocio que financie la siguiente capa.

---

## 4. Metodología actual — evaluación

### Qué se hace bien

- **Auditorías periódicas con hallazgos verificados** (no solo escaneos
  automáticos).
- **Tests reales** (361, subiendo en cada sesión, cubren la lógica de
  negocio).
- **Documentación como parte del trabajo** (no como afterthought).
- **Commits atómicos** con mensajes en español descriptivos.
- **Degradación segura** (migraciones aditivas, valores por defecto
  que hacen que todo siga funcionando sin la migración nueva).

### Qué se hace mal

- **Se añaden features sin validar las anteriores.** El modo estudio se
  construyó sin saber si alguien usa el modo ejecutivo en producción. El
  modo contenido se construyó encima de eso.
- **Las migraciones no se aplican.** Tres migraciones pendientes en
  producción (032, 035, y la extensión del pem). El código está listo,
  pero el despliegue completo no se cierra.
- **No hay E2E tests.** 361 unit tests es bueno, pero nadie prueba el
  flujo "grabo → minuta → correo" automatizadamente.
- **Se construyen abstracciones antes de necesitarlas.** El gate de
  opt-in en el perfil es un buen ejemplo: resuelve un problema de un
  selector de 3 opciones con una migración, un endpoint, un componente
  y lógica de degradación en 4 archivos.

---

## 5. Proyección — tres caminos posibles

### Camino A: Producto real (recomendado si quieres que esto sea un negocio)

**Próximos 30 días:**
1. Aplicar las 3 migraciones pendientes y rotar la extensión.
2. Publicar la extensión en Chrome Web Store (aunque sea en "sin listar").
3. Hacer que 5 personas **que no seas tú** usen ZRNote durante 2 semanas.
4. No construir NADA nuevo hasta tener feedback de esas 5 personas.

**Próximos 90 días:**
5. Stripe con un plan Pro ($9-15/mes). No tiene que hacer mucho más que
   lo de hoy, pero tiene que cobrarse.
6. Landing page con demo (una grabación de ejemplo → minuta de ejemplo).
7. Arreglar la cuota de Supabase (o subir al plan Pro de Supabase, $25/mes).

**Lo que NO hacer:** más estilos, más formatos de exportación, RAG UI,
Recall.ai bot, integraciones con Notion/Slack/Linear. Todo eso es
feature creep hasta que haya validación.

### Camino B: Herramienta personal (si esto es para ti y tu equipo)

Entonces lo que hay es más que suficiente. Dedica 2 horas a:
1. Aplicar las migraciones.
2. Rotar la extensión.
3. Verificar que Supabase no te va a pausar.

Y deja de construir features nuevas. Úsalo, y cuando algo falle o falte
de verdad, entonces se construye.

### Camino C: Portfolio técnico (si esto es una demostración de capacidad)

Entonces documéntalo para ese propósito:
1. Un README.md público que explique qué es, con screenshots.
2. Un diagrama de arquitectura limpio.
3. Los números técnicos (361 tests, 35 migraciones, 3 estilos de IA).

Lo que hay de código ya demuestra capacidad de sobra. Las features
nuevas no suman tanto como una presentación clara de lo que ya existe.

---

## 6. Lo que hay que hacer AHORA (sea cual sea el camino)

Estas son acciones de higiene, no features:

| # | Qué | Por qué | Esfuerzo |
|---|-----|---------|----------|
| 1 | Aplicar migración 032 | La corrección del rate limiter no está activa | 5 min |
| 2 | Aplicar migración 035 | El modo contenido no funciona sin ella | 5 min |
| 3 | Rotar `extension.pem` | Vulnerabilidad abierta desde julio | 15 min |
| 4 | Verificar cuota Supabase | Riesgo de pausa del proyecto | 10 min |
| 5 | Bump versión a 1.28.0 | Ya hecho en este commit | 0 min |

---

*Escrito: 2026-10-05. Próxima revisión: cuando haya usuarios reales.*
