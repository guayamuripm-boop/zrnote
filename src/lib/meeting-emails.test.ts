import { describe, it, expect } from 'vitest';
import { buildMeetingEmailJobs, dispatchEmailJobs } from './meeting-emails';

/**
 * Minimal Supabase stub: only the query shapes buildMeetingEmailJobs uses.
 * `.from(table)` returns a thenable chain that resolves to the fixture rows.
 *
 * Para las bajas, pon `email_unsubscribes: [{ email: 'x@y.com' }]` en las
 * fixtures; si no aparece, no hay nadie de baja.
 */
function fakeSupabase(fixtures: Record<string, any>) {
  const make = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => Promise.resolve({ data: fixtures[table] ?? [], error: null }),
      maybeSingle: () => Promise.resolve({ data: fixtures[table] ?? null }),
      then: (resolve: any) => resolve({ data: fixtures[table] ?? [] }),
      insert: (rows: any) => {
        fixtures.__inserted = [...(fixtures.__inserted || []), ...(Array.isArray(rows) ? rows : [rows])];
        return Promise.resolve({ error: null });
      },
    };
    return chain;
  };
  return { from: make };
}

const MINUTE = { summary: 'Se acordó lanzar en agosto.', decisions: ['Lanzar el 15'] };

describe('buildMeetingEmailJobs', () => {
  it('writes one personal e-mail per guest plus the coordinator summary', async () => {
    const supabase = fakeSupabase({
      action_items: [
        { id: 'a1', assignee_name: 'Ana', description: 'Enviar la propuesta', priority: 'alta', due_date: '2026-08-01' },
      ],
      minutes: MINUTE,
      meeting_participants: [
        { name: 'Ana', email_override: 'ana@example.com' },
        { name: 'Luis', email_override: 'luis@example.com' },
        { name: 'Jefe', email_override: 'jefe@example.com' },
      ],
      users: { email: 'jefe@example.com' },
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Comité semanal', 'creator-id');

    expect(jobs.map((j) => j.to)).toEqual([
      'ana@example.com',
      'luis@example.com',
      'jefe@example.com',
    ]);
    // The creator gets exactly one message (the summary), not a duplicate.
    expect(jobs.filter((j) => j.isCoordinator)).toHaveLength(1);
  });

  it('escapes the meeting title and participant names (LLM/user content in HTML)', async () => {
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [{ name: '<img src=x onerror=alert(1)>', email_override: 'x@example.com' }],
      users: { email: 'boss@example.com' },
    });

    const jobs = await buildMeetingEmailJobs(
      supabase,
      'm1',
      '<script>alert("xss")</script>',
      'creator-id',
    );

    for (const job of jobs) {
      // The payload survives as inert text, never as live markup.
      expect(job.html).not.toContain('<script>');
      expect(job.html).not.toContain('<img');
      expect(job.html).toContain('&lt;script&gt;');
    }
  });

  it('attaches an .ics only when there are commitments with a due date', async () => {
    const withDate = fakeSupabase({
      action_items: [{ id: 'a1', assignee_name: 'Ana', description: 'Tarea', priority: 'alta', due_date: '2026-08-01' }],
      minutes: MINUTE,
      meeting_participants: [{ name: 'Ana', email_override: 'ana@example.com' }],
      users: { email: 'boss@example.com' },
    });
    const withoutDate = fakeSupabase({
      action_items: [{ id: 'a1', assignee_name: 'Ana', description: 'Tarea', priority: 'alta', due_date: null }],
      minutes: MINUTE,
      meeting_participants: [{ name: 'Ana', email_override: 'ana@example.com' }],
      users: { email: 'boss@example.com' },
    });

    const [a] = await buildMeetingEmailJobs(withDate, 'm1', 'Reunión', 'creator');
    const [b] = await buildMeetingEmailJobs(withoutDate, 'm1', 'Reunión', 'creator');

    expect(a.attachments?.[0].filename).toBe('compromisos.ics');
    expect(b.attachments).toBeUndefined();
  });

  it('skips participants with no e-mail address', async () => {
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [
        { name: 'Sin correo', email_override: '' },
        { name: 'Ana', email_override: 'ana@example.com' },
      ],
      users: { email: 'boss@example.com' },
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
    expect(jobs.map((j) => j.to)).toEqual(['ana@example.com', 'boss@example.com']);
  });

  it('always warns that the minute is AI-generated', async () => {
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [{ name: 'Ana', email_override: 'ana@example.com' }],
      users: { email: 'boss@example.com' },
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
    for (const job of jobs) {
      expect(job.html).toContain('inteligencia artificial');
      expect(job.html).toContain('Puede contener errores');
    }
  });

  // --- Enlace público de la minuta (v1.12) ---

  it('al participante le manda un enlace público, no el panel', async () => {
    // El bug: el botón apuntaba a /dashboard/meetings/{id}, que filtra por
    // created_by. El participante veía un login y luego un 404.
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [{ name: 'Ana', email_override: 'ana@example.com' }],
      users: { email: 'jefe@example.com' },
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
    const deAna = jobs.find((j) => j.to === 'ana@example.com')!;
    expect(deAna.html).toContain('/minuta/');
    expect(deAna.html).not.toContain('/dashboard/meetings/');
  });

  it('al organizador le sigue mandando su panel', async () => {
    // Él sí tiene cuenta, y ahí puede editar y reenviar.
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [{ name: 'Ana', email_override: 'ana@example.com' }],
      users: { email: 'jefe@example.com' },
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
    const delJefe = jobs.find((j) => j.to === 'jefe@example.com')!;
    expect(delJefe.html).toContain('/dashboard/meetings/m1');
  });

  it('cada participante recibe un enlace distinto', async () => {
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [
        { name: 'Ana', email_override: 'ana@example.com' },
        { name: 'Luis', email_override: 'luis@example.com' },
      ],
      users: { email: 'jefe@example.com' },
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
    const tokens = jobs
      .filter((j) => j.kind === 'personal')
      .map((j) => j.html.match(/\/minuta\/([\w.\-_]+)/)?.[1]);
    expect(tokens[0]).toBeTruthy();
    expect(tokens[0]).not.toBe(tokens[1]);
  });

  it('sin clave de firma NO se cae: degrada al panel', async () => {
    // Una variable de entorno ausente no puede dejar a nadie sin minuta. Es el
    // mismo patrón que rompió los correos en v1.10, cuando la URL de Calendar
    // lanzaba desde dentro de la construcción del HTML.
    const secret = process.env.MINUTE_LINK_SECRET;
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const svc2 = process.env.SUPABASE_SERVICE_KEY;
    try {
      delete process.env.MINUTE_LINK_SECRET;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_KEY;

      const supabase = fakeSupabase({
        action_items: [],
        minutes: MINUTE,
        meeting_participants: [{ name: 'Ana', email_override: 'ana@example.com' }],
        users: { email: 'jefe@example.com' },
      });

      const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
      expect(jobs).toHaveLength(2); // los correos SALEN igual
      const deAna = jobs.find((j) => j.to === 'ana@example.com')!;
      expect(deAna.html).toContain('/dashboard/meetings/');
      expect(deAna.unsubscribeUrl).toBeUndefined();
    } finally {
      if (secret !== undefined) process.env.MINUTE_LINK_SECRET = secret;
      if (svc !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = svc;
      if (svc2 !== undefined) process.env.SUPABASE_SERVICE_KEY = svc2;
    }
  });

  // --- Bajas (v1.12) ---

  it('no escribe a quien se dio de baja', async () => {
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [
        { name: 'Ana', email_override: 'ana@example.com' },
        { name: 'Luis', email_override: 'luis@example.com' },
      ],
      users: { email: 'jefe@example.com' },
      email_unsubscribes: [{ email: 'luis@example.com' }],
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
    expect(jobs.map((j) => j.to)).toEqual(['ana@example.com', 'jefe@example.com']);
  });

  it('honra la baja aunque sea el propio organizador', async () => {
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [{ name: 'Ana', email_override: 'ana@example.com' }],
      users: { email: 'jefe@example.com' },
      email_unsubscribes: [{ email: 'jefe@example.com' }],
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
    expect(jobs.map((j) => j.to)).toEqual(['ana@example.com']);
  });

  it('anuncia la baja de un clic sólo a los participantes', async () => {
    // El organizador no puede darse de baja de su propio producto desde aquí.
    const supabase = fakeSupabase({
      action_items: [],
      minutes: MINUTE,
      meeting_participants: [{ name: 'Ana', email_override: 'ana@example.com' }],
      users: { email: 'jefe@example.com' },
    });

    const jobs = await buildMeetingEmailJobs(supabase, 'm1', 'Reunión', 'creator');
    expect(jobs.find((j) => j.to === 'ana@example.com')!.unsubscribeUrl).toContain('/api/baja/');
    expect(jobs.find((j) => j.to === 'jefe@example.com')!.unsubscribeUrl).toBeUndefined();
  });
});

describe('dispatchEmailJobs', () => {
  it('reports a clear error instead of silently sending nothing', async () => {
    const result = await dispatchEmailJobs(fakeSupabase({}), 'm1', []);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/participantes/i);
  });
});
