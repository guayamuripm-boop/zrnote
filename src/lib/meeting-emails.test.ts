import { describe, it, expect } from 'vitest';
import { buildMeetingEmailJobs, dispatchEmailJobs } from './meeting-emails';

/**
 * Minimal Supabase stub: only the query shapes buildMeetingEmailJobs uses.
 * `.from(table)` returns a thenable chain that resolves to the fixture rows.
 */
function fakeSupabase(fixtures: Record<string, any>) {
  const make = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
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
});

describe('dispatchEmailJobs', () => {
  it('reports a clear error instead of silently sending nothing', async () => {
    const result = await dispatchEmailJobs(fakeSupabase({}), 'm1', []);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/participantes/i);
  });
});
