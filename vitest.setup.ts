import '@testing-library/jest-dom';

// Clave de firma para los enlaces públicos de minuta. Se fija aquí para que las
// pruebas ejerciten el camino REAL (token firmado) y no el de degradación.
// El camino degradado —sin clave— se prueba explícitamente donde toca.
process.env.MINUTE_LINK_SECRET ||= 'clave-de-pruebas-no-usar-en-produccion';
process.env.NEXT_PUBLIC_APP_URL ||= 'https://zrnote.test';
