import fs from "node:fs";
import path from "node:path";
import { writeRawStdout } from "../../core/shell/outputGuard.js";
import { resolveWriteTarget } from "../../core/security/writeTarget.js";
import { gatherExport } from "../../session/export/collect.js";
import { renderExportHtml } from "../../session/export/html.js";
import { handleExtendedRpcCommand } from "./handlers.js";
import {
  rpcImagesToContent,
  tryParseRpcCommand,
  tryParseRpcUiResponse,
  type RpcCommand,
  type RpcExtensionUiRequest,
  type RpcExtensionUiResponse,
  type RpcHost,
  type RpcImageAttachment,
  type RpcQueueMode,
  type RpcResponse,
  type RpcSessionState,
} from "./protocol.js";

export type {
  RpcCommand,
  RpcExtensionUiRequest,
  RpcExtensionUiResponse,
  RpcHost,
  RpcImageAttachment,
  RpcQueueMode,
  RpcResponse,
  RpcSessionState,
};
export { tryParseRpcCommand, tryParseRpcUiResponse };

function buildResponse(
  id: string | undefined,
  command: string,
  success: boolean,
  payload?: { readonly data?: Record<string, unknown>; readonly error?: string },
): RpcResponse {
  return {
    ...(id !== undefined ? { id } : {}),
    type: "response",
    command,
    success,
    ...(payload?.data !== undefined ? { data: payload.data } : {}),
    ...(payload?.error !== undefined ? { error: payload.error } : {}),
  };
}

function handleExportHtml(command: Extract<RpcCommand, { type: "export_html" }>, host: RpcHost): RpcResponse {
  const gathered = gatherExport({ sessionId: host.sessionId, workspace: host.workspaceRoot });
  if (!gathered.ok) {
    return buildResponse(command.id, command.type, false, { error: "reason" in gathered ? gathered.reason : "Export failed." });
  }
  const html = renderExportHtml(gathered.payload);
  let writtenPath: string | undefined;
  if (command.outputPath) {
    const decision = resolveWriteTarget({ requested: command.outputPath, root: host.workspaceRoot });
    if (!decision.allowed) {
      return buildResponse(command.id, command.type, false, { error: "reason" in decision ? decision.reason : "Write target refused." });
    }
    fs.mkdirSync(path.dirname(decision.resolvedPath), { recursive: true });
    fs.writeFileSync(decision.resolvedPath, html, "utf8");
    writtenPath = decision.resolvedPath;
  }
  return buildResponse(command.id, command.type, true, {
    data: {
      sessionId: host.sessionId,
      messageCount: gathered.payload.entries.length,
      ...(writtenPath ? { path: writtenPath } : { html }),
    },
  });
}

/** Execute a parsed `RpcCommand` against `host` and emit the JSONL response frame. */
export async function handleRpcCommand(command: RpcCommand, host: RpcHost): Promise<RpcResponse> {
  const emit = host.emitResponse ?? ((res: RpcResponse) => writeRawStdout(`${JSON.stringify(res)}\n`));
  let response: RpcResponse;
  try {
    switch (command.type) {
      case "prompt": {
        const images = rpcImagesToContent(command.images);
        if (!command.message.trim() && !images?.length) {
          response = buildResponse(command.id, command.type, false, { error: "Prompt message cannot be empty." });
          break;
        }
        if (host.isStreaming() && command.streamingBehavior === "steer" && host.steer) {
          host.steer(command.message, images);
        } else if (host.isStreaming() && command.streamingBehavior === "followUp" && host.followUp) {
          host.followUp(command.message, images);
        } else {
          host.enqueuePrompt(command.message, images);
        }
        response = buildResponse(command.id, command.type, true);
        break;
      }
      case "steer": {
        const images = rpcImagesToContent(command.images);
        if (!command.message.trim() && !images?.length) {
          response = buildResponse(command.id, command.type, false, { error: "Steer message cannot be empty." });
          break;
        }
        if (host.steer) host.steer(command.message, images);
        else host.enqueuePrompt(command.message, images);
        response = buildResponse(command.id, command.type, true);
        break;
      }
      case "follow_up": {
        const images = rpcImagesToContent(command.images);
        if (!command.message.trim() && !images?.length) {
          response = buildResponse(command.id, command.type, false, { error: "Follow-up message cannot be empty." });
          break;
        }
        if (host.followUp) host.followUp(command.message, images);
        else host.enqueuePrompt(command.message, images);
        response = buildResponse(command.id, command.type, true);
        break;
      }
      case "abort": {
        host.abort?.();
        response = buildResponse(command.id, command.type, true);
        break;
      }
      case "clear_queue": {
        const cleared = host.clearQueue ? host.clearQueue() : 0;
        const data = typeof cleared === "number" ? { cleared } : { cleared: cleared.cleared, steering: cleared.steering, followUp: cleared.followUp };
        response = buildResponse(command.id, command.type, true, { data });
        break;
      }
      case "get_state": {
        const state = host.getState?.() ?? {
          sessionId: host.sessionId,
          workspaceRoot: host.workspaceRoot,
          isStreaming: host.isStreaming(),
          messageCount: host.getMessages().length,
        };
        response = buildResponse(command.id, command.type, true, { data: { ...state } });
        break;
      }
      case "get_messages": {
        response = buildResponse(command.id, command.type, true, { data: { messages: host.getMessages() } });
        break;
      }
      case "export_html": {
        response = handleExportHtml(command, host);
        break;
      }
      default: {
        const extended = await handleExtendedRpcCommand(command, host);
        if (!extended.handled) {
          response = buildResponse(undefined, "unknown", false, { error: "Unsupported RPC command." });
        } else if ("error" in extended) {
          response = buildResponse(command.id, command.type, false, { error: extended.error });
        } else {
          response = buildResponse(command.id, command.type, true, extended.data ? { data: extended.data } : undefined);
        }
      }
    }
  } catch (error) {
    response = buildResponse(command.id, command.type, false, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  emit(response);
  return response;
}
