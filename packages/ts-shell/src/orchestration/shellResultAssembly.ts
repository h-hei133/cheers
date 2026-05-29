import {
  buildActionResultSeedFromCodingResult,
  extractAttemptedFilesFromEvidence,
} from "./actionResultEvidence.js";
import { projectMutationVerificationHandoff } from "./patchResult/mutationVerificationProjection.js";
import type {
  CodingPatchRecord,
  CodingResultProvenanceSummary,
  CodingResultSummary,
  CodingTaskKind,
  CodingVerificationSummary,
} from "./types.js";
import { buildMutationTaskDelivery } from "./verificationResultAggregation.js";

export interface ShellResultAssemblyInput {
  readonly taskKind: CodingTaskKind;
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly verification: CodingVerificationSummary;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly crossFileDegradationReason?: string;
  readonly degradedCrossFileTargets: string[];
  readonly crossFileRemainingTargets: string[];
  readonly crossFileFailedByReason: Array<{
    path: string;
    failureCode: string;
    reason: string;
  }>;
  readonly crossFileSkippedFiles: Array<{ path: string; reason: string }>;
  readonly provenance?: CodingResultProvenanceSummary;
}

export interface ShellResultAssemblyOutput {
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
}

export function assembleShellResult(
  input: ShellResultAssemblyInput,
): ShellResultAssemblyOutput {
  const userFacingOutput = buildActionResultDelivery(input);
  const mutationHandoff = projectMutationVerificationHandoff({
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles,
    verification: input.verification,
    evidence: input.evidence,
    crossFileDegradationReason: input.crossFileDegradationReason,
    degradedCrossFileTargets: input.degradedCrossFileTargets,
    crossFileRemainingTargets: input.crossFileRemainingTargets,
    crossFileFailedByReason: input.crossFileFailedByReason,
    crossFileSkippedFiles: input.crossFileSkippedFiles,
  });

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
      provenance: input.provenance,
      taskVerdict: mutationHandoff.taskVerdict,
      taskReasons: [...mutationHandoff.taskReasons],
    }),
    userFacingOutput,
  };
}

function buildActionResultDelivery(input: ShellResultAssemblyInput): string {
  if (
    input.crossFileDegradationReason &&
    input.degradedCrossFileTargets.length > 0
  ) {
    return `Task stopped: unrecoverable remaining targets detected (${input.degradedCrossFileTargets.join(", ")}). ${input.crossFileDegradationReason}`;
  }
  if (input.crossFileRemainingTargets.length > 0) {
    const changed =
      input.changedFiles.length > 0 ? input.changedFiles.join(", ") : "none";
    const failedSummary =
      input.crossFileFailedByReason.length > 0
        ? ` Failed this turn: ${input.crossFileFailedByReason
            .map((item) => `${item.path} (${item.failureCode})`)
            .join(", ")}.`
        : "";
    const skippedSummary =
      input.crossFileSkippedFiles.length > 0
        ? ` Skipped this turn: ${input.crossFileSkippedFiles
            .map((item) => `${item.path} (${item.reason})`)
            .join(", ")}.`
        : "";
    return `Edit partially completed for ${changed}. Remaining cross-file targets: ${input.crossFileRemainingTargets.join(", ")}.${failedSummary}${skippedSummary}`;
  }
  return buildMutationTaskDelivery(input);
}

export function renderShellExecutionSummary(input: {
  readonly taskKind: CodingTaskKind;
  readonly execution: ShellResultAssemblyOutput;
}): string {
  const result = input.execution.codingResult;
  const statusLine =
    result.taskSatisfaction.verdict === "satisfied"
      ? "workflow-status=ready"
      : result.taskSatisfaction.verdict === "completed-with-caveats"
        ? "workflow-status=verify-failed"
        : "workflow-status=blocked";
  const verifyLine = `verify=${result.verification.status}${
    result.verification.command ? ` command=${result.verification.command}` : ""
  }`;
  const changed =
    result.changedFiles.length > 0 ? result.changedFiles.join(", ") : "none";
  const failed =
    result.failedFiles.length > 0
      ? result.failedFiles
          .map((item) => `${item.path}: ${item.reason}`)
          .join(" | ")
      : "none";

  return [
    "Coding workflow execution summary",
    `task=${input.taskKind}`,
    statusLine,
    `changed=${changed}`,
    `failed=${failed}`,
    verifyLine,
    `repair=${result.repair.status}`,
    `next=${result.taskSatisfaction.reasons.join(" | ") || "none"}`,
  ].join("\n");
}

