import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreMcpClient } from "./client.js";
import { parseSyntax } from '../commands/syntax/parse.js';
import { mcpSyntax } from '../commands/mcp/syntax.js';
import { McpConfigLoadError, loadMcpConfigs } from "./config.js";
import {
  CoreMcpGateway,
  McpGatewayBlockedError,
  describeMcpConnectionState,
} from "./gateway.js";

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
    vi.restoreAllMocks();
    await Promise.all(gateways.splice(0).map(gateway => gateway.close()));
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

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
