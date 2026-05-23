import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { applyEditProposalSelection } from "./editProposalApply.js";
import { buildEditRepairProposalReview } from "./editProposalReview.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import { buildVerificationRepairContext } from "./verificationRepairContext.js";
import {
  planVerificationRepairHunkSetHandoff,
  planVerificationRepairLoop,
} from "./verificationRepairPlanner.js";
import { buildVerificationRepairResult } from "./verificationRepairResult.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("verificationRepairResult", () => {
  it("projects review-required repair proposal into Result Surface and Continue evidence without mutation", async () => {
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const context = contextFixture(packet, agentPlan);
    const plan = await planVerificationRepairLoop({
      context,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [{ hunkId: "h1", targetPath: "src/app.ts", oldText: "old", newText: "new" }],
      },
    });
    const review = plan.editRepairPlan && "manifest" in plan.editRepairPlan && plan.editRepairPlan.manifest
      ? buildEditRepairProposalReview(plan.editRepairPlan.manifest)
      : undefined;

    const result = buildVerificationRepairResult({
      sessionId: "sess-verification-repair",
      prompt: "repair failed verification",
      context,
      plan,
      review,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.finalOutput).toContain("Automatic repair: no");
    expect(result.finalOutput).not.toContain("old");
    expect(result.finalOutput).not.toContain("new");
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "verification-repair-result:state:repair-review-required",
        "verification-repair-result:no-automatic-repair",
        "verification-repair-result:provider-call-during-apply:not-run",
        "verification-repair-result:raw-content-excluded",
      ]),
    );
    expect(result.codingResult?.continuation.evidence.join("\n")).toContain(
      `verification-repair-loop id=${context.repairLoopId}`,
    );
    expect(result.codingResult?.continuation.evidence.join("\n")).toContain(
      `contextPacket=${packet.packetId}`,
    );
    expect(result.codingResult?.continuation.evidence.join("\n")).toContain(
      `agentPlan=${agentPlan.planId}`,
    );
  });

  it("distinguishes missing context and provider unavailable stopped states", async () => {
    const missingContext = buildVerificationRepairContext({
      verification: { status: "failed", reason: "verification failed" },
      failedFiles: [{ path: "src/app.ts" }],
    });
    const missingPlan = await planVerificationRepairLoop({
      context: missingContext,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider: {
        proposeRepair: () => {
          throw new Error("provider should not be called");
        },
      },
    });
    const providerUnavailableContext = contextFixture(packetFixture(), planFixture(packetFixture()));
    const providerUnavailable = await planVerificationRepairLoop({
      context: providerUnavailableContext,
      availability: { kind: "not-configured" },
    });

    const missingResult = buildVerificationRepairResult({
      sessionId: "sess-missing-context",
      prompt: "repair failed verification",
      context: missingContext,
      plan: missingPlan,
    });
    const unavailableResult = buildVerificationRepairResult({
      sessionId: "sess-provider-unavailable",
      prompt: "repair failed verification",
      context: providerUnavailableContext,
      plan: providerUnavailable,
    });

    expect(missingResult.codingResult?.evidence).toContain(
      "verification-repair-result:state:repair-context-missing",
    );
    expect(unavailableResult.codingResult?.evidence).toContain(
      "verification-repair-result:state:repair-provider-unavailable",
    );
    expect(missingResult.codingResult?.changedFiles).toEqual([]);
    expect(unavailableResult.codingResult?.changedFiles).toEqual([]);
  });

  it("distinguishes context-created, invalid proposal, handoff-ready, and not-needed states", async () => {
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const context = contextFixture(packet, agentPlan);
    const contextOnly = buildVerificationRepairResult({
      sessionId: "sess-context-only",
      prompt: "repair failed verification",
      context,
    });
    const invalidPlan = await planVerificationRepairLoop({
      context,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [{ hunkId: "bad", targetPath: "src/other.ts", oldText: "a", newText: "b" }],
      },
    });
    const invalidResult = buildVerificationRepairResult({
      sessionId: "sess-invalid",
      prompt: "repair failed verification",
      context,
      plan: invalidPlan,
    });
    const plan = await planVerificationRepairLoop({
      context,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [{ hunkId: "h1", targetPath: "src/app.ts", oldText: "a", newText: "b" }],
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
    const handoffResult = buildVerificationRepairResult({
      sessionId: "sess-handoff",
      prompt: "repair failed verification",
      context,
      plan: handoff,
      review,
      selection,
    });
    const notNeededContext = buildVerificationRepairContext({
      contextPacket: packet,
      agentPlan,
      verification: { status: "passed", reason: "verification passed" },
      changedFiles: ["src/app.ts"],
    });
    const notNeededPlan = await planVerificationRepairLoop({
      context: notNeededContext,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
    });
    const notNeededResult = buildVerificationRepairResult({
      sessionId: "sess-not-needed",
      prompt: "repair passed verification",
      context: notNeededContext,
      plan: notNeededPlan,
    });

    expect(contextOnly.codingResult?.evidence).toContain(
      "verification-repair-result:state:repair-context-created",
    );
    expect(invalidResult.codingResult?.evidence).toContain(
      "verification-repair-result:state:repair-proposal-invalid",
    );
    expect(handoffResult.codingResult?.evidence).toContain(
      "verification-repair-result:state:repair-handoff-ready",
    );
    expect(notNeededResult.codingResult?.evidence).toContain(
      "verification-repair-result:state:repair-not-needed",
    );
    expect(handoffResult.codingResult?.changedFiles).toEqual([]);
  });

  it("reports confirmed exact repair hunk-set apply through the existing route", async () => {
    const fixture = createFixture({ "src/app.ts": "alpha\nmiddle\nomega\n" });
    const packet = packetFixture();
    const agentPlan = planFixture(packet);
    const context = contextFixture(packet, agentPlan);
    const plan = await planVerificationRepairLoop({
      context,
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      rawProposal: {
        hunks: [
          { hunkId: "h1", targetPath: "src/app.ts", oldText: "alpha", newText: "ALPHA" },
          { hunkId: "h2", targetPath: "src/app.ts", oldText: "omega", newText: "OMEGA" },
        ],
      },
    });
    if (!plan.editRepairPlan || !("manifest" in plan.editRepairPlan) || !plan.editRepairPlan.manifest || !("mappingByHunkId" in plan.editRepairPlan)) {
      throw new Error("expected repair manifest");
    }
    const review = buildEditRepairProposalReview(plan.editRepairPlan.manifest);
    const selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const handoff = planVerificationRepairHunkSetHandoff({ plan, selection });
    const applyResult = await applyEditProposalSelection({
      selection,
      mappingByHunkId: plan.editRepairPlan.mappingByHunkId,
      targetPathByLabel: new Map([["src/app.ts", "src/app.ts"]]),
      fencedOptions: fixture.options,
    });

    const unverifiedResult = buildVerificationRepairResult({
      sessionId: "sess-repair-applied",
      prompt: "apply confirmed repair",
      context,
      plan: handoff,
      review,
      selection,
      applyResult,
    });
    const result = buildVerificationRepairResult({
      sessionId: "sess-repair-verified",
      prompt: "apply confirmed repair",
      context,
      plan: handoff,
      review,
      selection,
      applyResult,
      postApplyVerification: {
        status: "passed",
        reason: "repair readback matched expected content",
        runtimeDerived: true,
        evidence: ["test-verification-repair-readback:status:passed"],
      },
    });

    expect(applyResult.status).toBe("hunk-set-applied");
    expect(unverifiedResult.status).toBe("stopped_error");
    expect(unverifiedResult.codingResult?.evidence).toContain(
      "verification-repair-result:state:repair-applied",
    );
    expect(result.status).toBe("completed");
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe("ALPHA\nmiddle\nOMEGA\n");
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "verification-repair-result:state:repair-verification-succeeded",
        "verification-repair-result:post-apply-verification:passed",
        "test-verification-repair-readback:status:passed",
        "verification-repair-result:apply-route:existing-hunk-set-or-exact-lane",
        "proposal-hunk-set-route:multi-hunk-exact-apply",
      ]),
    );
  });
});

function contextFixture(packet: TargetedContextPacket, agentPlan: ReturnType<typeof planFixture>) {
  return buildVerificationRepairContext({
    sourceEditTransactionId: "txn-verify-repair",
    sourceProposalId: "proposal-verify-repair",
    contextPacket: packet,
    agentPlan,
    verification: {
      status: "failed",
      command: "npm test -- app",
      reason: "verification failed",
    },
    failedFiles: [{ path: "src/app.ts" }],
    changedFiles: ["src/app.ts"],
    runtimeReceiptMarkers: ["runtime-receipt-result:failed"],
  });
}

function packetFixture(): TargetedContextPacket {
  return {
    packetId: "ctx_repair_result",
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
    replaySafeSummary: "context-packet ctx_repair_result",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_repair_result"],
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

function createFixture(files: Record<string, string>) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verification-repair-route-"));
  tempRoots.push(workspaceRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return {
    workspaceRoot,
    options: {
      workspaceRoot,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved" as const,
      defaultProductionRejectionUnchanged: true as const,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    },
  };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
