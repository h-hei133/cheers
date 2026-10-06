import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogLoader } from "./catalog.js";
import { catalogSources } from "./sources.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

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
  const context = { cwd: root, session: { id: "fixture" }, runtimeConfig: {} } as ShellRuntimeContext;
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const changed = vi.fn(); const stop = load.observe(kind, undefined, changed)!; stops.push(stop);
  const values = async () => (await load(kind, new AbortController().signal)).map(item => item.value);
  const value = (id: string) => kind === "connection" ? id : `openai/${id}`;
  expect(await values()).toContain(value("older"));
  expect(fs.existsSync(path.dirname(current))).toBe(false);
  fs.mkdirSync(path.dirname(current)); fs.writeFileSync(current, payload("newer"));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toContain(value("newer"));
  expect(await values()).not.toContain(value("older"));
  changed.mockClear();
  const replacement = path.join(root, "replacement.json");
  fs.writeFileSync(replacement, payload("replacement")); fs.renameSync(replacement, current);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toContain(value("replacement"));
  changed.mockClear(); fs.unlinkSync(current);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toContain(value("older"));
  stop(); changed.mockClear(); fs.writeFileSync(previous, payload("after-stop"));
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(changed).not.toHaveBeenCalled();
});

it("tracks every trust-file fallback without creating files or traversing home", () => {
  const sources = catalogSources("workflow", root);
  expect(sources).toEqual([
    path.join(root, ".agents", "workflows"),
    ...[".cheers", ".cheer", ".private-agents", ".coding-agents"].map(dir => path.join(root, dir, "trust.json")),
  ]);
  expect(fs.readdirSync(root)).toEqual([]);
});
