import {
  blockedCommandReason,
  detectCommand,
  detectUnsupportedCommandIntent,
  isAllowlistedRunCommand,
} from "../orchestration/capabilityBoundaryProjection.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

export function detectUnsupportedCommandForPlanning(
  normalizedPrompt: string,
): string | undefined {
  return detectUnsupportedCommandIntent(normalizedPrompt) ?? undefined;
}

export function buildCommandIntentPlan(input: {
  readonly normalizedPrompt: string;
  readonly hasExecutionIntent: boolean;
  readonly unsupportedCommand?: string;
  readonly usedRestoredState: boolean;
}): WorkflowTaskPlan | undefined {
  if (!input.hasExecutionIntent) {
    return undefined;
  }
  if (input.unsupportedCommand) {
    return {
      taskKind: "run-command",
      reason: "execution intent outside allowlist",
      inspectFirst: false,
      verifyAfterEdit: false,
      directCommand: input.unsupportedCommand,
      blockedReason: blockedCommandReason(input.unsupportedCommand),
      usedRestoredState: input.usedRestoredState,
    };
  }
  const command = detectCommand(input.normalizedPrompt);
  return {
    taskKind: "run-command",
    reason: "explicit run-command intent",
    inspectFirst: false,
    verifyAfterEdit: false,
    directCommand: command,
    ...(isAllowlistedRunCommand(command)
      ? {}
      : { blockedReason: blockedCommandReason(command) }),
    usedRestoredState: input.usedRestoredState,
  };
}
