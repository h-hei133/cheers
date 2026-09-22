import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProjectTrustStore } from "./projectTrust.js";

describe("ProjectTrustStore Security Sandbox", () => {
  let tempDir: string;
  let customStorePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "trust-store-test-"));
    customStorePath = path.join(tempDir, "trust.json");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  it("evaluates untrusted projects by default", () => {
    const store = new ProjectTrustStore(customStorePath);
    expect(store.isProjectTrusted("/some/random/untrusted/repo")).toBe(false);
  });

  it("persists trusted decision and verifies parent path inheritance", () => {
    const store = new ProjectTrustStore(customStorePath);
    const parent = "/home/user/projects";
    const child = "/home/user/projects/my-app";

    store.setProjectTrust(parent, "trusted");
    expect(store.isProjectTrusted(parent)).toBe(true);
    expect(store.isProjectTrusted(child)).toBe(true);
  });

  it("detects sensitive project resources", () => {
    const store = new ProjectTrustStore(customStorePath);
    const fakeRepo = path.join(tempDir, "fake-repo");
    fs.mkdirSync(path.join(fakeRepo, ".agent-tool", "extensions"), { recursive: true });

    expect(store.hasSensitiveProjectResources(fakeRepo)).toBe(true);
    expect(store.hasSensitiveProjectResources(tempDir)).toBe(false);
  });
});

describe("explicit untrusted marking", () => {
  let tempDir: string;
  let customStorePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "trust-untrusted-"));
    customStorePath = path.join(tempDir, "trust.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not call a project untrusted merely because nothing has ruled on it", () => {
    // The distinction the gate depends on. A project with no record is one
    // nobody has judged; treating that as untrusted would switch off every
    // resource that consults this, and the caller would simply find nothing to
    // load rather than report a refusal.
    const store = new ProjectTrustStore(customStorePath);

    expect(store.isProjectUntrusted(path.join(tempDir, "somewhere"))).toBe(false);
  });

  it("reports a project marked untrusted", () => {
    const store = new ProjectTrustStore(customStorePath);
    const project = path.join(tempDir, "project");

    store.setProjectTrust(project, "untrusted");

    expect(store.isProjectUntrusted(project)).toBe(true);
  });

  it("covers directories beneath an untrusted parent", () => {
    const store = new ProjectTrustStore(customStorePath);
    const parent = path.join(tempDir, "parent");

    store.setProjectTrust(parent, "untrusted");

    expect(store.isProjectUntrusted(path.join(parent, "child", "grandchild"))).toBe(true);
  });

  it("does not report a trusted project as untrusted", () => {
    const store = new ProjectTrustStore(customStorePath);
    const project = path.join(tempDir, "trusted");

    store.setProjectTrust(project, "trusted");

    expect(store.isProjectUntrusted(project)).toBe(false);
  });
});

describe("sensitive resource detection", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trust-sensitive-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Write a file, creating its parent directories. */
  function touch(relative: string): void {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "x", "utf8");
  }

  // Each of these causes something to run or reaches the prompt. The detector
  // has to see all of them, because it is what decides whether a user is asked.
  const sensitive = [
    ".agents/hooks.json",
    ".private-agents.mcp.json",
    "AGENTS.md",
    ".agents/sandbox.json",
    ".agents/skills/anything/SKILL.md",
    ".agents/workflows/build.json",
    "SYSTEM.md",
  ];

  for (const relative of sensitive) {
    it(`detects ${relative}`, () => {
      touch(relative);

      expect(new ProjectTrustStore(path.join(root, "trust.json")).hasSensitiveProjectResources(root)).toBe(true);
    });
  }

  it("reports nothing for a project that declares nothing", () => {
    expect(new ProjectTrustStore(path.join(root, "trust.json")).hasSensitiveProjectResources(root)).toBe(false);
  });
});

describe("sensitive resources behind a symlink", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trust-symlink-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports tool definitions reached through a symlinked directory", () => {
    // A symlink to a directory is not `isDirectory()` on the Dirent, so checking
    // only that would let a project keep its definitions behind one and go
    // unreported at the moment the user decides whether to trust it.
    fs.mkdirSync(path.join(root, "real", "hooks"), { recursive: true });
    fs.mkdirSync(path.join(root, "workspace"), { recursive: true });
    fs.symlinkSync(path.join(root, "real"), path.join(root, "workspace", ".tooling"));

    const store = new ProjectTrustStore(path.join(root, "trust.json"));

    expect(store.hasSensitiveProjectResources(path.join(root, "workspace"))).toBe(true);
  });
});

describe("symlinked paths", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trust-symlinkpath-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not let a symlink hide that a project was marked untrusted", () => {
    // The decision is about the project, not about the string used to reach it.
    // Matching paths literally means opening an untrusted repository through a
    // symlink — a perfectly ordinary thing to do — silently restores every
    // resource the user refused.
    const real = path.join(root, "realrepo");
    fs.mkdirSync(real, { recursive: true });
    const link = path.join(root, "link");
    fs.symlinkSync(real, link);

    const store = new ProjectTrustStore(path.join(root, "trust.json"));
    store.setProjectTrust(real, "untrusted");

    expect(store.isProjectUntrusted(link)).toBe(true);
  });

  it("keeps a trusted decision across a symlink too", () => {
    const real = path.join(root, "realrepo");
    fs.mkdirSync(real, { recursive: true });
    const link = path.join(root, "link");
    fs.symlinkSync(real, link);

    const store = new ProjectTrustStore(path.join(root, "trust.json"));
    store.setProjectTrust(link, "trusted");

    expect(store.isProjectTrusted(real)).toBe(true);
  });
});
