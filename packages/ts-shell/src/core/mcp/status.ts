import type { McpConnectionState } from "./types.js";
import { classifyMcpFailure, type McpFailureClass, type McpFailurePlane } from "./errorTaxonomy.js";

export type McpGatewayBlockerKind =
  | "command-not-allowlisted"
  | "environment-not-ready"
  | "unknown";

export class McpGatewayBlockedError extends Error {
  readonly blockerKind: McpGatewayBlockerKind;
  readonly doNext: string;
  readonly mcpFailureClass: McpFailureClass;
  readonly mcpFailurePlane: McpFailurePlane;
  readonly mcpSafeDetail: string;

  constructor(input: {
    message: string;
    blockerKind: McpGatewayBlockerKind;
    doNext: string;
    mcpFailureClass?: McpFailureClass;
  }) {
    const taxonomy = classifyMcpFailure({
      failureClass: input.mcpFailureClass ?? "unknown",
      detail: input.message,
    });
    super(taxonomy.safeDetail);
    this.name = "McpGatewayBlockedError";
    this.blockerKind = input.blockerKind;
    this.doNext = input.doNext;
    this.mcpFailureClass = taxonomy.failureClass;
    this.mcpFailurePlane = taxonomy.failurePlane;
    this.mcpSafeDetail = taxonomy.safeDetail;
  }
}

export function describeMcpConnectionState(state: McpConnectionState): {
  readonly executable: boolean;
  readonly reason?: string;
  readonly doNext: string;
} {
  if (state.type === "connected") {
    return {
      executable: true,
      doNext: `Run /mcp tools ${state.name} to inspect exposed tools.`,
    };
  }

  const reason = describeUnavailableServer(state);
  if (state.type === "needs-auth") {
    return {
      executable: false,
      reason,
      doNext: `Authenticate server '${state.name}' and rerun /mcp refresh ${state.name}.`,
    };
  }

  if (state.type === "disabled") {
    return {
      executable: false,
      reason,
      doNext: `Enable server '${state.name}' in MCP config, then rerun /mcp refresh ${state.name}.`,
    };
  }

  return {
    executable: false,
    reason,
    doNext: `Run /mcp refresh ${state.name} and verify server connectivity before retrying.`,
  };
}

function describeUnavailableServer(
  state: Exclude<McpConnectionState, { type: "connected" }>,
): string {
  switch (state.type) {
    case "disabled":
      return `MCP server ${state.name} is disabled`;
    case "needs-auth":
      return `MCP server ${state.name} requires authentication`;
    case "failed":
      return `MCP server ${state.name} is unavailable: ${state.error}`;
    case "pending":
      return `MCP server ${state.name} is pending connection`;
  }
}


export function unknownServer(name: string): McpGatewayBlockedError {
  return new McpGatewayBlockedError({
    message: "Unknown MCP server: " + name,
    blockerKind: "unknown", mcpFailureClass: "tool-unavailable",
    doNext: "Run /mcp status to list configured servers, then retry with a valid server name.",
  });
}

export function failureClassForConnectionState(
  state: Exclude<McpConnectionState, { type: "connected" }>,
): McpFailureClass {
  switch (state.type) {
    case "needs-auth":
      return "permission-denied";
    case "disabled":
      return "config";
    case "failed":
      return state.error.toLowerCase().includes("missing")
        ? "config"
        : "server-unavailable";
    case "pending":
      return "server-unavailable";
  }
}
