import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileUpdatePatchApprovalContract } from "../../edit/authority/approval/production.js";
import { buildSingleFileApplyPatchDryRun } from "../../edit/patch/apply/dryRun.js";
import { buildSingleFileApplyPatchResultMapperConsumerContract } from "../../result/projection/patch/mapper.js";
import { buildSingleFileApplyPatchResultMapperSeamContract } from "./singleFileApplyPatchResultMapperSeam.js";
import { buildSingleFileApplyPatchRuntimeBridge } from "../../result/projection/patch/runtime.js";
import {
  buildSingleFileApplyPatchSessionRuntimeSeamContract,
  type SingleFileApplyPatchSessionRuntimeSeamContract,
} from "./singleFileApplyPatchSessionRuntimeSeam.js";
import { buildSingleFileApplyPatchStaleReadContract } from "../../edit/patch/apply/staleRead.js";
import {
  buildSingleFileApplyPatchTerminalSurface,
  type SingleFileApplyPatchTerminalSurface,
} from "../../result/projection/patch/terminal.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch sessionRuntime safe seam contract", () => {
  it("displays dry-run as preview only without mutation success", () => {
    const seam = sessionRuntimeSeam(dryRunReadySurface());

    expect(seam.displayStatus).toBe("dry-run");
    expect(seam.title).toContain("dry-run preview");
    expect(seam.summaryLines).toContain("Preview only; no file was modified.");
    expect(seam.summaryLines).toContain("Changed: none");
    expectNoSessionRuntimeSeamLeak(seam);
  });

  it("displays stale-read blocked with next action and no changed display", () => {
    const seam = sessionRuntimeSeam(staleReadBlockedSurface());

    expect(seam.displayStatus).toBe("blocked");
    expect(seam.title).toContain("blocked before write");
    expect(seam.summaryLines.join("\n")).toContain("changed after preview");
    expect(seam.nextAction).toContain("Re-read");
    expect(seam.doNext).toBe(seam.nextAction);
    expectNoSessionRuntimeSeamLeak(seam);
  });

  it("displays target-missing blocked without write-ready markers", () => {
    const seam = sessionRuntimeSeam(targetMissingBlockedSurface());

    expect(seam.displayStatus).toBe("blocked");
    expect(seam.summaryLines.join("\n")).toContain("target is missing");
    expect(seam.changedDisplay).toBe("none");
    expectNoSessionRuntimeSeamLeak(seam);
  });

  it("displays permission-pending without showing a permission grant", () => {
    const seam = sessionRuntimeSeam(permissionPendingSurface());

    expect(seam.displayStatus).toBe("permission-pending");
    expect(seam.title).toContain("waiting for permission");
    expect(seam.summaryLines).toContain(
      "Waiting for explicit edit permission; no file was modified.",
    );
    expect(seam.nextAction).toContain("explicit permission");
    expectNoSessionRuntimeSeamLeak(seam);
  });

  it("keeps preview files out of changed display across all states", () => {
    for (const surface of [
      dryRunReadySurface(),
      staleReadBlockedSurface(),
      targetMissingBlockedSurface(),
      permissionPendingSurface(),
    ]) {
      const seam = sessionRuntimeSeam(surface);

      expect(seam.changedDisplay).toBe("none");
      expect(seam.wouldChangeFiles).toEqual(["src/app.ts"]);
      expect(seam.previewChangedFiles).toEqual(["src/app.ts"]);
      expect(seam.summaryLines).toContain("Would change: src/app.ts");
      expectNoSessionRuntimeSeamLeak(seam);
    }
  });
});

function sessionRuntimeSeam(
  surface: SingleFileApplyPatchTerminalSurface,
): SingleFileApplyPatchSessionRuntimeSeamContract {
  const resultMapperSeam = buildSingleFileApplyPatchResultMapperSeamContract({
    mapperConsumer: buildSingleFileApplyPatchResultMapperConsumerContract({
      runtimeBridge: buildSingleFileApplyPatchRuntimeBridge({
        terminalSurface: surface,
      }),
    }),
  });
  return buildSingleFileApplyPatchSessionRuntimeSeamContract({
    resultMapperSeam,
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

function expectNoSessionRuntimeSeamLeak(
  seam: SingleFileApplyPatchSessionRuntimeSeamContract,
): void {
  expect(seam.displaySafe).toBe(true);
  expect(seam.consumesResultMapperSeam).toBe(true);
  expect(seam.terminalClassification).not.toBe("success");
  expect(seam.changedDisplay).toBe("none");
  expect(seam.mutationSuccessDisplayed).toBe(false);
  expect(seam.writeSuccessDisplayed).toBe(false);
  expect(seam.approvedDisplayed).toBe(false);
  expect(seam.appliedPatchDisplayed).toBe(false);
  expect(seam.rawPermissionMetadataDisplayed).toBe(false);
  expect(seam.rawBaseContentDisplayed).toBe(false);
  expect(seam.productionWriteReadyDisplayed).toBe(false);
  expect(seam.displaySafetyProof).toEqual({
    mapperSeamOnly: true,
    noChangedDisplay: true,
    noMutationSuccess: true,
    noWriteSuccess: true,
    noPermissionGrant: true,
    noAppliedPatch: true,
    noRawPermissionMetadata: true,
    noRawBaseContent: true,
    noProductionWriteReady: true,
    actionableNextStepPreserved: true,
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
