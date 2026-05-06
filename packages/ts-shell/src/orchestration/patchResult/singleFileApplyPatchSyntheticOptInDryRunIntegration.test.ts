import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";

const applyPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("single-file apply_patch synthetic opt-in dry-run integration", () => {
  it("runs parse-to-session safe surface against a synthetic fixture without writing", () => {
    const fixture = createSyntheticFixture();
    const before = snapshotFixture(fixture.workspaceRoot);

    const result = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      dryRun: true,
      explicitOptIn: true,
      requestedUserDecision: "approved",
      readFile: (absolutePath) =>
        fs.existsSync(absolutePath)
          ? fs.readFileSync(absolutePath, "utf8")
          : undefined,
    });

    const after = snapshotFixture(fixture.workspaceRoot);

    expect(result.status).toBe("permission-pending");
    expect(result.dryRun.status).toBe("dry-run-ready");
    expect(result.dryRun.baseEvidence?.targetPath).toBe("src/app.ts");
    expect(Object.prototype.hasOwnProperty.call(result.dryRun.baseEvidence, "baseContent")).toBe(
      false,
    );
    expect(result.staleRead?.status).toBe("contract-ready");
    expect(result.permissionUx.permissionDecision).toBe("pending");
    expect(result.permissionUx.approvalTokenPrepared).toBe(true);
    expect(result.terminalSurface.status).toBe("permission-pending");
    expect(result.runtimeBridge.status).toBe("permission-pending");
    expect(result.resultMapperSeam.status).toBe("permission-pending");
    expect(result.sessionRuntimeSeam.displayStatus).toBe("permission-pending");
    expect(result.sessionRuntimeSeam.summaryLines).toContain(
      "Waiting for explicit edit permission; no file was modified.",
    );
    expect(result.sessionRuntimeSeam.summaryLines).toContain(
      "Would change: src/app.ts",
    );
    expectNoWriteNoSuccess(result);
    expect(after).toEqual(before);
  });

  it("blocks stale synthetic fixtures without changing repository files", () => {
    const fixture = createSyntheticFixture();
    let reads = 0;
    const before = snapshotFixture(fixture.workspaceRoot);

    const result = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      dryRun: true,
      explicitOptIn: true,
      readFile: (absolutePath) => {
        if (!fs.existsSync(absolutePath)) {
          return undefined;
        }
        reads += 1;
        return reads === 1
          ? fs.readFileSync(absolutePath, "utf8")
          : "status: externally changed\nowner: synthetic\n";
      },
    });

    const after = snapshotFixture(fixture.workspaceRoot);

    expect(result.status).toBe("blocked");
    expect(result.staleRead?.blocker).toBe("stale-read");
    expect(result.terminalSurface.status).toBe("blocked");
    expect(result.sessionRuntimeSeam.displayStatus).toBe("blocked");
    expect(result.nextAction).toContain("Re-read");
    expectNoWriteNoSuccess(result);
    expect(after).toEqual(before);
  });

  it("keeps default apply_patch and unified diff rejected outside explicit dry-run route", () => {
    const applyPatchResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "status: draft\nowner: synthetic\n",
      replaceDirective: {
        from: applyPatchText,
        to: "",
      },
    });
    const unifiedDiffResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "status: draft\nowner: synthetic\n",
      replaceDirective: {
        from: [
          "diff --git a/src/app.ts b/src/app.ts",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -1 +1 @@",
          "-status: draft",
          "+status: ready",
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

function createSyntheticFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-dry-run-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "app.ts"),
    "status: draft\nowner: synthetic\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "LOCKED.md"),
    "do not modify\n",
    "utf8",
  );
  return { workspaceRoot };
}

function snapshotFixture(workspaceRoot: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      result[path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/")] =
        fs.readFileSync(absolutePath, "utf8");
    }
  };
  visit(workspaceRoot);
  return result;
}

function expectNoWriteNoSuccess(
  result: Extract<
    ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
    { explicitOptIn: true }
  >,
): void {
  expect(result.willWrite).toBe(false);
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.noWriterInvoked).toBe(true);
  expect(result.noAppliedPatchRecord).toBe(true);
  expect(result.dryRun.changedFiles).toEqual([]);
  expect(result.dryRun.writeIntents).toEqual([]);
  expect(result.terminalSurface.changedFiles).toEqual([]);
  expect(result.terminalSurface.writeIntents).toEqual([]);
  expect(result.runtimeBridge.changedFiles).toEqual([]);
  expect(result.runtimeBridge.writeIntents).toEqual([]);
  expect(result.resultMapperSeam.terminalClassification).not.toBe("success");
  expect(result.resultMapperSeam.changedFiles).toEqual([]);
  expect(result.resultMapperSeam.writeIntents).toEqual([]);
  expect(result.resultMapperSeam.patchesApplied).toBe(false);
  expect(result.resultMapperSeam.verificationPassed).toBe(false);
  expect(result.sessionRuntimeSeam.changedDisplay).toBe("none");
  expect(result.sessionRuntimeSeam.mutationSuccessDisplayed).toBe(false);
  expect(result.sessionRuntimeSeam.writeSuccessDisplayed).toBe(false);
  expect(result.sessionRuntimeSeam.appliedPatchDisplayed).toBe(false);
}

function asReplaceFailure(
  result: SingleFileReplacePatchResult,
): Extract<SingleFileReplacePatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error("Expected replace patch failure");
  }
  return result as Extract<SingleFileReplacePatchResult, { ok: false }>;
}
