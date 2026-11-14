import type { SpanStatus, StoredSpan, StoredTrace, TraceQuery } from "./span.js";

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f-\u009f]/g;

export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function escapeTraceControl(value: string): string {
  return value.replace(CONTROL_CHAR_RE, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function formatSpanErrorStatus(err: unknown): SpanStatus {
  if (err instanceof Error) {
    return { status: "error", error: { name: err.name || "Error", message: err.message } };
  }
  return { status: "error", error: { name: "Error", message: String(err) } };
}

function matchesAttributeFilter(
  span: StoredSpan,
  filter: Readonly<Record<string, string | number | boolean>>,
): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (span.attributes[key] !== expected) return false;
  }
  return true;
}

function groupTraces(spans: readonly StoredSpan[]): StoredTrace[] {
  const byTrace = new Map<string, StoredSpan[]>();
  for (const span of spans) {
    let list = byTrace.get(span.traceId);
    if (!list) {
      list = [];
      byTrace.set(span.traceId, list);
    }
    list.push(span);
  }
  const traces: StoredTrace[] = [];
  for (const [traceId, items] of byTrace) {
    const sorted = [...items].sort((a, b) => a.startedMs - b.startedMs || compareCodeUnits(a.id, b.id));
    traces.push({ traceId, spans: sorted });
  }
  return traces.sort((a, b) => {
    const firstA = a.spans[0]!;
    const firstB = b.spans[0]!;
    return firstB.startedMs - firstA.startedMs || compareCodeUnits(b.traceId, a.traceId);
  });
}

export function queryStoredTraces(
  spans: readonly StoredSpan[],
  query: TraceQuery = {},
): { readonly traces: readonly StoredTrace[]; readonly cursor?: string } {
  const limit = Math.max(1, Math.min(200, query.limit ?? 20));
  let cursorStart: number | undefined;
  let cursorTraceId: string | undefined;
  if (query.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as [number, string];
      if (typeof parsed[0] === "number" && Number.isFinite(parsed[0]) && typeof parsed[1] === "string") {
        cursorStart = parsed[0];
        cursorTraceId = parsed[1];
      }
    } catch {
      // Ignore invalid cursor and return from start.
    }
  }

  const filtered = groupTraces(spans).filter((trace) => {
    const earliest = trace.spans[0]!;
    if (query.name !== undefined && earliest.name !== query.name) return false;
    if (query.startMin !== undefined && earliest.startedMs < query.startMin) return false;
    if (query.startMax !== undefined && earliest.startedMs > query.startMax) return false;
    if (query.errors && !trace.spans.some((s) => s.status.status === "error")) return false;
    if (query.attributes && !trace.spans.some((s) => matchesAttributeFilter(s, query.attributes!))) return false;
    if (cursorStart !== undefined && cursorTraceId !== undefined) {
      if (earliest.startedMs > cursorStart) return false;
      if (earliest.startedMs === cursorStart && compareCodeUnits(trace.traceId, cursorTraceId) >= 0) return false;
    }
    return true;
  });

  const page = filtered.slice(0, limit);
  const nextCursor =
    filtered.length > limit && page.length > 0
      ? Buffer.from(JSON.stringify([page.at(-1)!.spans[0]!.startedMs, page.at(-1)!.traceId]), "utf8").toString("base64url")
      : undefined;
  return { traces: page, ...(nextCursor ? { cursor: nextCursor } : {}) };
}

export function renderTrace(spans: readonly StoredSpan[]): string {
  return spans
    .map((span) => {
      const dur = Math.max(0, span.endedMs - span.startedMs).toFixed(3);
      const statusText = span.status.status === "error"
        ? `ERROR(${escapeTraceControl(span.status.error?.message ?? "unknown")})`
        : "OK";
      return `${escapeTraceControl(span.traceId)} ${escapeTraceControl(span.id)} ${escapeTraceControl(span.name)} ${dur}ms [${statusText}]`;
    })
    .join("\n");
}
