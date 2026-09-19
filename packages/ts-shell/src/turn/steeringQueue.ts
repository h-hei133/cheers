import { redactReportText } from "../core/security/redaction.js";

export interface SteeringQueuedMessageLike {
  readonly id: string;
  readonly text: string;
  readonly mode?: "steering" | "follow-up" | string;
  readonly priority?: "normal" | "high" | string;
}

export type SteeringDeliveryStatus =
  | "queued"
  | "delivered"
  | "blocked"
  | "redacted"
  | "unsupported"
  | "abandoned";

export interface SteeringQueueItem {
  readonly steeringId: string;
  readonly source: "runtime" | "user" | "system" | "unknown";
  readonly safeSummary: string;
  readonly priority: "normal" | "high";
  readonly deliveryStatus: SteeringDeliveryStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface SteeringQueueProjection {
  readonly queueId: string;
  readonly items: readonly SteeringQueueItem[];
  readonly queuedCount: number;
  readonly deliveredCount: number;
  readonly blockedCount: number;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectSteeringQueue(input: {
  readonly turnId: string;
  readonly messages: readonly SteeringQueuedMessageLike[];
  readonly deliveredMessageIds?: readonly string[];
  readonly unsupportedMessageIds?: readonly string[];
  readonly abandonedMessageIds?: readonly string[];
  readonly blockedMessageIds?: readonly string[];
}): SteeringQueueProjection {
  const delivered = new Set(input.deliveredMessageIds ?? []);
  const unsupported = new Set(input.unsupportedMessageIds ?? []);
  const abandoned = new Set(input.abandonedMessageIds ?? []);
  const blocked = new Set(input.blockedMessageIds ?? []);
  const items = input.messages
    .filter((message) => message.mode === "steer")
    .map((message): SteeringQueueItem => {
      const safeSummary = redactReportText(message.text, 160);
      const deliveryStatus = statusFor({
        id: message.id,
        text: message.text,
        delivered,
        unsupported,
        abandoned,
        blocked,
      });
      return freeze({
        steeringId: sanitizeId(`steering:${message.id}`),
        source: "user",
        safeSummary,
        priority: "normal",
        deliveryStatus,
        redactionStatus:
          deliveryStatus === "redacted" || safeSummary !== message.text.trim().slice(0, 160)
            ? "redacted"
            : "report-safe",
        notProvenClaims: unique([
          "terminal-success",
          "task-success",
          "next-turn-success",
          "steering-delivery-is-not-success",
        ]),
        terminalSuccessClaim: false,
      });
    });

  return freeze({
    queueId: sanitizeId(`${input.turnId}:steering-queue`),
    items: freeze(items),
    queuedCount: items.filter((item) => item.deliveryStatus === "queued").length,
    deliveredCount: items.filter((item) => item.deliveryStatus === "delivered").length,
    blockedCount: items.filter((item) =>
      item.deliveryStatus === "blocked" ||
      item.deliveryStatus === "unsupported" ||
      item.deliveryStatus === "redacted"
    ).length,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "next-turn-success",
      ...items.flatMap((item) => item.notProvenClaims),
    ]),
  });
}

function statusFor(input: {
  readonly id: string;
  readonly text: string;
  readonly delivered: ReadonlySet<string>;
  readonly unsupported: ReadonlySet<string>;
  readonly abandoned: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
}): SteeringDeliveryStatus {
  if (input.abandoned.has(input.id)) {
    return "abandoned";
  }
  if (input.unsupported.has(input.id)) {
    return "unsupported";
  }
  if (input.blocked.has(input.id)) {
    return "blocked";
  }
  if (redactReportText(input.text, 160) !== input.text.trim().slice(0, 160)) {
    return "redacted";
  }
  return input.delivered.has(input.id) ? "delivered" : "queued";
}

function unique(values: readonly string[]): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => redactReportText(value, 120)))).sort());
}

function sanitizeId(value: string): string {
  return redactReportText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
