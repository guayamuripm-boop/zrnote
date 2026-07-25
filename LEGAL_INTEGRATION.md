# Integración de Términos y Condiciones Legales en ZRNote

**Fecha**: 25 de julio de 2026  
**Estado**: Implementado y listo para integración

---

## 📋 Resumen de Cambios

Se han creado nuevos componentes, endpoints y migraciones para implementar una completa solución de cumplimiento legal:

### ✅ Completado

1. **Migración 019**: `019_legal_terms_and_policies.sql`
   - Tabla `legal_documents` (almacena Términos, Privacidad, Cookies, etc.)
   - Tabla `user_consent_log` (registra consentimiento del usuario)
   - RLS policies para seguridad multi-tenant
   - Datos iniciales: Términos, Privacidad, Cookies (v1.0)

2. **API Endpoints**:
   - `GET /api/legal/documents` — Listar documentos o traer específico
   - `POST/GET /api/legal/consent` — Grabar/leer consentimiento del usuario

3. **Componentes React**:
   - `TermsModal.tsx` — Modal para mostrar términos con scroll guard
   - `LegalDisclaimer.tsx` — Banners de advertencia (recording, accuracy, etc.)
   - `useTermsConsent` hook — Manejo de estado de consentimiento

4. **Páginas Públicas**:
   - `/legal` — Hub de documentos
   - `/legal/terms`, `/legal/privacy`, `/legal/cookies` — Visualización individual

---

## 🚀 Cómo Integrar en tu Aplicación

### Paso 1: Ejecutar la Migración 019

```sql
-- En Supabase → SQL Editor → Copiar y Run:
-- Contenido de: supabase/migrations/019_legal_terms_and_policies.sql
```

**Verifica**:
```sql
SELECT * FROM public.legal_documents;
SELECT * FROM public.user_consent_log LIMIT 1;
```

---

### Paso 2: Mostrar Términos en Signup

**Archivo**: `src/app/(auth)/signup/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import TermsModal from '@/components/legal/TermsModal';

export default function SignupPage() {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);

  const handleSignup = async (formData: any) => {
    // Check before submitting
    if (!agreedToTerms || !agreedToPrivacy) {
      alert('Debes aceptar los términos y la política de privacidad');
      return;
    }
    
    // Continue with signup...
  };

  return (
    <div>
      {/* ... existing signup form ... */}

      {/* Legal checkboxes */}
      <div className="space-y-3 mt-6">
        <label className="flex gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            required
          />
          <span className="text-sm">
            Acepto los{' '}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="text-blue-600 hover:underline"
            >
              Términos de Servicio
            </button>
          </span>
        </label>

        <label className="flex gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToPrivacy}
            onChange={(e) => setAgreedToPrivacy(e.target.checked)}
            required
          />
          <span className="text-sm">
            Acepto la{' '}
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-blue-600 hover:underline"
            >
              Política de Privacidad
            </button>
          </span>
        </label>
      </div>

      {/* Modals */}
      <TermsModal
        isOpen={showTerms}
        docType="terms_of_service"
        onAccept={() => {
          setAgreedToTerms(true);
          setShowTerms(false);
        }}
        onReject={() => setShowTerms(false)}
        required={false}
      />

      <TermsModal
        isOpen={showPrivacy}
        docType="privacy_policy"
        onAccept={() => {
          setAgreedToPrivacy(true);
          setShowPrivacy(false);
        }}
        onReject={() => setShowPrivacy(false)}
        required={false}
      />
    </div>
  );
}
```

---

### Paso 3: Agregar Disclaimers en Grabación

**Archivo**: `src/app/dashboard/meetings/[id]/record/page.tsx`

```typescript
import LegalDisclaimer from '@/components/legal/LegalDisclaimer';

export default function RecordPage() {
  return (
    <div>
      {/* Recording consent disclaimer - REQUIRED */}
      <LegalDisclaimer
        type="recording_consent"
        dismissible={false}  // User MUST see this
      />

      {/* Data processing disclaimer */}
      <LegalDisclaimer
        type="data_processing"
        dismissible={true}
      />

      {/* ... rest of recording UI ... */}
    </div>
  );
}
```

---

### Paso 4: Agregar Link en Navbar

**Archivo**: `src/components/Navbar.tsx` (o equivalente)

```typescript
<footer className="mt-12 text-center text-sm text-gray-500">
  <Link href="/legal" className="hover:text-gray-700">
    Documentos Legales
  </Link>
</footer>
```

---

### Paso 5: Verificar Consentimiento en Dashboard

**Archivo**: `src/app/dashboard/layout.tsx`

```typescript
'use client';

import { useTermsConsent } from '@/lib/hooks/useTermsConsent';
import TermsModal from '@/components/legal/TermsModal';
import { useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { getRequiredUnagreed, agreeToDocument } = useTermsConsent();
  const [unagreedDocs, setUnagreedDocs] = useState<string[]>([]);

  useEffect(() => {
    setUnagreedDocs(getRequiredUnagreed());
  }, [getRequiredUnagreed]);

  return (
    <div>
      {/* Show modal for any unagreed required documents */}
      {unagreedDocs.length > 0 && (
        <TermsModal
          isOpen={true}
          docType={unagreedDocs[0] as any}
          onAccept={async () => {
            await agreeToDocument(unagreedDocs[0] as any);
            setUnagreedDocs(unagreedDocs.slice(1));
          }}
          onReject={() => {}} // Required, so no reject
          required={true}
        />
      )}

      {children}
    </div>
  );
}
```

