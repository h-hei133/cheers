import {
  buildContextPlanningSummary,
  type ContextPlanningSummary,
} from "./contextPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type {
  AgentPlanConfidence,
  AgentPlanContextCompleteness,
  AgentPlanExecutionReadiness,
} from "./agentPlan.js";

export interface AgentPlanContextProjection {
  readonly packetId: string;
  readonly contextPacketIds: readonly string[];
  readonly contextCompleteness: AgentPlanContextCompleteness;
  readonly confidence: AgentPlanConfidence;
  readonly executionReadiness: AgentPlanExecutionReadiness;
  readonly knownFacts: readonly string[];
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly replaySafeEvidence: readonly string[];
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly contextSummary: ContextPlanningSummary;
}

export function projectContextPacketToAgentPlanContext(
  packet: TargetedContextPacket,
): AgentPlanContextProjection {
  const contextSummary = buildContextPlanningSummary(packet);
  const executionReadiness =
    contextSummary.executionReadiness === "ready"
      ? "ready"
      : "needs-more-context";

  return {
    packetId: packet.packetId,
    contextPacketIds: [packet.packetId],
    contextCompleteness: packet.completenessStatus,
    confidence: contextSummary.confidence,
    executionReadiness,
    knownFacts: contextSummary.known,
    missingFacts: contextSummary.missing,
    suggestedReads: contextSummary.suggestedNextReads,
    suggestedVerification: contextSummary.suggestedVerificationCandidates,
    replaySafeEvidence: [
      packet.replaySafeSummary,
      contextSummary.replaySafeSummary,
      ...packet.evidence,
      ...contextSummary.evidence,
    ],
    redactionStatus: packet.redactionStatus,
    mutationAuthority: "not-granted",
    contextSummary,
  };
}
