'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewMeetingPage() {
  const [title, setTitle] = useState('');
  const [coordination, setCoordination] = useState('');
  const [type, setType] = useState<'presencial' | 'virtual' | 'llamada'>('presencial');
  const [participants, setParticipants] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const participantEmails = participants
      .split(/[,;\n]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));

    const response = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, coordination, type, participants: participantEmails }),
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
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <div>
          <label className="block text-sm font-medium mb-1">Coordinación</label>
          <input
            type="text"
            value={coordination}
            onChange={(e) => setCoordination(e.target.value)}
            placeholder="Ej: Dirección Académica"
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
        <div>
          <label className="block text-sm font-medium mb-1">Participantes (emails)</label>
          <textarea
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            placeholder="juan@correo.com, maria@correo.com, ana@correo.com"
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Separados por coma, punto y coma o salto de línea</p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-zr-blue text-white py-2 rounded-lg font-medium hover:bg-zr-navy transition disabled:opacity-50"
        >
          {loading ? 'Creando...' : 'Crear Reunión'}
        </button>
      </form>
    </div>
  );
}
