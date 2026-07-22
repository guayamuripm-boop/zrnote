import { describe, it, expect } from 'vitest';
import {
  buildMinuteHtml,
  buildActionItemsHtml,
  matchItemsToParticipant,
  sendWithRetry,
} from '@/lib/email-service';

describe('buildMinuteHtml', () => {
  it('returns a fallback when minute is missing', () => {
    expect(buildMinuteHtml(null)).toContain('no disponible');
  });

  it('renders summary and escapes XSS from LLM output', () => {
    const html = buildMinuteHtml({ summary: '<img src=x onerror=alert(1)>' });
    expect(html).toContain('Resumen');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('renders discussion, decisions and next_steps (string or object forms)', () => {
    const html = buildMinuteHtml({
      summary: 'ok',
      discussion: [{ topic: 'Presupuesto', details: 'Se revisó', speaker: 'Ana' }],
      decisions: [{ decision: 'Aprobar plan', context: 'unánime' }, 'Decisión suelta'],
      next_steps: [{ step: 'Enviar informe', owner: 'Luis' }, 'Paso suelto'],
    });
    expect(html).toContain('Presupuesto');
    expect(html).toContain('Aprobar plan');
    expect(html).toContain('(unánime)');
    expect(html).toContain('Enviar informe');
    expect(html).toContain('Luis');
  });
});

describe('buildActionItemsHtml', () => {
  it('shows a message when there are no items', () => {
    expect(buildActionItemsHtml([])).toContain('No se generaron');
  });

  it('renders a table row per item and escapes fields', () => {
    const html = buildActionItemsHtml([
      { assignee_name: '<b>Ana</b>', description: 'Tarea', priority: 'alta', due_date: '2026-08-01' },
    ]);
    expect(html).toContain('<table');
    expect(html).toContain('&lt;b&gt;Ana');
    expect(html).toContain('2026-08-01');
  });
});

describe('matchItemsToParticipant', () => {
  const items = [
    { assignee_name: 'Ana García', assignee_email: 'ana@x.com', description: 'A' },
    { assignee_name: 'Luis', assignee_email: null, description: 'B' },
    { assignee_name: 'Pedro', assignee_email: 'pedro@x.com', description: 'C' },
  ];

  it('matches by exact email first', () => {
    const r = matchItemsToParticipant(items, 'Otro Nombre', 'ana@x.com');
    expect(r).toHaveLength(1);
    expect(r[0].description).toBe('A');
  });

  it('matches by name (case-insensitive, partial)', () => {
    const r = matchItemsToParticipant(items, 'luis', 'luis@nope.com');
    expect(r.map((i) => i.description)).toContain('B');
  });

  it('does not match unrelated participants', () => {
    const r = matchItemsToParticipant(items, 'Marta', 'marta@x.com');
    expect(r).toHaveLength(0);
  });

  it('returns empty when name is missing', () => {
    expect(matchItemsToParticipant(items, '', 'ana@x.com')).toHaveLength(0);
  });
});

describe('sendWithRetry', () => {
  it('returns immediately on success', async () => {
    let calls = 0;
    const r = await sendWithRetry(async () => { calls++; return { ok: true }; });
    expect(r.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('retries then returns the last failure', async () => {
    let calls = 0;
    const r = await sendWithRetry(async () => { calls++; return { ok: false, error: 'smtp down' }; }, 2);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('smtp down');
    expect(calls).toBe(2);
  }, 10000);

  it('succeeds on a later attempt', async () => {
    let calls = 0;
    const r = await sendWithRetry(async () => { calls++; return { ok: calls >= 2 }; }, 3);
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
  }, 10000);
});
