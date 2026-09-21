# ZRNote — Roadmap No-Code / Gratuito v1.0
> Versión sin código. Herramientas visuales + automatización. Setup en 1-2 días.
> Leer completo antes de configurar cualquier herramienta.

---

## 0. CONTEXTO DEL PRODUCTO

**Qué es:** Sistema que graba reuniones → transcribe → genera minuta con IA → envía correos personalizados por participante con sus action items. Todo gratis, sin programar.

**Org:** Academia ZR (uso interno)
**Idioma:** Español + términos técnicos en inglés
**Reuniones:** presenciales y virtuales, hasta 2h en versión gratuita
**Usuarios:** coordinadores (operan el sistema), participantes (reciben correos por email)

**Output por reunión:**
1. Google Doc con minuta estructurada (resumen + decisiones + cambios + action items)
2. Correo personalizado a cada participante → solo sus tareas + resumen
3. Correo al coordinador → todos los action items de todos
4. Fila en Google Sheet historial → registro permanente

---

## 1. STACK DE HERRAMIENTAS (todo gratuito)

| # | Herramienta | Rol | URL | Límite free |
|---|---|---|---|---|
| 1 | Otter.ai | Grabación + transcripción + diarización | otter.ai | 600 min/mes |
| 2 | ChatGPT o Claude.ai | Análisis de transcripción → genera minuta JSON/texto | chatgpt.com / claude.ai | Sin límite práctico |
| 3 | Google Docs | Almacén de minutas + plantilla oficial | drive.google.com | 15 GB |
| 4 | Google Sheets | Historial de reuniones + tracker action items | drive.google.com | Ilimitado |
| 5 | Make.com | Automatización: Doc nuevo → extrae datos → envía emails | make.com | 1,000 ops/mes |
| 6 | Gmail | Envío de correos personalizados | gmail.com | 500/día |

**Cuentas a crear (en este orden):**
```
1. Google Workspace (Gmail + Drive) — si no existe ya
2. Otter.ai — con el Gmail de la academia
3. ChatGPT free — con el Gmail de la academia
4. Make.com — con el Gmail de la academia
```

---

## 2. ESTRUCTURA EN GOOGLE DRIVE

Crear exactamente esta estructura de carpetas antes de cualquier otra cosa:

```
📁 ZRNote (carpeta raíz, compartida con coordinadores)
├── 📁 Minutas
│   ├── 📁 Coordinación Académica
│   ├── 📁 Coordinación Administrativa
│   └── 📁 [agregar una carpeta por cada coordinación]
├── 📁 Plantillas
│   └── 📄 PLANTILLA — Minuta ZRNote        ← ver sección 5
└── 📊 ZRNote — Historial de Reuniones      ← ver sección 6
```

**Permisos:**
- Carpeta raíz ZRNote → compartir con todos los coordinadores (Editor)
- Participantes sin cuenta → solo reciben el PDF por correo, no acceden al Drive

---

## 3. FLUJO COMPLETO (de principio a fin)

```
PASO 1 — Coordinador abre Otter.ai en móvil o web
         Presiona REC antes de que empiece la reunión
         [1 clic — manual]

PASO 2 — Otter graba + transcribe en tiempo real con diarización
         [automático durante toda la reunión]

PASO 3 — Al terminar: coordinador presiona STOP en Otter
         [1 clic — manual]

PASO 4 — Coordinador abre otter.ai → copia la transcripción completa
         Va a chatgpt.com o claude.ai
         Pega el PROMPT DE ZRNOTE (sección 4) + la transcripción
         [~2 min — manual]

PASO 5 — IA genera la minuta estructurada
         [automático, ~30 segundos]

PASO 6 — Coordinador copia la minuta generada
         Abre Google Drive → carpeta de su coordinación
         Hace copia de PLANTILLA — Minuta ZRNote
         Renombra: "YYYY-MM-DD — [Título reunión]"
         Pega el contenido de la IA en las secciones correctas
         Revisa y ajusta si algo no quedó bien (~3 min)
         [~5 min — manual]

PASO 7 — Make.com detecta el nuevo Doc en la carpeta
         Extrae action items y participantes
         Envía correo personalizado a cada persona
         Envía resumen al coordinador
         Agrega fila al Google Sheet historial
         [automático, ~2 min después de guardar el Doc]

TOTAL INTERVENCIÓN HUMANA: ~8-10 min por reunión
```

