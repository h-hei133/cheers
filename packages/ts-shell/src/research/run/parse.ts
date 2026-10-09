import { parseResponseJson } from '../../core/network/response.js';
import { validateToolArguments } from '../../core/tools/arguments.js';
import { isRecord } from '../../core/values/record.js';

export function parseResearchOutput<T>(text: string, schema: Record<string, unknown>): T {
  if (Buffer.byteLength(text) > 96000) throw new Error('Research stage output exceeded its bound.');
  const value = parseResponseJson(text.trim(), 16);
  if (!isRecord(value)) throw new Error('Research stage output must be a JSON object.');
  try { validateToolArguments(schema, value); }
  catch { throw new Error('Research stage output does not match its schema.'); }
  return value as unknown as T;
}
