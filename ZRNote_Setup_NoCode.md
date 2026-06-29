# ZRNote — Setup No-Code / Gratuito
> Guía paso a paso para configurar ZRNote sin programar. Marca: ZR Mecacademy.

---

## RECURSOS NECESARIOS (GRATIS)

| Herramienta | Para qué | URL |
|---|---|---|
| Google Workspace | Gmail + Drive + Docs + Sheets | workspace.google.com |
| Otter.ai | Grabación + transcripción | otter.ai |
| ChatGPT | Análisis de transcripción | chatgpt.com |
| Make.com | Automatización | make.com |

---

## COORDINACIONES ACTUALES

| # | Coordinación | Carpeta en Drive | Correo responsable |
|---|---|---|---|
| 1 | Tecnología | `Minutas/Coordinación Tecnología` | [pendiente] |
| 2 | Marketing | `Minutas/Coordinación Marketing` | [pendiente] |
| 3 | Control de Estudio | `Minutas/Coordinación Control de Estudio` | [pendiente] |
| 4 | Administración | `Minutas/Coordinación Administración` | [pendiente] |
| 5 | Director Ejecutivo | `Minutas/Dirección Ejecutiva` | [pendiente] |
| 6 | Técnico | `Minutas/Coordinación Técnica` | [pendiente] |

---

## PASO 1: CREAR ESTRUCTURA EN GOOGLE DRIVE (5 min)

1. Ir a drive.google.com
2. Crear carpeta llamada **ZRNote**
3. Dentro crear subcarpetas:
   - `Minutas`
   - `Plantillas`
   - `Base de Datos` (para el Sheet de participantes)
4. Dentro de `Minutas`, crear subcarpeta por cada coordinación:
   - `Coordinación Tecnología`
   - `Coordinación Marketing`
   - `Coordinación Control de Estudio`
   - `Coordinación Administración`
   - `Dirección Ejecutiva`
   - `Coordinación Técnica`

---

## PASO 2: CREAR BASE DE DATOS DE PARTICIPANTES (10 min)

### 2.1 Crear Google Sheet de participantes
1. En `ZRNote/Base de Datos`, crear un Google Sheet nuevo
2. Nombrarlo: **ZRNote — Participantes**
3. **Hoja 1 (Registro)** — encabezados en fila 1:
   - A: ID (número autoincremental)
   - B: Nombre completo
   - C: Email
   - D: Coordinación
   - E: Rol (Coordinador / Participante)
   - F: Activo (Sí / No)
   - G: Fecha registro
4. Congelar fila 1

### 2.2 Cargar participantes existentes
Agregar TODOS los correos corporativos que ya tienes:
- Coordinadores de cada área
- Miembros del equipo
- Director Ejecutivo
- Cualquier otro que deba recibir minutas

### 2.3 Agregar nuevos participantes
**Desde Make.com:**
- Crear un Google Form llamado "ZRNote — Registrar Participante"
- Campos: Nombre, Email, Coordinación (dropdown), Rol
- Conectar el Form con el Sheet para que agregue automáticamente

**O manualmente:**
- Agregar directamente en el Sheet cuando se necesite

---

## PASO 3: CREAR PLANTILLA DE MINUTA (10 min)

1. En `ZRNote/Plantillas`, crear un Google Doc nuevo
2. Nombrarlo: **PLANTILLA — Minuta ZRNote**
3. Copiar y pegar este contenido exacto:

```
ZR MECACADEMY — MINUTA OFICIAL

REUNIÓN:        [nombre]
FECHA:          [DD/MM/AAAA]
COORDINACIÓN:   [nombre coordinación]
HORA INICIO:    [HH:MM]
HORA FIN:       [HH:MM]
DURACIÓN:       [X minutos]
ASISTENTES:     [nombre1, nombre2, nombre3...]

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
Responsable | Tarea | Fecha límite | Prioridad
[pegar tabla aquí]

════════════════════════════════════════

6. PRÓXIMOS PASOS
[pegar aquí]

════════════════════════════════════════
```

