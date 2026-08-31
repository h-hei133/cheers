/**
 * Lifecycle Hook Event Types & Contracts
 */

export type HookEventName =
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "UserPromptExpansion"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PostToolBatch"
  | "PermissionRequest"
  | "PermissionDenied"
  | "PreModelSwitch"
  | "PostModelSwitch"
  | "PreCompact"
  | "PostCompact"
  | "SubagentStart"
  | "SubagentStop"
  | "WorktreeCreate"
  | "WorktreeRemove"
  | "TaskCreated"
  | "TaskCompleted"
  | "Stop"
  | "StopFailure";

export type HookDecisionKind = "allow" | "block" | "retry" | "ask" | "defer";

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
  readonly agentId?: string;
  readonly agentType?: string;
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

export interface PreModelSwitchPayload extends BaseHookEventPayload {
  readonly eventName: "PreModelSwitch";
  readonly fromModel: string;
  readonly toModel: string;
}

export interface PostModelSwitchPayload extends BaseHookEventPayload {
  readonly eventName: "PostModelSwitch";
  readonly fromModel: string;
  readonly toModel: string;
}

export interface WorktreeCreatePayload extends BaseHookEventPayload {
  readonly eventName: "WorktreeCreate";
  readonly subtaskId: string;
  readonly worktreePath: string;
  readonly branch: string;
}

export interface WorktreeRemovePayload extends BaseHookEventPayload {
  readonly eventName: "WorktreeRemove";
  readonly subtaskId: string;
  readonly worktreePath: string;
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
  | PreModelSwitchPayload
  | PostModelSwitchPayload
  | WorktreeCreatePayload
  | WorktreeRemovePayload
  | StopPayload
  | BaseHookEventPayload;

export interface InProcessHookConfig {
  readonly name?: string;
  readonly description?: string;
  readonly event: HookEventName;
  readonly matcher?: string;
  readonly handler: (payload: HookEventPayload) => Promise<HookDecision | null | void> | HookDecision | null | void;
}

export interface CommandHookConfig {
  readonly name?: string;
  readonly description?: string;
  readonly event: HookEventName;
  readonly matcher?: string;
  readonly command: string;
  readonly timeoutMs?: number;
}

export interface HooksConfiguration {
  readonly commandHooks?: readonly CommandHookConfig[];
  readonly inProcessHooks?: readonly InProcessHookConfig[];
}
