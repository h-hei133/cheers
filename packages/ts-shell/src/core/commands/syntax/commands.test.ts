import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectTrustStore, projectTrust } from "../../security/projectTrust.js";
import { runTrustCommand } from "../trustCommandRuntime.js";
import { runTodoCommand, getSessionTodos, forgetSessionTodos } from "../todoCommandRuntime.js";
import { runThinkingCommand } from "../thinkingCommandRuntime.js";
import { routeSlashCommand } from "../slashRouter.js";
import { createCommandRegistry } from "../registry.js";
import { trustSyntax } from "../trust/syntax.js";
import { todoSyntax } from "../todo/syntax.js";
import { thinkingSyntax } from "../thinking/syntax.js";
import { parseSyntax } from "./parse.js";

import { SessionManager } from '../../../session/SessionManager.js';
import { readSessionModel } from '../../../session/model/state.js';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
let root: string;
function thinkingContext() {
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'test', providerConnections: [{ id: 'test', provider: 'openai', authType: 'api-key', apiKey: 'synthetic', model: 'custom-model', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  return { cwd: root, sessionId: new SessionManager().createNew(root).id };
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "command-syntax-")); });
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  forgetSessionTodos(root);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("trust command and storage boundaries", () => {
  it.each(["constructor", "__proto__", "toString", "unknown", "on extra", "off extra", "session extra", "status extra", "--on"])("rejects %s without changing an untrusted decision", async text => {
    const file = path.join(root, "trust.json");
    const store = new ProjectTrustStore(file);
    store.setProjectTrust(root, "untrusted");
    const before = fs.readFileSync(file);
    const setter = vi.spyOn(projectTrust, "setProjectTrust").mockImplementation((target, level) => store.setProjectTrust(target, level));
    const direct = await runTrustCommand(text.split(" "), { cwd: root });
    const routed = await routeSlashCommand(`/trust ${text}`, { cwd: root });
    for (const result of [direct, routed]) expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /trust arguments:") });
    expect(setter).not.toHaveBeenCalled();
    expect(fs.readFileSync(file)).toEqual(before);
    expect(store.isProjectUntrusted(root)).toBe(true);
  });

  it.each(["constructor", "__proto__", "unknown", "", null, undefined, {}, 1, Object])("rejects an invalid storage value independently: %s", value => {
    const file = path.join(root, "trust.json");
    const store = new ProjectTrustStore(file);
    store.setProjectTrust(root, "untrusted");
    const before = fs.readFileSync(file);
    expect(() => store.setProjectTrust(root, value as never)).toThrow("Invalid project trust level.");
    expect(fs.readFileSync(file)).toEqual(before);
    expect(store.isProjectUntrusted(root)).toBe(true);
    expect(store.isProjectTrusted(root)).toBe(false);
  });

  it.each(["on", "off", "session"])("keeps the legal %s action", async action => {
    const setter = vi.spyOn(projectTrust, "setProjectTrust").mockImplementation(() => ({ scope: "durable", changed: true }));
    const result = await runTrustCommand([action], { cwd: root });
    expect(result.output).toContain("Recorded");
    expect(setter).toHaveBeenCalledWith(root, trustSyntax.actions.find(item => item.name === action)!.level);
  });

  it("withdraws this project's remembered hook approvals and leaves the rest standing", async () => {
    // The finding this answers: a grant could be recorded and never taken back.
    const { hookFingerprint, HookTrustStore } = await import("../../hooks/trust.js");
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(workspace, ".agents", "hooks.json"), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "bash", hooks: [{ type: "command", command: "./check.sh" }] }] },
    }));
    const here = { event: "PreToolUse", matcher: "bash", command: "./check.sh",
      sourcePath: path.join(workspace, ".agents", "hooks.json") };
    const elsewhere = { ...here, sourcePath: path.join(root, "other", ".agents", "hooks.json") };
    const store = new HookTrustStore();
    store.recordTrust(hookFingerprint(here));
    store.recordTrust(hookFingerprint(elsewhere));

    const result = await runTrustCommand(["forget"], { cwd: workspace });

    expect(result.output).toContain("Withdrew 1 remembered approval");
    expect(store.isTrusted(hookFingerprint(here))).toBe(false);
    expect(store.isTrusted(hookFingerprint(elsewhere))).toBe(true);
    // Said plainly when there was nothing to withdraw, rather than claiming a
    // withdrawal that removed nothing.
    expect((await runTrustCommand(["forget"], { cwd: workspace })).output).toContain("Nothing was withdrawn");
  });
});

describe("state-changing argument validation", () => {
  it.each(["1junk", "1.0", "1e0", "+1", "-1", "0", "Infinity", "9007199254740993", "1 extra", ""])("rejects todo ID %s without modifying the checklist", async id => {
    await runTodoCommand(["add", "keep this task"], { cwd: root }, root);
    for (const action of ["start", "done", "complete"]) {
      const result = await routeSlashCommand(`/todo ${action} ${id}`, { cwd: root, sessionId: root });
      expect(result).toMatchObject({ output: expect.stringContaining("Invalid /todo arguments:") });
      expect(getSessionTodos(root)).toEqual([{ id: 1, text: "keep this task", status: "pending" }]);
    }
  });

  it("preserves free text and completes by stable ID through the real alias", async () => {
    await runTodoCommand(["add", "", "--flag is task prose"], { cwd: root }, root);
    await runTodoCommand(["complete", "1"], { cwd: root }, root);
    expect(getSessionTodos(root)).toEqual([{ id: 1, text: "--flag is task prose", status: "done" }]);
  });

  it.each(["high extra", "off extra", "low --unknown", "maximum"])("rejects thinking %s before state changes", async text => {
    const context = thinkingContext();
    await runThinkingCommand(["medium"], context);
    const result = await runThinkingCommand(text.split(" "), context);
    expect(result.output).toContain("Invalid /thinking arguments:");
    expect(readSessionModel(context.sessionId)?.thinkingEffort).toBe("medium");
  });

  it.each(["off", "auto", "none"])("keeps thinking %s as the same removal of an effort preference", async action => {
    const context = thinkingContext();
    await runThinkingCommand(["medium"], context);
    await runThinkingCommand([action], context);
    expect(readSessionModel(context.sessionId)?.thinkingEffort).toBeNull();
  });
});

describe("shared syntax projections", () => {
  it("derives each fixed action and alias from the syntax that execution validates", () => {
    const registry = createCommandRegistry(root);
    for (const syntax of [trustSyntax, todoSyntax, thinkingSyntax]) {
      const command = registry.get(syntax.name)!;
      for (const action of syntax.actions) {
        if (!action.name) continue;
        expect(command.argumentHint).toContain(action.name);
        for (const name of [action.name, ...(action.aliases ?? [])]) {
          expect(command.getArgumentCompletions?.(name)?.map(item => item.value)).toContain(name);
          const args = action.name === "edit" ? ['1', 'text'] : action.name === "add" ? ["text"] : action.parameters?.length ? ["1"] : [];
          expect(parseSyntax(syntax, [name, ...args])).toMatchObject({ ok: true, action });
        }
      }
    }
    expect(registry.get("todo")!.getArgumentCompletions?.("add task")).toBeNull();
    expect(registry.get("trust")!.getArgumentCompletions?.("on ")).toBeNull();
  });
});
