import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapTerminalToOrchestrationResult } from "../../../core/query/mapping/mapper.js";
import { buildSingleFileUpdatePatchApprovalContract } from "../../../edit/authority/approval/production.js";
import {
  buildSingleFileApplyPatchResultMapperConsumerContract,
  type SingleFileApplyPatchResultMapperConsumerContract,
} from "./mapper.js";
import { buildSingleFileApplyPatchDryRun } from "../../../edit/patch/apply/dryRun.js";
import { buildSingleFileApplyPatchRuntimeBridge } from "./runtime.js";
import { buildSingleFileApplyPatchStaleReadContract } from "../../../edit/patch/apply/staleRead.js";
import {
  buildSingleFileApplyPatchTerminalSurface,
  type SingleFileApplyPatchTerminalSurface,
} from "./terminal.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch resultMapper consumer contract", () => {
  it("maps dry-run-ready through resultMapper as non-success", () => {
    const contract = consumerContract(dryRunReadySurface());
    const result = mapTerminalToOrchestrationResult(
      contract.resultMapperInput.state,
      contract.resultMapperInput.terminal,
    );

    expect(contract.status).toBe("dry-run-ready");
    expect(contract.mapperConsumerSafe).toBe(true);
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalClassification).not.toBe("success");
    expect(result.stopReason).toContain("dry-run preview");
    expectNoMapperMutationSuccess(contract);
  });

  it("maps stale-read blocked through resultMapper as non-success with actionable blocker", () => {
    const contract = consumerContract(staleReadBlockedSurface());
    const result = mapTerminalToOrchestrationResult(
      contract.resultMapperInput.state,
      contract.resultMapperInput.terminal,
    );

    expect(contract.status).toBe("blocked");
    expect(contract.blockerKind).toBe("stale-read");
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalClassification).not.toBe("success");
    expect(result.stopReason).toContain("changed after preview");
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining(["actionable-blocker-kind:stale-read"]),
    );
    expect(contract.nextAction).toContain("Re-read");
    expect(contract.doNext).toBe(contract.nextAction);
    expectNoMapperMutationSuccess(contract);
  });

  it("maps target-missing blocked through resultMapper as non-success and preserves target-missing evidence", () => {
    const contract = consumerContract(targetMissingBlockedSurface());
    const result = mapTerminalToOrchestrationResult(
      contract.resultMapperInput.state,
      contract.resultMapperInput.terminal,
    );

    expect(contract.status).toBe("blocked");
    expect(contract.blockerKind).toBe("target-missing");
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.stopReason).toContain("target is missing");
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "single-file-apply-patch-resultmapper-consumer:blocker:target-missing",
        "actionable-blocker-kind:patch-target-missing",
      ]),
    );
    expect(contract.nextAction).toContain("Re-read");
    expectNoMapperMutationSuccess(contract);
  });

  it("maps permission-pending through resultMapper as non-success without approved/write intent leakage", () => {
    const contract = consumerContract(permissionPendingSurface());
    const result = mapTerminalToOrchestrationResult(
      contract.resultMapperInput.state,
      contract.resultMapperInput.terminal,
    );

    expect(contract.status).toBe("permission-pending");
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalClassification).not.toBe("success");
    expect(result.stopReason).toContain("explicit permission");
    expect(contract.codingResult.verification.status).toBe("blocked");
    expect(contract.nextAction).toContain("explicit permission");
    expectNoMapperMutationSuccess(contract);
  });

  it("keeps preview files in attempted/evidence only, never changedFiles", () => {
    for (const surface of [
      dryRunReadySurface(),
      staleReadBlockedSurface(),
      targetMissingBlockedSurface(),
      permissionPendingSurface(),
    ]) {
      const contract = consumerContract(surface);
      const result = mapTerminalToOrchestrationResult(
        contract.resultMapperInput.state,
        contract.resultMapperInput.terminal,
      );

      expect(contract.wouldChangeFiles).toEqual(["src/app.ts"]);
      expect(contract.previewChangedFiles).toEqual(["src/app.ts"]);
      expect(contract.attemptedFiles).toContain("src/app.ts");
      expect(contract.changedFiles).toEqual([]);
      expect(contract.codingResult.changedFiles).toEqual([]);
      expect(contract.codingResult.changeSet.changedFiles).toEqual([]);
      expect(result.codingResult?.changedFiles).toEqual([]);
      expect(result.codingResult?.changeSet.attemptedFiles).toContain(
        "src/app.ts",
      );
      expectNoMapperMutationSuccess(contract);
    }
  });
});

function consumerContract(
  surface: SingleFileApplyPatchTerminalSurface,
): SingleFileApplyPatchResultMapperConsumerContract {
  return buildSingleFileApplyPatchResultMapperConsumerContract({
    runtimeBridge: buildSingleFileApplyPatchRuntimeBridge({
      terminalSurface: surface,
    }),
  });
}

function dryRunReadySurface(): SingleFileApplyPatchTerminalSurface {
  return buildSingleFileApplyPatchTerminalSurface({
    dryRun: dryRun({
      "src/app.ts": "old\n",
    }),
  });
}

