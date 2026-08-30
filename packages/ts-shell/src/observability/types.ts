export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly component: string;
  readonly message: string;
  readonly fields: Record<string, unknown>;
}
