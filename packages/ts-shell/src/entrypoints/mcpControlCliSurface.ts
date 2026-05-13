import {
  describeMcpConnectionState,
} from "../core/mcp/gateway.js";
import type { McpClientSnapshot } from "../core/mcp/types.js";

export interface McpCliLineRenderer {
  renderLine(line: string): void;
}

export type McpCliLine = string;

export function renderMcpBlockedContract(
  renderer: McpCliLineRenderer,
  input: {
    blockerKind:
      | "command-not-allowlisted"
      | "environment-not-ready"
      | "unknown";
    reason: string;
    doNext: string;
  },
): void {
  renderer.renderLine("");
  renderer.renderLine("Result");
  renderer.renderLine("- Outcome: blocked");
  renderer.renderLine(`- BlockerKind: ${input.blockerKind}`);
  renderer.renderLine(`- Reason: ${input.reason}`);
  renderer.renderLine(`- DoNext: ${input.doNext}`);
  renderer.renderLine("");
}

export function renderMcpStatusControlPlane(
  renderer: McpCliLineRenderer,
  snapshot: McpClientSnapshot,
): void {
  const connected = snapshot.clients.filter(
    (client) => client.type === "connected",
  );
  const needsAuth = snapshot.clients.filter(
    (client) => client.type === "needs-auth",
  );
  const failed = snapshot.clients.filter((client) => client.type === "failed");
  const disabled = snapshot.clients.filter(
    (client) => client.type === "disabled",
  );
  const pending = snapshot.clients.filter(
    (client) => client.type === "pending",
  );

  renderer.renderLine("\nMCP control plane");
  renderer.renderLine(
    `- Servers: total ${snapshot.clients.length}, connected ${connected.length}, needs-auth ${needsAuth.length}, failed ${failed.length}, pending ${pending.length}, disabled ${disabled.length}`,
  );
  renderer.renderLine(`- Exposed tools: ${snapshot.tools.length}`);
  if (snapshot.clients.length === 0) {
    renderer.renderLine("- No MCP servers configured for this project.");
    renderer.renderLine(
      "- Add project servers in .private-agents.mcp.json or user servers in ~/.private-agents/mcp.json.",
    );
    renderer.renderLine("");
    return;
  }

  for (const client of snapshot.clients) {
    const toolCount = snapshot.tools.filter(
      (tool) => tool.serverName === client.name,
    ).length;
    const scope = client.config.scope;
    const transport = client.config.transport;
    const stateDescription = describeMcpConnectionState(client);
    const executable = stateDescription.executable && toolCount > 0;
    renderer.renderLine(
      `- ${client.name}: ${client.type} (scope=${scope}, transport=${transport}, tools=${toolCount}, executable=${executable ? "yes" : "no"})`,
    );
    if (stateDescription.reason) {
      renderer.renderLine(`  reason: ${truncate(stateDescription.reason, 140)}`);
    }
    if (client.type === "connected" && toolCount === 0) {
      renderer.renderLine("  reason: MCP server is connected but exposes no tools.");
    }
    renderer.renderLine(`  do-next: ${stateDescription.doNext}`);
  }

  renderer.renderLine("Next actions:");
  renderer.renderLine("- /mcp tools [server]    inspect available MCP tools.");
  renderer.renderLine(
    "- /mcp doctor            diagnose auth/connection failures.",
  );
  renderer.renderLine("- /mcp refresh [server]  reconnect all or one server.");
  renderer.renderLine("");
}

export function renderMcpRefreshControlPlane(
  renderer: McpCliLineRenderer,
  snapshot: McpClientSnapshot,
  refreshTarget: string,
): void {
  if (refreshTarget !== "all") {
    const refreshedClient = snapshot.clients.find(
      (client) => client.name === refreshTarget,
    );
    if (refreshedClient && refreshedClient.type !== "connected") {
      const stateDescription = describeMcpConnectionState(refreshedClient);
      renderMcpBlockedContract(renderer, {
        blockerKind: "environment-not-ready",
        reason:
          stateDescription.reason ??
          `MCP server ${refreshedClient.name} is not executable after refresh.`,
        doNext: stateDescription.doNext,
      });
      return;
    }
  }

  renderer.renderLine(
    `\nMCP refresh complete (${refreshTarget === "all" ? "all servers" : refreshTarget}).`,
  );
  renderMcpStatusControlPlane(renderer, snapshot);
}

