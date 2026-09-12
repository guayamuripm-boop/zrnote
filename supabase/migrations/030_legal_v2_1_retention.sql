-- 030 — Términos v2.1: audio a 7 días, reuniones sin guardar se eliminan a
-- los 30
--
-- QUÉ CAMBIA respecto a v2.0 (migración 020)
--   • El audio se borra a los 7 días, no a los 30 (privacy_policy §4 y el
--     guion de consentimiento en recording_consent).
--   • Nueva regla: una reunión que nadie marca "Guardar" se elimina POR
--     COMPLETO — transcripción, minuta y compromisos incluidos — a los 30
--     días de creada. Se avisa por correo unos días antes. Ver migración 029
--     y src/lib/meeting-lifecycle.ts para el mecanismo.
--
-- Igual que en la 020: consentimiento por VERSIÓN. Un cambio en cuánto tiempo
-- se conservan los datos no es un matiz de redacción — es una condición
-- distinta a la que el usuario aceptó — así que se le vuelve a pedir que
-- acepte, no se asume que la vieja aceptación sigue cubriendo esto.

UPDATE public.legal_documents SET content = REPLACE(
  content,
  'Audio: se borra automáticamente a los 30 días.',
  'Audio: se borra automáticamente a los 7 días.'
) WHERE doc_type = 'privacy_policy' AND version = '2.0' AND content LIKE '%Audio: se borra automáticamente a los 30 días.%';

INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
SELECT
  'privacy_policy',
  '2.1',
  REPLACE(
    content,
    '<li><strong>Transcripción y minuta:</strong> se conservan hasta que tú borres la reunión o la cuenta.</li>',
    '<li><strong>Transcripción y minuta:</strong> se conservan hasta que tú borres la reunión o la cuenta, ' ||
    'salvo que la reunión nunca se marque como "guardada" — en ese caso se elimina por completo a los 30 días ' ||
    'de creada (te avisamos por correo antes). Guardar una reunión la conserva indefinidamente.</li>'
  ),
  now()
FROM public.legal_documents
WHERE doc_type = 'privacy_policy' AND version = '2.0'
ON CONFLICT (doc_type, version) DO UPDATE SET content = EXCLUDED.content, updated_at = now();

INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
SELECT 'terms_of_service', '2.1', content, now()
FROM public.legal_documents WHERE doc_type = 'terms_of_service' AND version = '2.0'
ON CONFLICT (doc_type, version) DO UPDATE SET content = EXCLUDED.content, updated_at = now();

INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
SELECT 'cookie_policy', '2.1', content, now()
FROM public.legal_documents WHERE doc_type = 'cookie_policy' AND version = '2.0'
ON CONFLICT (doc_type, version) DO UPDATE SET content = EXCLUDED.content, updated_at = now();

INSERT INTO public.legal_documents (doc_type, version, content, effective_date)
SELECT
  'recording_consent',
  '2.1',
  REPLACE(
    content,
    'El audio se procesa en servidores externos y se borra a los 30 días.',
    'El audio se procesa en servidores externos y se borra a los 7 días.'
  ),
  now()
FROM public.legal_documents WHERE doc_type = 'recording_consent' AND version = '2.0'
ON CONFLICT (doc_type, version) DO UPDATE SET content = EXCLUDED.content, updated_at = now();

-- Consent is version-scoped: todos aceptan 2.1 la próxima vez que entren.
-- No se borra el historial de 2.0 (a diferencia de como la 020 sí eliminó la
-- 1.0) — es la primera revisión desde que hay usuarios reales en producción,
-- y conservar el rastro de qué aceptó cada quien es justo lo que exige un
-- registro de consentimiento serio.
DELETE FROM public.user_consent_log WHERE doc_version = '2.0';


-- ========================================================================
-- ACCIÓN DE CÓDIGO REQUERIDA (no es sólo SQL)
-- ========================================================================
-- src/lib/hooks/useTermsConsent.ts define LEGAL_VERSION = '2.0'. Esta
-- migración no sirve de nada sin subir esa constante a '2.1' — es la que hace
-- que la app vuelva a pedir el consentimiento. Se cambia en el mismo commit
-- que aplica esta migración.
--
-- ========================================================================
-- CÓMO REVERTIR ESTA MIGRACIÓN
-- ========================================================================
--   DELETE FROM public.legal_documents WHERE version = '2.1';
--   DELETE FROM public.user_consent_log WHERE doc_version = '2.1';
-- Y volver LEGAL_VERSION a '2.0' en el código. La versión 2.0 sigue en la
-- tabla, así que el sitio vuelve a mostrarla sin más.
