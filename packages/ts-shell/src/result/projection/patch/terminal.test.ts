import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSingleFileUpdatePatchApprovalContract } from "../../../edit/authority/approval/production.js";
import { buildSingleFileApplyPatchDryRun } from "../../../edit/patch/apply/dryRun.js";
import { buildSingleFileApplyPatchStaleReadContract } from "../../../edit/patch/apply/staleRead.js";
import {
  buildSingleFileApplyPatchTerminalSurface,
  type SingleFileApplyPatchTerminalSurface,
} from "./terminal.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("single-file apply_patch terminal-safe result surface", () => {
  it("projects a dry-run-ready preview without write success or changed files", () => {
    const dryRunResult = dryRun({
      "src/app.ts": "old\n",
    });

    const surface = buildSingleFileApplyPatchTerminalSurface({
      dryRun: dryRunResult,
    });

    expect(surface.status).toBe("dry-run-ready");
    expectTerminalNoWrite(surface);
    expectNoSuccessLikeSurface(surface);
    expect(surface.wouldChangeFiles).toEqual(["src/app.ts"]);
    expect(surface.previewChangedFiles).toEqual(["src/app.ts"]);
    expect(surface.baseEvidence).toEqual(dryRunResult.baseEvidence);
    expect(surface.baseEvidence?.baseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      Object.prototype.hasOwnProperty.call(surface.baseEvidence, "baseContent"),
    ).toBe(false);
    expect(surface.staleReadPrecondition).toEqual({
      required: true,
      phase: "write-decision-dry-run",
      requiredBefore: "write-decision",
      blocksWriteOn: ["stale-read", "target-missing"],
    });
  });

  it("projects a permission-pending surface after stale-read is contract-ready", () => {
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

    const surface = buildSingleFileApplyPatchTerminalSurface({
      dryRun: dryRunResult,
      staleRead,
      approval,
    });

    expect(surface.status).toBe("permission-pending");
    expect(surface.approval.decision).toBe("pending");
    expectTerminalNoWrite(surface);
    expectNoSuccessLikeSurface(surface);
    expect(surface.nextAction).toContain("explicit permission");
    expect(surface.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-terminal-surface:status:permission-pending",
        "apply-patch-terminal-surface:no-write-success-claim",
      ]),
    );
  });

  it("projects stale-read blocked as actionable blocked without write intent", () => {
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

    const surface = buildSingleFileApplyPatchTerminalSurface({
      dryRun: dryRunResult,
      staleRead,
      approval,
    });

    expect(staleRead.blocker).toBe("stale-read");
    expect(surface.status).toBe("blocked");
    expect(surface.nextAction).toContain("Re-read");
    expect(surface.doNext).toBe(surface.nextAction);
    expectTerminalNoWrite(surface);
    expectNoSuccessLikeSurface(surface);
  });

  it("projects target-missing as blocked and never creates a write intent", () => {
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

    const surface = buildSingleFileApplyPatchTerminalSurface({
      dryRun: dryRunResult,
      staleRead,
      approval,
    });

    expect(staleRead.blocker).toBe("target-missing");
    expect(surface.status).toBe("blocked");
    expect(surface.approval.decision).toBe("blocked");
    expectTerminalNoWrite(surface);
    expectNoSuccessLikeSurface(surface);
  });

  it("keeps unsupported dry-run parse failures blocked with no preview leaking into changedFiles", () => {
    const dryRunResult = buildSingleFileApplyPatchDryRun({
      workspaceRoot,
      rawPatchText: [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ].join("\n"),
      dryRun: true,
      readFile: () => "old\n",
    });

    const surface = buildSingleFileApplyPatchTerminalSurface({
      dryRun: dryRunResult,
    });

    expect(surface.status).toBe("blocked");
    expect(surface.wouldChangeFiles).toEqual([]);
    expect(surface.previewChangedFiles).toEqual([]);
    expect(surface.baseEvidence).toBeUndefined();
    expect(surface.staleReadPrecondition).toBeUndefined();
    expectTerminalNoWrite(surface);
    expectNoSuccessLikeSurface(surface);
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

function expectTerminalNoWrite(
  surface: SingleFileApplyPatchTerminalSurface,
): void {
  expect(surface.terminalResultVisible).toBe(true);
  expect(surface.willWrite).toBe(false);
  expect(surface.changedFiles).toEqual([]);
  expect(surface.writeIntents).toEqual([]);
  expect(surface.approval.decision).toMatch(/^(pending|blocked|denied)$/);
  expect(surface.approval.decision).not.toBe("approved");
  expect(surface.approval.writeIntent).toEqual({ authorized: false, count: 0 });
  expect(surface.noWriteProof).toEqual({
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    doesNotClaimWriteSuccess: true,
  });
}

function expectNoSuccessLikeSurface(
  surface: SingleFileApplyPatchTerminalSurface,
): void {
  expect(surface.status).not.toBe("write-success");
  expect(surface.status).not.toBe("production-write-ready");
  expect(surface.evidence).not.toContain("write-success");
  expect(surface.evidence).not.toContain("production-write-ready");
  expect(surface.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-terminal-surface:will-write-false",
      "apply-patch-terminal-surface:changed-files-empty",
      "apply-patch-terminal-surface:write-intents-empty",
      "apply-patch-terminal-surface:no-writer-invoked",
      "apply-patch-terminal-surface:no-write-success-claim",
    ]),
  );
}