---

## PASO 4: CREAR GOOGLE SHEET HISTORIAL (5 min)

1. En `ZRNote/`, crear un Google Sheet nuevo
2. Nombrarlo: **ZRNote — Historial de Reuniones**
3. **Hoja 1 (Historial)** — encabezados en fila 1:
   - A: ID
   - B: Fecha
   - C: Coordinación
   - D: Título
   - E: Asistentes
   - F: Duración
   - G: Link Minuta
   - H: # Action Items
   - I: Estado
   - J: Notas
4. Congelar fila 1
5. Crear **Hoja 2** llamada "Action Items Global" con encabezados:
   - A: Fecha reunión
   - B: Coordinación
   - C: Responsable
   - D: Tarea
   - E: Fecha límite
   - F: Prioridad
   - G: Estado
   - H: Link Minuta

---

## PASO 5: GUARDAR EL PROMPT (5 min)

1. En `ZRNote/Plantillas`, crear otro Google Doc
2. Nombrarlo: **PROMPT — ZRNote v1.0**
3. Copiar el prompt del archivo `ZRNote_Roadmap_Agente.md` sección 6 (PROMPT DE CLAUDE)
4. Guardar

---

## PASO 6: CREAR CUENTA OTTER.AI (5 min)

1. Ir a otter.ai
2. Crear cuenta con el Gmail de la academia
3. Configurar idioma: Settings → Language → Spanish
4. Descargar app en teléfono del coordinador

**Para reuniones presenciales:**
- Abrir app → botón REC → dejar teléfono en la mesa
- Al terminar: STOP → Export → Copy Text

**Para Google Meet:**
- Otter entra automáticamente si conectas Google Calendar
- O invitar: notetaker@otter.ai como participante

---

## PASO 7: CREAR CUENTA MAKE.COM Y ESCENARIO (20 min)

### 7.1 Crear cuenta
1. Ir a make.com
2. Crear cuenta con el Gmail de la academia
3. Conectar: Google Drive, Google Docs, Google Sheets, Gmail

### 7.2 Crear escenario
1. Click "Create a new scenario"
2. Nombre: "ZRNote — Procesar Minuta Nueva"

### 7.3 Agregar módulos (en orden):

**MÓDULO 1 — Google Drive: Watch Files**
- Carpeta: ZRNote/Minutas (y subcarpetas)
- Detectar: archivo nuevo
- Filtro: nombre NO contiene "PLANTILLA"
- Intervalo: cada 15 min

**MÓDULO 2 — Google Docs: Download a Document**
- Document ID: {{1.id}}
- Formato: Plain Text

**MÓDULO 3 — Google Sheets: Lookup Row (buscar coordinación)**
- Spreadsheet: ZRNote — Participantes
- Sheet: Registro
- Filtro: Coordinación contiene {{extraer coordinación del nombre del archivo}}

**MÓDULO 4 — Google Sheets: Add a Row (historial)**
- Spreadsheet: ZRNote — Historial de Reuniones
- Sheet: Hoja1
- Valores:
  - Fecha: {{formatDate(now; "DD/MM/YYYY")}}
  - Título: {{1.name}}
  - Link Minuta: {{1.webViewLink}}
  - Estado: Pendiente

**MÓDULO 5 — Gmail: Send Email (coordinador)**
- To: {{3.email}} (correo del coordinador de esa coordinación)
- Subject: [ZRNote] {{1.name}} — Resumen completo
- Body HTML: (ver abajo)

**MÓDULO 6 — Gmail: Send Email (participantes)**
- To: {{3.email}} (todos los participantes de esa coordinación)
- Subject: [ZRNote] {{1.name}} — Minuta disponible
- Body HTML: (ver abajo)

### 7.4 HTML para emails

