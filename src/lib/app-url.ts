/**
 * La URL base de ESTE despliegue, para construir enlaces que van dentro de un
 * correo.
 *
 * Estaba repetida en cuatro archivos (`email-service`, `meeting-emails`,
 * `minute-links`, `reminders`), cada uno con su propia copia de la constante.
 *
 * Por qué importa el orden:
 *
 * 1. **Vista previa de Vercel** → `VERCEL_URL`, el dominio de ESA vista previa.
 *    Es lo que permite probar de verdad: sin esto, un despliegue de prueba
 *    manda correos con enlaces que apuntan a producción —donde el código nuevo
 *    todavía no está—, así que el enlace da 404 y parece que la función está
 *    rota cuando lo que falla es la prueba.
 * 2. **Producción** → `NEXT_PUBLIC_APP_URL`, el dominio de verdad.
 * 3. Como último recurso, el dominio conocido.
 *
 * `VERCEL_ENV` sólo vale 'preview' en las vistas previas, así que producción
 * nunca cae en el primer caso.
 */
export function appUrl(): string {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';
}
