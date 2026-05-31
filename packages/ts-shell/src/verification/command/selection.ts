import { blockedCommandReason, isAllowlistedRunCommand } from "../../orchestration/capabilityBoundaryProjection.js";
import type {
  CodingTaskKind,
  CodingVerificationBlockerKind,
  CodingVerificationSelectionScope,
  CodingVerificationSelectionSource,
} from "../../orchestration/types.js";

export type VerificationPlanMode =
  | "command"
  | "low-risk"
  | "unavailable"
  | "skipped"
  | "not-requested";

export type VerificationRetryDecision =
  | {
      readonly status: "retry-planned";
      readonly reasonCode: "command-failed-retryable";
      readonly attempt: number;
      readonly maxAttempts: number;
    }
  | {
      readonly status: "retry-not-planned";
      readonly reasonCode:
        | "not-applicable"
        | "attempts-exhausted"
        | "blocked"
        | "passed"
        | "not-selected";
      readonly attempt: number;
      readonly maxAttempts: number;
    };

export interface VerificationPlan {
  readonly mode: VerificationPlanMode;
  readonly command?: string;
  readonly reason: string;
  readonly selectionScope: CodingVerificationSelectionScope;
  readonly selectionSource: CodingVerificationSelectionSource;
  readonly blockerKind?: CodingVerificationBlockerKind;
  readonly nextAction?: string;
  readonly maxAttempts: number;
}

export function planVerification(input: {
  readonly taskKind: CodingTaskKind;
  readonly prompt: string;
  readonly changedFiles: readonly string[];
  readonly explicitVerifyRequested: boolean;
  readonly explicitVerifyCommand?: string;
}): VerificationPlan {
  if (!isMutationTask(input.taskKind) || input.changedFiles.length === 0) {
    return {
      mode: "not-requested",
      reason: `${input.taskKind} task has no mutation verification requirement`,
      selectionScope: "none",
      selectionSource: "not-requested",
      maxAttempts: 0,
    };
  }

  if (input.explicitVerifyCommand) {
    if (!isAllowlistedRunCommand(input.explicitVerifyCommand)) {
      return {
        mode: "unavailable",
        command: input.explicitVerifyCommand,
        reason: blockedCommandReason(input.explicitVerifyCommand),
        selectionScope: "focused",
        selectionSource: "explicit-user",
        blockerKind: "no-verify-strategy",
        nextAction:
          "Use an allowlisted verification command or run unsupported verification manually.",
        maxAttempts: 0,
      };
    }

    return {
      mode: "command",
      command: input.explicitVerifyCommand,
      reason: "explicit verify command selected",
      selectionScope: "focused",
      selectionSource: "explicit-user",
      maxAttempts: 2,
    };
  }

  if (input.explicitVerifyRequested) {
    return {
      mode: "low-risk",
      reason: "explicit verify intent selected low-risk readback verification",
      selectionScope: "focused",
      selectionSource: "explicit-user",
      maxAttempts: 0,
    };
  }

  const autoCommand = selectAutoVerifyCommand(input.changedFiles);
  if (autoCommand) {
    return {
      mode: "command",
      command: autoCommand.command,
      reason: autoCommand.reason,
      selectionScope: autoCommand.selectionScope,
      selectionSource: "auto-from-changes",
      maxAttempts: 2,
    };
  }

  return {
    mode: "skipped",
    reason:
      "targeted verification skipped: changed files do not map to a supported allowlisted verification command",
    selectionScope: "none",
    selectionSource: "auto-from-changes",
    maxAttempts: 0,
  };
}

export function planVerificationRetry(input: {
  readonly plan: VerificationPlan;
  readonly attempt: number;
  readonly outcome: "passed" | "failed" | "blocked";
}): VerificationRetryDecision {
  if (input.plan.mode !== "command") {
    return {
      status: "retry-not-planned",
      reasonCode: "not-selected",
      attempt: input.attempt,
      maxAttempts: input.plan.maxAttempts,
    };
  }
  if (input.outcome === "passed") {
    return {
      status: "retry-not-planned",
      reasonCode: "passed",
      attempt: input.attempt,
      maxAttempts: input.plan.maxAttempts,
    };
  }
  if (input.outcome === "blocked") {
    return {
      status: "retry-not-planned",
      reasonCode: "blocked",
      attempt: input.attempt,
      maxAttempts: input.plan.maxAttempts,
    };
  }
  if (input.attempt < input.plan.maxAttempts) {
    return {
      status: "retry-planned",
      reasonCode: "command-failed-retryable",
      attempt: input.attempt,
      maxAttempts: input.plan.maxAttempts,
    };
  }
  return {
    status: "retry-not-planned",
    reasonCode: "attempts-exhausted",
    attempt: input.attempt,
    maxAttempts: input.plan.maxAttempts,
  };
}

export function stripVerificationTailForMutationTarget(prompt: string): string {
  return prompt
    .replace(
      /(?:^|[.!?。！？]\s+)(?:and\s+)?(?:then\s+)?(?:verify|confirm|ensure|check)\b[\s\S]*$/i,
      "",
    )
    .trim();
}

function isMutationTask(taskKind: CodingTaskKind): boolean {
  return taskKind === "edit-file" || taskKind === "write-file";
}

function selectAutoVerifyCommand(
  changedFiles: readonly string[],
):
  | {
      readonly command: string;
      readonly selectionScope: "focused" | "broader";
      readonly reason: string;
    }
  | undefined {
  if (changedFiles.length === 0) {
    return undefined;
  }

  if (changedFiles.every(isTestFile)) {
    return {
      command: "node --version",
      selectionScope: "focused",
      reason: "auto verification selected for test-only changes",
    };
  }

  if (changedFiles.some(isSourceFile)) {
    return {
      command: "node --version",
      selectionScope: "broader",
      reason: "auto verification selected for source changes",
    };
  }

  return undefined;
}

function isTestFile(filePath: string): boolean {
  return /(?:^|\/)(?:tests?|__tests__)\/|(?:\.test|\.spec)\.(?:ts|tsx|js|jsx)$/i.test(
    normalizePath(filePath),
  );
}

function isSourceFile(filePath: string): boolean {
  return /(?:^|\/)src\/.+\.(?:ts|tsx|js|jsx)$/i.test(normalizePath(filePath));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