export function buildShellCodingResult(
  taskKind: CodingTaskKind,
  input: {
    readonly changedFiles: string[];
    readonly failedFiles: Array<{ path: string; reason: string }>;
    readonly patches: CodingPatchRecord[];
    readonly verifiedFiles: string[];
    readonly unverifiedFiles: Array<{ path: string; reason: string }>;
    readonly verification: CodingVerificationSummary;
    readonly repairNotes: string[];
    readonly evidence: string[];
    readonly provenance?: CodingResultProvenanceSummary;
    readonly taskVerdict:
      | "satisfied"
      | "completed-with-caveats"
      | "insufficient-evidence";
    readonly taskReasons: string[];
  },
): CodingResultSummary {
  const recoveredByContinuation =
    input.failedFiles.length === 0 &&
    input.changedFiles.length > 0 &&
    input.evidence.some(
      (entry) =>
        entry.startsWith("replan-transform:") ||
        entry === "repairContextUsed:true",
    );
  const attemptedFromEvidence = extractAttemptedFilesFromEvidence(
    input.evidence,
  );
  const actionableBlocker = deriveActionableBlockerContract({
    reason: input.failedFiles[0]?.reason ?? input.verification.reason,
    verification: input.verification,
    failedFiles: input.failedFiles,
    taskReasons: input.taskReasons,
    evidence: input.evidence,
  });
  const evidenceWithActionableBlocker = [...input.evidence];
  appendActionableBlockerEvidence(
    evidenceWithActionableBlocker,
    actionableBlocker,
  );
  const verificationWithActionableBlocker = actionableBlocker
    ? {
        ...input.verification,
        ...(input.verification.nextAction
          ? {}
          : { nextAction: actionableBlocker.doNext }),
      }
    : input.verification;
  const attemptedFiles = Array.from(
    new Set([
      ...attemptedFromEvidence,
      ...input.changedFiles,
      ...input.failedFiles.map((item) => item.path),
    ]),
  );
  const lastActionResultSeed = buildActionResultSeedFromCodingResult(
    taskKind,
    {
      attemptedFiles,
      changedFiles: input.changedFiles,
      verifiedFiles: input.verifiedFiles,
      verification: verificationWithActionableBlocker,
      reason: input.failedFiles[0]?.reason,
    },
  );

  return {
    taskKind,
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles,
    patches: input.patches,
    repair: {
      status:
        input.failedFiles.length > 0
          ? "failed"
          : recoveredByContinuation
            ? "recovered"
            : input.verification.status === "failed"
              ? "not-needed"
              : "not-needed",
      attempts: recoveredByContinuation ? 2 : 1,
      recoveredItems: recoveredByContinuation ? input.changedFiles : [],
      failedItems: input.failedFiles.map((entry) => entry.path),
      notes: input.repairNotes,
    },
    continuation: {
      status:
        input.failedFiles.length > 0
          ? "failed-after-bounded-continuation"
          : recoveredByContinuation
            ? "recovered-after-continuation"
            : "first-pass-success",
      attempts: recoveredByContinuation ? 2 : 1,
      evidence: evidenceWithActionableBlocker,
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles,
      changedFiles: input.changedFiles,
      unchangedAttemptedFiles: input.failedFiles.map((item) => item.path),
    },
    taskSatisfaction: {
      verdict: input.taskVerdict,
      reasons: input.taskReasons,
      requiredEvidence: ["inspect->edit->verify contract execution"],
      observedEvidence: evidenceWithActionableBlocker,
    },
    verifiedFiles: input.verifiedFiles,
    unverifiedFiles: input.unverifiedFiles,
    verification: verificationWithActionableBlocker,
    evidence: evidenceWithActionableBlocker,
    ...(lastActionResultSeed ? { lastActionResultSeed } : {}),
    ...(input.provenance ? { provenance: input.provenance } : {}),
    ...(input.failedFiles.length > 0
      ? { failureBoundary: input.failedFiles[0]?.reason ?? "workflow failed" }
      : {}),
  };
}

type ActionableBlockerKind =
  | "ambiguous-target"
  | "patch-from-not-found"
  | "patch-target-missing"
  | "patch-generation-failed"
  | "verification-failed"
  | "command-not-allowlisted";

