import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMultiHunkApplyPatch,
  runExactHunkApplyRoute,
} from "./exactHunkApply.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("exactHunkApply", () => {
  it("builds one update operation with multiple exact hunks", () => {
    expect(
      buildMultiHunkApplyPatch({
        targetPath: "src/app.ts",
        hunks: [
          { mapping: mapping("alpha", "ALPHA") },
          { mapping: mapping("omega", "OMEGA") },
        ],
      }),
    ).toContain("*** Update File: src/app.ts\n@@\n-alpha\n+ALPHA\n@@\n-omega\n+OMEGA");
  });

  it("writes once after final stale-read and one snapshot for a multi-hunk file", async () => {
    const fixture = createFixture({ "src/app.ts": "alpha\nmiddle\nomega\n" });
    let writeCount = 0;
    const route = await runExactHunkApplyRoute({
      ...fixture.options,
      targetPath: "src/app.ts",
      hunks: [
        { hunkId: "h2", mapping: mapping("omega", "OMEGA") },
        { hunkId: "h1", mapping: mapping("alpha", "ALPHA") },
      ],
      writeFile: (relativePath, content) => {
        writeCount += 1;
        return fixture.options.writeFile(relativePath, content);
      },
    });

    expect(route.status).toBe("written");
    expect(writeCount).toBe(1);
    expect(route.snapshotReceipt.status).toBe("snapshot-created");
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "exact-hunk-apply:single-file-one-write",
        "exact-hunk-apply:one-pre-write-snapshot",
        "exact-hunk-apply:final-stale-read-preserved",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe(
      "ALPHA\nmiddle\nOMEGA\n",
    );
  });
});

function createFixture(files: Record<string, string>) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "exact-hunk-apply-"));
  tempRoots.push(workspaceRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return {
    workspaceRoot,
    options: {
      workspaceRoot,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved" as const,
      defaultProductionRejectionUnchanged: true as const,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    },
  };
}

function mapping(oldText: string, newText: string) {
  return { oldText, newText, source: "old-new-fenced-blocks" as const };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
