'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Participant {
  name: string;
  email: string;
}

export default function NewMeetingPage() {
  const [title, setTitle] = useState('');
  const [coordination, setCoordination] = useState('');
  const [type, setType] = useState<'presencial' | 'virtual' | 'llamada'>('presencial');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const addParticipant = () => {
    const name = nameInput.trim();
    const email = emailInput.trim();
    if (!name || !email || !email.includes('@')) return;
    if (participants.some((p) => p.email.toLowerCase() === email.toLowerCase())) return;
    setParticipants([...participants, { name, email }]);
    setNameInput('');
    setEmailInput('');
  };

  const removeParticipant = (email: string) => {
    setParticipants(participants.filter((p) => p.email !== email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const response = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, coordination, type, participants }),
    });

    if (response.ok) {
      const { id } = await response.json();
      router.push(`/dashboard/meetings/${id}`);
    } else {
      setLoading(false);
      alert('Error al crear reunión');
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Nueva Reunión</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Meeting info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ej: Reunión semanal de equipo"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Coordinación</label>
              <input
                type="text"
                value={coordination}
                onChange={(e) => setCoordination(e.target.value)}
                placeholder="Dirección Académica"
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
                <option value="llamada">Llamada</option>
              </select>
            </div>
          </div>
        </div>

        {/* Participants section */}
        <div className="border rounded-lg p-4 space-y-3">
          <label className="block text-sm font-semibold">Participantes</label>

          {/* Add participant form */}
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nombre"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addParticipant())}
            />
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="flex-[2] border rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addParticipant())}
            />
            <button
              type="button"
              onClick={addParticipant}
              className="bg-zr-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zr-navy transition shrink-0"
            >
              + Agregar
            </button>
          </div>

          {/* Participant list */}
          {participants.length > 0 ? (
            <div className="space-y-2">
              {participants.map((p) => (
                <div
                  key={p.email}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-zr-blue/10 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-zr-blue text-xs font-bold">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 truncate">{p.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeParticipant(p.email)}
                    className="text-gray-300 hover:text-red-500 transition shrink-0 ml-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">
              Agrega participantes para que reciban sus action items por correo
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-zr-blue text-white py-2.5 rounded-lg font-medium hover:bg-zr-navy transition disabled:opacity-50"
        >
          {loading ? 'Creando...' : 'Crear Reunión'}
        </button>
      </form>
    </div>
  );
}
