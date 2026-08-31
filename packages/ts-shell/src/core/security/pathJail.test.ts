import { describe, it, expect } from "vitest";
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
