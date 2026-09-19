import type { ContextSelection } from "../../../context/selection/model.js";
import type { ToolStrategy } from "../../../tools/policy/strategy.js";
import type { VerificationExecution } from "../../../verification/execution/model.js";
import type { VerificationSelection } from "../../../verification/selection/model.js";
import type { ArtifactCorrection, ArtifactReceipt } from "../../../artifacts/workflow/types.js";
import type { RepairAction, RepairDecision } from "../../../repair/loop/model.js";
import type { TaskRequestPacket } from "../../../provider/request/packet.js";
import type { TaskVerdict } from "../../../result/task/verdict.js";
import type { EvaluationCaseId } from "../model.js";
import type { ExecutionPlan } from "../../../planning/execution/model.js";
import type { TaskProofInput } from "../../../evidence/task/proof.js";
import type { TaskLoopRun, TaskProgression } from "./loop.js";

/**
 * Task evaluation contract.
 *
 * The task, case, readiness, and live-execution shapes shared by the run loop, the
 * live readiness classifier, the live projection, and the case catalogue. They live
 * in a leaf module so those layers depend on the contract rather than on the run
 * loop that consumes it; a type-only import back into `./model.js` is erased at
 * emit, but it turns into a runtime cycle the moment one becomes a value import.
 */

export type TaskOutcome =
  | "complete"
  | "partial"
  | "failed"
  | "blocked"
  | "skipped"
  | "unsupported"
  | "not-proven";

export type TaskLiveReadinessStatus =
  | "ready"
  | "executed"
  | "complete"
  | "partial"
  | "failed"
  | "blocked"
  | "skipped"
  | "unsupported"
  | "unsafe"
  | "manual-review-required";

export type TaskLiveReadinessBlocker =
  | "missing provider config"
  | "missing auth readiness"
  | "unsupported task path"
  | "verification unavailable"
  | "artifact validation unavailable"
  | "continuation stale"
  | "provider output insufficient"
  | "redaction blocked"
  | "manual review needed";

export type TaskLiveGate = "read-only-provider" | "anchored-provider" | "provider-readiness" | "artifact-dry-run";

export type TaskLiveExecutionStatus =
  | "not-run"
  | "complete"
  | "useful-partial"
  | "failed"
  | "blocked"
  | "skipped"
  | "unsupported"
  | "unsafe"
  | "manual-review-required"
  | "provider-readiness-missing"
  | "auth-readiness-missing"
  | "verification-unavailable"
  | "artifact-validation-unavailable"
  | "provider-output-insufficient"
  | "redaction-blocked";

export type TaskLiveGateOutcome =
  | "passed"
  | "failed"
  | "provider-network-inconclusive"
  | "config-or-skip"
  | "skipped";

export type TaskLiveSafetyClass = "safe-no-write" | "manual-review" | "unsafe" | "unsupported";

export type TaskLivePolicy = "no-write" | "dry-run-only" | "manual-review-required" | "unsupported";

export type TaskKind =
  | "coding-edit"
  | "debug-repair"
  | "workspace-understanding"
  | "docs-report"
  | "data-artifact"
  | "continuation"
  | "live-triage";

export type TaskPath = "provider" | "tool" | "edit" | "artifact" | "continuation";

export type TaskFailureCategory =
  | "goal unclear"
  | "missing user input"
  | "context not found"
  | "wrong context selected"
  | "context insufficient"
  | "planning weak"
  | "tool strategy weak"
  | "provider output insufficient"
  | "provider failure"
  | "edit failure"
  | "verification not selected"
  | "verification failed"
  | "repair failed"
  | "artifact invalid"
  | "continuation stale"
  | "completion proof missing"
  | "authority missing"
  | "unsupported capability"
  | "environment issue"
  | "redaction or safety block"
  | "unknown";

