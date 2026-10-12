import { afterAll, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyPathContainment } from "./pathJail.js";

describe("Canonical Path Containment Jail", () => {
  const workspaceRoot = path.resolve("/tmp/test-workspace");

  it("permits paths strictly inside the workspace root", () => {
    const res = verifyPathContainment("src/index.ts", workspaceRoot);
    expect(res.allowed).toBe(true);
    expect(res.resolvedPath).toBe(path.join(workspaceRoot, "src/index.ts"));
  });

  it("permits the workspace root itself", () => {
    const res = verifyPathContainment(".", workspaceRoot);
    expect(res.allowed).toBe(true);
    expect(res.resolvedPath).toBe(workspaceRoot);
  });

  it("blocks path traversal attempts outside workspace", () => {
    const res = verifyPathContainment("../../etc/passwd", workspaceRoot);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("resolves outside workspace root");
  });

  it("blocks absolute paths outside workspace", () => {
    const res = verifyPathContainment("/etc/shadow", workspaceRoot);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("resolves outside workspace root");
  });
});

describe("a write through a symlinked directory", () => {
  /**
   * A target that does not exist yet still lands somewhere.
   *
   * The check used to run only when the target itself existed, so the same
   * symlink refused `escape/exists.html` and allowed `escape/new.html`: the new
   * file had no realpath to compare and only the lexical prefix was consulted.
   * `/export escape/new.html` therefore wrote outside the workspace.
   */
  const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jail-real-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "jail-out-"));
  const workspace = path.join(realRoot, "work");
  fs.mkdirSync(workspace);
  fs.symlinkSync(outside, path.join(workspace, "escape"));

  afterAll(() => {
    fs.rmSync(realRoot, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("refuses a new file under it", () => {
    const res = verifyPathContainment(path.join(workspace, "escape", "new.html"), workspace);
    expect(res.allowed).toBe(false);
  });

  it("refuses an existing file under it", () => {
    fs.writeFileSync(path.join(outside, "exists.html"), "x");
    const res = verifyPathContainment(path.join(workspace, "escape", "exists.html"), workspace);
    expect(res.allowed).toBe(false);
  });

  it("still allows a new file in a directory that is really inside", () => {
    const res = verifyPathContainment(path.join(workspace, "deep", "nested", "a.html"), workspace);
    expect(res.allowed).toBe(true);
  });

  it("checks a retargeted ancestor afresh through a symlinked workspace", () => {
    const alias = path.join(realRoot, "alias");
    const safe = path.join(workspace, "safe");
    const link = path.join(workspace, "changing");
    fs.mkdirSync(safe);
    fs.symlinkSync(workspace, alias);
    fs.symlinkSync(safe, link);
    const native = vi.spyOn(fs.realpathSync, "native");
    try {
      const target = path.join(alias, "changing", "missing", "new.html");
      expect(verifyPathContainment(target, alias)).toMatchObject({
        allowed: true,
        resolvedPath: path.join(safe, "missing", "new.html"),
      });
      fs.unlinkSync(link);
      fs.symlinkSync(outside, link);
      expect(verifyPathContainment(target, alias)).toMatchObject({
        allowed: false,
        resolvedPath: path.join(outside, "missing", "new.html"),
      });
      if (process.platform === "linux") expect(native).toHaveBeenCalledWith(alias);
    } finally {
      native.mockRestore();
    }
  });

  it.skipIf(process.platform !== "linux")("keeps containment checks when native resolution fails", () => {
    const native = vi.spyOn(fs.realpathSync, "native").mockImplementation(() => {
      throw new Error("Native resolution unavailable");
    });
    try {
      expect(verifyPathContainment(path.join(workspace, "escape", "new.html"), workspace).allowed).toBe(false);
      expect(verifyPathContainment(path.join(workspace, "deep", "new.html"), workspace)).toMatchObject({
        allowed: true,
        resolvedPath: path.join(workspace, "deep", "new.html"),
      });
      expect(native).toHaveBeenCalled();
    } finally {
      native.mockRestore();
    }
  });
});
