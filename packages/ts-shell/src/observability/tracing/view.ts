import { redactReportText } from '../../core/security/redaction.js';
import type { TraceRow } from '../diagnostics.js';
import type { StoredSpan, StoredTrace, TelemetryStore, TraceQuery } from './types.js';
import { sessionSpan } from './scope.js';
import { RESPONSE_ACCEPTED } from './operations.js';
import { MAX_SPAN_EVENTS, MAX_SPAN_LINKS } from './records.js';

const FILTER_BYTES = 1024;
const MAX_TRACE_PAGES = 4;

export interface ScopedTracePage {
  readonly traces: readonly StoredTrace[];
  readonly cursor?: string;
  readonly incomplete: boolean;
  readonly admitted: boolean;
}

/** Queries select retained records; a client cannot replace the captured scope. */
export function traceReadQuery(url: URL, sessionId: string | undefined): TraceQuery {
  const rawLimit = url.searchParams.get('limit');
  const parsedLimit = rawLimit === null ? 50 : Number(rawLimit);
  const limit = Number.isSafeInteger(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : 50;
  const name = url.searchParams.get('name');
  const cursor = url.searchParams.get('cursor');
  const attributes: Record<string, string | number | boolean> = sessionId === undefined ? {} : { sessionId };
  return Object.freeze({ limit,
    ...(name && Buffer.byteLength(name) <= FILTER_BYTES ? { name } : {}),
    ...(cursor && Buffer.byteLength(cursor) <= FILTER_BYTES ? { cursor } : {}),
    ...(url.searchParams.get('errors') === 'true' ? { errors: true as const } : {}),
    ...(Object.keys(attributes).length ? { attributes: Object.freeze(attributes) } : {}),
  });
}

/** Filter each bounded backend page before counting it toward the visible result window. */
export async function readScopedTracePage(
  store: TelemetryStore,
  query: TraceQuery,
  sessionId: string | undefined,
  workspaceRoot: string | undefined,
  admit: () => boolean = () => true,
): Promise<ScopedTracePage> {
  const limit = Math.max(1, Math.min(50, query.limit ?? 50));
  const traces = new Map<string, StoredTrace>();
  let cursor = query.cursor;
  let nextCursor: string | undefined;
  let exhausted = false;
  const seenCursors = new Set<string>();
  for (let pageIndex = 0; pageIndex < MAX_TRACE_PAGES && traces.size < limit; pageIndex += 1) {
    if (!admit()) return { traces: [], incomplete: true, admitted: false };
    const pageLimit = limit - traces.size;
    const page = await store.findTraces({ ...query, limit: pageLimit, ...(cursor ? { cursor } : {}) });
    if (!admit()) return { traces: [], incomplete: true, admitted: false };
    for (const trace of page.traces) {
      const spans = trace.spans.filter(span => sessionSpan(span, sessionId, workspaceRoot));
      if (spans.length === 0) continue;
      const existing = traces.get(trace.traceId);
      traces.set(trace.traceId, existing
        ? { traceId: trace.traceId, spans: [...existing.spans, ...spans] }
        : { traceId: trace.traceId, spans });
    }
    nextCursor = page.cursor;
    if (!page.cursor) { exhausted = true; break; }
    if (seenCursors.has(page.cursor) || page.cursor === cursor) {
      nextCursor = undefined;
      break;
    }
    seenCursors.add(page.cursor);
    if (traces.size >= limit) break;
    cursor = page.cursor;
  }
  return { traces: [...traces.values()], ...(nextCursor ? { cursor: nextCursor } : {}),
    incomplete: !exhausted, admitted: true };
}

function timestamp(value: number): string {
  return Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? new Date(value).toISOString() : '[invalid timestamp]';
}

export function spanRows(spans: readonly StoredSpan[], projectRoot: string): TraceRow[] {
  const safe = (value: string) => redactReportText(value, 240, { projectRoot });
  return spans.map(span => ({
    timestamp: timestamp(span.startedMs),
    traceId: safe(span.traceId), spanId: safe(span.id),
    requestId: typeof span.attributes.requestId === 'string' ? safe(span.attributes.requestId) : undefined,
    toolId: typeof span.attributes.toolCallId === 'string' ? safe(span.attributes.toolCallId) : undefined,
    durationMs: Number.isFinite(span.endedMs) && Number.isFinite(span.startedMs)
      ? Math.max(0, Math.round(span.endedMs - span.startedMs)) : undefined,
    component: safe(span.name),
    message: safe(span.status.status === 'error' ? span.status.error?.message ?? 'error' : String(span.attributes.outcome ?? 'settled')),
    ...(span.events.length ? { events: span.events.slice(0, MAX_SPAN_EVENTS).map(event => ({
      name: safe(event.name), timestamp: timestamp(span.startedMs + event.timeMs),
      ...(span.name === 'provider.request' && event.name === RESPONSE_ACCEPTED && typeof event.attributes.endpoint === 'string'
        ? { endpoint: safe(event.attributes.endpoint) } : {}),
    })) } : {}),
    ...(span.links.length ? { links: span.links.slice(0, MAX_SPAN_LINKS).map(link => ({
      traceId: safe(link.traceId), spanId: safe(link.spanId),
    })) } : {}),
  }));
}
