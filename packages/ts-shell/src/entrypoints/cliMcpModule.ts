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
import { authorizationForMcp } from '../cli/mcp/auth/service.js';
import type { Admission } from '../core/network/admission.js';

export type CliMcpAction = "status" | "tools" | "doctor" | "refresh" | "test" | "content" | "notifications" | "cancel";

export type CliMcpGateway = Pick<CoreMcpGateway, "snapshot" | "refresh"> & Partial<Pick<CoreMcpGateway, "close" | "syncWorkspace" | "peekSnapshot" | "subscribe" | "content" | "notifications" | "cancelContent">>;

export function createCliMcpGateway(cwd: string | (() => string), admissionForOperation?: () => () => string | undefined): CoreMcpGateway {
  return new CoreMcpGateway(cwd, admissionForOperation, authorizationForMcp);
}

export async function runCliMcpCommand(input: {
  readonly renderer: McpCliLineRenderer;
  readonly gateway: CliMcpGateway;
  readonly projectRoot?: string;
  readonly admission?: Admission;
  readonly mcpAction?: CliMcpAction;
  readonly mcpTarget?: string;
  readonly mcpContent?: McpContentRequest;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const mcpAction = input.mcpAction ?? "status";
  const mcpTarget = input.mcpTarget?.trim();
  const current = () => {
    try { return !input.signal?.aborted && input.admission?.() === undefined; }
    catch { return false; }
  };
  const renderer: McpCliLineRenderer = { renderLine(line) { if (current()) input.renderer.renderLine(line); } };
  if (!current()) return;
  try {
    if (await runMcpContentCommand({ ...input, renderer })) return;
    if (!current()) return;
    if (mcpAction === "refresh" || mcpAction === "test") {
      const refreshTarget =
        mcpAction !== "test" && (!mcpTarget || mcpTarget.toLowerCase() === "all") ? "all" : mcpTarget ?? "";
      const snapshot = await input.gateway.refresh(refreshTarget, {
        exactTarget: mcpAction === "test",
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.admission ? { admission: input.admission } : {}),
      });
      if (mcpAction === "test") {
        renderer.renderLine("MCP test: negotiated connection and tool discovery only; no tools called.");
        renderMcpDoctorControlPlane(renderer, snapshot, mcpTarget, input.projectRoot);
        return;
      }
      renderMcpRefreshControlPlane(renderer, snapshot, refreshTarget, input.projectRoot);
      return;
    }

    const snapshot = await input.gateway.snapshot(input.admission, input.signal);
    if (mcpAction === "tools") {
      renderMcpToolsControlPlane(renderer, snapshot, mcpTarget, input.projectRoot);
      return;
    }
    if (mcpAction === "doctor") {
      renderMcpDoctorControlPlane(renderer, snapshot, mcpTarget, input.projectRoot);
      return;
    }
    renderMcpStatusControlPlane(renderer, snapshot, input.projectRoot);
  } catch (error) {
    if (error instanceof McpGatewayBlockedError) {
      renderMcpBlockedContract(renderer, {
        blockerKind: error.blockerKind,
        reason: error.message,
        doNext: error.doNext,
      }, input.projectRoot);
      return;
    }

    renderMcpBlockedContract(renderer, {
      blockerKind: "unknown",
      reason:
        `MCP control plane failed: ${classifyUnknownMcpFailure(error).safeDetail}`,
      doNext:
        "Run /mcp refresh all to reload server connections, then retry your MCP command.",
    }, input.projectRoot);
  }
}
