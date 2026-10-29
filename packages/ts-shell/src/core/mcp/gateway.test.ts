import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreMcpClient } from "./client.js";
import { CoreMcpConnectionManager } from "./connectionManager.js";
import { parseSyntax } from '../commands/syntax/parse.js';
import { mcpSyntax } from '../commands/mcp/syntax.js';
import { McpConfigLoadError, loadMcpConfigs } from "./config.js";
import {
  CoreMcpGateway,
  McpGatewayBlockedError,
  describeMcpConnectionState,
} from "./gateway.js";
import type { ScopedMcpServerConfig } from "./types.js";

describe("core MCP gateway (W3)", () => {
  let fakeHomeDir = "";
  let workspaceRoot = "";
  const gateways: CoreMcpGateway[] = [];
  const originalUserProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-mcp-home-"),
    );
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-mcp-workspace-"),
    );
    process.env.USERPROFILE = fakeHomeDir;
    process.env.HOME = fakeHomeDir;
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await Promise.all(gateways.splice(0).map(gateway => gateway.close()));
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("honors an already-aborted signal before MCP discovery", async () => {
    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);
    const controller = new AbortController();
    controller.abort();
    const connect = vi.spyOn(CoreMcpClient.prototype, "connect");

    await expect(gateway.snapshot(undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(gateway.refresh("all", {
      exactTarget: false,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a queued snapshot promptly without starting discovery after cancellation", async () => {
    fs.writeFileSync(path.join(workspaceRoot, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
      held: { transport: "stdio", command: "never-spawn" },
    } }));
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const connect = vi.spyOn(CoreMcpClient.prototype, "connect").mockImplementation(async function () {
      await blocked;
      return { type: "connected", name: this.name, config: this.config };
    });
    vi.spyOn(CoreMcpClient.prototype, "listTools").mockResolvedValue([]);
    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);

    const first = gateway.snapshot();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    const controller = new AbortController();
    const queued = gateway.snapshot(undefined, controller.signal);
    controller.abort();

    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(connect).toHaveBeenCalledOnce();
    release();
    await first;
  });

  it.each(['snapshot', 'refresh', 'invokeTool', 'content', 'syncWorkspace'] as const)(
    'rejects queued %s on close before the active request settles', async operation => {
      fs.writeFileSync(path.join(workspaceRoot, '.cheers.mcp.json'), JSON.stringify({ mcpServers: {
        held: { transport: 'stdio', command: 'never-spawn' },
      } }));
      let release!: () => void, started!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const entered = new Promise<void>(resolve => { started = resolve; });
      const connect = vi.spyOn(CoreMcpClient.prototype, 'connect').mockImplementation(async function () {
        started(); await held;
        return { type: 'connected', name: this.name, config: this.config };
      });
      const list = vi.spyOn(CoreMcpClient.prototype, 'listTools').mockResolvedValue([]);
      const dispose = vi.spyOn(CoreMcpClient.prototype, 'close').mockResolvedValue();
      const gateway = new CoreMcpGateway(workspaceRoot); gateways.push(gateway);
      const active = gateway.snapshot();
      await entered;
      const pending = operation === 'snapshot' ? gateway.snapshot()
        : operation === 'refresh' ? gateway.refresh()
          : operation === 'invokeTool' ? gateway.invokeTool('held', 'never-dispatch', {})
            : operation === 'content' ? gateway.content('held', { action: 'resources' })
              : gateway.syncWorkspace();
      let settled = false, failure: unknown, closed = false;
      const observed = pending.then(() => { settled = true; }, error => { settled = true; failure = error; });
      const closing = gateway.close();
      expect(gateway.close()).toBe(closing);
      const closeObserved = closing.then(() => { closed = true; });
      await new Promise<void>(resolve => setImmediate(resolve));
      try {
        expect(settled).toBe(true);
        expect(failure).toMatchObject({ message: 'MCP gateway is closed' });
        expect(closed).toBe(false);
        expect(connect).toHaveBeenCalledOnce(); expect(list).not.toHaveBeenCalled();
        expect(dispose).toHaveBeenCalledOnce();
        await expect(gateway.snapshot()).rejects.toThrow('MCP gateway is closed');
      } finally {
        release();
        await Promise.allSettled([active, observed, closeObserved]);
      }
      expect(closed).toBe(true);
      expect(connect).toHaveBeenCalledOnce(); expect(list).toHaveBeenCalledOnce();
    },
  );

  it.each(['queue', 'connection'])('rechecks admission after the %s boundary before further MCP effects', async stage => {
    let blocked = false;
    const admission = () => blocked ? 'configuration revoked' : undefined;
    fs.writeFileSync(path.join(workspaceRoot, '.cheers.mcp.json'), JSON.stringify({ mcpServers: {
      first: { transport: 'stdio', command: 'never-spawn' }, second: { transport: 'stdio', command: 'never-spawn' },
    } }));
    const connect = vi.spyOn(CoreMcpClient.prototype, 'connect').mockImplementation(async function () {
      blocked = true;
      return { type: 'connected', name: this.name, config: this.config };
    });
    const list = vi.spyOn(CoreMcpClient.prototype, 'listTools').mockResolvedValue([]);
    const gateway = new CoreMcpGateway(workspaceRoot); gateways.push(gateway);
    const pending = gateway.snapshot(admission);
    if (stage === 'queue') blocked = true;
    await expect(pending).rejects.toThrow('configuration revoked');
    expect(connect).toHaveBeenCalledTimes(stage === 'queue' ? 0 : 1);
    expect(list).not.toHaveBeenCalled();
  });

  it("loads user and project MCP configs into scoped configs", () => {
    fs.mkdirSync(path.join(fakeHomeDir, ".cheers"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fakeHomeDir, ".cheers", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          userServer: {
            transport: "sdk",
            mockTools: [{ name: "user-tool", description: "u" }],
          },
        },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({
        mcpServers: {
          projectServer: {
            transport: "stdio",
            command: "node",
            mockTools: [{ name: "project-tool", description: "p" }],
          },
        },
      }),
      "utf8",
    );

    // `true` because a project-scoped config is only read for a project that has
    // not been marked untrusted; these tests are about scope merging.
    const configs = loadMcpConfigs(workspaceRoot, true);
    expect(configs.userServer.scope).toBe("user");
    expect(configs.projectServer.scope).toBe("project");
  });

  it("fails closed with a recoverable blocker when MCP config is malformed", async () => {
    const configPath = path.join(workspaceRoot, ".cheers.mcp.json");
    fs.writeFileSync(configPath, "{broken", "utf8");

    expect(() => loadMcpConfigs(workspaceRoot, true)).toThrow(McpConfigLoadError);

    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);
    await expect(gateway.snapshot()).rejects.toMatchObject({
      blockerKind: "environment-not-ready",
      doNext: `Fix or remove ${configPath}, then run /mcp refresh all.`,
    });
    await expect(gateway.snapshot()).rejects.toThrow(
      `MCP config is invalid at ${configPath}`,
    );
  });

  it("maps auth-required and invalid transport configs into explicit client states", async () => {
    const authClient = new CoreMcpClient("auth", {
      transport: "http",
      url: "https://example.com",
      scope: "project",
      authRequired: true,
    });
    const failedClient = new CoreMcpClient("broken", {
      transport: "stdio",
      scope: "project",
    });

    expect(await authClient.connect()).toMatchObject({ type: "needs-auth" });
    expect(await failedClient.connect()).toMatchObject({ type: "failed" });
  });

  it("reports a server on an unimplemented transport as failed rather than connected", async () => {
    // A transport we cannot reach a server through has to say so. Reporting it
    // as connected would mark it executable and let a call come back with a
    // success nobody performed.
    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({
        mcpServers: {
          remoteOnly: {
            transport: "http",
            url: "https://mcp.example.test",
          },
        },
      }),
      "utf8",
    );

    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);
    const snapshot = await gateway.snapshot();

    expect(snapshot.clients).toHaveLength(1);
    expect(snapshot.clients[0]).toMatchObject({
      type: "failed",
      name: "remoteOnly",
    });
    // Named so the reader can tell "we do not implement this" from "your file is
    // malformed": the two call for different fixes.
    expect(describeMcpConnectionState(snapshot.clients[0]!).executable).toBe(false);
    expect(snapshot.tools).toEqual([]);
  });

  it("supports real stdio list and invoke with server-scoped MCP tool identity", async () => {
    const serverPath = path.resolve(
      process.cwd(),
      "src/core/mcp/fixtures/mockMcpServer.mjs",
    );

    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({
        mcpServers: {
          stdioEcho: {
            transport: "stdio",
            command: process.execPath,
            args: [serverPath],
          },
        },
      }),
      "utf8",
    );

    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);
    const snapshot = await gateway.snapshot();

    expect(snapshot.tools).toHaveLength(1);
    expect(snapshot.tools[0]).toMatchObject({
      serverName: "stdioEcho",
      toolName: "echo_message",
      qualifiedName: "mcp__stdioEcho__echo_message",
    });

    const result = await gateway.invokeTool("stdioEcho", "echo_message", {
      message: "hello",
    });
    expect(result.content).toBe("echo:hello");
  }, 15000);

  it("drops stale cached clients when a server disappears on the next snapshot", async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: "sdk",
            mockTools: [
              {
                serverName: "localSdk",
                toolName: "search",
                qualifiedName: "mcp__localSdk__search",
                description: "Search MCP",
              },
            ],
          },
        },
      }),
      "utf8",
    );

    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);
    await gateway.snapshot();

    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({ mcpServers: {} }),
      "utf8",
    );

    const snapshot = await gateway.snapshot();
    expect(snapshot.clients).toEqual([]);
    await expect(gateway.invokeTool("localSdk", "search", {})).rejects.toThrow(
      "Unknown MCP server: localSdk",
    );
  });

  it("fails one snapshot when separate servers exceed the shared catalog budget", async () => {
    fs.writeFileSync(path.join(workspaceRoot, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
      first: { transport: "stdio", command: "never-spawn" },
      second: { transport: "stdio", command: "never-spawn" },
    } }));
    vi.spyOn(CoreMcpClient.prototype, "connect").mockImplementation(async function () {
      return { type: "connected", name: this.name, config: this.config };
    });
    vi.spyOn(CoreMcpClient.prototype, "listTools").mockImplementation(async function () {
      const bytes = this.name === "first" ? 3 * 1024 * 1024 : 2 * 1024 * 1024;
      return [{
        serverName: this.name,
        toolName: "large",
        qualifiedName: `mcp__${this.name}__large`,
        description: "x".repeat(bytes),
        inputSchema: { type: "object" },
      }];
    });
    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);

    await expect(gateway.snapshot()).rejects.toMatchObject({
      name: "McpGatewayBlockedError",
      mcpFailureClass: "protocol",
    });
    expect(gateway.peekSnapshot()).toBeUndefined();
  });

  it("fails one snapshot when separate servers exceed the shared tool-count budget", async () => {
    fs.writeFileSync(path.join(workspaceRoot, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
      first: { transport: "stdio", command: "never-spawn" },
      second: { transport: "stdio", command: "never-spawn" },
    } }));
    vi.spyOn(CoreMcpClient.prototype, "connect").mockImplementation(async function () {
      return { type: "connected", name: this.name, config: this.config };
    });
    vi.spyOn(CoreMcpClient.prototype, "listTools").mockImplementation(async function () {
      return Array.from({ length: 5_001 }, (_, index) => ({
        serverName: this.name,
        toolName: `tool-${index}`,
        qualifiedName: `mcp__${this.name}__tool-${index}`,
        description: "",
        inputSchema: { type: "object" },
      }));
    });
    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);

    await expect(gateway.snapshot()).rejects.toMatchObject({
      name: "McpGatewayBlockedError",
      mcpFailureClass: "protocol",
    });
    expect(gateway.peekSnapshot()).toBeUndefined();
  });

  it("closes an in-flight catalog and preserves the blocking contract on deadline", async () => {
    fs.writeFileSync(path.join(workspaceRoot, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
      slow: { transport: "stdio", command: "never-spawn" },
    } }));
    vi.spyOn(CoreMcpClient.prototype, "connect").mockImplementation(async function () {
      return { type: "connected", name: this.name, config: this.config };
    });
    vi.spyOn(CoreMcpClient.prototype, "listTools").mockImplementation(async function (_admission, signal) {
      return await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal?.reason ?? new Error("aborted"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    });
    const close = vi.spyOn(CoreMcpClient.prototype, "close").mockResolvedValue();
    const gateway = new CoreMcpGateway(workspaceRoot, undefined, undefined, 25);
    gateways.push(gateway);

    await expect(gateway.snapshot()).rejects.toMatchObject({
      name: "McpGatewayBlockedError",
      mcpFailureClass: "timeout-cancelled",
    });
    expect(close).toHaveBeenCalledOnce();
    expect(gateway.peekSnapshot()).toBeUndefined();
  });

  it("preserves the deadline blocker when transport cleanup cannot be confirmed", async () => {
    fs.writeFileSync(path.join(workspaceRoot, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
      slow: { transport: "stdio", command: "never-spawn" },
    } }));
    vi.spyOn(CoreMcpClient.prototype, "connect").mockImplementation(async function () {
      return { type: "connected", name: this.name, config: this.config };
    });
    vi.spyOn(CoreMcpClient.prototype, "listTools").mockImplementation(async function (_admission, signal) {
      return await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal?.reason ?? new Error("aborted"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    });
    const close = vi.spyOn(CoreMcpClient.prototype, "close").mockRejectedValue(new Error("cleanup failed"));
    const gateway = new CoreMcpGateway(workspaceRoot, undefined, undefined, 25);
    gateways.push(gateway);
    try {
      await expect(gateway.snapshot()).rejects.toMatchObject({
        name: "McpGatewayBlockedError",
        mcpFailureClass: "timeout-cancelled",
        message: expect.stringContaining("cleanup could not be confirmed"),
      });
      expect(close).toHaveBeenCalledOnce();
    } finally {
      close.mockRestore();
    }
  });

  it("withholds a peeked snapshot when separate clients exceed the shared byte budget", async () => {
    const manager = new CoreMcpConnectionManager();
    const firstConfig: ScopedMcpServerConfig = { transport: "stdio", command: "never-spawn", scope: "user" };
    const secondConfig: ScopedMcpServerConfig = { transport: "stdio", command: "never-spawn", scope: "user" };
    const descriptor = (serverName: string) => ({
      serverName,
      toolName: "large",
      qualifiedName: `mcp__${serverName}__large`,
      description: "x".repeat(3 * 1024 * 1024),
      inputSchema: { type: "object" },
    });
    vi.spyOn(manager.get("first", firstConfig, workspaceRoot), "peekTools").mockReturnValue([descriptor("first")]);
    vi.spyOn(manager.get("second", secondConfig, workspaceRoot), "peekTools").mockReturnValue([descriptor("second")]);
    try {
      expect(manager.peekSnapshot({ first: firstConfig, second: secondConfig })).toBeUndefined();
    } finally {
      await manager.shutdown();
    }
  });

  it("withholds a peeked snapshot when separate clients exceed the shared tool-count budget", async () => {
    const manager = new CoreMcpConnectionManager();
    const firstConfig: ScopedMcpServerConfig = { transport: "stdio", command: "never-spawn", scope: "user" };
    const secondConfig: ScopedMcpServerConfig = { transport: "stdio", command: "never-spawn", scope: "user" };
    const descriptors = (serverName: string) => Array.from({ length: 5_001 }, (_, index) => ({
      serverName,
      toolName: `tool-${index}`,
      qualifiedName: `mcp__${serverName}__tool-${index}`,
      description: "",
      inputSchema: { type: "object" },
    }));
    vi.spyOn(manager.get("first", firstConfig, workspaceRoot), "peekTools").mockReturnValue(descriptors("first"));
    vi.spyOn(manager.get("second", secondConfig, workspaceRoot), "peekTools").mockReturnValue(descriptors("second"));
    try {
      expect(manager.peekSnapshot({ first: firstConfig, second: secondConfig })).toBeUndefined();
    } finally {
      await manager.shutdown();
    }
  });

  it("uses one absolute deadline across connection and catalog work for every server", async () => {
    fs.writeFileSync(path.join(workspaceRoot, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
      first: { transport: "stdio", command: "never-spawn" },
      second: { transport: "stdio", command: "never-spawn" },
    } }));
    const connect = vi.spyOn(CoreMcpClient.prototype, "connect").mockImplementation(async function (_admission, signal) {
      if (this.name === "first") await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      return { type: "connected", name: this.name, config: this.config };
    });
    const list = vi.spyOn(CoreMcpClient.prototype, "listTools").mockResolvedValue([]);
    const gateway = new CoreMcpGateway(workspaceRoot, undefined, undefined, 30);
    gateways.push(gateway);

    await expect(gateway.snapshot()).rejects.toMatchObject({
      name: "McpGatewayBlockedError",
      mcpFailureClass: "timeout-cancelled",
    });
    expect(connect.mock.instances.map(client => client.name)).toEqual(["first"]);
    expect(list).not.toHaveBeenCalled();
  });

  it("shares one absolute lifecycle and deadline between servers", async () => {
    fs.writeFileSync(path.join(workspaceRoot, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
      first: { transport: "stdio", command: "never-spawn" },
      second: { transport: "stdio", command: "never-spawn" },
    } }));
    const signals: AbortSignal[] = [];
    const deadlines: number[] = [];
    vi.spyOn(CoreMcpClient.prototype, "connect").mockImplementation(async function (_admission, signal) {
      signals.push(signal!);
      return { type: "connected", name: this.name, config: this.config };
    });
    vi.spyOn(CoreMcpClient.prototype, "listTools").mockImplementation(async function (_admission, signal, options) {
      signals.push(signal!);
      deadlines.push(options!.deadline!);
      return [];
    });
    const started = Date.now();
    const gateway = new CoreMcpGateway(workspaceRoot, undefined, undefined, 5_000);
    gateways.push(gateway);

    await gateway.snapshot();
    expect(signals).toHaveLength(4);
    expect(new Set(signals).size).toBe(1);
    expect(deadlines).toHaveLength(2);
    expect(new Set(deadlines).size).toBe(1);
    expect(deadlines[0]).toBeGreaterThanOrEqual(started);
    expect(deadlines[0]).toBeLessThanOrEqual(started + 6_000);
  });

  it("does not put a config's mock tools in front of the model", async () => {
    // `mockTools` exists so a test can describe a server without spawning one, and
    // nothing rejects it in a user's config file. It is not a hole because the
    // gateway only asks a server that reported `connected`, and a server whose
    // transport is not implemented never does — but that is the guard, so it is
    // asserted here rather than left as something that happens to be true.
    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({
        mcpServers: {
          claimsTools: {
            transport: "sdk",
            mockTools: [
              {
                serverName: "claimsTools",
                toolName: "delete_everything",
                qualifiedName: "mcp__claimsTools__delete_everything",
                description: "never existed",
              },
            ],
          },
        },
      }),
      "utf8",
    );

    const snapshot = await new CoreMcpGateway(workspaceRoot).snapshot();

    expect(snapshot.tools).toEqual([]);
    expect(snapshot.clients.map((client) => client.type)).toEqual(["failed"]);
  });

  it("invalidates cached clients when reconnect reveals auth is now required", async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: "sdk",
            mockTools: [
              {
                serverName: "localSdk",
                toolName: "search",
                qualifiedName: "mcp__localSdk__search",
                description: "Search MCP",
              },
            ],
          },
        },
      }),
      "utf8",
    );

    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);
    await gateway.snapshot();

    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: "sdk",
            authRequired: true,
            mockTools: [
              {
                serverName: "localSdk",
                toolName: "search",
                qualifiedName: "mcp__localSdk__search",
                description: "Search MCP",
              },
            ],
          },
        },
      }),
      "utf8",
    );

    const snapshot = await gateway.snapshot();
    expect(snapshot.clients).toHaveLength(1);
    expect(snapshot.clients[0]).toMatchObject({
      type: "needs-auth",
      name: "localSdk",
    });
    expect(snapshot.tools).toEqual([]);
    await expect(gateway.invokeTool("localSdk", "search", {})).rejects.toThrow(
      "MCP server localSdk requires authentication",
    );
    await expect(
      gateway.invokeTool("localSdk", "search", {}),
    ).rejects.toMatchObject({
      blockerKind: "environment-not-ready",
      doNext: 'Interactive MCP authentication is unavailable for transport \'sdk\'; use a supported transport before /mcp test -- "localSdk".',
    });
  });

  it("refresh supports target/all and rejects unknown server targets", async () => {
    const serverPath = path.resolve(
      process.cwd(),
      "src/core/mcp/fixtures/mockMcpServer.mjs",
    );

    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.mcp.json"),
      JSON.stringify({
        mcpServers: {
          stdioEcho: {
            transport: "stdio",
            command: process.execPath,
            args: [serverPath],
          },
        },
      }),
      "utf8",
    );

    const gateway = new CoreMcpGateway(workspaceRoot);
    gateways.push(gateway);
    await gateway.snapshot();

    await expect(gateway.refresh("stdioEcho")).resolves.toMatchObject({
      clients: [{ type: "connected", name: "stdioEcho" }],
    });
    await expect(gateway.refresh("all")).resolves.toMatchObject({
      clients: [{ type: "connected", name: "stdioEcho" }],
    });
    await expect(gateway.refresh("missing-server")).rejects.toThrow(
      "Unknown MCP server: missing-server",
    );
    await expect(gateway.refresh("missing-server")).rejects.toBeInstanceOf(
      McpGatewayBlockedError,
    );
    await expect(gateway.refresh("missing-server")).rejects.toMatchObject({
      blockerKind: "unknown",
      doNext:
        "Run /mcp status to list configured servers, then retry with a valid server name.",
    });
  });

  it("describes non-connected states with the same reason and do-next used by execute blockers", () => {
    const needsAuth = describeMcpConnectionState({
      type: "needs-auth",
      name: "authServer",
      config: {
        transport: "http",
        url: "https://example.com",
        scope: "project",
        authRequired: true,
      },
    });
    expect(needsAuth).toMatchObject({
      executable: false,
      reason: "MCP server authServer requires authentication",
      doNext: 'Run /mcp auth -- "authServer", then /mcp test -- "authServer".',
    });

    const failed = describeMcpConnectionState({
      type: "failed",
      name: "brokenServer",
      config: { transport: "stdio", scope: "project" },
      error: "Missing stdio command",
    });
    expect(failed).toMatchObject({
      executable: false,
      reason: "MCP server brokenServer is unavailable: Missing stdio command",
      doNext:
        "Run /mcp refresh brokenServer and verify server connectivity before retrying.",
    });

    const disabled = describeMcpConnectionState({
      type: "disabled",
      name: "disabledServer",
      config: { transport: "sdk", scope: "project", enabled: false },
    });
    expect(disabled).toMatchObject({
      executable: false,
      reason: "MCP server disabledServer is disabled",
      doNext:
        "Enable server 'disabledServer' in MCP config, then rerun /mcp refresh disabledServer.",
    });
  });

  it('gives usable authentication guidance for dash-leading HTTP names and distinguishes other transports', () => {
    const state = { type: 'needs-auth' as const, name: '-server', config: { transport: 'http' as const, scope: 'project' as const } };
    const guidance = describeMcpConnectionState(state).doNext;
    expect(guidance).toBe('Run /mcp auth -- "-server", then /mcp test -- "-server".');
    for (const action of ['auth', 'test']) expect(parseSyntax(mcpSyntax, [action, '--', '-server'])).toMatchObject({ ok: true, args: ['-server'] });
    expect(describeMcpConnectionState({ ...state, config: { ...state.config, transport: 'stdio' } }).doNext).toContain("unavailable for transport 'stdio'");
  });
});
