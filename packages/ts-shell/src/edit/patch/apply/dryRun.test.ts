import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../../../orchestration/patchMutationLane.js";
import { digestSingleFileApplyPatchContent } from "../../../evidence/projection/patch/base.js";
import { buildSingleFileApplyPatchDryRun } from "./dryRun.js";

const workspaceRoot = path.resolve("D:/workspace/project");

describe("buildSingleFileApplyPatchDryRun", () => {
  it("builds a terminal-facing no-write dry-run result for one Update File patch", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "old\n",
      },
    );

    expect(result.status).toBe("dry-run-ready");
    expect(result.willWrite).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.writeIntents).toEqual([]);
    expect(result.noWriterInvoked).toBe(true);
    expect(result.terminalResultVisible).toBe(true);
    expect(result.doesNotClaimWriteSuccess).toBe(true);
    expect(result.wouldChangeFiles).toEqual(["src/app.ts"]);
    expect(result.previewChangedFiles).toEqual(["src/app.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.approval.decision).toBe("pending");
    expect(result.approval.decision).not.toBe("approved");
    expect(result.approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(result.resultSurface.status).toBe("ready");
    expect(result.resultSurface.changedFiles).toEqual([]);
    expect(result.baseEvidence).toEqual({
      targetPath: "src/app.ts",
      baseDigest: digestSingleFileApplyPatchContent("old\n"),
      digestAlgorithm: "sha256",
      capturedAtPhase: "dry-run-preview",
      source: "verify-readFile",
    });
    expect(Object.prototype.hasOwnProperty.call(result.baseEvidence, "baseContent")).toBe(
      false,
    );
    expect(result.noPartial).toEqual({
      atomicity: "verify-all-before-write",
      writeIntents: 1,
      blockedWrites: false,
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-dry-run:explicit-opt-in",
        "apply-patch-dry-run:will-write-false",
        "apply-patch-dry-run:no-writer-invoked",
        "apply-patch-dry-run:terminal-changed-files-empty",
        "apply-patch-dry-run:base-evidence-captured",
      ]),
    );
  });

  it("classifies exactly two Update File patches as candidate no-write planning", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "@@",
        "-a",
        "+aa",
        "*** Update File: src/b.ts",
        "@@",
        "-b",
        "+bb",
        "*** End Patch",
      ],
      {
        "src/a.ts": "a\n",
        "src/b.ts": "b\n",
      },
    );

    expect(result.status).toBe("blocked");
    expect(result.willWrite).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.writeIntents).toEqual([]);
    expect(result.noWriterInvoked).toBe(true);
    expect(result.failedFiles).toEqual([]);
    expect(result.wouldChangeFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.previewChangedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.approval.decision).toBe("blocked");
    expect(result.approval.writeIntent).toEqual({ authorized: false, count: 0 });
    expect(result.approval.metadata.singleFileOnly).toBe(false);
    expect(result.resultSurface.status).toBe("blocked");
    expect(result.resultSurface.failureCategory).toBe(
      "candidate-capability-no-write",
    );
    expect(result.resultSurface.changedFiles).toEqual([]);
    expect(result.resultSurface.failedFiles).toEqual([]);
    expect(result.resultSurface.unsupportedCapability).toEqual(
      expect.objectContaining({
        capability: "multi-file-update-candidate-no-write",
        tier: "candidate",
        blockedReason: "bounded-update-planning-no-write",
        wouldChangeFiles: ["src/a.ts", "src/b.ts"],
        plannedFiles: ["src/a.ts", "src/b.ts"],
        failedFiles: [],
        changedFiles: [],
        writeIntents: [],
      }),
    );
    expect(result.noPartial).toEqual({
      atomicity: "verify-all-before-write",
      writeIntents: 0,
      blockedWrites: true,
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-dry-run:multi-file-update-planning-classified",
        "apply-patch-dry-run:multi-file-update-candidate-no-write",
        "apply-patch-dry-run:no-writer-invoked",
      ]),
    );
  });

  it.each([
    {
      name: "Add File",
      lines: [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ],
      files: {},
      expectedCode: "patch-add-file-not-enabled",
    },
    {
      name: "Delete File",
      lines: [
        "*** Begin Patch",
        "*** Delete File: src/delete.ts",
        "*** End Patch",
      ],
      files: {
        "src/delete.ts": "delete\n",
      },
      expectedCode: "patch-verify-operation-unsupported",
    },
    {
      name: "Move File",
      lines: [
        "*** Begin Patch",
        "*** Update File: src/from.ts",
        "*** Move to: src/to.ts",
        "@@",
        "-from",
        "+to",
        "*** End Patch",
      ],
      files: {
        "src/from.ts": "from\n",
      },
      expectedCode: "patch-verify-operation-unsupported",
    },
  ])("blocks unsupported $name patches", ({ lines, files, expectedCode }) => {
    const result = dryRun(lines, files);

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe(expectedCode);
    expect(result.approval.decision).toBe("blocked");
  });

  it("classifies a selected-workspace single-file add as candidate/backlog no-write evidence", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ],
      {},
      {
        existingDirectories: ["src"],
      },
    );

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]).toEqual(
      expect.objectContaining({
        code: "patch-add-file-not-enabled",
        path: "src/new.ts",
      }),
    );
    expect(result.wouldCreateFiles).toEqual(["src/new.ts"]);
    expect(result.approval.operationKind).toBe("add");
    expect(result.unsupportedCapability).toEqual({
      capability: "create-file-candidate-only",
      operation: "add",
      tier: "backlog",
      classificationMode: "synthetic-no-write",
      targetPath: "src/new.ts",
      wouldCreateFiles: ["src/new.ts"],
      blockedReason: "add-file-not-enabled",
      expectedCapability: "selected-workspace single-file add/create",
      currentSupportedCapability: "existing-file single-file update only",
      drivesApplyPatchExpansion: false,
      willWrite: false,
      writerReachable: false,
      changedFiles: [],
      writeIntents: [],
      explanation: expect.stringContaining("recognized"),
      nextAction: expect.stringContaining("existing-file single-file updates"),
    });
    expect(result.resultSurface.unsupportedCapability?.blockedReason).toBe(
      "add-file-not-enabled",
    );
    expect(result.resultSurface.noWriteProof).toEqual({
      willWrite: false,
      writeIntentCount: 0,
      blockedWrites: true,
      reason: expect.stringContaining("create candidate"),
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-dry-run:add-file-classified",
        "apply-patch-dry-run:add-file-blocker:add-file-not-enabled",
        "apply-patch-dry-run:create-file-candidate-only",
        "apply-patch-dry-run:no-writer-invoked",
      ]),
    );
  });

  it("classifies Add File target collision without write intents", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Add File: src/app.ts",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "existing\n",
      },
      {
        existingDirectories: ["src"],
      },
    );

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe("patch-add-file-target-exists");
    expect(result.unsupportedCapability?.blockedReason).toBe(
      "add-file-target-exists",
    );
    expect(result.wouldCreateFiles).toEqual(["src/app.ts"]);
  });

  it("classifies Add File parent-missing without creating directories", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Add File: missing/new.ts",
        "+new",
        "*** End Patch",
      ],
      {},
      {
        existingDirectories: ["src"],
      },
    );

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe("patch-add-file-parent-missing");
    expect(result.unsupportedCapability?.blockedReason).toBe(
      "add-file-parent-missing",
    );
    expect(result.wouldCreateFiles).toEqual(["missing/new.ts"]);
  });

  it("classifies Add File outside the workspace before any writer can run", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Add File: ../outside.txt",
        "+outside",
        "*** End Patch",
      ],
      {},
      {
        existingDirectories: ["src"],
      },
    );

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe("patch-verify-path-outside-workspace");
    expect(result.unsupportedCapability?.blockedReason).toBe(
      "add-file-outside-workspace",
    );
    expect(result.wouldCreateFiles).toEqual(["../outside.txt"]);
  });

  it("keeps multi-file add patches blocked with no write intents", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Add File: src/a.ts",
        "+a",
        "*** Add File: src/b.ts",
        "+b",
        "*** End Patch",
      ],
      {},
      {
        existingDirectories: ["src"],
      },
    );

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe("patch-apply-plan-not-verified");
    expect(result.unsupportedCapability?.blockedReason).toBe(
      "multi-file-add-not-enabled",
    );
    expect(result.wouldCreateFiles).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it.each([
    {
      name: "diff --git unified diff",
      lines: [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ],
    },
    {
      name: "plain unified diff",
      lines: [
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ],
    },
  ])("blocks $name before verification", ({ lines }) => {
    const result = dryRun(lines, {
      "src/app.ts": "old\n",
    });

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe("patch-parse-invalid-format");
    expect(result.approval.decision).toBe("blocked");
    expect(result.evidence).toEqual(
      expect.arrayContaining(["apply-patch-dry-run:parse-failed"]),
    );
  });

  it("blocks missing files without write intent", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Update File: src/missing.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {},
    );

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe("patch-verify-file-missing");
    expect(result.failedFiles[0]?.path).toBe("src/missing.ts");
  });

  it("blocks context mismatch without write intent", () => {
    const result = dryRun(
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ],
      {
        "src/app.ts": "current\n",
      },
    );

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe(
      "patch-verify-hunk-context-missing",
    );
    expect(result.failedFiles[0]?.path).toBe("src/app.ts");
  });

  it("keeps production apply_patch and unified diff inputs rejected in the current replace lane", () => {
    const applyPatchResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "old\n",
      replaceDirective: {
        from: [
          "*** Begin Patch",
          "*** Update File: src/app.ts",
          "@@",
          "-old",
          "+new",
          "*** End Patch",
        ].join("\n"),
        to: "",
      },
    });
    const unifiedDiffResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "old\n",
      replaceDirective: {
        from: [
          "diff --git a/src/app.ts b/src/app.ts",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -1 +1 @@",
          "-old",
          "+new",
        ].join("\n"),
        to: "",
      },
    });

    expect(asReplaceFailure(applyPatchResult).failureCode).toBe(
      "patch-generation-failed",
    );
    expect(asReplaceFailure(unifiedDiffResult).failureCode).toBe(
      "patch-generation-failed",
    );
  });
});

