import type { EscalationPrompt } from "../../core/shell/approval/contract.js";

/**
 * How much a turn may do before it has to ask.
 *
 * This is a separate axis from the agent mode: planning versus building is about
 * what the turn is *for*, while this is about what it is *allowed to do without
 * being asked*. Folding the two into one cycle is how a user ends up two presses
 * away from unattended writes while thinking they only changed how the agent
 * reasons — so they are kept apart, each with its own key and its own indicator.
 *
 * A scope never grants anything permanently and never widens what the sandbox
 * allows: it only answers the prompt the sandbox raised, and every such answer is
 * attributed to the scope in the audit trail rather than to the user.
 */

export type PermissionScope = "ask" | "accept-edits" | "allow-all";

export const PERMISSION_SCOPES: readonly PermissionScope[] = ["ask", "accept-edits", "allow-all"];

const SCOPE_LABELS: Record<PermissionScope, string> = {
  ask: "ask",
  "accept-edits": "accept edits",
  "allow-all": "allow all",
};

const SCOPE_MEANING: Record<PermissionScope, string> = {
  ask: "every escalation is put to you",
  "accept-edits": "project edits are pre-approved; commands, network and exact patch group selection still ask",
  "allow-all": "ordinary approvals are pre-approved; exact patch group selection still asks",
};

/** Operations that are an edit to the project rather than an act on the system. */
const EDIT_OPERATIONS = new Set(["read", "write", "delete"]);

/** The next scope in the cycle, so one key can walk all of them. */
export function nextScope(current: PermissionScope): PermissionScope {
  const index = PERMISSION_SCOPES.indexOf(current);
  return PERMISSION_SCOPES[(index + 1) % PERMISSION_SCOPES.length]!;
}

export function scopeLabel(scope: PermissionScope): string {
  return SCOPE_LABELS[scope];
}

export function scopeMeaning(scope: PermissionScope): string {
  return SCOPE_MEANING[scope];
}

/**
 * The answer the scope gives to one escalation, or undefined when the scope has
 * nothing to say and the user must be asked.
 *
 * `accept-edits` deliberately does not cover a process spawn: "accept the edits"
 * is a statement about files, and reading it as permission to run commands would
 * be the widest possible reading of the narrowest words.
 */
export function scopeAnswer(
  scope: PermissionScope,
  prompt: EscalationPrompt,
): "allow-once" | undefined {
  if (scope === "allow-all") return "allow-once";
  if (scope !== "accept-edits") return undefined;
  return EDIT_OPERATIONS.has(prompt.context.operation) ? "allow-once" : undefined;
}