export type BuiltinTaskCaseId =
  | "single-file-edit"
  | "coordinated-edit"
  | "failed-check-repair"
  | "rollback-recovery"
  | "retry-diagnosis-repair"
  | "pathless-workspace-question"
  | "test-impact-question"
  | "owner-context-question"
  | "package-script-impact-question"
  | "source-report"
  | "structured-artifact"
  | "incident-summary-report"
  | "csv-summary-artifact"
  | "release-note-report"
  | "metrics-summary-artifact"
  | "owner-risk-summary"
  | "unsupported-artifact-export"
  | "resume-from-context"
  | "resume-after-compaction"
  | "live-provider-triage";

export type TaskCaseId = BuiltinTaskCaseId | `catalog-${string}`;

export type TaskVerificationStatus =
  | "passed"
  | "partial"
  | "failed"
  | "blocked"
  | "skipped"
  | "not-run";

export interface TaskWorkspaceFixture {
  readonly fixtureId: string;
  readonly setupSummary: string;
  readonly files: readonly {
    readonly path: string;
    readonly purpose: string;
  }[];
  readonly rawContentExcluded: true;
}

export interface TaskVerificationExpectation {
  readonly verificationId: string;
  readonly commandOrCheck: string;
  readonly expectedStatus: TaskVerificationStatus;
  readonly taskRelevant: true;
}

export interface TaskExpectedOutput {
  readonly kind: "diff" | "artifact" | "analysis" | "continuation";
  readonly summary: string;
  readonly requiredPaths: readonly string[];
}

