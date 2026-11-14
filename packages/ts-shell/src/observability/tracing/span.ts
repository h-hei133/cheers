import { randomBytes } from "node:crypto";
import { compareCodeUnits, formatSpanErrorStatus, queryStoredTraces } from "./query.js";
import { copyAttributes, copyStatus, copyStoredSpan, MAX_SPAN_EVENTS, MAX_SPAN_LINKS } from './records.js';

import type {
  SpanLink,
  SpanOptions,
  SpanStatus,
  StoredSpan,
  StoredSpanEvent,
  StoredSpanLink,
  StoredTrace,
  TelemetryCarrier,
  TelemetryContext,
  TelemetryPropagation,
  TelemetrySpan,
  TelemetryStore,
  TraceQuery,
} from "./types.js";
export type * from "./types.js";

/**
 * OTel-compatible lightweight Span, TracePropagation, and InMemoryTraceStore
 * (microsecond-resolution anchored clock, post-settlement inertness, and bounded storage).
 */

const TOLERANCE_MS = 10;
let clockAnchor = performance.timeOrigin;

export function telemetryNow(): number {
  const clock = performance.now();
  const wall = Date.now();
  if (Math.abs(clockAnchor + clock - wall) > TOLERANCE_MS) clockAnchor = wall - clock;
  return Math.round((clockAnchor + clock) * 1000) / 1000;
}

function randomIdentity(bytes: number): string {
  let identity: string;
  do {
    identity = randomBytes(bytes).toString("hex");
  } while (/^0+$/.test(identity));
  return identity;
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

  readonly propagation: TelemetryPropagation = this;

  constructor(options: { readonly maxSpans?: number; readonly onSpanSettled?: (span: StoredSpan) => void } = {}) {
    this.#maxSpans = Number.isFinite(options.maxSpans)
      ? Math.max(10, Math.min(10_000, Math.trunc(options.maxSpans!))) : 2000;
    this.#onSpanSettled = options.onSpanSettled;
  }

  inject(context: TelemetryContext): TelemetryCarrier | undefined {
    const ref = this.#refs.get(context);
    return ref ? { "cheers-trace-id": ref.traceId, "cheers-span-id": ref.spanId } : undefined;
  }

  extract(carrier: TelemetryCarrier | undefined): TelemetryContext {
    const traceId = carrier?.["cheers-trace-id"];
    const spanId = carrier?.["cheers-span-id"];
    if (!traceId || !spanId || !/^[0-9a-f]{32}$/.test(traceId) || !/^[0-9a-f]{16}$/.test(spanId)) return this;
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
    return this.#spans.map(copyStoredSpan);
  }

  async findTraces(query?: TraceQuery): Promise<{ readonly traces: readonly StoredTrace[]; readonly cursor?: string }> {
    return queryStoredTraces(this.snapshot(), query);
  }

  async getTrace(traceId: string): Promise<StoredTrace | undefined> {
    const spans = this.snapshot()
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

    const traceId = parent?.traceId ?? randomIdentity(16);
    const spanId = randomIdentity(8);
    const startedMs = telemetryNow();
    const state = { settled: false };
    const attrs = copyAttributes(options.attributes);
    const events: StoredSpanEvent[] = [];
    const links: StoredSpanLink[] = [];
    let status: SpanStatus = { status: "ok" };
    let explicitStatus = false;

    const recordLink = (link: SpanLink): void => {
      if (links.length >= MAX_SPAN_LINKS) return;
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
        if (state.settled || events.length >= MAX_SPAN_EVENTS) return;
        events.push({ name: name.slice(0, 96), timeMs: Math.max(0, Math.round((telemetryNow() - startedMs) * 1000) / 1000), attributes: copyAttributes(eventAttrs, 8) });
      },
      setAttributes: (nextAttrs) => {
        if (state.settled) return;
        const bounded = copyAttributes({ ...attrs, ...copyAttributes(nextAttrs) });
        for (const key of Object.keys(attrs)) delete attrs[key];
        Object.assign(attrs, bounded);
      },
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
      const recorded = copyStoredSpan({
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
      });
      this.#spans.push(recorded);
      if (this.#spans.length > this.#maxSpans) {
        this.#spans.splice(0, this.#spans.length - this.#maxSpans);
      }
      try { void Promise.resolve(this.#onSpanSettled?.(copyStoredSpan(recorded))).catch(() => {}); }
      catch { /* Persistence observers cannot replace the product result or error. */ }
    }
  }
}
