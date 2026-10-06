import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { collectSources } from "../research/collector.js";
import { routeSlashCommand } from "./slashRouter.js";

vi.mock("../research/collector.js", () => ({ collectSources: vi.fn(async () => ({})) }));
vi.mock("../research/renderer.js", () => ({ renderCollection: () => "Collected" }));
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "collection-text-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(["web-research", "research"])("passes the literal /%s query to the collection owner", async name => {
  const topic = "  compare 'exact  phrase' with C:\\tmp\\file\n\t--literal\\  ";
  expect(await routeSlashCommand(`/${name} ${topic}`, { cwd: root })).toEqual({ kind: "local", output: "Collected" });
  expect(collectSources).toHaveBeenCalledOnce();
  expect(collectSources).toHaveBeenCalledWith(topic, { taskId: "web-research", workspaceRoot: root });
});

it.each(["", "  \t\n", "--help", "-h"])("shows usage without collecting for %j", async suffix => {
  expect(await routeSlashCommand("/web-research " + suffix, { cwd: root })).toMatchObject({ kind: "local", output: expect.stringContaining("Usage: /web-research <topic>") });
  expect(collectSources).not.toHaveBeenCalled();
});
