-- ═══════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO DE CORREOS — ¿se están mandando de verdad?
--
-- Pégalo en el editor SQL del proyecto y dale a Run. SOLO LEE.
-- ═══════════════════════════════════════════════════════════════════════

-- Resumen de los últimos 30 días, por tipo y estado.
SELECT
  type                                                AS tipo,
  status                                               AS estado,
  count(*)                                             AS cuantos,
  max(sent_at)                                         AS ultimo_envio
FROM email_logs
WHERE sent_at > now() - interval '30 days'
GROUP BY type, status
ORDER BY type, status;

-- Si quieres ver los últimos 20 fallos con su motivo, ejecuta esto aparte:
--
-- SELECT sent_at, type, recipient_email, status, resend_id
-- FROM email_logs
-- WHERE status IN ('failed', 'pending')
-- ORDER BY sent_at DESC
-- LIMIT 20;
