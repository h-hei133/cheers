import type {
  TaskCaseId,
  TaskLiveGate,
  TaskLivePolicy,
  TaskLiveSafetyClass,
} from "./types.js";


export type BuiltinTaskLiveEntryId =
  | "single-file-edit"
  | "coordinated-edit"
  | "failed-check-repair"
  | "rollback-recovery"
  | "package-script-impact"
  | "pathless-workspace-question"
  | "owner-context-question"
  | "test-impact-question"
  | "incident-summary-report"
  | "metrics-summary-artifact"
  | "resume-from-context"
  | "readonly-coding-check"
  | "write-planning-dry-run"
  | "label-normalization"
  | "status-consumer-coordination"
  | "assertion-repair"
  | "incident-brief-report"
  | "context-review-resume"
  | "provider-recovery-triage"
  | "owner-receipt-question"
  | "metrics-rollup-artifact";

export type TaskLiveEntryId = BuiltinTaskLiveEntryId | `catalog-${string}`;

export type TaskLiveEntryKind =
  | "write-edit"
  | "write-repair"
  | "write-rollback"
  | "write-adjacent"
  | "pathless-context"
  | "report-artifact"
  | "data-artifact"
  | "continuation"
  | "readonly-coding"
  | "write-planning"
  | "provider-triage";

export type TaskLiveProfile = "broad" | "focused" | "catalog";

export interface TaskLiveEntry {
  readonly entryId: TaskLiveEntryId;
  readonly taskCaseId?: TaskCaseId;
  readonly entryKind: TaskLiveEntryKind;
  readonly shortPrompt: string;
  readonly gate: TaskLiveGate;
  readonly safetyClass: TaskLiveSafetyClass;
  readonly writePolicy: TaskLivePolicy;
  readonly requirements: readonly string[];
  readonly validationPlan: string;
  readonly expectedChangedFiles?: readonly string[];
  readonly targetWorkspaceMode?: "controlled-temp" | "selected-workspace";
  readonly exactBlockers?: readonly string[];
  readonly fallbackProbeExpected?: boolean;
  readonly targetContentMaxChars?: number;
}
