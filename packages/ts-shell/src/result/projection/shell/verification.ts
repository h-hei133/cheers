import type {
  CodingTaskKind,
  CodingVerificationSummary,
} from "../../../orchestration/types.js";

export function buildVerificationResultNote(
  verification: CodingVerificationSummary,
): string {
  if (verification.status === "passed") {
    return "Verification passed.";
  }
  if (verification.status === "blocked") {
    return `Verification blocked (${verification.blockerKind ?? "unknown"}). ${verification.nextAction ?? ""}`.trim();
  }
  if (verification.status === "failed") {
    return `Verification failed: ${verification.reason ?? "command failed"}.`;
  }
  if (verification.status === "not-requested") {
    return "Verification was not requested.";
  }
  return "Verification skipped.";
}

export function buildMutationTaskDelivery(input: {
  readonly taskKind: CodingTaskKind;
  readonly changedFiles: readonly string[];
  readonly failedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly verification: CodingVerificationSummary;
}): string {
  if (input.failedFiles.length > 0) {
    const first = input.failedFiles[0];
    return `Task not completed: ${first?.path ?? "(unknown)"} failed (${first?.reason ?? "unknown reason"}).`;
  }
  if (input.changedFiles.length === 0) {
    return "Task not completed: no file mutation was applied.";
  }
  const changed = input.changedFiles.join(", ");
  const verificationNote = buildVerificationResultNote(input.verification);
  return `${input.taskKind === "write-file" ? "Write completed" : "Edit completed"} for ${changed}. ${verificationNote}`;
}
