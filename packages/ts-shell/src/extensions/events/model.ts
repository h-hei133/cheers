import type { AgentLifecycleEvent } from '../../core/agent/events.js';
import type { AgentMessage } from '../../core/agent/state.js';
import type { ImageContent } from '../../model-adapters/multimodal.js';

export interface ExtensionInputEvent {
  readonly type: 'input';
  readonly text: string;
  /** Retain the prompt field for callers that used the former hook alias. */
  readonly prompt: string;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly timestamp: string;
  readonly images?: readonly ImageContent[];
  readonly source: 'interactive' | 'rpc' | 'extension' | 'sdk' | 'cli';
  readonly streamingBehavior?: 'steer' | 'followUp';
}

export type ExtensionInputResult =
  | { readonly action: 'continue' }
  | { readonly action: 'handled' }
  | { readonly action: 'transform'; readonly text: string; readonly images?: readonly ImageContent[] };

/** Result of an executed tool. Its outcome and structured evidence are observations. */
export interface ExtensionToolResultEvent {
  readonly type: 'tool_result';
  readonly eventName: 'PostToolUse' | 'PostToolUseFailure';
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly timestamp: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly parentToolCallId?: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly output: string;
  readonly error?: string;
  readonly success: boolean;
  readonly isError: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly hasImages: boolean;
  readonly canReplaceOutput: boolean;
  readonly feedback?: string;
}

export interface ExtensionToolResult {
  /** Presentation text for an admitted plain read-only result. */
  readonly output?: string;
  /** Advice separately attributed to the extension. */
  readonly feedback?: string;
}

/** Kernel notifications carry immutable copies; their return values grant no permissions. */
export type ExtensionRunEvent = AgentLifecycleEvent
  | { readonly type: 'agent_settled'; readonly aborted: boolean };

export type ExtensionRunEventName = ExtensionRunEvent['type'];
export type ExtensionRunEventPayload<Name extends ExtensionRunEventName> = Extract<ExtensionRunEvent, { readonly type: Name }>;

export type ExtensionMessageEndEvent = ExtensionRunEventPayload<'message_end'> & { readonly canReplace?: true };

export interface ExtensionMessageEndResult {
  readonly message?: { readonly role: 'assistant'; readonly content: string };
}

export type ExtensionSessionEvent =
  | { readonly type: 'session_start'; readonly reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork'; readonly sessionId: string; readonly workspaceRoot: string }
  | { readonly type: 'session_shutdown'; readonly reason: 'quit' | 'reload' | 'new' | 'resume' | 'fork'; readonly sessionId: string; readonly workspaceRoot: string }
  | { readonly type: 'session_tree'; readonly sessionId: string; readonly workspaceRoot: string; readonly oldLeafId: string | null; readonly newLeafId: string | null }
  | (ExtensionCompactContext & { readonly type: 'session_compact'; readonly summary: string; readonly fromExtension: boolean });
export type ExtensionSessionEventName = ExtensionSessionEvent['type'];
export type ExtensionSessionEventPayload<Name extends ExtensionSessionEventName> = Extract<ExtensionSessionEvent, { readonly type: Name }>;

export type ExtensionSessionBeforeEvent =
  | { readonly type: 'session_before_tree'; readonly sessionId: string; readonly workspaceRoot: string; readonly targetEntryId: string; readonly oldLeafId: string | null; readonly version: string }
  | { readonly type: 'session_before_switch'; readonly sessionId: string; readonly workspaceRoot: string; readonly reason: 'new' | 'resume'; readonly targetSessionId?: string }
  | { readonly type: 'session_before_fork'; readonly sessionId: string; readonly workspaceRoot: string; readonly entryId?: string }
  | (ExtensionCompactContext & { readonly type: 'session_before_compact'; readonly messageCount: number;
    readonly messages: readonly ExtensionCompactMessage[]; readonly turnPrefix: readonly ExtensionCompactMessage[];
    readonly previousSummary?: string; readonly instructions?: string; readonly truncated: boolean });

interface ExtensionCompactContext {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly timestamp: string;
  readonly reason: 'manual' | 'threshold' | 'overflow';
  readonly tokensBefore: number;
  readonly keptMessages: number;
}

export interface ExtensionCompactMessage {
  readonly role: Exclude<AgentMessage['role'], 'system'>;
  readonly text: string;
}

export interface ExtensionSessionBeforeResult { readonly cancel?: boolean }
export interface ExtensionBeforeCompactResult extends ExtensionSessionBeforeResult { readonly summary?: string }
export interface ExtensionBeforeTreeResult extends ExtensionSessionBeforeResult {
  readonly summary?: { readonly summary: string };
  readonly customInstructions?: string;
  readonly replaceInstructions?: boolean;
}
export type ExtensionSessionBeforeEventName = ExtensionSessionBeforeEvent['type'];
export type ExtensionSessionBeforeEventPayload<Name extends ExtensionSessionBeforeEventName> = Extract<ExtensionSessionBeforeEvent, { readonly type: Name }>;
export type ExtensionSessionBeforeEventResult<Name extends ExtensionSessionBeforeEventName> = Name extends 'session_before_tree' ? ExtensionBeforeTreeResult
  : Name extends 'session_before_compact' ? ExtensionBeforeCompactResult : ExtensionSessionBeforeResult;

const RUN_EVENTS = new Set<string>(['agent_start', 'agent_end', 'agent_settled', 'turn_start', 'turn_end',
  'message_start', 'message_update', 'message_end', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
  'retry_scheduled', 'retry_attempt_start']);

/** These observational callbacks retain the original event for every handler. */
export function isRunEvent(name: string): name is ExtensionRunEventName { return RUN_EVENTS.has(name); }

export function isNotificationEvent(name: string): boolean {
  return isRunEvent(name) || name === 'session_start' || name === 'session_shutdown' || name === 'session_tree' || name === 'session_compact';
}
