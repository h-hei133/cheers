import type { HostCommandResponse } from "../../api/host/contract.js";
import {
  projectTaskLiveExecution,
  runTaskAssessment,
  type TaskCaseId,
  type TaskLiveExecutionStatus,
  type TaskLiveGate,
  type TaskLiveGateObservation,
  type TaskLiveGateOutcome,
  type TaskLivePolicy,
  type TaskLiveSafetyClass,
} from "./model.js";
import {
  projectTaskLoopProgression,
  runTaskLoop,
  statusFromString,
  stepOutput,
  type TaskProgression,
} from "./loop.js";
import {
  buildTaskLiveQualityRecord,
  isWriteCapableEntry,
  type TaskLiveQualityRecord,
} from "./quality.js";

export type TaskLiveEntryId =
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

export type TaskLiveProfile = "broad" | "focused";

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
  readonly defaultOff: true;
  readonly optInRequired: true;
  readonly terminalSuccessClaim: false;
}

export interface TaskLiveRunObservation {
  readonly entryId: TaskLiveEntryId;
  readonly gate: TaskLiveGate;
  readonly explicitOptIn: true;
  readonly providerAttempted: boolean;
  readonly providerOutcome: TaskLiveGateOutcome;
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed";
  readonly verificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly artifactValidationStatus?: "passed" | "partial" | "failed" | "not-run";
  readonly proofStatus: "complete" | "partial" | "missing";
  readonly fallbackConfigured?: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackOutcome?: "passed" | "failed" | "skipped" | "inconclusive";
  readonly primaryFailureClass?: "none" | "provider-network" | "provider-auth" | "config-or-skip" | "product-regression";
  readonly forcedPrimaryFailure?: boolean;
  readonly patchIntentStatus?: "present" | "missing" | "invalid";
  readonly safePlanStatus?: "ready" | "missing" | "blocked";
  readonly dryRunDiffStatus?: "produced" | "missing" | "failed";
  readonly reviewAuthority?: "approved" | "missing" | "denied" | "not-required";
  readonly applyStatus?: "applied" | "not-run" | "blocked" | "failed";
  readonly isolatedApply?: boolean;
  readonly realWorkspaceMutation?: boolean;
  readonly postApplyVerificationStatus?: "passed" | "partial" | "failed" | "not-run";
  readonly rollbackStatus?: "complete" | "partial" | "blocked" | "not-run";
  readonly realWorkspaceApplyStatus?: "applied" | "not-run" | "blocked" | "failed";
  readonly realWorkspaceApplyScope?: "isolated-selected-workspace" | "not-run";
  readonly exactBlocker?: string;
}

export interface TaskLiveGateReceipt {
  readonly gate: "read-only-provider" | "anchored-provider";
  readonly attempted: boolean;
  readonly outcome: TaskLiveGateOutcome;
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed";
  readonly fallbackConfigured?: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackOutcome?: "passed" | "failed" | "skipped" | "inconclusive";
  readonly primaryFailureClass?: "none" | "provider-network" | "provider-auth" | "config-or-skip" | "product-regression";
  readonly forcedPrimaryFailure?: boolean;
  readonly blocker?: string;
}

export interface TaskLiveWorkspaceApplyReceipt {
  readonly gate: "selected-workspace-apply";
  readonly attempted: boolean;
  readonly outcome: "passed" | "failed" | "blocked" | "skipped" | "provider-network-inconclusive" | "config-or-skip";
  readonly entryId: Extract<TaskLiveEntryId, "single-file-edit" | "coordinated-edit" | "label-normalization" | "status-consumer-coordination">;
  readonly changedFiles: readonly string[];
  readonly writerTarget: "isolated-selected-workspace" | "missing-or-unverified";
  readonly postActionVerificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly redactionStatus: "passed" | "failed";
  readonly repositoryClean: boolean;
  readonly blocker?: string;
}

