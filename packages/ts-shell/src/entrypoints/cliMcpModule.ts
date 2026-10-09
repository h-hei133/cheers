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
import { runMcpContentCommand } from "../cli/mcp/content.js";
import type { McpContentRequest } from "../core/mcp/content/types.js";
import { classifyUnknownMcpFailure } from "../core/mcp/errorTaxonomy.js";

export type CliMcpAction = "status" | "tools" | "doctor" | "refresh" | "test" | "content" | "notifications" | "cancel";

export type CliMcpGateway = Pick<CoreMcpGateway, "snapshot" | "refresh"> & Partial<Pick<CoreMcpGateway, "close" | "syncWorkspace" | "peekSnapshot" | "subscribe" | "content" | "notifications" | "cancelContent">>;

export function createCliMcpGateway(cwd: string | (() => string), admissionForOperation?: () => () => string | undefined): CoreMcpGateway {
  return new CoreMcpGateway(cwd, admissionForOperation);
}

export async function runCliMcpCommand(input: {
  readonly renderer: McpCliLineRenderer;
  readonly gateway: CliMcpGateway;
  readonly mcpAction?: CliMcpAction;
  readonly mcpTarget?: string;
  readonly mcpContent?: McpContentRequest;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const mcpAction = input.mcpAction ?? "status";
  const mcpTarget = input.mcpTarget?.trim();
  try {
    if (await runMcpContentCommand(input)) return;
    if (mcpAction === "refresh" || mcpAction === "test") {
      const refreshTarget =
        mcpAction !== "test" && (!mcpTarget || mcpTarget.toLowerCase() === "all") ? "all" : mcpTarget ?? "";
      const snapshot = await input.gateway.refresh(refreshTarget, { exactTarget: mcpAction === "test" });
      if (mcpAction === "test") {
        input.renderer.renderLine("MCP test: negotiated connection and tool discovery only; no tools called.");
        renderMcpDoctorControlPlane(input.renderer, snapshot, mcpTarget);
        return;
      }
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
        `MCP control plane failed: ${classifyUnknownMcpFailure(error).safeDetail}`,
      doNext:
        "Run /mcp refresh all to reload server connections, then retry your MCP command.",
    });
  }
}
