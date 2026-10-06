import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HookDispatcher } from "./hookDispatcher.js";
import { registerDeclaredHooks } from "./registration.js";
import { HookTrustStore } from "./trust.js";

describe("registering declared hooks", () => {
  let tempDir: string;
  let trustPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-register-"));
    trustPath = path.join(tempDir, "hook-trust.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * What actually ran, read back from disk.
   *
   * A hook command appends its label to this file, so a test can tell "the hook
   * was registered" from "the hook was allowed to run" — which is the whole
   * distinction the gate introduces.
   */
  const markerPath = () => path.join(tempDir, "executed.txt");

  /** A command that records `label` when it actually runs. */
  function markerCommand(label: string): string {
    return `printf '%s\\n' '${label}' >> ${markerPath()}`;
  }

  /** The labels of the hooks that ran, in order. */
  function ran(): string[] {
    try {
      return fs.readFileSync(markerPath(), "utf8").split("\n").filter((line) => line !== "");
    } catch {
      return [];
    }
  }

  /** A workspace declaring one PreToolUse hook with the given command. */
  function declareHook(command: string): string {
    const workspace = path.join(tempDir, "workspace");
    fs.mkdirSync(path.join(workspace, ".agents"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".agents", "hooks.json"),
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "bash", hooks: [{ type: "command", command }] }] },
      }),
      "utf8",
    );
    return workspace;
  }

  /** Run one PreToolUse event against a bash call. */
  const fire = (dispatcher: HookDispatcher) =>
    dispatcher.dispatch({
      eventName: "PreToolUse",
      workspaceRoot: tempDir,
      toolName: "bash",
      toolArgs: {},
    } as never);

  const asking = () => Promise.resolve(true);
  const refusing = () => Promise.resolve(false);
  const homeDir = () => path.join(tempDir, "home");

  it.each(['bypass', 'approval'])('does not launch a hook after revocation during %s', async stage => {
    let blocked = false;
    const dispatcher = new HookDispatcher();
    registerDeclaredHooks(dispatcher, declareHook(markerCommand('revoked')), {
      trustStore: new HookTrustStore(trustPath), homeDir: homeDir(), bypassed: stage === 'bypass',
      admission: () => {
        const reason = blocked ? 'configuration revoked' : undefined;
        if (stage === 'bypass') queueMicrotask(() => { blocked = true; });
        return reason;
      },
      requestApproval: async () => { blocked = true; return true; },
    });
    await fire(dispatcher);
    expect(ran()).toEqual([]);
  });

  it("does not run a hook the user refused", async () => {
    const dispatcher = new HookDispatcher();
    registerDeclaredHooks(dispatcher, declareHook(markerCommand("refused")), {
      requestApproval: refusing,
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });

    await fire(dispatcher);

    expect(ran()).toEqual([]);
  });

  it("runs a hook the user approved", async () => {
    const dispatcher = new HookDispatcher();
    registerDeclaredHooks(dispatcher, declareHook(markerCommand("approved")), {
      requestApproval: asking,
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });

    await fire(dispatcher);

    expect(ran()).toEqual(["approved"]);
  });

  it("asks only once for a command it has already been told to allow", async () => {
    const workspace = declareHook(markerCommand("once"));
    let asked = 0;
    const requestApproval = () => {
      asked++;
      return Promise.resolve(true);
    };

    const first = new HookDispatcher();
    registerDeclaredHooks(first, workspace, {
      requestApproval,
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });
    await fire(first);

    const second = new HookDispatcher();
    registerDeclaredHooks(second, workspace, {
      requestApproval,
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });
    await fire(second);

    expect(asked).toBe(1);
    expect(ran()).toEqual(["once", "once"]);
  });

  it("asks again when the command changed after it was approved", async () => {
    // The gate is about what will run, not about who wrote the file. An approved
    // name that later points at a different program has not been approved.
    const approved = new HookDispatcher();
    registerDeclaredHooks(approved, declareHook(markerCommand("original")), {
      requestApproval: asking,
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });
    await fire(approved);

    let asked = 0;
    const edited = new HookDispatcher();
    registerDeclaredHooks(edited, declareHook(markerCommand("edited")), {
      requestApproval: () => {
        asked++;
        return Promise.resolve(false);
      },
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });
    await fire(edited);

    expect(asked).toBe(1);
    expect(ran()).toEqual(["original"]);
  });

  it("runs nothing when there is no way to ask", async () => {
    // A non-interactive run must not run a repository's commands just because
    // nobody was there to say no.
    const dispatcher = new HookDispatcher();
    registerDeclaredHooks(dispatcher, declareHook(markerCommand("unattended")), {
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });

    await fire(dispatcher);

    expect(ran()).toEqual([]);
  });

  it("runs declared hooks without asking when the bypass is set", async () => {
    // The escape hatch for a repository someone is auditing by hand. It exists so
    // they do not approve commands one at a time, and it runs only when a flag
    // says so.
    const dispatcher = new HookDispatcher();
    registerDeclaredHooks(dispatcher, declareHook(markerCommand("bypassed")), {
      bypassed: true,
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });

    await fire(dispatcher);

    expect(ran()).toEqual(["bypassed"]);
  });

  it("does not bypass merely because no approval path was given", async () => {
    // The two states must not be confused: one is a deliberate exemption, the
    // other is a run that cannot ask and therefore must refuse.
    const dispatcher = new HookDispatcher();
    registerDeclaredHooks(dispatcher, declareHook(markerCommand("unattended")), {
      trustStore: new HookTrustStore(trustPath),
      homeDir: homeDir(),
    });

    await fire(dispatcher);

    expect(ran()).toEqual([]);
  });

  it("runs a hook this process registered itself without asking", async () => {
    // A built-in hook is this process's own code, not something a repository
    // wrote, so there is nobody to ask and nothing to refuse.
    const dispatcher = new HookDispatcher();
    dispatcher.registerCommandHook({
      event: "PreToolUse",
      matcher: "bash",
      command: markerCommand("builtin"),
    });

    await fire(dispatcher);

    expect(ran()).toEqual(["builtin"]);
  });
});
