'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';

export default function SpeakersPage() {
  const params = useParams();
  const [speakers, setSpeakers] = useState<{ name: string; label: string }[]>([]);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');

  const addSpeaker = () => {
    if (name && label) {
      setSpeakers([...speakers, { name, label }]);
      setName('');
      setLabel('');
    }
  };

  const saveSpeakers = async () => {
    await fetch(`/api/meetings/${params.id}/speaker-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakers }),
    });
    alert('Speakers guardados');
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Identificar Participantes</h1>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Etiqueta (ej: Director)"
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button onClick={addSpeaker} className="bg-zr-blue text-white px-4 py-2 rounded-lg">
          + 
        </button>
      </div>
      {speakers.length > 0 && (
        <div className="space-y-2">
          {speakers.map((s, i) => (
            <div key={i} className="flex justify-between bg-white border rounded-lg p-3">
              <span>{s.name}</span>
              <span className="text-gray-500">{s.label}</span>
            </div>
          ))}
          <button onClick={saveSpeakers} className="w-full bg-zr-blue text-white py-2 rounded-lg font-medium">
            Guardar Participantes
          </button>
        </div>
      )}
    </div>
  );
}
