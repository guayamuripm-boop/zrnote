/**
 * Quién puede entrar al panel oculto de administración (/dashboard/admin).
 *
 * No hay sistema de roles en la app, así que el acceso se decide por el CORREO
 * de la cuenta con la que la persona ya inició sesión. La lista vive en la
 * variable de entorno `ADMIN_EMAILS` (correos separados por comas), que se
 * controla desde Vercel y nunca viaja al navegador.
 *
 * Si la lista está vacía, nadie es admin y el panel da 404 para todos — es más
 * seguro fallar cerrado que abierto. Por eso tampoco hay una contraseña en la
 * URL: una clave compartida se filtra; tu cuenta, protegida por tu login, no.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = adminEmails();
  return list.length > 0 && list.includes(email.trim().toLowerCase());
}
