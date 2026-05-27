import type { QueryEvent } from "../core/query/events.js";
import type { CodingResultSummary } from "../orchestration/types.js";
import {
  activateTaskLifecycle,
  formatTaskLifecycleActivationOutput,
} from "../orchestration/taskLifecycleActivation.js";
import {
  runAnchoredProposalRuntime,
  shouldActivateAnchoredProposalRuntimePrompt,
} from "../orchestration/anchoredProposalRuntime.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { readWorkspaceFileMap } from "../edit/workspaceReadPolicy.js";

export interface AnchoredProposalStageResult {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
}

export async function runAnchoredProposalStage(input: {
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly workflowPlan: WorkflowTaskPlan;
  readonly providerMode: "synthetic" | "real";
  readonly sessionId: string;
  readonly turn: number;
  readonly events: QueryEvent[];
  readonly baseNotes: readonly string[];
}): Promise<AnchoredProposalStageResult | undefined> {
  const activation = await activateTaskLifecycle({
    workspaceRoot: input.workspaceRoot,
    prompt: input.prompt,
    workflowPlan: input.workflowPlan,
  });
  if (!activation) {
    return undefined;
  }

  if (
    input.providerMode === "synthetic" &&
    shouldActivateAnchoredProposalRuntimePrompt(input.prompt)
  ) {
    const anchoredRuntime = await runAnchoredProposalRuntime({
      requestId: `runmvp-${input.sessionId}-${input.turn}`,
      sessionId: input.sessionId,
      prompt: input.prompt,
      taskActivation: activation,
      dryRunMode: "fake",
      currentContentByTargetLabel: readWorkspaceFileMap({
        workspaceRoot: input.workspaceRoot,
        targetPath: input.workflowPlan.targetPath,
        targetLabel: activation.contextBundle?.packet.targetSafeLabel,
      }),
      inWorkspaceTargetLabels: activation.contextBundle
        ? [activation.contextBundle.packet.targetSafeLabel]
        : [],
    });
    return {
      events: input.events,
      notes: [
        ...input.baseNotes,
        ...activation.notes,
        anchoredRuntime.evalResult.replaySafeSummary,
        anchoredRuntime.scorecard.replaySafeSummary,
        anchoredRuntime.harnessTrace.replaySafeSummary,
        anchoredRuntime.harnessScorecard.replaySafeSummary,
        ...anchoredRuntime.evidence,
      ],
      codingResult: anchoredRuntime.orchestrationResult?.codingResult ?? {
        ...activation.runtimeOutcome.codingResult,
        evidence: [...anchoredRuntime.evidence],
        continuation: {
          ...activation.runtimeOutcome.codingResult.continuation,
          evidence: [...anchoredRuntime.evidence],
        },
        taskSatisfaction: {
          ...activation.runtimeOutcome.codingResult.taskSatisfaction,
          observedEvidence: [...anchoredRuntime.evidence],
        },
      },
      userFacingOutput: anchoredRuntime.output,
    };
  }

  return {
    events: input.events,
    notes: [
      ...input.baseNotes,
      ...activation.notes,
    ],
    codingResult: activation.runtimeOutcome.codingResult,
    userFacingOutput: formatTaskLifecycleActivationOutput({
      activation,
      baseOutput: activation.contextBundle
        ? [
            activation.contextBundle.packetResult.output,
            "",
            activation.contextBundle.graphResult.output,
          ].join("\n")
        : undefined,
    }),
  };
}
