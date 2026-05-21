import type { TargetedContextPacket } from "./contextPacket.js";

export interface ContextPlanningSummary {
  readonly packetId: string;
  readonly known: readonly string[];
  readonly missing: readonly string[];
  readonly likelyRelatedFiles: readonly string[];
  readonly likelyTests: readonly string[];
  readonly suggestedNextReads: readonly string[];
  readonly suggestedVerificationCandidates: readonly string[];
  readonly confidence: TargetedContextPacket["confidence"];
  readonly executionReadiness: "ready" | "needs-more-context" | "unsupported";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildContextPlanningSummary(
  packet: TargetedContextPacket,
): ContextPlanningSummary {
  const included = packet.selectedCandidateSummaries;
  const omitted = packet.omittedCandidateSummaries;
  const likelyRelatedFiles = included
    .filter((source) => source.kind !== "target-file-summary")
    .map((source) => source.pathLabel);
  const likelyTests = included
    .filter((source) => source.kind === "nearby-test")
    .map((source) => source.pathLabel);
  const suggestedNextReads = omitted.length > 0
    ? omitted.slice(0, 6).map((source) => source.pathLabel)
    : included.length <= 1
      ? [`read related tests or docs for ${packet.targetSafeLabel}`]
      : [];
  const missing = [
    ...(likelyTests.length === 0 ? ["nearby tests not included"] : []),
    ...(suggestedNextReads.length > 0
      ? ["some related context remains unread or unavailable"]
      : []),
  ];
  const executionReadiness =
    packet.completenessStatus === "complete"
      ? "ready"
      : packet.completenessStatus === "partial"
        ? "needs-more-context"
        : "needs-more-context";

  return {
    packetId: packet.packetId,
    known: [
      `target ${packet.targetSafeLabel} inspected`,
      `included context sources: ${included.length}`,
      `omitted context sources: ${omitted.length}`,
      `mutation authority: ${packet.mutationAuthority}`,
    ],
    missing,
    likelyRelatedFiles,
    likelyTests,
    suggestedNextReads,
    suggestedVerificationCandidates: likelyTests,
    confidence: packet.confidence,
    executionReadiness,
    mutationAuthority: "not-granted",
    replaySafeSummary: [
      `context-plan ${packet.packetId}`,
      `readiness=${executionReadiness}`,
      `suggestedReads=${suggestedNextReads.length}`,
      `tests=${likelyTests.length}`,
      "mutationAuthority=not-granted",
    ].join("; "),
    evidence: [
      `context-plan:packet:${packet.packetId}`,
      `context-plan:readiness:${executionReadiness}`,
      `context-plan:confidence:${packet.confidence}`,
      "context-plan:mutation-authority:not-granted",
    ],
  };
}

