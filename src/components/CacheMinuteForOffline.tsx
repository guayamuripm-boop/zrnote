'use client';

import { useEffect } from 'react';
import { cacheMinute } from '@/lib/minute-cache';

interface Props {
  userId: string;
  meetingId: string;
  title: string;
  coordination: string | null;
  createdAt: string;
  summary: string | null;
  topics: unknown;
  decisions: unknown;
  changes: unknown;
  nextSteps: unknown;
  actionItems: Array<{
    description: string;
    priority: string | null;
    status: string | null;
    due_date: string | null;
    assignee_name: string | null;
  }>;
  participants: { name: string; email: string }[];
}

const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);

/**
 * Invisible. Its only job is: whenever this meeting's minute is actually
 * looked at while online, save a copy for offline reading later — see
 * `src/lib/minute-cache.ts` for why this lives in IndexedDB rather than the
 * service worker.
 */
export default function CacheMinuteForOffline(props: Props) {
  useEffect(() => {
    void cacheMinute({
      userId: props.userId,
      meetingId: props.meetingId,
      title: props.title,
      coordination: props.coordination,
      createdAt: props.createdAt,
      summary: props.summary,
      topics: asStringArray(props.topics),
      decisions: asStringArray(props.decisions),
      changes: asStringArray(props.changes),
      nextSteps: asStringArray(props.nextSteps),
      actionItems: props.actionItems,
      participants: props.participants,
    });
    // Intentionally re-runs only when the meeting identity or its content
    // changes — not on every render of a page that also holds live state
    // (recording queues, etc.) unrelated to this cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.meetingId, props.summary]);

  return null;
}
