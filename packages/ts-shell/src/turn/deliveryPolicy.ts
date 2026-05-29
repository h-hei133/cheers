import type { FollowUpQueueProjection } from "./followUpQueue.js";
import type { SteeringQueueProjection } from "./steeringQueue.js";

export type NextTurnDeliverySource =
  | "steering"
  | "follow-up"
  | "tool-result-message"
  | "context-rebuild"
  | "session-active-path"
  | "model-response";

export type NextTurnDeliveryStatus =
  | "prepared"
  | "waiting"
  | "blocked"
  | "unsupported"
  | "not_prepared"
  | "delivered"
  | "abandoned";

export interface NextTurnDeliveryPolicyEntry {
  readonly source: NextTurnDeliverySource;
  readonly itemId: string;
  readonly order: number;
  readonly deliveryStatus: NextTurnDeliveryStatus;
  readonly terminalSuccessClaim: false;
}

export interface NextTurnDeliveryPolicyProjection {
  readonly policyId: string;
  readonly bundleId: string;
  readonly entries: readonly NextTurnDeliveryPolicyEntry[];
  readonly deliveryStatus: NextTurnDeliveryStatus;
  readonly providerCalled: false;
  readonly nextTurnExecuted: false;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function evaluateNextTurnDeliveryPolicy(input: {
  readonly bundleId: string;
  readonly steeringQueue?: SteeringQueueProjection;
  readonly followUpQueue?: FollowUpQueueProjection;
  readonly toolResultMessageIds?: readonly string[];
  readonly contextRebuildProjectionIds?: readonly string[];
  readonly sessionActivePathIds?: readonly string[];
  readonly modelResponseIds?: readonly string[];
  readonly deliveryStatus?: NextTurnDeliveryStatus;
}): NextTurnDeliveryPolicyProjection {
  const entries: NextTurnDeliveryPolicyEntry[] = [];
  const append = (
    source: NextTurnDeliverySource,
    itemId: string,
    deliveryStatus: NextTurnDeliveryStatus,
  ) => {
    entries.push(freeze({
      source,
      itemId: sanitizeId(itemId),
      order: entries.length + 1,
      deliveryStatus,
      terminalSuccessClaim: false,
    }));
  };

  for (const item of input.steeringQueue?.items ?? []) {
    append("steering", item.steeringId, mapQueueStatus(item.deliveryStatus));
  }
  for (const item of input.followUpQueue?.items ?? []) {
    append("follow-up", item.followUpId, mapQueueStatus(item.deliveryStatus));
  }
  for (const id of input.toolResultMessageIds ?? []) {
    append("tool-result-message", id, "prepared");
  }
  for (const id of input.contextRebuildProjectionIds ?? []) {
    append("context-rebuild", id, "prepared");
  }
  for (const id of input.sessionActivePathIds ?? []) {
    append("session-active-path", id, "prepared");
  }
  for (const id of input.modelResponseIds ?? []) {
    append("model-response", id, "prepared");
  }

  return freeze({
    policyId: sanitizeId(`${input.bundleId}:delivery-policy`),
    bundleId: sanitizeId(input.bundleId),
    entries: freeze(entries),
    deliveryStatus: input.deliveryStatus ?? (entries.length > 0 ? "waiting" : "prepared"),
    providerCalled: false,
    nextTurnExecuted: false,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "provider-success",
      "next-turn-success",
      "delivery-policy-evaluated-is-not-success",
    ]),
  });
}

function mapQueueStatus(
  status: "queued" | "delivered" | "blocked" | "redacted" | "unsupported" | "abandoned",
): NextTurnDeliveryStatus {
  switch (status) {
    case "delivered":
      return "delivered";
    case "blocked":
    case "redacted":
      return "blocked";
    case "unsupported":
      return "unsupported";
    case "abandoned":
      return "abandoned";
    case "queued":
      return "waiting";
  }
}

function unique(values: readonly string[]): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => sanitizeText(value, 120)))).sort());
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
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
