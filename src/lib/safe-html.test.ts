import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeHtmlOrEmpty } from '@/lib/safe-html';

describe('escapeHtml — XSS protection for LLM-derived email content', () => {
  it('escapes the five dangerous HTML characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#039;');
  });

  it('neutralizes a script-injection payload from LLM output', () => {
    const payload = '<script>alert("xss")</script>';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes & before other entities (no double-escaping)', () => {
    // "&lt;" typed by a user must become "&amp;lt;", not "&lt;"
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('coerces null/undefined/non-strings safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });

  it('escapeHtmlOrEmpty returns empty string for nullish input', () => {
    expect(escapeHtmlOrEmpty(null)).toBe('');
    expect(escapeHtmlOrEmpty(undefined)).toBe('');
    expect(escapeHtmlOrEmpty('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
});
