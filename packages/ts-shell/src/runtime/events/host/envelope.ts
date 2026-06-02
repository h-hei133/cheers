import type { JsonRuntimeEventStreamEntry } from "../stream.js";

export interface HostEventEnvelope {
  readonly schemaVersion: "host-event.v1";
  readonly correlationId: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly order: number;
  readonly sourceEventId: string;
  readonly sourceEventType: string;
  readonly category:
    | "host"
    | "session"
    | "provider"
    | "tool"
    | "mutation"
    | "verification"
    | "result"
    | "runtime";
  readonly severity: "info" | "warning" | "error";
  readonly redaction: JsonRuntimeEventStreamEntry["redaction"];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectHostEventEnvelopes(input: {
  readonly events: readonly JsonRuntimeEventStreamEntry[];
  readonly correlationId: string;
  readonly sessionId?: string;
  readonly turnId?: string;
}): readonly HostEventEnvelope[] {
  return freeze(input.events.map((event): HostEventEnvelope => ({
    schemaVersion: "host-event.v1",
    correlationId: sanitize(input.correlationId),
    ...(input.sessionId ? { sessionId: sanitize(input.sessionId) } : {}),
    ...(input.turnId ? { turnId: sanitize(input.turnId) } : {}),
    order: event.order,
    sourceEventId: event.eventId,
    sourceEventType: event.eventType,
    category: categoryFor(event.eventType),
    severity: severityFor(event.eventType, event.redaction.status),
    redaction: event.redaction,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "event-emission-is-not-success",
      ...event.notProvenClaims,
    ]),
  })));
}

function categoryFor(type: string): HostEventEnvelope["category"] {
  if (type.includes("session") || type.includes("continuation") || type.includes("replay")) {
    return "session";
  }
  if (type.includes("provider") || type.includes("model")) {
    return "provider";
  }
  if (type.includes("tool")) {
    return "tool";
  }
  if (type.includes("mutation")) {
    return "mutation";
  }
  if (type.includes("verification") || type.includes("repair")) {
    return "verification";
  }
  if (type.includes("result") || type.includes("verdict") || type.includes("completion")) {
    return "result";
  }
  if (type.includes("host")) {
    return "host";
  }
  return "runtime";
}

function severityFor(
  type: string,
  redaction: JsonRuntimeEventStreamEntry["redaction"]["status"],
): HostEventEnvelope["severity"] {
  if (type.includes("failed") || type.includes("blocked") || type.includes("denied")) {
    return "error";
  }
  if (redaction === "redacted" || type.includes("required") || type.includes("missing")) {
    return "warning";
  }
  return "info";
}

function sanitize(input: string): string {
  return input.replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]");
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
