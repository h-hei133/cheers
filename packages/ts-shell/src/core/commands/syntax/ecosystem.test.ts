import * as files from "../../../session/store/sessionFileStore.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runPluginCommand, getInstalledPlugins } from "../pluginCommandRuntime.js";
import { runMarketplaceCommand } from "../marketplaceCommandRuntime.js";
import { createCommandRegistry } from "../registry.js";

let root: string; let plugins: string; let sources: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ecosystem-args-"));
  plugins = path.join(root, "plugins.json"); sources = path.join(root, "sources.json");
  vi.stubEnv("CHEERS_PLUGINS_FILE", plugins); vi.stubEnv("CHEERS_MARKETPLACES_FILE", sources);
  fs.writeFileSync(plugins, "[]"); fs.writeFileSync(sources, "[]");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it("rejects ignored extra arguments before mutating either registry", async () => {
  await runPluginCommand(["add", "fixture"], { cwd: root });
  await runMarketplaceCommand(["add", "fixture", "https://example.invalid"], { cwd: root });
  for (const [name, file, run, inputs] of [
    ["plugin", plugins, runPluginCommand, [["disable", "fixture", "extra"], ["remove", "fixture", "extra"], ["install", "other", "extra"], ["list", "extra"], ["--unknown"]]],
    ["marketplace", sources, runMarketplaceCommand, [["rm", "fixture", "extra"], ["add", "other", "url", "extra"], ["list", "extra"], ["--unknown"]]],
  ] as const) {
    const before = fs.readFileSync(file); const stamp = fs.statSync(file).mtimeMs;
    for (const args of inputs) {
      expect((await run([...args], { cwd: root })).output).toContain(`Invalid /${name} arguments`);
      expect(fs.readFileSync(file)).toEqual(before); expect(fs.statSync(file).mtimeMs).toBe(stamp);
    }
  }
});

it("does not publish a phantom registration or enabled state after atomic write failure", async () => {
  await runPluginCommand(["add", "fixture"], { cwd: root });
  const before = fs.readFileSync(plugins);
  vi.spyOn(files, "writeJsonFileAtomic").mockImplementation(() => { throw new Error("fixture write failure"); });
  for (const args of [["add", "new-package"], ["disable", "fixture"], ["remove", "fixture"]]) {
    expect((await runPluginCommand(args, { cwd: root })).output).toContain("not confirmed saved");
    expect(fs.readFileSync(plugins)).toEqual(before);
    expect(getInstalledPlugins().map(item => [item.name, item.enabled])).toEqual([["fixture", true]]);
  }
});

it("reads the current registry on every mutation and refuses corrupt state", async () => {
  await runPluginCommand(["add", "first"], { cwd: root });
  const records = JSON.parse(fs.readFileSync(plugins, "utf8"));
  records.push({ ...records[0], name: "external", spec: "external" }); fs.writeFileSync(plugins, JSON.stringify(records));
  await runPluginCommand(["add", "third"], { cwd: root });
  expect(getInstalledPlugins().map(item => item.name)).toEqual(["first", "external", "third"]);
  for (const invalid of ["{", "{}", '[{"name":"invalid"}]']) {
    fs.writeFileSync(plugins, invalid);
    expect((await runPluginCommand(["add", "fourth"], { cwd: root })).output).toContain("not confirmed saved");
    expect(fs.readFileSync(plugins, "utf8")).toBe(invalid);
  }
});

it("exposes real aliases and preserves the unavailable search explanation", async () => {
  const registry = createCommandRegistry(root);
  expect(registry.get("plugin")!.getArgumentCompletions?.("ins")?.map(item => item.value)).toEqual(["install"]);
  expect(registry.get("marketplace")!.getArgumentCompletions?.("ls")?.map(item => item.value)).toEqual(["ls"]);
  expect(registry.get("plugin")!.getArgumentCompletions?.("disable fixture ")).toBeNull();
  expect((await runPluginCommand(["find", "some", "query"], { cwd: root })).output).toContain("no catalogue service");
});
