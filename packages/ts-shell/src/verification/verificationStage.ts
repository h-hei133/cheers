import type { QueryEvent } from "../core/query/runtime/events.js";
import type { CodingPatchRecord, CodingVerificationSummary } from "../orchestration/types.js";
import {
  planWorkflowVerification,
  projectNotRequestedWorkflowVerification,
  projectSkippedWorkflowVerification,
} from "../orchestration/verificationModule.js";
import type { CodingResultProvenanceCollector } from "../orchestration/toolRuntimeModule.js";
import type { CodingTaskKind } from "../orchestration/types.js";
import type { WorkflowActionGraph } from "../planning/action/graph.js";
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
  readonly actionGraph?: WorkflowActionGraph;
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
  const changedFiles = uniquePaths([
    ...input.changedFiles,
    ...(input.actionGraph?.changedFileIntents ?? []),
  ]);
  const verificationPlan = planWorkflowVerification({
    taskKind: input.taskKind,
    prompt: input.prompt,
    changedFiles,
    explicitVerifyRequested: input.explicitVerifyRequested,
    explicitVerifyCommand: input.explicitVerifyRequested
      ? input.explicitVerifyCommand
      : undefined,
  });

  if (verificationPlan.mode === "low-risk") {
    const result = await runLowRiskVerificationStage({
      ...input,
      changedFiles,
    });
    return {
      ...result,
      evidence: [
        ...result.evidence,
        ...actionGraphVerificationEvidence(input.actionGraph),
      ],
    };
  }

  if (verificationPlan.mode === "command" && verificationPlan.command) {
    const result = await runCommandVerificationStage({
      plan: {
        ...verificationPlan,
        mode: "command",
        command: verificationPlan.command,
      },
      changedFiles,
      targetPath: input.targetPath,
      dispatcher: input.dispatcher,
      events: input.events,
      sessionId: input.sessionId,
      turn: input.turn,
      workspaceRoot: input.workspaceRoot,
      abortSignal: input.abortSignal,
      provenanceCollector: input.provenanceCollector,
    });
    return {
      ...result,
      evidence: [
        ...result.evidence,
        ...actionGraphVerificationEvidence(input.actionGraph),
      ],
    };
  }

  if (
    verificationPlan.mode === "skipped" ||
    verificationPlan.mode === "unavailable"
  ) {
    const verification = projectSkippedWorkflowVerification(verificationPlan);
    return {
      verification,
      verifiedFiles: [],
      unverifiedFiles: changedFiles.map((path) => ({
        path,
        reason: verification.reason ?? "verification skipped",
      })),
      repairNotes: [],
      notes: [`verify skipped: ${verification.reason ?? "not available"}`],
      evidence: actionGraphVerificationEvidence(input.actionGraph),
    };
  }

  if (changedFiles.length > 0) {
    return {
      verification: projectNotRequestedWorkflowVerification(verificationPlan),
      verifiedFiles: [],
      unverifiedFiles: changedFiles.map((path) => ({
        path,
        reason: "verify step was not requested in prompt",
      })),
      repairNotes: [],
      notes: [],
      evidence: actionGraphVerificationEvidence(input.actionGraph),
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

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = path.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function actionGraphVerificationEvidence(
  actionGraph: WorkflowActionGraph | undefined,
): string[] {
  if (!actionGraph) {
    return [];
  }
  return [
    `workflow-verification-action-graph:${actionGraph.graphId}`,
    `workflow-verification-changed-file-intents:${actionGraph.changedFileIntents.join(",") || "none"}`,
    ...actionGraph.dependencyReasons.map((reason) =>
      `workflow-verification-dependency:${reason}`
    ),
  ];
}
