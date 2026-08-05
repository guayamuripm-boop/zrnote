import { describe, it, expect } from 'vitest';
import { htmlToPlainText, isEmailConfigured, EMAIL_NOT_CONFIGURED } from '@/lib/smtp';

describe('htmlToPlainText', () => {
  it('quita las etiquetas y deja el texto', () => {
    expect(htmlToPlainText('<p>Hola <b>Ana</b></p>')).toBe('Hola Ana');
  });

  it('conserva el destino de los enlaces', () => {
    // Un correo en texto plano sin las URLs es inservible: el lector no puede
    // llegar a la minuta ni añadir nada al calendario.
    const out = htmlToPlainText('<a href="https://zrnote.app/m/1">Ver en ZRNote</a>');
    expect(out).toContain('Ver en ZRNote');
    expect(out).toContain('https://zrnote.app/m/1');
  });

  it('convierte las listas en guiones', () => {
    const out = htmlToPlainText('<ul><li>Uno</li><li>Dos</li></ul>');
    expect(out).toContain('- Uno');
    expect(out).toContain('- Dos');
  });

  it('separa los bloques en líneas', () => {
    const out = htmlToPlainText('<p>Primero</p><p>Segundo</p>');
    expect(out.split('\n').filter(Boolean)).toEqual(['Primero', 'Segundo']);
  });

  it('descarta estilos y scripts enteros', () => {
    const out = htmlToPlainText('<style>p{color:red}</style><script>alert(1)</script><p>Texto</p>');
    expect(out).toBe('Texto');
  });

  it('deshace las entidades HTML', () => {
    // El HTML lleva el contenido del LLM escapado; en texto plano hay que
    // devolverlo a su forma legible.
    expect(htmlToPlainText('<p>Ana &amp; Luis &lt;equipo&gt;</p>')).toBe('Ana & Luis <equipo>');
  });

  it('no deja líneas en blanco de más', () => {
    const out = htmlToPlainText('<p>A</p><div></div><div></div><p>B</p>');
    expect(out).not.toMatch(/\n\n\n/);
  });

  it('aguanta un HTML vacío', () => {
    expect(htmlToPlainText('')).toBe('');
  });
});

describe('isEmailConfigured', () => {
  it('exige las dos variables', () => {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    try {
      delete process.env.GMAIL_USER;
      delete process.env.GMAIL_APP_PASSWORD;
      expect(isEmailConfigured()).toBe(false);

      process.env.GMAIL_USER = 'a@b.com';
      expect(isEmailConfigured()).toBe(false); // falta la contraseña

      process.env.GMAIL_APP_PASSWORD = 'secreto';
      expect(isEmailConfigured()).toBe(true);
    } finally {
      if (user === undefined) delete process.env.GMAIL_USER;
      else process.env.GMAIL_USER = user;
      if (pass === undefined) delete process.env.GMAIL_APP_PASSWORD;
      else process.env.GMAIL_APP_PASSWORD = pass;
    }
  });

  it('tiene un único mensaje de error para toda la app', () => {
    // Estaba repetido en tres sitios con tres textos distintos.
    expect(EMAIL_NOT_CONFIGURED).toContain('GMAIL_USER');
    expect(EMAIL_NOT_CONFIGURED).toContain('GMAIL_APP_PASSWORD');
  });
});
