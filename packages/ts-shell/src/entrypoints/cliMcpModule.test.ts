import { describe, expect, it } from "vitest";
import { McpGatewayBlockedError } from "../core/mcp/gateway.js";
import type { McpClientSnapshot } from "../core/mcp/types.js";
import { runCliMcpCommand, type CliMcpGateway } from "./cliMcpModule.js";

function snapshot(): McpClientSnapshot {
  return {
    clients: [
      {
        type: "connected",
        name: "connectedSdk",
        config: { transport: "sdk", scope: "project" },
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

function captureRenderer(): {
  readonly lines: string[];
  readonly renderer: { renderLine(line: string): void };
} {
  const lines: string[] = [];
  return {
    lines,
    renderer: {
      renderLine(line) {
        lines.push(line);
      },
    },
  };
}

describe("runCliMcpCommand", () => {
  it("renders status through the supplied gateway", async () => {
    const captured = captureRenderer();
    const gateway: CliMcpGateway = {
      snapshot: async () => snapshot(),
      refresh: async () => snapshot(),
    };

    await runCliMcpCommand({
      renderer: captured.renderer,
      gateway,
      mcpAction: "status",
    });

    expect(captured.lines).toContain("\nMCP control plane");
    expect(captured.lines).toContain(
      "- Servers: total 1, connected 1, needs-auth 0, failed 0, pending 0, disabled 0",
    );
  });

  it("renders refresh with normalized all target", async () => {
    const captured = captureRenderer();
    let refreshTarget = "";
    const gateway: CliMcpGateway = {
      snapshot: async () => snapshot(),
      refresh: async (target) => {
        refreshTarget = target;
        return snapshot();
      },
    };

    await runCliMcpCommand({
      renderer: captured.renderer,
      gateway,
      mcpAction: "refresh",
      mcpTarget: "all",
    });

    expect(refreshTarget).toBe("all");
    expect(captured.lines).toContain("\nMCP refresh complete (all servers).");
  });

  it("renders blocked contracts without throwing", async () => {
    const captured = captureRenderer();
    const gateway: CliMcpGateway = {
      snapshot: async () => {
        throw new McpGatewayBlockedError({
          blockerKind: "environment-not-ready",
          message: "MCP config is unavailable",
          doNext: "Fix MCP config.",
        });
      },
      refresh: async () => snapshot(),
    };

    await runCliMcpCommand({
      renderer: captured.renderer,
      gateway,
      mcpAction: "status",
    });

    expect(captured.lines).toContain("- Outcome: blocked");
    expect(captured.lines).toContain("- BlockerKind: environment-not-ready");
    expect(captured.lines).toContain("- DoNext: Fix MCP config.");
  });
});
