import {
  describeMcpConnectionState,
} from "../core/mcp/gateway.js";
import type { McpClientSnapshot } from "../core/mcp/types.js";
import { reportMetadata } from '../core/commands/report/metadata.js';
import { plainReportText } from '../core/commands/report/projection.js';
import { redactReportText } from '../core/security/redaction.js';
import { redactReportPaths } from '../core/security/paths.js';

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
  projectRoot = process.cwd(),
): void {
  renderer.renderLine("");
  renderer.renderLine("Result");
  renderer.renderLine("- Outcome: blocked");
  renderer.renderLine(`- BlockerKind: ${input.blockerKind}`);
  renderer.renderLine(`- Reason: ${reportMetadata(input.reason, projectRoot, 2000)}`);
  renderer.renderLine(`- DoNext: ${guidance(input.doNext, projectRoot)}`);
  renderer.renderLine("");
}

export function renderMcpStatusControlPlane(
  renderer: McpCliLineRenderer,
  snapshot: McpClientSnapshot,
  projectRoot = process.cwd(),
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
      "- Add project servers in .cheers/mcp.json (legacy .cheers.mcp.json remains readable) or user servers in ~/.cheers/mcp.json.",
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
      `- ${reportMetadata(client.name, projectRoot)}: ${client.type} (scope=${scope}, transport=${transport}, tools=${toolCount}, executable=${executable ? "yes" : "no"})`,
    );
    if (stateDescription.reason) {
      renderer.renderLine(`  reason: ${truncate(reportMetadata(stateDescription.reason, projectRoot), 140)}`);
    }
    if (client.type === "connected" && toolCount === 0) {
      renderer.renderLine("  reason: MCP server is connected but exposes no tools.");
    }
    renderer.renderLine(`  do-next: ${guidance(stateDescription.doNext, projectRoot)}`);
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
  projectRoot = process.cwd(),
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
      }, projectRoot);
      return;
    }
  }

  renderer.renderLine(
    `\nMCP refresh complete (${refreshTarget === "all" ? "all servers" : reportMetadata(refreshTarget, projectRoot)}).`,
  );
  renderMcpStatusControlPlane(renderer, snapshot, projectRoot);
}

export function renderMcpToolsControlPlane(
  renderer: McpCliLineRenderer,
  snapshot: McpClientSnapshot,
  targetServer?: string,
  projectRoot = process.cwd(),
): void {
  const normalizedTarget = targetServer?.trim();
  const targetClients = normalizedTarget
    ? snapshot.clients.filter((client) => client.name === normalizedTarget)
    : snapshot.clients;
  if (normalizedTarget && targetClients.length === 0) {
    renderer.renderLine(`\nUnknown MCP server: ${reportMetadata(normalizedTarget, projectRoot)}`);
    renderer.renderLine(
      "Run /mcp status to inspect configured server names.\n",
    );
    return;
  }

  const tools = normalizedTarget
    ? snapshot.tools.filter((tool) => tool.serverName === normalizedTarget)
    : snapshot.tools;

  renderer.renderLine(
    `\nMCP tools${normalizedTarget ? ` @ ${reportMetadata(normalizedTarget, projectRoot)}` : ""}`,
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
          `  ${reportMetadata(client.name, projectRoot)}: ${client.type} (executable=no)`,
        );
        if (stateDescription.reason) {
          renderer.renderLine(`    reason: ${truncate(reportMetadata(stateDescription.reason, projectRoot), 140)}`);
        }
        renderer.renderLine(`    do-next: ${guidance(stateDescription.doNext, projectRoot)}`);
      }
    }
    renderer.renderLine("");
    return;
  }

  for (const tool of tools) {
    renderer.renderLine(`- ${reportMetadata(tool.qualifiedName, projectRoot)}`);
    if (tool.description?.trim()) {
      renderer.renderLine(`  ${truncate(reportMetadata(tool.description.trim(), projectRoot), 140)}`);
    }
  }
  renderer.renderLine("");
}

export function renderMcpDoctorControlPlane(
  renderer: McpCliLineRenderer,
  snapshot: McpClientSnapshot,
  targetServer?: string,
  projectRoot = process.cwd(),
): void {
  const normalizedTarget = targetServer?.trim();
  const targetClients = normalizedTarget
    ? snapshot.clients.filter((client) => client.name === normalizedTarget)
    : snapshot.clients;

  renderer.renderLine(
    `\nMCP doctor${normalizedTarget ? ` @ ${reportMetadata(normalizedTarget, projectRoot)}` : ""}`,
  );
  if (normalizedTarget && targetClients.length === 0) {
    renderer.renderLine("- Unknown server:");
    renderer.renderLine(`  reason: Unknown MCP server: ${reportMetadata(normalizedTarget, projectRoot)}`);
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
      renderer.renderLine(`  ${reportMetadata(client.name, projectRoot)}: ${client.type} (executable=no)`);
      if (stateDescription.reason) {
        renderer.renderLine(
          `    reason: ${truncate(reportMetadata(stateDescription.reason, projectRoot), 140)}`,
        );
      }
      renderer.renderLine(`    do-next: ${guidance(stateDescription.doNext, projectRoot)}`);
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

/** Public slash command tokens are syntax; their surrounding metadata still needs projection. */
function guidance(value: string, projectRoot: string): string {
  const canonical = redactReportText(plainReportText(value), Infinity);
  const projected = canonical.split(/((?:^|\s)\/(?:mcp|connect)(?=\s|$))/g)
    .map((part, index) => index % 2 ? part.trim() : redactReportPaths(part, projectRoot))
    .filter(Boolean).join(' ');
  return redactReportText(plainReportText(projected), 2000);
}
