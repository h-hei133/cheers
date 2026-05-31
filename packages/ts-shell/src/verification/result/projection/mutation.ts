import type {
  CodingPatchFailureCode,
  CodingTaskSatisfactionVerdict,
  CodingVerificationBlockerKind,
  CodingVerificationSummary,
  CodingWriteEffect,
} from "../../../orchestration/types.js";

export type MutationVerificationHandoffKind =
  | "write-verified"
  | "mutation-applied"
  | "post-write-verification-failed"
  | "verification-blocked"
  | "verification-failed"
  | "protected-file-changed"
  | "stale-read"
  | "writer-started-unknown"
  | "writer-started-unverified"
  | "unsupported-patch-shape"
  | "no-mutation"
  | "mutation-failed";

export interface MutationVerificationFailedFile {
  readonly path: string;
  readonly reason: string;
}

export interface MutationVerificationProjectionInput {
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly MutationVerificationFailedFile[];
  readonly verification: CodingVerificationSummary;
  readonly evidence?: readonly string[];
  readonly targetPath?: string;
  readonly reason?: string;
  readonly nextAction?: string;
  readonly routeBlocker?: string;
  readonly writerStarted?: boolean;
  readonly writeEffect?: CodingWriteEffect;
  readonly postWriteVerification?: "passed" | "not-run" | "blocked" | "failed";
  readonly crossFileDegradationReason?: string;
  readonly degradedCrossFileTargets?: readonly string[];
  readonly crossFileRemainingTargets?: readonly string[];
  readonly crossFileFailedByReason?: ReadonlyArray<{
    readonly path: string;
    readonly failureCode: string;
    readonly reason: string;
  }>;
  readonly crossFileSkippedFiles?: ReadonlyArray<{
    readonly path: string;
    readonly reason: string;
  }>;
}

export interface MutationVerificationHandoff {
  readonly kind: MutationVerificationHandoffKind;
  readonly reason: string;
  readonly nextAction: string;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly MutationVerificationFailedFile[];
  readonly taskVerdict: CodingTaskSatisfactionVerdict;
  readonly taskReasons: readonly string[];
  readonly patchFailureCode: CodingPatchFailureCode;
  readonly verificationBlockerKind: CodingVerificationBlockerKind;
  readonly actionableEvidence: readonly string[];
  readonly requiresUserInspection: boolean;
}

export function projectMutationVerificationHandoff(
  input: MutationVerificationProjectionInput,
): MutationVerificationHandoff {
  const kind = classifyMutationVerificationHandoff(input);
  const reason = resolveReason(input, kind);
  const nextAction = resolveNextAction(input, kind, reason);
  const crossFile = projectCrossFileVerdict(input);
  return {
    kind,
    reason,
    nextAction,
    changedFiles: [...input.changedFiles],
    failedFiles: [...input.failedFiles],
    taskVerdict: crossFile?.taskVerdict ?? taskVerdictFor(input, kind),
    taskReasons: crossFile?.taskReasons ?? taskReasonsFor(input, kind),
    patchFailureCode: patchFailureCodeFor(kind),
    verificationBlockerKind: verificationBlockerKindFor(input, kind),
    actionableEvidence: actionableEvidenceFor(kind),
    requiresUserInspection:
      input.writerStarted === true &&
      (input.writeEffect === "unknown" || input.writeEffect === "unverified"),
  };
}

function classifyMutationVerificationHandoff(
  input: MutationVerificationProjectionInput,
): MutationVerificationHandoffKind {
  const routeBlocker = input.routeBlocker?.trim();
  const reasonText = [
    input.reason,
    input.nextAction,
    input.verification.reason,
    input.verification.nextAction,
    ...input.failedFiles.map((entry) => entry.reason),
    ...(input.evidence ?? []),
  ]
    .filter((entry): entry is string => Boolean(entry?.trim()))
    .join("\n")
    .toLowerCase();

  if (
    routeBlocker === "post-write-verification" ||
    input.postWriteVerification === "failed"
  ) {
    return "post-write-verification-failed";
  }
  if (routeBlocker === "workspace-boundary") {
    return "mutation-failed";
  }
  if (input.writerStarted && input.writeEffect === "unknown") {
    return "writer-started-unknown";
  }
  if (input.writerStarted && input.writeEffect === "unverified") {
    return "writer-started-unverified";
  }
  if (
    routeBlocker === "final-stale-read" ||
    reasonText.includes("stale-read:") ||
    reasonText.includes("stale-read-blocker") ||
    reasonText.includes("final-stale-read-blocked")
  ) {
    return "stale-read";
  }
  if (
    reasonText.includes("expected to remain unchanged") ||
    reasonText.includes("protected file changed") ||
    reasonText.includes("unchanged file assertion")
  ) {
    return "protected-file-changed";
  }
  if (input.verification.status === "blocked") {
    return "verification-blocked";
  }
  if (input.verification.status === "failed") {
    return "verification-failed";
  }
  if (
    routeBlocker === "patch-parse" ||
    routeBlocker === "patch-verification" ||
    routeBlocker === "dry-run" ||
    reasonText.includes("unsupported") ||
    reasonText.includes("patch-generation-failed")
  ) {
    return "unsupported-patch-shape";
  }
  if (input.failedFiles.length > 0) {
    return "mutation-failed";
  }
  if (input.changedFiles.length > 0 && input.verification.status === "passed") {
    return "write-verified";
  }
  if (input.changedFiles.length > 0) {
    return "mutation-applied";
  }
  return "no-mutation";
}

