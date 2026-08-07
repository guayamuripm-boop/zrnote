import { describe, it, expect, afterEach } from 'vitest';
import { appUrl } from '@/lib/app-url';

const original = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

function restore(name: keyof typeof original) {
  if (original[name] === undefined) delete process.env[name];
  else process.env[name] = original[name];
}

afterEach(() => {
  restore('VERCEL_ENV');
  restore('VERCEL_URL');
  restore('NEXT_PUBLIC_APP_URL');
});

describe('appUrl', () => {
  it('en una vista previa usa el dominio de ESA vista previa', () => {
    // Sin esto, un despliegue de prueba manda correos con enlaces que apuntan a
    // producción —donde el código nuevo aún no está—, el enlace da 404 y parece
    // que la función está rota cuando lo que falla es la prueba.
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'zrnote-git-rama-usuario.vercel.app';
    process.env.NEXT_PUBLIC_APP_URL = 'https://zrnote.vercel.app';
    expect(appUrl()).toBe('https://zrnote-git-rama-usuario.vercel.app');
  });

  it('en producción usa el dominio real, no VERCEL_URL', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'zrnote-abc123.vercel.app';
    process.env.NEXT_PUBLIC_APP_URL = 'https://zrnote.vercel.app';
    expect(appUrl()).toBe('https://zrnote.vercel.app');
  });

  it('fuera de Vercel usa NEXT_PUBLIC_APP_URL', () => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3100';
    expect(appUrl()).toBe('http://localhost:3100');
  });

  it('sin nada configurado cae al dominio conocido', () => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appUrl()).toBe('https://zrnote.vercel.app');
  });

  it('una vista previa sin VERCEL_URL no se queda sin URL', () => {
    process.env.VERCEL_ENV = 'preview';
    delete process.env.VERCEL_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://zrnote.vercel.app';
    expect(appUrl()).toBe('https://zrnote.vercel.app');
  });
});
