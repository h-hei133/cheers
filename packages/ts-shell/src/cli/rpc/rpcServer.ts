import fs from "node:fs";
import path from "node:path";
import { writeRawStdout } from "../../core/shell/outputGuard.js";
import { resolveWriteTarget } from "../../core/security/writeTarget.js";
import { gatherExport } from "../../session/export/collect.js";
import { renderExportHtml } from "../../session/export/html.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";

export type RpcCommand =
  | { readonly id?: string; readonly type: "prompt"; readonly message: string; readonly streamingBehavior?: "steer" | "followUp" }
  | { readonly id?: string; readonly type: "steer"; readonly message: string }
  | { readonly id?: string; readonly type: "follow_up"; readonly message: string }
  | { readonly id?: string; readonly type: "abort" }
  | { readonly id?: string; readonly type: "clear_queue" }
  | { readonly id?: string; readonly type: "get_state" }
  | { readonly id?: string; readonly type: "get_messages" }
  | { readonly id?: string; readonly type: "export_html"; readonly outputPath?: string };

export interface RpcResponse {
  readonly id?: string;
  readonly type: "response";
  readonly command: string;
  readonly success: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: string;
}

export interface RpcHost {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly isStreaming: () => boolean;
  readonly getMessages: () => readonly SessionMessage[];
  readonly enqueuePrompt: (prompt: string) => void;
  readonly steer?: (message: string) => void;
  readonly followUp?: (message: string) => void;
  readonly clearQueue?: () => number;
  readonly abort?: () => void;
  readonly emitResponse?: (response: RpcResponse) => void;
}

const RPC_COMMAND_TYPES = new Set([
  "prompt",
  "steer",
  "follow_up",
  "abort",
  "clear_queue",
  "get_state",
  "get_messages",
  "export_html",
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse a single JSONL line into an `RpcCommand` if and only if it is a JSON
 * object with a recognized `type` field (`prompt`, `steer`, `follow_up`,
 * `abort`, `clear_queue`, `get_state`, `get_messages`, `export_html`).
 */
export function tryParseRpcCommand(line: string): RpcCommand | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!isObjectRecord(parsed) || typeof parsed.type !== "string" || !RPC_COMMAND_TYPES.has(parsed.type)) {
    return undefined;
  }
  const id = typeof parsed.id === "string" ? parsed.id : undefined;
  switch (parsed.type) {
    case "prompt":
      if (typeof parsed.message !== "string") return undefined;
      return {
        ...(id !== undefined ? { id } : {}),
        type: "prompt",
        message: parsed.message,
        ...(parsed.streamingBehavior === "steer" || parsed.streamingBehavior === "followUp"
          ? { streamingBehavior: parsed.streamingBehavior }
          : {}),
      };
    case "steer":
    case "follow_up":
      if (typeof parsed.message !== "string") return undefined;
      return {
        ...(id !== undefined ? { id } : {}),
        type: parsed.type,
        message: parsed.message,
      };
    case "export_html":
      return {
        ...(id !== undefined ? { id } : {}),
        type: "export_html",
        ...(typeof parsed.outputPath === "string" ? { outputPath: parsed.outputPath } : {}),
      };
    case "abort":
    case "clear_queue":
    case "get_state":
    case "get_messages":
      return {
        ...(id !== undefined ? { id } : {}),
        type: parsed.type,
      };
    default:
      return undefined;
  }
}

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

/** Execute a parsed `RpcCommand` against `host` and emit the JSONL response frame. */
export async function handleRpcCommand(command: RpcCommand, host: RpcHost): Promise<RpcResponse> {
  const emit = host.emitResponse ?? ((res: RpcResponse) => writeRawStdout(`${JSON.stringify(res)}\n`));
  let response: RpcResponse;
  try {
    switch (command.type) {
      case "prompt": {
        if (!command.message.trim()) {
          response = buildResponse(command.id, command.type, false, { error: "Prompt message cannot be empty." });
          break;
        }
        if (host.isStreaming() && command.streamingBehavior === "steer" && host.steer) {
          host.steer(command.message);
        } else if (host.isStreaming() && command.streamingBehavior === "followUp" && host.followUp) {
          host.followUp(command.message);
        } else {
          host.enqueuePrompt(command.message);
        }
        response = buildResponse(command.id, command.type, true);
        break;
      }
      case "steer": {
        if (!command.message.trim()) {
          response = buildResponse(command.id, command.type, false, { error: "Steer message cannot be empty." });
          break;
        }
        if (host.steer) host.steer(command.message);
        else host.enqueuePrompt(command.message);
        response = buildResponse(command.id, command.type, true);
        break;
      }
      case "follow_up": {
        if (!command.message.trim()) {
          response = buildResponse(command.id, command.type, false, { error: "Follow-up message cannot be empty." });
          break;
        }
        if (host.followUp) host.followUp(command.message);
        else host.enqueuePrompt(command.message);
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
        response = buildResponse(command.id, command.type, true, { data: { cleared } });
        break;
      }
      case "get_state": {
        response = buildResponse(command.id, command.type, true, {
          data: {
            sessionId: host.sessionId,
            workspaceRoot: host.workspaceRoot,
            isStreaming: host.isStreaming(),
            messageCount: host.getMessages().length,
          },
        });
        break;
      }
      case "get_messages": {
        response = buildResponse(command.id, command.type, true, {
          data: { messages: host.getMessages() },
        });
        break;
      }
      case "export_html": {
        const gathered = gatherExport({ sessionId: host.sessionId, workspace: host.workspaceRoot });
        if (!gathered.ok) {
          response = buildResponse(command.id, command.type, false, { error: 'reason' in gathered ? gathered.reason : 'Export failed.' });
          break;
        }
        const html = renderExportHtml(gathered.payload);
        let writtenPath: string | undefined;
        if (command.outputPath) {
          const decision = resolveWriteTarget({ requested: command.outputPath, root: host.workspaceRoot });
          if (!decision.allowed) {
            response = buildResponse(command.id, command.type, false, { error: 'reason' in decision ? decision.reason : 'Write target refused.' });
            break;
          }
          fs.mkdirSync(path.dirname(decision.resolvedPath), { recursive: true });
          fs.writeFileSync(decision.resolvedPath, html, "utf8");
          writtenPath = decision.resolvedPath;
        }
        response = buildResponse(command.id, command.type, true, {
          data: {
            sessionId: host.sessionId,
            messageCount: gathered.payload.entries.length,
            ...(writtenPath ? { path: writtenPath } : { html }),
          },
        });
        break;
      }
      default: {
        response = buildResponse(undefined, 'unknown', false, { error: 'Unsupported RPC command.' });
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
