import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { networkNotice, planSandboxedCommand, readSandboxRules } from "./osSandbox.js";

describe("os sandbox rules", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "os-sandbox-"));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function writeRules(rules: unknown): void {
    fs.mkdirSync(path.join(workspace, ".agents"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".agents", "sandbox.json"),
      JSON.stringify(rules),
      "utf8",
    );
  }

  it("is off unless a project or user file turns it on", () => {
    expect(readSandboxRules(workspace).enabled).not.toBe(true);
    expect(
      planSandboxedCommand({ shell: "bash", shellArgs: ["-c", "ls"], workspaceRoot: workspace }).state,
    ).toBe("off");
  });

  it("reads the project file when there is one", () => {
    writeRules({ enabled: true, filesystem: { denyRead: ["~/.config"] } });

    expect(readSandboxRules(workspace).enabled).toBe(true);
  });

  it("treats a malformed file as no rules rather than failing", () => {
    fs.mkdirSync(path.join(workspace, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(workspace, ".agents", "sandbox.json"), "{ not json", "utf8");

    expect(readSandboxRules(workspace)).toEqual({});
  });

  it("keeps the three outcomes apart", () => {
    const plan = planSandboxedCommand({
      shell: "bash",
      shellArgs: ["-c", "ls"],
      workspaceRoot: workspace,
      rules: { enabled: true },
    });

    expect(["isolated", "unavailable"]).toContain(plan.state);
    if (plan.state === "isolated") {
      expect(plan.command).toBeDefined();
      expect(plan.notice).toBeUndefined();
    } else {
      // An unavailable launcher must say so on every command: an unreported
      // fallback to no isolation is the one outcome nobody can act on.
      expect(plan.notice).toMatch(/WITHOUT isolation/);
      expect(plan.command).toBeUndefined();
    }
  });

  it("runs the same command it was given, under the launcher", () => {
    const plan = planSandboxedCommand({
      shell: "bash",
      shellArgs: ["-c", "echo hi"],
      workspaceRoot: workspace,
      rules: { enabled: true },
    });

    if (plan.state !== "isolated") return;
    expect(plan.args?.join(" ")).toContain("bash");
    expect(plan.args?.join(" ")).toContain("echo hi");
  });

  it("says plainly that a domain allowlist is not enforceable", () => {
    expect(networkNotice({ network: { allowedDomains: ["github.com"] } })).toMatch(
      /Network is fully open/,
    );
  });

  it("says nothing about the network when no allowlist was configured", () => {
    expect(networkNotice({})).toBeUndefined();
  });
});