export interface TaskCaseDefinition {
  readonly caseId: TaskCaseId;
  readonly taskKind: TaskKind;
  readonly taskPath: TaskPath;
  readonly shortPrompt: string;
  readonly workspace: TaskWorkspaceFixture;
  readonly allowedTools: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly successRubric: readonly string[];
  readonly expectedVerification: TaskVerificationExpectation;
  readonly expectedOutput: TaskExpectedOutput;
  readonly expectedEvidenceResultCondition: "complete-proof" | "not-proven" | "blocked" | "skipped";
  readonly expectedOutcome: TaskOutcome;
  readonly baselineOutcome?: TaskOutcome;
  readonly baselineFailureCategories?: readonly TaskFailureCategory[];
  readonly repairValidationEvidence?: {
    readonly status: "passed" | "partial" | "failed" | "not-run";
    readonly check: string;
    readonly originalFailurePreserved: true;
  };
  readonly hostEvaluationCaseId: EvaluationCaseId;
  readonly setupEvaluationCaseIds?: readonly EvaluationCaseId[];
  readonly failureCategories: readonly TaskFailureCategory[];
  readonly redactionExpectations: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface TaskCaseResult {
  readonly caseId: TaskCaseId;
  readonly taskKind: TaskKind;
  readonly taskPath: TaskPath;
  readonly shortPrompt: string;
  readonly beforeOutcome: TaskOutcome;
  readonly outcome: TaskOutcome;
  readonly expectedOutcome: TaskOutcome;
  readonly workspace: TaskWorkspaceFixture;
  readonly allowedTools: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly successRubric: readonly string[];
  readonly expectedVerification: TaskVerificationExpectation;
  readonly contextSelection: ContextSelection;
  readonly executionPlan: ExecutionPlan;
  readonly requestPacket: TaskRequestPacket;
  readonly toolStrategy: ToolStrategy;
  readonly observedVerification: {
    readonly status: TaskVerificationStatus;
    readonly taskRelevant: boolean;
    readonly evidenceVerdict: string;
    readonly hostStatus: string;
  };
  readonly verificationSelection: VerificationSelection;
  readonly expectedOutput: TaskExpectedOutput;
  readonly artifactReceipt?: ArtifactReceipt;
  readonly artifactCorrection?: ArtifactCorrection;
  readonly repairDecision: RepairDecision;
  readonly repairAction: RepairAction;
  readonly verificationExecution: VerificationExecution;
  readonly taskProof: TaskProofInput;
  readonly taskVerdict: TaskVerdict;
  readonly proofRecord: TaskCaseProofRecord;
  readonly taskLoop: TaskLoopRun;
  readonly progression: TaskProgression;
  readonly liveReadiness: TaskLiveReadiness;
  readonly hostEvaluation: TaskHostEvaluationSummary;
  readonly setupEvaluations: readonly TaskHostEvaluationSummary[];
  readonly failureCategories: readonly TaskFailureCategory[];
  readonly beforeBlockers: readonly TaskFailureCategory[];
  readonly changedBlockers: readonly TaskFailureCategory[];
  readonly remainingBlockers: readonly TaskFailureCategory[];
  readonly blockers: readonly string[];
  readonly redactionChecks: readonly {
    readonly label: string;
    readonly passed: boolean;
  }[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface TaskHostEvaluationSummary {
  readonly scenarioId: EvaluationCaseId;
  readonly status: string;
  readonly observedStatus: string;
  readonly observedEvidenceVerdict: string;
  readonly eventCount: number;
  readonly eventCategories: readonly string[];
  readonly blockerCodes: readonly string[];
  readonly blockers: readonly {
    readonly code: string;
  }[];
  readonly redactionChecks: readonly {
    readonly label: string;
    readonly passed: boolean;
  }[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface TaskCaseProofRecord {
  readonly taskKind: TaskKind;
  readonly requiredProof: readonly string[];
  readonly presentProof: readonly string[];
  readonly missingProof: readonly string[];
  readonly validationResult: TaskProofInput["status"];
  readonly evidenceInput: string;
  readonly resultVerdict: string;
  readonly incompleteWhen: readonly string[];
  readonly redactionStatus: "passed" | "failed";
  readonly liveReadinessStatus: TaskLiveReadinessStatus;
  readonly terminalSuccessClaim: false;
}

export interface TaskLiveReadiness {
  readonly caseId: TaskCaseId;
  readonly status: TaskLiveReadinessStatus;
  readonly safetyClass: TaskLiveSafetyClass;
  readonly gate: TaskLiveGate | "missing";
  readonly providerReadiness: "required-at-gate" | "missing" | "not-required";
  readonly authReadiness: "required-at-gate" | "missing" | "not-required";
  readonly toolPolicy: readonly string[];
  readonly writePolicy: TaskLivePolicy;
  readonly requestPacketStatus: string;
  readonly validationPlan: string;
  readonly blockers: readonly TaskLiveReadinessBlocker[];
  readonly requirements: readonly string[];
  readonly hardBlocker: string;
  readonly nextFix: string;
  readonly executed: false;
  readonly evidenceResultStatus: "not-proven";
  readonly defaultOff: true;
  readonly optInRequired: true;
  readonly terminalSuccessClaim: false;
}

export interface TaskLiveGateObservation {
  readonly caseId: TaskCaseId;
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
  readonly fallbackConfigured?: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackOutcome?: "passed" | "failed" | "skipped" | "inconclusive";
}

export interface TaskLiveExecution {
  readonly caseId: TaskCaseId;
  readonly gate: TaskLiveGate | "missing";
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
  readonly blockers: readonly string[];
  readonly proofItems: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly defaultOff: true;
  readonly optInRequired: true;
  readonly terminalSuccessClaim: false;
}

export interface TaskBlockerSummary {
  readonly category: TaskFailureCategory;
  readonly count: number;
  readonly caseIds: readonly TaskCaseId[];
  readonly summary: string;
}

export interface TaskAssessmentResult {
  readonly suiteId: "task-capability-assessment";
  readonly cases: readonly TaskCaseResult[];
  readonly outcomeCounts: Readonly<Record<TaskOutcome, number>>;
  readonly topBlockers: readonly TaskBlockerSummary[];
  readonly liveTriage: {
    readonly status: "skipped" | "ready";
    readonly blockers: readonly string[];
    readonly terminalSuccessClaim: false;
  };
  readonly liveReadiness: readonly TaskLiveReadiness[];
  readonly liveExecutions: readonly TaskLiveExecution[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}