function resolveReason(
  input: MutationVerificationProjectionInput,
  kind: MutationVerificationHandoffKind,
): string {
  return (
    input.reason?.trim() ||
    input.failedFiles.find((entry) => entry.reason.trim())?.reason.trim() ||
    input.verification.reason?.trim() ||
    defaultReasonFor(kind)
  );
}

function resolveNextAction(
  input: MutationVerificationProjectionInput,
  kind: MutationVerificationHandoffKind,
  reason: string,
): string {
  if (input.nextAction?.trim()) {
    return input.nextAction.trim();
  }
  if (input.verification.nextAction?.trim()) {
    return input.verification.nextAction.trim();
  }
  if (
    kind === "writer-started-unknown" ||
    kind === "writer-started-unverified" ||
    kind === "post-write-verification-failed"
  ) {
    const target = input.targetPath ?? input.changedFiles[0] ?? "the target file";
    return `Re-read ${target}, inspect the current file content, then retry or repair from that current state.`;
  }
  if (kind === "stale-read") {
    return "Re-read the latest target content and rerun the mutation against the current file.";
  }
  if (kind === "protected-file-changed") {
    return "Restore the protected file, then rerun unchanged-file verification.";
  }
  if (kind === "unsupported-patch-shape") {
    return "Regenerate a supported single-file Update File patch against current content.";
  }
  if (kind === "no-mutation") {
    return "Apply a supported mutation or clarify the target before claiming completion.";
  }
  return reason;
}

function taskVerdictFor(
  input: MutationVerificationProjectionInput,
  kind: MutationVerificationHandoffKind,
): CodingTaskSatisfactionVerdict {
  if (
    kind === "no-mutation" ||
    kind === "mutation-failed" ||
    kind === "stale-read" ||
    kind === "unsupported-patch-shape" ||
    kind === "writer-started-unknown" ||
    kind === "writer-started-unverified" ||
    kind === "post-write-verification-failed"
  ) {
    return "insufficient-evidence";
  }
  if (
    input.verification.status === "failed" ||
    input.verification.status === "blocked" ||
    (input.changedFiles.length > 0 &&
      input.verification.status === "skipped") ||
    kind === "verification-failed" ||
    kind === "verification-blocked" ||
    kind === "protected-file-changed"
  ) {
    return "completed-with-caveats";
  }
  return "satisfied";
}

function taskReasonsFor(
  input: MutationVerificationProjectionInput,
  kind: MutationVerificationHandoffKind,
): readonly string[] {
  if (kind === "no-mutation") {
    return ["No file mutation was applied."];
  }
  if (
    input.failedFiles.length > 0 ||
    kind === "stale-read" ||
    kind === "unsupported-patch-shape" ||
    kind === "writer-started-unknown" ||
    kind === "writer-started-unverified" ||
    kind === "post-write-verification-failed"
  ) {
    return ["Workflow stopped on blocker/failure."];
  }
  if (input.verification.status === "failed") {
    return [
      input.verification.reason ??
        "Edit applied but verify failed; repair required.",
    ];
  }
  if (input.verification.status === "blocked") {
    return [
      `Edit applied but verify was blocked (${input.verification.blockerKind ?? "unknown"}); follow next action before continuing.`,
    ];
  }
  if (input.verification.status === "skipped") {
    return [
      input.verification.reason ??
        "Edit applied but selected verification was skipped.",
    ];
  }
  return ["Workflow completed under inspect/edit/verify contract."];
}

