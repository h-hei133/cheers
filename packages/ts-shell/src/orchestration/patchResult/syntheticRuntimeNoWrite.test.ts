import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import {
  buildNoWriteRuntimeRoute,
  type NoWriteRuntimeRoute,
} from "../../edit/write/status/noWrite.js";

const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-export const value = 'old';",
  "+export const value = 'new';",
  "*** End Patch",
].join("\n");

describe("synthetic apply_patch runtime no-write integration", () => {
  let workspaceRoot: string;
  let targetPath: string;
  const originalContent = "export const value = 'old';\n";

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "apply-patch-runtime-no-write-"),
    );
    fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    targetPath = path.join(workspaceRoot, "src", "app.ts");
    fs.writeFileSync(targetPath, originalContent, "utf8");
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("reaches permission-pending runtime surface with the fixture unchanged", () => {
    const route = buildNoWriteRuntimeRoute({
      workspaceRoot,
      rawPatchText,
      explicitRuntimeOptIn: true,
      requestedUserDecision: "pending",
      runtimeSource: "synthetic",
      readFile,
    });

    expect(route.status).toBe("permission-pending");
    expect(route.displayStatus).toBe("permission-pending");
    expect(route.permissionStatus).toBe("pending");
    expect(route.routeStatus).toBe("permission-pending");
    expect(route.targetPath).toBe("src/app.ts");
    expect(fs.readFileSync(targetPath, "utf8")).toBe(originalContent);
    expectNoWriteNoSuccess(route);
  });

  it("projects denied runtime permission without mutating the fixture", () => {
    const route = buildNoWriteRuntimeRoute({
      workspaceRoot,
      rawPatchText,
      explicitRuntimeOptIn: true,
      requestedUserDecision: "denied",
      runtimeSource: "synthetic",
      readFile,
    });

    expect(route.status).toBe("denied");
    expect(route.displayStatus).toBe("denied");
    expect(route.permissionStatus).toBe("denied");
    expect(route.terminalClassification).toBe("stopped");
    expect(fs.readFileSync(targetPath, "utf8")).toBe(originalContent);
    expectNoWriteNoSuccess(route);
  });

  it("keeps non-opt-in runtime payloads rejected and unread", () => {
    const route = buildNoWriteRuntimeRoute({
      workspaceRoot,
      rawPatchText,
      runtimeSource: "production-adjacent",
      readFile: () => {
        throw new Error("readFile must not run without explicit runtime opt-in");
      },
    });

    expect(route.status).toBe("rejected");
    expect(route.displayStatus).toBe("rejected");
    expect(route.explicitRuntimeOptIn).toBe(false);
    expect(fs.readFileSync(targetPath, "utf8")).toBe(originalContent);
    expectNoWriteNoSuccess(route);
  });

  it("keeps default production apply_patch and unified diff rejected", () => {
    const applyPatchResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent,
      replaceDirective: {
        from: rawPatchText,
        to: "",
      },
    });
    const unifiedDiffResult = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent,
      replaceDirective: {
        from: [
          "diff --git a/src/app.ts b/src/app.ts",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -1 +1 @@",
          "-export const value = 'old';",
          "+export const value = 'new';",
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
    expect(fs.readFileSync(targetPath, "utf8")).toBe(originalContent);
  });

  function readFile(absolutePath: string): string | undefined {
    if (!absolutePath.startsWith(workspaceRoot)) {
      throw new Error(`Unexpected read outside synthetic fixture: ${absolutePath}`);
    }
    return fs.existsSync(absolutePath)
      ? fs.readFileSync(absolutePath, "utf8")
      : undefined;
  }
});

function expectNoWriteNoSuccess(route: NoWriteRuntimeRoute): void {
  expect(route.willWrite).toBe(false);
  expect(route.changedFiles).toEqual([]);
  expect(route.writeIntents).toEqual([]);
  expect(route.noWriterInvoked).toBe(true);
  expect(route.noAppliedPatchRecord).toBe(true);
  expect(route.doesNotClaimMutationSuccess).toBe(true);
  expect(route.doesNotClaimWriteSuccess).toBe(true);
  expect(route.terminalClassification).toBe("stopped");
  expect(route.safetyProof.noWriteAuthorization).toBe(true);
  expect(route.safetyProof.noApprovalAsWriteAuthorization).toBe(true);
  expect(route.safetyProof.defaultProductionRejectionUnchanged).toBe(true);
  const serialized = JSON.stringify(route).toLowerCase();
  expect(serialized).not.toContain("write-success\":true");
  expect(serialized).not.toContain("mutation-success\":true");
  expect(serialized).not.toContain("production-write-ready\":true");
  expect(serialized).not.toContain("\"applied\"");
}

function asReplaceFailure(
  result: SingleFileReplacePatchResult,
): Extract<SingleFileReplacePatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error("Expected replace patch failure");
  }
  return result as Extract<SingleFileReplacePatchResult, { ok: false }>;
}
