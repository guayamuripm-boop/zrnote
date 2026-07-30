'use client';

import { useCallback, useEffect, useState } from 'react';

export const LEGAL_VERSION = '2.0';
/** Documents everyone must accept before using the dashboard. */
export const REQUIRED_DOCS = ['terms_of_service', 'privacy_policy'] as const;

export type RequiredDoc = (typeof REQUIRED_DOCS)[number];

interface ConsentStatus {
  [docType: string]: { version: string; agreedAt: string };
}

export function useTermsConsent() {
  const [consents, setConsents] = useState<ConsentStatus>({});
  const [loading, setLoading] = useState(true);
  // If we cannot read the consent state (endpoint down, migration not applied),
  // we must NOT hold the whole dashboard hostage behind a modal that can never
  // be satisfied. Fail open and let the user work.
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/legal/consent')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => !cancelled && setConsents(data || {}))
      .catch(() => !cancelled && setUnavailable(true))
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, []);

  const agreeToDocument = useCallback(async (docType: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/legal/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, doc_version: LEGAL_VERSION }),
      });
      if (!res.ok) return false;
      setConsents((prev) => ({
        ...prev,
        [docType]: { version: LEGAL_VERSION, agreedAt: new Date().toISOString() },
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const hasAgreed = useCallback(
    (docType: string): boolean => consents[docType]?.version === LEGAL_VERSION,
    [consents],
  );

  const getRequiredUnagreed = useCallback((): RequiredDoc[] => {
    if (unavailable) return [];
    return REQUIRED_DOCS.filter((doc) => !hasAgreed(doc));
  }, [hasAgreed, unavailable]);

  return { consents, loading, unavailable, agreeToDocument, hasAgreed, getRequiredUnagreed };
}
