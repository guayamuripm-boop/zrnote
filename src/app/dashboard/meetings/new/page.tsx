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

    // Parse "Nombre <email>" or just "email"
    const parsed = participants
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((entry) => {
        const angleMatch = entry.match(/^(.+?)\s*<(.+?)>$/);
        if (angleMatch) {
          return { name: angleMatch[1].trim(), email: angleMatch[2].trim() };
        }
        if (entry.includes('@')) {
          const name = entry.split('@')[0].replace(/[._-]/g, ' ').trim();
          return { name, email: entry };
        }
        return null;
      })
      .filter(Boolean);

    const response = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, coordination, type, participants: parsed }),
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
            placeholder={'Juan Pérez <juan@mail.com>\nMaría López <maria@mail.com>\no solo: ana@mail.com'}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Formato: Nombre &lt;email&gt; — separados por coma o salto de línea</p>
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
