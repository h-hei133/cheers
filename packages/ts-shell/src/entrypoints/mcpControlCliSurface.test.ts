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
      "    do-next: Authenticate server 'needsAuth' and rerun /mcp refresh needsAuth.",
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
