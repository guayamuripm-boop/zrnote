import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ConsentStatus {
  [key: string]: {
    version: string;
    agreedAt: string;
  };
}

export function useTermsConsent() {
  const [consents, setConsents] = useState<ConsentStatus>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch user's consent status
  useEffect(() => {
    const fetchConsents = async () => {
      try {
        const res = await fetch('/api/legal/consent');
        if (res.ok) {
          const data = await res.json();
          setConsents(data);
        }
      } catch (err) {
        console.error('Error fetching consents:', err);
        setError('Error al cargar estado de consentimiento');
      } finally {
        setLoading(false);
      }
    };

    fetchConsents();
  }, []);

  // Record consent for a document
  const agreeToDocument = async (
    docType: 'terms_of_service' | 'privacy_policy' | 'cookie_policy'
  ) => {
    try {
      const res = await fetch('/api/legal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, doc_version: '1.0' }),
      });

      if (!res.ok) throw new Error('Failed to record consent');

      setConsents((prev) => ({
        ...prev,
        [docType]: {
          version: '1.0',
          agreedAt: new Date().toISOString(),
        },
      }));

      return true;
    } catch (err) {
      console.error('Error recording consent:', err);
      setError('Error al guardar consentimiento');
      return false;
    }
  };

  // Check if user has agreed to a specific document
  const hasAgreed = (docType: string, requiredVersion = '1.0'): boolean => {
    const consent = consents[docType];
    return consent && consent.version === requiredVersion;
  };

  // Get all required documents the user hasn't agreed to
  const getRequiredUnagreed = (): string[] => {
    const required = ['terms_of_service', 'privacy_policy'];
    return required.filter((doc) => !hasAgreed(doc));
  };

  return {
    consents,
    loading,
    error,
    agreeToDocument,
    hasAgreed,
    getRequiredUnagreed,
  };
}
