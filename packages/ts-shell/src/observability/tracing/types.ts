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
  /** Retention and bounded reads do not establish complete lifetime capture. */
  readonly coverage?: { readonly status: 'partial' | 'unavailable'; readonly reason: string };
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
