'use client';

import { useState } from 'react';

interface Participant {
  name: string;
  email: string;
}

interface ActionItem {
  id: string;
  assignee_name: string;
  description: string;
  priority: string;
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
  const [assignments, setAssignments] = useState<Record<string, string>>(
    () => Object.fromEntries(actionItems.map((i) => [i.id, '']))
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleAssign = (itemId: string, participantKey: string) => {
    setAssignments((prev) => ({ ...prev, [itemId]: participantKey }));
  };

  const handleSave = async () => {
    setSaving(true);
    setResult(null);

    const assignmentList = Object.entries(assignments)
      .filter(([_, email]) => email !== '')
      .map(([actionItemId, email]) => {
        const participant = participants.find((p) => p.email === email);
        return {
          action_item_id: actionItemId,
          assignee_name: participant?.name || email.split('@')[0],
          assignee_email: email,
        };
      });

    if (assignmentList.length > 0) {
      const assignRes = await fetch(`/api/meetings/${meetingId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: assignmentList }),
      });
      if (!assignRes.ok) {
        setResult('Error al guardar asignaciones');
        setSaving(false);
        return;
      }
    }

    const emailRes = await fetch(`/api/meetings/${meetingId}/send-emails`, {
      method: 'POST',
    });
    const emailData = await emailRes.json();

    if (emailRes.ok && emailData.results) {
      const sent = emailData.results.filter((r: string) => r.includes('enviado')).length;
      const failed = emailData.results.filter((r: string) => r.includes('error')).length;
      setResult(
        failed > 0
          ? `${sent} enviados, ${failed} fallaron`
          : `${sent} correo${sent !== 1 ? 's' : ''} enviado${sent !== 1 ? 's' : ''}`
      );
    } else {
      setResult(`Error: ${emailData.error || 'desconocido'}`);
    }

    setSaving(false);
    onAssigned?.();
  };

  const unassignedCount = Object.values(assignments).filter((v) => v === '').length;

  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-zr-navy dark:text-zr-blue-pale flex items-center gap-2">
          <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          Asignar Responsables
        </h3>
        <p className="text-sm text-zr-blue-mid/50 mt-1">
          Selecciona quién se encarga de cada tarea
        </p>
      </div>

      <div className="space-y-3">
        {actionItems.map((item) => (
          <div key={item.id} className="glass rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-zr-navy dark:text-zr-blue-pale">{item.description}</p>
              <p className="text-xs text-zr-blue-mid/40">
                {item.priority}
                {item.due_date && ` · ${new Date(item.due_date).toLocaleDateString('es-ES')}`}
              </p>
            </div>
            <select
              value={assignments[item.id] || ''}
              onChange={(e) => handleAssign(item.id, e.target.value)}
              className="border border-zr-blue-pale/50 rounded-xl px-3 py-2 text-sm bg-white/80 dark:bg-white/5 text-zr-navy dark:text-zr-blue-pale focus:outline-none focus:ring-2 focus:ring-zr-blue-mid/30 transition w-full sm:w-auto sm:min-w-[180px]"
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
        <p className="text-xs text-zr-blue-mid/40">
          {unassignedCount > 0
            ? `${unassignedCount} tarea${unassignedCount !== 1 ? 's' : ''} sin asignar`
            : 'Todas asignadas'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="gradient-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 disabled:opacity-50"
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Guardando...
            </span>
          ) : 'Guardar y enviar correos'}
        </button>
      </div>

      {result && (
        <p className={`text-sm font-medium ${result.includes('Error') || result.includes('fallaron') ? 'text-indigo-700' : 'text-indigo-600'}`}>
          {result}
        </p>
      )}
    </div>
  );
}
