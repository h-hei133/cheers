import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileUpdatePatchApprovalContract } from "./productionGate.js";
import { buildSingleFileApplyPatchDryRun } from "./singleFileApplyPatchDryRun.js";
import { buildSingleFileApplyPatchResultMapperConsumerContract } from "./singleFileApplyPatchResultMapperConsumer.js";
import {
  buildSingleFileApplyPatchResultMapperSeamContract,
  type SingleFileApplyPatchResultMapperSeamContract,
} from "./singleFileApplyPatchResultMapperSeam.js";
import { buildSingleFileApplyPatchRuntimeBridge } from "./singleFileApplyPatchRuntimeBridge.js";
import { buildSingleFileApplyPatchStaleReadContract } from "./singleFileApplyPatchStaleRead.js";
import {
  buildSingleFileApplyPatchTerminalSurface,
  type SingleFileApplyPatchTerminalSurface,
} from "./singleFileApplyPatchTerminalSurface.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch resultMapper safe seam contract", () => {
  it("projects dry-run-ready as mapper-safe non-success without raw metadata", () => {
    const seam = mapperSeam(dryRunReadySurface());

    expect(seam.status).toBe("dry-run-ready");
    expect(seam.terminalStatus).toBe("stopped_error");
    expect(seam.terminalClassification).toBe("stopped");
    expect(seam.terminalClassification).not.toBe("success");
    expect(seam.stopReason).toContain("dry-run preview");
    expectNoResultMapperSeamLeak(seam);
  });

  it("projects stale-read blocked with actionable next action and no success markers", () => {
    const seam = mapperSeam(staleReadBlockedSurface());

    expect(seam.status).toBe("blocked");
    expect(seam.terminalStatus).toBe("stopped_error");
    expect(seam.terminalClassification).toBe("stopped");
    expect(seam.stopReason).toContain("changed after preview");
    expect(seam.nextAction).toContain("Re-read");
    expect(seam.doNext).toBe(seam.nextAction);
    expectNoResultMapperSeamLeak(seam);
  });

  it("projects target-missing blocked without changed files or write intents", () => {
    const seam = mapperSeam(targetMissingBlockedSurface());

    expect(seam.status).toBe("blocked");
    expect(seam.terminalStatus).toBe("stopped_error");
    expect(seam.stopReason).toContain("target is missing");
    expect(seam.attemptedFiles).toContain("src/app.ts");
    expectNoResultMapperSeamLeak(seam);
  });

  it("projects permission-pending as non-success without permission grant leakage", () => {
    const seam = mapperSeam(permissionPendingSurface());

    expect(seam.status).toBe("permission-pending");
    expect(seam.terminalStatus).toBe("stopped_error");
    expect(seam.terminalClassification).toBe("stopped");
    expect(seam.stopReason).toContain("explicit permission");
    expect(seam.nextAction).toContain("explicit permission");
    expectNoResultMapperSeamLeak(seam);
  });

  it("keeps preview targets in preview fields only across seam statuses", () => {
    for (const surface of [
      dryRunReadySurface(),
      staleReadBlockedSurface(),
      targetMissingBlockedSurface(),
      permissionPendingSurface(),
    ]) {
      const seam = mapperSeam(surface);

      expect(seam.wouldChangeFiles).toEqual(["src/app.ts"]);
      expect(seam.previewChangedFiles).toEqual(["src/app.ts"]);
      expect(seam.changedFiles).toEqual([]);
      expect(seam.writeIntents).toEqual([]);
      expectNoResultMapperSeamLeak(seam);
    }
  });
});

function mapperSeam(
  surface: SingleFileApplyPatchTerminalSurface,
): SingleFileApplyPatchResultMapperSeamContract {
  return buildSingleFileApplyPatchResultMapperSeamContract({
    mapperConsumer: buildSingleFileApplyPatchResultMapperConsumerContract({
      runtimeBridge: buildSingleFileApplyPatchRuntimeBridge({
        terminalSurface: surface,
      }),
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

function expectNoResultMapperSeamLeak(
  seam: SingleFileApplyPatchResultMapperSeamContract,
): void {
  expect(seam.seamSafe).toBe(true);
  expect(seam.inputKind).toBe("mapper-consumer-contract");
  expect(seam.terminalClassification).not.toBe("success");
  expect(seam.willWrite).toBe(false);
  expect(seam.changedFiles).toEqual([]);
  expect(seam.writeIntents).toEqual([]);
  expect(seam.patchesApplied).toBe(false);
  expect(seam.verificationPassed).toBe(false);
  expect(seam.taskSatisfied).toBe(false);
  expect(seam.rawApprovalMetadataAccepted).toBe(false);
  expect(seam.rawBaseContentAccepted).toBe(false);
  expect(seam.rawWriterBoundaryAccepted).toBe(false);
  expect(seam.safetyProof).toEqual({
    consumesMapperSafeProjection: true,
    noMutationSuccess: true,
    noWriteSuccess: true,
    noAppliedPatch: true,
    noChangedFiles: true,
    noPermissionGrant: true,
    noProductionWriteReady: true,
    noRawBaseContent: true,
    noRawWriterBoundary: true,
  });
  const serialized = JSON.stringify(seam).toLowerCase();
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("old\\n");
  expect(serialized).not.toContain("changed\\n");
  expect(serialized).not.toContain('"approved"');
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
  expect(serialized).not.toContain("production-write-ready");
  expect(serialized).not.toContain("\"applied\"");
}
