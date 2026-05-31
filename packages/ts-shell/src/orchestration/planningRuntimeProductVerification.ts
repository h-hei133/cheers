import type { QueryEvent } from "../core/query/runtime/events.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import type { PlanningMutationProofRoute } from "./planningMutationProofRoute.js";
import type { PlanningRuntimeProductVerificationCommand } from "./planningRuntimeProductExecution.js";
import {
  buildVerificationCommandPlan,
  type VerificationCommandPlan,
} from "../verification/command/plan.js";
import {
  buildVerificationCommandResult,
  type VerificationCommandResult,
} from "../verification/command/result.js";
import {
  runVerificationCommand,
  type VerificationCommandRun,
} from "../verification/command/runner.js";

export type PlanningRuntimeProductVerificationStatus =
  | "not-requested"
  | "not-run"
  | "passed"
  | "failed"
  | "blocked";

export interface PlanningRuntimeProductVerificationRuntime {
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly taskId: string;
  readonly sessionId: string;
  readonly abortSignal?: AbortSignal;
}

export interface PlanningRuntimeProductVerificationCommandRun {
  readonly status: PlanningRuntimeProductVerificationStatus;
  readonly commandDispatch: "not-run" | "existing-tool-runtime";
  readonly plan?: VerificationCommandPlan;
  readonly result?: VerificationCommandResult;
  readonly run?: VerificationCommandRun;
  readonly reason: string;
  readonly nextAction: string;
  readonly repairEligible: boolean;
  readonly evidence: readonly string[];
}

export async function runPlanningRuntimeProductVerificationCommand(input: {
  readonly workspaceRoot: string;
  readonly proofRoute: PlanningMutationProofRoute;
  readonly verificationCommand?: PlanningRuntimeProductVerificationCommand;
  readonly runtime?: PlanningRuntimeProductVerificationRuntime;
}): Promise<PlanningRuntimeProductVerificationCommandRun> {
  if (!input.verificationCommand) {
    return {
      status: "not-requested",
      commandDispatch: "not-run",
      reason: "No explicit verification command approval was provided.",
      nextAction:
        "Keep command dispatch closed unless an allowlisted verification command is explicitly approved.",
      repairEligible: false,
      evidence: [
        "planning-runtime-product-verification-command:state:not-requested",
        "planning-runtime-product-verification-command:dispatch:not-run",
        "command-dispatch=not-run",
      ],
    };
  }

  const plan = buildVerificationCommandPlan({
    explicitCommand: input.verificationCommand.command,
    sourceProposalId: input.proofRoute.bridge.proposalId,
    cwdLabel: "workspace-root",
    permissionState: "runtime-check",
    expectedEvidence: [
      "planning proof readback result",
      "verification command runtime receipt",
    ],
  });

  if (plan.state !== "ready") {
    const result = buildVerificationCommandResult({ plan });
    return commandRun({
      status: commandStatusFromResult(result),
      commandDispatch: "not-run",
      plan,
      result,
      reason: result.verification.reason ?? plan.reason,
      nextAction: result.verification.nextAction ?? plan.nextAction,
      repairEligible: result.repairEligible,
      evidence: [
        ...result.evidence,
        "planning-runtime-product-verification-command:dispatch:not-run",
        "planning-runtime-product-verification-command:blocked-before-runtime",
      ],
    });
  }

  if (
    input.proofRoute.proofHandoff.applyState === "not-run" ||
    input.proofRoute.changedFiles.length === 0
  ) {
    return commandRun({
      status: "not-run",
      commandDispatch: "not-run",
      plan,
      reason:
        "Verification command was explicit and allowlisted, but product proof apply/readback did not produce changed files.",
      nextAction:
        "Complete an explicitly confirmed proof apply before dispatching product verification commands.",
      repairEligible: false,
      evidence: [
        ...plan.evidence,
        "planning-runtime-product-verification-command:dispatch:not-run:no-applied-proof",
        "planning-runtime-product-verification-command:command-only-bypass:blocked",
        "command-dispatch=not-run",
      ],
    });
  }

  if (!input.runtime) {
    return commandRun({
      status: "blocked",
      commandDispatch: "not-run",
      plan,
      reason:
        "Verification command runtime was not supplied to the Planning Runtime product path.",
      nextAction:
        "Wire the existing tool runtime before claiming command verification.",
      repairEligible: false,
      evidence: [
        ...plan.evidence,
        "planning-runtime-product-verification-command:dispatch:not-run:runtime-missing",
        "command-dispatch=not-run",
      ],
    });
  }

  const run = await runVerificationCommand({
    plan,
    dispatcher: input.runtime.dispatcher,
    events: input.runtime.events,
    taskId: input.runtime.taskId,
    workspaceRoot: input.workspaceRoot,
    sessionId: input.runtime.sessionId,
    abortSignal: input.runtime.abortSignal,
  });

  return commandRun({
    status: commandStatusFromResult(run.result),
    commandDispatch: "existing-tool-runtime",
    plan,
    run,
    result: run.result,
    reason: run.result.verification.reason ?? run.result.outcome,
    nextAction: run.result.verification.nextAction ?? "Inspect verification command result.",
    repairEligible: run.result.repairEligible,
    evidence: [
      ...run.evidence,
      "planning-runtime-product-verification-command:dispatch:existing-tool-runtime",
      `planning-runtime-product-verification-command:outcome:${run.result.outcome}`,
    ],
  });
}

function commandRun(input: Omit<
  PlanningRuntimeProductVerificationCommandRun,
  "evidence"
> & {
  readonly evidence: readonly string[];
}): PlanningRuntimeProductVerificationCommandRun {
  return {
    ...input,
    evidence: unique([
      `planning-runtime-product-verification-command:state:${input.status}`,
      `planning-runtime-product-verification-command:dispatch:${input.commandDispatch}`,
      ...input.evidence,
    ]),
  };
}

function commandStatusFromResult(
  result: VerificationCommandResult,
): PlanningRuntimeProductVerificationStatus {
  if (result.outcome === "success") return "passed";
  if (
    result.outcome === "failed" ||
    result.outcome === "timeout" ||
    result.outcome === "error"
  ) {
    return "failed";
  }
  if (result.outcome === "blocked") return "blocked";
  return "not-run";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
