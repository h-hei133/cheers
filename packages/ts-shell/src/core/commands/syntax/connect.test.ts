import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runConnectCommand, addConnection, addConnectionFromLegacyAuthSet, activateConnection, removeConnection, __setConnectBrowserFlowRunnerForTest, __setOpenAIAccountAuthRunnerForTest } from "../connectCommandRuntime.js";
import { getUserRuntimeConfigPath, writeUserRuntimeConfigFile } from "../../../config/runtimeConfig.js";
import { createCommandRegistry } from "../registry.js";

let root: string;
const browser = vi.fn(); const account = vi.fn();
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connect-syntax-")); vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root);
  writeUserRuntimeConfigFile({ provider: "openai" });
  browser.mockReset(); account.mockReset();
  __setConnectBrowserFlowRunnerForTest(browser); __setOpenAIAccountAuthRunnerForTest(account);
});
afterEach(() => { __setConnectBrowserFlowRunnerForTest(); __setOpenAIAccountAuthRunnerForTest(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each([
  ["login", "openai", "--account", "--api-key", "fixture-secret"],
  ["login", "openai", "--browser", "--account"],
  ["login", "openai", "--browser", "--model", "ignored"],
  ["login", "openai", "--account=false"],
  ["login", "openai", "--api-key", "fixture-secret", "--key", "duplicate"],
  ["login", "openai", "--unknown", "fixture-secret"],
  ["login", "openai", "--label"],
  ["login", "openai", "extra", "--api-key", "fixture-secret"],
  ["set", "openai", "fixture-secret", "url", "model", "extra"],
  ["use", "openai", "extra"], ["rm", "openai", "extra"], ["status", "extra"], ["help", "extra"],
])("rejects invalid connection input %j before writes or auth", async (...args) => {
  const file = getUserRuntimeConfigPath(); const before = fs.readFileSync(file); const stamp = fs.statSync(file).mtimeMs;
  const result = await runConnectCommand(args, { cwd: root });
  expect(result.output).toContain("Invalid /connect arguments"); expect(result.output).not.toContain("fixture-secret");
  expect(fs.readFileSync(file)).toEqual(before); expect(fs.statSync(file).mtimeMs).toBe(stamp);
  expect(browser).not.toHaveBeenCalled(); expect(account).not.toHaveBeenCalled();
});

it("guards directly exported mutators and retains inline key values", async () => {
  const file = getUserRuntimeConfigPath(); const before = fs.readFileSync(file);
  for (const result of [await addConnection(["openai", "--api-key", "fixture-secret", "extra"]), await addConnectionFromLegacyAuthSet(["openai", "fixture-secret", "url", "model", "extra"]), activateConnection(["openai", "extra"]), removeConnection(["openai", "extra"])]) {
    expect(result).toContain("Invalid /connect arguments"); expect(fs.readFileSync(file)).toEqual(before);
  }
  expect(await addConnection(["openai", "--key=fixture-secret"])).toContain("Connected provider openai");
  expect(JSON.parse(fs.readFileSync(file, "utf8")).providerConnections[0].apiKey).toBe("fixture-secret");
  expect(activateConnection(["--", "openai"])).toContain("Active connection switched");
});

it("suggests providers only at their legal position and excludes auth conflicts", () => {
  const registry = createCommandRegistry(root);
  const suggest = (prefix: string) => registry.get("connect")!.getArgumentCompletions?.(prefix)?.map(item => item.value) ?? [];
  expect(suggest("login gem")).toEqual(["gemini"]);
  expect(suggest("status ")).toEqual([]);
  expect(suggest("act")).toEqual(["activate"]);
  expect(suggest("login openai --account --b")).toEqual([]);
  expect(suggest("login openai --api-key ")).toEqual([]);
});
