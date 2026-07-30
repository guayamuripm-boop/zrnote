'use client';

import { useState } from 'react';
import { useTermsConsent } from '@/lib/hooks/useTermsConsent';
import TermsModal from './TermsModal';

/**
 * Shows the required documents once, in order, the first time someone uses the
 * dashboard (and again whenever the version changes).
 *
 * The previous version called the async `agreeToDocument()` without awaiting it
 * and immediately did `window.location.reload()`, so the acceptance frequently
 * never reached the server and the modal came straight back — an infinite loop
 * with no way out.
 */
export default function TermsGate() {
  const { loading, getRequiredUnagreed, agreeToDocument } = useTermsConsent();
  const [accepted, setAccepted] = useState<string[]>([]);

  if (loading) return null;

  const pending = getRequiredUnagreed().filter((d) => !accepted.includes(d));
  if (pending.length === 0) return null;

  const docType = pending[0];

  return (
    <TermsModal
      isOpen
      docType={docType}
      required
      onAccept={async () => {
        // TermsModal already recorded it server-side; keep the local cache in
        // sync so the next document can render without a round trip.
        await agreeToDocument(docType);
        setAccepted((prev) => [...prev, docType]);
      }}
      onReject={() => {}}
    />
  );
}
