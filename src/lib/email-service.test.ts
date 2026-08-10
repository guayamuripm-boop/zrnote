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
    expect(buildActionItemsHtml([])).toContain('No se identificaron compromisos');
  });

  it('marks a missing deadline as "Por definir", not as a blank cell', () => {
    // A commitment with no agreed date is an open decision someone has to make.
    const html = buildActionItemsHtml([{ description: 'Enviar cotización', priority: 'alta' }]);
    expect(html).toContain('Por definir');
  });

  // --- evento vs tarea: ver actionItemCalendarLink en email-service.ts ---

  it('una tarea (por defecto) sin fecha enlaza al propio ZRNote, no a Calendar', () => {
    // Antes se inventaba "mañana 9:00" de relleno para que hubiera algo que
    // hacer con el enlace. Ahora, en su lugar, se enlaza a donde de verdad se
    // puede poner fecha o marcarla como hecha — sin fabricar una fecha falsa.
    const html = buildActionItemsHtml([{ id: 'a1', description: 'Enviar cotización', priority: 'alta' }]);
    expect(html).not.toContain('calendar.google.com');
    expect(html).toContain('Marcar en ZRNote');
    expect(html).toContain('/dashboard/action-items');
  });

  it('un evento sin fecha SÍ propone Calendar, porque necesita un horario para ser accionable', () => {
    const html = buildActionItemsHtml([
      { id: 'a1', description: 'Reunión de seguimiento con el proveedor', priority: 'alta', kind: 'evento' },
    ]);
    expect(html).toContain('calendar.google.com');
    expect(html).toContain('Ponerle fecha');
  });

  it('una tarea con fecha marca el día entero, no un bloque de 30 minutos', () => {
    const html = buildActionItemsHtml([
      { id: 'a1', description: 'Enviar cotización', priority: 'alta', due_date: '2026-08-15' },
    ]);
    expect(html).toContain('Añadir a Calendar');
    expect(html).toContain('todo el día');
    expect(html).toContain('20260815');
    // "Todo el día" en la API de Google es sin componente de hora.
    expect(html).not.toContain('20260815T090000Z');
  });

  it('un evento con fecha SÍ reserva un bloque de tiempo concreto', () => {
    const html = buildActionItemsHtml([
      { id: 'a1', description: 'Llamada con el cliente', priority: 'alta', due_date: '2026-08-15', kind: 'evento' },
    ]);
    expect(html).toContain('Añadir a Calendar');
    expect(html).not.toContain('todo el día');
    // Con hora concreta (no "todo el día"), no con VALUE=DATE. La hora exacta
    // en UTC depende de la zona horaria del servidor — eso no es parte de lo
    // que este test verifica. Se decodifica sólo el href, no el HTML entero:
    // el CSS de la tabla trae "%" sueltos (p. ej. "width:100%") que rompen
    // decodeURIComponent si se le pasa el documento completo.
    const href = html.match(/href="([^"]+)"/)?.[1] ?? '';
    expect(decodeURIComponent(href)).toMatch(/dates=\d{8}T\d{6}Z\/\d{8}T\d{6}Z/);
    expect(html).not.toContain('VALUE=DATE');
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

  it('matches by name, ignoring case', () => {
    const r = matchItemsToParticipant(items, 'luis', 'luis@nope.com');
    expect(r.map((i) => i.description)).toContain('B');
  });

  it('does not match unrelated participants', () => {
    const r = matchItemsToParticipant(items, 'Marta', 'marta@x.com');
    expect(r).toHaveLength(0);
  });

  it('matches on exact e-mail even with no name', () => {
    // Antes devolvía [] por una guarda `if (!participantName) return []`. El
    // correo exacto es la señal MÁS fiable que existe: no tiene sentido
    // descartarla porque falte el nombre.
    const r = matchItemsToParticipant(items, '', 'ana@x.com');
    expect(r.map((i) => i.description)).toEqual(['A']);
  });

  it('returns empty when there is nothing to match on', () => {
    expect(matchItemsToParticipant(items, '', '')).toHaveLength(0);
  });

  // --- Regresiones: fuga de compromisos entre personas (v1.11) ---

  it('NO asigna a "Ana" los compromisos de "Mariana"', () => {
    // El bug: "mariana gomez".includes("ana") === true, así que Ana recibía la
    // tarea de Mariana bajo el encabezado «Tus compromisos». Fuga de datos.
    const leaky = [
      { assignee_name: 'Mariana Gómez', assignee_email: null, description: 'Presupuesto confidencial' },
      { assignee_name: 'Ana Pérez', assignee_email: null, description: 'Tarea de Ana' },
    ];
    const r = matchItemsToParticipant(leaky, 'Ana', 'ana@x.com');
    expect(r.map((i) => i.description)).toEqual(['Tarea de Ana']);
  });

  it('NO asigna nada por una parte local de correo de 2 letras', () => {
    // `jp@empresa.com` → local "jp"; antes "juan perez".includes("jp") no,
    // pero locales de 1 letra hacían coincidir absolutamente todo.
    const all = [
      { assignee_name: 'Ana Pérez', assignee_email: null, description: 'X' },
      { assignee_name: 'Luis Soto', assignee_email: null, description: 'Y' },
    ];
    expect(matchItemsToParticipant(all, 'A', 'a@empresa.com')).toHaveLength(0);
  });

  it('empareja nombres con y sin tilde', () => {
    // "Ana Pérez" vs "Ana Perez" eran dos personas distintas. En español eso
    // es la mitad de los nombres reales.
    const accented = [{ assignee_name: 'Ana Pérez', assignee_email: null, description: 'Z' }];
    expect(matchItemsToParticipant(accented, 'Ana Perez', 'ap@x.com')).toHaveLength(1);
    expect(matchItemsToParticipant(accented, 'Ana Pérez', 'ap@x.com')).toHaveLength(1);
  });

  it('empareja cuando el LLM sólo da el nombre de pila', () => {
    const partial = [{ assignee_name: 'Ana', assignee_email: null, description: 'W' }];
    expect(matchItemsToParticipant(partial, 'Ana Pérez', 'ana.perez@x.com')).toHaveLength(1);
  });

  it('distingue dos personas con el mismo nombre de pila', () => {
    const twins = [
      { assignee_name: 'Ana Pérez', assignee_email: null, description: 'de Perez' },
      { assignee_name: 'Ana Gómez', assignee_email: null, description: 'de Gomez' },
    ];
    const r = matchItemsToParticipant(twins, 'Ana Gómez', 'ag@x.com');
    expect(r.map((i) => i.description)).toEqual(['de Gomez']);
  });

  it('ignora partículas ("de", "la") al comparar', () => {
    const particles = [{ assignee_name: 'Juan de la Cruz', assignee_email: null, description: 'P' }];
    expect(matchItemsToParticipant(particles, 'Juan Cruz', 'jcruz@x.com')).toHaveLength(1);
  });

  it('deduce el nombre de la parte local del correo', () => {
    const byEmail = [{ assignee_name: 'Ana Pérez', assignee_email: null, description: 'Q' }];
    // El participante se apuntó sin nombre, pero el correo lo delata.
    expect(matchItemsToParticipant(byEmail, '', 'ana.perez@empresa.com')).toHaveLength(1);
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
