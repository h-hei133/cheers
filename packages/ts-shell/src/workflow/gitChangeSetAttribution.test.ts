import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  attributeGitChangeSet,
  snapshotGitChangeSet,
} from "./gitChangeSetAttribution.js";
import type { CodingChangeSetSummary } from "../result/types.js";

describe("git change set attribution", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("separates pre-existing dirty files from attempted mutation files", () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "git-attribution-"));
    mkdirSync(path.join(tempDir, "src"), { recursive: true });
    writeFileSync(path.join(tempDir, "src", "preexisting.ts"), "old\n");
    writeFileSync(path.join(tempDir, "src", "target.ts"), "v1\n");
    git(tempDir, "init");
    git(tempDir, "config", "user.email", "test@example.com");
    git(tempDir, "config", "user.name", "Test Runner");
    git(tempDir, "add", ".");
    git(tempDir, "commit", "-m", "init");

    writeFileSync(path.join(tempDir, "src", "preexisting.ts"), "dirty\n");
    const preRun = snapshotGitChangeSet(tempDir);
    writeFileSync(path.join(tempDir, "src", "target.ts"), "v2\n");

    const changeSet: CodingChangeSetSummary = {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: ["src/target.ts"],
      changedFiles: ["src/target.ts"],
      unchangedAttemptedFiles: [],
    };

    expect(
      attributeGitChangeSet({
        workspaceRoot: tempDir,
        preRun,
        changeSet,
      }),
    ).toEqual({
      ...changeSet,
      gitAware: true,
      preExistingDirtyFiles: ["src/preexisting.ts"],
      postRunDirtyFiles: ["src/preexisting.ts", "src/target.ts"],
    });
  });

  it("leaves non-git workspaces unchanged", () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "git-attribution-"));
    const preRun = snapshotGitChangeSet(tempDir);
    const changeSet: CodingChangeSetSummary = {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: ["src/target.ts"],
      changedFiles: ["src/target.ts"],
      unchangedAttemptedFiles: [],
    };

    expect(
      attributeGitChangeSet({
        workspaceRoot: tempDir,
        preRun,
        changeSet,
      }),
    ).toBe(changeSet);
  });
});

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, stdio: "ignore" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed`);
  }
}
