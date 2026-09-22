import { freezeDeep } from "../core/values/freeze.js";
import { redactReportText } from "../core/security/redaction.js";
import type { AssistantResponseState } from "./assistantResponse.js";
import type { NextTurnDeliveryPolicyProjection, NextTurnDeliveryStatus } from "./deliveryPolicy.js";
import type { FollowUpQueueProjection } from "./followUpQueue.js";
import type { SteeringQueueProjection } from "./steeringQueue.js";
import type { ToolResultMessageBatch } from "./toolResultMessage.js";
import type { ToolOutcomeBundleProjection } from "../tools/toolOutcomeBundle.js";

export type NextTurnReadinessStatus =
  | "ready"
  | "ready_with_partial_tool_results"
  | "blocked_by_policy"
  | "blocked_by_authority"
  | "blocked_by_failed_tool"
  | "blocked_by_malformed_tool_call"
  | "blocked_by_unsupported_tool"
  | "unsupported"
  | "not_ready";

export interface NextTurnDeliveryFact {
  readonly deliveryId: string;
  readonly sourceNextTurnBundleId: string;
  readonly deliveryKind: "steering" | "follow-up";
  readonly queued: boolean;
  readonly delivered: boolean;
  readonly blocked: boolean;
  readonly reason: string;
  readonly safeUserFacingSummary: string;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface NextTurnBundleProjection {
  readonly bundleId: string;
  readonly turnId: string;
  readonly sourceToolOutcomeBundleId?: string;
  readonly sourceToolResultMessageIds: readonly string[];
  readonly safeToolResultMessages: readonly {
    readonly messageId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly safeContentSummary: string;
    readonly terminalSuccessClaim: false;
  }[];
  readonly includedToolResultMessageIds: readonly string[];
  readonly excludedToolResultMessageIds: readonly string[];
  readonly messageExclusionReasons: readonly string[];
  readonly readinessStatus: NextTurnReadinessStatus;
  readonly blockingFacts: readonly string[];
  readonly requiredUserAction?: string;
  readonly deliveryFacts: readonly NextTurnDeliveryFact[];
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
  readonly toolOutcomeBundle?: ToolOutcomeBundleProjection;
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
    const sanitized = redactReportText(value, maxLength);
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
  const safeToolResultMessages = (input.toolResultMessages?.messages ?? [])
    .filter((message) => message.redactionStatus === "report-safe")
    .map((message) => freezeDeep({
      messageId: sanitize(message.messageId),
      toolCallId: sanitize(message.toolCallId),
      toolName: sanitize(message.toolName, 120),
      safeContentSummary: sanitize(message.safeContentSummary, 260),
      terminalSuccessClaim: false as const,
    }));
  const includedToolResultMessageIds = safeToolResultMessages.map((message) => message.messageId);
  const excludedToolResultMessageIds = (input.toolResultMessages?.messages ?? [])
    .filter((message) => message.redactionStatus !== "report-safe")
    .map((message) => sanitize(message.messageId));
  const messageExclusionReasons = excludedToolResultMessageIds.map((id) =>
    `${id}:unsafe-or-redacted`
  );
  const deliveryStatus = input.deliveryStatus ??
    input.deliveryPolicy?.deliveryStatus ??
    "prepared";
  const readinessStatus = nextTurnReadiness({
    includedMessageCount: includedToolResultMessageIds.length,
    totalMessageCount: sourceToolResultMessageIds.length,
    toolOutcomeBundle: input.toolOutcomeBundle,
    deliveryStatus,
  });
  const bundleId = sanitizeId(input.bundleId);
  const deliveryFacts = createDeliveryFacts({
    bundleId,
    steeringQueue: input.steeringQueue,
    followUpQueue: input.followUpQueue,
  });
  const blockingFacts = unique([
    ...(input.toolOutcomeBundle?.blockingFacts ?? []),
    ...messageExclusionReasons,
    ...(readinessStatus.startsWith("blocked") || readinessStatus === "unsupported"
      ? [`next-turn-readiness:${readinessStatus}`]
      : []),
  ]);
  const requiredUserAction = requiredAction(readinessStatus);

  return freezeDeep({
    bundleId,
    turnId: sanitize(input.turnId),
    ...(input.toolOutcomeBundle
      ? { sourceToolOutcomeBundleId: sanitize(input.toolOutcomeBundle.bundleId) }
      : {}),
    sourceToolResultMessageIds: freezeDeep(Array.from(new Set(sourceToolResultMessageIds))),
    safeToolResultMessages: freezeDeep(safeToolResultMessages),
    includedToolResultMessageIds: freezeDeep(Array.from(new Set(includedToolResultMessageIds))),
    excludedToolResultMessageIds: freezeDeep(Array.from(new Set(excludedToolResultMessageIds))),
    messageExclusionReasons: freezeDeep(messageExclusionReasons),
    readinessStatus,
    blockingFacts: freezeDeep(blockingFacts),
    ...(requiredUserAction ? { requiredUserAction } : {}),
    deliveryFacts: freezeDeep(deliveryFacts),
    ...(input.assistantResponse?.contentSummary
      ? { assistantResponseSummary: sanitize(input.assistantResponse.contentSummary) }
      : {}),
    ...(followUpSummary ? { userFollowUpSummary: sanitize(followUpSummary) } : {}),
    steeringMessageIds: freezeDeep(input.steeringQueue?.items.map((item) =>
      sanitize(item.steeringId)
    ) ?? []),
    followUpMessageIds: freezeDeep(input.followUpQueue?.items.map((item) =>
      sanitize(item.followUpId)
    ) ?? []),
    ...(input.contextRebuildProjectionId
      ? { contextRebuildProjectionId: sanitize(input.contextRebuildProjectionId) }
      : {}),
    ...(input.sessionActivePathId
      ? { sessionActivePathId: sanitize(input.sessionActivePathId) }
      : {}),
    providerMetadataIds: freezeDeep((input.providerMetadataIds ?? []).map((id) => sanitize(id))),
    ...(input.savePointId ? { savePointId: sanitize(input.savePointId) } : {}),
    ...(input.deliveryPolicy ? { deliveryPolicyId: sanitize(input.deliveryPolicy.policyId) } : {}),
    deliveryStatus,
    redaction: {
      status:
        redacted ||
      input.toolResultMessages?.messages.some((message) => message.redactionStatus === "redacted") ||
          excludedToolResultMessageIds.length > 0 ||
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
      "next-turn-ready-is-not-provider-execution",
      ...(input.toolResultMessages?.notProvenClaims ?? []),
      ...(input.toolOutcomeBundle?.notProvenClaims ?? []),
      ...(input.steeringQueue?.notProvenClaims ?? []),
      ...(input.followUpQueue?.notProvenClaims ?? []),
      ...(input.deliveryPolicy?.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function nextTurnReadiness(input: {
  readonly includedMessageCount: number;
  readonly totalMessageCount: number;
  readonly toolOutcomeBundle?: ToolOutcomeBundleProjection;
  readonly deliveryStatus: NextTurnDeliveryStatus;
}): NextTurnReadinessStatus {
  if (input.deliveryStatus === "unsupported" || input.deliveryStatus === "abandoned") {
    return "unsupported";
  }
  const bundle = input.toolOutcomeBundle;
  if (!bundle && input.totalMessageCount === 0) {
    return "not_ready";
  }
  if (bundle?.malformedCount) {
    return "blocked_by_malformed_tool_call";
  }
  if (bundle?.authorityRequiredCount) {
    return "blocked_by_authority";
  }
  if (bundle?.blockedCount) {
    return "blocked_by_policy";
  }
  if (bundle?.unsupportedCount || bundle?.unknownCount) {
    return "blocked_by_unsupported_tool";
  }
  if (bundle?.failedCount && bundle.executedCount === bundle.failedCount) {
    return "blocked_by_failed_tool";
  }
  if (input.includedMessageCount === 0 && input.totalMessageCount > 0) {
    return "not_ready";
  }
  if (bundle && bundle.mixedOutcomeStatus === "mixed_success_and_non_success") {
    return "ready_with_partial_tool_results";
  }
  if (input.includedMessageCount < input.totalMessageCount) {
    return "ready_with_partial_tool_results";
  }
  return "ready";
}

function requiredAction(status: NextTurnReadinessStatus): string | undefined {
  switch (status) {
    case "blocked_by_authority":
      return "user-authority-required";
    case "blocked_by_policy":
      return "policy-blocker-must-be-resolved";
    case "blocked_by_failed_tool":
      return "failed-tool-result-must-remain-visible";
    case "blocked_by_malformed_tool_call":
      return "malformed-tool-call-must-be-repaired";
    case "blocked_by_unsupported_tool":
    case "unsupported":
      return "unsupported-tool-call-must-be-replanned";
    case "not_ready":
      return "next-turn-input-not-ready";
    case "ready":
    case "ready_with_partial_tool_results":
      return undefined;
  }
}

function createDeliveryFacts(input: {
  readonly bundleId: string;
  readonly steeringQueue?: SteeringQueueProjection;
  readonly followUpQueue?: FollowUpQueueProjection;
}): readonly NextTurnDeliveryFact[] {
  return freezeDeep([
    ...(input.steeringQueue?.items.map((item) => freezeDeep({
      deliveryId: sanitizeId(`${input.bundleId}:steering:${item.steeringId}`),
      sourceNextTurnBundleId: input.bundleId,
      deliveryKind: "steering" as const,
      queued: item.deliveryStatus === "queued",
      delivered: item.deliveryStatus === "delivered",
      blocked:
        item.deliveryStatus === "blocked" ||
        item.deliveryStatus === "unsupported" ||
        item.deliveryStatus === "redacted",
      reason: redactReportText(`steering:${item.deliveryStatus}`, 120),
      safeUserFacingSummary: redactReportText(item.safeSummary, 160),
      notProvenClaims: unique([
        ...item.notProvenClaims,
        "queued-is-not-delivered",
        "delivered-is-not-provider-execution",
      ]),
      terminalSuccessClaim: false as const,
    })) ?? []),
    ...(input.followUpQueue?.items.map((item) => freezeDeep({
      deliveryId: sanitizeId(`${input.bundleId}:follow-up:${item.followUpId}`),
      sourceNextTurnBundleId: input.bundleId,
      deliveryKind: "follow-up" as const,
      queued: item.deliveryStatus === "queued",
      delivered: item.deliveryStatus === "delivered",
      blocked:
        item.deliveryStatus === "blocked" ||
        item.deliveryStatus === "unsupported" ||
        item.deliveryStatus === "redacted",
      reason: redactReportText(`follow-up:${item.deliveryStatus}`, 120),
      safeUserFacingSummary: redactReportText(item.safeSummary, 160),
      notProvenClaims: unique([
        ...item.notProvenClaims,
        "queued-is-not-delivered",
        "delivered-is-not-provider-execution",
      ]),
      terminalSuccessClaim: false as const,
    })) ?? []),
  ]);
}

function unique(values: readonly string[]): readonly string[] {
  return freezeDeep(Array.from(new Set(values.map((value) => redactReportText(value, 120)))).sort());
}

function sanitizeId(value: string): string {
  return redactReportText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
