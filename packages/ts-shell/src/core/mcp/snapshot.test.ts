import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoreMcpGateway } from "./gateway.js";
import { projectTrust } from "../security/projectTrust.js";
import { CoreMcpClient } from "./client.js";
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

it("refreshes only the originally selected definition and rejects a replacement before reconnecting", async () => {
  configure();
  const before = await owner.snapshot();
  const selected = before.clients[0]!.config;
  const protocol = fs.readFileSync(log);
  configure({ enabled: false });
  await expect(owner.refresh('fixture', { exactTarget: true, expectedConfig: selected })).rejects.toThrow(/definition changed/);
  expect(owner.peekSnapshot()).toBeUndefined();
  expect(fs.readFileSync(log)).toEqual(protocol);
});

it('rejects a changed definition after connecting before listing and closes the rejected connection', async () => {
  configure();
  const selected = (await owner.snapshot()).clients[0]!.config;
  const protocol = fs.readFileSync(log, 'utf8');
  const close = vi.spyOn(CoreMcpClient.prototype, 'close');
  const connect = CoreMcpClient.prototype.connect;
  vi.spyOn(CoreMcpClient.prototype, 'connect').mockImplementationOnce(async function (admission, signal) {
    const state = await connect.call(this, admission, signal);
    configure({ enabled: false });
    return state;
  });
  await expect(owner.refresh('fixture', { exactTarget: true, expectedConfig: selected })).rejects.toThrow(/definition changed/);
  expect(fs.readFileSync(log, 'utf8').slice(protocol.length)).not.toContain('tools/list');
  expect(close).toHaveBeenCalledTimes(2);
  expect(owner.peekSnapshot()).toBeUndefined();
});

it('rechecks the original admission after prepare before closing the selected live connection', async () => {
  configure();
  const selected = (await owner.snapshot()).clients[0]!.config;
  const protocol = fs.readFileSync(log);
  let current = true;
  // prepare awaits reconciliation even when no definitions changed.
  const load = owner.loadConfigs.bind(owner);
  vi.spyOn(owner, 'loadConfigs').mockImplementationOnce(load).mockImplementationOnce(() => {
    current = false;
    return load();
  });
  const close = vi.spyOn(CoreMcpClient.prototype, 'close');
  await expect(owner.refresh('fixture', { exactTarget: true, expectedConfig: selected,
    admission: () => current ? undefined : 'original binding changed' })).rejects.toThrow(/original binding changed/);
  expect(close).not.toHaveBeenCalled();
  expect(fs.readFileSync(log)).toEqual(protocol);
});

it('refreshes a selected literal all server without touching an unrelated live connection', async () => {
  configure();
  const file = path.join(root, '.cheers.mcp.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers.fixture;
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { all: config, unrelated: config } }));
  const selected = (await owner.snapshot()).clients.find(client => client.name === 'all')!.config;
  const close = vi.spyOn(CoreMcpClient.prototype, 'close');
  const result = await owner.refresh('all', { exactTarget: true, expectedConfig: selected });
  expect(result.clients.map(client => client.name)).toEqual(['all']);
  expect(close).toHaveBeenCalledOnce();
  expect(owner.peekSnapshot()?.clients.map(client => client.name)).toEqual(['all', 'unrelated']);
  expect(fs.readFileSync(log, 'utf8')).not.toContain('tools/call');
});

it('does not read definitions after admission expires during workspace preparation', async () => {
  configure({ enabled: false });
  const selected = (await owner.snapshot()).clients[0]!.config;
  const load = owner.loadConfigs.bind(owner);
  let current = true; let staleReads = 0;
  vi.spyOn(owner, 'loadConfigs').mockImplementation(() => { if (!current) staleReads++; return load(); });
  const pending = owner.refresh('fixture', { exactTarget: true, expectedConfig: selected,
    admission: () => current ? undefined : 'original binding changed' });
  queueMicrotask(() => { current = false; });
  await expect(pending).rejects.toThrow('original binding changed');
  expect(staleReads).toBe(0); expect(fs.existsSync(log)).toBe(false);
});
