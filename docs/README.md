# Documentación de ZRNote

| Sección | Para qué | Empieza por |
|---|---|---|
| [`architecture/`](architecture) | Cómo está construido | [overview](architecture/overview.md) · [estado del proyecto](architecture/project-context.md) |
| [`security/`](security) | Qué se protege y cómo | [modelo de seguridad](security/security-model.md) · [auditoría 2026-09-20](security/audit-2026-09-20.md) |
| [`runbooks/`](runbooks/README.md) | Operar, diagnosticar, retroceder | [índice](runbooks/README.md) |
| [`adr/`](adr/README.md) | Por qué se decidió así | [índice](adr/README.md) |
| [`product/`](product) | Hacia dónde va | [roadmap](product/roadmap-status.md) · [backlog](product/backlog.md) |
| [`setup/`](setup) | Poner ZRNote en marcha | [capa gratuita](setup/free-tier-setup.md) · [sin código](setup/nocode-setup.md) |
| [`archive/`](archive) | Histórico, sin mantener | — |

## Dónde documentar cada cosa

- **Investigaste algo más de 10 minutos** → runbook.
- **Elegiste entre alternativas con consecuencias** → ADR.
- **Cambió cómo encajan las piezas** → `architecture/overview.md`.
- **Nuevo control o riesgo de seguridad** → `security/security-model.md`; si vino de una auditoría, un `audit-AAAA-MM-DD.md` nuevo.
- **Trabajo pendiente** → `product/backlog.md`.
- **Al terminar una sesión de trabajo** → actualizar `architecture/project-context.md`.
