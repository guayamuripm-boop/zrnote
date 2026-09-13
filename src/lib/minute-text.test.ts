import { describe, it, expect } from 'vitest';
import {
  toText,
  toTextList,
  toBlockers,
  toProjectStatuses,
  toDiscussion,
  normalizeMinuteSections,
} from '@/lib/minute-text';

// The bug behind these: a model answered `ideas: [{idea: "..."}]` instead of
// `ideas: ["..."]`, React threw "Objects are not valid as a React child", and
// the error boundary took down the WHOLE meeting page — acta intact in the
// database, completely unreachable, "Algo salió mal" the only clue.
//
// So the contract asserted here is blunt: nothing these functions return is
// ever an object, whatever they are handed.

describe('toText', () => {
  it('passes a plain string through, trimmed', () => {
    expect(toText('  hola  ')).toBe('hola');
  });

  it('unwraps the shape that caused the crash', () => {
    expect(toText({ idea: 'Probar un piloto' })).toBe('Probar un piloto');
  });

  it('keeps the qualifier instead of dropping half of what was said', () => {
    expect(toText({ step: 'Enviar informe', owner: 'Ana' })).toBe('Enviar informe — Ana');
  });

  it('never produces "[object Object]" for an unrecognised shape', () => {
    const out = toText({ foo: 'uno', bar: 'dos' });
    expect(out).not.toContain('[object');
    expect(out).toContain('uno');
    expect(out).toContain('dos');
  });

  it('handles null, undefined and empty objects without throwing', () => {
    expect(toText(null)).toBe('');
    expect(toText(undefined)).toBe('');
    expect(toText({})).toBe('');
  });

  it('flattens a nested array rather than returning one', () => {
    expect(toText(['a', 'b'])).toBe('a, b');
  });

  it('renders numbers and booleans instead of swallowing them', () => {
    expect(toText(3)).toBe('3');
    expect(toText(false)).toBe('false');
  });
});

describe('toTextList', () => {
  it('leaves a correct string array alone', () => {
    expect(toTextList(['uno', 'dos'])).toEqual(['uno', 'dos']);
  });

  it('rescues the array of wrapped objects that crashed the page', () => {
    expect(toTextList([{ idea: 'Piloto' }, { idea: 'Encuesta' }])).toEqual(['Piloto', 'Encuesta']);
  });

  it('accepts a bare string where a list was expected', () => {
    expect(toTextList('una sola idea')).toEqual(['una sola idea']);
  });

  it('drops empties instead of rendering blank bullets', () => {
    expect(toTextList(['uno', '', '   ', null, undefined])).toEqual(['uno']);
  });

  it('returns [] for null, undefined and non-arrays that carry nothing', () => {
    expect(toTextList(null)).toEqual([]);
    expect(toTextList(undefined)).toEqual([]);
    expect(toTextList({})).toEqual([]);
  });

  it('never returns a non-string element, whatever it is given', () => {
    const nasty = [{ a: { b: 'c' } }, [1, 2], 'ok', 7, { idea: 'x' }];
    for (const item of toTextList(nasty)) {
      expect(typeof item).toBe('string');
    }
  });
});

describe('object-shaped sections', () => {
  it('accepts a bare string where a blocker object was expected', () => {
    expect(toBlockers(['falta presupuesto'])).toEqual([
      { issue: 'falta presupuesto', impact: '', owner: '' },
    ]);
  });

  it('coerces every blocker field to a string', () => {
    const [b] = toBlockers([{ issue: { text: 'Sin acceso' }, impact: ['retrasa', 'bloquea'], owner: null }]);
    expect(typeof b.issue).toBe('string');
    expect(typeof b.impact).toBe('string');
    expect(typeof b.owner).toBe('string');
    expect(b.issue).toBe('Sin acceso');
  });

  it('drops entries with nothing to show rather than rendering empty cards', () => {
    expect(toBlockers([{}, { issue: '' }])).toEqual([]);
    expect(toProjectStatuses([{}])).toEqual([]);
  });

  it('normalises project statuses and discussion the same way', () => {
    expect(toProjectStatuses([{ project: 'App', status: 'en curso', details: 'sprint 3' }])).toEqual([
      { project: 'App', status: 'en curso', details: 'sprint 3' },
    ]);
    expect(toDiscussion(['Presupuesto'])).toEqual([{ topic: 'Presupuesto', speaker: '', details: '' }]);
  });

  it('returns [] when the field is not an array at all', () => {
    expect(toBlockers('nope' as unknown)).toEqual([]);
    expect(toDiscussion(null)).toEqual([]);
  });
});

describe('normalizeMinuteSections', () => {
  it('makes a minute full of wrong shapes completely safe to render', () => {
    const hostile = {
      summary: { text: 'Se revisó el avance.' },
      topics: [{ topic: 'Presupuesto' }],
      decisions: 'Se aprueba',
      changes: null,
      next_steps: [{ step: 'Enviar', owner: 'Ana' }],
      ideas: [{ idea: 'Piloto' }],
      blockers: ['sin acceso'],
      project_statuses: [{ project: 'App', status: 'ok' }],
      discussion: [{ topic: 'Costes', details: { text: 'suben' } }],
    };

    const out = normalizeMinuteSections(hostile);

    expect(typeof out.summary).toBe('string');
    for (const list of [out.topics, out.decisions, out.changes, out.nextSteps, out.ideas]) {
      for (const item of list) expect(typeof item).toBe('string');
    }
    expect(out.ideas).toEqual(['Piloto']);
    expect(out.decisions).toEqual(['Se aprueba']);
    expect(out.discussion[0].details).toBe('suben');
  });

  it('survives a null minute', () => {
    const out = normalizeMinuteSections(null);
    expect(out.summary).toBe('');
    expect(out.ideas).toEqual([]);
  });
});
