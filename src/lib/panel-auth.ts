import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Puerta del panel oculto de diagnóstico (`/panel`).
 *
 * A diferencia del resto de la app, `/panel` NO exige iniciar sesión: es una
 * página pública, escondida (no enlazada en ningún sitio) y protegida solo por
 * una CONTRASEÑA. Esa contraseña vive en la variable de entorno
 * `ADMIN_PASSWORD` y se comprueba SIEMPRE en el servidor — nunca viaja al
 * navegador ni aparece en el bundle.
 *
 * Fallo cerrado: si `ADMIN_PASSWORD` no está definida, el panel no existe (da
 * 404). Es más seguro no tener panel que tener uno sin clave.
 *
 * La cookie de sesión del panel no guarda la contraseña, sino un token
 * derivado de ella (sha256). Así, comparar la cookie es comparar dos hashes y
 * la clave en claro nunca se almacena en el navegador.
 */

export const PANEL_COOKIE = 'zr_panel';

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || '';
}

export function panelPasswordConfigured(): boolean {
  return adminPassword().length > 0;
}

/** Hash que se guarda en la cookie cuando la contraseña es correcta. */
export function expectedPanelToken(): string {
  return createHash('sha256').update(`zrnote-panel:${adminPassword()}`).digest('hex');
}

/** Comparación en tiempo constante, para no filtrar nada por el tiempo de respuesta. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** ¿La contraseña escrita en el formulario es la correcta? */
export function checkPanelPassword(input: string | null | undefined): boolean {
  if (!panelPasswordConfigured() || !input) return false;
  return safeEqual(input, adminPassword());
}

/** ¿El valor de la cookie corresponde a la contraseña actual? */
export function isValidPanelCookie(value: string | null | undefined): boolean {
  if (!panelPasswordConfigured() || !value) return false;
  return safeEqual(value, expectedPanelToken());
}
