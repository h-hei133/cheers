import { describe, expect, it } from "vitest";
import { createCommandRuntimeReceipt } from "../core/runtime/runtimeReceipt.js";
import { projectRuntimeReceipt } from "../core/runtime/runtimeReceiptProjection.js";
import { buildAgentPlan } from "./agentPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { ToolLifecycleResult } from "./flowDispatch.js";
import { buildVerificationCommandResult } from "./verificationCommandResult.js";
import { buildVerificationCommandPlan } from "../verification/command/plan.js";
import { bridgeVerificationCommandToRepairLoop } from "./verificationRepairBridge.js";

describe("verificationRepairBridge", () => {
  it("creates Route 185 repair proposal from failed command verification without mutation", async () => {
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const commandResult = buildVerificationCommandResult({
      plan: buildVerificationCommandPlan({ agentPlan, requireContext: true }),
      result: failedCommandResult(),
    });
    const bridge = await bridgeVerificationCommandToRepairLoop({
      sessionId: "sess_bridge",
      prompt: "verify then repair",
      commandResult,
      contextPacket: packet,
      agentPlan,
      sourceEditTransactionId: "txn_bridge",
      changedFiles: ["src/app.ts"],
      failedFiles: [{ path: "src/app.ts", reason: "test failed" }],
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [
          {
            hunkId: "h1",
            targetPath: "src/app.ts",
            oldText: "old",
            newText: "new",
          },
        ],
      },
    });

    expect(bridge.status).toBe("repair-review-required");
    expect(bridge.context?.status).toBe("repair-loop-context-created");
    expect(bridge.plan?.status).toBe("repair-loop-review-required");
    expect(bridge.result?.status).toBe("stopped_error");
    expect(bridge.providerCall).toBe("proposal-only");
    expect(bridge.mutation).toBe("not-run");
    expect(bridge.evidence).toEqual(
      expect.arrayContaining([
        "verification-repair-bridge:no-automatic-repair",
        "verification-repair-bridge:mutation:not-run",
        "verification-repair-planner:review-required",
        "verification-command-result:outcome:failed",
      ]),
    );
    expect(bridge.result?.codingResult?.continuation.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining("verification-repair-loop id="),
        expect.stringContaining("runtimeReceipts="),
      ]),
    );
  });

  it("does not open repair loop for blocked command verification", async () => {
    const commandResult = buildVerificationCommandResult({
      plan: buildVerificationCommandPlan({ explicitCommand: "npm run deploy" }),
    });
    const bridge = await bridgeVerificationCommandToRepairLoop({
      sessionId: "sess_bridge_blocked",
      prompt: "verify unsupported",
      commandResult,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
    });

    expect(bridge.status).toBe("repair-not-eligible");
    expect(bridge.context).toBeUndefined();
    expect(bridge.providerCall).toBe("not-run");
    expect(bridge.evidence).toContain(
      "verification-repair-bridge:status:repair-not-eligible",
    );
  });
});

function failedCommandResult(): ToolLifecycleResult {
  const receipt = projectRuntimeReceipt(
    createCommandRuntimeReceipt({
      command: "npm test -- --help",
      status: "failed",
      executionPath: "fake-runtime",
      exitCode: 1,
      stderr: "test failed",
    }),
  );
  return {
    success: false,
    error: "test failed",
    metadata: { runtimeReceipt: receipt },
    projection: {
      kind: "tool-execution-failed",
      legacySuccess: false,
      reason: "test failed",
      failureBoundary: "tool-execution-failed",
      toolName: "bash",
    },
  };
}

function packetFixture(): TargetedContextPacket {
  return {
    packetId: "ctx_route_186",
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
    replaySafeSummary: "context-packet ctx_route_186",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_route_186"],
  };
}

function planFixture(packet: TargetedContextPacket) {
  return buildAgentPlan({
    ownerCapability: "edit-patch",
    taskKind: "edit-file",
    requestedActionKind: "verify",
    targetSummary: packet.targetSafeLabel,
    contextPacketIds: [packet.packetId],
    contextCompleteness: "complete",
    confidence: "high",
    executionReadiness: "ready",
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: ["npm test -- --help"],
    safeEvidenceMarkers: [],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    doNext: "run verification",
  });
}
