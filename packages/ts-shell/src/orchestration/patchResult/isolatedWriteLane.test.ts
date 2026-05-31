import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  type SingleFileReplacePatchResult,
} from "../patchMutationLane.js";
import { buildSingleFileApplyPatchOptInDryRunRoute } from "./singleFileApplyPatchOptInDryRunRoute.js";
import { buildWriteDecisionGate } from "../../edit/authority/approval/decision.js";
import { runIsolatedWriteLane } from "./isolatedWriteLane.js";

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

describe("single-file apply_patch synthetic isolated write lane", () => {
  it("writes only the approved fixture target after final stale-read passes", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const route = buildApprovedRoute(fixture.workspaceRoot);
    const decision = buildWriteDecisionGate({
      permissionUx: route.permissionUx,
      explicitApprovedForWrite: true,
    });

    const result = await runIsolatedWriteLane({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      writeDecision: decision,
      isolatedFixture: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: writeFixtureFile(fixture.workspaceRoot),
    });
    const after = snapshotFixture(fixture.workspaceRoot);

    expect(decision.status).toBe("approved-for-write");
    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(result.writeIntents).toEqual(["src/app.ts"]);
    expect(result.fixtureWriterInvoked).toBe(true);
    expect(result.productionWriterInvoked).toBe(false);
    expect(result.noProductionWrite).toBe(true);
    expect(result.appliedPatchRecord).toBe(false);
    expect(result.terminalClassification).toBe("success");
    expect(result.finalStaleRead.finalRevalidation).toBe("passed");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-isolated-write-lane:explicit-approved-for-write",
        "apply-patch-isolated-write-lane:final-stale-read-passed-after-approval",
        "apply-patch-isolated-write-lane:single-file-update-only",
        "apply-patch-isolated-write-lane:isolated-fixture-write",
        "apply-patch-isolated-write-lane:production-writer-invoked-false",
        "apply-patch-isolated-write-lane:default-production-rejection-unchanged",
        "apply-patch-isolated-write-lane:verification-passed",
      ]),
    );
    expect(after["src/app.ts"]).toBe("status: ready\nowner: synthetic\n");
    expect(after["LOCKED.md"]).toBe(before["LOCKED.md"]);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it("blocks pending permission without changing the fixture", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const route = buildApprovedRoute(fixture.workspaceRoot);
    const decision = buildWriteDecisionGate({
      permissionUx: route.permissionUx,
      explicitApprovedForWrite: false,
      promptText: "please write",
    });

    const result = await runIsolatedWriteLane({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      writeDecision: decision,
      isolatedFixture: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: writeFixtureFile(fixture.workspaceRoot),
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-decision-not-approved");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks stale fixture content after approval before the fixture writer", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const route = buildApprovedRoute(fixture.workspaceRoot);
    const decision = buildWriteDecisionGate({
      permissionUx: route.permissionUx,
      explicitApprovedForWrite: true,
    });
    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "app.ts"),
      "status: externally changed\nowner: synthetic\n",
      "utf8",
    );

    const result = await runIsolatedWriteLane({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      permissionUx: route.permissionUx,
      writeDecision: decision,
      isolatedFixture: true,
      readFile: readFixtureFile(fixture.workspaceRoot),
      writeFile: writeFixtureFile(fixture.workspaceRoot),
    });
    const after = snapshotFixture(fixture.workspaceRoot);

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("final-stale-read");
    expect(result.finalStaleRead?.blocker).toBe("stale-read");
    expectNoBlockedWriteLeak(result);
    expect(after["src/app.ts"]).toBe("status: externally changed\nowner: synthetic\n");
    expect(after["LOCKED.md"]).toBe(before["LOCKED.md"]);
  });

  it("blocks unsupported multi-file/add/delete/move shapes before writing", async () => {
    for (const rawPatchText of [
      [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+new",
        "*** End Patch",
      ].join("\n"),
      [
        "*** Begin Patch",
        "*** Delete File: src/app.ts",
        "*** End Patch",
      ].join("\n"),
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "*** Move to: src/renamed.ts",
        "@@",
        "-status: draft",
        "+status: ready",
        "*** End Patch",
      ].join("\n"),
      [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-status: draft",
        "+status: ready",
        "*** Update File: src/other.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n"),
    ]) {
      const fixture = createFixture();
      fs.writeFileSync(path.join(fixture.workspaceRoot, "src", "other.ts"), "old\n", "utf8");
      const before = snapshotFixture(fixture.workspaceRoot);
      const route = buildApprovedRoute(fixture.workspaceRoot);
      const decision = buildWriteDecisionGate({
        permissionUx: route.permissionUx,
        explicitApprovedForWrite: true,
      });

      const result = await runIsolatedWriteLane({
        workspaceRoot: fixture.workspaceRoot,
        rawPatchText,
        permissionUx: route.permissionUx,
        writeDecision: decision,
        isolatedFixture: true,
        readFile: readFixtureFile(fixture.workspaceRoot),
        writeFile: writeFixtureFile(fixture.workspaceRoot),
      });

      expect(result.status).toBe("blocked");
      expect(["patch-verification", "target-mismatch"]).toContain(result.blocker);
      expectNoBlockedWriteLeak(result);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    }
  });

  it("preserves default production apply_patch and unified diff rejection", () => {
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
    throw new Error("Expected opt-in route result");
  }
  return route;
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-isolated-write-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "app.ts"),
    "status: draft\nowner: synthetic\n",
    "utf8",
  );
  fs.writeFileSync(path.join(workspaceRoot, "LOCKED.md"), "do not modify\n", "utf8");
  return { workspaceRoot };
}

function readFixtureFile(workspaceRoot: string): (absolutePath: string) => string | undefined {
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
      throw new Error("Refusing to write outside isolated fixture");
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

function expectNoBlockedWriteLeak(
  result: Extract<Awaited<ReturnType<typeof runIsolatedWriteLane>>, { status: "blocked" }>,
): void {
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.fixtureWriterInvoked).toBe(false);
  expect(result.productionWriterInvoked).toBe(false);
  expect(result.noProductionWrite).toBe(true);
  expect(result.appliedPatchRecord).toBe(false);
  expect(result.terminalClassification).toBe("stopped");
  expect(result.mutationSuccessClaimAllowed).toBe(false);
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-isolated-write-lane:changed-files-empty",
      "apply-patch-isolated-write-lane:write-intents-empty",
      "apply-patch-isolated-write-lane:fixture-writer-invoked-false",
      "apply-patch-isolated-write-lane:production-writer-invoked-false",
      "apply-patch-isolated-write-lane:no-success-claim",
    ]),
  );
}

function asReplaceFailure(
  result: SingleFileReplacePatchResult,
): Extract<SingleFileReplacePatchResult, { ok: false }> {
  if (result.ok) {
    throw new Error("Expected replace patch failure");
  }
  return result as Extract<SingleFileReplacePatchResult, { ok: false }>;
}
