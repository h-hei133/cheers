import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import {
  buildVerificationRepairContext,
  buildVerificationRepairContextFromCodingResult,
} from "./verificationRepairContext.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { CodingResultSummary } from "./types.js";

describe("verificationRepairContext", () => {
  it("creates safe repair-loop context from failed verification with receipt, context packet, and Agent Plan ids", () => {
    const packet = packetFixture();
    const plan = planFixture(packet);
    const context = buildVerificationRepairContext({
      sourceEditTransactionId: "txn-1",
      sourceProposalId: "proposal-1",
      contextPacket: packet,
      agentPlan: plan,
      verification: {
        status: "failed",
        command: "npm test -- app",
        reason: "expected 1 received 2",
        nextAction: "review failed assertion",
      },
      failedFiles: [{ path: "src/app.ts", reason: "assertion failed" }],
      changedFiles: ["src/app.ts"],
      runtimeReceiptMarkers: [
        "runtime-receipt-result:failed",
        "unsafe-provider-token",
      ],
    });

    expect(context.status).toBe("repair-loop-context-created");
    expect(context.sourceContextPacketId).toBe(packet.packetId);
    expect(context.sourceAgentPlanId).toBe(plan.planId);
    expect(context.sourceTaskLifecycleId).toBe("task_lifecycle_repair");
    expect(context.sourceAnalysisBriefId).toBe("analysis_brief_repair");
    expect(context.sourceTaskExecutionPlanId).toBe("task_execution_plan_repair");
    expect(context.runtimeReceiptMarkers).toEqual(["runtime-receipt-result:failed"]);
    expect(context.changedFileLabels).toEqual(["src/app.ts"]);
    expect(context.safeSummary).toContain("raw-content-excluded");
    expect(context.evidence).toEqual(
      expect.arrayContaining([
        `verification-repair-context:context-packet:${packet.packetId}`,
        `verification-repair-context:agent-plan:${plan.planId}`,
        "verification-repair-context:task-lifecycle:task_lifecycle_repair",
        "verification-repair-context:analysis-brief:analysis_brief_repair",
        "verification-repair-context:runtime-receipts:1",
        "verification-repair-context:mutation:not-run",
      ]),
    );
  });

  it("classifies missing verification and missing context before provider planning", () => {
    const missingVerification = buildVerificationRepairContext({
      contextPacket: packetFixture(),
      agentPlan: planFixture(packetFixture()),
      failedFiles: [{ path: "src/app.ts" }],
    });
    const missingContext = buildVerificationRepairContext({
      verification: { status: "failed", reason: "verification failed" },
      failedFiles: [{ path: "src/app.ts" }],
    });

    expect(missingVerification.status).toBe("repair-loop-missing-verification");
    expect(missingContext.status).toBe("repair-loop-missing-context");
    expect(missingContext.omittedEvidenceReasons).toContain(
      "context-packet-or-agent-plan-missing",
    );
  });

  it("builds from coding result without raw content or mutation authority", () => {
    const packet = packetFixture();
    const plan = planFixture(packet);
    const context = buildVerificationRepairContextFromCodingResult({
      codingResult: codingResultFixture(),
      contextPacket: packet,
      agentPlan: plan,
      sourceEditTransactionId: "txn-from-result",
    });

    expect(context.status).toBe("repair-loop-context-created");
    expect(context.transcriptSummary).toContain("sourceTransaction=txn-from-result");
    expect(context.transcriptSummary).toContain(`contextPacket=${packet.packetId}`);
    expect(context.transcriptSummary).toContain("raw-content-excluded");
    expect(context.safeFailureExcerpt).not.toContain("/home/wang/.private-agents-real");
  });
});

function packetFixture(): TargetedContextPacket {
  return {
    packetId: "ctx_repair",
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
    replaySafeSummary: "context-packet ctx_repair",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_repair"],
  };
}

function planFixture(packet: TargetedContextPacket) {
  return buildAgentPlan({
    ownerCapability: "edit-patch",
    taskKind: "edit-file",
    requestedActionKind: "edit",
    targetSummary: packet.targetSafeLabel,
    taskLifecycleId: "task_lifecycle_repair",
    analysisBriefId: "analysis_brief_repair",
    taskExecutionPlanId: "task_execution_plan_repair",
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

function codingResultFixture(): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: ["src/app.ts"],
    failedFiles: [{ path: "src/app.ts", reason: "failed verification" }],
    repair: {
      status: "failed",
      attempts: 0,
      recoveredItems: [],
      failedItems: ["src/app.ts"],
      notes: [],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 0,
      evidence: ["runtime-receipt-stderr:test failed"],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: ["src/app.ts"],
      attemptedFiles: ["src/app.ts"],
      changedFiles: ["src/app.ts"],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: ["verification failed"],
      requiredEvidence: [],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [{ path: "src/app.ts", reason: "verification failed" }],
    verification: {
      status: "failed",
      command: "npm test -- app",
      reason: "failed near /home/wang/.private-agents-real/config",
    },
    evidence: ["runtime-receipt-result:failed"],
  };
}