---

## 4. PROMPT OFICIAL DE ZRNOTE

Este prompt va guardado en: Google Doc → Plantillas → "PROMPT — ZRNote v1.0"
El coordinador lo copia y pega en ChatGPT/Claude antes de pegar la transcripción.

```
Eres ZRNote, sistema de minutas de la Academia ZR.
Analiza la siguiente transcripción de reunión y genera una minuta estructurada.

Responde EXACTAMENTE con este formato, sin agregar texto fuera de él:

═══ MINUTA ZRNOTE ═══

REUNIÓN: [detectar del contexto o escribir "Sin título"]
FECHA: [detectar del contexto o escribir fecha de hoy]
COORDINACIÓN: [detectar del contexto]
DURACIÓN APROX.: [calcular en minutos]
ASISTENTES: [listar todos los hablantes detectados]

---

1. RESUMEN EJECUTIVO
[3 a 5 oraciones con lo más importante de la reunión]

---

2. TEMAS TRATADOS
- [tema 1]
- [tema 2]
[continuar según corresponda]

---

3. DECISIONES Y ACUERDOS
- [decisión 1 — redacción afirmativa: "Se acuerda...", "Se aprueba..."]
- [decisión 2]
[Si no hay decisiones claras, escribir: "No se registraron decisiones formales."]

---

4. CAMBIOS ACORDADOS
- [cambio 1 — especificar qué cambia y respecto a qué]
[Si no hay cambios, escribir: "Sin cambios acordados en esta reunión."]

---

5. ACTION ITEMS
| Responsable | Tarea | Fecha límite | Prioridad |
|---|---|---|---|
| [nombre] | [descripción específica] | [DD/MM/AAAA o "Sin fecha"] | [Alta/Media/Baja] |
[una fila por cada compromiso real identificado]
[Si no hay action items, escribir: "Sin compromisos asignados."]

---

6. PRÓXIMOS PASOS
- [tema pendiente para próxima reunión]
- [fecha tentativa próxima reunión si se mencionó]

═══════════════════════

REGLAS IMPORTANTES:
- Usa el nombre real del hablante si se menciona en la transcripción
- Si no hay nombre, usa: Speaker 1, Speaker 2, etc.
- Solo incluye action items que sean compromisos reales y específicos
- No inventes información que no esté en la transcripción
- Responde SOLO con la minuta. Sin explicaciones ni comentarios.

TRANSCRIPCIÓN:
[PEGAR AQUÍ EL TEXTO COPIADO DE OTTER]
```

---

## 5. PLANTILLA GOOGLE DOC — ESTRUCTURA EXACTA

Crear este Doc en: ZRNote/Plantillas/PLANTILLA — Minuta ZRNote
Cada reunión = File > Make a copy → mover a carpeta de coordinación → renombrar.

```
[ENCABEZADO]
Logo ZR (opcional) | ZRNote — Minuta Oficial

REUNIÓN:        [nombre]
FECHA:          [DD/MM/AAAA]
COORDINACIÓN:   [nombre coordinación]
HORA INICIO:    [HH:MM]
HORA FIN:       [HH:MM]
DURACIÓN:       [X minutos]
ASISTENTES:     [nombre1, nombre2, nombre3...]
AUSENTES:       [nombre o "Ninguno"]
GRABADA:        Sí / No

════════════════════════════════════════

1. RESUMEN EJECUTIVO
[pegar aquí]

════════════════════════════════════════

2. TEMAS TRATADOS
[pegar aquí]

════════════════════════════════════════

3. DECISIONES Y ACUERDOS
[pegar aquí]

════════════════════════════════════════

4. CAMBIOS ACORDADOS
[pegar aquí]

════════════════════════════════════════

5. ACTION ITEMS
[pegar tabla aquí]

════════════════════════════════════════

6. PRÓXIMOS PASOS
[pegar aquí]

════════════════════════════════════════

ANEXO — TRANSCRIPCIÓN COMPLETA
[pegar transcripción de Otter aquí — para referencia]
```

