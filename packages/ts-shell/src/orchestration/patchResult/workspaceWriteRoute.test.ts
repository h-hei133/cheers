import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runWorkspaceWriteRoute } from "./workspaceWriteRoute.js";

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

describe("single-file apply_patch real workspace write route", () => {
  it("writes one selected workspace target after explicit opt-in, approval, final stale-read, and post-write verification", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceWriteRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });

    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual(["src/app.ts"]);
    expect(result.writeIntents).toEqual(["src/app.ts"]);
    expect(result.workspaceWriterInvoked).toBe(true);
    expect(result.writerTarget).toBe("selected-workspace");
    expect(result.selectedWorkspaceWrite).toBe(true);
    expect(result.finalStaleRead.finalRevalidation).toBe("passed");
    expect(result.postWriteVerification).toBe("passed");
    expect(result.terminalClassification).toBe("success");
    expect(result.terminalSuccessAllowed).toBe(true);
    expect(result.mutationSuccessClaimAllowed).toBe(true);
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe(
      "status: ready\nowner: user-workspace\n",
    );
    expect(readFile(fixture.workspaceRoot, "LOCKED.md")).toBe("do not modify\n");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-write-route:explicit-runtime-opt-in",
        "apply-patch-workspace-write-route:explicit-workspace-write-opt-in",
        "apply-patch-workspace-write-route:approved-for-write",
        "apply-patch-workspace-write-route:final-stale-read-immediately-before-writer",
        "apply-patch-workspace-write-route:post-write-verification-passed",
        "apply-patch-workspace-write-route:success-after-verified-write",
      ]),
    );
  });

  it("keeps allow-once approval no-write without explicit workspace write opt-in", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceWriteRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: false,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        throw new Error("writer must stay unreachable without write opt-in");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("workspace-write-opt-in-missing");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("keeps denied approval and stale targets away from the writer", async () => {
    const deniedFixture = createFixture();
    const deniedBefore = snapshotFixture(deniedFixture.workspaceRoot);
    const deniedAuthority = createWorkspaceWriteAuthority(
      deniedFixture.workspaceRoot,
    );

    const denied = await runWorkspaceWriteRoute({
      workspaceRoot: deniedFixture.workspaceRoot,
      rawPatchText: applyPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "denied",
      defaultProductionRejectionUnchanged: true,
      readFile: deniedAuthority.readFile,
      readVerifiedFile: deniedAuthority.readVerifiedFile,
      validateWriteTarget: deniedAuthority.validateWriteTarget,
      writeFile: () => {
        throw new Error("writer must stay unreachable after denial");
      },
    });

    expect(denied.status).toBe("blocked");
    expect(denied.blocker).toBe("write-decision");
    expectNoBlockedWriteLeak(denied);
    expect(snapshotFixture(deniedFixture.workspaceRoot)).toEqual(deniedBefore);

    const staleFixture = createFixture();
    const staleAuthority = createWorkspaceWriteAuthority(staleFixture.workspaceRoot);
    let readCount = 0;
    const stale = await runWorkspaceWriteRoute({
      workspaceRoot: staleFixture.workspaceRoot,
      rawPatchText: applyPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: staleAuthority.readFile,
      readVerifiedFile: (relativePath) => {
        readCount += 1;
        if (readCount === 1) {
          fs.writeFileSync(
            path.join(staleFixture.workspaceRoot, "src", "app.ts"),
            "status: draft\nowner: changed-after-approval\n",
            "utf8",
          );
        }
        return staleAuthority.readVerifiedFile(relativePath);
      },
      validateWriteTarget: staleAuthority.validateWriteTarget,
      writeFile: () => {
        throw new Error("writer must stay unreachable after stale-read");
      },
    });

    expect(stale.status).toBe("blocked");
    expect(stale.blocker).toBe("final-stale-read");
    expect(stale.finalStaleRead?.blocker).toBe("stale-read");
    expectNoBlockedWriteLeak(stale);
    expect(readFile(staleFixture.workspaceRoot, "src/app.ts")).toBe(
      "status: draft\nowner: changed-after-approval\n",
    );
  });

  it("blocks no-op patches before success or writer invocation", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const noOpPatchText = [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-status: draft",
      "+status: draft",
      "*** End Patch",
    ].join("\n");
    const before = snapshotFixture(fixture.workspaceRoot);

    const result = await runWorkspaceWriteRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: noOpPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        throw new Error("writer must stay unreachable for no-op");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("no-op");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks symlink workspace targets before writer invocation or success", async () => {
    const fixture = createFixture({ skipTarget: true });
    const outsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "single-file-apply-patch-outside-"),
    );
    tempRoots.push(outsideRoot);
    const outsideTarget = path.join(outsideRoot, "app.ts");
    fs.writeFileSync(
      outsideTarget,
      "status: draft\nowner: outside-workspace\n",
      "utf8",
    );
    fs.symlinkSync(
      outsideTarget,
      path.join(fixture.workspaceRoot, "src", "app.ts"),
    );
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceWriteRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        throw new Error("writer must stay unreachable for symlink targets");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("workspace-boundary");
    expect(result.targetPath).toBe("src/app.ts");
    expectNoBlockedWriteLeak(result);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-authority:blocked",
        "apply-patch-workspace-authority:target-symlink",
      ]),
    );
    expect(fs.readFileSync(outsideTarget, "utf8")).toBe(
      "status: draft\nowner: outside-workspace\n",
    );
  });
});

function createFixture(
  options: { readonly skipTarget?: boolean } = {},
): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-workspace-write-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  if (!options.skipTarget) {
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "app.ts"),
      "status: draft\nowner: user-workspace\n",
      "utf8",
    );
  }
  fs.writeFileSync(path.join(workspaceRoot, "LOCKED.md"), "do not modify\n", "utf8");
  return { workspaceRoot };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
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
  result: Extract<Awaited<ReturnType<typeof runWorkspaceWriteRoute>>, { status: "blocked" }>,
): void {
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.workspaceWriterInvoked).toBe(false);
  expect(result.writerTarget).toBe("none");
  expect(result.selectedWorkspaceWrite).toBe(false);
  expect(result.appliedPatchRecord).toBe(false);
  expect(result.terminalClassification).toBe("stopped");
  expect(result.terminalSuccessAllowed).toBe(false);
  expect(result.mutationSuccessClaimAllowed).toBe(false);
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-workspace-write-route:changed-files-empty",
      "apply-patch-workspace-write-route:write-intents-empty",
      "apply-patch-workspace-write-route:no-writer-invoked",
      "apply-patch-workspace-write-route:no-success-claim",
    ]),
  );
}
