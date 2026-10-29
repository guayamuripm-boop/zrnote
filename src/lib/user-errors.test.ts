import { describe, it, expect } from 'vitest';
import { userFacingProcessingError } from './user-errors';

// Lo que NUNCA puede aparecer en pantalla: proveedores, códigos HTTP, cuerpos
// crudos de la API, nombres de variables de entorno. Ese es el motivo de este
// archivo — el fallo real del cliente ("me decía algo de Groq").
const LEAKS = /groq|gemini|whisper|llama|http|\b4\d\d\b|\b5\d\d\b|api[_ ]?key|env|token/i;

describe('userFacingProcessingError', () => {
  const technicalReasons = [
    'Groq HTTP 429: {"error":{"message":"rate limit reached"}}',
    'Gemini → gemini-flash (429): RESOURCE_EXHAUSTED, limit: 0 | Groq → 413: Request too large',
    'GROQ_API_KEY no configurada',
    'fetch failed: ECONNRESET',
    '504: upstream gateway timeout',
    'algo inesperado sin patrón',
  ];

  it('nunca filtra tecnicismos al usuario, sea cual sea el motivo', () => {
    for (const reason of technicalReasons) {
      for (const phase of ['transcribe', 'analyze'] as const) {
        const msg = userFacingProcessingError(phase, reason);
        expect(msg, `filtró tecnicismo con motivo "${reason}"`).not.toMatch(LEAKS);
      }
    }
  });

  it('dice la acción que no salió según la fase', () => {
    expect(userFacingProcessingError('transcribe')).toMatch(/transcribir el audio/);
    expect(userFacingProcessingError('analyze')).toMatch(/generar la minuta/);
  });

  it('elige el tono "ocupado" ante un límite de uso', () => {
    expect(userFacingProcessingError('transcribe', 'HTTP 429 rate limit')).toMatch(/ocupado/i);
  });

  it('elige el tono "sin conexión" ante un corte de red', () => {
    expect(userFacingProcessingError('analyze', '504 gateway timeout')).toMatch(/conexión|señal/i);
  });

  it('siempre dice que el audio está a salvo', () => {
    for (const reason of technicalReasons) {
      expect(userFacingProcessingError('transcribe', reason)).toMatch(/guardad/i);
    }
  });
});
