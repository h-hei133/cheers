import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createWorkspaceFileReader,
  pathStaysInsideWorkspace,
  readWorkspaceFileMap,
} from "./workspaceReadPolicy.js";
import { runApplyPatchRuntimeBridgeIfRequested } from "./applyPatchRuntimeBridge.js";

describe("workspaceReadPolicy", () => {
  it("reads only files inside the workspace and never treats the root as a file target", () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-read-policy-"));
    const inside = path.join(workspaceRoot, "src.txt");
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.txt`);
    fs.writeFileSync(inside, "inside", "utf8");
    fs.writeFileSync(outside, "outside", "utf8");

    const readFile = createWorkspaceFileReader(workspaceRoot);

    expect(pathStaysInsideWorkspace({ workspaceRoot, absolutePath: inside })).toBe(true);
    expect(pathStaysInsideWorkspace({ workspaceRoot, absolutePath: workspaceRoot })).toBe(false);
    expect(pathStaysInsideWorkspace({ workspaceRoot, absolutePath: outside })).toBe(false);
    expect(readFile(inside)).toBe("inside");
    expect(readFile(outside)).toBeUndefined();
  });

  it("projects report-safe current-content maps without escaping the workspace", () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-read-map-"));
    fs.writeFileSync(path.join(workspaceRoot, "target.md"), "current", "utf8");

    expect(readWorkspaceFileMap({
      workspaceRoot,
      targetPath: "target.md",
      targetLabel: "target",
    })).toEqual(new Map([["target", "current"]]));
    expect(readWorkspaceFileMap({
      workspaceRoot,
      targetPath: "../outside.md",
      targetLabel: "target",
    })).toBeUndefined();
  });
});

describe("applyPatchRuntimeBridge", () => {
  it("stays inert when the explicit apply_patch route option is absent", async () => {
    await expect(runApplyPatchRuntimeBridgeIfRequested({
      sessionId: "sess_no_apply_patch_runtime",
      prompt: "read only",
      workspaceRoot: process.cwd(),
    })).resolves.toBeUndefined();
  });
});
