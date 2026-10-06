import { withConfiguration } from "../../../test-utils/configuration.js";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogLoader } from "./catalog.js";
import { projectTrust } from "../../../core/security/projectTrust.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

let root: string;
const stops: Array<() => void> = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-skill-catalog-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
  fs.mkdirSync(path.join(root, "workspace"));
  vi.spyOn(projectTrust, "isProjectUntrusted").mockReturnValue(false);
});
afterEach(() => {
  stops.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
function write(file: string, name: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nname: ${name}\ndescription: Fixture instructions\n---\nNever execute during completion.\n`);
}

it("follows newly discovered nested groups, stops at manifests, and releases disabled sources", async () => {
  const context = withConfiguration({ cwd: path.join(root, "workspace"), session: { id: "fixture" }, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const changed = vi.fn(); const stop = load.observe("skill", undefined, changed)!; stops.push(stop);
  const values = async () => (await load("skill", new AbortController().signal)).map(item => item.value);
  expect(await values()).toEqual([]);
  const file = path.join(root, ".cheers", "skills", "group", "nested", "SKILL.md");
  write(file, "nested-first");
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toEqual(["nested-first"]);
  changed.mockClear(); write(file, "nested-edited");
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toEqual(["nested-edited"]);
  const hidden = path.join(path.dirname(file), "references", "SKILL.md"); write(hidden, "not-a-separate-skill");
  expect(await values()).toEqual(["nested-edited"]);
  await new Promise(resolve => setTimeout(resolve, 100)); changed.mockClear();
  write(hidden, "still-not-separate");
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(changed).not.toHaveBeenCalled();
  context.skillOptions = { noSkills: true };
  expect(await values()).toEqual([]);
  changed.mockClear(); write(file, "disabled");
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(changed).not.toHaveBeenCalled();
  stop();
});

it("observes an explicitly named file while discovery is disabled and preserves read-only bytes", async () => {
  const file = path.join(root, "named.md"); write(file, "named-first");
  const context = withConfiguration({ cwd: path.join(root, "workspace"), session: { id: "fixture" }, runtimeConfig: {}, skillOptions: { noSkills: true, skillPaths: [file] } } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const changed = vi.fn(); stops.push(load.observe("skill", undefined, changed)!);
  await load("skill", new AbortController().signal);
  const replacement = path.join(root, "replacement.md"); write(replacement, "named-replaced"); fs.renameSync(replacement, file);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const bytes = fs.readFileSync(file); const mtime = fs.statSync(file).mtimeMs;
  expect((await load("skill", new AbortController().signal)).map(item => item.value)).toEqual(["named-replaced"]);
  expect(fs.readFileSync(file)).toEqual(bytes); expect(fs.statSync(file).mtimeMs).toBe(mtime);
});
