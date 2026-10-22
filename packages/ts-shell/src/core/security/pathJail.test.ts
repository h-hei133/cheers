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

  it("resolves existing targets afresh without a separate existence probe", () => {
    const file = path.join(workspace, "present.txt");
    fs.writeFileSync(file, "source");
    const exists = vi.spyOn(fs, "existsSync");
    try {
      expect(verifyPathContainment(file, workspace)).toMatchObject({ allowed: true, resolvedPath: file });
      expect(verifyPathContainment(file, workspace)).toMatchObject({ allowed: true, resolvedPath: file });
      expect(exists).not.toHaveBeenCalled();
    } finally {
      exists.mockRestore();
    }
  });

  it("keeps an existing unresolved target distinct from a missing ancestor", () => {
    const file = path.join(workspace, "unresolved.txt");
    fs.writeFileSync(file, "source");
    const realpath = fs.realpathSync;
    const native = realpath.native;
    const failure = new Error("Synthetic resolver failure");
    const fallback = vi.spyOn(fs, "realpathSync").mockImplementation(target => {
      if (String(target) === file) throw failure;
      return realpath(target);
    });
    Object.defineProperty(fs.realpathSync, "native", { configurable: true, value: (target: fs.PathLike) => {
      if (String(target) === file) throw failure;
      return native(target);
    } });
    const exists = vi.spyOn(fs, "existsSync");
    try {
      expect(verifyPathContainment(file, workspace)).toMatchObject({ allowed: true, resolvedPath: file });
      expect(exists).toHaveBeenCalledWith(file);
    } finally {
      exists.mockRestore();
      fallback.mockRestore();
    }
  });
});

describe("canonical directory casing", () => {
  it("rejects distinct canonical roots even when lexical comparison folds case", () => {
    const root = path.resolve("case-jail", "Root");
    const sibling = path.resolve("case-jail", "root");
    const relative = path.relative.bind(path);
    const lexical = vi.spyOn(path, "relative").mockImplementation((from, to) => relative(from.toLowerCase(), to.toLowerCase()));
    const exists = vi.spyOn(fs, "existsSync").mockImplementation(file => !String(file).endsWith("new.txt"));
    const canonical = vi.spyOn(fs, "realpathSync").mockImplementation(file => String(file));
    try {
      for (const target of [sibling, path.join(sibling, "existing.txt"), path.join(sibling, "missing", "new.txt")]) {
        expect(verifyPathContainment(target, root).allowed).toBe(false);
      }
      expect(verifyPathContainment(path.join(root, "inside.txt"), root).allowed).toBe(true);
    } finally {
      canonical.mockRestore();
      exists.mockRestore();
      lexical.mockRestore();
    }
  });

  it("uses filesystem casing to preserve Windows aliases of the same directory", () => {
    const root = path.resolve("case-jail", "Root");
    const alias = path.resolve("case-jail", "root");
    const target = path.join(alias, "existing.txt");
    const canonicalTarget = path.join(root, "existing.txt");
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    const relative = path.relative.bind(path);
    const lexical = vi.spyOn(path, "relative").mockImplementation((from, to) => relative(from.toLowerCase(), to.toLowerCase()));
    const exists = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const native = vi.spyOn(fs.realpathSync, "native").mockImplementation(file => String(file) === target ? canonicalTarget : root);
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      expect(verifyPathContainment(target, root)).toMatchObject({ allowed: true, resolvedPath: canonicalTarget });
      expect(native).toHaveBeenCalledWith(target);
      expect(native).toHaveBeenCalledWith(root);
    } finally {
      Object.defineProperty(process, "platform", platform);
      native.mockRestore();
      exists.mockRestore();
      lexical.mockRestore();
    }
  });

  it("resolves a Windows short-name alias before rejecting lexical containment", () => {
    const root = path.resolve("case-jail", "runneradmin", "workspace");
    const alias = path.resolve("case-jail", "RUNNER~1", "workspace");
    const target = path.join(alias, "existing.txt");
    const canonicalTarget = path.join(root, "existing.txt");
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    const native = vi.spyOn(fs.realpathSync, "native").mockImplementation(file => {
      const value = String(file);
      return value === alias || value.startsWith(`${alias}${path.sep}`)
        ? root + value.slice(alias.length) : root;
    });
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      expect(verifyPathContainment(target, root)).toMatchObject({
        allowed: true,
        resolvedPath: canonicalTarget,
      });
      expect(native).toHaveBeenCalledWith(target);
      expect(native).toHaveBeenCalledWith(root);
    } finally {
      Object.defineProperty(process, "platform", platform);
      native.mockRestore();
    }
  });

  it("canonicalizes the existing ancestor of a new Windows workspace", () => {
    const parent = path.resolve("case-jail", "Root");
    const alias = path.resolve("case-jail", "root");
    const workspace = path.join(alias, "missing");
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    const exists = vi.spyOn(fs, "existsSync").mockImplementation(file => String(file) === parent || String(file) === alias);
    const native = vi.spyOn(fs.realpathSync, "native").mockImplementation(file => {
      if (String(file) === parent || String(file) === alias) return parent;
      throw Object.assign(new Error("Missing path"), { code: "ENOENT" });
    });
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      expect(verifyPathContainment("new.txt", workspace)).toMatchObject({
        allowed: true, resolvedPath: path.join(parent, "missing", "new.txt"),
      });
      expect(native).toHaveBeenCalledWith(alias);
    } finally {
      Object.defineProperty(process, "platform", platform);
      native.mockRestore();
      exists.mockRestore();
    }
  });

  it("folds only the Windows namespace anchor when comparing canonical paths", () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    const methods = ["resolve", "relative", "isAbsolute", "join", "dirname", "basename", "parse"] as const;
    const windows = methods.map(method => path.win32[method]);
    const spies = methods.map((method, index) => vi.spyOn(path, method).mockImplementation(windows[index] as any));
    const separator = Object.getOwnPropertyDescriptor(path, "sep")!;
    const exists = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const native = vi.spyOn(fs.realpathSync, "native").mockImplementation(file => String(file));
    Object.defineProperty(process, "platform", { value: "win32" });
    Object.defineProperty(path, "sep", { value: "\\" });
    try {
      const root = "\\\\server\\Share\\Root";
      expect(verifyPathContainment("\\\\SERVER\\share\\Root\\inside.txt", root).allowed).toBe(true);
      expect(verifyPathContainment("\\\\SERVER\\share\\root\\outside.txt", root).allowed).toBe(false);
      expect(verifyPathContainment("\\\\server\\Share\\Root-extra\\outside.txt", root).allowed).toBe(false);
      expect(verifyPathContainment("\\\\SERVER\\share\\inside.txt", "\\\\server\\Share").allowed).toBe(true);
      expect(verifyPathContainment("\\\\other\\share\\Root\\inside.txt", root).allowed).toBe(false);
      expect(verifyPathContainment("c:\\inside.txt", "C:\\").allowed).toBe(true);
      expect(verifyPathContainment("D:\\inside.txt", "C:\\").allowed).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", platform);
      Object.defineProperty(path, "sep", separator);
      native.mockRestore();
      exists.mockRestore();
      for (const spy of spies) spy.mockRestore();
    }
  });
});