**Formato del nombre del archivo:** `YYYY-MM-DD — [Título reunión] — [Coordinación]`
Ejemplo: `2026-06-28 — Reunión semanal — Coord. Académica`

---

## 6. GOOGLE SHEET — HISTORIAL DE REUNIONES

Nombre del archivo: `ZRNote — Historial de Reuniones`
Ubicación: `ZRNote/` (carpeta raíz)

**Columnas exactas (fila 1 = encabezados, congelar):**
```
A: ID          → número autoincremental (1, 2, 3...)
B: Fecha       → DD/MM/AAAA
C: Coordinación → texto
D: Título      → texto
E: Asistentes  → nombres separados por coma
F: Duración    → en minutos
G: Link Minuta → URL del Google Doc
H: # Action Items → número total
I: Estado      → Pendiente / En seguimiento / Cerrada
J: Notas       → texto libre
```

**Segunda hoja: "Action Items Global"**
```
A: Fecha reunión
B: Coordinación
C: Responsable
D: Tarea
E: Fecha límite
F: Prioridad
G: Estado      → Pendiente / En progreso / Completado
H: Link Minuta
```

Esta segunda hoja es el tracker central de todas las tareas de la academia.

---

## 7. CONFIGURACIÓN DE MAKE.COM — ESCENARIO PASO A PASO

### 7.1 Crear el escenario

```
Nombre del escenario: "ZRNote — Procesar Minuta Nueva"
Scheduling: inmediato (triggered by watch)
```

### 7.2 Módulos en orden (arrastrar y conectar en Make)

```
MÓDULO 1 — Google Drive: Watch Files
  Carpeta a monitorear: ZRNote/Minutas (y subcarpetas)
  Qué detectar: archivo nuevo O archivo modificado
  Filtro: nombre NO contiene "PLANTILLA"
  Intervalo de chequeo: cada 15 minutos

MÓDULO 2 — Google Docs: Download a Document
  Document ID: {{1.id}}  ← viene del módulo 1
  Formato: Plain Text

MÓDULO 3 — Tools: Set Variable
  Variable name: "action_items_text"
  Variable value: extraer texto entre "5. ACTION ITEMS" y "6. PRÓXIMOS PASOS"
  Usar función: substring + indexOf

MÓDULO 4 — Tools: Set Variable
  Variable name: "resumen_text"
  Variable value: extraer texto entre "1. RESUMEN EJECUTIVO" y "2. TEMAS TRATADOS"

MÓDULO 5 — Google Sheets: Add a Row
  Spreadsheet: ZRNote — Historial de Reuniones
  Sheet: Hoja1 (Historial)
  Valores:
    Fecha: {{formatDate(now; "DD/MM/YYYY")}}
    Título: {{1.name}}
    Link Minuta: {{1.webViewLink}}
    Estado: Pendiente

MÓDULO 6 — Gmail: Send an Email (correo al coordinador)
  To: [correo fijo del coordinador — hardcodear por ahora]
  Subject: [ZRNote] {{1.name}} — Resumen completo
  Body (HTML):
    <h2>{{1.name}}</h2>
    <p><strong>Resumen:</strong><br>{{4.variable}}</p>
    <h3>Todos los Action Items</h3>
    <p>{{3.variable}}</p>
    <p><a href="{{1.webViewLink}}">Ver minuta completa</a></p>
    <hr><small>Generado por ZRNote · Academia ZR</small>

MÓDULO 7 — Gmail: Send an Email (correo general participantes)
  To: [lista de correos — ver nota abajo]
  Subject: [ZRNote] {{1.name}} — Minuta disponible
  Body (HTML):
    <h2>Minuta: {{1.name}}</h2>
    <p>{{4.variable}}</p>
    <p><strong>Tus compromisos están en la minuta completa:</strong></p>
    <p><a href="{{1.webViewLink}}">Ver minuta completa →</a></p>
    <hr><small>Generado por ZRNote · Academia ZR</small>
```