**Correo coordinador:**
```html
<div style="font-family:Roboto,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#21284F;padding:20px;text-align:center;">
    <span style="color:#fff;font-family:Raleway;font-size:18px;font-weight:700;">ZR ZRNote</span>
  </div>
  <div style="padding:20px;background:#fff;">
    <h2 style="color:#21284F;font-family:Raleway;">{{1.name}}</h2>
    <p><strong>Todos los action items están en la minuta completa:</strong></p>
    <a href="{{1.webViewLink}}" style="display:inline-block;background:#1E4D96;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Ver minuta completa</a>
  </div>
  <div style="padding:15px;text-align:center;background:#f8f9fa;">
    <small style="color:#6590CB;">ZRNote · ZR Mecacademy</small>
  </div>
</div>
```

**Correo participantes:**
```html
<div style="font-family:Roboto,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#21284F;padding:20px;text-align:center;">
    <span style="color:#fff;font-family:Raleway;font-size:18px;font-weight:700;">ZR ZRNote</span>
  </div>
  <div style="padding:20px;background:#fff;">
    <h2 style="color:#21284F;font-family:Raleway;">Minuta: {{1.name}}</h2>
    <p>Tu minuta está lista. Revisa tus compromisos en el documento completo:</p>
    <a href="{{1.webViewLink}}" style="display:inline-block;background:#1E4D96;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Ver minuta completa</a>
  </div>
  <div style="padding:15px;text-align:center;background:#f8f9fa;">
    <small style="color:#6590CB;">ZRNote · ZR Mecacademy</small>
  </div>
</div>
```

---

## PASO 8: PROBAR EL FLUJO COMPLETO (10 min)

1. Grabar una reunión ficticia de 2-3 min con Otter
2. Copiar la transcripción
3. Ir a ChatGPT → pegar el PROMPT + la transcripción
4. Copiar la minuta generada
5. Ir a Google Drive → ZRNote/Minutas → tu coordinación
6. Hacer copia de la PLANTILLA → renombrar con la fecha
7. Pegar la minuta en las secciones correctas
8. Guardar
9. Esperar ~15 min a que Make detecte el archivo nuevo
10. Verificar que se creó la fila en el Sheet
11. Verificar que llegaron los correos

---

## FLUJO DIARIO DEL COORDINADOR

```
1. Antes de la reunión: abrir Otter → REC
2. Durante: dejar el teléfono grabando
3. Al terminar: STOP → copiar transcripción
4. Pegar en ChatGPT con el PROMPT → copiar minuta
5. Pegar en Google Doc (copia de plantilla)
6. ¡Listo! Make se encarga del resto automáticamente
```

---

## AGREGAR NUEVOS PARTICIPANTES

### Opción 1: Google Form (recomendada)
1. Crear Google Form "ZRNote — Registrar Participante"
2. Campos: Nombre, Email, Coordinación (dropdown), Rol
3. Conectar con el Sheet de Participantes
4. Compartir el form con los coordinadores
5. Cuando alguien llene el form, Make lo agrega automáticamente

### Opción 2: Agregar manualmente
1. Ir al Sheet "ZRNote — Participantes"
2. Agregar nueva fila con los datos
3. La próxima vez que Make procese una minuta, incluirá al nuevo participante

---

## LÍMITES GRATUITOS

| Herramienta | Límite | Equivalente |
|---|---|---|
| Otter.ai | 600 min/mes | ~10 reuniones de 1h |
| Make.com | 1,000 ops/mes | ~100 reuniones |
| Gmail | 500 correos/día | Suficiente |
| Google Drive | 15 GB | Miles de minutas |

---

## COLORES DE MARCA ZR MECADEMY

| Color | Hex | Uso |
|---|---|---|
| Navy | #21284F | Headers, texto principal |
| Azul | #1E4D96 | Botones, links, acentos |
| Azul medio | #3869B1 | Hover states |
| Azul claro | #6590CB | Texto secundario |
| Azul pálido | #98BAE3 | Bordes, backgrounds sutiles |
| Blanco | #FFFFFF | Fondos, texto en headers |

**Tipografías:**
- Principal: **Roboto** (cuerpo de texto)
- Secundaria: **Raleway** (títulos, headers)

---

*ZRNote No-Code · ZR Mecacademy · Junio 2026*
