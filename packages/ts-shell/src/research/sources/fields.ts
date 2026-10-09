import { isRecord } from '../../core/values/record.js';
import { NetworkError } from '../../core/network/error.js';

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new NetworkError('invalid_response');
  return value;
}
export function optionalText(value: unknown, max = 16000): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}
export function requiredText(value: unknown, max = 4096): string {
  const text = optionalText(value, max);
  if (!text) throw new NetworkError('invalid_response');
  return text;
}
export function array(value: unknown, limit = 100): readonly unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new NetworkError('invalid_response');
  return value;
}
export function publicLocator(value: unknown): string | undefined {
  const text = optionalText(value, 4096);
  if (!text) return undefined;
  try { const url = new URL(text); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
export function doi(value: unknown): string | undefined {
  const text = optionalText(value);
  const normalized = text?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase();
  return normalized && /^10\.\d{4,9}\/[^\s]+$/.test(normalized) ? normalized : undefined;
}
export function arxiv(value: unknown): string | undefined {
  const text = optionalText(value)?.replace(/^https?:\/\/(?:export\.)?arxiv\.org\/(?:abs|pdf)\//i, '').replace(/\.pdf$/i, '');
  return text && /^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]+\/\d{7})(?:v\d+)?$/i.test(text) ? text : undefined;
}
