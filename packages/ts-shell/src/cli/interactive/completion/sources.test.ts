import { loadCatalog } from "../../../core/models/catalogStore.js";
import { withConfiguration } from "../../../test-utils/configuration.js";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogLoader } from "./catalog.js";
import { catalogSources } from "./sources.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";
import { projectTrust } from "../../../core/security/trust/store.js";

let root: string;
const stops: Array<() => void> = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-catalog-sources-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
});
afterEach(() => {
  stops.splice(0).forEach(stop => stop());
  vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
});

it.each(["connection", "model"] as const)("reloads %s when source precedence changes and releases observers", async kind => {
  const name = kind === "connection" ? "config.json" : "models.json";
  const previous = path.join(root, ".cheer", name);
  const current = path.join(root, ".cheers", name);
  const payload = (id: string) => JSON.stringify(kind === "connection"
    ? { providerConnections: [{ id, provider: "openai", apiKey: "synthetic-private-key" }] }
    : { providers: { openai: { models: [{ id, contextWindow: 1000 }] } } });
  fs.mkdirSync(path.dirname(previous)); fs.writeFileSync(previous, payload("older"));
  const context = withConfiguration({ cwd: root, session: { id: "fixture" }, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const changed = vi.fn(); const stop = load.observe(kind, undefined, changed)!; stops.push(stop);
  const values = async () => (await load(kind, new AbortController().signal)).map(item => item.value);
  const publishModels = () => {
    if (kind !== "model") return;
    const state = context.configuration; const { config, binding } = state.current;
    expect(state.publish(state.begin(binding), config, binding, undefined, loadCatalog()).status).toBe("applied");
  };
  const value = (id: string) => kind === "connection" ? id : `openai/${id}`;
  expect(await values()).toContain(value("older"));
  expect(fs.existsSync(path.dirname(current))).toBe(false);
  fs.mkdirSync(path.dirname(current)); fs.writeFileSync(current, payload("newer"));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  if (kind === "model") expect(await values()).toContain(value("older"));
  publishModels();
  expect(await values()).toContain(value("newer"));
  expect(await values()).not.toContain(value("older"));
  changed.mockClear();
  const replacement = path.join(root, "replacement.json");
  fs.writeFileSync(replacement, payload("replacement")); fs.renameSync(replacement, current);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  publishModels();
  expect(await values()).toContain(value("replacement"));
  changed.mockClear(); fs.unlinkSync(current);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  publishModels();
  expect(await values()).toContain(value("older"));
  stop(); changed.mockClear(); fs.writeFileSync(previous, payload("after-stop"));
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(changed).not.toHaveBeenCalled();
});

it("tracks every trust-file fallback without creating files or traversing home", () => {
  const sources = catalogSources("workflow", { cwd: root, projectRoot: root });
  expect(sources).toEqual([
    path.join(root, ".agents", "workflows"),
    ...[".cheers", ".cheer", ".private-agents", ".coding-agents"].map(dir => path.join(root, dir, "trust.json")),
  ]);
  expect(fs.readdirSync(root)).toEqual([]);
});

it('refreshes theme completions when trust is saved and revoked', async () => {
  fs.mkdirSync(path.join(root, '.git')); const themes = path.join(root, '.agents', 'themes');
  fs.mkdirSync(themes, { recursive: true }); fs.writeFileSync(path.join(themes, 'custom.json'), JSON.stringify({ colors: {} }));
  const context = withConfiguration({ cwd: root, projectRoot: root, session: { id: 'theme' }, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const changed = vi.fn(); const stop = load.observe('theme', undefined, changed)!; stops.push(stop);
  const values = async () => (await load('theme', new AbortController().signal)).map(item => item.value);
  expect(await values()).not.toContain('custom');
  projectTrust.setProjectTrust(root, 'trusted'); await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toContain('custom'); changed.mockClear();
  fs.writeFileSync(path.join(themes, 'added.json'), JSON.stringify({ colors: {} }));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toContain('added'); changed.mockClear();
  projectTrust.setProjectTrust(root, 'untrusted'); await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).not.toContain('custom');
  expect(await values()).not.toContain('added');
});

it.each(['themes', 'agents', 'workspace'])('reattaches theme observations after a lexical %s link is replaced', async kind => {
  const first = path.join(root, 'first'); const second = path.join(root, 'second'); const alias = path.join(root, 'alias');
  for (const directory of [first, second, alias]) fs.mkdirSync(path.join(directory, '.git'), { recursive: true });
  const firstThemes = path.join(first, '.agents', 'themes'); const secondThemes = path.join(second, '.agents', 'themes');
  fs.mkdirSync(firstThemes, { recursive: true }); fs.mkdirSync(secondThemes, { recursive: true });
  fs.writeFileSync(path.join(firstThemes, 'first.json'), JSON.stringify({ colors: {} }));
  fs.writeFileSync(path.join(secondThemes, 'second.json'), JSON.stringify({ colors: {} }));
  fs.mkdirSync(path.join(alias, '.agents'));
  const location = kind === 'themes' ? path.join(alias, '.agents', 'themes') : kind === 'agents' ? path.join(alias, '.agents') : alias;
  const target = (directory: string) => kind === 'themes' ? path.join(directory, '.agents', 'themes') : kind === 'agents' ? path.join(directory, '.agents') : directory;
  fs.rmSync(location, { recursive: true, force: true }); fs.symlinkSync(target(first), location, 'dir');
  projectTrust.setProjectTrust(first, 'trusted'); projectTrust.setProjectTrust(second, 'trusted');
  const context = withConfiguration({ cwd: alias, projectRoot: alias, session: { id: 'theme-alias' }, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const changed = vi.fn(); const stop = load.observe('theme', undefined, changed)!; stops.push(stop);
  const values = async () => (await load('theme', new AbortController().signal)).map(item => item.value);
  expect(await values()).toContain('first'); expect(await values()).not.toContain('second');
  fs.unlinkSync(location); fs.symlinkSync(target(second), location, 'dir');
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toContain('second'); expect(await values()).not.toContain('first');
  changed.mockClear(); fs.writeFileSync(path.join(secondThemes, 'added.json'), JSON.stringify({ colors: {} }));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled()); expect(await values()).toContain('added');
  stop(); changed.mockClear(); fs.writeFileSync(path.join(secondThemes, 'stopped.json'), JSON.stringify({ colors: {} }));
  await new Promise(resolve => setTimeout(resolve, 100)); expect(changed).not.toHaveBeenCalled();
});

it('observes canonical ancestor resource links when the workspace alias points below the project marker', async () => {
  const project = path.join(root, 'project'); const nested = path.join(project, 'nested'); const alias = path.join(root, 'alias');
  const first = path.join(root, 'first'); const second = path.join(root, 'second');
  for (const directory of [nested, path.join(project, '.git'), path.join(project, '.agents'), first, second]) fs.mkdirSync(directory, { recursive: true });
  fs.symlinkSync(nested, alias, 'dir'); const location = path.join(project, '.agents', 'themes'); fs.symlinkSync(first, location, 'dir');
  fs.writeFileSync(path.join(first, 'first.json'), JSON.stringify({ colors: {} }));
  fs.writeFileSync(path.join(second, 'second.json'), JSON.stringify({ colors: {} }));
  projectTrust.setProjectTrust(first, 'trusted'); projectTrust.setProjectTrust(second, 'trusted');
  const context = withConfiguration({ cwd: alias, projectRoot: alias, session: { id: 'nested-alias' }, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const changed = vi.fn(); const stop = load.observe('theme', undefined, changed)!; stops.push(stop);
  const values = async () => (await load('theme', new AbortController().signal)).map(item => item.value);
  expect(await values()).toContain('first');
  fs.unlinkSync(location); fs.symlinkSync(second, location, 'dir');
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toContain('second'); expect(await values()).not.toContain('first');
  changed.mockClear(); fs.writeFileSync(path.join(second, 'added.json'), JSON.stringify({ colors: {} }));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled()); expect(await values()).toContain('added');
});
