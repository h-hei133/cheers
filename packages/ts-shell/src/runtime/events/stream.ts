import type {
  RuntimeProjectionEvent,
  RuntimeProjectionEventType,
} from "./projection.js";

export type JsonEventStreamValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonEventStreamValue[]
  | { readonly [key: string]: JsonEventStreamValue };

export interface JsonRuntimeEventStreamEntry {
  readonly schemaVersion: "runtime-event-stream.v1";
  readonly streamId: string;
  readonly order: number;
  readonly sourceSequence: number;
  readonly eventId: string;
  readonly eventType: RuntimeProjectionEventType;
  readonly facts: JsonEventStreamValue;
  readonly notProvenClaims: readonly string[];
  readonly truthfulness: {
    readonly observationOnly: true;
    readonly terminalSuccessClaim: false;
  };
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
}

export function projectJsonRuntimeEventStream(input: {
  readonly events: readonly RuntimeProjectionEvent[];
  readonly streamId?: string;
}): readonly JsonRuntimeEventStreamEntry[] {
  const orderedEvents = input.events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const sequenceDelta = left.event.sequence - right.event.sequence;
      return sequenceDelta === 0 ? left.index - right.index : sequenceDelta;
    });
  const streamId = sanitizeText(input.streamId ?? "runtime-event-stream").value;

  return deepFreeze(
    orderedEvents.map(({ event }, index): JsonRuntimeEventStreamEntry => {
      const facts = sanitizeJsonValue(event.facts);
      const notProvenClaims = Array.from(
        new Set([
          ...event.notProvenClaims,
          "terminal-success",
          ...(event.facts.terminalSuccessClaim === true
            ? ["event-stream-terminal-success-claim"]
            : []),
        ]),
      );

      return {
        schemaVersion: "runtime-event-stream.v1",
        streamId,
        order: index + 1,
        sourceSequence: event.sequence,
        eventId: sanitizeText(event.id).value,
        eventType: event.type,
        facts: facts.value,
        notProvenClaims,
        truthfulness: {
          observationOnly: true,
          terminalSuccessClaim: false,
        },
        redaction: {
          status:
            event.redaction.status === "redacted" || facts.redacted
              ? "redacted"
              : "report-safe",
          excluded: Array.from(
            new Set([
              ...event.redaction.excluded,
              "api-keys",
              "provider.env",
              "raw-provider-output",
              "oldText",
              "newText",
              "unredacted-command-output",
              "hidden-reasoning",
              "full-transcript",
              "unsafe-file-contents",
            ]),
          ),
        },
      };
    }),
  );
}

export function serializeJsonRuntimeEventStream(
  entries: readonly JsonRuntimeEventStreamEntry[],
): string {
  return `${JSON.stringify(entries)}\n`;
}

function sanitizeJsonValue(input: unknown): {
  readonly value: JsonEventStreamValue;
  readonly redacted: boolean;
} {
  if (input === null) {
    return { value: null, redacted: false };
  }
  if (typeof input === "string") {
    return sanitizeText(input);
  }
  if (typeof input === "boolean") {
    return { value: input, redacted: false };
  }
  if (typeof input === "number") {
    return { value: Number.isFinite(input) ? input : null, redacted: !Number.isFinite(input) };
  }
  if (Array.isArray(input)) {
    let redacted = false;
    const value = input.map((item) => {
      const sanitized = sanitizeJsonValue(item);
      redacted = redacted || sanitized.redacted;
      return sanitized.value;
    });
    return { value, redacted };
  }
  if (input && typeof input === "object") {
    let redacted = false;
    const value: Record<string, JsonEventStreamValue> = {};
    for (const [key, rawValue] of Object.entries(input)) {
      if (rawValue === undefined || typeof rawValue === "function") {
        redacted = true;
        continue;
      }
      const keySanitized = sanitizeText(key);
      const valueSanitized = sanitizeJsonValue(rawValue);
      value[keySanitized.value] = valueSanitized.value;
      redacted =
        redacted || keySanitized.redacted || valueSanitized.redacted;
    }
    return { value, redacted };
  }
  return { value: null, redacted: true };
}

function sanitizeText(input: string): {
  readonly value: string;
  readonly redacted: boolean;
} {
  let value = input;
  const before = value;
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]");
  value = value.replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]");
  value = value.replace(/\bauthorization[:=][^\s;,)]+/gi, "authorization=[secret-redacted]");
  value = value.replace(/\bapi[_-]?key[:=][^\s;,)]+/gi, "apiKey=[secret-redacted]");
  value = value.replace(/\bauth(?:orization)?[_-]?header[:=][^\n\r]*/gi, "authHeader=[secret-redacted]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]");
  value = value.replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value, redacted: value !== before };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
