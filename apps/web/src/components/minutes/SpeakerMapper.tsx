'use client';

import { useState, useEffect } from 'react';

interface SpeakerMapperProps {
  meetingId: string;
  speakerMap: Record<string, string>;
  participants: { id: string; full_name: string }[];
  onSave?: () => void;
}

export default function SpeakerMapper({
  meetingId,
  speakerMap,
  participants,
  onSave,
}: SpeakerMapperProps) {
  const [map, setMap] = useState<Record<string, string>>(speakerMap);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const response = await fetch(`/api/meetings/${meetingId}/speaker-map`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speaker_map: map }),
    });

    if (response.ok) {
      onSave?.();
    }
    setSaving(false);
  };

  const speakers = Object.keys(map);

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <h3 className="text-lg font-semibold">Mapeo de Hablantes</h3>
      <p className="text-sm text-gray-500">
        Asigna cada speaker de la transcripción a un participante real.
      </p>
      <div className="space-y-3">
        {speakers.map((speaker) => (
          <div key={speaker} className="flex items-center gap-3">
            <span className="font-mono text-sm w-24">{speaker}</span>
            <span className="text-gray-400">→</span>
            <select
              value={map[speaker]}
              onChange={(e) => setMap({ ...map, [speaker]: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sin asignar</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
      >
        {saving ? 'Guardando...' : 'Guardar Mapeo'}
      </button>
    </div>
  );
}
