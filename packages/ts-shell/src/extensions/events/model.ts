import type { AgentLifecycleEvent } from '../../core/agent/events.js';

/** Kernel notifications carry immutable copies; their return values grant no permissions. */
export type ExtensionRunEvent = AgentLifecycleEvent
  | { readonly type: 'agent_settled'; readonly aborted: boolean };

export type ExtensionRunEventName = ExtensionRunEvent['type'];
export type ExtensionRunEventPayload<Name extends ExtensionRunEventName> = Extract<ExtensionRunEvent, { readonly type: Name }>;

export type ExtensionSessionEvent =
  | { readonly type: 'session_start'; readonly reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork'; readonly sessionId: string; readonly workspaceRoot: string }
  | { readonly type: 'session_shutdown'; readonly reason: 'quit' | 'reload' | 'new' | 'resume' | 'fork'; readonly sessionId: string; readonly workspaceRoot: string }
  | { readonly type: 'session_tree'; readonly sessionId: string; readonly workspaceRoot: string; readonly oldLeafId: string | null; readonly newLeafId: string | null };
export type ExtensionSessionEventName = ExtensionSessionEvent['type'];
export type ExtensionSessionEventPayload<Name extends ExtensionSessionEventName> = Extract<ExtensionSessionEvent, { readonly type: Name }>;

export type ExtensionSessionBeforeEvent =
  | { readonly type: 'session_before_tree'; readonly sessionId: string; readonly workspaceRoot: string; readonly targetEntryId: string; readonly oldLeafId: string | null; readonly version: string }
  | { readonly type: 'session_before_switch'; readonly sessionId: string; readonly workspaceRoot: string; readonly reason: 'new' | 'resume'; readonly targetSessionId?: string }
  | { readonly type: 'session_before_fork'; readonly sessionId: string; readonly workspaceRoot: string; readonly entryId?: string };
export interface ExtensionSessionBeforeResult { readonly cancel?: boolean }
export interface ExtensionBeforeTreeResult extends ExtensionSessionBeforeResult {
  readonly summary?: { readonly summary: string };
  readonly customInstructions?: string;
  readonly replaceInstructions?: boolean;
}
export type ExtensionSessionBeforeEventName = ExtensionSessionBeforeEvent['type'];
export type ExtensionSessionBeforeEventPayload<Name extends ExtensionSessionBeforeEventName> = Extract<ExtensionSessionBeforeEvent, { readonly type: Name }>;
export type ExtensionSessionBeforeEventResult<Name extends ExtensionSessionBeforeEventName> = Name extends 'session_before_tree' ? ExtensionBeforeTreeResult : ExtensionSessionBeforeResult;

const RUN_EVENTS = new Set<string>(['agent_start', 'agent_end', 'agent_settled', 'turn_start', 'turn_end',
  'message_start', 'message_update', 'message_end', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
  'retry_scheduled', 'retry_attempt_start']);

/** These observational callbacks retain the original event for every handler. */
export function isRunEvent(name: string): name is ExtensionRunEventName { return RUN_EVENTS.has(name); }

export function isNotificationEvent(name: string): boolean { return isRunEvent(name) || name === 'session_start' || name === 'session_shutdown' || name === 'session_tree'; }
