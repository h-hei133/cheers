import {
  appendActionableBlockerEvidence,
  assembleShellResult,
  buildShellCodingResult,
  deriveActionableBlockerContract,
  type ShellResultAssemblyInput,
} from "../result/projection/shell/assembly.js";
import type {
  CodingPatchRecord,
  CodingResultSummary,
  CodingTaskKind,
  CodingVerificationSummary,
} from "./types.js";

export interface RuntimeOutcomeProjection {
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
}

export interface RuntimeCodingOutcomeInput {
  readonly taskKind: CodingTaskKind;
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly verification: CodingVerificationSummary;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly taskVerdict:
    | "satisfied"
    | "completed-with-caveats"
    | "insufficient-evidence";
  readonly taskReasons: string[];
  readonly userFacingOutput: string;
}

export function projectRuntimeCodingOutcome(
  input: RuntimeCodingOutcomeInput,
): RuntimeOutcomeProjection {
  return {
    codingResult: buildShellCodingResult(input.taskKind, {
      changedFiles: input.changedFiles,
      failedFiles: input.failedFiles,
      patches: input.patches,
      verifiedFiles: input.verifiedFiles,
      unverifiedFiles: input.unverifiedFiles,
      verification: input.verification,
      repairNotes: input.repairNotes,
      evidence: input.evidence,
      taskVerdict: input.taskVerdict,
      taskReasons: input.taskReasons,
    }),
    userFacingOutput: input.userFacingOutput,
  };
}

export function projectRuntimeMutationOutcome(
  input: ShellResultAssemblyInput,
): RuntimeOutcomeProjection {
  return assembleShellResult(input);
}

export interface BlockedRuntimeOutcomeInput {
  readonly taskKind: CodingTaskKind;
  readonly blockedReason: string;
  readonly targetPath?: string;
  readonly freshnessEvidence: readonly string[];
  readonly previousRemainingTargets?: readonly string[];
  readonly previousFailedEntries?: readonly {
    readonly path: string;
    readonly failureCode: string;
    readonly reason: string;
  }[];
  readonly degradedReopenReason?: string;
  readonly degradedReopenCandidates?: readonly string[];
  readonly degradedReopenCandidateSource?: string;
  readonly degradedReopenCandidatePruned?: readonly string[];
}

export function projectBlockedRuntimeOutcome(
  input: BlockedRuntimeOutcomeInput,
): RuntimeOutcomeProjection {
  const blockedContract = deriveActionableBlockerContract({
    reason: input.blockedReason,
  });
  const blockedEvidence = [
    ...input.freshnessEvidence,
    "workflow blocked before mutation",
  ];
  appendActionableBlockerEvidence(blockedEvidence, blockedContract);
  const blockedRemainingTargets = Array.from(
    new Set([
      ...(input.previousRemainingTargets ?? []),
      ...(input.degradedReopenCandidates ?? []),
    ]),
  ).filter((entry) => entry.trim().length > 0);
  const blockedFailedEntries = input.previousFailedEntries ?? [];
  blockedEvidence.push(
    `repair-remaining-files:${
      blockedRemainingTargets.length > 0
        ? blockedRemainingTargets.join(",")
        : "(none)"
    }`,
  );
  blockedEvidence.push(
    `repair-failed-files:${
      blockedFailedEntries.length > 0
        ? blockedFailedEntries
            .map(
              (entry) =>
                `${entry.path}::${entry.failureCode}::${truncate(entry.reason, 80)}`,
            )
            .join("|")
        : "(none)"
    }`,
  );
  if (input.degradedReopenReason) {
    blockedEvidence.push(`reopen-reason:${input.degradedReopenReason}`);
  }
  if ((input.degradedReopenCandidates?.length ?? 0) > 0) {
    blockedEvidence.push(
      `reopen-candidates:${input.degradedReopenCandidates!.join(",")}`,
    );
  }
  if (input.degradedReopenCandidateSource) {
    blockedEvidence.push(
      `reopen-candidate-source:${input.degradedReopenCandidateSource}`,
    );
  }
  if ((input.degradedReopenCandidatePruned?.length ?? 0) > 0) {
    blockedEvidence.push(
      `reopen-candidate-pruned:${input.degradedReopenCandidatePruned!.join("|")}`,
    );
  }
  if (
    input.degradedReopenCandidates &&
    input.degradedReopenCandidates.length > 1
  ) {
    blockedEvidence.push("why-not-auto-select:multi-candidate-ambiguous");
    blockedEvidence.push("repair-outcome:blocked-disambiguation");
  }

  return projectRuntimeCodingOutcome({
    taskKind: input.taskKind,
    changedFiles: [],
    failedFiles: [
      {
        path: input.targetPath ?? "(missing-target)",
        reason: input.blockedReason,
      },
    ],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "skipped",
      reason: input.blockedReason,
      selectionScope: "none",
      selectionSource: "not-requested",
      ...(blockedContract
        ? {
            nextAction: blockedContract.doNext,
          }
        : {}),
    },
    repairNotes: [input.blockedReason],
    evidence: blockedEvidence,
    taskVerdict: "insufficient-evidence",
    taskReasons: [input.blockedReason],
    userFacingOutput: blockedContract
      ? [
          `Task not completed: ${input.blockedReason}`,
          "Outcome: blocked",
          `BlockerKind: ${blockedContract.blockerKind}`,
          `Reason: ${blockedContract.reason}`,
          `DoNext: ${blockedContract.doNext}`,
        ].join("\n")
      : `Task not completed: ${input.blockedReason}`,
  });
}

function truncate(value: string, maxLength = 220): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
