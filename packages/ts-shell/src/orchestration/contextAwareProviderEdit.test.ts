import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { buildContextAwareProviderEditInput } from "./contextAwareProviderEdit.js";
import type { TargetedContextPacket } from "./contextPacket.js";

describe("contextAwareProviderEdit", () => {
  it("projects context packet and Agent Plan facts into provider proposal input", () => {
    const packet = buildPacket({ completenessStatus: "complete" });
    const plan = buildAgentPlan({
      ownerCapability: "edit-patch",
      taskKind: "edit-file",
      requestedActionKind: "edit",
      targetSummary: "src/app.ts",
      contextPacketIds: [packet.packetId],
      contextCompleteness: "complete",
      confidence: "high",
      executionReadiness: "ready",
      missingFacts: [],
      suggestedReads: ["src/app.test.ts"],
      suggestedVerification: ["npm test -- app"],
      safeEvidenceMarkers: [],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      doNext: "review provider proposal",
    });

    const input = buildContextAwareProviderEditInput({
      requestId: "req-1",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      providerReadinessState: "available",
    });

    expect(input.status).toBe("ready");
    expect(input.contextPacketId).toBe(packet.packetId);
    expect(input.agentPlanId).toBe(plan.planId);
    expect(input.planConfidence).toBe("high");
    expect(input.suggestedReads).toEqual(["src/app.test.ts"]);
    expect(input.mutationAuthority).toBe("not-granted");
  });

  it("stops when context is missing, over budget, or Agent Plan needs more context", () => {
    const completePacket = buildPacket({ completenessStatus: "complete" });
    const overBudgetPacket = buildPacket({
      completenessStatus: "partial",
      omittedReason: "file byte budget exceeded",
    });
    const readyPlan = buildPlan(completePacket, "ready");
    const needsContextPlan = buildPlan(completePacket, "needs-more-context");

    expect(
      buildContextAwareProviderEditInput({
        requestId: "req-missing",
        targetSummary: "src/app.ts",
        providerReadinessState: "available",
      }).status,
    ).toBe("missing-context");
    expect(
      buildContextAwareProviderEditInput({
        requestId: "req-budget",
        targetSummary: "src/app.ts",
        contextPacket: overBudgetPacket,
        agentPlan: readyPlan,
        providerReadinessState: "available",
      }).status,
    ).toBe("context-over-budget");
    expect(
      buildContextAwareProviderEditInput({
        requestId: "req-plan",
        targetSummary: "src/app.ts",
        contextPacket: completePacket,
        agentPlan: needsContextPlan,
        providerReadinessState: "available",
      }).status,
    ).toBe("plan-needs-more-context");
  });
});

function buildPlan(
  packet: TargetedContextPacket,
  executionReadiness: "ready" | "needs-more-context",
) {
  return buildAgentPlan({
    ownerCapability: "edit-patch",
    taskKind: "edit-file",
    requestedActionKind: "edit",
    targetSummary: packet.targetSafeLabel,
    contextPacketIds: [packet.packetId],
    contextCompleteness:
      executionReadiness === "ready" ? "complete" : "partial",
    confidence: executionReadiness === "ready" ? "high" : "medium",
    executionReadiness,
    missingFacts:
      executionReadiness === "ready" ? [] : ["nearby tests not included"],
    suggestedReads:
      executionReadiness === "ready" ? [] : ["src/app.test.ts"],
    suggestedVerification: ["npm test -- app"],
    safeEvidenceMarkers: [],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    doNext: "review provider proposal",
  });
}

function buildPacket(input: {
  readonly completenessStatus: TargetedContextPacket["completenessStatus"];
  readonly omittedReason?: string;
}): TargetedContextPacket {
  return {
    packetId: input.omittedReason ? "ctx_budget" : "ctx_ready",
    rootTargetFile: "src/app.ts",
    targetSafeLabel: "src/app.ts",
    targetKind: "explicit-code-target",
    readBudget: {
      limits: {
        maxCandidateCount: 24,
        maxFilesRead: 12,
        maxBytesPerFile: 8000,
        maxTotalBytes: 32000,
      },
      filesRead: 2,
      bytesUsed: 120,
      includedCount: 2,
    },
    contextSources: [],
    selectedCandidateSummaries: [
      {
        kind: "target-file-summary",
        pathLabel: "src/app.ts",
        relation: "target file",
        status: "included",
        summary: "exports runApp",
        byteLength: 80,
        redactionApplied: false,
      },
    ],
    omittedCandidateSummaries: input.omittedReason
      ? [
          {
            kind: "omitted-over-budget-candidate",
            pathLabel: "src/large.ts",
            relation: "sibling",
            status: "omitted",
            reason: input.omittedReason,
            byteLength: 9000,
            redactionApplied: false,
          },
        ]
      : [],
    confidence: input.completenessStatus === "complete" ? "high" : "medium",
    completenessStatus: input.completenessStatus,
    freshnessFacts: ["context-freshness:read-during-current-turn"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_ready; target=src/app.ts",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_ready"],
  };
}
