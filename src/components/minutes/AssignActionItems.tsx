'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Participant {
  name: string;
  email: string;
}

interface ActionItem {
  id: string;
  assignee_name: string | null;
  assignee_email?: string | null;
  description: string;
  priority: string | null;
  due_date: string | null;
}

interface AssignActionItemsProps {
  meetingId: string;
  actionItems: ActionItem[];
  participants: Participant[];
  onAssigned?: () => void;
}

export default function AssignActionItems({
  meetingId,
  actionItems,
  participants,
  onAssigned,
}: AssignActionItemsProps) {
  const router = useRouter();
  // Pre-select what is already assigned. This used to always start empty, so
  // every visit showed "Sin asignar" even right after saving, and saving again
  // silently wiped nothing but looked broken.
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      actionItems.map((i) => {
        const match = participants.find(
          (p) =>
            (i.assignee_email && p.email.toLowerCase() === i.assignee_email.toLowerCase()) ||
            (i.assignee_name && p.name.toLowerCase() === i.assignee_name.toLowerCase()),
        );
        return [i.id, match?.email ?? ''];
      }),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const handleAssign = (itemId: string, participantKey: string) => {
    setAssignments((prev) => ({ ...prev, [itemId]: participantKey }));
  };

  const persistAssignments = async (): Promise<boolean> => {
    const assignmentList = Object.entries(assignments).map(([actionItemId, email]) => {
      const participant = participants.find((p) => p.email === email);
      return {
        action_item_id: actionItemId,
        assignee_name: email ? participant?.name || email.split('@')[0] : null,
        assignee_email: email || null,
      };
    });

    const res = await fetch(`/api/meetings/${meetingId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: assignmentList }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setResult({ kind: 'error', text: data.error || 'No se pudieron guardar las asignaciones.' });
      return false;
    }
    return true;
  };

  // Saving who is responsible and e-mailing everyone are two different
  // intentions; forcing them into one button meant you could not fix an
  // assignment without spamming the whole team again.
  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    const ok = await persistAssignments();
    if (ok) {
      setResult({ kind: 'ok', text: 'Responsables guardados.' });
      router.refresh();
      onAssigned?.();
    }
    setSaving(false);
  };

  const handleSaveAndSend = async () => {
    setSending(true);
    setResult(null);
    const ok = await persistAssignments();
    if (!ok) {
      setSending(false);
      return;
    }

    const emailRes = await fetch(`/api/meetings/${meetingId}/send-emails`, { method: 'POST' });
    const emailData = await emailRes.json().catch(() => ({}));

    if (!emailRes.ok) {
      setResult({ kind: 'error', text: emailData.error || 'No se pudieron enviar los correos.' });
    } else if (emailData.failed > 0) {
      setResult({ kind: 'error', text: `${emailData.sent} enviado(s), ${emailData.failed} con error.` });
    } else {
      setResult({ kind: 'ok', text: `${emailData.sent} correo(s) enviado(s).` });
    }

    setSending(false);
    router.refresh();
    onAssigned?.();
  };

  const unassignedCount = Object.values(assignments).filter((v) => v === '').length;
  const busy = saving || sending;

  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          Asignar Responsables
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Selecciona quién se encarga de cada tarea
        </p>
      </div>

      <div className="space-y-3">
        {actionItems.map((item) => (
          <div key={item.id} className="glass rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{item.description}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {item.priority}
                {item.due_date && ` · ${new Date(item.due_date).toLocaleDateString('es-ES')}`}
              </p>
            </div>
            <select
              value={assignments[item.id] || ''}
              onChange={(e) => handleAssign(item.id, e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition w-full sm:w-auto sm:min-w-[180px]"
            >
              <option value="">Sin asignar</option>
              {participants.map((p) => (
                <option key={p.email} value={p.email}>{p.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {unassignedCount > 0
            ? `${unassignedCount} tarea${unassignedCount !== 1 ? 's' : ''} sin asignar`
            : 'Todas asignadas'}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleSave}
            disabled={busy}
            className="glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/80 dark:hover:bg-white/5 transition disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={handleSaveAndSend}
            disabled={busy}
            className="gradient-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50"
          >
            {sending ? 'Enviando…' : 'Guardar y enviar correos'}
          </button>
        </div>
      </div>

      {result && (
        <p className={`text-sm font-medium ${result.kind === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}