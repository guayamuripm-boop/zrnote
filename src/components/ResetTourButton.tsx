'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ResetTourButton() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const match = Object.keys(localStorage).find((k) => k.startsWith('zrnote_onboarding_completed_'));
    if (match) setUserId(match.replace('zrnote_onboarding_completed_', ''));
  }, []);

  if (!userId) return null;

  return (
    <button
      onClick={() => {
        try { localStorage.removeItem(`zrnote_onboarding_completed_${userId}`); } catch {}
        router.push('/dashboard');
      }}
      className="block mx-auto text-sm text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition mt-2"
    >
      Repetir el tour de bienvenida
    </button>
  );
}
