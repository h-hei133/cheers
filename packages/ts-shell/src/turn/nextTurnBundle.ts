import type { AssistantResponseState } from "./assistantResponse.js";
import type { NextTurnDeliveryPolicyProjection, NextTurnDeliveryStatus } from "./deliveryPolicy.js";
import type { FollowUpQueueProjection } from "./followUpQueue.js";
import type { SteeringQueueProjection } from "./steeringQueue.js";
import type { ToolResultMessageBatch } from "./toolResultMessage.js";

export interface NextTurnBundleProjection {
  readonly bundleId: string;
  readonly turnId: string;
  readonly sourceToolResultMessageIds: readonly string[];
  readonly assistantResponseSummary?: string;
  readonly userFollowUpSummary?: string;
  readonly steeringMessageIds: readonly string[];
  readonly followUpMessageIds: readonly string[];
  readonly contextRebuildProjectionId?: string;
  readonly sessionActivePathId?: string;
  readonly providerMetadataIds: readonly string[];
  readonly savePointId?: string;
  readonly deliveryPolicyId?: string;
  readonly deliveryStatus: NextTurnDeliveryStatus;
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function prepareNextTurnBundle(input: {
  readonly bundleId: string;
  readonly turnId: string;
  readonly toolResultMessages?: ToolResultMessageBatch;
  readonly assistantResponse?: AssistantResponseState;
  readonly steeringQueue?: SteeringQueueProjection;
  readonly followUpQueue?: FollowUpQueueProjection;
  readonly contextRebuildProjectionId?: string;
  readonly sessionActivePathId?: string;
  readonly providerMetadataIds?: readonly string[];
  readonly savePointId?: string;
  readonly deliveryPolicy?: NextTurnDeliveryPolicyProjection;
  readonly deliveryStatus?: NextTurnDeliveryStatus;
}): NextTurnBundleProjection {
  let redacted = false;
  const sanitize = (value: string, maxLength = 180) => {
    const sanitized = sanitizeText(value, maxLength);
    redacted ||= sanitized !== value.trim().slice(0, maxLength);
    return sanitized;
  };
  const followUpSummary = input.followUpQueue?.items
    .filter((item) => item.deliveryStatus === "queued" || item.deliveryStatus === "delivered")
    .map((item) => item.safeSummary)
    .join("; ");
  const sourceToolResultMessageIds = input.toolResultMessages?.messages.map((message) =>
    sanitize(message.messageId)
  ) ?? [];
  const deliveryStatus = input.deliveryStatus ??
    input.deliveryPolicy?.deliveryStatus ??
    "prepared";

  return freeze({
    bundleId: sanitizeId(input.bundleId),
    turnId: sanitize(input.turnId),
    sourceToolResultMessageIds: freeze(Array.from(new Set(sourceToolResultMessageIds))),
    ...(input.assistantResponse?.contentSummary
      ? { assistantResponseSummary: sanitize(input.assistantResponse.contentSummary) }
      : {}),
    ...(followUpSummary ? { userFollowUpSummary: sanitize(followUpSummary) } : {}),
    steeringMessageIds: freeze(input.steeringQueue?.items.map((item) =>
      sanitize(item.steeringId)
    ) ?? []),
    followUpMessageIds: freeze(input.followUpQueue?.items.map((item) =>
      sanitize(item.followUpId)
    ) ?? []),
    ...(input.contextRebuildProjectionId
      ? { contextRebuildProjectionId: sanitize(input.contextRebuildProjectionId) }
      : {}),
    ...(input.sessionActivePathId
      ? { sessionActivePathId: sanitize(input.sessionActivePathId) }
      : {}),
    providerMetadataIds: freeze((input.providerMetadataIds ?? []).map((id) => sanitize(id))),
    ...(input.savePointId ? { savePointId: sanitize(input.savePointId) } : {}),
    ...(input.deliveryPolicy ? { deliveryPolicyId: sanitize(input.deliveryPolicy.policyId) } : {}),
    deliveryStatus,
    redaction: {
      status:
        redacted ||
          input.toolResultMessages?.messages.some((message) => message.redactionStatus === "redacted") ||
          input.steeringQueue?.items.some((item) => item.redactionStatus === "redacted") ||
          input.followUpQueue?.items.some((item) => item.redactionStatus === "redacted")
          ? "redacted"
          : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "provider-success",
      "tool-success",
      "verification-success",
      "repair-success",
      "next-turn-success",
      "bundle-prepared-is-not-execution",
      ...(input.toolResultMessages?.notProvenClaims ?? []),
      ...(input.steeringQueue?.notProvenClaims ?? []),
      ...(input.followUpQueue?.notProvenClaims ?? []),
      ...(input.deliveryPolicy?.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
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
