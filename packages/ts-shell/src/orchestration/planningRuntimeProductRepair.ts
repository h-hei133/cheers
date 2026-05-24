import type { PlanningMutationProofRoute } from "./planningMutationProofRoute.js";
import type { PlanningRuntimeProductVerificationCommandRun } from "./planningRuntimeProductVerification.js";
import {
  runVerificationRepairLoop,
  type VerificationRepairLoopRun,
} from "./verificationRepairLoop.js";

export type PlanningRuntimeProductRepairStatus =
  | "not-needed"
  | "repair-continuation-created";

export interface PlanningRuntimeProductRepairContinuation {
  readonly status: PlanningRuntimeProductRepairStatus;
  readonly run?: VerificationRepairLoopRun;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export async function runPlanningRuntimeProductRepairContinuation(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly proofRoute: PlanningMutationProofRoute;
  readonly commandRun?: PlanningRuntimeProductVerificationCommandRun;
}): Promise<PlanningRuntimeProductRepairContinuation> {
  const commandFailed =
    input.commandRun?.status === "failed" || input.commandRun?.status === "blocked";
  const readbackFailed = input.proofRoute.state === "repair-ready";

  if (!commandFailed && !readbackFailed) {
    return {
      status: "not-needed",
      reason: "Product proof verification did not request repair continuation.",
      nextAction: "No repair continuation is needed for this product loop result.",
      evidence: [
        "planning-runtime-product-repair:state:not-needed",
        "planning-runtime-product-repair:mutation:not-run",
      ],
    };
  }

  const commandResult = input.commandRun?.result;
  const runtimeReceiptMarkers = commandResult?.runtimeReceiptMarkers ?? [];
  const verification =
    commandResult?.verification ?? input.proofRoute.runtimeOutcome.codingResult.verification;
  const failedFiles =
    commandFailed && commandResult
      ? [
          {
            path: "(verification-command)",
            reason: commandResult.failureSummary ?? commandResult.verification.reason,
          },
        ]
      : input.proofRoute.runtimeOutcome.codingResult.failedFiles;

  const run = await runVerificationRepairLoop({
    sessionId: input.sessionId,
    prompt: input.prompt,
    sourceEditTransactionId: input.proofRoute.proofHandoff.proofHandoffId,
    sourceProposalId: input.proofRoute.bridge.proposalId,
    verification,
    failedFiles,
    changedFiles: input.proofRoute.changedFiles,
    runtimeReceiptMarkers,
    availability: {
      kind: "opt-in-required",
      reason:
        "Product repair continuation is review-only until a separate repair provider/proposal boundary is explicitly selected.",
    },
  });

  return {
    status: "repair-continuation-created",
    run,
    reason: run.plan.reason,
    nextAction: run.plan.nextAction,
    evidence: unique([
      "planning-runtime-product-repair:state:repair-continuation-created",
      `planning-runtime-product-repair:plan:${run.plan.status}`,
      ...run.evidence,
      "planning-runtime-product-repair:original-failure-preserved",
      "planning-runtime-product-repair:no-automatic-repair",
      "planning-runtime-product-repair:mutation:not-run",
    ]),
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
