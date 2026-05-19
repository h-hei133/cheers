import type { QueryEvent } from "../core/query/events.js";
import { buildCompletedToolResult } from "../core/tools/toolPolicyResult.js";
import { projectToolLifecycle } from "../core/tools/toolLifecycleProjection.js";
import type { ToolLifecycleProjection } from "../core/tools/toolLifecycleProjection.js";
import { sanitizeToolResultText } from "../core/tools/toolResultProjection.js";
import type { ToolExecutionResult } from "../tools/types.js";
import {
  createCodingResultProvenanceCollector,
  recordToolLifecycleProvenance,
  summarizeCodingResultProvenance,
  type CodingResultProvenanceCollector,
} from "./codingResultProvenance.js";
import {
  projectRuntimeCodingOutcome,
  projectRuntimeMutationOutcome,
} from "./runtimeOutcomeProjection.js";
import type { RuntimeOutcomeProjection } from "./runtimeOutcomeProjection.js";
import {
  appendApprovalRequestedEvent,
  appendApprovalResolvedEvent,
  appendToolResultEvent,
  appendToolStartedEvent,
} from "./toolLifecycleEvents.js";
import type {
  CodingPatchRecord,
  CodingResultProvenanceSummary,
  CodingVerificationSummary,
  TerminalReason,
} from "./types.js";

export interface ToolDispatchRuntime {
  dispatch(
    toolName: string,
    args: Record<string, unknown>,
    context: {
      readonly taskId: string;
      readonly workspaceRoot: string;
      readonly sessionId: string;
      readonly abortSignal?: AbortSignal;
    },
  ): Promise<ToolExecutionResult>;
}

export interface ToolLifecycleResult {
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
  readonly projection: ToolLifecycleProjection;
  readonly provenance?: CodingResultProvenanceSummary;
}

export async function dispatchToolWithLifecycle(input: {
  readonly dispatcher: ToolDispatchRuntime;
  readonly events: QueryEvent[];
  readonly toolName: string;
  readonly taskId: string;
  readonly args: Record<string, unknown>;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly abortSignal?: AbortSignal;
  readonly requireApprovalEvent: boolean;
  readonly provenanceCollector?: CodingResultProvenanceCollector;
}): Promise<ToolLifecycleResult> {
  const identity = {
    toolName: input.toolName,
    taskId: input.taskId,
  };
  if (input.requireApprovalEvent) {
    appendApprovalRequestedEvent(input.events, identity);
  }
  appendToolStartedEvent(input.events, identity);
  const result = await input.dispatcher.dispatch(input.toolName, input.args, {
    taskId: input.taskId,
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    abortSignal: input.abortSignal,
  });
  if (input.requireApprovalEvent) {
    appendApprovalResolvedEvent(input.events, identity, result);
  }
  appendToolResultEvent(input.events, identity, result);
  if (input.provenanceCollector) {
    recordToolLifecycleProvenance(input.provenanceCollector, {
      ...identity,
      result,
      requireApprovalEvent: input.requireApprovalEvent,
    });
  }
  const provenance = input.provenanceCollector
    ? summarizeCodingResultProvenance(input.provenanceCollector)
    : undefined;
  const projection = projectToolLifecycle({
    toolName: input.toolName,
    success: result.success,
    output: result.output,
    error: result.error,
    metadata: result.metadata,
    requireApprovalEvent: input.requireApprovalEvent,
  });
  return {
    success: result.success,
    output: result.output,
    error: result.error,
    metadata: result.metadata,
    projection,
    ...(provenance ? { provenance } : {}),
  };
}

export function createDispatchProvenanceCollector(): CodingResultProvenanceCollector {
  return createCodingResultProvenanceCollector();
}

