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
