import * as fs from "node:fs";
import * as path from "node:path";
import { redactSecretsFromObject } from "../structuredLogger.js";
import { compareCodeUnits, queryStoredTraces } from "./query.js";
import {
  InMemoryTraceStore,
  type SpanOptions,
  type StoredSpan,
  type StoredTrace,
  type TelemetryContext,
  type TelemetrySpan,
  type TelemetryStore,
  type TraceQuery,
} from "./span.js";

function isValidStoredSpan(value: unknown): value is StoredSpan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Partial<StoredSpan>;
  if (typeof s.id !== "string" || typeof s.traceId !== "string" || typeof s.name !== "string") return false;
  if (typeof s.startedMs !== "number" || !Number.isFinite(s.startedMs)) return false;
  if (typeof s.endedMs !== "number" || !Number.isFinite(s.endedMs)) return false;
  if (!s.status || typeof s.status !== "object" || (s.status.status !== "ok" && s.status.status !== "error")) return false;
  return true;
}

function redactStoredSpan(span: StoredSpan): StoredSpan {
  return redactSecretsFromObject(span as unknown as Record<string, unknown>) as unknown as StoredSpan;
}

/**
 * Bounded JSONL-backed TraceStore with secret redaction on every persisted/returned span.
 */
export class JsonlTraceStore implements TelemetryContext, TelemetryStore {
  readonly #filePath: string;
  readonly #memory: InMemoryTraceStore;
  readonly #maxReadBytes: number;

  get propagation() {
    return this.#memory.propagation;
  }

  constructor(options: { readonly filePath: string; readonly maxSpans?: number; readonly maxReadBytes?: number }) {
    this.#filePath = options.filePath;
    this.#maxReadBytes = options.maxReadBytes ?? 2 * 1024 * 1024;
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
    let fd: number | undefined;
    try {
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
          if (isValidStoredSpan(parsed)) {
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
      fs.mkdirSync(path.dirname(this.#filePath), { recursive: true });
      fs.appendFileSync(this.#filePath, `${JSON.stringify(redactStoredSpan(span))}\n`, "utf8");
    } catch {
      // Telemetry persistence must never throw into product request paths.
    }
  }
}
