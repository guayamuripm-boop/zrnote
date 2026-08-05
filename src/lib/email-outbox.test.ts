import { describe, it, expect } from 'vitest';
import { buildDedupeKey, claimEmailJobs } from '@/lib/email-outbox';

/**
 * Supabase de mentira con sólo las formas de consulta que usa el libro mayor:
 * `.from().select().in()` y `.from().upsert().select()`.
 *
 * `rows` es el estado inicial de email_logs; `inserted` recoge lo que se
 * reservó, para poder afirmar sobre ello.
 */
function fakeSupabase(rows: any[] = [], opts: { readError?: string; insertError?: string } = {}) {
  const inserted: any[] = [];
  const store = [...rows];

  return {
    inserted,
    store,
    from() {
      return {
        select(_cols?: string) {
          return {
            in(_col: string, keys: string[]) {
              if (opts.readError) return Promise.resolve({ data: null, error: { message: opts.readError } });
              return Promise.resolve({ data: store.filter((r) => keys.includes(r.dedupe_key)), error: null });
            },
          };
        },
        upsert(newRows: any[], _o: any) {
          return {
            select(_cols?: string) {
              if (opts.insertError) return Promise.resolve({ data: null, error: { message: opts.insertError } });
              // ON CONFLICT DO NOTHING: sólo entran las claves que no existían.
              const fresh = newRows.filter((r) => !store.some((s) => s.dedupe_key === r.dedupe_key));
              fresh.forEach((r, i) => {
                const row = { ...r, id: `new-${inserted.length + i}` };
                store.push(row);
                inserted.push(row);
              });
              return Promise.resolve({
                data: fresh.map((r, i) => ({ id: `new-${inserted.length - fresh.length + i}`, dedupe_key: r.dedupe_key })),
                error: null,
              });
            },
          };
        },
      };
    },
  } as any;
}

const job = (to: string, html = '<p>minuta</p>') => ({
  to,
  subject: 'Minuta',
  html,
  kind: 'personal' as const,
});

describe('buildDedupeKey', () => {
  it('es estable para el mismo correo', () => {
    const a = buildDedupeKey('m1', 'personal', 'ana@x.com', '<p>hola</p>');
    const b = buildDedupeKey('m1', 'personal', 'ana@x.com', '<p>hola</p>');
    expect(a).toBe(b);
  });

  it('ignora mayúsculas y espacios del destinatario', () => {
    const a = buildDedupeKey('m1', 'personal', 'Ana@X.com', '<p>hola</p>');
    const b = buildDedupeKey('m1', 'personal', '  ana@x.com ', '<p>hola</p>');
    expect(a).toBe(b);
  });

  it('cambia si cambia el contenido: una minuta regenerada SÍ se puede reenviar', () => {
    const a = buildDedupeKey('m1', 'personal', 'ana@x.com', '<p>v1</p>');
    const b = buildDedupeKey('m1', 'personal', 'ana@x.com', '<p>v2</p>');
    expect(a).not.toBe(b);
  });

  it('distingue destinatario, reunión y tipo', () => {
    const base = buildDedupeKey('m1', 'personal', 'ana@x.com', '<p>x</p>');
    expect(buildDedupeKey('m2', 'personal', 'ana@x.com', '<p>x</p>')).not.toBe(base);
    expect(buildDedupeKey('m1', 'personal', 'otro@x.com', '<p>x</p>')).not.toBe(base);
    expect(buildDedupeKey('m1', 'coordinator_summary', 'ana@x.com', '<p>x</p>')).not.toBe(base);
  });
});

describe('claimEmailJobs', () => {
  it('reserva todos los correos cuando no hay nada previo', async () => {
    const db = fakeSupabase([]);
    const claimed = await claimEmailJobs(db, 'm1', [job('ana@x.com'), job('luis@x.com')]);
    expect(claimed).toHaveLength(2);
    expect(db.inserted).toHaveLength(2);
    expect(db.inserted[0].status).toBe('pending');
  });

  it('NO reenvía lo que ya consta enviado (el bug de los duplicados)', async () => {
    const j = job('ana@x.com');
    const db = fakeSupabase([
      { id: 'l1', dedupe_key: buildDedupeKey('m1', 'personal', 'ana@x.com', j.html), status: 'sent' },
    ]);
    const claimed = await claimEmailJobs(db, 'm1', [j]);
    expect(claimed).toHaveLength(0);
  });

  it('SÍ reenvía lo que quedó a medias (pending) tras morir la función', async () => {
    const j = job('ana@x.com');
    const db = fakeSupabase([
      { id: 'l1', dedupe_key: buildDedupeKey('m1', 'personal', 'ana@x.com', j.html), status: 'pending' },
    ]);
    const claimed = await claimEmailJobs(db, 'm1', [j]);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].logId).toBe('l1');
  });

  it('SÍ reintenta lo que falló', async () => {
    const j = job('ana@x.com');
    const db = fakeSupabase([
      { id: 'l1', dedupe_key: buildDedupeKey('m1', 'personal', 'ana@x.com', j.html), status: 'failed' },
    ]);
    expect(await claimEmailJobs(db, 'm1', [j])).toHaveLength(1);
  });

  it('con force: true reenvía aunque ya se hubiera enviado', async () => {
    // El usuario pulsó «Enviar correos» a propósito: debe hacer lo que dice.
    const j = job('ana@x.com');
    const db = fakeSupabase([
      { id: 'l1', dedupe_key: buildDedupeKey('m1', 'personal', 'ana@x.com', j.html), status: 'sent' },
    ]);
    const claimed = await claimEmailJobs(db, 'm1', [j], { force: true });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].logId).toBe('l1');
  });

  it('mezcla correctamente enviados, fallidos y nuevos', async () => {
    const ana = job('ana@x.com');
    const luis = job('luis@x.com');
    const nuevo = job('nuevo@x.com');
    const db = fakeSupabase([
      { id: 'l1', dedupe_key: buildDedupeKey('m1', 'personal', 'ana@x.com', ana.html), status: 'sent' },
      { id: 'l2', dedupe_key: buildDedupeKey('m1', 'personal', 'luis@x.com', luis.html), status: 'failed' },
    ]);
    const claimed = await claimEmailJobs(db, 'm1', [ana, luis, nuevo]);
    expect(claimed.map((c) => c.job.to).sort()).toEqual(['luis@x.com', 'nuevo@x.com']);
  });

  it('devuelve [] sin trabajos, sin tocar la base', async () => {
    const db = fakeSupabase([]);
    expect(await claimEmailJobs(db, 'm1', [])).toEqual([]);
    expect(db.inserted).toHaveLength(0);
  });

  it('si no puede leer el estado previo, envía igualmente', async () => {
    // Dejar al usuario sin minuta es peor que arriesgar un duplicado.
    const db = fakeSupabase([], { readError: 'conexión caída' });
    const claimed = await claimEmailJobs(db, 'm1', [job('ana@x.com')]);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].logId).toBeNull();
  });

  it('si no puede reservar, envía igualmente pero sin id de registro', async () => {
    const db = fakeSupabase([], { insertError: 'permiso denegado' });
    const claimed = await claimEmailJobs(db, 'm1', [job('ana@x.com')]);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].logId).toBeNull();
  });
});
