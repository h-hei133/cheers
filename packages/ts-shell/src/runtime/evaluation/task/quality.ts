import type {
  TaskLiveEntry,
  TaskLiveEntryId,
  TaskLiveEntryKind,
} from "./liveTypes.js";
import type { TaskLivePolicy } from "./model.js";

export type TaskLiveQualityTargetMatch = "matched" | "partial" | "missing" | "not-applicable";
export type TaskLiveQualityVerificationRelevance = "task-relevant" | "partial" | "missing";
export type TaskLiveQualityApplyScope =
  | "no-write"
  | "dry-run"
  | "isolated-fixture"
  | "isolated-selected-workspace"
  | "blocked";
export type TaskLiveQualityReadiness =
  | "ready-for-reviewed-real-workspace-apply"
  | "applied-in-disposable-workspace"
  | "manual-review-required"
  | "not-ready"
  | "blocked"
  | "not-applicable";

export interface TaskLiveQualityInput {
  readonly entryId: TaskLiveEntryId;
  readonly entryKind: TaskLiveEntryKind;
  readonly writePolicy: TaskLivePolicy;
  readonly status: string;
  readonly executed: boolean;
  readonly changedFiles: readonly string[];
  readonly verificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly artifactValidationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly proofStatus: "complete" | "partial" | "missing";
  readonly patchIntentStatus: "present" | "missing" | "invalid" | "not-run";
  readonly safePlanStatus: "ready" | "missing" | "blocked" | "not-run";
  readonly dryRunDiffStatus: "produced" | "missing" | "failed" | "not-run";
  readonly reviewAuthority: "approved" | "missing" | "denied" | "not-required" | "not-run";
  readonly applyStatus: "applied" | "not-run" | "blocked" | "failed";
  readonly isolatedApply: boolean;
  readonly realWorkspaceMutation: boolean;
  readonly realWorkspaceApplyStatus?: "applied" | "not-run" | "blocked" | "failed";
  readonly realWorkspaceApplyScope?: "isolated-selected-workspace" | "not-run";
  readonly postApplyVerificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly rollbackStatus: "complete" | "partial" | "blocked" | "not-run";
  readonly blockers: readonly string[];
  readonly requirements: readonly string[];
  readonly validationPlan: string;
}

export interface TaskLiveQualityRecord {
  readonly taskId: TaskLiveEntryId;
  readonly actionKind: TaskLiveEntryKind;
  readonly targetFileCount: number;
  readonly targetFileMatch: TaskLiveQualityTargetMatch;
  readonly hunkOrSectionCount: number;
  readonly expectedVerification: string;
  readonly verificationRelevance: TaskLiveQualityVerificationRelevance;
  readonly manualCorrectionNeeded: boolean;
  readonly manualCorrectionReason: string;
  readonly applyScope: TaskLiveQualityApplyScope;
  readonly isolatedApplyStatus: "applied" | "not-run" | "blocked" | "failed";
  readonly realWorkspaceApplyStatus: "applied" | "not-run" | "blocked" | "failed";
  readonly postActionVerificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly finalReadiness: TaskLiveQualityReadiness;
  readonly exactRequirements: readonly string[];
  readonly blocker: string;
  readonly terminalSuccessClaim: false;
}

export function shouldRecordTaskLiveQuality(entry: TaskLiveEntry): boolean {
  return isWriteCapableEntry(entry) || entry.entryKind === "report-artifact" || entry.entryKind === "data-artifact";
}

export function buildTaskLiveQualityRecord(input: {
  readonly entry: TaskLiveEntry;
  readonly result: TaskLiveQualityInput;
}): TaskLiveQualityRecord | undefined {
  if (!shouldRecordTaskLiveQuality(input.entry)) return undefined;
  const result = input.result;
  const targetFileCount = expectedTargetFileCount(input.entry, result);
  const targetMatch = targetFileMatch(input.entry, result, targetFileCount);
  const manualCorrection = manualCorrectionFor(input.entry, result);
  const applyScope = applyScopeFor(input.entry, result);
  const realWorkspaceApplyStatus = result.realWorkspaceApplyStatus ?? "not-run";
  return freeze({
    taskId: input.entry.entryId,
    actionKind: input.entry.entryKind,
    targetFileCount,
    targetFileMatch: targetMatch,
    hunkOrSectionCount: hunkOrSectionCount(input.entry, result, targetFileCount),
    expectedVerification: input.entry.validationPlan,
    verificationRelevance: verificationRelevance(result),
    manualCorrectionNeeded: manualCorrection.needed,
    manualCorrectionReason: manualCorrection.reason,
    applyScope,
    isolatedApplyStatus: result.applyStatus,
    realWorkspaceApplyStatus,
    postActionVerificationStatus: result.postApplyVerificationStatus,
    finalReadiness: finalReadiness(input.entry, result, manualCorrection.needed, realWorkspaceApplyStatus),
    exactRequirements: freeze(exactRequirements(input.entry, result, manualCorrection.needed)),
    blocker: blockerFor(result, manualCorrection.reason),
    terminalSuccessClaim: false,
  });
}

export function isWriteCapableEntry(entry: Pick<TaskLiveEntry, "entryKind">): boolean {
  return entry.entryKind === "write-edit" ||
    entry.entryKind === "write-repair" ||
    entry.entryKind === "write-rollback" ||
    entry.entryKind === "write-planning";
}

