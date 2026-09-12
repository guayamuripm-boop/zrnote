import { describe, it, expect } from 'vitest';
import { formatMinuteForCopy } from '@/lib/minute-copy-format';

describe('formatMinuteForCopy', () => {
  it('renders a minimal minute with just a title and summary', () => {
    const text = formatMinuteForCopy({
      title: 'Reunión de equipo',
      minute: { summary: 'Se revisó el avance del proyecto.' },
    });
    expect(text).toContain('📋 Reunión de equipo');
    expect(text).toContain('📝 RESUMEN');
    expect(text).toContain('Se revisó el avance del proyecto.');
    // No section header appears for data that was never provided.
    expect(text).not.toContain('DECISIONES');
    expect(text).not.toContain('COMPROMISOS');
  });

  it('puts pending action items before completed ones, each with its priority emoji', () => {
    const text = formatMinuteForCopy({
      title: 'Reunión',
      minute: {},
      actionItems: [
        { description: 'Ya hecho', status: 'completado', priority: 'alta' },
        { description: 'Pendiente urgente', status: 'pendiente', priority: 'alta' },
      ],
    });
    const pendingIdx = text.indexOf('Pendiente urgente');
    const doneIdx = text.indexOf('Ya hecho');
    expect(pendingIdx).toBeGreaterThan(-1);
    expect(pendingIdx).toBeLessThan(doneIdx);
    expect(text).toContain('🔴 Pendiente urgente');
    expect(text).toContain('✔️ Ya hecho');
  });

  it('includes every section the detail page can render, all at once', () => {
    const text = formatMinuteForCopy({
      title: 'Reunión completa',
      minute: {
        summary: 'Resumen.',
        decisions: ['Se decide X'],
        blockers: [{ issue: 'Falta presupuesto', impact: 'retrasa el lanzamiento', owner: 'Ana' }],
        project_statuses: [{ project: 'App móvil', status: 'en curso', details: 'sprint 3' }],
        next_steps: ['Enviar propuesta'],
        discussion: [{ topic: 'Presupuesto', speaker: 'Ana', details: 'se necesita más' }],
        ideas: ['Probar un piloto'],
      },
      actionItems: [{ description: 'Enviar el informe', assignee_name: 'Luis', priority: 'media', due_date: '2026-09-20' }],
      participants: [{ name: 'Ana', email: 'a@x.com' }],
      url: 'https://zrnote.vercel.app/minuta/abc',
    });

    for (const marker of [
      'RESUMEN', 'DECISIONES', 'COMPROMISOS', 'BLOQUEOS', 'ESTADO DE PROYECTOS',
      'PRÓXIMOS PASOS', 'TEMAS DISCUTIDOS', 'IDEAS',
    ]) {
      expect(text).toContain(marker);
    }
    expect(text).toContain('Falta presupuesto');
    expect(text).toContain('Luis');
    expect(text).toContain('vence 20 sept');
    expect(text).toContain('https://zrnote.vercel.app/minuta/abc');
    expect(text).toContain('Generado automáticamente por ZRNote');
  });

  it('never renders a header for a section with an empty array', () => {
    const text = formatMinuteForCopy({
      title: 'Reunión',
      minute: { decisions: [], blockers: [], next_steps: [] },
    });
    expect(text).not.toContain('DECISIONES');
    expect(text).not.toContain('BLOQUEOS');
    expect(text).not.toContain('PRÓXIMOS PASOS');
  });
});
