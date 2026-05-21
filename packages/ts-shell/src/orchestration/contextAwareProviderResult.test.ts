import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { planContextAwareProviderProposal } from "./contextAwareProviderProposal.js";
import { buildContextAwareProviderProposalResult } from "./contextAwareProviderResult.js";
import type { TargetedContextPacket } from "./contextPacket.js";

describe("contextAwareProviderResult", () => {
  it("projects context-aware provider proposal evidence through stopped no-write result surface", async () => {
    const packet = buildPacket();
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
    const proposalPlan = await planContextAwareProviderProposal({
      requestId: "req-result",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      userRequest: "rename runApp",
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider: {
        proposeEdit: () => ({
          operationKind: "generated-replacement",
          targets: [{ path: "src/app.ts", summary: "rename runApp" }],
        }),
      },
    });

    const result = buildContextAwareProviderProposalResult({
      sessionId: "sess_context_provider",
      prompt: "use context-aware provider proposal",
      plan: proposalPlan,
    });

    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalReason).toBe("stopped_error");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.continuation.evidence.join("\n")).toContain(
      `contextPacket=${packet.packetId}`,
    );
    expect(result.codingResult?.continuation.evidence.join("\n")).toContain(
      `agentPlan=${plan.planId}`,
    );
    expect(result.codingResult?.evidence).toContain(
      "context-aware-provider-result:mutation:not-run",
    );
    expect(JSON.stringify(result)).not.toContain(".private-agents-real");
  });
});

function buildPacket(): TargetedContextPacket {
  return {
    packetId: "ctx_result",
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
      bytesUsed: 200,
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
        byteLength: 100,
        redactionApplied: false,
      },
      {
        kind: "nearby-test",
        pathLabel: "src/app.test.ts",
        relation: "nearby test",
        status: "included",
        summary: "covers runApp",
        byteLength: 100,
        redactionApplied: false,
      },
    ],
    omittedCandidateSummaries: [],
    confidence: "high",
    completenessStatus: "complete",
    freshnessFacts: ["context-freshness:read-during-current-turn"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_result; target=src/app.ts",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_result"],
  };
}