> **NOTA sobre correos individualizados:** Make free no permite iterar sobre participantes fácilmente sin más ops. Solución práctica para MVP: el coordinador agrega manualmente los correos de los asistentes en una celda del Sheet al crear la reunión. Make lee esa celda y envía un correo grupal (BCC). Para correos 100% individualizados por persona → necesita Make plan Core ($9/mes) o migrar a versión técnica.

### 7.3 Filtros y manejo de errores en Make

```
- Agregar filtro después de módulo 1: solo procesar si el archivo tiene más de 5 min de antigüedad
  (evita procesarlo mientras el coordinador aún está editando)
- En cada módulo: activar "Break" en error handling (no silenciar errores)
- Activar notificación por email cuando el escenario falle
```

---

## 8. CONFIGURACIÓN DE OTTER.AI

```
SETUP INICIAL:
1. Crear cuenta en otter.ai con Gmail de academia
2. Descargar app en teléfono del coordinador (iOS/Android)
3. Settings > Language → Spanish
4. Settings > Calendar → conectar Google Calendar (para que Otter entre solo a Meet)

PARA REUNIONES PRESENCIALES:
- Abrir app Otter → botón rojo REC → dejar teléfono en el centro de la mesa
- No cerrar la app (puede apagarse la pantalla, no cerrar)
- Al terminar: STOP → esperar que termine de procesar → Export > Copy Text

PARA REUNIONES VIRTUALES (Google Meet):
- En meet.google.com, Otter aparece como participante automáticamente si el calendario está conectado
- También se puede invitar manualmente: notetaker@otter.ai como participante de Meet
- La transcripción aparece en otter.ai cuando termina la llamada

PARA LLAMADAS (alternativa):
- Grabar llamada con el grabador nativo del teléfono
- Subir el audio a otter.ai → Import Audio/Video → procesar
```

---

## 9. FASES DE IMPLEMENTACIÓN

### FASE 0 — Setup (Día 1, ~3 horas)

```
[ ] Crear estructura de carpetas en Google Drive (sección 2)
[ ] Crear PLANTILLA — Minuta ZRNote (sección 5)
[ ] Crear Google Sheet historial con las dos hojas (sección 6)
[ ] Guardar PROMPT ZRNote en Google Doc en carpeta Plantillas (sección 4)
[ ] Crear cuenta Otter.ai + instalar app + conectar Calendar
[ ] Crear cuenta Make.com + conectar Google Drive + Gmail + Sheets
[ ] Construir escenario Make con los 7 módulos (sección 7)
[ ] Hacer prueba end-to-end con reunión ficticia de 10 min
```

### FASE 1 — Operación básica (Semana 1-4)

```
[ ] Primera reunión real con ZRNote
[ ] Capacitar a coordinadores en el flujo (sección 3)
[ ] Compartir PROMPT y plantilla con todos los coordinadores
[ ] Recolectar feedback: ¿la minuta es útil? ¿falta algo en el formato?
[ ] Ajustar el PROMPT según feedback real de las primeras reuniones
[ ] Construir hábito: ZRNote en TODAS las reuniones de coordinación
```

### FASE 2 — Optimización (Mes 2)

```
[ ] Revisar si los límites gratuitos son suficientes (ver sección 10)
[ ] Agregar segunda hoja "Action Items Global" al Sheet y hacer seguimiento semanal
[ ] Crear Google Form para que coordinadores registren la reunión antes de grabar
  (alimenta el Sheet automáticamente con: título, coordinación, asistentes, correos)
[ ] Conectar el Form con Make para que dispare el escenario con más contexto
[ ] Evaluar si se necesita Make Core ($9/mes) para correos individualizados
```

### FASE 3 — Escalar o migrar (Mes 3+)

```
[ ] Si > 20 reuniones/mes o > 2h promedio → considerar Otter Pro ($8.33/mes)
[ ] Si se necesitan correos por persona con sus action items específicos → Make Core o migrar
[ ] Si se quiere integrar con Notion/Trello/Calendar → Make con módulos premium o migrar
[ ] Si se quiere vender a otras organizaciones → migrar a versión técnica (roadmap técnico)
```

