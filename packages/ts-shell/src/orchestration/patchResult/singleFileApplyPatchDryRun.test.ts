import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildSingleFileApplyPatchDryRun } from "./singleFileApplyPatchDryRun.js";

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
      ]),
    );
  });

  it("keeps multi-file Update File patches blocked with no terminal changed files", () => {
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

    expectBlockedNoWrite(result);
    expect(result.failedFiles[0]?.code).toBe("patch-apply-plan-not-verified");
    expect(result.approval.decision).toBe("blocked");
    expect(result.resultSurface.status).toBe("blocked");
    expect(result.resultSurface.changedFiles).toEqual([]);
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
      expectedCode: "patch-verify-operation-unsupported",
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
): ReturnType<typeof buildSingleFileApplyPatchDryRun> {
  return buildSingleFileApplyPatchDryRun({
    workspaceRoot,
    rawPatchText: lines.join("\n"),
    dryRun: true,
    readFile: (absolutePath) => files[path.relative(workspaceRoot, absolutePath)],
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
