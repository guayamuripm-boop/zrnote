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

    // Save assignments
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

    // Send emails
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
    <div className="bg-white rounded-lg border p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Asignar Responsables</h3>
        <p className="text-sm text-gray-500">
          Selecciona quién se encarga de cada tarea
        </p>
      </div>

      <div className="space-y-3">
        {actionItems.map((item) => (
          <div
            key={item.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg bg-gray-50"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{item.description}</p>
              <p className="text-xs text-gray-400">
                {item.priority}
                {item.due_date && ` · ${new Date(item.due_date).toLocaleDateString('es-ES')}`}
              </p>
            </div>
            <select
              value={assignments[item.id] || ''}
              onChange={(e) => handleAssign(item.id, e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto sm:min-w-[180px]"
            >
              <option value="">Sin asignar</option>
              {participants.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <p className="text-xs text-gray-400">
          {unassignedCount > 0
            ? `${unassignedCount} tarea${unassignedCount !== 1 ? 's' : ''} sin asignar`
            : 'Todas asignadas'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-zr-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zr-navy transition disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar y enviar correos'}
        </button>
      </div>

      {result && (
        <p className={`text-sm font-medium ${result.includes('Error') || result.includes('fallaron') ? 'text-red-600' : 'text-green-600'}`}>
          {result}
        </p>
      )}
    </div>
  );
}
