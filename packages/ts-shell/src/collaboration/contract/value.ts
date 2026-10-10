import { createHash } from 'node:crypto';

export class CollaborationError extends Error {
  constructor(readonly code: 'invalid' | 'denied' | 'stale' | 'busy' | 'capacity' | 'gap' | 'unknown' | 'unavailable') {
    super(`Collaboration ${code}.`); this.name = 'CollaborationError';
  }
}
export function requireValue(condition: unknown, code: CollaborationError['code'] = 'invalid'): asserts condition {
  if (!condition) throw new CollaborationError(code);
}
export function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown>;
}
export function text(value: unknown, max = 256): string {
  requireValue(typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)); return value;
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  requireValue(Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max); return Number(value);
}
export function identifier(value: unknown): string {
  const result = text(value, 128); requireValue(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(result)); return result;
}
export function uuid(value: unknown): string {
  const result = text(value, 36); requireValue(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(result)); return result;
}
export function keys(value: Record<string, unknown>, names: readonly string[]): void {
  requireValue(Object.keys(value).every(key => names.includes(key)));
}
export function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex'); }
export function hashText(value: string): string { return createHash('sha256').update(value).digest('hex'); }
/** Bytes and structural complexity are limited before domain decoding. */
export function parseJson(source: string, maxBytes: number, maxNodes = 8192): unknown {
  requireValue(Buffer.byteLength(source) <= maxBytes);
  let depth = 0; let quoted = false; let escaped = false; let nodes = 0;
  for (const character of source) {
    if (quoted) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === '"') quoted = false; }
    else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') { requireValue(++depth <= 16 && ++nodes <= maxNodes); }
    else if (character === '}' || character === ']') depth--;
  }
  try { return JSON.parse(source); } catch { throw new CollaborationError('invalid'); }
}
