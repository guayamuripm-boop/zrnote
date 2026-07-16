// ZRNote — Utilidades de validación y parsing
// Centraliza todas las zod schemas + helpers de parsing para evitar duplicación

import { z } from 'zod';

// === Schemas reutilizables ===

export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email().max(254);

export const PrioritySchema = z.enum(['alta', 'media', 'baja']);
export const MeetingStatusSchema = z.enum([
  'scheduled', 'recording', 'processing', 'completed', 'failed', 'archived',
]);
export const MeetingTypeSchema = z.enum(['presencial', 'virtual', 'llamada']);
export const ProcessingStepSchema = z.enum(['transcribe', 'analyze', 'vectorize', 'emails']);

// === Helpers ===

export function safeJsonParse<T = unknown>(text: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * Intenta extraer el primer bloque JSON válido de un string (el LLM a veces envuelve
 * la respuesta en texto adicional). Retorna null si no encuentra nada parseable.
 */
export function extractFirstJson<T = unknown>(text: string): T | null {
  // Intento 1: parse directo
  const direct = safeJsonParse<T>(text);
  if (direct !== undefined) return direct;

  // Intento 2: buscar primer bloque {...} o [...]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const inner = safeJsonParse<T>(fenced[1].trim());
    if (inner !== undefined) return inner;
  }

  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) {
    const inner = safeJsonParse<T>(match[1]);
    if (inner !== undefined) return inner;
  }

  return null;
}

/**
 * Sanitiza string para uso en ICS DESCRIPTION (escapa \, ;, ,, \n).
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Valida que la fecha tenga formato YYYY-MM-DD; devuelve null si no.
 */
export function parseDateOrNull(dateStr: unknown): string | null {
  if (typeof dateStr !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00.000Z');
  if (isNaN(d.getTime())) return null;
  return dateStr;
}
