# ZRNote — Roadmap Estado Actual
> **Fuente de verdad** — Actualizado 2026-10-05. Marcar ✅ lo completado, ⏳ en progreso, ⬜ pendiente.

---

## ✅ FASE 1 — MVP CORE + FEATURES (COMPLETADO 100%)

```
[✅] 1. Setup Next.js 14 + Supabase + Vercel
[✅] 2. Schema SQL (35 migraciones) + RLS multi-tenant
[✅] 3. Auth: login/signup Supabase Auth (email/password)
[✅] 4. CRUD meetings: crear, listar, ver, editar, borrar + participantes
[✅] 5. RecordButton PWA: grabación + segmentación 30min + upload + wake lock + media session + retry + pause/resume
[✅] 6. Pipeline por pasos (NO worker separado): /process?step=transcribe|analyze|vectorize|emails
[✅] 7. Transcripción: Groq Whisper (whisper-large-v3) batch 3 segmentos
[✅] 8. Generación minuta: Groq Llama-3.3-70b + prompt detallado español
[✅] 9. Vista minuta completa: resumen, temas, decisiones, proyectos, bloqueos, ideas, next steps, transcripción
[✅] 10. Speaker mapping: UI "Speaker 1" → nombres reales
[✅] 11. Action Items: CRUD, asignación UI, badges prioridad/estado, página "Mis Tareas"
[✅] 12. Emails: Nodemailer/Gmail SMTP, plantillas HTML, adjuntos ICS, retry, logs
[✅] 13. Pipeline por pasos + polling UI (1/4 → 2/4 → 3/4 → 4/4)
[✅] 14. Auto-recovery cron: Vercel Cron */5 * * * * reintenta stuck/failed
[✅] 15. Rate limiting: 10 req/min por user/meeting en /process
[✅] 16. Logs estructurados: logger.ts JSON en prod, colores en dev
[✅] 17. Tests: 361 tests Vitest en 36 archivos
[✅] 18. RGPD endpoints: GET /api/user/export, POST /api/user/delete
[✅] 19. Security headers: CSP, HSTS, X-Frame-Options, Permissions-Policy
[✅] 20. Retención datos cron: diario 3AM borra audio >30d, archiva >1a, limpia orphans
[✅] 21. Multi-tenant schema: organizations, org_members, RLS por org
[✅] 22. pgvector + RAG: migración 012, función search_meeting_chunks
[✅] 23. Embeddings Jina AI: gratis 1M tokens/mes, 1024 dims
[✅] 24. Vectorize step: vectorizeMeeting() + step vectorize en pipeline
[✅] 25. Agent API RAG: POST /api/agent/query - embedding → pgvector → Groq LLM + citas
[✅] 26. Chrome Extension MV3: getDisplayMedia(), panel flotante, popup, background
[✅] 27. Push Notifications: suscripción, envío vía web-push, badge en app
[✅] 28. Meeting tags: etiquetas personalizadas por reunión (migración 034)
[✅] 29. Onboarding tour: guía interactiva para nuevos usuarios
[✅] 30. TWA para Play Store: APK vía Bubblewrap, assetlinks.json configurado
[✅] 31. Web capabilities: Background Sync, Push, Badging, File Handling
[✅] 32. Offline transcription: modelo ONNX local (onnx-community/, dtype q8)
[✅] 33. Estilos de minuta: Ejecutiva, Clase/Educativa, Contenido
[✅] 34. Opciones largo de resumen: configurable por perfil (migración 031)
[✅] 35. Modo Estudio / Cuaderno Digital: fórmulas, Leitner 3 cajas, notas Feynman
[✅] 36. Modo Contenido: capítulos para podcasts/conferencias/videos (migración 035)
[✅] 37. Pendientes sin dueño: extracción mejorada de action items
[✅] 38. Resúmenes más directos (SUMMARY_DIRECTNESS)
[✅] 39. PDF export minuta (@react-pdf/renderer) + endpoint /api/meetings/[id]/export-pdf
[✅] 40. SEO landings + nombre "ZR Note"
[✅] 41. Subida de audio automática, invitados persistentes, compartir acta completa
```

---

## ⏳ FASE 2 — VIRTUAL + PULIDO (PARCIAL)

