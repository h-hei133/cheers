import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runWorkspaceMoveRoute } from "./workspaceMoveRoute.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("single-file Move File selected-workspace route", () => {
  it("recognizes an in-workspace move but safely blocks before any move writer", () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = runWorkspaceMoveRoute({
      ...routeOptions(fixture.workspaceRoot, movePatch()),
      readFile: authority.readFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("move-writer-not-enabled");
    expect(result.sourcePath).toBe("src/from.ts");
    expect(result.targetPath).toBe("src/to.ts");
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles).toEqual([
      expect.objectContaining({
        path: "src/to.ts",
        message:
          "Selected-workspace Move File writer is not enabled; the route stopped after guard verification.",
      }),
    ]);
    expect(result.plannedFiles).toEqual([]);
    expect(result.writeIntents).toEqual([]);
    expect(result.workspaceWriterInvoked).toBe(false);
    expect(result.deleteMoveInvoked).toBe(false);
    expect(result.postWriteVerification).toBe("not-run");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalSuccessAllowed).toBe(false);
    expect(result.mutationSuccessClaimAllowed).toBe(false);
    expect(result.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/from.ts",
        targetPath: "src/to.ts",
        supportStatus: "unsupported-no-write",
        writeIntent: "none",
      }),
    ]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-move-route:single-file-move-guards-passed",
        "apply-patch-workspace-move-route:move-writer-not-enabled",
        "apply-patch-workspace-move-route:no-delete-move-invoked",
        "apply-patch-workspace-move-route:no-rollback",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it.each([
    {
      name: "outside target",
      patchText: movePatch({ targetPath: "../outside.ts" }),
      expectedBlocker: "workspace-boundary",
      expectedCode: "patch-verify-path-outside-workspace",
    },
    {
      name: "existing target",
      patchText: movePatch({ targetPath: "src/existing.ts" }),
      expectedBlocker: "target-mismatch",
      expectedCode: "patch-verify-file-already-exists",
    },
    {
      name: "missing source",
      patchText: movePatch({ sourcePath: "src/missing.ts" }),
      expectedBlocker: "workspace-boundary",
      expectedCode: "patch-verify-file-missing",
    },
    {
      name: "same source and target",
      patchText: movePatch({ targetPath: "src/from.ts" }),
      expectedBlocker: "target-mismatch",
      expectedCode: "patch-apply-plan-not-verified",
    },
    {
      name: "directory source",
      patchText: movePatch({ sourcePath: "src/dir" }),
      expectedBlocker: "workspace-boundary",
      expectedCode: "patch-apply-plan-not-verified",
    },
  ])(
    "blocks $name before any writer or success claim",
    ({ patchText, expectedBlocker, expectedCode }) => {
      const fixture = createFixture({ includeDirectorySource: true });
      const before = snapshotFixture(fixture.workspaceRoot);
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

      const result = runWorkspaceMoveRoute({
        ...routeOptions(fixture.workspaceRoot, patchText),
        readFile: authority.readFile,
        directoryExists: authority.directoryExists,
        validateWriteTarget: authority.validateWriteTarget,
        validateCreateTarget: authority.validateCreateTarget,
      });

      expect(result.status).toBe("blocked");
      expect(result.blocker).toBe(expectedBlocker);
      expect(result.failures[0]?.code).toBe(expectedCode);
      expectNoWrite(result);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    },
  );

  it.each([
    {
      name: "mixed update plus move",
      patchText: mixedUpdateMovePatch(),
      expectedBlocker: "unsupported-operation",
    },
    {
      name: "delete",
      patchText: deletePatch(),
      expectedBlocker: "unsupported-operation",
    },
    {
      name: "broad apply_patch",
      patchText: broadPatch(),
      expectedBlocker: "patch-parse",
    },
  ])("keeps $name no-write", ({ patchText, expectedBlocker }) => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = runWorkspaceMoveRoute({
      ...routeOptions(fixture.workspaceRoot, patchText),
      readFile: authority.readFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe(expectedBlocker);
    expectNoWrite(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });
});

function routeOptions(workspaceRoot: string, rawPatchText: string) {
  return {
    workspaceRoot,
    rawPatchText,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved" as const,
    defaultProductionRejectionUnchanged: true as const,
  };
}

function movePatch(
  options: {
    readonly sourcePath?: string;
    readonly targetPath?: string;
    readonly fromLine?: string;
    readonly toLine?: string;
  } = {},
): string {
  const sourcePath = options.sourcePath ?? "src/from.ts";
  const targetPath = options.targetPath ?? "src/to.ts";
  return [
    "*** Begin Patch",
    `*** Update File: ${sourcePath}`,
    `*** Move to: ${targetPath}`,
    "@@",
    `-${options.fromLine ?? "from"}`,
    `+${options.toLine ?? "to"}`,
    "*** End Patch",
  ].join("\n");
}

function mixedUpdateMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/other.ts",
    "@@",
    "-other",
    "+changed",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    "-from",
    "+to",
    "*** End Patch",
  ].join("\n");
}

function deletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/from.ts",
    "*** End Patch",
  ].join("\n");
}

function broadPatch(): string {
  return [
    "diff --git a/src/from.ts b/src/to.ts",
    "--- a/src/from.ts",
    "+++ b/src/to.ts",
    "@@ -1 +1 @@",
    "-from",
    "+to",
  ].join("\n");
}

function createFixture(
  options: { readonly includeDirectorySource?: boolean } = {},
): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-workspace-move-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "from.ts"), "from\n", "utf8");
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "existing.ts"),
    "existing\n",
    "utf8",
  );
  fs.writeFileSync(path.join(workspaceRoot, "src", "other.ts"), "other\n", "utf8");
  if (options.includeDirectorySource) {
    fs.mkdirSync(path.join(workspaceRoot, "src", "dir"), { recursive: true });
  }
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

function expectNoWrite(
  result: ReturnType<typeof runWorkspaceMoveRoute>,
): void {
  expect(result.changedFiles).toEqual([]);
  expect(result.plannedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.workspaceWriterInvoked).toBe(false);
  expect(result.deleteMoveInvoked).toBe(false);
  expect(result.writerStarted).toBe(false);
  expect(result.writeEffect).toBe("none");
  expect(result.postWriteVerification).toBe("not-run");
  expect(result.terminalSuccessAllowed).toBe(false);
  expect(result.mutationSuccessClaimAllowed).toBe(false);
}
