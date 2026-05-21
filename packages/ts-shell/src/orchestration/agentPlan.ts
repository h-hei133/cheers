import crypto from "node:crypto";

import type { CodingTaskKind } from "./types.js";

export type AgentPlanOwnerCapability =
  | "agent-loop"
  | "workspace-file-context"
  | "edit-patch"
  | "provider-model"
  | "browser"
  | "tool-runtime"
  | "result-surface";

export type AgentPlanRequestedActionKind =
  | "read"
  | "explain"
  | "context-planning"
  | "edit"
  | "write"
  | "verify"
  | "run-command"
  | "browser"
  | "unsupported";

export type AgentPlanConfidence = "high" | "medium" | "low";

export type AgentPlanExecutionReadiness =
  | "ready"
  | "needs-more-context"
  | "stopped"
  | "unsupported";

export type AgentPlanContextCompleteness =
  | "complete"
  | "partial"
  | "missing-context"
  | "not-requested";

export interface AgentPlan {
  readonly planId: string;
  readonly ownerCapability: AgentPlanOwnerCapability;
  readonly taskKind: CodingTaskKind;
  readonly requestedActionKind: AgentPlanRequestedActionKind;
  readonly targetSummary: string;
  readonly contextPacketIds: readonly string[];
  readonly contextCompleteness: AgentPlanContextCompleteness;
  readonly confidence: AgentPlanConfidence;
  readonly executionReadiness: AgentPlanExecutionReadiness;
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly safeEvidenceMarkers: readonly string[];
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted" | "not-applicable";
  readonly doNext: string;
  readonly replaySafeSummary: string;
}

export function buildAgentPlan(
  input: Omit<AgentPlan, "planId" | "replaySafeSummary">,
): AgentPlan {
  const planId = buildAgentPlanId(input);
  const replaySafeSummary = [
    `agent-plan ${planId}`,
    `owner=${input.ownerCapability}`,
    `action=${input.requestedActionKind}`,
    `readiness=${input.executionReadiness}`,
    `confidence=${input.confidence}`,
    `contextPackets=${input.contextPacketIds.length}`,
    `missingFacts=${input.missingFacts.length}`,
    `suggestedReads=${input.suggestedReads.length}`,
    "mutationAuthority=not-granted",
    `redaction=${input.redactionStatus}`,
  ].join("; ");

  return {
    ...input,
    planId,
    replaySafeSummary,
  };
}

function buildAgentPlanId(input: Omit<AgentPlan, "planId" | "replaySafeSummary">): string {
  const payload = JSON.stringify({
    ownerCapability: input.ownerCapability,
    taskKind: input.taskKind,
    requestedActionKind: input.requestedActionKind,
    targetSummary: input.targetSummary,
    contextPacketIds: input.contextPacketIds,
    contextCompleteness: input.contextCompleteness,
    confidence: input.confidence,
    executionReadiness: input.executionReadiness,
    missingFacts: input.missingFacts,
    suggestedReads: input.suggestedReads,
    suggestedVerification: input.suggestedVerification,
    mutationAuthority: input.mutationAuthority,
    redactionStatus: input.redactionStatus,
  });
  return `plan_${crypto.createHash("sha256").update(payload).digest("hex").slice(0, 12)}`;
}
