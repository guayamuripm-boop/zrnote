import { describe, it, expect } from 'vitest';
import {
  buildDedupeKey,
  claimEmailJobs,
  getDailyEmailUsage,
  getUnsubscribedEmails,
} from '@/lib/email-outbox';

/** Supabase de mentira para la lista de bajas. */
function fakeUnsubs(rows: string[], error?: string) {
  return {
    from() {
      return {
        select() {
          return {
            in: (_col: string, emails: string[]) =>
              Promise.resolve(
                error
                  ? { data: null, error: { message: error } }
                  : { data: rows.filter((r) => emails.includes(r)).map((email) => ({ email })), error: null },
              ),
          };
        },
      };
    },
  } as any;
}

/** Supabase de mentira que sólo sabe contar, para la cuota diaria. */
function fakeCounter(count: number | null, error?: string) {
  return {
    from() {
      return {
        select(_c: string, _o: any) {
          const chain = {
            eq: () => chain,
            gte: () =>
              Promise.resolve(error ? { count: null, error: { message: error } } : { count, error: null }),
          };
          return chain;
        },
      };
    },
  } as any;
}

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

describe('getDailyEmailUsage', () => {
  it('calcula lo que queda del tope diario', async () => {
    const usage = await getDailyEmailUsage(fakeCounter(120));
    expect(usage.used).toBe(120);
    expect(usage.limit).toBe(500);
    expect(usage.remaining).toBe(380);
  });

  it('detecta la cuota agotada', async () => {
    const usage = await getDailyEmailUsage(fakeCounter(500));
    expect(usage.remaining).toBe(0);
  });

  it('nunca devuelve un restante negativo', async () => {
    // Gmail cuenta sobre una ventana móvil, así que podemos pasarnos del tope
    // nominal. Un "quedan -13" en pantalla no ayudaría a nadie.
    const usage = await getDailyEmailUsage(fakeCounter(513));
    expect(usage.remaining).toBe(0);
  });

  it('si no puede contar, NO bloquea el envío', async () => {
    // Un fallo del contador no puede convertirse en «hoy no sale ningún
    // correo». Ante la duda, dejar pasar.
    const usage = await getDailyEmailUsage(fakeCounter(null, 'timeout'));
    expect(usage.used).toBe(0);
    expect(usage.remaining).toBe(500);
  });
});

describe('getUnsubscribedEmails', () => {
  it('devuelve sólo los que están de baja', async () => {
    const db = fakeUnsubs(['luis@x.com']);
    const bajas = await getUnsubscribedEmails(db, ['ana@x.com', 'luis@x.com']);
    expect(bajas.has('luis@x.com')).toBe(true);
    expect(bajas.has('ana@x.com')).toBe(false);
  });

  it('ignora mayúsculas y espacios', async () => {
    const db = fakeUnsubs(['luis@x.com']);
    const bajas = await getUnsubscribedEmails(db, ['  LUIS@X.com ']);
    expect(bajas.has('luis@x.com')).toBe(true);
  });

  it('no consulta si no hay direcciones', async () => {
    // Evita un `.in()` con lista vacía, que en Postgres no filtra nada.
    const db = fakeUnsubs(['luis@x.com']);
    expect(await getUnsubscribedEmails(db, [])).toEqual(new Set());
    expect(await getUnsubscribedEmails(db, ['', '  '])).toEqual(new Set());
  });

  it('deduplica antes de consultar', async () => {
    const db = fakeUnsubs(['luis@x.com']);
    const bajas = await getUnsubscribedEmails(db, ['luis@x.com', 'LUIS@x.com', 'luis@x.com']);
    expect(bajas.size).toBe(1);
  });

  it('ante un error de base NO bloquea el envío de toda la reunión', async () => {
    // Decisión incómoda: se escribe a alguien que pidió no recibir nada. La
    // alternativa —dejar a la reunión entera sin minuta por un fallo
    // transitorio— es peor. El error queda registrado.
    const db = fakeUnsubs([], 'conexión caída');
    expect(await getUnsubscribedEmails(db, ['luis@x.com'])).toEqual(new Set());
  });
});
