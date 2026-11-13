import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import type { ImageContent } from "../../model-adapters/multimodal.js";
import type { CompactionOutcome } from "../../core/shell/compaction.js";
import type { SessionNavigationResult } from "../runtime/navigation.js";

export interface RpcUiDialogOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
}

export interface RpcUiBridge {
  readonly select: (title: string, options: readonly string[], opts?: RpcUiDialogOptions) => Promise<string | undefined>;
  readonly confirm: (title: string, message: string, opts?: RpcUiDialogOptions) => Promise<boolean>;
  readonly input: (title: string, placeholder?: string, opts?: RpcUiDialogOptions) => Promise<string | undefined>;
  readonly editor: (title: string, prefill?: string) => Promise<string | undefined>;
  readonly notify: (message: string, notifyType?: "info" | "warning" | "error") => void;
  readonly setStatus: (statusKey: string, statusText: string | undefined) => void;
  readonly setWidget: (widgetKey: string, widgetLines: readonly string[] | undefined, widgetPlacement?: "aboveEditor" | "belowEditor") => void;
  readonly setTitle: (title: string) => void;
  readonly setEditorText: (text: string) => void;
  readonly handleUiResponse: (response: RpcExtensionUiResponse) => boolean;
  readonly pendingCount: () => number;
  readonly dispose: () => void;
}
export interface RpcImageAttachment {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
}

export type RpcQueueMode = "one-at-a-time" | "all";

export type RpcCommand =
  | {
      readonly id?: string;
      readonly type: "prompt";
      readonly message: string;
      readonly images?: readonly RpcImageAttachment[];
      readonly streamingBehavior?: "steer" | "followUp";
    }
  | { readonly id?: string; readonly type: "steer"; readonly message: string; readonly images?: readonly RpcImageAttachment[] }
  | { readonly id?: string; readonly type: "follow_up"; readonly message: string; readonly images?: readonly RpcImageAttachment[] }
  | { readonly id?: string; readonly type: "abort" }
  | { readonly id?: string; readonly type: "clear_queue" }
  | { readonly id?: string; readonly type: "get_state" }
  | { readonly id?: string; readonly type: "get_messages" }
  | { readonly id?: string; readonly type: "export_html"; readonly outputPath?: string }
  | { readonly id?: string; readonly type: "new_session"; readonly parentSession?: string }
  | { readonly id?: string; readonly type: "switch_session"; readonly sessionPath: string }
  | { readonly id?: string; readonly type: "set_session_name"; readonly name: string }
  | { readonly id?: string; readonly type: "get_session_stats" }
  | { readonly id?: string; readonly type: "get_last_assistant_text" }
  | { readonly id?: string; readonly type: "set_model"; readonly provider: string; readonly modelId: string }
  | { readonly id?: string; readonly type: "cycle_model" }
  | { readonly id?: string; readonly type: "get_available_models" }
  | { readonly id?: string; readonly type: "set_thinking_level"; readonly level: string }
  | { readonly id?: string; readonly type: "cycle_thinking_level" }
  | { readonly id?: string; readonly type: "get_available_thinking_levels" }
  | { readonly id?: string; readonly type: "set_steering_mode"; readonly mode: RpcQueueMode }
  | { readonly id?: string; readonly type: "set_follow_up_mode"; readonly mode: RpcQueueMode }
  | { readonly id?: string; readonly type: "compact"; readonly customInstructions?: string }
  | { readonly id?: string; readonly type: "set_auto_compaction"; readonly enabled: boolean }
  | { readonly id?: string; readonly type: "set_auto_retry"; readonly enabled: boolean }
  | { readonly id?: string; readonly type: "abort_retry" }
  | { readonly id?: string; readonly type: "fork"; readonly entryId: string }
  | { readonly id?: string; readonly type: "clone" }
  | { readonly id?: string; readonly type: "get_fork_messages" }
  | { readonly id?: string; readonly type: "get_entries"; readonly since?: string | number }
  | { readonly id?: string; readonly type: "get_tree" }
  | { readonly id?: string; readonly type: "navigate_tree"; readonly entryId: string; readonly expectedVersion?: string }
  | { readonly id?: string; readonly type: "get_commands" }
  | { readonly id?: string; readonly type: "bash"; readonly command: string; readonly excludeFromContext?: boolean }
  | { readonly id?: string; readonly type: "abort_bash" };

