import type {
  CodingResultSummary,
  OrchestrationResult,
  TerminalClassification,
  TerminalReason,
} from "../../orchestration/types.js";
import { deriveActionableBlockerContract } from "./actionableBlockerModule.js";
import {
  buildHardFailureStopReason,
  hasHardFailureSignal,
  hasSuccessfulMutationWithVerificationCaveat,
} from "./capabilityResultClassification.js";
import type { QueryRuntimeState } from "./runtimeState.js";
import { classifyTerminalReason } from "./terminalClassificationProjection.js";
import type { QueryTerminal } from "./transitions.js";

export function mapTerminalToOrchestrationResult(
  state: QueryRuntimeState,
  terminal: QueryTerminal,
): OrchestrationResult {
  const latestCodingResult =
    state.transcript[state.transcript.length - 1]?.codingResult;
  const codingResult = latestCodingResult
    ? {
        ...latestCodingResult,
        ...(terminal.terminalReason === "completed" ||
        latestCodingResult.failureBoundary
          ? {}
          : {
              failureBoundary: terminal.stopReason ?? terminal.terminalReason,
            }),
      }
    : undefined;

  const truthfulTerminal = deriveTruthfulTerminal({
    terminal,
    codingResult,
    lastContinuationReason: state.lastContinuationReason,
  });

  return {
    status: truthfulTerminal.terminalReason,
    terminalReason: truthfulTerminal.terminalReason,
    terminalClassification: truthfulTerminal.terminalClassification,
    lastContinuationReason: state.lastContinuationReason,
    stopReason: truthfulTerminal.stopReason,
    transcript: state.transcript,
    sharedContext: state.sharedContext,
    finalOutput: state.transcript[state.transcript.length - 1]?.content ?? "",
    codingResult,
  };
}

function deriveTruthfulTerminal(input: {
  terminal: QueryTerminal;
  codingResult?: CodingResultSummary;
  lastContinuationReason?: QueryRuntimeState["lastContinuationReason"];
}): {
  terminalReason: TerminalReason;
  terminalClassification: TerminalClassification;
  stopReason?: string;
} {
  const baseClassification =
    input.terminal.terminalClassification ??
    classifyTerminalReason(
      input.terminal.terminalReason,
      input.lastContinuationReason,
    );
  const base = {
    terminalReason: input.terminal.terminalReason,
    terminalClassification: baseClassification,
    stopReason: input.terminal.stopReason,
  };

  const baseActionableBlocker = deriveActionableBlockerContract({
    stopReason: input.terminal.stopReason,
    codingResult: input.codingResult,
  });
  if (
    input.terminal.terminalReason !== "completed" &&
    baseActionableBlocker &&
    baseClassification === "error"
  ) {
    return {
      terminalReason: input.terminal.terminalReason,
      terminalClassification: "stopped",
      stopReason: baseActionableBlocker.reason,
    };
  }

  if (input.terminal.terminalReason !== "completed" || !input.codingResult) {
    return base;
  }

  const codingResult = input.codingResult;
  const taskVerdict = codingResult.taskSatisfaction.verdict;
  const verification = codingResult.verification;
  const taskReason = firstTruthy(codingResult.taskSatisfaction.reasons);
  const verificationReason = verification.reason?.trim();
  const failedReason = firstTruthy(
    codingResult.failedFiles.map((entry) => entry.reason),
  );
  const actionableBlocker = deriveActionableBlockerContract({
    stopReason: verificationReason ?? taskReason ?? failedReason,
    codingResult,
  });
  const hasHardFailure = hasHardFailureSignal(codingResult);

  if (
    actionableBlocker &&
    !hasSuccessfulMutationWithVerificationCaveat(codingResult) &&
    !(actionableBlocker.kind === "verification-failed" && hasHardFailure)
  ) {
    return {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason: actionableBlocker.reason,
    };
  }

  if (verification.status === "failed" && !hasHardFailure) {
    return {
      terminalReason: "stopped_error",
      terminalClassification: "error",
      stopReason:
        verificationReason ??
        taskReason ??
        failedReason ??
        "Verification failed",
    };
  }

  if (verification.status === "blocked") {
    if (hasSuccessfulMutationWithVerificationCaveat(codingResult)) {
      return base;
    }

    return {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason:
        verification.nextAction ??
        verificationReason ??
        taskReason ??
        `Verification blocked (${verification.blockerKind ?? "unknown"})`,
    };
  }

  if (hasHardFailure) {
    return {
      terminalReason: "stopped_error",
      terminalClassification: "error",
      stopReason: buildHardFailureStopReason({
        codingResult,
        taskReason,
        failedReason,
        verificationReason,
      }),
    };
  }

  if (
    taskVerdict === "insufficient-evidence" ||
    taskVerdict === "completed-with-caveats"
  ) {
    if (hasSuccessfulMutationWithVerificationCaveat(codingResult)) {
      return base;
    }

    return {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      stopReason:
        taskReason ??
        verificationReason ??
        "Task completed with insufficient evidence",
    };
  }

  return base;
}

function firstTruthy(values: readonly string[]): string | undefined {
  return values.find((value) => value.trim().length > 0);
}
