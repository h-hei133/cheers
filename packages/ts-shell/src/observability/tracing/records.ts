import type { AttributeValue, SpanAttributes, SpanStatus, StoredSpan } from './types.js';
import type { StructuredLogEntry } from '../types.js';

export const MAX_SPAN_BYTES = 32 * 1024;
export const MAX_SPAN_ATTRIBUTES = 32;
export const MAX_SPAN_EVENTS = 16;
export const MAX_SPAN_LINKS = 8;

export function copyAttributes(attributes?: SpanAttributes, limit = MAX_SPAN_ATTRIBUTES): SpanAttributes {
  const result: Record<string, AttributeValue> = Object.create(null) as Record<string, AttributeValue>;
  for (const [name, value] of Object.entries(attributes ?? {}).slice(0, limit)) {
    const key = name.slice(0, 96);
    if (typeof value === 'string') result[key] = value.slice(0, 256);
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) result[key] = value;
    else if (Array.isArray(value)) {
      const items = value.slice(0, 16);
      if (items.every(item => typeof item === 'string')) result[key] = items.map(item => (item as string).slice(0, 128));
      else if (items.every(item => typeof item === 'boolean')) result[key] = [...items] as boolean[];
      else if (items.every(item => typeof item === 'number' && Number.isFinite(item))) result[key] = [...items] as number[];
    }
  }
  return result;
}

export function copyStatus(status: SpanStatus): SpanStatus {
  return status.status === 'ok' ? { status: 'ok' } : { status: 'error', ...(status.error ? {
    error: { name: status.error.name.slice(0, 96), message: status.error.message.slice(0, 256) },
  } : {}) };
}

/** Detached results also bound a single record, beyond the recorder's count limit. */
export function copyStoredSpan(span: StoredSpan): StoredSpan {
  let result: StoredSpan = {
    id: span.id, traceId: span.traceId, ...(span.parentId ? { parentId: span.parentId } : {}),
    name: span.name.slice(0, 128), startedMs: span.startedMs, endedMs: span.endedMs, attributes: copyAttributes(span.attributes),
    status: copyStatus(span.status),
    events: span.events.slice(0, MAX_SPAN_EVENTS).map(event => ({
      name: event.name.slice(0, 96), timeMs: event.timeMs, attributes: copyAttributes(event.attributes, 8),
    })),
    links: span.links.slice(0, MAX_SPAN_LINKS).map(link => ({
      traceId: link.traceId, spanId: link.spanId, ...(link.attributes ? { attributes: copyAttributes(link.attributes, 4) } : {}),
    })),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_SPAN_BYTES) {
    const scalars = Object.fromEntries(Object.entries(result.attributes).filter(([, value]) => !Array.isArray(value)).slice(0, 8));
    result = { ...result, events: [], links: [], attributes: { ...scalars, 'telemetry.truncated': true } };
  }
  return result;
}

function validAttributes(value: unknown): value is SpanAttributes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_SPAN_ATTRIBUTES && entries.every(([key, item]) => key.length <= 96 && (
    (typeof item === 'string' && item.length <= 256) || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)) ||
    (Array.isArray(item) && item.length <= 16 && (item.every(v => typeof v === 'string' && v.length <= 128) ||
      item.every(v => typeof v === 'boolean') || item.every(v => typeof v === 'number' && Number.isFinite(v))))
  ));
}

/** Validate nested data before query/render consumers can observe persisted input. */
export function isValidStoredSpan(value: unknown): value is StoredSpan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const span = value as Partial<StoredSpan>;
  if (typeof span.id !== 'string' || !/^[0-9a-f]{16}$/.test(span.id) ||
    typeof span.traceId !== 'string' || !/^[0-9a-f]{32}$/.test(span.traceId) ||
    (span.parentId !== undefined && (typeof span.parentId !== 'string' || !/^[0-9a-f]{16}$/.test(span.parentId))) ||
    typeof span.name !== 'string' || span.name.length > 128 || typeof span.startedMs !== 'number' || !Number.isFinite(span.startedMs) ||
    typeof span.endedMs !== 'number' || !Number.isFinite(span.endedMs) || !validAttributes(span.attributes)) return false;
  if (!span.status || (span.status.status !== 'ok' && span.status.status !== 'error')) return false;
  if (span.status.status === 'error' && span.status.error &&
    (typeof span.status.error.name !== 'string' || typeof span.status.error.message !== 'string')) return false;
  if (!Array.isArray(span.events) || span.events.length > MAX_SPAN_EVENTS || !span.events.every(event => event && typeof event.name === 'string' &&
    typeof event.timeMs === 'number' && Number.isFinite(event.timeMs) && validAttributes(event.attributes))) return false;
  return Array.isArray(span.links) && span.links.length <= MAX_SPAN_LINKS && span.links.every(link => link && typeof link.traceId === 'string' &&
    /^[0-9a-f]{32}$/.test(link.traceId) && typeof link.spanId === 'string' && /^[0-9a-f]{16}$/.test(link.spanId) &&
    (link.attributes === undefined || validAttributes(link.attributes)));
}

export function isStoredSpanLog(entry: StructuredLogEntry): entry is StructuredLogEntry & { fields: { storedSpan: StoredSpan } } {
  return entry.component === 'span' && isValidStoredSpan(entry.fields.storedSpan);
}