export interface RpcResponse {
  readonly id?: string;
  readonly type: "response";
  readonly command: string;
  readonly success: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: string;
}

export interface RpcSessionState {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly isStreaming: boolean;
  readonly messageCount: number;
  readonly isCompacting?: boolean;
  readonly pendingMessageCount?: number;
  readonly model?: { readonly provider?: string; readonly id?: string } | null;
  readonly thinkingLevel?: string | null;
  readonly steeringMode?: RpcQueueMode;
  readonly followUpMode?: RpcQueueMode;
  readonly sessionName?: string;
  readonly sessionFile?: string;
  readonly autoCompactionEnabled?: boolean;
  readonly autoRetryEnabled?: boolean;
}

export type RpcExtensionUiRequest =
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "select"; readonly title: string; readonly options: readonly string[]; readonly timeout?: number }
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "confirm"; readonly title: string; readonly message: string; readonly timeout?: number }
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "input"; readonly title: string; readonly placeholder?: string; readonly timeout?: number }
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "editor"; readonly title: string; readonly prefill?: string }
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "notify"; readonly message: string; readonly notifyType?: "info" | "warning" | "error" }
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "setStatus"; readonly statusKey: string; readonly statusText: string | undefined }
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "setWidget"; readonly widgetKey: string; readonly widgetLines: readonly string[] | undefined; readonly widgetPlacement?: "aboveEditor" | "belowEditor" }
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "setTitle"; readonly title: string }
  | { readonly type: "extension_ui_request"; readonly id: string; readonly method: "set_editor_text"; readonly text: string };

export type RpcExtensionUiResponse =
  | { readonly type: "extension_ui_response"; readonly id: string; readonly value: string }
  | { readonly type: "extension_ui_response"; readonly id: string; readonly confirmed: boolean }
  | { readonly type: "extension_ui_response"; readonly id: string; readonly cancelled: true };

export interface RpcHost {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly isStreaming: () => boolean;
  readonly getMessages: () => readonly SessionMessage[];
  readonly enqueuePrompt: (prompt: string, images?: readonly ImageContent[]) => void;
  readonly steer?: (message: string, images?: readonly ImageContent[]) => void;
  readonly followUp?: (message: string, images?: readonly ImageContent[]) => void;
  readonly clearQueue?: () => number | { readonly cleared: number; readonly steering: readonly string[]; readonly followUp: readonly string[] };
  readonly abort?: () => void;
  readonly emitResponse?: (response: RpcResponse) => void;
  readonly getState?: () => RpcSessionState;
  readonly newSession?: (parentSession?: string) => Promise<{ readonly cancelled: boolean; readonly sessionId?: string }>;
  readonly switchSession?: (sessionPath: string) => Promise<{ readonly cancelled: boolean; readonly sessionId?: string }>;
  readonly setSessionName?: (name: string) => Promise<{ readonly sessionId: string; readonly name: string }>;
  readonly getSessionStats?: () => Record<string, unknown>;
  readonly getLastAssistantText?: () => string | null;
  readonly setModel?: (provider: string, modelId: string) => Promise<Record<string, unknown>>;
  readonly cycleModel?: () => Promise<Record<string, unknown> | null>;
  readonly getAvailableModels?: () => readonly Record<string, unknown>[];
  readonly setThinkingLevel?: (level: string) => Promise<{ readonly level: string }>;
  readonly cycleThinkingLevel?: () => Promise<{ readonly level: string } | null>;
  readonly getAvailableThinkingLevels?: () => readonly string[];
  readonly setSteeringMode?: (mode: RpcQueueMode) => Promise<void> | void;
  readonly setFollowUpMode?: (mode: RpcQueueMode) => Promise<void> | void;
  readonly compact?: (customInstructions?: string) => Promise<CompactionOutcome>;
  readonly setAutoCompaction?: (enabled: boolean) => Promise<void> | void;
  readonly setAutoRetry?: (enabled: boolean) => Promise<void> | void;
  readonly abortRetry?: () => void;
  readonly fork?: (entryId: string) => Promise<{ readonly text?: string; readonly sessionId?: string; readonly cancelled: boolean }>;
  readonly cloneSession?: () => Promise<{ readonly sessionId?: string; readonly cancelled: boolean }>;
  readonly getForkMessages?: () => Promise<readonly { readonly entryId: string; readonly text: string }[]>;
  readonly getEntries?: (since?: string | number) => Promise<Record<string, unknown>>;
  readonly getTree?: () => Promise<Record<string, unknown>>;
  readonly navigateTree?: (entryId: string, expectedVersion?: string) => Promise<SessionNavigationResult>;
  readonly getCommands?: () => readonly Record<string, unknown>[];
  readonly runBash?: (command: string, excludeFromContext?: boolean) => Promise<Record<string, unknown>>;
  readonly abortBash?: () => void;
  readonly ui?: RpcUiBridge;
}