function dryRun(
  lines: readonly string[],
  files: Readonly<Record<string, string>>,
  options: {
    readonly existingDirectories?: readonly string[];
  } = {},
): ReturnType<typeof buildSingleFileApplyPatchDryRun> {
  return buildSingleFileApplyPatchDryRun({
    workspaceRoot,
    rawPatchText: lines.join("\n"),
    dryRun: true,
    readFile: (absolutePath) => files[path.relative(workspaceRoot, absolutePath)],
    ...(options.existingDirectories
      ? {
          directoryExists: (absolutePath: string) => {
            const relativePath = path.relative(workspaceRoot, absolutePath) || ".";
            return (
              relativePath === "." ||
              options.existingDirectories?.includes(relativePath) === true
            );
          },
        }
      : {}),
  });
}

function expectBlockedNoWrite(
  result: ReturnType<typeof buildSingleFileApplyPatchDryRun>,
): void {
  expect(result.status).toBe("blocked");
  expect(result.willWrite).toBe(false);
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.noWriterInvoked).toBe(true);
  expect(result.terminalResultVisible).toBe(true);
  expect(result.doesNotClaimWriteSuccess).toBe(true);
  expect(result.wouldChangeFiles).toEqual([]);
  expect(result.previewChangedFiles).toEqual([]);
  expect(result.failedFiles.length).toBeGreaterThan(0);
  expect(result.noPartial.atomicity).toBe("verify-all-before-write");
  expect(result.noPartial.writeIntents).toBe(0);
}

function asReplaceFailure(
  result: SingleFileReplacePatchResult,
): Extract<SingleFileReplacePatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error("Expected replace patch failure");
  }
  return result as Extract<SingleFileReplacePatchResult, { ok: false }>;
}
