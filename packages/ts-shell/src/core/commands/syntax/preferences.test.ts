import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ShellManager } from "../../shell/platform/shellManager.js";
import { runShellCommand } from "../shellCommandRuntime.js";
import { runStatuslineCommand } from "../statuslineCommandRuntime.js";
import { runSettingsCommand } from "../settingsCommandRuntime.js";
import { runFastCommand } from "../fastCommandRuntime.js";
import { createCommandRegistry } from "../registry.js";
import { writeStatusItems } from "../../../cli/interactive/tuiSettings.js";
import * as projectState from "../../state/projectState.js";
import { STATUS_ITEMS } from "../../../presentation/tui/chrome/items.js";
import { statuslineCompletions } from "../statusline/syntax.js";
import { CONFIG_SETTINGS } from '../../../config/settings.js';
import { SessionManager } from '../../../session/SessionManager.js';
import * as modelState from '../../../session/model/state.js';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "command-preferences-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each([ ["status", "extra"], ["auto", "extra"], ["reset", "--yes"], ["use", "bash", "extra"], ["use", "constructor"], ["set"] ])("rejects shell arguments before accessing the backend: %j", async (...args) => {
  const set = vi.spyOn(ShellManager, "setBackend");
  const reset = vi.spyOn(ShellManager, "resetToAuto");
  const status = vi.spyOn(ShellManager, "formatStatusReport");
  expect((await runShellCommand(args, { cwd: root })).output).toContain("Invalid /shell arguments");
  expect(set).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled();
});

it.each([ ["list", "extra"], ["use", "model", "unknown"], ["use", "model,,cost"], ["use", ",model"], ["use", "model,"], ["use", "--unknown"] ])("refuses invalid status selections without writing: %j", async (...args) => {
  const stored = writeStatusItems(root, ["model"]);
  const before = fs.readFileSync(stored.path); const stamp = fs.statSync(stored.path).mtimeMs;
  expect((await runStatuslineCommand(args, { cwd: root })).output).toContain("Invalid /statusline arguments");
  expect(fs.readFileSync(stored.path)).toEqual(before); expect(fs.statSync(stored.path).mtimeMs).toBe(stamp);
});

it("shares status item IDs and preserves comma lists, catalogue order and deduplication", async () => {
  const result = await runStatuslineCommand(["use", "cost,model", "cost"], { cwd: root });
  const expected = STATUS_ITEMS.filter(item => ["cost", "model"].includes(item.id)).map(item => item.id);
  expect(result.output).toContain(`Status band set to: ${expected.join(", ")}`);
  expect(statuslineCompletions("use model,co")?.map(item => item.value)).toEqual(["model,context", "model,cost"]);
  expect(statuslineCompletions("use model ")?.some(item => item.value === "model")).toBe(false);
  expect(statuslineCompletions("use unknown ")).toBeNull();
  expect(statuslineCompletions("list ")).toBeNull();
});

it("only describes implemented settings and refuses extra arguments", async () => {
  const command = createCommandRegistry(root).get("settings")!;
  expect(command.getArgumentCompletions?.("")?.map(item => item.value)).toEqual(["set", ...CONFIG_SETTINGS.map(item => item.key)]);
  expect((await runSettingsCommand(["attentionOnIdle"], { cwd: root })).output).toContain("### attentionOnIdle");
  expect((await runSettingsCommand(["temperature"], { cwd: root })).output).toContain('### temperature');
  for (const args of [["offline", "true"], ["providerCredentials"], ["attentionOnIdle", "extra"]]) {
    expect((await runSettingsCommand(args, { cwd: root })).output).toContain("Invalid /settings arguments");
  }
});

it("rejects extra tier arguments, preserves aliases and reports failed persistence truthfully", async () => {
  writeUserRuntimeConfigFile({ activeProviderConnectionId: 'fixture', provider: 'openai', providerConnections: [{
    id: 'fixture', provider: 'openai', model: 'o4-mini', authType: 'api-key', apiKey: 'synthetic-key', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  const manager = new SessionManager(); const session = manager.createNew(root);
  modelState.writeSessionModel(session.id, { connectionId: 'fixture', provider: 'openai', model: 'o4-mini' }, modelState.readSessionModelEdit(session.id));
  const context = { cwd: root, sessionId: session.id };
  await runFastCommand(["1"], context);
  const file = path.join(manager.getSessionDirPath(session.id), 'state.json'); const before = fs.readFileSync(file);
  for (const args of [["off", "extra"], ["toggle", "--force"], ["bogus"]]) {
    expect((await runFastCommand(args, context)).output).toContain("Invalid /fast arguments");
    expect(fs.readFileSync(file)).toEqual(before);
  }
  await runFastCommand(["disable"], context);
  expect(modelState.readSessionModel(session.id)?.serviceTier).toBe('default');
  vi.spyOn(modelState, "writeSessionModel").mockImplementationOnce(() => { throw new Error('disk unavailable'); });
  const failed = await runFastCommand(["on"], context);
  expect(failed.output).toContain("write outcome is unverified");
  expect(failed.output).not.toContain("Service tier set");
  expect(modelState.readSessionModel(session.id)?.serviceTier).toBe('default');
});

it("offers backend IDs only after a legal selecting action, including aliases", () => {
  const registry = createCommandRegistry(root);
  const shell = registry.get("shell")!;
  for (const prefix of ["use ", "set "]) expect(shell.getArgumentCompletions?.(prefix)?.map(item => item.value)).toContain("bash");
  for (const prefix of ["status ", "diag ", "auto ", "use bash ", "bogus "]) expect(shell.getArgumentCompletions?.(prefix)).toBeNull();
  expect(shell.getArgumentCompletions?.("re")?.map(item => item.value)).toContain("reset");
  expect(registry.get("fast")!.summary).toContain('service tier');
  expect(registry.get("fast")!.getArgumentCompletions?.("0")?.map(item => item.value)).toEqual(["0"]);
});
