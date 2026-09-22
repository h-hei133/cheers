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

  it("does not let a project turn off isolation the user enabled", () => {
    // Only the user decides whether their commands are isolated. A project's file
    // tightens that decision or leaves it alone; it must not be able to lift it,
    // or cloning a repository would be enough to run its code unconfined.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-home-"));
    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      fs.mkdirSync(path.join(home, ".private-agents"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".private-agents", "sandbox.json"),
        JSON.stringify({ enabled: true }),
        "utf8",
      );
      writeRules({ enabled: false });

      expect(readSandboxRules(workspace).enabled).toBe(true);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not let a project widen the paths the user allowed", () => {
    // `allowWrite` is the list of places a command may modify. A project able to
    // append to it could grant itself the whole filesystem.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-home-"));
    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      fs.mkdirSync(path.join(home, ".private-agents"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".private-agents", "sandbox.json"),
        JSON.stringify({ enabled: true, filesystem: { allowWrite: ["/tmp/ok"] } }),
        "utf8",
      );
      writeRules({ enabled: true, filesystem: { allowWrite: ["/"] } });

      const rules = readSandboxRules(workspace);

      expect(rules.filesystem?.allowWrite).toEqual(["/tmp/ok"]);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not let a project name writable paths when the user asked for isolation", () => {
    // The user turning isolation on without listing paths means the built-in
    // default, not "let the project decide". A project naming `/` here would be
    // replacing a confined workspace with the whole filesystem.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-home-"));
    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      fs.mkdirSync(path.join(home, ".private-agents"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".private-agents", "sandbox.json"),
        JSON.stringify({ enabled: true }),
        "utf8",
      );
      writeRules({ enabled: true, filesystem: { allowWrite: ["/"] } });

      expect(readSandboxRules(workspace).filesystem?.allowWrite).toBeUndefined();
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("still takes a project file's additions when the user set no rule of their own", () => {
    // With nothing from the user there is nothing to relax, so the project's own
    // restrictions apply as written.
    writeRules({ enabled: true, filesystem: { denyRead: ["/etc"] } });

    expect(readSandboxRules(workspace).filesystem?.denyRead).toEqual(["/etc"]);
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