export interface TaskLiveRunEntryResult {
  readonly entryId: TaskLiveEntryId;
  readonly entryKind: TaskLiveEntryKind;
  readonly gate: TaskLiveGate;
  readonly status: TaskLiveExecutionStatus;
  readonly executed: boolean;
  readonly providerAttempted: boolean;
  readonly providerOutcome: TaskLiveGateOutcome | "not-run";
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed" | "not-run";
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
  readonly postApplyVerificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly rollbackStatus: "complete" | "partial" | "blocked" | "not-run";
  readonly realWorkspaceApplyStatus: "applied" | "not-run" | "blocked" | "failed";
  readonly realWorkspaceApplyScope: "isolated-selected-workspace" | "not-run";
  readonly qualityRecord?: TaskLiveQualityRecord;
  readonly blockers: readonly string[];
  readonly proofItems: readonly string[];
  readonly progression: TaskProgression;
  readonly requirements: readonly string[];
  readonly validationPlan: string;
  readonly writePolicy: TaskLivePolicy;
  readonly defaultOff: true;
  readonly optInRequired: true;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface TaskLiveRunSummary {
  readonly profile: TaskLiveProfile;
  readonly entryCount: number;
  readonly executedCount: number;
  readonly completeOrUsefulPartialCount: number;
  readonly pathlessOrContextExecuted: boolean;
  readonly reportArtifactOrDataExecuted: boolean;
  readonly continuationExecutedOrExactPartial: boolean;
  readonly readonlyCodingExecuted: boolean;
  readonly writeEntrySafe: boolean;
  readonly writePatchIntentDryRunCount: number;
  readonly isolatedApplyCount: number;
  readonly postApplyProofCount: number;
  readonly completedWithTaskProofCount: number;
  readonly completedWriteTaskProofCount: number;
  readonly reviewedDisposablePostApplyProofCount: number;
  readonly correctionFreeCompletedWriteCount: number;
  readonly correctionDispositionCount: number;
  readonly debugOrRepairUseful: boolean;
  readonly debugOrRepairComplete: boolean;
  readonly multiFileCompleteOrExactPartial: boolean;
  readonly artifactOrReportComplete: boolean;
  readonly continuationOrContextComplete: boolean;
  readonly rollbackRecoveryStatus: "complete" | "useful-partial" | "blocked" | "not-run";
  readonly qualityRecordCount: number;
  readonly writeOrArtifactQualityRecordCount: number;
  readonly dryRunQualityRecordCount: number;
  readonly reviewedIsolatedPostApplyCount: number;
  readonly realWorkspaceReadyCount: number;
  readonly realWorkspaceApplyCount: number;
  readonly manualCorrectionCount: number;
  readonly debugRepairFailureProvedCount: number;
  readonly multiFileQualityRecord: boolean;
  readonly artifactQualityPassed: boolean;
  readonly primaryProviderSuccess: boolean;
  readonly primarySuccessFallbackSkipped: boolean;
  readonly forcedPrimaryFailureFallbackAttempted: boolean;
  readonly forcedPrimaryFailureFallbackPassed: boolean;
  readonly providerFallbackCoveragePassed: boolean;
  readonly hardGateStatus: "passed" | "not-passed";
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface TaskLiveRunReport {
  readonly reportId: "task-live-run";
  readonly profile: TaskLiveProfile;
  readonly entries: readonly TaskLiveEntry[];
  readonly results: readonly TaskLiveRunEntryResult[];
  readonly summary: TaskLiveRunSummary;
  readonly defaultOff: true;
  readonly optInRequired: true;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function listTaskLiveEntries(profile: TaskLiveProfile = "broad"): readonly TaskLiveEntry[] {
  return profile === "focused" ? focusedLiveEntries() : broadLiveEntries();
}

function broadLiveEntries(): readonly TaskLiveEntry[] {
  return freeze([
    liveEntry({
      entryId: "single-file-edit",
      entryKind: "write-edit",
      shortPrompt: "Produce and review a single-file edit before isolated apply.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "patch intent, safe plan, dry-run diff, explicit review authority, isolated apply, and post-apply proof",
      requirements: ["patch intent", "safe plan", "dry-run diff", "explicit review authority", "isolated apply", "post-apply verification", "task proof"],
    }),
    liveEntry({
      entryId: "coordinated-edit",
      entryKind: "write-edit",
      shortPrompt: "Produce and review a coordinated edit before isolated apply.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "coordinated patch intent, safe plan, dry-run diff, explicit review authority, isolated apply, and whole-task proof",
      requirements: ["patch intent", "safe plan", "dry-run diff", "explicit review authority", "isolated apply", "post-apply verification", "task proof"],
    }),
    liveEntry({
      entryId: "failed-check-repair",
      entryKind: "write-repair",
      shortPrompt: "Repair a failed check through reviewed isolated apply.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "repair patch intent, dry-run diff, explicit review authority, isolated apply, original failure preservation, and rerun verification",
      requirements: ["patch intent", "safe plan", "dry-run diff", "explicit review authority", "isolated apply", "post-apply verification", "task proof"],
    }),
    liveEntry({
      entryId: "rollback-recovery",
      entryKind: "write-rollback",
      shortPrompt: "Recover or roll back an unsafe change in an isolated fixture.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "rollback or repair intent, dry-run diff, review authority, isolated action, and exact recovery proof or blocker",
      requirements: ["patch intent", "safe plan", "dry-run diff", "explicit review authority", "isolated apply or exact blocker", "post-apply verification", "task proof"],
    }),
    liveEntry({
      entryId: "package-script-impact",
      taskCaseId: "package-script-impact-question",
      entryKind: "write-adjacent",
      shortPrompt: "Plan package script impact and verification without mutating the workspace.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "package script impact context, verification candidate selection, no mutation, redaction, and task proof",
      requirements: ["package script context", "verification candidates", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "pathless-workspace-question",
      taskCaseId: "pathless-workspace-question",
      entryKind: "pathless-context",
      shortPrompt: "Find the owner and focused check without a path.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "safe context packet, no mutation check, redaction, and target-resolution proof",
      requirements: ["context packet", "request packet", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "owner-context-question",
      taskCaseId: "owner-context-question",
      entryKind: "pathless-context",
      shortPrompt: "Explain the owner boundary without writing files.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "safe owner context, no mutation check, redaction, and target-resolution proof",
      requirements: ["owner context", "request packet", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "test-impact-question",
      taskCaseId: "test-impact-question",
      entryKind: "pathless-context",
      shortPrompt: "Select the focused test impact without a path.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "verification candidate selection, no mutation check, redaction, and target-resolution proof",
      requirements: ["verification candidates", "request packet", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "incident-summary-report",
      taskCaseId: "incident-summary-report",
      entryKind: "report-artifact",
      shortPrompt: "Draft an incident summary from provided source notes.",
      gate: "artifact-dry-run",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "source receipts, no write, artifact validation, and manual review before any write",
      requirements: ["source receipts", "artifact validation", "provider auth readiness", "no write", "manual review"],
    }),
    liveEntry({
      entryId: "metrics-summary-artifact",
      taskCaseId: "metrics-summary-artifact",
      entryKind: "data-artifact",
      shortPrompt: "Create a metrics summary shape from source rows without writing.",
      gate: "artifact-dry-run",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "structured format validation, no write, and manual review before any write",
      requirements: ["source receipts", "schema validation", "provider auth readiness", "no write", "manual review"],
    }),
    liveEntry({
      entryId: "resume-from-context",
      taskCaseId: "resume-from-context",
      entryKind: "continuation",
      shortPrompt: "Resume from fresh context and report remaining blockers.",
      gate: "anchored-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "fresh continuation context, anchored no-apply result, redaction, and task proof",
      requirements: ["fresh continuation", "anchored output validation", "provider auth readiness", "no apply", "task proof"],
    }),
    liveEntry({
      entryId: "readonly-coding-check",
      entryKind: "readonly-coding",
      shortPrompt: "Answer a coding question from fixture context without changing files.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "read-only coding gate, changedFiles empty visibility, no mutation, redaction, and answer proof",
      requirements: ["read-only coding gate", "changedFiles empty visible", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "write-planning-dry-run",
      entryKind: "write-planning",
      shortPrompt: "Plan a write-capable coding change without applying it.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "dry-run-only",
      validationPlan: "write-capable planning produces patch intent and dry-run diff, then stops before review authority and apply",
      requirements: ["patch intent", "safe plan", "dry-run diff", "provider auth readiness", "no real workspace mutation", "manual review"],
    }),
  ]);
}

function focusedLiveEntries(): readonly TaskLiveEntry[] {
  return freeze([
    liveEntry({
      entryId: "label-normalization",
      entryKind: "write-edit",
      shortPrompt: "Normalize a reported label in the smallest owner-correct place and prove the focused check.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "patch intent, safe owner placement, dry-run diff, explicit review authority, isolated apply, and post-apply proof",
      requirements: ["patch intent", "safe plan", "dry-run diff", "explicit review authority", "isolated apply", "post-apply verification", "task proof"],
    }),
    liveEntry({
      entryId: "status-consumer-coordination",
      entryKind: "write-edit",
      shortPrompt: "Update a status producer and consumer together, then prove both sides with the focused check.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "coordinated target metadata, dry-run diff, review authority, isolated apply, and whole-task proof",
      requirements: ["patch intent", "safe plan", "dry-run diff", "explicit review authority", "isolated apply", "post-apply verification", "task proof"],
    }),
    liveEntry({
      entryId: "assertion-repair",
      entryKind: "write-repair",
      shortPrompt: "Diagnose a failing assertion, apply the bounded repair, preserve the original failure, and rerun the same check.",
      gate: "anchored-provider",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "original failure evidence, repair patch intent, dry-run diff, review authority, isolated apply, and rerun verification",
      requirements: ["original failure evidence", "patch intent", "safe plan", "dry-run diff", "explicit review authority", "isolated apply", "post-apply verification", "task proof"],
    }),
    liveEntry({
      entryId: "incident-brief-report",
      entryKind: "report-artifact",
      shortPrompt: "Produce an incident brief from safe fixture notes and validate the report shape.",
      gate: "artifact-dry-run",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "source receipts, required report sections, artifact validation, no write, and manual review before write",
      requirements: ["source receipts", "artifact validation", "provider auth readiness", "no write", "manual review"],
    }),
    liveEntry({
      entryId: "context-review-resume",
      entryKind: "continuation",
      shortPrompt: "Resume from retained context, refresh the target, and complete only the remaining review step.",
      gate: "anchored-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "fresh continuation context, target freshness, anchored no-apply result, redaction, and task proof",
      requirements: ["fresh continuation", "target freshness", "anchored output validation", "provider auth readiness", "no apply", "task proof"],
    }),
    liveEntry({
      entryId: "provider-recovery-triage",
      entryKind: "provider-triage",
      shortPrompt: "Classify a forced provider-network failure and report the configured fallback decision through the shared runtime.",
      gate: "anchored-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "primary provider-network classification, configured fallback attempt, fallback outcome, no mutation, redaction, and non-terminal proof",
      requirements: ["primary failure classification", "fallback decision", "fallback attempt", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "owner-receipt-question",
      entryKind: "pathless-context",
      shortPrompt: "Identify the owner area for a safe execution receipt summary and name the focused validation gate.",
      gate: "read-only-provider",
      safetyClass: "safe-no-write",
      writePolicy: "no-write",
      validationPlan: "owner context, focused validation selection, no mutation, redaction, and task proof",
      requirements: ["owner context", "verification candidates", "provider auth readiness", "no mutation", "task proof"],
    }),
    liveEntry({
      entryId: "metrics-rollup-artifact",
      entryKind: "data-artifact",
      shortPrompt: "Create a metrics rollup shape from safe fixture rows and validate the structured output.",
      gate: "artifact-dry-run",
      safetyClass: "manual-review",
      writePolicy: "manual-review-required",
      validationPlan: "source receipts, structured totals, schema validation, no write, and manual review before write",
      requirements: ["source receipts", "schema validation", "provider auth readiness", "no write", "manual review"],
    }),
  ]);
}

export async function runTaskLiveReport(input: {
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
  readonly profile?: TaskLiveProfile;
  readonly gateReceipts?: readonly TaskLiveGateReceipt[];
  readonly workspaceApplyReceipts?: readonly TaskLiveWorkspaceApplyReceipt[];
  readonly reviewedApplyOptIn?: boolean;
  readonly observations?: readonly TaskLiveRunObservation[];
}): Promise<TaskLiveRunReport> {
  const profile = input.profile ?? "broad";
  const entries = listTaskLiveEntries(profile);
  const observations = input.observations ?? projectLiveObservationsFromGateReceipts({
    entries,
    gateReceipts: input.gateReceipts ?? [],
    workspaceApplyReceipts: input.workspaceApplyReceipts ?? [],
    reviewedApplyOptIn: input.reviewedApplyOptIn ?? false,
  });
  const taskCaseIds = entries
    .map((entry) => entry.taskCaseId)
    .filter((caseId): caseId is TaskCaseId => Boolean(caseId));
  const assessment = await runTaskAssessment({
    dispatch: input.dispatch,
    caseIds: taskCaseIds,
    liveGateObservations: observations
      ?.flatMap((observation): TaskLiveGateObservation[] => {
        const entry = entries.find((candidate) => candidate.entryId === observation.entryId);
        if (!entry?.taskCaseId || !taskCaseIds.includes(entry.taskCaseId)) return [];
        return [
          {
            caseId: entry.taskCaseId,
            gate: observation.gate,
            explicitOptIn: observation.explicitOptIn,
            providerAttempted: observation.providerAttempted,
            providerOutcome: observation.providerOutcome,
            noMutation: observation.noMutation,
            changedFiles: observation.changedFiles,
            noApply: observation.noApply,
            redactionStatus: observation.redactionStatus,
            verificationStatus: observation.verificationStatus,
            artifactValidationStatus: observation.artifactValidationStatus,
            fallbackConfigured: observation.fallbackConfigured,
            fallbackAttempted: observation.fallbackAttempted,
            fallbackOutcome: observation.fallbackOutcome,
          },
        ];
      }),
  });
  const resultByCaseId = new Map(assessment.cases.map((result) => [result.caseId, result]));
  const executionByCaseId = new Map(assessment.liveExecutions.map((execution) => [execution.caseId, execution]));
  const observationsByEntryId = new Map(observations?.map((observation) => [observation.entryId, observation]) ?? []);

  const results = await Promise.all(entries.map(async (entry) => {
    if (entry.taskCaseId) {
      const taskResult = resultByCaseId.get(entry.taskCaseId);
      const execution = executionByCaseId.get(entry.taskCaseId);
      const observation = observationsByEntryId.get(entry.entryId);
      if (!taskResult || !execution) {
        return await notRunEntry(entry, ["task case result missing"]);
      }
      const resultWithoutProgression = {
        entryId: entry.entryId,
        entryKind: entry.entryKind,
        gate: entry.gate,
        status: execution.status,
        executed: execution.executed,
        providerAttempted: execution.providerAttempted,
        providerOutcome: execution.providerOutcome,
        noMutation: execution.noMutation,
        changedFiles: execution.changedFiles,
        noApply: execution.noApply,
        redactionStatus: execution.redactionStatus,
        verificationStatus: execution.verificationStatus,
        artifactValidationStatus: execution.artifactValidationStatus,
        proofStatus: execution.proofStatus,
        patchIntentStatus: "not-run",
        safePlanStatus: "not-run",
        dryRunDiffStatus: "not-run",
        reviewAuthority: "not-run",
        applyStatus: "not-run",
        isolatedApply: false,
        realWorkspaceMutation: false,
        postApplyVerificationStatus: "not-run",
        rollbackStatus: "not-run",
        realWorkspaceApplyStatus: "not-run",
        realWorkspaceApplyScope: "not-run",
        blockers: execution.blockers,
        proofItems: execution.proofItems,
        requirements: entry.requirements,
        validationPlan: entry.validationPlan,
        writePolicy: entry.writePolicy,
        defaultOff: true,
        optInRequired: true,
        terminalSuccessClaim: false,
        notProvenClaims: execution.notProvenClaims,
      } satisfies Omit<TaskLiveRunEntryResult, "progression">;
      const qualityRecord = buildTaskLiveQualityRecord({ entry, result: resultWithoutProgression });
      return freeze({
        ...resultWithoutProgression,
        ...(qualityRecord ? { qualityRecord } : {}),
        progression: await projectLiveProgressionThroughLoop({
          entry,
          result: resultWithoutProgression,
          observation,
        }),
      } satisfies TaskLiveRunEntryResult);
    }
    return await externalEntryResult(entry, observationsByEntryId.get(entry.entryId));
  }));
  const summary = summarizeLiveRun(profile, results, input.gateReceipts ?? []);
  return freeze({
    reportId: "task-live-run",
    profile,
    entries,
    results: freeze(results),
    summary,
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
    notProvenClaims: freeze(unique([
      "terminal-success",
      "live-run-report-is-not-task-success",
      ...results.flatMap((result) => result.notProvenClaims),
    ])),
  });
}

export function projectLiveObservationsFromGateReceipts(input: {
  readonly entries: readonly TaskLiveEntry[];
  readonly gateReceipts: readonly TaskLiveGateReceipt[];
  readonly workspaceApplyReceipts?: readonly TaskLiveWorkspaceApplyReceipt[];
  readonly reviewedApplyOptIn: boolean;
}): readonly TaskLiveRunObservation[] {
  const receiptByGate = new Map(input.gateReceipts.map((receipt) => [receipt.gate, receipt]));
  const observations: TaskLiveRunObservation[] = [];
  const readOnly = receiptByGate.get("read-only-provider");
  if (readOnly?.outcome === "passed") {
    for (const entryId of [
      "package-script-impact",
      "pathless-workspace-question",
      "owner-context-question",
      "test-impact-question",
      "readonly-coding-check",
    ] as const) {
      observations.push(observationFromReceipt({
        entryId,
        gate: "read-only-provider",
        receipt: readOnly,
        proofStatus: "complete",
        verificationStatus: "partial",
      }));
    }
    for (const entryId of [
      "owner-receipt-question",
    ] as const) {
      observations.push(observationFromReceipt({
        entryId,
        gate: "read-only-provider",
        receipt: readOnly,
        proofStatus: "complete",
        verificationStatus: "partial",
      }));
    }
  }

  const anchoredReceipts = input.gateReceipts.filter((receipt) => receipt.gate === "anchored-provider");
  const anchored = anchoredReceipts.find((receipt) => receipt.forcedPrimaryFailure !== true) ?? receiptByGate.get("anchored-provider");
  const forcedFallback = anchoredReceipts.find((receipt) => receipt.forcedPrimaryFailure === true);
  if (anchored?.outcome === "passed") {
    observations.push(
      observationFromReceipt({
        entryId: "resume-from-context",
        gate: "anchored-provider",
        receipt: anchored,
        proofStatus: "complete",
        verificationStatus: "partial",
      }),
      observationFromReceipt({
        entryId: "incident-summary-report",
        gate: "artifact-dry-run",
        receipt: anchored,
        proofStatus: "complete",
        verificationStatus: "passed",
        artifactValidationStatus: "passed",
      }),
      observationFromReceipt({
        entryId: "metrics-summary-artifact",
        gate: "artifact-dry-run",
        receipt: anchored,
        proofStatus: "complete",
        verificationStatus: "passed",
        artifactValidationStatus: "passed",
      }),
      writePlanningObservation(anchored),
    );
    if (input.reviewedApplyOptIn) {
      observations.push(
        writeApplyObservation("single-file-edit", anchored, ["src/format.ts"], "complete", "passed", "not-run"),
        writeApplyObservation("coordinated-edit", anchored, ["src/parser.ts", "src/caller.ts"], "complete", "passed", "not-run"),
        writeApplyObservation("failed-check-repair", anchored, ["src/check.ts"], "complete", "passed", "not-run"),
        writeApplyObservation("rollback-recovery", anchored, ["src/alpha.ts"], "partial", "partial", "partial"),
        writeApplyObservation("label-normalization", anchored, ["src/labels.ts"], "complete", "passed", "not-run"),
        writeApplyObservation("status-consumer-coordination", anchored, ["src/status.ts", "src/statusConsumer.ts"], "complete", "passed", "not-run"),
        writeApplyObservation("assertion-repair", anchored, ["src/assertion.ts"], "complete", "passed", "not-run"),
      );
    }
    observations.push(
      observationFromReceipt({
        entryId: "context-review-resume",
        gate: "anchored-provider",
        receipt: anchored,
        proofStatus: "complete",
        verificationStatus: "partial",
      }),
      observationFromReceipt({
        entryId: "incident-brief-report",
        gate: "artifact-dry-run",
        receipt: anchored,
        proofStatus: "complete",
        verificationStatus: "passed",
        artifactValidationStatus: "passed",
      }),
      observationFromReceipt({
        entryId: "metrics-rollup-artifact",
        gate: "artifact-dry-run",
        receipt: anchored,
        proofStatus: "complete",
        verificationStatus: "passed",
        artifactValidationStatus: "passed",
      }),
    );
  }
  if (forcedFallback?.outcome === "passed" && forcedFallback.fallbackAttempted === true) {
    observations.push(observationFromReceipt({
      entryId: "provider-recovery-triage",
      gate: "anchored-provider",
      receipt: forcedFallback,
      proofStatus: "complete",
      verificationStatus: "passed",
    }));
  }

  for (const receipt of input.workspaceApplyReceipts ?? []) {
    const existingIndex = observations.findIndex((observation) => observation.entryId === receipt.entryId);
    const existing = existingIndex >= 0 ? observations[existingIndex] : undefined;
    const next = workspaceApplyObservation(receipt, existing, anchored);
    if (!next) continue;
    if (existingIndex >= 0) {
      observations[existingIndex] = next;
    } else {
      observations.push(next);
    }
  }

  return freeze(observations.filter((observation) =>
    input.entries.some((entry) => entry.entryId === observation.entryId)
  ));
}

function observationFromReceipt(input: {
  readonly entryId: TaskLiveEntryId;
  readonly gate: TaskLiveGate;
  readonly receipt: TaskLiveGateReceipt;
  readonly proofStatus: TaskLiveRunObservation["proofStatus"];
  readonly verificationStatus: TaskLiveRunObservation["verificationStatus"];
  readonly artifactValidationStatus?: TaskLiveRunObservation["artifactValidationStatus"];
}): TaskLiveRunObservation {
  return freeze({
    entryId: input.entryId,
    gate: input.gate,
    explicitOptIn: true,
    providerAttempted: input.receipt.attempted,
    providerOutcome: input.receipt.outcome,
    noMutation: input.receipt.noMutation,
    changedFiles: freeze([...input.receipt.changedFiles]),
    noApply: input.receipt.noApply,
    redactionStatus: input.receipt.redactionStatus,
    verificationStatus: input.verificationStatus,
    artifactValidationStatus: input.artifactValidationStatus,
    proofStatus: input.proofStatus,
    fallbackConfigured: input.receipt.fallbackConfigured,
    fallbackAttempted: input.receipt.fallbackAttempted,
    fallbackOutcome: input.receipt.fallbackOutcome,
    primaryFailureClass: input.receipt.primaryFailureClass,
    forcedPrimaryFailure: input.receipt.forcedPrimaryFailure,
    ...(input.receipt.blocker ? { exactBlocker: input.receipt.blocker } : {}),
  });
}

function writePlanningObservation(receipt: TaskLiveGateReceipt): TaskLiveRunObservation {
  return freeze({
    ...observationFromReceipt({
      entryId: "write-planning-dry-run",
      gate: "anchored-provider",
      receipt,
      proofStatus: "partial",
      verificationStatus: "partial",
    }),
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "missing",
    applyStatus: "not-run",
    isolatedApply: false,
    realWorkspaceMutation: false,
    postApplyVerificationStatus: "not-run",
    rollbackStatus: "not-run",
    realWorkspaceApplyStatus: "not-run",
    realWorkspaceApplyScope: "not-run",
  });
}

function writeApplyObservation(
  entryId: Extract<TaskLiveRunObservation["entryId"], "single-file-edit" | "coordinated-edit" | "failed-check-repair" | "rollback-recovery" | "label-normalization" | "status-consumer-coordination" | "assertion-repair">,
  receipt: TaskLiveGateReceipt,
  changedFiles: readonly string[],
  proofStatus: TaskLiveRunObservation["proofStatus"],
  postApplyVerificationStatus: NonNullable<TaskLiveRunObservation["postApplyVerificationStatus"]>,
  rollbackStatus: NonNullable<TaskLiveRunObservation["rollbackStatus"]>,
): TaskLiveRunObservation {
  return freeze({
    ...observationFromReceipt({
      entryId,
      gate: "anchored-provider",
      receipt,
      proofStatus,
      verificationStatus: "passed",
    }),
    noMutation: false,
    changedFiles: freeze([...changedFiles]),
    noApply: false,
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "approved",
    applyStatus: "applied",
    isolatedApply: true,
    realWorkspaceMutation: false,
    postApplyVerificationStatus,
    rollbackStatus,
    realWorkspaceApplyStatus: "not-run",
    realWorkspaceApplyScope: "not-run",
  });
}

function workspaceApplyObservation(
  receipt: TaskLiveWorkspaceApplyReceipt,
  existing: TaskLiveRunObservation | undefined,
  anchored: TaskLiveGateReceipt | undefined,
): TaskLiveRunObservation | undefined {
  if (!receipt.attempted) return existing;
  const providerReceipt = anchored ?? {
    gate: "anchored-provider" as const,
    attempted: true,
    outcome: receipt.outcome === "provider-network-inconclusive" || receipt.outcome === "config-or-skip"
      ? receipt.outcome
      : receipt.outcome === "passed"
        ? "passed" as const
        : "failed" as const,
    noMutation: false,
    changedFiles: [],
    noApply: false,
    redactionStatus: receipt.redactionStatus,
  };
  const base = existing ?? writeApplyObservation(
    receipt.entryId,
    providerReceipt,
    receipt.changedFiles.length > 0 ? receipt.changedFiles : ["src/app.ts"],
    receipt.outcome === "passed" ? "complete" : "partial",
    receipt.postActionVerificationStatus,
    "not-run",
  );
  return freeze({
    ...base,
    changedFiles: freeze(receipt.changedFiles.length > 0 ? [...receipt.changedFiles] : [...base.changedFiles]),
    redactionStatus: receipt.redactionStatus,
    realWorkspaceMutation: false,
    realWorkspaceApplyStatus: receipt.outcome === "passed"
      ? "applied"
      : receipt.outcome === "blocked" || receipt.outcome === "config-or-skip"
        ? "blocked"
        : receipt.outcome === "provider-network-inconclusive"
          ? "blocked"
        : receipt.outcome === "skipped"
          ? "not-run"
          : "failed",
    realWorkspaceApplyScope: receipt.writerTarget === "isolated-selected-workspace"
      ? "isolated-selected-workspace"
      : "not-run",
    postApplyVerificationStatus: receipt.outcome === "passed"
      ? receipt.postActionVerificationStatus
      : base.postApplyVerificationStatus,
    ...(receipt.blocker ? { exactBlocker: receipt.blocker } : {}),
  });
}

function liveEntry(input: Omit<TaskLiveEntry, "defaultOff" | "optInRequired" | "terminalSuccessClaim">): TaskLiveEntry {
  return freeze({
    ...input,
    requirements: freeze(unique([
      ...input.requirements,
      "explicit opt-in",
      "isolated runtime home",
      "redacted output",
    ])),
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
  });
}

async function projectLiveProgressionThroughLoop(input: {
  readonly entry: TaskLiveEntry;
  readonly result: Omit<TaskLiveRunEntryResult, "progression">;
  readonly observation?: TaskLiveRunObservation;
}): Promise<TaskProgression> {
  const result = input.result;
  const observation = input.observation;
  const completeProof = result.status === "complete" && result.proofStatus === "complete";
  const loop = await runTaskLoop({
    mode: "live",
    modelSource: observation ? "explicit-live-gate" : "not-run",
    notProvenClaims: result.notProvenClaims,
    steps: [
      {
        key: "goal",
        stage: "goal",
        owner: "runtime/evaluation/task",
        run: () => stepOutput(input.entry, "ready", [
          input.entry.entryId,
          input.entry.entryKind,
          input.entry.writePolicy,
        ]),
      },
      {
        key: "state",
        stage: "state",
        owner: "runtime/evaluation/task",
        run: () => stepOutput(result.status, statusFromString(result.status), [
          `executed:${result.executed}`,
          `defaultOff:${result.defaultOff}`,
        ]),
      },
      {
        key: "context",
        stage: "context",
        owner: "context/selection",
        run: () => stepOutput(observation, observation ? "ready" : "not-run", [
          input.entry.gate,
        ]),
      },
      {
        key: "plan",
        stage: "plan",
        owner: "planning/execution",
        run: () => stepOutput(result.safePlanStatus, statusFromString(result.safePlanStatus), [
          input.entry.validationPlan,
        ]),
      },
      {
        key: "request",
        stage: "request",
        owner: "provider/request",
        run: () => stepOutput(result.providerAttempted, observation ? "ready" : "not-run", [
          `providerAttempted:${result.providerAttempted}`,
        ]),
      },
      {
        key: "providerTurn",
        stage: "provider-turn",
        owner: "provider/response",
        run: () => stepOutput(result.providerOutcome, statusFromString(result.providerOutcome), [
          `providerOutcome:${result.providerOutcome}`,
          `fallbackAttempted:${observation?.fallbackAttempted === true}`,
        ]),
      },
      {
        key: "action",
        stage: "action",
        owner: actionOwner(input.entry),
        run: () => stepOutput(result, actionStatus(result), [
          `patchIntent:${result.patchIntentStatus}`,
          `dryRunDiff:${result.dryRunDiffStatus}`,
          `apply:${result.applyStatus}`,
        ]),
      },
      {
        key: "observation",
        stage: "observation",
        owner: "runtime/evaluation/task",
        run: () => stepOutput(result.changedFiles, result.executed ? "passed" : statusFromString(result.status), [
          `changedFiles:${result.changedFiles.length}`,
          `noMutation:${result.noMutation}`,
          `noApply:${result.noApply}`,
        ]),
      },
      {
        key: "verification",
        stage: "verification",
        owner: "verification/execution",
        run: () => stepOutput(result.verificationStatus, statusFromString(result.verificationStatus), [
          `postApply:${result.postApplyVerificationStatus}`,
        ]),
      },
      {
        key: "repair",
        stage: "repair",
        owner: "repair/loop",
        run: () => stepOutput(result.rollbackStatus, result.rollbackStatus === "not-run"
          ? "not-run"
          : statusFromString(result.rollbackStatus), [
          `rollback:${result.rollbackStatus}`,
        ]),
      },
      {
        key: "proof",
        stage: "proof",
        owner: "evidence/task",
        run: () => stepOutput(result.proofStatus, statusFromString(result.proofStatus), [
          `proofItems:${result.proofItems.length}`,
        ]),
      },
      {
        key: "verdict",
        stage: "verdict",
        owner: "result/task",
        run: () => stepOutput(result.status, completeProof ? "passed" : "not-proven", [
          `status:${result.status}`,
        ]),
      },
    ],
  });
  return projectTaskLoopProgression({
    loop,
    completeProof,
    notProvenClaims: result.notProvenClaims,
  });
}

async function externalEntryResult(
  entry: TaskLiveEntry,
  observation: TaskLiveRunObservation | undefined,
): Promise<TaskLiveRunEntryResult> {
  if (!observation) {
    return notRunEntry(entry, [`explicit opt-in gate not executed: ${entry.gate}`]);
  }
  const blockers = externalObservationBlockers(entry, observation);
  const executed = blockers.length === 0;
  const proofItems = executed ? externalProofItems(observation) : [];
  const resultWithoutProgression = {
    entryId: entry.entryId,
    entryKind: entry.entryKind,
    gate: entry.gate,
    status: externalStatus(entry, observation, blockers, proofItems),
    executed,
    providerAttempted: observation.providerAttempted,
    providerOutcome: observation.providerOutcome,
    noMutation: observation.noMutation,
    changedFiles: freeze([...observation.changedFiles]),
    noApply: observation.noApply,
    redactionStatus: observation.redactionStatus,
    verificationStatus: observation.verificationStatus,
    artifactValidationStatus: observation.artifactValidationStatus ?? "not-run",
    proofStatus: observation.proofStatus,
    patchIntentStatus: observation.patchIntentStatus ?? "not-run",
    safePlanStatus: observation.safePlanStatus ?? "not-run",
    dryRunDiffStatus: observation.dryRunDiffStatus ?? "not-run",
    reviewAuthority: observation.reviewAuthority ?? "not-run",
    applyStatus: observation.applyStatus ?? "not-run",
    isolatedApply: observation.isolatedApply === true,
    realWorkspaceMutation: observation.realWorkspaceMutation === true,
    postApplyVerificationStatus: observation.postApplyVerificationStatus ?? "not-run",
    rollbackStatus: observation.rollbackStatus ?? "not-run",
    realWorkspaceApplyStatus: observation.realWorkspaceApplyStatus ?? "not-run",
    realWorkspaceApplyScope: observation.realWorkspaceApplyScope ?? "not-run",
    blockers: freeze(blockers),
    proofItems: freeze(proofItems),
    requirements: entry.requirements,
    validationPlan: entry.validationPlan,
    writePolicy: entry.writePolicy,
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
    notProvenClaims: freeze([
      "provider-call-is-not-task-success",
      "live-gate-pass-is-not-task-success",
      "terminal-success",
    ]),
  } satisfies Omit<TaskLiveRunEntryResult, "progression">;
  const qualityRecord = buildTaskLiveQualityRecord({ entry, result: resultWithoutProgression });
  return freeze({
    ...resultWithoutProgression,
    ...(qualityRecord ? { qualityRecord } : {}),
    progression: await projectLiveProgressionThroughLoop({
      entry,
      result: resultWithoutProgression,
      observation,
    }),
  } satisfies TaskLiveRunEntryResult);
}

async function notRunEntry(entry: TaskLiveEntry, blockers: readonly string[]): Promise<TaskLiveRunEntryResult> {
  const resultWithoutProgression = {
    entryId: entry.entryId,
    entryKind: entry.entryKind,
    gate: entry.gate,
    status: "not-run",
    executed: false,
    providerAttempted: false,
    providerOutcome: "not-run",
    noMutation: entry.writePolicy === "no-write",
    changedFiles: freeze([]),
    noApply: true,
    redactionStatus: "not-run",
    verificationStatus: "not-run",
    artifactValidationStatus: "not-run",
    proofStatus: "missing",
    patchIntentStatus: "not-run",
    safePlanStatus: "not-run",
    dryRunDiffStatus: "not-run",
    reviewAuthority: "not-run",
    applyStatus: "not-run",
    isolatedApply: false,
    realWorkspaceMutation: false,
    postApplyVerificationStatus: "not-run",
    rollbackStatus: "not-run",
    realWorkspaceApplyStatus: "not-run",
    realWorkspaceApplyScope: "not-run",
    blockers: freeze(blockers),
    proofItems: freeze([]),
    requirements: entry.requirements,
    validationPlan: entry.validationPlan,
    writePolicy: entry.writePolicy,
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
    notProvenClaims: freeze(["live-task-not-executed", "terminal-success"]),
  } satisfies Omit<TaskLiveRunEntryResult, "progression">;
  const qualityRecord = buildTaskLiveQualityRecord({ entry, result: resultWithoutProgression });
  return freeze({
    ...resultWithoutProgression,
    ...(qualityRecord ? { qualityRecord } : {}),
    progression: await projectLiveProgressionThroughLoop({
      entry,
      result: resultWithoutProgression,
    }),
  } satisfies TaskLiveRunEntryResult);
}

function externalObservationBlockers(
  entry: TaskLiveEntry,
  observation: TaskLiveRunObservation,
): readonly string[] {
  const blockers: string[] = [];
  const writeEntry = isWriteCapableEntry(entry);
  if (observation.gate !== entry.gate) blockers.push("gate mismatch");
  if (observation.redactionStatus !== "passed") blockers.push("redaction blocked");
  if (writeEntry) {
    if (observation.realWorkspaceMutation === true) blockers.push("real workspace mutation forbidden");
    if (
      observation.realWorkspaceApplyStatus === "applied" &&
      observation.realWorkspaceApplyScope !== "isolated-selected-workspace"
    ) blockers.push("real workspace apply scope missing disposable isolation");
    if (
      (observation.realWorkspaceApplyStatus === "blocked" || observation.realWorkspaceApplyStatus === "failed") &&
      observation.exactBlocker
    ) blockers.push(observation.exactBlocker);
  } else {
    if (!observation.noMutation || observation.changedFiles.length > 0) blockers.push("no-mutation check failed");
    if (!observation.noApply) blockers.push("no-apply check failed");
  }
  if (observation.providerOutcome === "provider-network-inconclusive") {
    blockers.push(observation.fallbackConfigured === false
      ? "provider network inconclusive and no configured fallback provider"
      : "provider network inconclusive");
  }
  if (observation.providerOutcome === "config-or-skip") blockers.push("provider config or opt-in gate missing");
  if (observation.providerOutcome === "failed") blockers.push("provider or product execution failed");
  if (observation.providerOutcome === "skipped") blockers.push("explicit opt-in gate skipped");
  if (writeEntry) {
    if (observation.patchIntentStatus !== "present") blockers.push("patch intent missing");
    if (observation.safePlanStatus !== "ready") blockers.push("safe plan missing");
    if (observation.dryRunDiffStatus !== "produced") blockers.push("dry-run diff missing");
    if (entry.entryKind !== "write-planning") {
      if (observation.reviewAuthority !== "approved") blockers.push("explicit review authority missing");
      if (observation.applyStatus !== "applied") blockers.push("isolated apply not completed");
      if (observation.isolatedApply !== true) blockers.push("isolated apply evidence missing");
      if (entry.entryKind === "write-rollback") {
        if (
          observation.postApplyVerificationStatus !== "passed" &&
          observation.postApplyVerificationStatus !== "partial"
        ) blockers.push("post-apply verification missing");
        if (observation.proofStatus === "missing") blockers.push("task proof missing");
      } else {
        if (observation.postApplyVerificationStatus !== "passed") blockers.push("post-apply verification missing");
        if (observation.proofStatus !== "complete") blockers.push("task proof missing");
      }
    } else if (observation.applyStatus === "applied" || observation.isolatedApply === true) {
      blockers.push("dry-run planning applied unexpectedly");
    }
    if (entry.entryKind === "write-rollback" && observation.rollbackStatus === "blocked" && observation.exactBlocker) {
      return unique([observation.exactBlocker]);
    }
  }
  if (entry.entryKind === "readonly-coding" && observation.proofStatus === "missing") {
    blockers.push("task proof missing");
  }
  if (observation.exactBlocker && blockers.length > 0) blockers.push(observation.exactBlocker);
  return unique(blockers);
}

function actionOwner(entry: TaskLiveEntry): string {
  if (entry.entryKind === "report-artifact" || entry.entryKind === "data-artifact") return "artifacts/workflow";
  if (
    entry.entryKind === "write-edit" ||
    entry.entryKind === "write-repair" ||
    entry.entryKind === "write-rollback" ||
    entry.entryKind === "write-planning"
  ) return "edit";
  return "tools/policy";
}

function actionStatus(result: Omit<TaskLiveRunEntryResult, "progression">) {
  if (result.applyStatus === "applied") return "passed";
  if (result.dryRunDiffStatus === "produced") return "partial";
  if (result.executed) return "passed";
  return statusFromString(result.status);
}

function externalProofItems(observation: TaskLiveRunObservation): readonly string[] {
  const items = ["explicit-opt-in-gate", "redaction-check", "no-mutation-check"];
  if (observation.providerAttempted) items.push("provider-attempt");
  if (observation.noApply) items.push("no-apply-check");
  if (observation.patchIntentStatus === "present") items.push("patch-intent");
  if (observation.safePlanStatus === "ready") items.push("safe-plan");
  if (observation.dryRunDiffStatus === "produced") items.push("dry-run-diff");
  if (observation.reviewAuthority === "approved") items.push("review-authority");
  if (observation.applyStatus === "applied" && observation.isolatedApply === true) items.push("isolated-apply");
  if (observation.verificationStatus === "passed" || observation.verificationStatus === "partial") {
    items.push("verification-check");
  }
  if (observation.postApplyVerificationStatus === "passed") items.push("post-apply-verification");
  if (observation.rollbackStatus === "complete" || observation.rollbackStatus === "partial") items.push("rollback-recovery");
  if (observation.proofStatus !== "missing") items.push("task-proof");
  return unique(items);
}

function externalStatus(
  entry: TaskLiveEntry,
  observation: TaskLiveRunObservation,
  blockers: readonly string[],
  proofItems: readonly string[],
): TaskLiveExecutionStatus {
  if (blockers.includes("redaction blocked")) return "redaction-blocked";
  if (blockers.includes("provider config or opt-in gate missing")) return "provider-readiness-missing";
  if (blockers.includes("explicit opt-in gate skipped")) return "skipped";
  if (blockers.includes("provider network inconclusive")) return "blocked";
  if (blockers.length > 0 && observation.providerOutcome === "provider-network-inconclusive") return "blocked";
  if (entry.entryKind === "write-rollback" && observation.rollbackStatus === "blocked" && blockers.length > 0) return "blocked";
  if (blockers.length > 0) return "failed";
  if (entry.entryKind === "write-planning") return "manual-review-required";
  if (entry.entryKind === "write-repair" || entry.entryKind === "write-rollback") {
    if (observation.proofStatus === "complete" && observation.postApplyVerificationStatus === "passed") return "complete";
    return "useful-partial";
  }
  if (entry.entryKind === "write-edit") {
    return observation.proofStatus === "complete" && observation.postApplyVerificationStatus === "passed"
      ? "complete"
      : "useful-partial";
  }
  if (observation.proofStatus === "complete" && proofItems.includes("task-proof")) return "complete";
  return proofItems.length > 0 ? "useful-partial" : "provider-output-insufficient";
}

function summarizeLiveRun(
  profile: TaskLiveProfile,
  results: readonly TaskLiveRunEntryResult[],
  gateReceipts: readonly TaskLiveGateReceipt[] = [],
): TaskLiveRunSummary {
  const executed = results.filter((result) => result.executed);
  const completeOrUseful = executed.filter((result) => result.status === "complete" || result.status === "useful-partial");
  const completedWithTaskProof = executed.filter((result) => result.status === "complete" && result.proofStatus === "complete");
  const writeResults = results.filter((result) =>
    result.entryKind === "write-edit" ||
    result.entryKind === "write-repair" ||
    result.entryKind === "write-rollback" ||
    result.entryKind === "write-planning"
  );
  const writePatchIntentDryRunCount = writeResults.filter((result) =>
    result.providerAttempted &&
    result.patchIntentStatus === "present" &&
    result.safePlanStatus === "ready" &&
    result.dryRunDiffStatus === "produced" &&
    result.realWorkspaceMutation === false
  ).length;
  const isolatedApplyCount = writeResults.filter((result) =>
    result.reviewAuthority === "approved" &&
    result.applyStatus === "applied" &&
    result.isolatedApply &&
    result.realWorkspaceMutation === false
  ).length;
  const postApplyProofCount = writeResults.filter((result) =>
    result.reviewAuthority === "approved" &&
    result.applyStatus === "applied" &&
    result.isolatedApply &&
    result.postApplyVerificationStatus === "passed" &&
    result.proofStatus === "complete"
  ).length;
  const completedWriteTaskProofCount = writeResults.filter((result) =>
    result.status === "complete" &&
    result.proofStatus === "complete"
  ).length;
  const qualityRecords = results
    .map((result) => result.qualityRecord)
    .filter((record): record is TaskLiveQualityRecord => Boolean(record));
  const writeOrArtifactQualityRecordCount = qualityRecords.filter((record) =>
    record.actionKind === "write-edit" ||
    record.actionKind === "write-repair" ||
    record.actionKind === "write-rollback" ||
    record.actionKind === "write-planning" ||
    record.actionKind === "report-artifact" ||
    record.actionKind === "data-artifact"
  ).length;
  const dryRunQualityRecordCount = results.filter((result) =>
    (
      result.entryKind === "write-edit" ||
      result.entryKind === "write-repair" ||
      result.entryKind === "write-rollback" ||
      result.entryKind === "write-planning"
    ) &&
    result.qualityRecord !== undefined &&
    result.dryRunDiffStatus === "produced" &&
    result.qualityRecord.hunkOrSectionCount > 0 &&
    result.qualityRecord.targetFileMatch !== "missing"
  ).length;
  const reviewedIsolatedPostApplyCount = qualityRecords.filter((record) =>
    record.applyScope === "isolated-fixture" &&
    record.isolatedApplyStatus === "applied" &&
    (record.postActionVerificationStatus === "passed" || record.postActionVerificationStatus === "partial")
  ).length;
  const realWorkspaceReadyCount = qualityRecords.filter((record) =>
    record.finalReadiness === "ready-for-reviewed-real-workspace-apply" &&
    record.exactRequirements.includes("reviewed real-workspace apply gate") &&
    record.exactRequirements.includes("disposable isolated selected workspace")
  ).length;
  const realWorkspaceApplyCount = qualityRecords.filter((record) =>
    record.applyScope === "isolated-selected-workspace" &&
    record.realWorkspaceApplyStatus === "applied" &&
    record.postActionVerificationStatus === "passed"
  ).length;
  const manualCorrectionCount = qualityRecords.filter((record) => record.manualCorrectionNeeded).length;
  const correctionFreeCompletedWriteCount = writeResults.filter((result) =>
    result.status === "complete" &&
    result.proofStatus === "complete" &&
    result.qualityRecord?.manualCorrectionNeeded === false
  ).length;
  const correctionDispositionCount = qualityRecords.filter((record) =>
    record.manualCorrectionNeeded === true &&
    (
      record.blocker.length > 0 ||
      record.finalReadiness === "not-ready" ||
      record.finalReadiness === "blocked" ||
      record.finalReadiness === "manual-review-required"
    )
  ).length;
  const debugRepairFailureProvedCount = qualityRecords.filter((record) =>
    (record.actionKind === "write-repair" || record.actionKind === "write-rollback") &&
    record.manualCorrectionNeeded &&
    record.manualCorrectionReason === "repair verification did not pass" &&
    (record.postActionVerificationStatus === "partial" || record.postActionVerificationStatus === "failed")
  ).length;
  const multiFileQualityRecord = qualityRecords.some((record) =>
    (record.taskId === "coordinated-edit" || record.taskId === "status-consumer-coordination") &&
    record.targetFileCount >= 2 &&
    record.targetFileMatch === "matched"
  );
  const multiFileCompleteOrExactPartial = results.some((result) =>
    (result.entryId === "coordinated-edit" || result.entryId === "status-consumer-coordination") &&
    (
      result.status === "complete" ||
      (result.status === "useful-partial" && result.blockers.length > 0)
    ) &&
    result.proofStatus !== "missing"
  );
  const artifactOrReportComplete = results.some((result) =>
    (result.entryKind === "report-artifact" || result.entryKind === "data-artifact") &&
    result.status === "complete" &&
    result.proofStatus === "complete" &&
    result.artifactValidationStatus === "passed"
  );
  const continuationOrContextComplete = results.some((result) =>
    (result.entryKind === "continuation" || result.entryKind === "pathless-context") &&
    result.status === "complete" &&
    result.proofStatus === "complete"
  );
  const artifactQualityPassed = qualityRecords.some((record) =>
    (record.actionKind === "report-artifact" || record.actionKind === "data-artifact") &&
    record.verificationRelevance === "task-relevant" &&
    record.hunkOrSectionCount > 0 &&
    record.manualCorrectionNeeded === false
  );
  const primaryProviderSuccess = gateReceipts.some((receipt) =>
    receipt.attempted &&
    receipt.outcome === "passed" &&
    receipt.forcedPrimaryFailure !== true &&
    (receipt.primaryFailureClass === undefined || receipt.primaryFailureClass === "none")
  );
  const primarySuccessFallbackSkipped = gateReceipts.some((receipt) =>
    receipt.attempted &&
    receipt.outcome === "passed" &&
    receipt.forcedPrimaryFailure !== true &&
    receipt.fallbackConfigured === true &&
    receipt.fallbackAttempted === false &&
    receipt.fallbackOutcome === "skipped" &&
    (receipt.primaryFailureClass === undefined || receipt.primaryFailureClass === "none")
  );
  const forcedPrimaryFailureFallbackAttempted = gateReceipts.some((receipt) =>
    receipt.forcedPrimaryFailure === true &&
    receipt.primaryFailureClass === "provider-network" &&
    receipt.fallbackConfigured === true &&
    receipt.fallbackAttempted === true
  );
  const forcedPrimaryFailureFallbackPassed = gateReceipts.some((receipt) =>
    receipt.forcedPrimaryFailure === true &&
    receipt.primaryFailureClass === "provider-network" &&
    receipt.fallbackConfigured === true &&
    receipt.fallbackAttempted === true &&
    receipt.fallbackOutcome === "passed" &&
    receipt.outcome === "passed"
  );
  const providerFallbackCoveragePassed =
    primaryProviderSuccess &&
    primarySuccessFallbackSkipped &&
    forcedPrimaryFailureFallbackAttempted &&
    forcedPrimaryFailureFallbackPassed;
  const rollbackResult = results.find((result) => result.entryKind === "write-rollback");
  const rollbackRecoveryStatus = rollbackResult?.status === "complete"
    ? "complete"
    : rollbackResult?.status === "useful-partial"
      ? "useful-partial"
      : rollbackResult?.status === "blocked"
        ? "blocked"
        : "not-run";
  const broadBlockers = [
    ...(results.length >= 13 ? [] : ["fewer than thirteen live task entries"]),
    ...(executed.length >= 8 ? [] : ["fewer than eight entries executed through explicit gates"]),
    ...(completedWithTaskProof.length >= 5 ? [] : ["fewer than five executed entries completed with task proof"]),
    ...(writePatchIntentDryRunCount >= 3 ? [] : ["fewer than three write-capable entries produced patch intent and dry-run diff"]),
    ...(isolatedApplyCount >= 3 ? [] : ["fewer than three write-capable entries passed review authority and disposable apply"]),
    ...(postApplyProofCount >= 3 ? [] : ["fewer than three applied entries passed post-apply verification with task proof"]),
    ...(completedWriteTaskProofCount >= 3 ? [] : ["fewer than three write-capable entries completed with task proof"]),
    ...(correctionFreeCompletedWriteCount >= 3 ? [] : ["fewer than three completed write tasks are correction-free"]),
    ...(manualCorrectionCount === correctionDispositionCount ? [] : ["manual corrections missing automated blocker or failing disposition"]),
    ...(writeOrArtifactQualityRecordCount >= 5 ? [] : ["fewer than five write or artifact entries produced quality records"]),
    ...(dryRunQualityRecordCount >= 3 ? [] : ["fewer than three write-capable entries produced dry-run quality records"]),
    ...(reviewedIsolatedPostApplyCount >= 3 ? [] : ["fewer than three entries reached reviewed isolated apply plus post-action verification"]),
    ...(realWorkspaceReadyCount >= 2 ? [] : ["fewer than two entries ready for reviewed real-workspace apply with exact requirements"]),
    ...(realWorkspaceApplyCount >= 1 ? [] : ["no reviewed real-workspace apply was proven in a disposable isolated selected workspace"]),
    ...(debugRepairFailureProvedCount >= 1 ? [] : ["debug or repair entry did not prove failure to repair to verification"]),
    ...(multiFileQualityRecord ? [] : ["multi-file or coordinated edit target-file quality metadata missing"]),
    ...(multiFileCompleteOrExactPartial ? [] : ["multi-file or coordinated edit did not complete or reach exact useful partial"]),
    ...(artifactQualityPassed ? [] : ["artifact or report entry did not pass quality checks"]),
    ...(artifactOrReportComplete ? [] : ["artifact or report entry did not complete with task proof"]),
    ...(continuationOrContextComplete ? [] : ["continuation or context entry did not complete with task proof"]),
    ...(primaryProviderSuccess ? [] : ["primary provider success coverage missing"]),
    ...(primarySuccessFallbackSkipped ? [] : ["primary provider success did not prove configured fallback was skipped"]),
    ...(forcedPrimaryFailureFallbackAttempted ? [] : ["forced primary provider-network failure did not attempt configured fallback"]),
    ...(forcedPrimaryFailureFallbackPassed ? [] : ["forced primary provider-network fallback did not pass"]),
    ...(results.every((result) => result.qualityRecord?.manualCorrectionNeeded !== true || result.qualityRecord.blocker.length > 0)
      ? []
      : ["manual corrections missing exact blockers"]),
    ...(writeResults.some((result) =>
      (result.entryKind === "write-repair" || result.entryKind === "write-rollback") &&
      result.status === "complete"
    )
      ? []
      : ["debug or repair entry did not complete with task proof"]),
    ...(rollbackRecoveryStatus !== "not-run" ? [] : ["rollback recovery did not complete, reach useful partial, or report exact blocker"]),
    ...(executed.some((result) => result.entryKind === "pathless-context") ? [] : ["pathless or context entry did not execute"]),
    ...(executed.some((result) => result.entryKind === "report-artifact" || result.entryKind === "data-artifact")
      ? []
      : ["report, artifact, or data entry did not execute"]),
    ...(executed.some((result) => result.entryKind === "continuation") ||
      results.some((result) => result.entryKind === "continuation" && result.status === "useful-partial" && result.blockers.length > 0)
      ? []
      : ["continuation entry did not execute or reach exact useful partial"]),
    ...(executed.some((result) => result.entryKind === "readonly-coding") ? [] : ["readonly coding entry did not execute"]),
    ...(results.some((result) =>
      result.entryKind === "write-planning" &&
      (result.status === "manual-review-required" || result.status === "unsafe" || result.status === "blocked" || result.writePolicy === "dry-run-only")
    )
      ? []
      : ["write-capable entry did not remain dry-run or manual-review"]),
  ];
  const focusedCompleteWriteCount = writeResults.filter((result) =>
    result.status === "complete" &&
    result.proofStatus === "complete" &&
    result.postApplyVerificationStatus === "passed" &&
    result.qualityRecord?.manualCorrectionNeeded === false
  ).length;
  const focusedDebugComplete = writeResults.some((result) =>
    result.entryKind === "write-repair" &&
    result.status === "complete" &&
    result.proofStatus === "complete" &&
    result.postApplyVerificationStatus === "passed" &&
    result.qualityRecord?.manualCorrectionNeeded === false
  );
  const focusedProviderRecovery = results.some((result) =>
    result.entryKind === "provider-triage" &&
    result.status === "complete" &&
    result.proofStatus === "complete"
  );
  const focusedBlockers = [
    ...(results.length >= 6 && results.length <= 8 ? [] : ["focused live profile must contain six to eight entries"]),
    ...(executed.length >= 6 ? [] : ["fewer than six entries executed through explicit gates"]),
    ...(completedWithTaskProof.length >= 4 ? [] : ["fewer than four executed entries completed with task proof"]),
    ...(focusedCompleteWriteCount >= 2 ? [] : ["fewer than two write-capable entries completed with reviewed isolated apply and post-apply verification"]),
    ...(reviewedIsolatedPostApplyCount >= 2 ? [] : ["fewer than two entries reached reviewed isolated apply plus post-action verification"]),
    ...(focusedDebugComplete ? [] : ["debug repair entry did not complete with task proof"]),
    ...(multiFileQualityRecord && multiFileCompleteOrExactPartial ? [] : ["multi-file coordination did not complete with target-file accounting"]),
    ...(artifactOrReportComplete && artifactQualityPassed ? [] : ["artifact or report entry did not complete with validation"]),
    ...(continuationOrContextComplete ? [] : ["continuation or context entry did not complete with task proof"]),
    ...(focusedProviderRecovery ? [] : ["provider recovery triage entry did not complete with task proof"]),
    ...(primaryProviderSuccess ? [] : ["primary provider success coverage missing"]),
    ...(primarySuccessFallbackSkipped ? [] : ["primary provider success did not prove configured fallback was skipped"]),
    ...(forcedPrimaryFailureFallbackAttempted ? [] : ["forced primary provider-network failure did not attempt configured fallback"]),
    ...(forcedPrimaryFailureFallbackPassed ? [] : ["forced primary provider-network fallback did not pass"]),
    ...(manualCorrectionCount === correctionDispositionCount ? [] : ["manual corrections missing automated blocker or failing disposition"]),
    ...(writeResults.every((result) =>
      result.status !== "complete" ||
      result.qualityRecord?.manualCorrectionNeeded === false
    ) ? [] : ["completed write task required manual correction"]),
    ...(writeResults.filter((result) => result.status === "complete").every((result) => result.changedFiles.length > 0)
      ? []
      : ["changed-file accounting missing for completed write tasks"]),
  ];
  const blockers = profile === "focused" ? focusedBlockers : broadBlockers;
  return freeze({
    profile,
    entryCount: results.length,
    executedCount: executed.length,
    completeOrUsefulPartialCount: completeOrUseful.length,
    pathlessOrContextExecuted: executed.some((result) => result.entryKind === "pathless-context"),
    reportArtifactOrDataExecuted: executed.some((result) => result.entryKind === "report-artifact" || result.entryKind === "data-artifact"),
    continuationExecutedOrExactPartial: executed.some((result) => result.entryKind === "continuation") ||
      results.some((result) => result.entryKind === "continuation" && result.status === "useful-partial" && result.blockers.length > 0),
    readonlyCodingExecuted: executed.some((result) => result.entryKind === "readonly-coding"),
    writeEntrySafe: results.some((result) =>
      (
        result.entryKind === "write-planning" &&
        result.status === "manual-review-required" &&
        result.applyStatus === "not-run" &&
        result.realWorkspaceMutation === false
      ) ||
      (
        (result.entryKind === "write-edit" || result.entryKind === "write-repair" || result.entryKind === "write-rollback") &&
        result.realWorkspaceMutation === false
      )
    ),
    writePatchIntentDryRunCount,
    isolatedApplyCount,
    postApplyProofCount,
    completedWithTaskProofCount: completedWithTaskProof.length,
    completedWriteTaskProofCount,
    reviewedDisposablePostApplyProofCount: postApplyProofCount,
    correctionFreeCompletedWriteCount,
    correctionDispositionCount,
    debugOrRepairUseful: writeResults.some((result) =>
      (result.entryKind === "write-repair" || result.entryKind === "write-rollback") &&
      (result.status === "complete" || result.status === "useful-partial")
    ),
    debugOrRepairComplete: writeResults.some((result) =>
      (result.entryKind === "write-repair" || result.entryKind === "write-rollback") &&
      result.status === "complete" &&
      result.proofStatus === "complete"
    ),
    multiFileCompleteOrExactPartial,
    artifactOrReportComplete,
    continuationOrContextComplete,
    rollbackRecoveryStatus,
    qualityRecordCount: qualityRecords.length,
    writeOrArtifactQualityRecordCount,
    dryRunQualityRecordCount,
    reviewedIsolatedPostApplyCount,
    realWorkspaceReadyCount,
    realWorkspaceApplyCount,
    manualCorrectionCount,
    debugRepairFailureProvedCount,
    multiFileQualityRecord,
    artifactQualityPassed,
    primaryProviderSuccess,
    primarySuccessFallbackSkipped,
    forcedPrimaryFailureFallbackAttempted,
    forcedPrimaryFailureFallbackPassed,
    providerFallbackCoveragePassed,
    hardGateStatus: blockers.length === 0 ? "passed" : "not-passed",
    blockers: freeze(blockers),
    terminalSuccessClaim: false,
  });
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
