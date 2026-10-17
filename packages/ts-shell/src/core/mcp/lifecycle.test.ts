import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreMcpGateway } from "./gateway.js";
import { CoreMcpClient } from "./client.js";

const server = path.resolve("src/core/mcp/fixtures/mockMcpServer.mjs");
let root: string;
let log: string;
const owners: Array<{ close(): Promise<void> }> = [];

function config(args: string[] = [], extra = {}) {
  return { transport: "stdio", command: process.execPath, args: [server, "--log", log, ...args], ...extra };
}
function configure(workspace: string, entry = config()) {
  fs.writeFileSync(path.join(workspace, ".cheers.mcp.json"), JSON.stringify({ mcpServers: { local: entry } }));
}
function records() {
  // The child may have opened the file without finishing its next JSONL record.
  return fs.readFileSync(log, "utf8").split("\n").slice(0, -1).map(line => JSON.parse(line));
}
function alive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}
function gateway(source: string | (() => string) = root) {
  const value = new CoreMcpGateway(source);
  owners.push(value);
  return value;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-mcp-lifecycle-"));
  log = path.join(root, "protocol.jsonl");
  const home = path.join(root, "home");
  fs.mkdirSync(home);
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
});
afterEach(async () => {
  await Promise.all(owners.splice(0).map(owner => owner.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("standard MCP connection lifetime", () => {
  it("handshakes once, paginates, and reuses one process across snapshots and calls", async () => {
    configure(root, config(["--paginate"]));
    const owner = gateway();
    const [first, second] = await Promise.all([owner.snapshot(), owner.snapshot()]);
    expect(first.tools.map(tool => tool.toolName)).toEqual(["echo_message", "second_tool"]);
    expect(second.tools[0]?.annotations?.readOnlyHint).toBe(true);
    expect(await owner.invokeTool("local", "echo_message", { message: "one" })).toEqual({ content: "echo:one" });
    expect(await owner.invokeTool("local", "echo_message", { message: "two" })).toEqual({ content: "echo:two" });
    const events = records();
    expect(events.filter(event => event.event === "start")).toHaveLength(1);
    expect(events.slice(0, 4).map(event => event.event)).toEqual([
      "start", "initialize", "notifications/initialized", "tools/list",
    ]);
    await owner.close();
    expect(alive(events[0].pid)).toBe(false);
    await expect(owner.snapshot()).rejects.toThrow("closed");
  });

  it("does not report connected for a process that never completes initialize", async () => {
    const client = new CoreMcpClient("local", { ...config(["--initialize-hang"]), transport: "stdio", scope: "user" }, root, 250);
    owners.push(client);
    expect(await client.connect()).toMatchObject({ type: "failed" });
    expect(alive(records()[0].pid)).toBe(false);
  });

  it("deduplicates concurrent connect and observes a forced shutdown", async () => {
    const client = new CoreMcpClient("local", { ...config(["--hang-close"]), transport: "stdio", scope: "user" }, root);
    owners.push(client);
    const states = await Promise.all([client.connect(), client.connect()]);
    expect(states.map(state => state.type)).toEqual(["connected", "connected"]);
    expect(records().filter(event => event.event === "start")).toHaveLength(1);
    await client.close();
    expect(alive(records()[0].pid)).toBe(false);
  }, 10_000);

  it("ignores an absent tools capability and rejects malformed or looping catalogs", async () => {
    configure(root, config(["--no-tools"]));
    const owner = gateway();
    expect(await owner.snapshot()).toMatchObject({ clients: [{ type: "connected" }], tools: [] });
    expect(records().some(event => event.event === "tools/list")).toBe(false);
    for (const flag of ["--invalid-tools-list", "--repeat-cursor", "--initialize-fail"]) {
      configure(root, config([flag]));
      expect(await owner.snapshot()).toMatchObject({ clients: [{ type: "failed" }], tools: [] });
    }
  });

  it("closes old processes on config edits, disabled/auth states, removal and parse failure", async () => {
    configure(root);
    const owner = gateway();
    await owner.snapshot();
    const firstPid = records()[0].pid;
    configure(root, config(["--paginate"]));
    expect((await owner.snapshot()).tools).toHaveLength(2);
    expect(alive(firstPid)).toBe(false);
    for (const [extra, type] of [[{ enabled: false }, "disabled"], [{ authRequired: true }, "needs-auth"]] as const) {
      configure(root, config([], extra));
      expect(await owner.snapshot()).toMatchObject({ clients: [{ type }], tools: [] });
    }
    configure(root);
    await owner.snapshot();
    fs.writeFileSync(path.join(root, ".cheers.mcp.json"), "{broken");
    await expect(owner.snapshot()).rejects.toMatchObject({ mcpFailureClass: "config" });
    expect(records().filter(event => event.event === "start").every(event => !alive(event.pid))).toBe(true);
    configure(root);
    await owner.snapshot();
    fs.writeFileSync(path.join(root, ".cheers.mcp.json"), '{"mcpServers":{}}');
    expect(await owner.snapshot()).toEqual({ clients: [], tools: [] });
    expect(records().filter(event => event.event === "start").every(event => !alive(event.pid))).toBe(true);
  });

  it("rebuilds even identical user configuration when the workspace changes", async () => {
    const other = path.join(root, "other");
    fs.mkdirSync(other);
    const userConfig = path.join(process.env.HOME!, ".cheers");
    fs.mkdirSync(userConfig);
    fs.writeFileSync(path.join(userConfig, "mcp.json"), JSON.stringify({ mcpServers: { local: config() } }));
    let current = root;
    const owner = gateway(() => current);
    await owner.snapshot();
    const firstPid = records()[0].pid;
    current = other;
    await owner.syncWorkspace();
    expect(alive(firstPid)).toBe(false);
    await owner.snapshot();
    const starts = records().filter(event => event.event === "start");
    expect(starts.map(event => event.cwd)).toEqual([root, other]);
  });

  it("does not replay a call after disconnect and reconnects for a subsequent request", async () => {
    configure(root);
    const owner = gateway();
    await expect(owner.invokeTool("local", "echo_message", { message: "mcp-throw" })).rejects.toMatchObject({
      failureClass: "stdio-process",
    });
    expect(records().filter(event => event.event === "tools/call")).toHaveLength(1);
    expect(await owner.invokeTool("local", "echo_message", { message: "later" })).toEqual({ content: "echo:later" });
    expect(records().filter(event => event.event === "start")).toHaveLength(2);
  });

  it("preserves tool errors and structured results, and marks unsupported content explicitly", async () => {
    configure(root);
    const owner = gateway();
    expect(await owner.invokeTool("local", "echo_message", { message: "mcp-error" })).toMatchObject({ isError: true });
    expect(await owner.invokeTool("local", "echo_message", { message: "mcp-structured" })).toEqual({ content: '{"answer":42}' });
    expect(await owner.invokeTool("local", "echo_message", { message: "mcp-image" })).toMatchObject({
      isError: true, content: expect.stringContaining("Unsupported MCP content: image"),
    });
    await expect(owner.invokeTool("local", "echo_message", { message: "mcp-malformed" })).rejects.toMatchObject({
      failureClass: "malformed-result",
    });
  });
  it("validates first-page schemas and task requirements after pagination", async () => {
    configure(root, config(["--paginate", "--output-schema"]));
    const owner = gateway();
    await owner.snapshot();
    await expect(owner.invokeTool("local", "echo_message", { message: "mcp-invalid-output" }))
      .rejects.toMatchObject({ failureClass: "malformed-result" });
    await expect(owner.invokeTool("local", "echo_message", { message: "mcp-invalid-args" }))
      .rejects.toMatchObject({ failureClass: "protocol" });
    expect(await owner.invokeTool("local", "echo_message", { message: "mcp-structured" }))
      .toEqual({ content: '{"answer":42}' });
    configure(root, config(["--paginate", "--required-task"]));
    const before = records().filter(event => event.event === "tools/call").length;
    await expect(owner.invokeTool("local", "echo_message", { message: "one" }))
      .rejects.toMatchObject({ failureClass: "tool-unavailable" });
    expect(records().filter(event => event.event === "tools/call")).toHaveLength(before);
  });

  it("cancels outstanding discovery and rejects queued writes when shutdown starts", async () => {
    configure(root, config(["--hang-list"]));
    const owner = gateway();
    const readFile = fs.readFileSync;
    let pendingReads = 2;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (file === log && pendingReads > 0) return --pendingReads === 1 ? '' : '{"event":"tools/';
      return Reflect.apply(readFile, fs, [file, ...args]);
    }) as typeof fs.readFileSync);
    const discovery = owner.snapshot().catch(error => error);
    const deadline = Date.now() + 2000;
    while ((!fs.existsSync(log) || !records().some(event => event.event === "tools/list")) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(records().some(event => event.event === "tools/list")).toBe(true);
    expect(pendingReads).toBe(0);
    const queued = owner.invokeTool("local", "echo_message", { message: "must not execute" }).catch(error => error);
    await owner.close();
    await discovery;
    expect(await queued).toMatchObject({ message: expect.stringContaining("closed") });
    expect(records().some(event => event.event === "tools/call")).toBe(false);
    expect(alive(records()[0].pid)).toBe(false);
  }, 3000);

  it("does not retain cancellation callbacks for settled requests", async () => {
    const client = new CoreMcpClient("local", { ...config(), transport: "stdio", scope: "user" }, root);
    owners.push(client);
    for (let i = 0; i < 16; i++) await client.listTools();
    await client.close();
    expect(records().filter(event => event.event === "notifications/cancelled")).toHaveLength(0);
  });

});
