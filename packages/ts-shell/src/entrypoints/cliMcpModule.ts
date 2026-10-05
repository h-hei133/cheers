import {
  CoreMcpGateway,
  McpGatewayBlockedError,
} from "../core/mcp/gateway.js";
import {
  type McpCliLineRenderer,
  renderMcpBlockedContract,
  renderMcpDoctorControlPlane,
  renderMcpRefreshControlPlane,
  renderMcpStatusControlPlane,
  renderMcpToolsControlPlane,
} from "./mcpControlCliSurface.js";

export type CliMcpAction = "status" | "tools" | "doctor" | "refresh";

export type CliMcpGateway = Pick<CoreMcpGateway, "snapshot" | "refresh"> & Partial<Pick<CoreMcpGateway, "close" | "syncWorkspace" | "peekSnapshot">>;

export function createCliMcpGateway(cwd: string | (() => string)): CoreMcpGateway {
  return new CoreMcpGateway(cwd);
}

export async function runCliMcpCommand(input: {
  readonly renderer: McpCliLineRenderer;
  readonly gateway: CliMcpGateway;
  readonly mcpAction?: CliMcpAction;
  readonly mcpTarget?: string;
}): Promise<void> {
  const mcpAction = input.mcpAction ?? "status";
  const mcpTarget = input.mcpTarget?.trim();
  try {
    if (mcpAction === "refresh") {
      const refreshTarget =
        !mcpTarget || mcpTarget.toLowerCase() === "all" ? "all" : mcpTarget;
      const snapshot = await input.gateway.refresh(refreshTarget);
      renderMcpRefreshControlPlane(input.renderer, snapshot, refreshTarget);
      return;
    }

    const snapshot = await input.gateway.snapshot();
    if (mcpAction === "tools") {
      renderMcpToolsControlPlane(input.renderer, snapshot, mcpTarget);
      return;
    }
    if (mcpAction === "doctor") {
      renderMcpDoctorControlPlane(input.renderer, snapshot, mcpTarget);
      return;
    }
    renderMcpStatusControlPlane(input.renderer, snapshot);
  } catch (error) {
    if (error instanceof McpGatewayBlockedError) {
      renderMcpBlockedContract(input.renderer, {
        blockerKind: error.blockerKind,
        reason: error.message,
        doNext: error.doNext,
      });
      return;
    }

    renderMcpBlockedContract(input.renderer, {
      blockerKind: "unknown",
      reason:
        error instanceof Error
          ? `MCP control plane failed: ${error.message}`
          : `MCP control plane failed: ${String(error)}`,
      doNext:
        "Run /mcp refresh all to reload server connections, then retry your MCP command.",
    });
  }
}
