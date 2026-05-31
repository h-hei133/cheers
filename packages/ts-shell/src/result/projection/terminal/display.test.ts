import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapTerminalToOrchestrationResult } from "../../../core/query/mapping/mapper.js";
import { buildSingleFileUpdatePatchApprovalContract } from "../../../edit/authority/approval/production.js";
import { buildSingleFileApplyPatchResultMapperConsumerContract } from "../patch/mapper.js";
import {
  buildSingleFileApplyPatchSessionRuntimeDisplayContract,
  type SingleFileApplyPatchSessionRuntimeDisplayContract,
} from "./display.js";
import { buildSingleFileApplyPatchDryRun } from "../../../edit/patch/apply/dryRun.js";
import { buildSingleFileApplyPatchRuntimeBridge } from "../patch/runtime.js";
import { buildSingleFileApplyPatchStaleReadContract } from "../../../edit/patch/apply/staleRead.js";
import {
  buildSingleFileApplyPatchTerminalSurface,
  type SingleFileApplyPatchTerminalSurface,
} from "../patch/terminal.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch sessionRuntime display contract", () => {
  it("displays dry-run-ready as preview only, not mutation success", () => {
    const display = displayContract(dryRunReadySurface());

    expect(display.status).toBe("preview-dry-run");
    expect(display.displayTitle).toContain("preview");
    expect(display.terminalClassification).toBe("stopped");
    expect(display.summaryLines).toContain("Preview only; no file was modified.");
    expectNoDisplaySuccessLeak(display);
  });

  it("displays stale-read blocked with actionable blocker and no changed files", () => {
    const display = displayContract(staleReadBlockedSurface());

    expect(display.status).toBe("blocked");
    expect(display.blocker).toEqual(
      expect.objectContaining({
        kind: "stale-read",
        nextAction: expect.stringContaining("Re-read"),
        doNext: expect.stringContaining("Re-read"),
      }),
    );
    expect(display.summaryLines.join("\n")).toContain("changed after preview");
    expectNoDisplaySuccessLeak(display);
  });

  it("displays target-missing blocked with actionable blocker and no write intent", () => {
    const display = displayContract(targetMissingBlockedSurface());

    expect(display.status).toBe("blocked");
    expect(display.blocker).toEqual(
      expect.objectContaining({
        kind: "target-missing",
        nextAction: expect.stringContaining("Re-read"),
      }),
    );
    expect(display.approval.writeIntent).toEqual({
      authorized: false,
      count: 0,
    });
    expect(display.summaryLines.join("\n")).toContain("target is missing");
    expectNoDisplaySuccessLeak(display);
  });

  it("displays permission-pending as pending permission, not approved", () => {
    const display = displayContract(permissionPendingSurface());

    expect(display.status).toBe("pending-approval");
    expect(display.displayTitle).toContain("waiting for permission");
    expect(display.approval.decision).toBe("pending");
    expect(display.blocker).toEqual(
      expect.objectContaining({
        kind: "permission-pending",
        nextAction: expect.stringContaining("explicit permission"),
      }),
    );
    expect(display.summaryLines.join("\n")).toContain(
      "Waiting for explicit edit permission",
    );
    expectNoDisplaySuccessLeak(display);
  });

  it("keeps wouldChangeFiles and previewChangedFiles out of displayed changedFiles", () => {
    for (const surface of [
      dryRunReadySurface(),
      staleReadBlockedSurface(),
      targetMissingBlockedSurface(),
      permissionPendingSurface(),
    ]) {
      const display = displayContract(surface);

      expect(display.wouldChangeFiles).toEqual(["src/app.ts"]);
      expect(display.previewChangedFiles).toEqual(["src/app.ts"]);
      expect(display.changedFiles).toEqual([]);
      expect(display.changedFilesLabel).toBe("none");
      expect(display.summaryLines).toContain("Changed files: none");
      expect(display.summaryLines).toContain("Would change: src/app.ts");
      expectNoDisplaySuccessLeak(display);
    }
  });
});

function displayContract(
  surface: SingleFileApplyPatchTerminalSurface,
): SingleFileApplyPatchSessionRuntimeDisplayContract {
  const mapperConsumer = buildSingleFileApplyPatchResultMapperConsumerContract({
    runtimeBridge: buildSingleFileApplyPatchRuntimeBridge({
      terminalSurface: surface,
    }),
  });
  const orchestrationResult = mapTerminalToOrchestrationResult(
    mapperConsumer.resultMapperInput.state,
    mapperConsumer.resultMapperInput.terminal,
  );
  return buildSingleFileApplyPatchSessionRuntimeDisplayContract({
    mapperConsumer,
    orchestrationResult,
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

function expectNoDisplaySuccessLeak(
  display: SingleFileApplyPatchSessionRuntimeDisplayContract,
): void {
  expect(display.sessionRuntimeDisplaySafe).toBe(true);
  expect(display.consumesMapperSafeProjection).toBe(true);
  expect(display.consumesRawPermissionMetadata).toBe(false);
  expect(display.terminalClassification).not.toBe("success");
  expect(display.changedFiles).toEqual([]);
  expect(display.changedFilesLabel).toBe("none");
  expect(display.approval.decision).toMatch(/^(pending|blocked|denied)$/);
  expect(display.approval.writeIntent).toEqual({
    authorized: false,
    count: 0,
  });
  expect(display.noWriteProof).toEqual({
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    doesNotClaimWriteSuccess: true,
    doesNotClaimMutationSuccess: true,
    doesNotDisplayAppliedPatch: true,
  });
  expect(display.displaySafetyProof).toEqual({
    noBaseContentLeaked: true,
    noChangedFilesLeaked: true,
    noWriteSuccessMarker: true,
    noMutationSuccessMarker: true,
    noAppliedPatchMarker: true,
    noProductionReadyClaim: true,
    noPermissionGrantClaim: true,
    previewFilesOnlyInWouldChangeFiles: true,
  });
  const serialized = JSON.stringify(display).toLowerCase();
  expect(serialized).not.toContain('"basecontent":');
  expect(serialized).not.toContain("old\\n");
  expect(serialized).not.toContain("changed\\n");
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
  expect(serialized).not.toContain("production-write-ready");
  expect(serialized).not.toContain("\"applied\"");
  expect(serialized).not.toContain("\"approved\"");
}
