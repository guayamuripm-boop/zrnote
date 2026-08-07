import { describe, it, expect } from 'vitest';
import {
  htmlToPlainText,
  isEmailConfigured,
  EMAIL_NOT_CONFIGURED,
  unsubscribeHeaders,
  dailyEmailLimit,
} from '@/lib/smtp';

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

describe('unsubscribeHeaders', () => {
  it('apunta la baja al organizador', () => {
    const h = unsubscribeHeaders('jefe@empresa.com');
    expect(h['List-Unsubscribe']).toContain('mailto:jefe@empresa.com');
  });

  it('no promete una baja que no existe si no hay organizador', () => {
    // Mejor sin cabecera que con una que no lleve a ninguna parte.
    expect(unsubscribeHeaders(undefined)).toEqual({});
    expect(unsubscribeHeaders('')).toEqual({});
  });

  it('no anuncia baja de un clic', () => {
    // List-Unsubscribe-Post exige responder a un POST y dar de baja de verdad.
    // Con un mailto sería mentir a Gmail, y eso penaliza más que no ponerlo.
    const h = unsubscribeHeaders('jefe@empresa.com');
    expect(h['List-Unsubscribe-Post']).toBeUndefined();
  });
});

describe('dailyEmailLimit', () => {
  it('por defecto son los 500/día de una cuenta Gmail gratuita', () => {
    const prev = process.env.EMAIL_DAILY_LIMIT;
    try {
      delete process.env.EMAIL_DAILY_LIMIT;
      expect(dailyEmailLimit()).toBe(500);
    } finally {
      if (prev === undefined) delete process.env.EMAIL_DAILY_LIMIT;
      else process.env.EMAIL_DAILY_LIMIT = prev;
    }
  });

  it('se puede subir a los 2.000 de Workspace sin tocar código', () => {
    const prev = process.env.EMAIL_DAILY_LIMIT;
    try {
      process.env.EMAIL_DAILY_LIMIT = '2000';
      expect(dailyEmailLimit()).toBe(2000);
    } finally {
      if (prev === undefined) delete process.env.EMAIL_DAILY_LIMIT;
      else process.env.EMAIL_DAILY_LIMIT = prev;
    }
  });

  it('ignora un valor absurdo y vuelve al defecto', () => {
    const prev = process.env.EMAIL_DAILY_LIMIT;
    try {
      process.env.EMAIL_DAILY_LIMIT = 'muchos';
      expect(dailyEmailLimit()).toBe(500);
      process.env.EMAIL_DAILY_LIMIT = '-5';
      expect(dailyEmailLimit()).toBe(500);
    } finally {
      if (prev === undefined) delete process.env.EMAIL_DAILY_LIMIT;
      else process.env.EMAIL_DAILY_LIMIT = prev;
    }
  });
});
