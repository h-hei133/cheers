import type { QueryEvent } from "../core/query/runtime/events.js";
import type { CodingPatchRecord, CodingVerificationSummary } from "../orchestration/types.js";
import {
  planWorkflowVerification,
  projectNotRequestedWorkflowVerification,
  projectSkippedWorkflowVerification,
} from "../orchestration/verificationModule.js";
import type { CodingResultProvenanceCollector } from "../orchestration/toolRuntimeModule.js";
import type { CodingTaskKind } from "../orchestration/types.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import { runCommandVerificationStage } from "./command/verificationStage.js";
import { runLowRiskVerificationStage } from "./command/lowRisk.js";

export interface WorkflowVerificationStageResult {
  readonly verification: CodingVerificationSummary;
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly notes: readonly string[];
  readonly repairNotes: readonly string[];
  readonly evidence: readonly string[];
}

export async function runWorkflowVerificationStage(input: {
  readonly taskKind: CodingTaskKind;
  readonly prompt: string;
  readonly targetPath?: string;
  readonly changedFiles: readonly string[];
  readonly explicitVerifyRequested: boolean;
  readonly explicitVerifyCommand?: string;
  readonly initialVerification: CodingVerificationSummary;
  readonly unchangedAssertions: ReadonlyArray<{ path: string }>;
  readonly appliedContentByPath: ReadonlyMap<string, string>;
  readonly protectedSnapshots: ReadonlyMap<string, string>;
  readonly patches: readonly CodingPatchRecord[];
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
  readonly provenanceCollector: CodingResultProvenanceCollector;
}): Promise<WorkflowVerificationStageResult> {
  const verificationPlan = planWorkflowVerification({
    taskKind: input.taskKind,
    prompt: input.prompt,
    changedFiles: input.changedFiles,
    explicitVerifyRequested: input.explicitVerifyRequested,
    explicitVerifyCommand: input.explicitVerifyRequested
      ? input.explicitVerifyCommand
      : undefined,
  });

  if (verificationPlan.mode === "low-risk") {
    return runLowRiskVerificationStage(input);
  }

  if (verificationPlan.mode === "command" && verificationPlan.command) {
    return runCommandVerificationStage({
      plan: {
        ...verificationPlan,
        mode: "command",
        command: verificationPlan.command,
      },
      changedFiles: input.changedFiles,
      targetPath: input.targetPath,
      dispatcher: input.dispatcher,
      events: input.events,
      sessionId: input.sessionId,
      turn: input.turn,
      workspaceRoot: input.workspaceRoot,
      abortSignal: input.abortSignal,
      provenanceCollector: input.provenanceCollector,
    });
  }

  if (
    verificationPlan.mode === "skipped" ||
    verificationPlan.mode === "unavailable"
  ) {
    const verification = projectSkippedWorkflowVerification(verificationPlan);
    return {
      verification,
      verifiedFiles: [],
      unverifiedFiles: input.changedFiles.map((path) => ({
        path,
        reason: verification.reason ?? "verification skipped",
      })),
      repairNotes: [],
      notes: [`verify skipped: ${verification.reason ?? "not available"}`],
      evidence: [],
    };
  }

  if (input.changedFiles.length > 0) {
    return {
      verification: projectNotRequestedWorkflowVerification(verificationPlan),
      verifiedFiles: [],
      unverifiedFiles: input.changedFiles.map((path) => ({
        path,
        reason: "verify step was not requested in prompt",
      })),
      repairNotes: [],
      notes: [],
      evidence: [],
    };
  }

  return {
    verification: input.initialVerification,
    verifiedFiles: [],
    unverifiedFiles: [],
    repairNotes: [],
    notes: [],
    evidence: [],
  };
}
