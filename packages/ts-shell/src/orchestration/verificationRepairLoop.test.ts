import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import { runVerificationRepairLoop } from "./verificationRepairLoop.js";

describe("verificationRepairLoop", () => {
  it("runs the review-gated facade without automatic repair mutation", async () => {
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const loop = await runVerificationRepairLoop({
      sessionId: "sess-loop",
      prompt: "repair failed verification",
      sourceEditTransactionId: "txn-loop",
      contextPacket: packet,
      agentPlan,
      verification: { status: "failed", reason: "verification failed" },
      failedFiles: [{ path: "src/app.ts" }],
      changedFiles: ["src/app.ts"],
      runtimeReceiptMarkers: ["runtime-receipt-result:failed"],
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [{ hunkId: "h1", targetPath: "src/app.ts", oldText: "old", newText: "new" }],
      },
    });

    expect(loop.context.status).toBe("repair-loop-context-created");
    expect(loop.plan.status).toBe("repair-loop-review-required");
    expect(loop.result.status).toBe("stopped_error");
    expect(loop.changedFiles).toEqual([]);
    expect(loop.mutationAuthority).toBe("not-granted");
    expect(loop.evidence).toEqual(
      expect.arrayContaining([
        "verification-repair-loop:facade",
        "verification-repair-loop:no-automatic-repair",
        "verification-repair-loop:mutation:not-run",
      ]),
    );
  });
});

function packetFixture(): TargetedContextPacket {
  return {
    packetId: "ctx_repair_loop",
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
      filesRead: 1,
      bytesUsed: 100,
      includedCount: 1,
    },
    contextSources: [],
    selectedCandidateSummaries: [],
    omittedCandidateSummaries: [],
    confidence: "high",
    completenessStatus: "complete",
    freshnessFacts: ["context-freshness:read-during-current-turn"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_repair_loop",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_repair_loop"],
  };
}

function planFixture(packet: TargetedContextPacket) {
  return buildAgentPlan({
    ownerCapability: "edit-patch",
    taskKind: "edit-file",
    requestedActionKind: "edit",
    targetSummary: packet.targetSafeLabel,
    contextPacketIds: [packet.packetId],
    contextCompleteness: "complete",
    confidence: "high",
    executionReadiness: "ready",
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: ["npm test -- app"],
    safeEvidenceMarkers: [],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    doNext: "review repair proposal",
  });
}