function permissionPendingSurface(): SingleFileApplyPatchTerminalSurface {
  const dryRunResult = dryRun({
    "src/app.ts": "old\n",
  });
  const staleRead = buildSingleFileApplyPatchStaleReadContract({
    baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
    currentContent: "old\n",
    phase: "write-decision-dry-run",
    dryRun: true,
  });
  const approval = buildSingleFileUpdatePatchApprovalContract(
    buildReadinessFromDryRunApproval(dryRunResult.approval),
    {
      staleRead,
      decision: "approved",
    },
  );
  return buildSingleFileApplyPatchTerminalSurface({
    dryRun: dryRunResult,
    staleRead,
    approval,
  });
}

function staleReadBlockedSurface(): SingleFileApplyPatchTerminalSurface {
  const dryRunResult = dryRun({
    "src/app.ts": "old\n",
  });
  const staleRead = buildSingleFileApplyPatchStaleReadContract({
    baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
    currentContent: "changed\n",
    phase: "write-decision-dry-run",
    dryRun: true,
  });
  const approval = buildSingleFileUpdatePatchApprovalContract(
    buildReadinessFromDryRunApproval(dryRunResult.approval),
    { staleRead },
  );
  return buildSingleFileApplyPatchTerminalSurface({
    dryRun: dryRunResult,
    staleRead,
    approval,
  });
}

function targetMissingBlockedSurface(): SingleFileApplyPatchTerminalSurface {
  const dryRunResult = dryRun({
    "src/app.ts": "old\n",
  });
  const staleRead = buildSingleFileApplyPatchStaleReadContract({
    baseEvidence: expectBaseEvidence(dryRunResult.baseEvidence),
    currentContent: undefined,
    phase: "write-decision-dry-run",
    dryRun: true,
  });
  const approval = buildSingleFileUpdatePatchApprovalContract(
    buildReadinessFromDryRunApproval(dryRunResult.approval),
    { staleRead },
  );
  return buildSingleFileApplyPatchTerminalSurface({
    dryRun: dryRunResult,
    staleRead,
    approval,
  });
}

function dryRun(
  files: Readonly<Record<string, string>>,
): ReturnType<typeof buildSingleFileApplyPatchDryRun> {
  return buildSingleFileApplyPatchDryRun({
    workspaceRoot,
    rawPatchText: [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
    ].join("\n"),
    dryRun: true,
    readFile: (absolutePath) => files[path.relative(workspaceRoot, absolutePath)],
  });
}

type DryRunResult = ReturnType<typeof buildSingleFileApplyPatchDryRun>;
type BaseEvidence = NonNullable<DryRunResult["baseEvidence"]>;
type Approval = DryRunResult["approval"];

function expectBaseEvidence(
  baseEvidence: DryRunResult["baseEvidence"],
): BaseEvidence {
  if (!baseEvidence) {
    throw new Error("Expected dry-run base evidence");
  }
  return baseEvidence;
}

function buildReadinessFromDryRunApproval(
  approval: Approval,
): Parameters<typeof buildSingleFileUpdatePatchApprovalContract>[0] {
  if (approval.decision !== "pending") {
    throw new Error("Expected dry-run approval metadata to be pending");
  }
  return {
    ready: true,
    permissionMetadata: {
      capability: "single-file-update-apply-patch-readiness",
      operationKind: "update",
      targetPath: approval.targetPath,
      previewSummary: approval.metadata.previewSummary,
      additions: approval.metadata.additions,
      deletions: approval.metadata.deletions,
      singleFileOnly: true,
      unsupportedOperations: ["multi-file", "add", "delete", "move"],
      willWrite: false,
    },
    result: {
      status: "ready",
      changedFiles: approval.targetPath ? [approval.targetPath] : [],
      failedFiles: [],
      patches: approval.metadata.files.map((file) => ({
        path: file.path,
        operation: "update" as const,
        status: "previewed" as const,
        additions: file.additions,
        deletions: file.deletions,
      })),
      evidence: ["test:readiness-from-dry-run-approval"],
      nextAction: "Keep this contract no-write.",
    },
    noPartial: {
      atomicity: "verify-all-before-write",
      writeIntents: 1,
      blockedWrites: false,
    },
  };
}

function expectNoMapperMutationSuccess(
  contract: SingleFileApplyPatchResultMapperConsumerContract,
): void {
  expect(contract.willWrite).toBe(false);
  expect(contract.changedFiles).toEqual([]);
  expect(contract.writeIntents).toEqual([]);
  expect(contract.codingResult.changedFiles).toEqual([]);
  expect(contract.codingResult.changeSet.postRunDirtyFiles).toEqual([]);
  expect(contract.codingResult.patches?.every((patch) => patch.status !== "applied")).toBe(
    true,
  );
  expect(contract.codingResult.verification.status).not.toBe("passed");
  expect(contract.codingResult.taskSatisfaction.verdict).not.toBe("satisfied");
  expect(contract.codingResult.evidence).not.toContain("write-success");
  expect(contract.codingResult.evidence).not.toContain("mutation-success");
  expect(contract.mapperSafetyProof).toEqual({
    noMutationSuccess: true,
    noWriteSuccess: true,
    noAppliedPatchRecord: true,
    noApprovedDecision: true,
    noChangedFiles: true,
    previewFilesOnlyInAttemptedOrEvidence: true,
    mapsCompletedTerminalToNonSuccess: true,
  });
}
