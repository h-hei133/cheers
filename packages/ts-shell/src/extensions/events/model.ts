import type { AgentLifecycleEvent } from '../../core/agent/events.js';

/** Kernel notifications carry immutable copies; their return values grant no permissions. */
export type ExtensionRunEvent = AgentLifecycleEvent
  | { readonly type: 'agent_settled'; readonly aborted: boolean };

export type ExtensionRunEventName = ExtensionRunEvent['type'];
export type ExtensionRunEventPayload<Name extends ExtensionRunEventName> = Extract<ExtensionRunEvent, { readonly type: Name }>;

export type ExtensionSessionEvent =
  | { readonly type: 'session_start'; readonly reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork'; readonly sessionId: string; readonly workspaceRoot: string }
  | { readonly type: 'session_shutdown'; readonly reason: 'quit' | 'reload' | 'new' | 'resume' | 'fork'; readonly sessionId: string; readonly workspaceRoot: string };
export type ExtensionSessionEventName = ExtensionSessionEvent['type'];
export type ExtensionSessionEventPayload<Name extends ExtensionSessionEventName> = Extract<ExtensionSessionEvent, { readonly type: Name }>;

const RUN_EVENTS = new Set<string>(['agent_start', 'agent_end', 'agent_settled', 'turn_start', 'turn_end',
  'message_start', 'message_update', 'message_end', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
  'retry_scheduled', 'retry_attempt_start']);

/** These observational callbacks retain the original event for every handler. */
export function isRunEvent(name: string): name is ExtensionRunEventName { return RUN_EVENTS.has(name); }

export function isNotificationEvent(name: string): boolean { return isRunEvent(name) || name === 'session_start' || name === 'session_shutdown'; }
