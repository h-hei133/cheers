import { compareCodeUnits, formatSpanErrorStatus, queryStoredTraces } from "./query.js";

/**
 * OTel-compatible lightweight Span, TracePropagation, and InMemoryTraceStore
 * (microsecond-resolution anchored clock, post-settlement inertness, and bounded storage).
 */

export type AttributeValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly boolean[];

export interface SpanAttributes {
  [name: string]: AttributeValue | undefined;
}

export type TelemetryCarrier = Record<string, string>;

export interface TelemetryPropagation {
  inject(context: TelemetryContext): TelemetryCarrier | undefined;
  extract(carrier: TelemetryCarrier | undefined): TelemetryContext;
}

export interface SpanLink {
  readonly context: TelemetryContext;
  readonly attributes?: SpanAttributes;
}

export interface SpanOptions {
  readonly name: string;
  readonly attributes?: SpanAttributes;
  readonly links?: readonly SpanLink[];
}

export type SpanStatus =
  | { readonly status: "ok" }
  | { readonly status: "error"; readonly error?: { readonly name: string; readonly message: string } };

export interface StoredSpanEvent {
  readonly name: string;
  readonly timeMs: number;
  readonly attributes: SpanAttributes;
}

export interface StoredSpanLink {
  readonly traceId: string;
  readonly spanId: string;
  readonly attributes?: SpanAttributes;
}

export interface StoredSpan {
  readonly id: string;
  readonly traceId: string;
  readonly parentId?: string;
  readonly name: string;
  readonly startedMs: number;
  readonly endedMs: number;
  readonly attributes: SpanAttributes;
  readonly events: readonly StoredSpanEvent[];
  readonly links: readonly StoredSpanLink[];
  readonly status: SpanStatus;
}

export interface StoredTrace {
  readonly traceId: string;
  readonly spans: readonly StoredSpan[];
}

export interface TraceQuery {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  readonly errors?: true;
  readonly startMin?: number;
  readonly startMax?: number;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface TelemetryStore {
  findTraces(query?: TraceQuery): Promise<{ readonly traces: readonly StoredTrace[]; readonly cursor?: string }>;
  getTrace(traceId: string): Promise<StoredTrace | undefined>;
}

export interface TelemetryContext {
  readonly propagation?: TelemetryPropagation;
  startSpan<T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T>;
}

export interface TelemetrySpan extends TelemetryContext {
  addLink(link: SpanLink): void;
  addEvent(name: string, attributes?: SpanAttributes): void;
  setAttributes(attributes: SpanAttributes): void;
  setStatus(status: SpanStatus): void;
}

const TOLERANCE_MS = 10;
let clockAnchor = performance.timeOrigin;

export function telemetryNow(): number {
  const clock = performance.now();
  const wall = Date.now();
  if (Math.abs(clockAnchor + clock - wall) > TOLERANCE_MS) clockAnchor = wall - clock;
  return Math.round((clockAnchor + clock) * 1000) / 1000;
}

function copyAttributes(attributes?: SpanAttributes): SpanAttributes {
  const out: Record<string, AttributeValue> = {};
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (value === undefined) continue;
    out[name] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}

function copyStatus(status: SpanStatus): SpanStatus {
  if (status.status === "ok") return { status: "ok" };
  return status.error
    ? { status: "error", error: { name: status.error.name, message: status.error.message } }
    : { status: "error" };
}

function runInertSpan<T>(
  propagation: TelemetryPropagation | undefined,
  callback: (span: TelemetrySpan) => T | Promise<T>,
): Promise<T> {
  const noop = (): void => {};
  const inert: TelemetrySpan = {
    propagation,
    startSpan: (_opts, child) => runInertSpan(propagation, child),
    addLink: noop,
    addEvent: noop,
    setAttributes: noop,
    setStatus: noop,
  };
  return Promise.resolve().then(() => callback(inert));
}

interface InternalRef {
  readonly traceId: string;
  readonly spanId: string;
  readonly settledRef?: { readonly settled: boolean };
}

export class InMemoryTraceStore implements TelemetryContext, TelemetryPropagation, TelemetryStore {
  readonly #spans: StoredSpan[] = [];
  readonly #refs = new WeakMap<TelemetryContext, InternalRef>();
  readonly #maxSpans: number;
  readonly #onSpanSettled?: (span: StoredSpan) => void;
  #nextTrace = 1;
  #nextSpan = 1;

  readonly propagation: TelemetryPropagation = this;

