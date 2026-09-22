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
