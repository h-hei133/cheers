import * as fs from "node:fs";
import * as path from "node:path";
import { redactSecretsFromObject } from "../structuredLogger.js";
import { compareCodeUnits, queryStoredTraces } from "./query.js";
import { InMemoryTraceStore } from "./span.js";
import { copyStoredSpan, isValidStoredSpan, MAX_SPAN_BYTES } from './records.js';
import { readStructuredLogs } from '../diagnostics.js';
import type { TraceLogSink } from './context.js';
import type {
  SpanOptions,
  StoredSpan,
  StoredTrace,
  TelemetryContext,
  TelemetrySpan,
  TelemetryStore,
  TraceQuery,
} from "./types.js";

function redactStoredSpan(span: StoredSpan): StoredSpan {
  return redactSecretsFromObject(copyStoredSpan(span)) as StoredSpan;
}

/**
 * Bounded JSONL-backed TraceStore with secret redaction on every persisted/returned span.
 */
export class JsonlTraceStore implements TelemetryContext, TelemetryStore {
  readonly #filePath?: string;
  readonly #sink?: TraceLogSink;
  readonly #sessionId?: string;
  readonly #memory: InMemoryTraceStore;
  readonly #maxReadBytes: number;
  readonly #maxFileBytes: number;
  readonly coverage = { status: 'partial' as const, reason: 'Retained, bounded trace records; lifetime capture is not proven.' };

  get propagation() {
    return this.#memory.propagation;
  }

  constructor(options: { readonly filePath?: string; readonly sink?: TraceLogSink; readonly sessionId?: string;
    readonly maxSpans?: number; readonly maxReadBytes?: number; readonly maxFileBytes?: number }) {
    if (!options.filePath && !options.sink) throw new Error('A trace storage owner is required.');
    this.#filePath = options.filePath;
    this.#sink = options.sink;
    this.#sessionId = options.sessionId;
    this.#maxReadBytes = Number.isFinite(options.maxReadBytes)
      ? Math.max(1024, Math.min(2 * 1024 * 1024, Math.trunc(options.maxReadBytes!))) : 2 * 1024 * 1024;
    this.#maxFileBytes = Number.isFinite(options.maxFileBytes)
      ? Math.max(1024, Math.min(16 * 1024 * 1024, Math.trunc(options.maxFileBytes!))) : this.#maxReadBytes;
    this.#memory = new InMemoryTraceStore({
      maxSpans: options.maxSpans,
      onSpanSettled: (span) => this.#appendSpan(span),
    });
  }

  startSpan<T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
    return this.#memory.startSpan(options, callback);
  }

  async findTraces(query?: TraceQuery): Promise<{ readonly traces: readonly StoredTrace[]; readonly cursor?: string }> {
    return queryStoredTraces(this.readAllSpans(), query);
  }

  async getTrace(traceId: string): Promise<StoredTrace | undefined> {
    const spans = this.readAllSpans()
      .filter((s) => s.traceId === traceId)
      .sort((a, b) => a.startedMs - b.startedMs || compareCodeUnits(a.id, b.id));
    return spans.length > 0 ? { traceId, spans } : undefined;
  }

  readAllSpans(): readonly StoredSpan[] {
    if (this.#sink) {
      try {
        const read = readStructuredLogs(this.#sink.getLogDir(), this.#sink.getCurrentFilePath(), 2000);
        const spans = read.entries.flatMap(entry => {
          const span: unknown = entry.component === 'span' ? entry.fields.storedSpan : undefined;
          return isValidStoredSpan(span) ? [redactStoredSpan(span)] : [];
        });
        // A failed persistence side-channel does not erase observed settlements.
        const merged = new Map([...spans, ...this.#memory.snapshot().map(redactStoredSpan)].map(span => [span.id, span]));
        return [...merged.values()].filter(span => this.#sessionId === undefined || span.attributes.sessionId === this.#sessionId);
      } catch { return this.#memory.snapshot().map(redactStoredSpan)
        .filter(span => this.#sessionId === undefined || span.attributes.sessionId === this.#sessionId); }
    }
    let fd: number | undefined;
    try {
      if (!this.#filePath) return [];
      if (!fs.existsSync(this.#filePath)) {
        return this.#memory.snapshot().map(redactStoredSpan);
      }
      const stat = fs.statSync(this.#filePath);
      const readSize = Math.min(stat.size, this.#maxReadBytes);
      fd = fs.openSync(this.#filePath, "r");
      const buf = Buffer.alloc(readSize);
      const startOffset = Math.max(0, stat.size - readSize);
      fs.readSync(fd, buf, 0, readSize, startOffset);
      let text = buf.toString("utf8");
      if (startOffset > 0) {
        const firstNewline = text.indexOf("\n");
        text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
      }
      const spans: StoredSpan[] = [];
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed: unknown = JSON.parse(trimmed);
          if (Buffer.byteLength(trimmed) <= MAX_SPAN_BYTES && isValidStoredSpan(parsed)) {
            spans.push(redactStoredSpan(parsed));
          }
        } catch {
          // Skip malformed trailing/corrupt lines cleanly.
        }
      }
      return spans;
    } catch {
      return this.#memory.snapshot().map(redactStoredSpan);
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* ignore */ }
      }
    }
  }

  #appendSpan(span: StoredSpan): void {
    try {
      const stored = redactStoredSpan(span);
      if (this.#sink) {
        this.#sink.write({ timestamp: new Date(stored.endedMs).toISOString(),
          level: stored.status.status === 'error' ? 'warn' : 'debug', traceId: stored.traceId, spanId: stored.id,
          parentSpanId: stored.parentId, component: 'span', message: stored.name,
          fields: { storedSpan: stored, sessionId: stored.attributes.sessionId,
            requestId: stored.attributes.requestId, toolCallId: stored.attributes.toolCallId,
            durationMs: Math.max(0, stored.endedMs - stored.startedMs) },
        });
        return;
      }
      if (!this.#filePath) return;
      fs.mkdirSync(path.dirname(this.#filePath), { recursive: true });
      const line = `${JSON.stringify(stored)}\n`;
      const bytes = Buffer.byteLength(line);
      if (bytes > this.#maxFileBytes) return;
      if (fs.existsSync(this.#filePath) && fs.statSync(this.#filePath).size + bytes > this.#maxFileBytes) {
        const retained = this.readAllSpans().map(item => `${JSON.stringify(item)}\n`);
        let remaining = this.#maxFileBytes - bytes;
        const tail: string[] = [];
        for (let index = retained.length - 1; index >= 0; index -= 1) {
          const size = Buffer.byteLength(retained[index]!);
          if (size > remaining) break;
          tail.unshift(retained[index]!);
          remaining -= size;
        }
        fs.writeFileSync(this.#filePath, tail.join(''), 'utf8');
      }
      fs.appendFileSync(this.#filePath, line, "utf8");
    } catch {
      // Telemetry persistence must never throw into product request paths.
    }
  }
}