export function renderMcpToolsControlPlane(
  renderer: McpCliLineRenderer,
  snapshot: McpClientSnapshot,
  targetServer?: string,
): void {
  const normalizedTarget = targetServer?.trim();
  const targetClients = normalizedTarget
    ? snapshot.clients.filter((client) => client.name === normalizedTarget)
    : snapshot.clients;
  if (normalizedTarget && targetClients.length === 0) {
    renderer.renderLine(`\nUnknown MCP server: ${normalizedTarget}`);
    renderer.renderLine(
      "Run /mcp status to inspect configured server names.\n",
    );
    return;
  }

  const tools = normalizedTarget
    ? snapshot.tools.filter((tool) => tool.serverName === normalizedTarget)
    : snapshot.tools;

  renderer.renderLine(
    `\nMCP tools${normalizedTarget ? ` @ ${normalizedTarget}` : ""}`,
  );
  if (tools.length === 0) {
    renderer.renderLine("- No tools currently exposed.");
    const unresolved = targetClients.filter(
      (client) => client.type !== "connected",
    );
    if (unresolved.length > 0) {
      renderer.renderLine("- Unavailable selected servers:");
      for (const client of unresolved) {
        const stateDescription = describeMcpConnectionState(client);
        renderer.renderLine(
          `  ${client.name}: ${client.type} (executable=no)`,
        );
        if (stateDescription.reason) {
          renderer.renderLine(`    reason: ${truncate(stateDescription.reason, 140)}`);
        }
        renderer.renderLine(`    do-next: ${stateDescription.doNext}`);
      }
    }
    renderer.renderLine("");
    return;
  }

  for (const tool of tools) {
    renderer.renderLine(`- ${tool.qualifiedName}`);
    if (tool.description?.trim()) {
      renderer.renderLine(`  ${truncate(tool.description.trim(), 140)}`);
    }
  }
  renderer.renderLine("");
}

export function renderMcpDoctorControlPlane(
  renderer: McpCliLineRenderer,
  snapshot: McpClientSnapshot,
  targetServer?: string,
): void {
  const normalizedTarget = targetServer?.trim();
  const targetClients = normalizedTarget
    ? snapshot.clients.filter((client) => client.name === normalizedTarget)
    : snapshot.clients;

  renderer.renderLine(
    `\nMCP doctor${normalizedTarget ? ` @ ${normalizedTarget}` : ""}`,
  );
  if (normalizedTarget && targetClients.length === 0) {
    renderer.renderLine("- Unknown server:");
    renderer.renderLine(`  reason: Unknown MCP server: ${normalizedTarget}`);
    renderer.renderLine(
      "  do-next: Run /mcp status to list configured servers, then retry with a valid server name.",
    );
    renderer.renderLine("");
    return;
  }

  const needsAuth = targetClients.filter(
    (client) => client.type === "needs-auth",
  );
  const failed = targetClients.filter((client) => client.type === "failed");
  const pending = targetClients.filter(
    (client) => client.type === "pending",
  );
  const disabled = targetClients.filter(
    (client) => client.type === "disabled",
  );

  if (
    needsAuth.length === 0 &&
    failed.length === 0 &&
    pending.length === 0 &&
    disabled.length === 0
  ) {
    renderer.renderLine("- No blocking MCP issues detected.");
    renderer.renderLine(
      normalizedTarget
        ? "- Selected server is connected and serving tools."
        : "- All configured servers are connected and serving tools.",
    );
    renderer.renderLine("");
    return;
  }

  const renderUnavailableClients = (
    label: string,
    clients: typeof targetClients,
  ): void => {
    if (clients.length === 0) {
      return;
    }
    renderer.renderLine(label);
    for (const client of clients) {
      const stateDescription = describeMcpConnectionState(client);
      renderer.renderLine(`  ${client.name}: ${client.type} (executable=no)`);
      if (stateDescription.reason) {
        renderer.renderLine(
          `    reason: ${truncate(stateDescription.reason, 140)}`,
        );
      }
      renderer.renderLine(`    do-next: ${stateDescription.doNext}`);
    }
  };

  if (needsAuth.length > 0) {
    renderUnavailableClients("- Needs auth:", needsAuth);
  }
  if (failed.length > 0) {
    renderUnavailableClients("- Failed connections:", failed);
  }
  if (pending.length > 0) {
    renderUnavailableClients("- Pending connections:", pending);
  }
  if (disabled.length > 0) {
    renderUnavailableClients("- Disabled servers:", disabled);
  }

  renderer.renderLine("Suggested recovery flow:");
  renderer.renderLine("- /mcp refresh all");
  renderer.renderLine(
    "- /connect status (if auth-backed MCP providers are involved)",
  );
  renderer.renderLine("- Re-check with /mcp status");
  renderer.renderLine("");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}