---

## 📊 Tabla de Componentes

| Componente | Ubicación | Propósito |
|-----------|-----------|----------|
| `TermsModal` | `src/components/legal/TermsModal.tsx` | Modal para leer documentos con scroll guard |
| `LegalDisclaimer` | `src/components/legal/LegalDisclaimer.tsx` | Banners de advertencia contextuales |
| `useTermsConsent` | `src/lib/hooks/useTermsConsent.ts` | Hook para gestionar consentimiento |
| `/legal` | `src/app/legal/page.tsx` | Hub público de documentos |
| `/legal/[slug]` | `src/app/legal/[slug]/page.tsx` | Visualización individual |

---

## 🔍 Endpoints API

### GET /api/legal/documents
Traer documentos legales

**Query params**:
- `type` (opcional): `terms_of_service`, `privacy_policy`, `cookie_policy`

**Ejemplo**:
```bash
# Listar todos
curl https://zrnote.vercel.app/api/legal/documents

# Traer uno específico
curl https://zrnote.vercel.app/api/legal/documents?type=privacy_policy
```

**Response**:
```json
{
  "id": "uuid",
  "doc_type": "privacy_policy",
  "version": "1.0",
  "content": "<h1>Política de Privacidad...</h1>",
  "effective_date": "2026-07-25T00:00:00Z"
}
```

---

### POST /api/legal/consent
Grabar consentimiento del usuario

**Headers**: Requiere autenticación (cookie de sesión)

**Body**:
```json
{
  "doc_type": "terms_of_service",
  "doc_version": "1.0"
}
```

**Response**:
```json
{ "ok": true }
```

---

### GET /api/legal/consent
Obtener consentimiento del usuario actual

**Headers**: Requiere autenticación

**Response**:
```json
{
  "terms_of_service": {
    "version": "1.0",
    "agreedAt": "2026-07-25T10:30:00Z"
  },
  "privacy_policy": {
    "version": "1.0",
    "agreedAt": "2026-07-25T10:30:00Z"
  }
}
```

---

## ⚙️ Configuración de Disclaimers

**Tipos de Disclaimer disponibles**:

```typescript
type: 
  | 'recording_consent'     // ⚠️ Grabación sin consentimiento es delito
  | 'accuracy'              // ℹ️ LLM puede tener errores
  | 'data_processing'       // ℹ️ Audio procesado en Groq/Gemini
  | 'liability'             // ⚠️ Sin SLA, responsabilidad limitada
```

**Propiedades**:
- `type` (requerido): Tipo de disclaimer
- `dismissible` (opcional, default: true): Si el usuario puede cerrar

---

## 🔐 Privacidad y Seguridad

✅ **Implementado**:
- RLS (Row-Level Security) aísla consentimientos por usuario
- Logs de consentimiento incluyen IP y User-Agent (auditoría)
- Documentos públicos legibles (no requieren auth)
- Consentimiento requiere autenticación

⚠️ **Notas**:
- Los logs de consentimiento pueden usarse para auditoría GDPR
- Datos de IP/User-Agent se retienen indefinidamente (considerar política de limpieza)
- Cambios a documentos crean nuevas versiones (v1.0, v1.1, etc.)

---

## 📋 Checklist de Despliegue

- [ ] Ejecutar migración 019 en Supabase
- [ ] Actualizar `src/app/(auth)/signup/page.tsx` con checkboxes
- [ ] Agregar `LegalDisclaimer` en `/dashboard/meetings/[id]/record`
- [ ] Integrar `useTermsConsent` en dashboard layout
- [ ] Agregar link `/legal` en navbar/footer
- [ ] Personalizar documentos legales (valores actuales son plantillas genéricas)
- [ ] Revisar con legal/compliance (las plantillas no reemplazan asesor legal)
- [ ] Probar flujo completo: signup → acept términos → grabar → ver disclaimers

---

## 📝 Personalización de Documentos

Los documentos legales en la BD pueden editarse directamente sin redeploying:

```sql
UPDATE public.legal_documents
SET content = E'<h1>Tu contenido HTML aquí</h1>'
WHERE doc_type = 'terms_of_service'
AND version = '1.0';
```

**IMPORTANTE**: Las plantillas incluidas son genéricas. Debes:
1. Consultar con tu abogado local
2. Ajustar para tu jurisdicción
3. Incluir cláusulas específicas de tu negocio
4. Mantener actualizado si cambias proveedores (Groq, Gemini, etc.)

---

## 🚨 Advertencias Legales Críticas

⚠️ **GRABACIÓN**:
- El usuario es 100% responsable de obtener consentimiento
- Las leyes varían drásticamente por país/estado
- Grabar sin consentimiento puede ser delito penal

⚠️ **DATOS**:
- Audio se procesa en servidores de terceros (Groq, Gemini)
- Usuario es responsable de comunicarlo a participantes
- GDPR: "Consentimiento legítimo" para procesamiento de IA

⚠️ **LIMITACIÓN DE RESPONSABILIDAD**:
- Free tier sin garantías de disponibilidad
- LLM puede errar en transcripciones
- Usuario debe revisar minutas antes de compartir

---

## 📞 Contacto y Soporte

Para preguntas legales o de privacidad:
- Email: zriagnosis@gmail.com
- Documentación: `/legal`

---

**Versión**: 1.0  
**Actualizado**: 2026-07-25
