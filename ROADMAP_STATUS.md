# ZRNote — Roadmap Estado Actual
> **Fuente de verdad** — Actualizado 2026-07-13. Marcar ✅ lo completado, ⏳ en progreso, ⬜ pendiente.

---

## ✅ FASE 1 — MVP CORE (COMPLETADO 100%)

```
[✅] 1. Setup Next.js 14 + Supabase + Vercel
[✅] 2. Schema SQL (12 migraciones) + RLS multi-tenant
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
[✅] 17. Tests: 9 tests Vitest pasando (processing.test.ts)
[✅] 18. RGPD endpoints: GET /api/user/export, POST /api/user/delete
[✅] 18. Security headers: CSP, HSTS, X-Frame-Options, Permissions-Policy
[✅] 19. Retención datos cron: diario 3AM borra audio >30d, archiva >1a, limpia orphans
[✅] 20. Multi-tenant schema: organizations, org_members, RLS por org
[✅] 21. pgvector + RAG: migración 012, función search_meeting_chunks
[✅] 22. Embeddings Jina AI: gratis 1M tokens/mes, 1024 dims
[✅] 23. Vectorize step: vectorizeMeeting() + step vectorize en pipeline
[✅] 24. Agent API RAG: POST /api/agent/query - embedding → pgvector → Groq LLM + citas
[✅] 25. Chrome Extension MV3: getDisplayMedia(), panel flotante, popup, background
```

---

## ⏳ FASE 2 — VIRTUAL + PULIDO (PENDIENTE)

```
[⬜] Bot Recall.ai para Meet/Zoom/Teams automático (1 semana)
[⬜] PDF export minuta (@react-pdf/renderer) (2 días)
[⬜] Notificaciones realtime (Supabase Realtime) durante procesamiento (3 días)
[⬜] Búsqueda full-text minutas (pg_trgm) (1 día)
[⬜] Exportar minuta a Markdown/JSON (1 día)
[⬜] Dashboard "Knowledge Base" por org: lista reuniones + búsqueda semántica (3 días)
```

---

## ⏳ FASE 3 — INTEGRACIONES (PENDIENTE)

```
[⬜] Google Calendar sync: crear evento follow-up al generar minuta (3 días)
[⬜] Notion API: crear página por reunión en workspace (1 semana)
[⬜] Linear/Trello: crear tarjetas por action item (1 semana)
[⬜] Slack: notificación al canal cuando minuta lista (3 días)
[⬜] Webhook genérico para integraciones custom (2 días)
```

---

## ⏳ FASE 4 — SAAS / ESCALABILIDAD (PENDIENTE)

```
[⬜] Multi-tenant SaaS completo: onboarding org → invitar equipo → primera reunión (2 semanas)
[⬜] Stripe: planes Free/Pro/Team + billing portal (1 semana)
[⬜] Landing page pública + pricing + docs (1 semana)
[⬜] Admin panel global: métricas, usuarios, organizaciones (1 semana)
[⬜] Audit logs completos (GDPR compliance) (3 días)
```

---

## 🔧 DEUDA TÉCNICA / MEJORAS INTERNAS

```
[⬜] Migrar rate limiting a Upstash Redis (persistente multi-instancia)
[⬜] Añadir índices pgvector HNSW optimizados (m=16, ef=64)
[⬜] Implementar chunking semántico mejorado (overlap + slide window)
[⬜] Añadir reranking en Agent API (cross-encoder)
[⬜] Implementar streaming en Agent API (SSE)
[⬜] Optimizar bundle size Chrome Extension (code splitting)
[⬜] Añadir E2E tests con Playwright (critical paths)
[⬜] Documentar API pública (OpenAPI/Swagger)
```

---

## 📊 ESTADO DEPLOY ACTUAL

| Componente | Estado | URL/Detalle |
|------------|--------|-------------|
| **App Web** | ✅ Deployed | https://zrnote.vercel.app |
| **Supabase** | ✅ Connected | Project: zrnote |
| **Vercel Crons** | ✅ Registered | retry-stuck (5min), retention (3AM) |
| **Chrome Extension** | ✅ Local ready | C:\Dev\ZR Note\extension |
| **Environment Vars** | ✅ Configured | Vercel Dashboard |
| **Migraciones** | ✅ 12/12 applied | Incluye pgvector (012) |

---

## 🎯 PRÓXIMA ACCIÓN RECOMENDADA

**Prioridad 1**: Validar en producción end-to-end
- [ ] Login → Nueva reunión → Grabar 30s en Meet → Ver minuta completa
- [ ] Verificar emails llegan con .ics adjunto
- [ ] Probar Agent API: `curl -X POST /api/agent/query -d '{"query":"resumen última reunión","orgId":"..."}'`
- [ ] Probar RGPD: Export + Delete account

**Prioridad 2**: Elegir siguiente feature
- Opción A: Recall.ai bot (automatizar Meet/Zoom) → Mayor impacto UX
- Opción B: PDF Export → Requerimiento común enterprise
- Opción C: Knowledge Base Dashboard → Valor diferencial RAG

---

*Actualizado: 2026-07-13 | ZRNote v1.0 MVP + RAG + Extension*