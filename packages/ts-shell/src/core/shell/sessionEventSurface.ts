import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { QueryEvent } from "../query/events.js";

export interface RuntimeEventDigest {
  mcpSnapshots: number;
  mcpClients: number;
  mcpTools: number;
  retries: number;
  toolsStarted: number;
  toolNames: string[];
  toolsFailed: number;
  approvalsRequested: number;
  approvalsApproved: number;
  approvalsDenied: number;
  retryNoticeShown: boolean;
}

export function createRuntimeEventDigest(): RuntimeEventDigest {
  return {
    mcpSnapshots: 0,
    mcpClients: 0,
    mcpTools: 0,
    retries: 0,
    toolsStarted: 0,
    toolNames: [],
    toolsFailed: 0,
    approvalsRequested: 0,
    approvalsApproved: 0,
    approvalsDenied: 0,
    retryNoticeShown: false,
  };
}

export function updateRuntimeEventDigest(
  digest: RuntimeEventDigest,
  event: QueryEvent,
): void {
  switch (event.type) {
    case "mcp.snapshot":
      digest.mcpSnapshots += 1;
      digest.mcpClients = event.clients;
      digest.mcpTools = event.tools;
      break;
    case "query.retrying":
      digest.retries += 1;
      break;
    case "tool.started":
      digest.toolsStarted += 1;
      if (!digest.toolNames.includes(event.toolName)) {
        digest.toolNames.push(event.toolName);
      }
      break;
    case "tool.result":
      if (!event.success) {
        digest.toolsFailed += 1;
      }
      break;
    case "approval.requested":
      digest.approvalsRequested += 1;
      break;
    case "approval.resolved":
      if (event.outcome === "approved") {
        digest.approvalsApproved += 1;
      } else {
        digest.approvalsDenied += 1;
      }
      break;
    default:
      break;
  }
}

export function renderSessionQueryEventSurface(input: {
  renderer: StreamingRenderer;
  event: QueryEvent;
  digest: RuntimeEventDigest;
  printMode: boolean;
  viewMode: "compact" | "verbose";
  startedRendering: boolean;
}): { startedRendering: boolean } {
  if (input.printMode) {
    return { startedRendering: input.startedRendering };
  }

  switch (input.event.type) {
    case "mcp.snapshot":
      if (input.viewMode === "verbose") {
        input.renderer.renderLine(
          `\n[MCP] clients=${input.event.clients} tools=${input.event.tools}`,
        );
      }
      break;
    case "tool.started":
      if (input.viewMode === "verbose") {
        input.renderer.renderLine(`\n[tool:start] ${input.event.toolName}`);
      }
      break;
    case "approval.requested":
      if (input.viewMode === "verbose") {
        input.renderer.renderLine(
          `\n[approval] requested for ${input.event.toolName}`,
        );
      }
      break;
    case "approval.resolved":
      if (input.viewMode === "verbose") {
        input.renderer.renderLine(
          `\n[approval] ${input.event.toolName} ${input.event.outcome}`,
        );
      }
      break;
    case "tool.result":
      if (input.viewMode === "verbose") {
        input.renderer.renderLine(
          `\n[tool:result] ${input.event.toolName} success=${input.event.success}`,
        );
      }
      break;
    case "query.retrying":
      if (input.viewMode === "verbose") {
        input.renderer.renderLine(
          `\n[query:retry] role=${input.event.role} turn=${input.event.turn} attempt=${input.event.attempt} reason=${input.event.reason}`,
        );
      } else {
        renderCompactRetryNotice(input.renderer, input.digest);
      }
      break;
    case "message.delta":
      if (input.viewMode !== "verbose" && input.event.role === "planner") {
        break;
      }
      if (!input.startedRendering) {
        input.renderer.renderLine("\nAssistant:");
      }
      input.renderer.renderChunk(input.event.delta);
      return { startedRendering: true };
    case "lifecycle.cancelled":
      if (input.viewMode === "verbose") {
        input.renderer.renderLine(`\n[cancelled] ${input.event.reason}`);
      } else {
        input.renderer.renderLine(
          "\nCurrent request was cancelled before completion.",
        );
      }
      break;
    case "lifecycle.error":
      if (input.viewMode === "verbose") {
        input.renderer.renderLine(`\n[error] ${input.event.error}`);
      } else {
        input.renderer.renderLine(
          "\nRuntime error occurred while processing this request.",
        );
      }
      break;
    default:
      break;
  }

  return { startedRendering: input.startedRendering };
}

export function renderExecutionSummaryBlock(
  renderer: StreamingRenderer,
  digest: RuntimeEventDigest,
  mode: "minimal" | "verbose",
): void {
  const summaryLines: string[] = [];
  if (digest.toolsStarted > 0) {
    const toolLabel =
      digest.toolNames.length > 0
        ? digest.toolNames.slice(0, 3).join(", ")
        : "tooling";
    summaryLines.push(
      digest.toolsFailed > 0
        ? `Actions: ${toolLabel} (${digest.toolsStarted} run, ${digest.toolsFailed} failed)`
        : `Actions: ${toolLabel} (${digest.toolsStarted} run)`,
    );
  }
  if (digest.approvalsRequested > 0) {
    summaryLines.push(
      `Approvals: ${digest.approvalsApproved}/${digest.approvalsRequested} approved`,
    );
  }
  if (digest.retries > 0) {
    summaryLines.push(`Provider retries: ${digest.retries}`);
  }
  if (digest.mcpSnapshots > 0) {
    summaryLines.push(
      `MCP: clients=${digest.mcpClients}, tools=${digest.mcpTools}`,
    );
  }

  if (summaryLines.length === 0) {
    return;
  }

  renderer.renderLine(
    mode === "verbose" ? "\nExecution trace summary" : "\nExecution summary",
  );
  for (const line of summaryLines) {
    renderer.renderLine(`- ${line}`);
  }
  renderer.renderLine("");
}

function renderCompactRetryNotice(
  renderer: StreamingRenderer,
  digest: RuntimeEventDigest,
): void {
  if (digest.retryNoticeShown) {
    return;
  }
  digest.retryNoticeShown = true;
  renderer.renderLine("\nWorking through a temporary provider retry...");
}