export function projectRunCommandDispatchOutcome(input: {
  readonly command: string;
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly verification: CodingVerificationSummary;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly provenance?: CodingResultProvenanceSummary;
}): RuntimeOutcomeProjection {
  const taskSatisfied =
    input.verification.status === "passed" && input.failedFiles.length === 0;
  if (!taskSatisfied) {
    return projectRuntimeMutationOutcome({
      taskKind: "run-command",
      changedFiles: input.changedFiles,
      failedFiles: input.failedFiles,
      patches: input.patches,
      verifiedFiles: input.verifiedFiles,
      unverifiedFiles: input.unverifiedFiles,
      verification: input.verification,
      repairNotes: input.repairNotes,
      evidence: input.evidence,
      degradedCrossFileTargets: [],
      crossFileRemainingTargets: [],
      crossFileFailedByReason: [],
      crossFileSkippedFiles: [],
      provenance: input.provenance,
    });
  }

  const receipt = buildCompletedToolResult({
    capability: "command",
    reasonCode: "tool-succeeded",
    reason: `Command executed successfully: ${input.command}`,
    doNext: "Continue with the command result.",
    evidence: input.evidence,
  });

  return projectRuntimeCodingOutcome({
    taskKind: "run-command",
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles,
    patches: input.patches,
    verifiedFiles: input.verifiedFiles,
    unverifiedFiles: input.unverifiedFiles,
    verification: input.verification,
    repairNotes: input.repairNotes,
    evidence: input.evidence,
    taskVerdict: "satisfied",
    taskReasons: [receipt.reason],
    userFacingOutput: `Command completed: ${input.command}`,
  });
}

export type DispatchReentryState =
  | "approval-pending"
  | "approved"
  | "approval-denied"
  | "stopped"
  | "streamed-result";

export interface DispatchReentrySummary {
  readonly state: DispatchReentryState;
  readonly reasonCode: string;
  readonly doNext: string;
  readonly resumeEligible: boolean;
  readonly safeSummary: string;
}

export function projectDispatchReentrySummary(input: {
  readonly toolName: string;
  readonly taskId: string;
  readonly approvalState: "not-required" | "requested" | "approved" | "denied";
  readonly result?: ToolLifecycleResult;
  readonly terminalReason?: TerminalReason;
  readonly finalOutput?: string;
}): DispatchReentrySummary {
  if (input.terminalReason === "completed") {
    return {
      state: "streamed-result",
      reasonCode: "terminal-completed",
      doNext: "continue-with-final-result",
      resumeEligible: false,
      safeSummary: safeText(input.finalOutput ?? "streamed result completed"),
    };
  }

  if (!input.result && input.approvalState === "requested") {
    return {
      state: "approval-pending",
      reasonCode: "approval-requested",
      doNext: "wait-for-approval-decision",
      resumeEligible: true,
      safeSummary: `${input.toolName}:${input.taskId}:approval-pending`,
    };
  }

  if (
    input.approvalState === "denied" ||
    input.result?.projection.kind === "approval-denied"
  ) {
    return {
      state: "approval-denied",
      reasonCode: "approval-denied",
      doNext:
        input.result?.projection.nextAction ??
        "Re-run and approve the requested tool if it is still needed.",
      resumeEligible: true,
      safeSummary: safeText(
        input.result?.projection.reason ?? "approval denied",
      ),
    };
  }

  if (input.result?.success) {
    return {
      state: "approved",
      reasonCode: "tool-succeeded",
      doNext: "continue-with-tool-result",
      resumeEligible: false,
      safeSummary: `${input.toolName}:${input.taskId}:success`,
    };
  }

  return {
    state: "stopped",
    reasonCode: input.result?.projection.kind ?? "tool-not-dispatched",
    doNext:
      input.result?.projection.nextAction ??
      "Inspect the tool result, then retry with a narrower request.",
    resumeEligible: true,
    safeSummary: safeText(
      input.result?.projection.reason ??
        input.result?.error ??
        "tool dispatch stopped",
    ),
  };
}

function safeText(value: string): string {
  return sanitizeToolResultText(value, 240);
}
