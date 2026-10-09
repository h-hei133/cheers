import { isRecord } from '../../core/values/record.js';
export function boundedJson(text: string): Record<string, unknown> {
  if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error('Security report exceeds its 4 MiB limit.');
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error('Security report contains malformed JSON.'); }
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 100_000 || depth > 24) throw new Error('Security report exceeds structural limits.');
    if (Array.isArray(item)) for (const entry of item) visit(entry, depth + 1);
    else if (isRecord(item)) for (const [key, entry] of Object.entries(item)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Security report contains an unsupported field.');
      visit(entry, depth + 1);
    }
  };
  visit(value, 0); if (!isRecord(value)) throw new Error('Security report must be an object.'); return value;
}
