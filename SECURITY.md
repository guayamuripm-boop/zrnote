# Política de seguridad

## Reportar una vulnerabilidad

Escribe en privado a **`<CORREO-DE-SEGURIDAD>`** *(pendiente de definir: pon aquí el correo que quieras hacer público)* con el asunto `[ZRNote security]`. No abras un issue público ni publiques detalles hasta que esté corregido.

Incluye, si puedes: ruta o pantalla afectada, pasos para reproducirlo, impacto que crees que tiene y, si aplica, una prueba de concepto mínima.

**Qué puedes esperar:** acuse de recibo en 72 h, una valoración inicial de severidad en 7 días y aviso cuando esté corregido. Se reconoce el hallazgo salvo que prefieras anonimato.

## Alcance

En alcance: la aplicación web/PWA, sus rutas `/api/*`, la extensión de Chrome y las Edge Functions de Supabase.

Fuera de alcance: ataques de denegación de servicio volumétricos, ingeniería social contra usuarios, y hallazgos en servicios de terceros (Supabase, Vercel, Groq, Google) que no dependan de nuestra configuración.

## Versiones con soporte

Solo la última versión desplegada en producción recibe correcciones.

## Dónde está el detalle

- [Modelo de seguridad](docs/security/security-model.md) — controles vigentes y su justificación.
- [Auditoría 2026-09-20](docs/security/audit-2026-09-20.md) — hallazgos, correcciones y pendientes.
