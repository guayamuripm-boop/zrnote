# ZRNote — Setup Gratuito (100% Gratis)
> Guía paso a paso. Todo cuesta $0.

---

## CUENTAS A CREAR (todas gratis)

| # | Servicio | URL | Para qué | Tiempo |
|---|---|---|---|---|
| 1 | Supabase | supabase.com | Base de datos + auth + storage + Edge Functions | 5 min |
| 2 | Groq | console.groq.com | Transcripción (Whisper) + IA (Llama 3) | 3 min |
| 3 | Resend | resend.com | Enviar correos | 2 min |
| 4 | Vercel | vercel.com | Hostear la app | 2 min |

**TOTAL: ~12 minutos de setup**

---

## PASO 1: CREAR CUENTA EN GROQ (3 min)

1. Ir a **console.groq.com**
2. Click "Sign Up" (puedes usar Google)
3. Ir a "API Keys"
4. Click "Create API Key"
5. Copiar la key → guardarla

**Límites gratis:**
- 30 requests/minuto
- 14,400 requests/día
- Modelos: Whisper (transcripción) + Llama 3 (IA)
- **Suficiente para ~50 reuniones/día**

---

## PASO 2: CREAR CUENTA EN RESEND (2 min)

1. Ir a **resend.com**
2. Click "Get Started" (puedes usar Google)
3. Ir a "API Keys"
4. Click "Create API Key"
5. Copiar la key → guardarla

**Límites gratis:**
- 3,000 correos/mes
- 1 dominio verificado
- **Suficiente para ~100 reuniones/mes**

---

## PASO 3: CONFIGURAR SUPABASE (5 min)

### 3.1 Crear proyecto
1. Ir a **supabase.com**
2. Click "New Project"
3. Nombre: `zrnote`
4. Contraseña: (guardarla)
5. Región: la más cercana
6. Esperar ~2 min a que se cree

### 3.2 Ejecutar el schema SQL
1. Ir a "SQL Editor" en el panel
2. Copiar TODO el contenido de `supabase/migrations/001_initial.sql`
3. Pegar y click "Run"

### 3.3 Crear Storage Bucket
1. Ir a "Storage"
2. Click "New Bucket"
3. Nombre: `meeting-audio`
4. Marcar como "Public"
5. Click "Create Bucket"

### 3.4 Crear Edge Function
1. Ir a "Edge Functions"
2. Click "New Function"
3. Nombre: `process-meeting`
4. Copiar el contenido de `supabase/functions/process-meeting/index.ts`
5. Pegar y guardar

### 3.5 Agregar variables de entorno a la Edge Function
En la Edge Function, ir a "Secrets" y agregar:
```
GROQ_API_KEY=tu-key-de-groq
RESEND_API_KEY=tu-key-de-resend
APP_URL=https://tu-app.vercel.app
```

### 3.6 Copiar las credenciales
Ir a "Settings" → "API" y copiar:
- `Project URL` (SUPABASE_URL)
- `anon public` key (SUPABASE_ANON_KEY)
- `service_role` key (SUPABASE_SERVICE_KEY)

---

## PASO 4: CONFIGURAR VERCEL (2 min)

### 4.1 Conectar el código
1. Ir a **vercel.com**
2. Click "Add New..." → "Project"
3. Conectar tu repositorio de GitHub (o subir los archivos)
4. Click "Deploy"

### 4.2 Agregar variables de entorno
En el proyecto de Vercel → "Settings" → "Environment Variables":

```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_KEY=tu-service-key
GROQ_API_KEY=tu-groq-key
RESEND_API_KEY=tu-resend-key
NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
```

### 4.3 Deploy
Click "Deploy" y esperar ~2 min

---

## PASO 5: PROBAR EL SISTEMA

1. Abrir tu app en Vercel
2. Crear una cuenta (signup)
3. Crear una reunión
4. Presionar "GRABAR"
5. Hablar 30 segundos
6. Presionar "DETENER"
7. Esperar ~1 minuto
8. ¡Recibir correo con la minuta!

---

## CÓMO FUNCIONA (resumen)

```
Tú presionas GRABAR
    │
    ▼
Navegador graba audio
    │
    ▼
Audio se sube a Supabase Storage (gratis)
    │
    ▼
Supabase Edge Function se activa (gratis)
    │
    ├──▶ Groq Whisper transcribe (gratis)
    │
    ├──▶ Groq Llama 3 genera minuta (gratis)
    │
    ├──▶ Guarda en base de datos (gratis)
    │
    └──▶ Resend envía correos (gratis)
         │
         ▼
    ¡Recibes el correo!
```

**Costo total: $0**

---

## ARCHIVOS DEL PROYECTO

```
ZR Note/
├── apps/web/                    # La app (Next.js)
│   └── src/
│       ├── app/                 # Páginas
│       ├── components/          # Botones, vistas
│       └── lib/                 # Helpers (groq.ts, llm.ts, etc.)
├── supabase/
│   ├── migrations/              # Schema SQL
│   └── functions/               # Edge Functions
│       └── process-meeting/     # El worker que procesa todo
└── packages/types/              # Tipos compartidos
```

---

## TROUBLESHOOTING

**Si la transcripción falla:**
- Verificar que GROQ_API_KEY esté correcta
- Groq tiene límite de 30 req/min, esperar 1 min

**Si el correo no llega:**
- Verificar que RESEND_API_KEY esté correcta
- En Resend, verificar que el dominio esté verificado (o usar el sandbox)

**Si la Edge Function no se activa:**
- Verificar que esté deployed en Supabase
- Revisar los logs en "Edge Functions" → "Logs"

---

*ZRNote 100% Gratis · ZR Mecacademy · Junio 2026*