const RPC_COMMAND_TYPES = new Set([
  "prompt", "steer", "follow_up", "abort", "clear_queue", "get_state", "get_messages", "export_html",
  "new_session", "switch_session", "set_session_name", "get_session_stats", "get_last_assistant_text",
  "set_model", "cycle_model", "get_available_models", "set_thinking_level", "cycle_thinking_level",
  "get_available_thinking_levels", "set_steering_mode", "set_follow_up_mode", "compact",
  "set_auto_compaction", "set_auto_retry", "abort_retry", "fork", "clone", "get_fork_messages",
  "get_entries", "get_tree", "navigate_tree", "get_commands", "bash", "abort_bash",
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return isObjectRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseImages(raw: unknown): readonly RpcImageAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const images: RpcImageAttachment[] = [];
  for (const item of raw) {
    if (!isObjectRecord(item)) return undefined;
    if (item.type !== "image" || typeof item.data !== "string" || typeof item.mimeType !== "string") return undefined;
    images.push({ type: "image", data: item.data, mimeType: item.mimeType });
  }
  return images;
}

/** Parse a single JSONL line into an `RpcExtensionUiResponse` if valid. */
export function tryParseRpcUiResponse(line: string): RpcExtensionUiResponse | undefined {
  const parsed = parseJsonLine(line);
  if (!parsed || parsed.type !== "extension_ui_response" || typeof parsed.id !== "string") return undefined;
  if (parsed.cancelled === true) return { type: "extension_ui_response", id: parsed.id, cancelled: true };
  if (typeof parsed.confirmed === "boolean") return { type: "extension_ui_response", id: parsed.id, confirmed: parsed.confirmed };
  if (typeof parsed.value === "string") return { type: "extension_ui_response", id: parsed.id, value: parsed.value };
  return undefined;
}

/** Parse a single JSONL line into a recognized `RpcCommand`. */
export function tryParseRpcCommand(line: string): RpcCommand | undefined {
  const parsed = parseJsonLine(line);
  if (!parsed || typeof parsed.type !== "string" || !RPC_COMMAND_TYPES.has(parsed.type)) return undefined;
  const id = typeof parsed.id === "string" ? parsed.id : undefined;
  const base = id !== undefined ? { id } : {};
  switch (parsed.type) {
    case "prompt": {
      if (typeof parsed.message !== "string") return undefined;
      const images = parsed.images !== undefined ? parseImages(parsed.images) : undefined;
      if (parsed.images !== undefined && !images) return undefined;
      return {
        ...base, type: "prompt", message: parsed.message,
        ...(images ? { images } : {}),
        ...(parsed.streamingBehavior === "steer" || parsed.streamingBehavior === "followUp" ? { streamingBehavior: parsed.streamingBehavior } : {}),
      };
    }
    case "steer":
    case "follow_up": {
      if (typeof parsed.message !== "string") return undefined;
      const images = parsed.images !== undefined ? parseImages(parsed.images) : undefined;
      if (parsed.images !== undefined && !images) return undefined;
      return { ...base, type: parsed.type, message: parsed.message, ...(images ? { images } : {}) };
    }
    case "export_html":
      return { ...base, type: "export_html", ...(typeof parsed.outputPath === "string" ? { outputPath: parsed.outputPath } : {}) };
    case "new_session":
      return { ...base, type: "new_session", ...(typeof parsed.parentSession === "string" ? { parentSession: parsed.parentSession } : {}) };
    case "switch_session":
      return typeof parsed.sessionPath === "string" ? { ...base, type: "switch_session", sessionPath: parsed.sessionPath } : undefined;
    case "set_session_name":
      return typeof parsed.name === "string" ? { ...base, type: "set_session_name", name: parsed.name } : undefined;
    case "set_model":
      return typeof parsed.provider === "string" && typeof parsed.modelId === "string"
        ? { ...base, type: "set_model", provider: parsed.provider, modelId: parsed.modelId } : undefined;
    case "set_thinking_level":
      return typeof parsed.level === "string" ? { ...base, type: "set_thinking_level", level: parsed.level } : undefined;
    case "set_steering_mode":
    case "set_follow_up_mode":
      return parsed.mode === "one-at-a-time" || parsed.mode === "all" ? { ...base, type: parsed.type, mode: parsed.mode } : undefined;
    case "compact":
      return { ...base, type: "compact", ...(typeof parsed.customInstructions === "string" ? { customInstructions: parsed.customInstructions } : {}) };
    case "set_auto_compaction":
    case "set_auto_retry":
      return typeof parsed.enabled === "boolean" ? { ...base, type: parsed.type, enabled: parsed.enabled } : undefined;
    case "fork":
      return typeof parsed.entryId === "string" ? { ...base, type: "fork", entryId: parsed.entryId } : undefined;
    case "get_entries":
      return {
        ...base,
        type: "get_entries",
        ...(typeof parsed.since === "string" || (typeof parsed.since === "number" && Number.isFinite(parsed.since))
          ? { since: parsed.since }
          : {}),
      };
    case "navigate_tree":
      return typeof parsed.entryId === "string"
        ? { ...base, type: "navigate_tree", entryId: parsed.entryId, ...(typeof parsed.expectedVersion === "string" ? { expectedVersion: parsed.expectedVersion } : {}) }
        : undefined;
    case "bash":
      return typeof parsed.command === "string"
        ? { ...base, type: "bash", command: parsed.command, ...(typeof parsed.excludeFromContext === "boolean" ? { excludeFromContext: parsed.excludeFromContext } : {}) }
        : undefined;
    case "abort":
    case "clear_queue":
    case "get_state":
    case "get_messages":
    case "get_session_stats":
    case "get_last_assistant_text":
    case "cycle_model":
    case "get_available_models":
    case "cycle_thinking_level":
    case "get_available_thinking_levels":
    case "abort_retry":
    case "clone":
    case "get_fork_messages":
    case "get_tree":
    case "get_commands":
    case "abort_bash":
      return { ...base, type: parsed.type };
    default:
      return undefined;
  }
}

export function rpcImagesToContent(images?: readonly RpcImageAttachment[]): readonly ImageContent[] | undefined {
  if (!images || images.length === 0) return undefined;
  return images.map(img => ({ type: "image", data: img.data, mimeType: img.mimeType }));
}