---

## 10. LÍMITES GRATUITOS Y SEÑALES DE ALERTA

| Herramienta | Límite | Señal de que lo alcanzaste | Costo para subir |
|---|---|---|---|
| Otter.ai | 600 min/mes | "Has alcanzado tu límite de transcripción" | Pro: $8.33/mes (6,000 min) |
| Make.com | 1,000 ops/mes | Escenario se pausa automáticamente | Core: $9/mes (10,000 ops) |
| Gmail | 500 correos/día | Correos se encolan al día siguiente | Google Workspace: $6/user/mes |
| ChatGPT free | Límite de mensajes GPT-4o | Cambia a GPT-4o mini | Plus: $20/mes |
| Google Drive | 15 GB | Alerta de almacenamiento | 100 GB: $2.99/mes |

**Costo máximo si se alcanzan TODOS los límites y se sube de plan:** ~$46 USD/mes — equivalente al MVP técnico.

---

## 11. DECISIONES YA TOMADAS (no re-discutir)

| Decisión | Elegido | Razón |
|---|---|---|
| Grabación | Otter.ai | Mejor soporte español + diarización en free |
| IA generación | ChatGPT / Claude.ai (web) | Sin costo de API, suficiente para volumen actual |
| Automatización | Make.com | Más potente que Zapier en plan free |
| Email | Gmail | Ya lo tienen, 500/día es suficiente |
| Docs | Google Docs | Colaborativo, sin fricción para el equipo |
| Tracker | Google Sheets | Simple, todos lo conocen, sin curva de aprendizaje |
| Formato minuta | Texto estructurado con separadores | Compatible con Make para extracción |

---

## 12. PREGUNTAS ABIERTAS (resolver antes de setup)

```
1. CORREOS DEL EQUIPO: ¿Existe lista de correos de todos los participantes?
   → Necesario para configurar los correos en Make (módulo 7)

2. COORDINACIONES: ¿Cuáles son todas las coordinaciones de la academia?
   → Para crear las subcarpetas correctas en Drive (sección 2)

3. GOOGLE WORKSPACE: ¿Todos tienen cuenta @zr o usan Gmail personal?
   → Afecta cómo compartir el Drive y enviar correos

4. REUNIONES SIMULTÁNEAS: ¿Pueden haber 2+ reuniones al mismo tiempo?
   → Si sí, se necesita una cuenta de Otter por coordinador

5. QUIÉN OPERA EL SISTEMA: ¿Un solo coordinador general o uno por coordinación?
   → Define cuántas cuentas de Otter y quién accede a Make
```

---

## 13. PARA EL AGENTE — CÓMO USAR ESTE ARCHIVO

```
ESTE NO ES UN PROYECTO DE CÓDIGO.
No generar código salvo que se pida explícitamente (ej: fórmulas de Sheets, HTML de emails).

INICIO DE SESIÓN:
  → Lee secciones 0 y 1 (contexto + stack)
  → Pregunta en qué fase está (sección 9) y qué tarea toca configurar

DURANTE CONFIGURACIÓN:
  → Sección 2 = estructura Drive (respetar exactamente)
  → Sección 4 = prompt oficial (no modificar sin avisar)
  → Sección 5 = plantilla Doc (estructura fija)
  → Sección 7 = módulos Make en orden exacto

CUANDO TENGAS DUDAS:
  → Sección 11 = decisiones tomadas (no re-preguntar)
  → Sección 12 = preguntas abiertas (sí preguntar)

TOKEN EFFICIENCY:
  → No re-leer secciones 0-1 en cada mensaje
  → Referenciar por número: "configurando sección 7 módulo 3"
  → Si algo no está en este archivo, preguntar antes de asumir
  → Las instrucciones de Make son paso a paso — seguirlas en orden, no saltarse módulos
```

---

*ZRNote Roadmap No-Code v1.0 · Academia ZR · Junio 2026*
