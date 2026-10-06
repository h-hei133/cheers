import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogLoader } from "./catalog.js";
import { currentTheme } from "../../../presentation/theme/theme.js";
import { selectedTheme } from "../../../presentation/theme/selection.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

let root: string;
const stops: Array<() => void> = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-theme-catalog-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
  fs.mkdirSync(path.join(root, ".git")); fs.mkdirSync(path.join(root, "nested"));
});
afterEach(() => {
  stops.splice(0).forEach(stop => stop());
  vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
});

it.each(["user", "project", "extra-file", "extra-directory"])("observes %s theme creation, metadata edits and removal without applying it", async source => {
  const directory = source === "user" ? path.join(root, ".cheers", "themes")
    : source === "project" ? path.join(root, ".agents", "themes") : path.join(root, "custom");
  const file = path.join(directory, "fixture.json");
  const extraPaths = source === "extra-file" ? [file] : source === "extra-directory" ? [directory] : [];
  const context = { cwd: path.join(root, "nested"), session: { id: "fixture" }, runtimeConfig: {} } as ShellRuntimeContext;
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, extraPaths);
  const appearance = [currentTheme(), selectedTheme()];
  const changed = vi.fn(); const stop = load.observe("theme", undefined, changed);
  if (stop) stops.push(stop);
  const values = async () => (await load("theme", new AbortController().signal)).map(item => item.value);
  expect(await values()).not.toContain("fixture-first");
  expect(fs.existsSync(directory)).toBe(false);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ name: "fixture-first", colors: {} }));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toContain("fixture-first");
  changed.mockClear();
  const replacement = path.join(root, "replacement.json");
  fs.writeFileSync(replacement, JSON.stringify({ name: "fixture-renamed", colors: {} }));
  fs.renameSync(replacement, file);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const bytes = fs.readFileSync(file); const mtime = fs.statSync(file).mtimeMs;
  expect(await values()).toContain("fixture-renamed");
  expect(await values()).not.toContain("fixture-first");
  expect(fs.readFileSync(file)).toEqual(bytes); expect(fs.statSync(file).mtimeMs).toBe(mtime);
  changed.mockClear(); fs.unlinkSync(file);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).not.toContain("fixture-renamed");
  expect([currentTheme(), selectedTheme()]).toEqual(appearance);
});