```
[✅] PDF export minuta (@react-pdf/renderer) → minute-pdf.tsx + API route
[✅] RAG búsqueda semántica (pgvector + Agent API) — funcional en producción
[✅] Push notifications durante procesamiento (web-push)
[⬜] Bot Recall.ai para Meet/Zoom/Teams automático (1 semana)
[⬜] Búsqueda full-text minutas (pg_trgm) — complementar RAG con búsqueda exacta (1 día)
[⬜] Exportar minuta a Markdown/JSON (1 día)
[⬜] Dashboard "Knowledge Base" por org: lista reuniones + búsqueda semántica (3 días)
```

---

## ⬜ FASE 3 — INTEGRACIONES (PENDIENTE)

```
[⬜] Google Calendar sync: crear evento follow-up al generar minuta (3 días)
[⬜] Notion API: crear página por reunión en workspace (1 semana)
[⬜] Linear/Trello: crear tarjetas por action item (1 semana)
[⬜] Slack: notificación al canal cuando minuta lista (3 días)
[⬜] Webhook genérico para integraciones custom (2 días)
```

---

## ⬜ FASE 4 — SAAS / ESCALABILIDAD (PENDIENTE)

```
[⬜] Multi-tenant SaaS completo: onboarding org → invitar equipo → primera reunión (2 semanas)
[⬜] Stripe: planes Free/Pro/Team + billing portal (1 semana)
[⬜] Landing page pública + pricing + docs (1 semana)
[⬜] Admin panel global: métricas, usuarios, organizaciones (1 semana)
[⬜] Audit logs completos (GDPR compliance) (3 días)
```

---

## 🔧 DEUDA TECNICA / MEJORAS INTERNAS

```
[⏳] Migrar rate limiting a Upstash Redis — función atómica existe (migración 032), falta Redis persistente
[⬜] processing.ts ~1700 líneas — dividir en módulos (transcription, analysis, vectorization)
[⬜] Añadir índices pgvector HNSW optimizados (m=16, ef=64)
[⬜] Implementar chunking semántico mejorado (overlap + slide window)
[⬜] Añadir reranking en Agent API (cross-encoder)
[⬜] Implementar streaming en Agent API (SSE)
[⬜] Optimizar bundle size Chrome Extension (code splitting)
[⬜] Añadir E2E tests con Playwright (critical paths)
[⬜] Documentar API pública (OpenAPI/Swagger)
[⬜] Rotar extension.pem (credencial comprometida en historial git)
```

---

## 📊 ESTADO DEPLOY ACTUAL

| Componente | Estado | URL/Detalle |
|------------|--------|-------------|
| **App Web** | ✅ Deployed | https://zrnote.vercel.app |
| **Supabase** | ✅ Connected | Project: zrnote |
| **Vercel Crons** | ✅ Registered | retry-stuck (5min), retention (3AM) |
| **Chrome Extension** | ⏳ Local/dev only | No publicada en Chrome Web Store |
| **TWA / APK** | ⏳ Built | Bubblewrap + assetlinks.json, pendiente Play Store |
| **Environment Vars** | ✅ Configured | Vercel Dashboard |
| **Migraciones** | ⏳ 34/35 applied | 035_content_mode.sql pendiente |
| **Version** | v1.27.0 | 361 tests, 36 archivos de test |

---

## 🎯 PROXIMA ACCION RECOMENDADA

**Prioridad 1**: Aplicar migración pendiente y estabilizar
- [ ] Aplicar migración 035_content_mode.sql en producción
- [ ] Rotar extension.pem (secreto expuesto en historial git)
- [ ] Validar modo Contenido end-to-end: grabar podcast → ver capítulos generados
- [ ] Validar modo Estudio: crear notas Feynman + ciclo Leitner

**Prioridad 2**: Publicar distribuciones
- [ ] Subir Chrome Extension a Chrome Web Store (revisión ~3-5 días)
- [ ] Publicar APK en Play Store (cuenta de desarrollador requerida)
- [ ] Configurar dominio custom si aún no existe

**Prioridad 3**: Elegir siguiente feature
- Opción A: Knowledge Base Dashboard — explotar RAG ya existente, valor diferencial
- Opción B: Exportar Markdown/JSON — rápido (1 día), útil para integraciones
- Opción C: Búsqueda full-text pg_trgm — complementar RAG con búsqueda exacta
- Opción D: Refactorizar processing.ts (~1700 líneas) — reducir deuda antes de añadir features

---

*Actualizado: 2026-10-05 | ZRNote v1.27.0 — MVP + RAG + Extension + Modos Estudio/Contenido + PWA + Push*