export function deriveActionableBlockerContract(input: {
  reason?: string;
  verification?: CodingVerificationSummary;
  failedFiles?: Array<{ path: string; reason: string }>;
  taskReasons?: readonly string[];
  evidence?: readonly string[];
}):
  | {
      blockerKind: ActionableBlockerKind;
      reason: string;
      doNext: string;
    }
  | undefined {
  const evidenceKind = findActionableBlockerKindInEvidence(
    input.evidence ?? [],
  );
  const candidateReason =
    input.reason?.trim() ||
    input.verification?.reason?.trim() ||
    input.failedFiles?.find((entry) => entry.reason.trim().length > 0)
      ?.reason ||
    input.taskReasons?.find((entry) => entry.trim().length > 0);

  if (!candidateReason) {
    return undefined;
  }

  const blockerKind =
    evidenceKind ??
    classifyActionableBlockerKind(
      candidateReason,
      input.verification?.status === "failed",
    );
  if (!blockerKind) {
    return undefined;
  }

  return {
    blockerKind,
    reason: candidateReason,
    doNext: actionableBlockerNextAction(blockerKind),
  };
}

function findActionableBlockerKindInEvidence(
  evidence: readonly string[],
): ActionableBlockerKind | undefined {
  const marker = evidence
    .find((entry) => entry.startsWith("actionable-blocker-kind:"))
    ?.slice("actionable-blocker-kind:".length)
    .trim();
  if (!marker) {
    return undefined;
  }
  if (
    marker === "ambiguous-target" ||
    marker === "patch-from-not-found" ||
    marker === "patch-target-missing" ||
    marker === "patch-generation-failed" ||
    marker === "verification-failed" ||
    marker === "command-not-allowlisted"
  ) {
    return marker;
  }
  return undefined;
}

function classifyActionableBlockerKind(
  reason: string,
  verificationFailed: boolean,
): ActionableBlockerKind | undefined {
  const normalizedReason = reason.toLowerCase();
  if (verificationFailed || normalizedReason.includes("verification failed")) {
    return "verification-failed";
  }
  if (normalizedReason.includes("not allowed in the controlled allowlist")) {
    return "command-not-allowlisted";
  }
  if (
    normalizedReason.includes("patch-target-missing") ||
    normalizedReason.includes("edit-target-missing")
  ) {
    return "patch-target-missing";
  }
  if (
    normalizedReason.includes("patch-generation-failed") ||
    normalizedReason.includes("unified diff") ||
    normalizedReason.includes("apply_patch") ||
    normalizedReason.includes("only supports one explicit single-file")
  ) {
    return "patch-generation-failed";
  }
  if (
    normalizedReason.includes("patch-from-not-found") ||
    normalizedReason.includes("replace source text not found")
  ) {
    return "patch-from-not-found";
  }
  if (
    normalizedReason.includes("patch-ambiguous") ||
    normalizedReason.includes("target-not-unique") ||
    normalizedReason.includes("relocation is ambiguous") ||
    normalizedReason.includes("follow-up is ambiguous") ||
    (normalizedReason.includes("ambiguous") &&
      !normalizedReason.includes("allowlist"))
  ) {
    return "ambiguous-target";
  }
  return undefined;
}

function actionableBlockerNextAction(kind: ActionableBlockerKind): string {
  switch (kind) {
    case "command-not-allowlisted":
      return "Rephrase the request with an allowlisted command: node --version, npm test -- --help, or npm run build -- --help.";
    case "patch-from-not-found":
      return "Provide the exact current source text from the target file, then rerun the patch.";
    case "patch-target-missing":
      return "Create or confirm the target file path first, then rerun the patch.";
    case "patch-generation-failed":
      return "Rerun with one explicit target file plus exact replace-from and replace-to text; do not pass unified diff or apply_patch syntax.";
    case "ambiguous-target":
      return "Specify one exact target file/path (and exact from/to text if editing), then rerun.";
    case "verification-failed":
      return "Fix the verification failure, then rerun the verification step.";
    default:
      return "Clarify the blocking condition and rerun.";
  }
}

export function appendActionableBlockerEvidence(
  evidence: string[],
  contract:
    | {
        blockerKind: ActionableBlockerKind;
        reason: string;
        doNext: string;
      }
    | undefined,
): void {
  if (!contract) {
    return;
  }
  const kindMarker = `actionable-blocker-kind:${contract.blockerKind}`;
  if (!evidence.includes(kindMarker)) {
    evidence.push(kindMarker);
  }
  const doNextMarker = `actionable-blocker-next:${contract.doNext}`;
  if (!evidence.includes(doNextMarker)) {
    evidence.push(doNextMarker);
  }
}
