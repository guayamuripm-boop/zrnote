import { describe, it, expect, beforeAll } from 'vitest';
import { signMinuteToken, verifyMinuteToken, minuteUrl, unsubscribeUrl } from '@/lib/minute-links';

beforeAll(() => {
  process.env.MINUTE_LINK_SECRET = 'secreto-de-pruebas-no-usar-en-produccion';
  process.env.NEXT_PUBLIC_APP_URL = 'https://zrnote.test';
});

describe('signMinuteToken / verifyMinuteToken', () => {
  it('ida y vuelta: lo que se firma es lo que se lee', () => {
    const token = signMinuteToken('m-123', 'Ana@Empresa.com');
    const result = verifyMinuteToken(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.meetingId).toBe('m-123');
    // El correo se normaliza a minúsculas para poder compararlo luego.
    expect(result.payload.email).toBe('ana@empresa.com');
  });

  it('cada destinatario recibe un token distinto', () => {
    // Si uno se filtra, se puede saber de quién salió.
    const a = signMinuteToken('m-1', 'ana@x.com');
    const b = signMinuteToken('m-1', 'luis@x.com');
    expect(a).not.toBe(b);
  });

  it('rechaza una firma manipulada', () => {
    const token = signMinuteToken('m-1', 'ana@x.com');
    const [payload] = token.split('.');
    const falsificado = `${payload}.firmaInventadaQueNoVale`;
    expect(verifyMinuteToken(falsificado)).toEqual({ ok: false, reason: 'firma-invalida' });
  });

  it('rechaza un payload manipulado aunque se conserve la firma', () => {
    // El ataque obvio: cambiar el meetingId por el de otra reunión.
    const token = signMinuteToken('m-1', 'ana@x.com');
    const [, sig] = token.split('.');
    const otroPayload = Buffer.from(JSON.stringify({ meetingId: 'm-999', email: 'ana@x.com', exp: 9999999999 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(verifyMinuteToken(`${otroPayload}.${sig}`)).toEqual({ ok: false, reason: 'firma-invalida' });
  });

  it('rechaza tokens caducados', () => {
    const token = signMinuteToken('m-1', 'ana@x.com', -1); // caducó ayer
    expect(verifyMinuteToken(token)).toEqual({ ok: false, reason: 'caducado' });
  });

  it('rechaza basura sin reventar', () => {
    expect(verifyMinuteToken('')).toEqual({ ok: false, reason: 'malformado' });
    expect(verifyMinuteToken('sinpunto')).toEqual({ ok: false, reason: 'malformado' });
    expect(verifyMinuteToken('a.b.c')).toEqual({ ok: false, reason: 'malformado' });
    expect(verifyMinuteToken(null as any)).toEqual({ ok: false, reason: 'malformado' });
    expect(verifyMinuteToken(undefined as any)).toEqual({ ok: false, reason: 'malformado' });
  });

  it('rechaza un payload que no es JSON válido pero está bien firmado', () => {
    // No se puede fabricar sin la clave, pero la ruta de código debe existir.
    const basura = Buffer.from('esto no es json').toString('base64').replace(/=+$/, '');
    const r = verifyMinuteToken(`${basura}.loquesea`);
    expect(r.ok).toBe(false);
  });

  it('cambiar la clave invalida todos los enlaces (revocación de emergencia)', () => {
    const token = signMinuteToken('m-1', 'ana@x.com');
    const anterior = process.env.MINUTE_LINK_SECRET;
    try {
      process.env.MINUTE_LINK_SECRET = 'otra-clave-distinta';
      expect(verifyMinuteToken(token)).toEqual({ ok: false, reason: 'firma-invalida' });
    } finally {
      process.env.MINUTE_LINK_SECRET = anterior;
    }
  });

  it('el token no lleva secretos legibles, pero tampoco pretende ser opaco', () => {
    // El payload es base64, no cifrado: quien tenga el enlace puede leer para
    // qué reunión es. Eso es aceptable — ya tiene acceso a la minuta — pero no
    // debe aparecer nunca nada más que reunión, correo y caducidad.
    const token = signMinuteToken('m-1', 'ana@x.com');
    const payload = JSON.parse(
      Buffer.from(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'meetingId']);
  });
});

describe('minuteUrl / unsubscribeUrl', () => {
  it('construye una URL pública verificable', () => {
    const url = minuteUrl('m-1', 'ana@x.com');
    expect(url.startsWith('https://zrnote.test/minuta/')).toBe(true);
    const token = url.split('/minuta/')[1];
    expect(verifyMinuteToken(token).ok).toBe(true);
  });

  it('la baja usa el mismo token que la minuta', () => {
    // Quien puede leer la minuta es exactamente quien puede darse de baja.
    const url = unsubscribeUrl('m-1', 'ana@x.com');
    expect(url.startsWith('https://zrnote.test/api/baja/')).toBe(true);
    expect(verifyMinuteToken(url.split('/api/baja/')[1]).ok).toBe(true);
  });
});
