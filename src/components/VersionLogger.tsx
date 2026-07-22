'use client';

import { useEffect } from 'react';

export function VersionLogger({ version, commitSha }: { version: string; commitSha: string }) {
  useEffect(() => {
    console.log(
      `%c${version}`,
      'color: #3b82f6; font-size: 14px; font-weight: bold; border-radius: 4px;'
    );
    console.log(`%cCommit: ${commitSha}`, 'color: #64748b; font-size: 11px;');
  }, [version, commitSha]);

  return null;
}