function projectCrossFileVerdict(input: MutationVerificationProjectionInput):
  | {
      readonly taskVerdict: CodingTaskSatisfactionVerdict;
      readonly taskReasons: readonly string[];
    }
  | undefined {
  const degradedTargets = input.degradedCrossFileTargets ?? [];
  if (input.crossFileDegradationReason && degradedTargets.length > 0) {
    return {
      taskVerdict: "insufficient-evidence",
      taskReasons: [
        `Cross-file continuation degraded to terminal due to unrecoverable remaining targets: ${degradedTargets.join(", ")}`,
        `degradation-reason: ${input.crossFileDegradationReason}`,
      ],
    };
  }

  const remainingTargets = input.crossFileRemainingTargets ?? [];
  if (remainingTargets.length <= 0) {
    return undefined;
  }

  const failedByReason = input.crossFileFailedByReason ?? [];
  const skippedFiles = input.crossFileSkippedFiles ?? [];
  return {
    taskVerdict: "completed-with-caveats",
    taskReasons: [
      `Cross-file repair partially completed; remaining targets: ${remainingTargets.join(", ")}`,
      ...(failedByReason.length > 0
        ? [
            `Failed-by-reason: ${failedByReason
              .map(
                (item) => `${item.path}=>${item.failureCode} (${item.reason})`,
              )
              .join("; ")}`,
          ]
        : []),
      ...(skippedFiles.length > 0
        ? [
            `Skipped files: ${skippedFiles
              .map((item) => `${item.path} (${item.reason})`)
              .join("; ")}`,
          ]
        : []),
    ],
  };
}

function patchFailureCodeFor(
  kind: MutationVerificationHandoffKind,
): CodingPatchFailureCode {
  switch (kind) {
    case "stale-read":
      return "stale-read";
    case "writer-started-unknown":
    case "mutation-failed":
      return "write-failed";
    case "post-write-verification-failed":
    case "writer-started-unverified":
    case "protected-file-changed":
      return "readback-mismatch";
    case "verification-blocked":
      return "readback-failed";
    case "verification-failed":
      return "patch-generation-failed";
    case "write-verified":
    case "mutation-applied":
    case "unsupported-patch-shape":
    case "no-mutation":
      return "patch-generation-failed";
  }
}

function verificationBlockerKindFor(
  input: MutationVerificationProjectionInput,
  kind: MutationVerificationHandoffKind,
): CodingVerificationBlockerKind {
  if (input.routeBlocker === "write-decision") {
    return "approval-denied";
  }
  if (
    kind === "writer-started-unknown" ||
    kind === "writer-started-unverified" ||
    kind === "post-write-verification-failed" ||
    input.routeBlocker === "workspace-boundary" ||
    input.routeBlocker === "write-application"
  ) {
    return "environment-not-ready";
  }
  return input.verification.blockerKind ?? "unknown";
}

function actionableEvidenceFor(
  kind: MutationVerificationHandoffKind,
): readonly string[] {
  switch (kind) {
    case "stale-read":
      return ["actionable-blocker-kind:stale-read"];
    case "post-write-verification-failed":
      return [
        "actionable-blocker-kind:partial-mutation-failed",
        "actionable-blocker-kind:verification-failed",
      ];
    case "writer-started-unknown":
    case "writer-started-unverified":
    case "mutation-failed":
      return ["actionable-blocker-kind:partial-mutation-failed"];
    case "protected-file-changed":
    case "verification-blocked":
    case "verification-failed":
      return ["actionable-blocker-kind:verification-failed"];
    case "unsupported-patch-shape":
    case "no-mutation":
      return ["actionable-blocker-kind:patch-generation-failed"];
    case "write-verified":
    case "mutation-applied":
      return [];
  }
}

function defaultReasonFor(kind: MutationVerificationHandoffKind): string {
  switch (kind) {
    case "write-verified":
      return "Mutation write was verified.";
    case "mutation-applied":
      return "Mutation was applied without explicit verification failure.";
    case "post-write-verification-failed":
      return "Post-write verification failed after the writer returned.";
    case "verification-blocked":
      return "Verification was blocked.";
    case "verification-failed":
      return "Verification failed.";
    case "protected-file-changed":
      return "A protected file changed but was expected to remain unchanged.";
    case "stale-read":
      return "Final stale-read revalidation blocked the mutation.";
    case "writer-started-unknown":
      return "The writer started, but the final write effect is unknown.";
    case "writer-started-unverified":
      return "The writer started, but the final file content is unverified.";
    case "unsupported-patch-shape":
      return "The patch shape is unsupported by the current mutation lane.";
    case "no-mutation":
      return "No file mutation was applied.";
    case "mutation-failed":
      return "Mutation failed before verified completion.";
  }
}
