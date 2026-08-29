/**
 * Claude Code Aligned Lifecycle Hook Event Types & Contracts
 */

export type HookEventName =
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PostToolBatch"
  | "Stop"
  | "StopFailure";

export type HookDecisionKind = "allow" | "block" | "retry";

export interface HookDecision {
  readonly decision: HookDecisionKind;
  readonly reason?: string;
  readonly feedback?: string;
  readonly hookSpecificOutput?: Record<string, unknown>;
}

export interface BaseHookEventPayload {
  readonly eventName: HookEventName;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly timestamp: string;
}

export interface UserPromptSubmitPayload extends BaseHookEventPayload {
  readonly eventName: "UserPromptSubmit";
  readonly prompt: string;
}

export interface PreToolUsePayload extends BaseHookEventPayload {
  readonly eventName: "PreToolUse";
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: Record<string, unknown>;
}

export interface PostToolUsePayload extends BaseHookEventPayload {
  readonly eventName: "PostToolUse";
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: Record<string, unknown>;
  readonly output: string;
  readonly success: boolean;
}

export interface PostToolUseFailurePayload extends BaseHookEventPayload {
  readonly eventName: "PostToolUseFailure";
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: Record<string, unknown>;
  readonly error: string;
}

export interface StopPayload extends BaseHookEventPayload {
  readonly eventName: "Stop";
  readonly turnsExecuted: number;
  readonly finalOutput: string;
}

export type HookEventPayload =
  | UserPromptSubmitPayload
  | PreToolUsePayload
  | PostToolUsePayload
  | PostToolUseFailurePayload
  | StopPayload
  | BaseHookEventPayload;

export interface CommandHookConfig {
  readonly event: HookEventName;
  readonly matcher?: string; // Regex to match toolName or prompt
  readonly command: string;
  readonly description?: string;
  readonly timeoutMs?: number;
}

export type InProcessHookHandler = (
  payload: HookEventPayload,
) => Promise<HookDecision | null> | HookDecision | null;

export interface InProcessHookConfig {
  readonly event: HookEventName;
  readonly name: string;
  readonly matcher?: string;
  readonly handler: InProcessHookHandler;
  readonly description?: string;
}

export interface HooksConfiguration {
  readonly commandHooks?: readonly CommandHookConfig[];
  readonly inProcessHooks?: readonly InProcessHookConfig[];
}
