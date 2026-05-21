import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { buildEditRepairProposalReview } from "./editProposalReview.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import { buildVerificationRepairContext } from "./verificationRepairContext.js";
import {
  planVerificationRepairHunkSetHandoff,
  planVerificationRepairLoop,
} from "./verificationRepairPlanner.js";

describe("verificationRepairPlanner", () => {
  it("creates context-aware fake-provider repair proposals no-write with context packet and Agent Plan ids", async () => {
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const context = contextFixture(packet, agentPlan);
    const plan = await planVerificationRepairLoop({
      context,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider: {
        proposeRepair: (promptContext) => {
          expect(promptContext.repairLoopId).toBe(context.repairLoopId);
          expect(promptContext.contextPacketId).toBe(packet.packetId);
          expect(promptContext.agentPlanId).toBe(agentPlan.planId);
          expect(promptContext.mutationAuthority).toBe("not-granted");
          expect(promptContext.providerPrompt).toContain("Return a bounded repair proposal only");
          return {
            hunks: [
              {
                hunkId: "repair-h1",
                targetPath: "src/app.ts",
                summary: "repair failing assertion",
                oldText: "old",
                newText: "new",
              },
            ],
          };
        },
      },
    });

    expect(plan.status).toBe("repair-loop-review-required");
    expect(plan.changedFiles).toEqual([]);
    expect(plan.mutationAuthority).toBe("not-granted");
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "verification-repair-planner:provider-call:fake-or-opt-in",
        "verification-repair-planner:no-provider-call-during-apply",
        "verification-repair-planner:mutation:not-run",
        `verification-repair-prompt:context-packet:${packet.packetId}`,
        `verification-repair-prompt:agent-plan:${agentPlan.planId}`,
      ]),
    );
  });

  it("stops missing verification or context before provider invocation", async () => {
    let calls = 0;
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const provider = {
      proposeRepair: () => {
        calls += 1;
        return { hunks: [{ targetPath: "src/app.ts", oldText: "a", newText: "b" }] };
      },
    };
    const missingVerification = await planVerificationRepairLoop({
      context: buildVerificationRepairContext({
        contextPacket: packet,
        agentPlan,
        failedFiles: [{ path: "src/app.ts" }],
      }),
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider,
    });
    const missingContext = await planVerificationRepairLoop({
      context: buildVerificationRepairContext({
        verification: { status: "failed", reason: "verification failed" },
        failedFiles: [{ path: "src/app.ts" }],
      }),
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider,
    });

    expect(missingVerification.status).toBe("repair-loop-missing-verification");
    expect(missingContext.status).toBe("repair-loop-missing-context");
    expect(calls).toBe(0);
    expect(missingContext.evidence).toContain(
      "verification-repair-planner:provider-call:not-run-or-invalid",
    );
  });

  it("preserves provider unavailable, opt-in, and invalid repair proposal stopped states", async () => {
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const context = contextFixture(packet, agentPlan);
    const notConfigured = await planVerificationRepairLoop({
      context,
      availability: { kind: "not-configured" },
    });
    const optIn = await planVerificationRepairLoop({
      context,
      availability: { kind: "opt-in-required" },
    });
    const invalid = await planVerificationRepairLoop({
      context,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [{ hunkId: "bad", targetPath: "src/other.ts", oldText: "a", newText: "b" }],
      },
    });

    expect(notConfigured.status).toBe("repair-loop-provider-not-configured");
    expect(optIn.status).toBe("repair-loop-provider-opt-in-required");
    expect(invalid.status).toBe("repair-loop-proposal-invalid");
    expect(invalid.changedFiles).toEqual([]);
    expect(invalid.evidence).toContain("verification-repair-planner:mutation:not-run");
  });

  it("marks exact hunk-set handoff only after explicit repair confirmation", async () => {
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const plan = await planVerificationRepairLoop({
      context: contextFixture(packet, agentPlan),
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [
          { hunkId: "h1", targetPath: "src/app.ts", oldText: "a", newText: "b" },
          { hunkId: "h2", targetPath: "src/app.ts", oldText: "c", newText: "d" },
        ],
      },
    });
    if (!plan.editRepairPlan || !("manifest" in plan.editRepairPlan) || !plan.editRepairPlan.manifest) {
      throw new Error("expected repair manifest");
    }
    const review = buildEditRepairProposalReview(plan.editRepairPlan.manifest);
    const selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });

    const handoff = planVerificationRepairHunkSetHandoff({ plan, selection });

    expect(handoff.status).toBe("repair-loop-ready-for-hunk-set-handoff");
    expect(handoff.changedFiles).toEqual([]);
    expect(handoff.evidence).toEqual(
      expect.arrayContaining([
        "verification-repair-planner:handoff:existing-hunk-set-route",
        "verification-repair-planner:exact-hunk-set-only",
      ]),
    );
  });
});

function contextFixture(packet: TargetedContextPacket, agentPlan: ReturnType<typeof planFixture>) {
  return buildVerificationRepairContext({
    sourceEditTransactionId: "txn-verify-repair",
    contextPacket: packet,
    agentPlan,
    verification: { status: "failed", reason: "verification failed" },
    failedFiles: [{ path: "src/app.ts" }],
    changedFiles: ["src/app.ts"],
    runtimeReceiptMarkers: ["runtime-receipt-result:failed"],
  });
}

function packetFixture(): TargetedContextPacket {
  return {
    packetId: "ctx_repair_planner",
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
    replaySafeSummary: "context-packet ctx_repair_planner",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_repair_planner"],
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
