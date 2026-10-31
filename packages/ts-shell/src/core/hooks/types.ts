/**
 * Lifecycle Hook Event Types & Contracts
 */

export type HookEventName =
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
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

export interface SessionStartPayload extends BaseHookEventPayload {
  readonly eventName: "SessionStart";
  readonly resumed: boolean;
}

export interface SessionEndPayload extends BaseHookEventPayload {
  readonly eventName: "SessionEnd";
  readonly turnsExecuted: number;
}

export interface PermissionRequestPayload extends BaseHookEventPayload {
  readonly eventName: "PermissionRequest";
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: Record<string, unknown>;
}

export interface PermissionDeniedPayload extends BaseHookEventPayload {
  readonly eventName: "PermissionDenied";
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: Record<string, unknown>;
  readonly reason: string;
}

export interface PreCompactPayload extends BaseHookEventPayload {
  readonly eventName: "PreCompact";
  readonly reason: "manual" | "threshold" | "overflow";
  readonly tokensBefore: number;
  readonly messageCount: number;
}

export interface PostCompactPayload extends BaseHookEventPayload {
  readonly eventName: "PostCompact";
  readonly reason: "manual" | "threshold" | "overflow";
  readonly summary: string;
  readonly keptMessages: number;
  readonly tokensBefore: number;
}

export interface StopFailurePayload extends BaseHookEventPayload {
  readonly eventName: "StopFailure";
  readonly turnsExecuted: number;
  readonly error: string;
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
  | SessionStartPayload
  | SessionEndPayload
  | PermissionRequestPayload
  | PermissionDeniedPayload
  | PreCompactPayload
  | PostCompactPayload
  | StopFailurePayload
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
  /**
   * Identity of what this hook will do, when it came from a configuration file.
   *
   * Present means "this command is asking for permission": the dispatcher checks
   * it against what the user has approved before running anything, and asks when
   * there is no answer yet. Absent means the hook was registered by this process
   * rather than read from a file, and runs as before.
   */
  readonly fingerprint?: string;
  /** Where it was declared, so the approval prompt can name the source. */
  readonly sourcePath?: string;
}

export interface HooksConfiguration {
  readonly commandHooks?: readonly CommandHookConfig[];
  readonly inProcessHooks?: readonly InProcessHookConfig[];
}

/**
 * How the dispatcher asks whether one declared command may run.
 *
 * Declared here rather than beside either user so the two do not import each
 * other: the registration step supplies one, the dispatcher calls it, and neither
 * has to know about the other to describe it.
 */
/**
 * A hook approval that was granted without asking.
 *
 * Recorded so the exemption is visible in the tool output rather than silent: the
 * point of an escape hatch is that it is deliberate and can be seen being used,
 * and one that runs quietly is indistinguishable from the gate being broken.
 */
export const HOOK_TRUST_BYPASS_NOTICE =
  "HOOK TRUST BYPASSED: declared hook commands are running without approval because this run was started with --dangerously-bypass-hook-trust. Only do this in a repository you already trust.";

/**
 * What the user decided about running a declared hook.
 *
 * `allow-once` and `allow-always` are separate answers: the prompt offers both,
 * and only the second may be remembered. Collapsing them to a boolean is what
 * made "Run it for this session" permanent.
 */
export type HookApprovalDecision = "allow-once" | "allow-always" | "deny";

/**
 * How an approval answer becomes a hook decision.
 *
 * Lives here because two callers ask the same question — the interactive run and
 * the git gate — and they must answer it the same way. A caller that collapsed
 * the answer to a boolean would lose "remember", and the user would be asked
 * again for a grant they already gave.
 *
 * The older boolean shape is one-shot on purpose: it predates the distinction
 * between the two promises, so the only safe reading of `true` is "this time".
 */
export function hookApprovalDecision(
  decision: "allow" | "deny" | "allow-once" | "allow-always",
): HookApprovalDecision {
  if (decision === "allow-always") return "allow-always";
  if (decision === "allow" || decision === "allow-once") return "allow-once";
  return "deny";
}

export type HookApprovalRequest = (request: {
  readonly command: string;
  readonly event: string;
  readonly matcher?: string;
  readonly sourcePath: string;
}) => Promise<HookApprovalDecision | boolean>;
