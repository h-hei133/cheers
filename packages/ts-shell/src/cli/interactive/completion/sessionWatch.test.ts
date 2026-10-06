import { withConfiguration } from "../../../test-utils/configuration.js";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionManager } from "../../../session/SessionManager.js";
import { createCatalogLoader } from "./catalog.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

let root: string;
const stops: Array<() => void> = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-session-watch-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
});
afterEach(() => {
  stops.splice(0).forEach(stop => stop()); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
});

it.each(["session", "entry", "tree", "thread"] as const)("refreshes %s from owner writes and releases its observers", async kind => {
  const manager = new SessionManager(); const session = manager.createNew(root);
  manager.addTurn(session.id, { role: "user", content: "First question" });
  const context = withConfiguration({ cwd: root, projectRoot: root, session, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, [], manager);
  const changed = vi.fn(); const stop = load.observe(kind, undefined, changed)!; stops.push(stop);
  const before = await load(kind, new AbortController().signal);
  if (kind === "session") manager.renameSession(session.id, "Externally renamed");
  else manager.addTurn(session.id, { role: "assistant", content: "Later answer" });
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const after = await load(kind, new AbortController().signal);
  if (kind === "session") expect(after.find(item => item.value === session.id)?.label).toBe("Externally renamed");
  else expect(after.length).toBeGreaterThan(before.length);
  stop(); changed.mockClear(); manager.renameSession(session.id, "After release");
  await new Promise(resolve => setTimeout(resolve, 100)); expect(changed).not.toHaveBeenCalled();
});

it("observes new session directories then their metadata without rescanning on each key", async () => {
  const manager = new SessionManager(); const session = manager.createNew(root);
  const context = withConfiguration({ cwd: root, projectRoot: root, session, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, [], manager);
  const changed = vi.fn(); stops.push(load.observe("session", undefined, changed)!);
  expect(await load("session", new AbortController().signal)).toEqual([]);
  const added = manager.createNew(root); manager.addTurn(added.id, { role: "user", content: "Added question" });
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect((await load("session", new AbortController().signal)).map(item => item.value)).toContain(added.id);
  changed.mockClear(); manager.renameSession(added.id, "Added title");
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect((await load("session", new AbortController().signal)).find(item => item.value === added.id)?.label).toBe("Added title");
  changed.mockClear(); manager.deleteSession(added.id);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await load("session", new AbortController().signal)).toEqual([]);
});

it("invalidates transcript candidates when a current-directory copy shadows a legacy session", async () => {
  const seed = new SessionManager(); const session = seed.createNew(root);
  seed.addTurn(session.id, { role: "user", content: "Legacy question" });
  const current = path.join(root, ".cheers", "sessions");
  const legacy = path.join(root, ".cheer", "sessions");
  fs.mkdirSync(path.dirname(legacy)); fs.renameSync(current, legacy);
  const manager = new SessionManager();
  const context = withConfiguration({ cwd: root, projectRoot: root, session, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, [], manager);
  const changed = vi.fn(); stops.push(load.observe("entry", undefined, changed)!);
  const before = await load("entry", new AbortController().signal);
  fs.cpSync(path.join(legacy, session.id), path.join(current, session.id), { recursive: true });
  manager.addTurn(session.id, { role: "assistant", content: "Current answer" });
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect((await load("entry", new AbortController().signal)).length).toBeGreaterThan(before.length);
});
