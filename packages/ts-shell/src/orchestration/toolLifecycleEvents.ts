import type { QueryEvent } from "../core/query/events.js";
import { deriveApprovalDecisionProvenance } from "../core/tools/approvalProvenance.js";

export interface ToolLifecycleEventIdentity {
  readonly toolName: string;
  readonly taskId: string;
}

export interface ToolLifecycleOutcomeLike {
  readonly success: boolean;
  readonly metadata?: Record<string, unknown>;
}

export function appendApprovalRequestedEvent(
  events: QueryEvent[],
  identity: ToolLifecycleEventIdentity,
): void {
  events.push({
    type: "approval.requested",
    toolName: identity.toolName,
    taskId: identity.taskId,
  });
}

export function appendToolStartedEvent(
  events: QueryEvent[],
  identity: ToolLifecycleEventIdentity,
): void {
  events.push({
    type: "tool.started",
    toolName: identity.toolName,
    taskId: identity.taskId,
  });
}

export function appendApprovalResolvedEvent(
  events: QueryEvent[],
  identity: ToolLifecycleEventIdentity,
  result: ToolLifecycleOutcomeLike,
): void {
  events.push({
    type: "approval.resolved",
    toolName: identity.toolName,
    taskId: identity.taskId,
    outcome: resolveApprovalOutcomeFromToolResult(result),
  });
}

export function appendToolResultEvent(
  events: QueryEvent[],
  identity: ToolLifecycleEventIdentity,
  result: ToolLifecycleOutcomeLike,
): void {
  events.push({
    type: "tool.result",
    toolName: identity.toolName,
    taskId: identity.taskId,
    success: result.success,
  });
}

export function resolveApprovalOutcomeFromToolResult(
  result: ToolLifecycleOutcomeLike,
): "approved" | "denied" {
  return deriveApprovalDecisionProvenance(result).legacyOutcome;
}
