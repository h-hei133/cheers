import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildGuardedWriteGate } from "./guardedWriteGate.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import { buildWriteDecisionGate } from "./writeDecisionGate.js";
import {
  runProductionWriteLane,
  type ProductionWriteLane,
} from "./productionWriteLane.js";

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

describe("single-file apply_patch synthetic guarded production write lane", () => {
  it("writes one isolated workspace target after guarded approval and final stale-read", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const route = buildApprovedRoute(fixture.workspaceRoot);
    const guardedGate = buildReadyGuardedGate(fixture.workspaceRoot);

    const result = await runProductionWriteLane({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      guardedGate,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: writeFixtureFile(fixture.workspaceRoot),
    });
    const after = snapshotFixture(fixture.workspaceRoot);

    expect(guardedGate.status).toBe("ready");
    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(result.writeIntents).toEqual(["src/app.ts"]);
    expect(result.productionWriterInvoked).toBe(true);
    expect(result.productionWriterTarget).toBe("isolated-workspace");
    expect(result.realRepositoryWrite).toBe(false);
    expect(result.finalStaleRead.finalRevalidation).toBe("passed");
    expect(result.terminalClassification).toBe("success");
    expect(result.terminalSuccessAllowed).toBe(true);
    expect(result.mutationSuccessClaimAllowed).toBe(true);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-production-write-lane:explicit-opt-in",
        "apply-patch-production-write-lane:approved-for-write",
        "apply-patch-production-write-lane:single-file-update-only",
        "apply-patch-production-write-lane:final-stale-read-immediately-before-writer",
        "apply-patch-production-write-lane:production-writer-isolated-workspace",
        "apply-patch-production-write-lane:real-repository-write-false",
        "apply-patch-production-write-lane:default-production-rejection-unchanged",
        "apply-patch-production-write-lane:success-after-verified-write",
      ]),
    );
    expect(after["src/app.ts"]).toBe("status: ready\nowner: production-like\n");
    expect(after["LOCKED.md"]).toBe(before["LOCKED.md"]);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it("blocks non-opt-in guarded gate without invoking the writer", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const route = buildApprovedRoute(fixture.workspaceRoot);
    const writeDecision = buildWriteDecisionGate({
      permissionUx: route.permissionUx,
      explicitApprovedForWrite: true,
    });
    const guardedGate = buildGuardedWriteGate({
      explicitOptIn: false,
      writeDecision,
      singleFileUpdateOnly: true,
      defaultProductionRejectionUnchanged: true,
    });

    const result = await runProductionWriteLane({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      guardedGate,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: () => {
        throw new Error("writer must stay unreachable");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("guarded-gate");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("runs final stale-read immediately before writer and blocks stale targets", async () => {
    const fixture = createFixture();
    const route = buildApprovedRoute(fixture.workspaceRoot);
    const guardedGate = buildReadyGuardedGate(fixture.workspaceRoot);
    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "app.ts"),
      "status: draft\nowner: changed-after-approval\n",
      "utf8",
    );
    const before = snapshotFixture(fixture.workspaceRoot);

    const result = await runProductionWriteLane({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      guardedGate,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: () => {
        throw new Error("writer must stay unreachable after stale-read");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("final-stale-read");
    expect(result.finalStaleRead?.blocker).toBe("stale-read");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks unsupported operations before the guarded writer", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const route = buildApprovedRoute(fixture.workspaceRoot);
    const guardedGate = buildReadyGuardedGate(fixture.workspaceRoot);

    const result = await runProductionWriteLane({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ].join("\n"),
      permissionUx: route.permissionUx,
      guardedGate,
      isolatedWorkspace: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: () => {
        throw new Error("writer must stay unreachable for unsupported operation");
      },
    });

    expect(result.status).toBe("blocked");
    expect(["patch-verification", "target-mismatch"]).toContain(result.blocker);
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("preserves default production apply_patch and unified diff rejection", () => {
    expect(asReplaceFailure(defaultApplyPatchResult()).failureCode).toBe(
      "patch-generation-failed",
    );
    expect(asReplaceFailure(defaultUnifiedDiffResult()).failureCode).toBe(
      "patch-generation-failed",
    );
  });
});

function buildReadyGuardedGate(
  workspaceRoot: string,
): ReturnType<typeof buildGuardedWriteGate> {
  const route = buildApprovedRoute(workspaceRoot);
  const writeDecision = buildWriteDecisionGate({
    permissionUx: route.permissionUx,
    explicitApprovedForWrite: true,
  });
  return buildGuardedWriteGate({
    explicitOptIn: true,
    writeDecision,
    singleFileUpdateOnly: true,
    defaultProductionRejectionUnchanged: true,
  });
}

function buildApprovedRoute(
  workspaceRoot: string,
): Extract<
  ReturnType<typeof buildSingleFileApplyPatchOptInDryRunRoute>,
  { explicitOptIn: true }
> {
  const route = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot,
    rawPatchText: applyPatchText,
    dryRun: true,
    explicitOptIn: true,
    requestedUserDecision: "approved",
    readFile: readFixtureFile(workspaceRoot),
  });
  if (route.explicitOptIn !== true) {
    throw new Error("Expected explicit opt-in route");
  }
  return route;
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-production-write-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "app.ts"),
    "status: draft\nowner: production-like\n",
    "utf8",
  );
  fs.writeFileSync(path.join(workspaceRoot, "LOCKED.md"), "do not modify\n", "utf8");
  return { workspaceRoot };
}

function readFixtureFile(
  workspaceRoot: string,
): (absolutePath: string) => string | undefined {
  return (absolutePath) =>
    fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : undefined;
}

function writeFixtureFile(
  workspaceRoot: string,
): (relativePath: string, content: string) => void {
  return (relativePath, content) => {
    const absolutePath = path.resolve(workspaceRoot, relativePath);
    const relative = path.relative(workspaceRoot, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Refusing to write outside isolated workspace");
    }
    fs.writeFileSync(absolutePath, content, "utf8");
  };
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

function defaultApplyPatchResult(): SingleFileReplacePatchResult {
  return applySingleFileReplacePatch({
    targetPath: "src/app.ts",
    originalContent: "status: draft\nowner: production-like\n",
    replaceDirective: {
      from: applyPatchText,
      to: "",
    },
  });
}

function defaultUnifiedDiffResult(): SingleFileReplacePatchResult {
  return applySingleFileReplacePatch({
    targetPath: "src/app.ts",
    originalContent: "status: draft\nowner: production-like\n",
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
}

function asReplaceFailure(
  result: SingleFileReplacePatchResult,
): Extract<SingleFileReplacePatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error("Expected replace patch failure");
  }
  return result as Extract<SingleFileReplacePatchResult, { ok: false }>;
}

function expectNoBlockedWriteLeak(
  result: Extract<ProductionWriteLane, { status: "blocked" }>,
): void {
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.productionWriterInvoked).toBe(false);
  expect(result.productionWriterTarget).toBe("none");
  expect(result.realRepositoryWrite).toBe(false);
  expect(result.appliedPatchRecord).toBe(false);
  expect(result.terminalClassification).toBe("stopped");
  expect(result.terminalSuccessAllowed).toBe(false);
  expect(result.mutationSuccessClaimAllowed).toBe(false);
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-production-write-lane:changed-files-empty",
      "apply-patch-production-write-lane:write-intents-empty",
      "apply-patch-production-write-lane:production-writer-invoked-false",
      "apply-patch-production-write-lane:real-repository-write-false",
      "apply-patch-production-write-lane:no-success-claim",
    ]),
  );
}