  constructor(options: { readonly maxSpans?: number; readonly onSpanSettled?: (span: StoredSpan) => void } = {}) {
    this.#maxSpans = Math.max(10, options.maxSpans ?? 2000);
    this.#onSpanSettled = options.onSpanSettled;
  }

  inject(context: TelemetryContext): TelemetryCarrier | undefined {
    const ref = this.#refs.get(context);
    return ref ? { "cheers-trace-id": ref.traceId, "cheers-span-id": ref.spanId } : undefined;
  }

  extract(carrier: TelemetryCarrier | undefined): TelemetryContext {
    const traceId = carrier?.["cheers-trace-id"];
    const spanId = carrier?.["cheers-span-id"];
    if (!traceId || !spanId) return this;
    const extracted: TelemetryContext = {
      propagation: this,
      startSpan: (options, callback) => this.#runSpan({ traceId, spanId }, options, callback),
    };
    this.#refs.set(extracted, { traceId, spanId });
    return extracted;
  }

  startSpan<T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
    return this.#runSpan(undefined, options, callback);
  }

  snapshot(): readonly StoredSpan[] {
    return [...this.#spans];
  }

  async findTraces(query?: TraceQuery): Promise<{ readonly traces: readonly StoredTrace[]; readonly cursor?: string }> {
    return queryStoredTraces(this.#spans, query);
  }

  async getTrace(traceId: string): Promise<StoredTrace | undefined> {
    const spans = this.#spans
      .filter((s) => s.traceId === traceId)
      .sort((a, b) => a.startedMs - b.startedMs || compareCodeUnits(a.id, b.id));
    return spans.length > 0 ? { traceId, spans } : undefined;
  }

  async #runSpan<T>(
    parent: InternalRef | undefined,
    options: SpanOptions,
    callback: (span: TelemetrySpan) => T | Promise<T>,
  ): Promise<T> {
    if (parent?.settledRef?.settled) {
      return runInertSpan(this, callback);
    }

    const traceId = parent?.traceId ?? `trace_${(this.#nextTrace++).toString(16).padStart(16, "0")}`;
    const spanId = `span_${(this.#nextSpan++).toString(16).padStart(12, "0")}`;
    const startedMs = telemetryNow();
    const state = { settled: false };
    const attrs = copyAttributes(options.attributes);
    const events: StoredSpanEvent[] = [];
    const links: StoredSpanLink[] = [];
    let status: SpanStatus = { status: "ok" };
    let explicitStatus = false;

    const recordLink = (link: SpanLink): void => {
      const target = this.#refs.get(link.context);
      if (!target) return;
      links.push({
        traceId: target.traceId,
        spanId: target.spanId,
        ...(link.attributes ? { attributes: copyAttributes(link.attributes) } : {}),
      });
    };
    for (const initialLink of options.links ?? []) recordLink(initialLink);

    const selfRef: InternalRef = { traceId, spanId, settledRef: state };
    const span: TelemetrySpan = {
      propagation: this,
      startSpan: (childOpts, childCb) => this.#runSpan(selfRef, childOpts, childCb),
      addLink: (link) => { if (!state.settled) recordLink(link); },
      addEvent: (name, eventAttrs) => {
        if (state.settled) return;
        events.push({ name, timeMs: Math.max(0, Math.round((telemetryNow() - startedMs) * 1000) / 1000), attributes: copyAttributes(eventAttrs) });
      },
      setAttributes: (nextAttrs) => { if (!state.settled) Object.assign(attrs, copyAttributes(nextAttrs)); },
      setStatus: (nextStatus) => { if (!state.settled) { explicitStatus = true; status = copyStatus(nextStatus); } },
    };
    this.#refs.set(span, selfRef);

    try {
      return await callback(span);
    } catch (err) {
      if (!explicitStatus) status = formatSpanErrorStatus(err);
      throw err;
    } finally {
      state.settled = true;
      const recorded: StoredSpan = {
        id: spanId,
        traceId,
        ...(parent?.spanId ? { parentId: parent.spanId } : {}),
        name: options.name,
        startedMs,
        endedMs: telemetryNow(),
        attributes: attrs,
        events,
        links,
        status,
      };
      this.#spans.push(recorded);
      if (this.#spans.length > this.#maxSpans) {
        this.#spans.splice(0, this.#spans.length - this.#maxSpans);
      }
      this.#onSpanSettled?.(recorded);
    }
  }
}
