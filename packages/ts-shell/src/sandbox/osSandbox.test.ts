import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  networkNotice,
  planSandboxedCommand,
  planWithoutLauncher,
  readSandboxRules,
} from "./osSandbox.js";

describe("os sandbox rules", () => {
  let workspace = "";
  let originalHome: string | undefined;
  let originalProfile: string | undefined;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "os-sandbox-"));
    originalHome = process.env.HOME;
    originalProfile = process.env.USERPROFILE;
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalProfile !== undefined) process.env.USERPROFILE = originalProfile;
    else delete process.env.USERPROFILE;
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

  it("reads the user file from a directory an earlier name left behind", () => {
    // Isolation the user switched on under an older name still has to hold: a
    // rule that silently stops applying is worse than one never written.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-home-"));
    process.env.HOME = home;
    delete process.env.USERPROFILE;
    try {
      fs.mkdirSync(path.join(home, ".private-agents"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".private-agents", "sandbox.json"),
        JSON.stringify({ enabled: true }),
        "utf8",
      );

      expect(readSandboxRules(workspace).enabled).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not let a project turn off isolation the user enabled", () => {
    // Only the user decides whether their commands are isolated. A project's file
    // tightens that decision or leaves it alone; it must not be able to lift it,
    // or cloning a repository would be enough to run its code unconfined.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-home-"));
    process.env.HOME = home;
    delete process.env.USERPROFILE;
    try {
      fs.mkdirSync(path.join(home, ".cheers"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".cheers", "sandbox.json"),
        JSON.stringify({ enabled: true }),
        "utf8",
      );
      writeRules({ enabled: false });

      expect(readSandboxRules(workspace).enabled).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not let a project widen the paths the user allowed", () => {
    // `allowWrite` is the list of places a command may modify. A project able to
    // append to it could grant itself the whole filesystem.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-home-"));
    process.env.HOME = home;
    delete process.env.USERPROFILE;
    try {
      fs.mkdirSync(path.join(home, ".cheers"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".cheers", "sandbox.json"),
        JSON.stringify({ enabled: true, filesystem: { allowWrite: ["/tmp/ok"] } }),
        "utf8",
      );
      writeRules({ enabled: true, filesystem: { allowWrite: ["/"] } });

      const rules = readSandboxRules(workspace);

      expect(rules.filesystem?.allowWrite).toEqual(["/tmp/ok"]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not let a project name writable paths when the user asked for isolation", () => {
    // The user turning isolation on without listing paths means the built-in
    // default, not "let the project decide". A project naming `/` here would be
    // replacing a confined workspace with the whole filesystem.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-home-"));
    process.env.HOME = home;
    delete process.env.USERPROFILE;
    try {
      fs.mkdirSync(path.join(home, ".cheers"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".cheers", "sandbox.json"),
        JSON.stringify({ enabled: true }),
        "utf8",
      );
      writeRules({ enabled: true, filesystem: { allowWrite: ["/"] } });

      expect(readSandboxRules(workspace).filesystem?.allowWrite).toBeUndefined();
    } finally {
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

  /**
   * The refusal path, tested through the function that decides it.
   *
   * Written against `planWithoutLauncher` rather than the plan because the plan
   * has to look for a launcher, and on a machine that has one it takes the
   * isolating branch and never reaches this decision. The first version of this
   * test did exactly that: it passed, and it passed with the refusal deleted,
   * because the host had `bwrap` installed. A test that cannot fail is not
   * evidence, so the decision was separated from the lookup.
   */
  it("refuses when isolation was required and no launcher exists", () => {
    const plan = planWithoutLauncher({ enabled: true, failClosed: true });

    expect(plan.state).toBe("refused");
    expect(plan.command).toBeUndefined();
    expect(plan.notice).toMatch(/Refused to run/);
    // The message has to say what to do, or the setting is a dead end.
    expect(plan.notice).toMatch(/bwrap|sandbox-exec|launcher|no sandbox/);
    expect(plan.notice).toMatch(/failClosed/);
  });

  it("runs and reports it when isolation was required but not insisted on", () => {
    // The default, unchanged: a notice on every command. Someone who wants the
    // command to run anyway keeps getting it run.
    const plan = planWithoutLauncher({ enabled: true });

    expect(plan.state).toBe("unavailable");
    expect(plan.notice).toMatch(/WITHOUT isolation/);
    expect(plan.command).toBeUndefined();
  });

  it("does not refuse when isolation was never requested", () => {
    // `failClosed` without `enabled` asks nothing be enforced, so nothing is
    // refused: it qualifies a request for isolation, it is not one.
    const plan = planSandboxedCommand({
      shell: "bash",
      shellArgs: ["-c", "ls"],
      workspaceRoot: workspace,
      rules: { failClosed: true },
    });
    expect(plan.state).toBe("off");
  });

  it("accumulates failClosed across the two files, like denyRead", () => {
    // A restriction, so a project cannot switch off what the user asked for:
    // the project file here says `false` and the user file says `true`, and the
    // answer has to be the user's. Written through the reader so it covers the
    // merge rather than only the type.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-home-"));
    process.env.HOME = home;
    delete process.env.USERPROFILE;
    try {
      fs.mkdirSync(path.join(home, ".private-agents"), { recursive: true });
      fs.writeFileSync(
        path.join(home, ".private-agents", "sandbox.json"),
        JSON.stringify({ enabled: true, failClosed: true }),
        "utf8",
      );
      writeRules({ failClosed: false });

      const rules = readSandboxRules(workspace);
      expect(rules.failClosed).toBe(true);
      expect(planWithoutLauncher(rules).state).toBe("refused");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("lets the project ask for failClosed when the user did not", () => {
    // The other direction, so this is not a test that only ever returns true.
    writeRules({ enabled: true, failClosed: true });
    expect(readSandboxRules(workspace).failClosed).toBe(true);
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
