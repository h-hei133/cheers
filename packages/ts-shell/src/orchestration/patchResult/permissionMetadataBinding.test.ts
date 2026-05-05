import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSingleFileUpdatePatchApprovalContract,
  buildSingleFileUpdatePatchResultSurfaceContract,
} from "./productionGate.js";
import { buildSingleFileApplyPatchDryRun } from "./singleFileApplyPatchDryRun.js";
import { buildSingleFileApplyPatchStaleReadContract } from "./singleFileApplyPatchStaleRead.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch permission metadata binding", () => {
  it("keeps contract-ready stale-read approval pending with base evidence binding", () => {
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

    expect(approval.decision).toBe("pending");
    expect(approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(approval.metadata.baseEvidence).toEqual(dryRunResult.baseEvidence);
    expect(approval.metadata.baseEvidence).toEqual(
      expect.objectContaining({
        targetPath: "src/app.ts",
        digestAlgorithm: "sha256",
        capturedAtPhase: "dry-run-preview",
        source: "verify-readFile",
      }),
    );
    expect(approval.metadata.baseEvidence?.baseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      Object.prototype.hasOwnProperty.call(
        approval.metadata.baseEvidence,
        "baseContent",
      ),
    ).toBe(false);
    expect(approval.metadata.staleReadPrecondition).toEqual({
      required: true,
      phase: "write-decision-dry-run",
      requiredBefore: "write-decision",
      blocksWriteOn: ["stale-read", "target-missing"],
    });
  });

  it("forces approval blocked when stale-read revalidation detects changed content", () => {
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
      {
        staleRead,
      },
    );
    const surface = buildSingleFileUpdatePatchResultSurfaceContract({
      readiness: buildReadinessFromDryRunApproval(dryRunResult.approval),
      approval,
    });

    expect(staleRead.blocker).toBe("stale-read");
    expect(approval.decision).toBe("blocked");
    expect(approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(approval.metadata.baseEvidence).toEqual(dryRunResult.baseEvidence);
    expect(surface.changedFiles).toEqual([]);
    expect(surface.noWriteProof).toEqual(
      expect.objectContaining({
        willWrite: false,
        writeIntentCount: 0,
        blockedWrites: true,
      }),
    );
  });

  it("forces approval blocked when stale-read revalidation detects missing target", () => {
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
      {
        staleRead,
      },
    );
    const surface = buildSingleFileUpdatePatchResultSurfaceContract({
      readiness: buildReadinessFromDryRunApproval(dryRunResult.approval),
      approval,
    });

    expect(staleRead.blocker).toBe("target-missing");
    expect(approval.decision).toBe("blocked");
    expect(approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(approval.metadata.baseEvidence).toEqual(dryRunResult.baseEvidence);
    expect(surface.changedFiles).toEqual([]);
    expect(surface.noWriteProof.writeIntentCount).toBe(0);
  });

  it("preserves dry-run no-write terminal contract while exposing bound metadata", () => {
    const dryRunResult = dryRun({
      "src/app.ts": "old\n",
    });

    expect(dryRunResult.willWrite).toBe(false);
    expect(dryRunResult.changedFiles).toEqual([]);
    expect(dryRunResult.writeIntents).toEqual([]);
    expect(dryRunResult.noWriterInvoked).toBe(true);
    expect(dryRunResult.approval.writeIntent).toEqual({
      authorized: false,
      count: 0,
    });
  });
});

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
