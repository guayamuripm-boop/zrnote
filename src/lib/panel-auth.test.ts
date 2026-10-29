import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  checkPanelPassword,
  isValidPanelCookie,
  expectedPanelToken,
  panelPasswordConfigured,
} from './panel-auth';

const ORIGINAL = process.env.ADMIN_PASSWORD;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = ORIGINAL;
});

describe('panel-auth', () => {
  describe('sin contraseña configurada (fallo cerrado)', () => {
    beforeEach(() => { delete process.env.ADMIN_PASSWORD; });

    it('el panel no está habilitado', () => {
      expect(panelPasswordConfigured()).toBe(false);
    });
    it('ninguna contraseña pasa', () => {
      expect(checkPanelPassword('loquesea')).toBe(false);
      expect(checkPanelPassword('')).toBe(false);
    });
    it('ninguna cookie es válida', () => {
      expect(isValidPanelCookie('cualquier-token')).toBe(false);
    });
  });

  describe('con contraseña configurada', () => {
    beforeEach(() => { process.env.ADMIN_PASSWORD = 'clave-super-larga-123'; });

    it('acepta la contraseña correcta y rechaza las demás', () => {
      expect(checkPanelPassword('clave-super-larga-123')).toBe(true);
      expect(checkPanelPassword('clave-super-larga-124')).toBe(false);
      expect(checkPanelPassword('')).toBe(false);
      expect(checkPanelPassword(null)).toBe(false);
    });

    it('la cookie válida es el token derivado, no la contraseña en claro', () => {
      expect(isValidPanelCookie(expectedPanelToken())).toBe(true);
      // La contraseña en claro NO sirve como cookie: la cookie guarda el hash.
      expect(isValidPanelCookie('clave-super-larga-123')).toBe(false);
      expect(expectedPanelToken()).not.toContain('clave-super-larga-123');
    });

    it('un token de otra contraseña no vale', () => {
      const good = expectedPanelToken();
      process.env.ADMIN_PASSWORD = 'otra-clave-distinta';
      expect(isValidPanelCookie(good)).toBe(false);
    });
  });
});
