import { describe, expect, it } from "vitest";
import {
  renderMcpBlockedContract,
  renderMcpDoctorControlPlane,
  renderMcpRefreshControlPlane,
  renderMcpStatusControlPlane,
  renderMcpToolsControlPlane,
} from "./mcpControlCliSurface.js";
import type { McpClientSnapshot } from "../core/mcp/types.js";

function capture(render: (renderer: { renderLine(line: string): void }) => void) {
  const lines: string[] = [];
  render({
    renderLine(line) {
      lines.push(line);
    },
  });
  return lines;
}

function snapshot(): McpClientSnapshot {
  return {
    clients: [
      {
        type: "connected",
        name: "connectedSdk",
        config: { transport: "sdk", scope: "project" },
      },
      {
        type: "needs-auth",
        name: "needsAuth",
        config: {
          transport: "http",
          scope: "project",
          url: "https://example.com/mcp",
          authRequired: true,
        },
      },
      {
        type: "failed",
        name: "brokenStdio",
        config: { transport: "stdio", scope: "project" },
        error: "Missing stdio command",
      },
    ],
    tools: [
      {
        serverName: "connectedSdk",
        toolName: "search",
        qualifiedName: "mcp__connectedSdk__search",
        description: "Search MCP",
      },
    ],
    resources: {},
    prompts: {},
  };
}

describe("MCP control CLI surface", () => {
  it.each(['"password": " /mcp synthetic-guidance-secret"',
    '"password": "alpha /mcp synthetic-guidance-secret"', "password='alpha /connect synthetic-guidance-secret'",
    'pass\x1b[31mword="alpha /mcp synthetic-guidance-secret"',
    'file:///guidance-test/pass%77ord%3D%22alpha /mcp synthetic-guidance-secret"',
    `password="${'x'.repeat(2100)} /mcp synthetic-guidance-secret"`])
  ('scrubs whole quoted guidance before preserving public command syntax: %s', name => {
    const value: McpClientSnapshot = { clients: [{ name, type: 'failed',
      config: { scope: 'user', transport: 'stdio' }, error: 'safe failure' }], tools: [] };
    const status = capture(renderer => renderMcpStatusControlPlane(renderer, value, '/guidance-test')).join('\n');
    const blocked = capture(renderer => renderMcpBlockedContract(renderer,
      { blockerKind: 'unknown', reason: 'safe', doNext: `Run /mcp refresh ${name}` }, '/guidance-test')).join('\n');
    expect(status).not.toContain('synthetic-guidance-secret');
    expect(blocked).not.toContain('synthetic-guidance-secret');
    expect(status).toContain('Run /mcp refresh'); expect(blocked).toContain('Run /mcp refresh');
    expect(status).not.toContain('[external]/mcp');
    expect(status).toContain('[redacted]'); expect(blocked).toContain('[redacted]');
  });
  it.each(['status', 'tools', 'doctor', 'refresh', 'blocked'])('projects %s metadata before truncation without changing raw target matching', kind => {
    const root = '/mcp-review';
    const name = 'password=synthetic-sensitive-name';
    const value: McpClientSnapshot = { clients: [{ type: 'failed', name,
      config: { scope: 'project', transport: 'stdio' }, error: 'file:///mcp-review/private sk-\x1b[31msyntheticSensitiveKey123456 password=synthetic-sensitive-error' }],
      tools: [{ serverName: name, toolName: 'fixture', qualifiedName: 'password=synthetic-sensitive-tool',
        description: `${'x'.repeat(128)} sk-\x1b[31msyntheticSensitiveDescription123456 file:///mcp-review/private` }] };
    const before = JSON.stringify(value);
    const lines = capture(renderer => {
      if (kind === 'status') renderMcpStatusControlPlane(renderer, value, root);
      else if (kind === 'tools') renderMcpToolsControlPlane(renderer, value, name, root);
      else if (kind === 'doctor') renderMcpDoctorControlPlane(renderer, value, name, root);
      else if (kind === 'refresh') renderMcpRefreshControlPlane(renderer, value, name, root);
      else renderMcpBlockedContract(renderer, { blockerKind: 'unknown', reason: value.clients[0]!.type === 'failed' ? value.clients[0]!.error : '',
        doNext: `Reconnect ${name} file:///mcp-review/private` }, root);
    }).join('\n');
    expect(lines).not.toMatch(/synthetic-sensitive|syntheticSensitive|file:\/\/\/mcp-review|\x1b/);
    expect(lines).not.toContain('Unknown MCP server');
    if (kind !== 'tools') expect(lines).toContain('[project]/private');
    expect(JSON.stringify(value)).toBe(before);
  });
  it("renders status counts and unavailable server guidance", () => {
    const lines = capture((renderer) =>
      renderMcpStatusControlPlane(renderer, snapshot()),
    );

    expect(lines).toContain("\nMCP control plane");
    expect(lines).toContain(
      "- Servers: total 3, connected 1, needs-auth 1, failed 1, pending 0, disabled 0",
    );
    expect(lines).toContain(
      "- connectedSdk: connected (scope=project, transport=sdk, tools=1, executable=yes)",
    );
    expect(lines).toContain(
      "  reason: MCP server needsAuth requires authentication",
    );
    expect(lines).toContain(
      "  do-next: Run /mcp refresh brokenStdio and verify server connectivity before retrying.",
    );
  });

  it("renders tools for connected and unavailable target servers", () => {
    const connected = capture((renderer) =>
      renderMcpToolsControlPlane(renderer, snapshot(), "connectedSdk"),
    );
    expect(connected).toContain("\nMCP tools @ connectedSdk");
    expect(connected).toContain("- mcp__connectedSdk__search");

    const needsAuth = capture((renderer) =>
      renderMcpToolsControlPlane(renderer, snapshot(), "needsAuth"),
    );
    expect(needsAuth).toContain("- No tools currently exposed.");
    expect(needsAuth).toContain("  needsAuth: needs-auth (executable=no)");
    expect(needsAuth).toContain(
      "    do-next: Run /mcp auth -- \"needsAuth\", then /mcp test -- \"needsAuth\".",
    );
  });

  it("renders refresh blocked and doctor surfaces", () => {
    const blocked = capture((renderer) =>
      renderMcpRefreshControlPlane(renderer, snapshot(), "needsAuth"),
    );
    expect(blocked).toContain("- Outcome: blocked");
    expect(blocked).toContain("- BlockerKind: environment-not-ready");
    expect(blocked).toContain(
      "- Reason: MCP server needsAuth requires authentication",
    );

    const doctor = capture((renderer) =>
      renderMcpDoctorControlPlane(renderer, snapshot(), "connectedSdk"),
    );
    expect(doctor).toEqual([
      "\nMCP doctor @ connectedSdk",
      "- No blocking MCP issues detected.",
      "- Selected server is connected and serving tools.",
      "",
    ]);
  });

  it("renders shared blocked contract", () => {
    const lines = capture((renderer) =>
      renderMcpBlockedContract(renderer, {
        blockerKind: "unknown",
        reason: "MCP control plane failed: boom",
        doNext: "Run /mcp refresh all.",
      }),
    );

    expect(lines).toEqual([
      "",
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: unknown",
      "- Reason: MCP control plane failed: boom",
      "- DoNext: Run /mcp refresh all.",
      "",
    ]);
  });
});