function expectedTargetFileCount(entry: TaskLiveEntry, result: TaskLiveQualityInput): number {
  if (entry.expectedChangedFiles && entry.expectedChangedFiles.length > 0) {
    return Math.max(entry.expectedChangedFiles.length, result.changedFiles.length);
  }
  if (entry.entryId === "coordinated-edit" || entry.entryId === "status-consumer-coordination") {
    return Math.max(2, result.changedFiles.length);
  }
  if (entry.entryKind === "report-artifact" || entry.entryKind === "data-artifact") return 1;
  if (isWriteCapableEntry(entry)) return Math.max(1, result.changedFiles.length);
  return result.changedFiles.length;
}

function targetFileMatch(
  entry: TaskLiveEntry,
  result: TaskLiveQualityInput,
  targetFileCount: number,
): TaskLiveQualityTargetMatch {
  if (entry.entryKind === "report-artifact" || entry.entryKind === "data-artifact") {
    return result.artifactValidationStatus === "passed" ? "matched" : "missing";
  }
  if (!isWriteCapableEntry(entry)) return "not-applicable";
  if (result.dryRunDiffStatus !== "produced") return "missing";
  if (entry.entryKind === "write-planning") return "matched";
  if (result.changedFiles.length >= targetFileCount) return "matched";
  return result.changedFiles.length > 0 ? "partial" : "missing";
}

function hunkOrSectionCount(
  entry: TaskLiveEntry,
  result: TaskLiveQualityInput,
  targetFileCount: number,
): number {
  if (entry.entryKind === "report-artifact") return result.artifactValidationStatus === "passed" ? 4 : 0;
  if (entry.entryKind === "data-artifact") return result.artifactValidationStatus === "passed" ? 3 : 0;
  return result.dryRunDiffStatus === "produced" ? targetFileCount : 0;
}

function verificationRelevance(result: TaskLiveQualityInput): TaskLiveQualityVerificationRelevance {
  if (result.postApplyVerificationStatus === "passed" || result.verificationStatus === "passed" || result.artifactValidationStatus === "passed") {
    return "task-relevant";
  }
  if (result.postApplyVerificationStatus === "partial" || result.verificationStatus === "partial" || result.artifactValidationStatus === "partial") {
    return "partial";
  }
  return "missing";
}

function manualCorrectionFor(
  entry: TaskLiveEntry,
  result: TaskLiveQualityInput,
): { readonly needed: boolean; readonly reason: string } {
  if (result.blockers.length > 0) return { needed: true, reason: result.blockers[0] ?? "quality blocker" };
  if (entry.entryKind === "write-planning") return { needed: true, reason: "manual review required before any apply" };
  if (entry.entryKind === "write-rollback" && result.postApplyVerificationStatus !== "passed") {
    return { needed: true, reason: "repair verification did not pass" };
  }
  if ((entry.entryKind === "report-artifact" || entry.entryKind === "data-artifact") && result.artifactValidationStatus !== "passed") {
    return { needed: true, reason: "artifact validation did not pass" };
  }
  if (isWriteCapableEntry(entry) && result.postApplyVerificationStatus !== "passed") {
    return { needed: true, reason: "post-action verification did not pass" };
  }
  return { needed: false, reason: "none" };
}

function applyScopeFor(entry: TaskLiveEntry, result: TaskLiveQualityInput): TaskLiveQualityApplyScope {
  if (result.realWorkspaceApplyStatus === "applied" && result.realWorkspaceApplyScope === "isolated-selected-workspace") {
    return "isolated-selected-workspace";
  }
  if (result.isolatedApply && result.applyStatus === "applied") return "isolated-fixture";
  if (entry.entryKind === "write-planning" || result.dryRunDiffStatus === "produced") return "dry-run";
  if (entry.writePolicy === "no-write") return "no-write";
  return "blocked";
}

function finalReadiness(
  entry: TaskLiveEntry,
  result: TaskLiveQualityInput,
  manualCorrectionNeeded: boolean,
  realWorkspaceApplyStatus: "applied" | "not-run" | "blocked" | "failed",
): TaskLiveQualityReadiness {
  if (realWorkspaceApplyStatus === "applied" && result.realWorkspaceMutation === false) {
    return "applied-in-disposable-workspace";
  }
  if (entry.entryKind === "report-artifact" || entry.entryKind === "data-artifact") {
    return result.artifactValidationStatus === "passed" ? "manual-review-required" : "not-ready";
  }
  if (!isWriteCapableEntry(entry)) return "not-applicable";
  if (manualCorrectionNeeded && entry.entryKind !== "write-planning") return "not-ready";
  if (
    result.patchIntentStatus === "present" &&
    result.safePlanStatus === "ready" &&
    result.dryRunDiffStatus === "produced" &&
    result.realWorkspaceMutation === false
  ) {
    return "ready-for-reviewed-real-workspace-apply";
  }
  return result.blockers.length > 0 ? "blocked" : "not-ready";
}

function exactRequirements(
  entry: TaskLiveEntry,
  result: TaskLiveQualityInput,
  manualCorrectionNeeded: boolean,
): readonly string[] {
  const base = [
    ...entry.requirements,
    ...(isWriteCapableEntry(entry)
      ? [
        "reviewed real-workspace apply gate",
        "disposable isolated selected workspace",
        "post-action verification",
        "rollback or cleanup requirement",
      ]
      : []),
    ...(entry.entryKind === "report-artifact" || entry.entryKind === "data-artifact"
      ? ["content or format quality validation", "manual review before write"]
      : []),
    ...(manualCorrectionNeeded ? [manualCorrectionFor(entry, result).reason] : []),
  ];
  return freeze(unique(base.filter((item) => item.length > 0)));
}

function blockerFor(result: TaskLiveQualityInput, manualCorrectionReason: string): string {
  if (result.blockers.length > 0) return result.blockers.join("; ");
  if (manualCorrectionReason !== "none") return manualCorrectionReason;
  return "";
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
