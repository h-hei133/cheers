import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoreMcpGateway } from "./gateway.js";
import { projectTrust } from "../security/projectTrust.js";
let root: string;
let log: string;
let owner: CoreMcpGateway;
const server = path.resolve("src/core/mcp/fixtures/mockMcpServer.mjs");
function configure(extra = {}) {
  fs.writeFileSync(path.join(root, ".cheers.mcp.json"), JSON.stringify({ mcpServers: { fixture: {
    transport: "stdio", command: process.execPath, args: [server, "--log", log], ...extra,
  } } }));
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-mcp-snapshot-"));
  log = path.join(root, "protocol.jsonl");
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
  vi.spyOn(projectTrust, "isProjectUntrusted").mockReturnValue(false);
  owner = new CoreMcpGateway(root);
});
afterEach(async () => { await owner.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
it("reads live catalogs without protocol traffic and rejects changed configuration", async () => {
  configure();
  expect(owner.peekSnapshot()).toBeUndefined();
  expect(fs.existsSync(log)).toBe(false);
  const loaded = await owner.snapshot();
  const before = fs.readFileSync(log);
  const peeked = owner.peekSnapshot();
  expect(peeked).toEqual(loaded);
  (peeked!.tools[0]! as { description: string }).description = "mutated copy";
  expect(owner.peekSnapshot()).toEqual(loaded);
  expect(fs.readFileSync(log)).toEqual(before);
  configure({ enabled: false });
  expect(owner.peekSnapshot()).toBeUndefined();
  expect(fs.readFileSync(log)).toEqual(before);
  await owner.close();
  expect(owner.peekSnapshot()).toBeUndefined();
});
it("does not reuse a catalog across workspace or trust changes", async () => {
  let current = root;
  owner = new CoreMcpGateway(() => current);
  configure();
  await owner.snapshot();
  const before = fs.readFileSync(log);
  current = path.join(root, "other");
  expect(owner.peekSnapshot()).toBeUndefined();
  current = root;
  vi.mocked(projectTrust.isProjectUntrusted).mockReturnValue(true);
  expect(owner.peekSnapshot()).toEqual({ clients: [], tools: [] });
  expect(fs.readFileSync(log)).toEqual(before);
});
it("never reconnects a disconnected server to answer an inspection", async () => {
  configure();
  await owner.snapshot();
  await expect(owner.invokeTool("fixture", "echo_message", { message: "mcp-throw" })).rejects.toThrow();
  const before = fs.readFileSync(log);
  expect(owner.peekSnapshot()).toBeUndefined();
  expect(fs.readFileSync(log)).toEqual(before);
});
it("distinguishes an empty configuration from a cold or malformed catalog", () => {
  expect(owner.peekSnapshot()).toEqual({ clients: [], tools: [] });
  configure({ authRequired: true });
  expect(owner.peekSnapshot()).toBeUndefined();
  fs.writeFileSync(path.join(root, ".cheers.mcp.json"), "{broken");
  expect(() => owner.peekSnapshot()).toThrow();
  expect(fs.existsSync(log)).toBe(false);
});

it("notifies loaded, invalidated and closed catalogs without discovery by observers", async () => {
  configure(); const changed = vi.fn(); const stop = owner.subscribe(changed);
  expect(fs.existsSync(log)).toBe(false);
  await owner.snapshot(); await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(owner.peekSnapshot()?.tools).toHaveLength(1);
  changed.mockClear();
  await owner.invokeTool("fixture", "echo_message", { message: "mcp-notify" });
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const before = fs.readFileSync(log);
  expect(owner.peekSnapshot()).toBeUndefined(); expect(fs.readFileSync(log)).toEqual(before);
  await owner.snapshot(); expect(owner.peekSnapshot()?.tools).toHaveLength(1);
  changed.mockClear();
  await expect(owner.invokeTool("fixture", "echo_message", { message: "mcp-throw" })).rejects.toThrow();
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(owner.peekSnapshot()).toBeUndefined();
  stop(); changed.mockClear(); await owner.close(); await Promise.resolve(); expect(changed).not.toHaveBeenCalled();
});

it("rejects a listing invalidated before its response instead of publishing stale tools", async () => {
  configure({ args: [server, "--log", log, "--notify-during-list"] });
  const snapshot = await owner.snapshot();
  expect(snapshot.clients[0]?.type).toBe("failed"); expect(snapshot.tools).toEqual([]);
  expect(owner.peekSnapshot()).toBeUndefined();
});
