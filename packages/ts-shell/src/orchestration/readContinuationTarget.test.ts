import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveReadContinuationTargetRecovery } from "./readContinuationTarget.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("readContinuationTarget", () => {
  it("projects an existing continuation target as available", () => {
    const root = createWorkspace();
    writeFile(root, "src/readme.md", "# hello\n");

    const recovery = resolveReadContinuationTargetRecovery({
      candidatePath: "src/readme.md",
      workspaceRoot: root,
      continuity: {},
    });

    expect(recovery).toMatchObject({
      targetPath: "src/readme.md",
      targetSummary: {
        status: "available",
        targetLabel: "src/readme.md",
      },
    });
  });

  it("keeps ambiguous relocation blocked and transcript-safe", () => {
    const root = createWorkspace();
    writeFile(root, "src/a/target.ts", "a\n");
    writeFile(root, "src/b/target.ts", "b\n");

    const recovery = resolveReadContinuationTargetRecovery({
      candidatePath: "old/target.ts",
      workspaceRoot: root,
      continuity: {},
    });

    expect(recovery.blockedReason).toContain("ambiguous");
    expect(recovery.targetSummary).toMatchObject({
      status: "ambiguous",
    });
    expect(recovery.targetSummary?.transcriptSummary).toContain("src/a/target.ts");
    expect(recovery.targetSummary?.transcriptSummary).toContain("src/b/target.ts");
  });
});

function createWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-context-"));
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}
