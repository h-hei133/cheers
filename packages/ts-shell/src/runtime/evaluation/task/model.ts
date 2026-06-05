import type { HostCommandResponse } from "../../api/host/contract.js";
import {
  correctArtifact,
  createArtifactReceipt,
  type ArtifactCorrection,
  type ArtifactReceipt,
} from "../../../artifacts/workflow/model.js";
import {
  selectContext,
  type ContextSelection,
} from "../../../context/selection/model.js";
import {
  buildExecutionPlan,
  type ExecutionPlan,
} from "../../../planning/execution/model.js";
import {
  buildTaskRequestPacket,
  type TaskRequestPacket,
} from "../../../provider/request/packet.js";
import {
  buildTaskProofInput,
  type TaskProofInput,
} from "../../../evidence/task/proof.js";
import {
  projectTaskVerdict,
  type TaskVerdict,
} from "../../../result/task/verdict.js";
import {
  decideRepair,
  executeRepair,
  type RepairAction,
  type RepairDecision,
} from "../../../repair/loop/model.js";
import {
  chooseToolStrategy,
  type ToolStrategy,
} from "../../../tools/policy/strategy.js";
import {
  executeVerification,
  verifyChangedFileCoverage,
  type VerificationExecution,
} from "../../../verification/execution/model.js";
import {
  selectVerification,
  type VerificationSelection,
} from "../../../verification/selection/model.js";
import {
  runEvaluationCase,
  type EvaluationCaseId,
  type EvaluationCaseResult,
} from "../model.js";
import {
  runTaskLoop,
  stepOutput,
  statusFromString,
  type TaskLoopRun,
} from "./loop.js";
import {
  projectCaseProgression,
  type TaskProgression,
} from "./progression.js";

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

interface LoopVerificationOutput {
  readonly verificationSelection: VerificationSelection;
  readonly artifactReceipt?: ArtifactReceipt;
  readonly repairDecision: RepairDecision;
  readonly repairAction: RepairAction;
  readonly artifactCorrection?: ArtifactCorrection;
  readonly verificationExecution: VerificationExecution;
}

export function listTaskCases(): readonly TaskCaseDefinition[] {
  return freeze([
    singleFileEdit(),
    coordinatedEdit(),
    failedCheckRepair(),
    rollbackRecovery(),
    retryDiagnosisRepair(),
    pathlessWorkspaceQuestion(),
    testImpactQuestion(),
    ownerContextQuestion(),
    packageScriptImpactQuestion(),
    sourceReport(),
    structuredArtifact(),
    incidentSummaryReport(),
    csvSummaryArtifact(),
    releaseNoteReport(),
    metricsSummaryArtifact(),
    ownerRiskSummary(),
    unsupportedArtifactExport(),
    resumeFromContext(),
    resumeAfterCompaction(),
    liveProviderTriage(),
  ]);
}

export async function runTaskCase(input: {
  readonly caseId: TaskCaseId;
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
}): Promise<TaskCaseResult> {
  const definition = taskCaseDefinition(input.caseId);
  if (!definition) {
    throw new Error(`Unknown task case: ${input.caseId}`);
  }
  return runDefinedTaskCase(definition, input.dispatch);
}

export async function runTaskAssessment(input: {
  readonly dispatch: (command: unknown) => Promise<HostCommandResponse>;
  readonly caseIds?: readonly TaskCaseId[];
  readonly caseDefinitions?: readonly TaskCaseDefinition[];
  readonly liveGateObservations?: readonly TaskLiveGateObservation[];
}): Promise<TaskAssessmentResult> {
  const caseDefinitionsById = new Map(
    (input.caseDefinitions ?? []).map((definition) => [definition.caseId, definition]),
  );
  const definitions = input.caseIds
    ? input.caseIds.map((caseId) => {
      const definition = caseDefinitionsById.get(caseId) ?? taskCaseDefinition(caseId);
      if (!definition) {
        throw new Error(`Unknown task case: ${caseId}`);
      }
      return definition;
    })
    : listTaskCases();

  const cases: TaskCaseResult[] = [];
  for (const definition of definitions) {
    cases.push(await runDefinedTaskCase(definition, input.dispatch));
  }

  return freeze({
    suiteId: "task-capability-assessment",
    cases,
    outcomeCounts: outcomeCounts(cases),
    topBlockers: summarizeTopBlockers(cases),
    liveTriage: liveTriageFor(cases),
    liveReadiness: freeze(cases.map((result) => result.liveReadiness)),
    liveExecutions: freeze(cases.map((result) => projectTaskLiveExecution({
      result,
      observation: input.liveGateObservations?.find((observation) => observation.caseId === result.caseId),
    }))),
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "task-assessment-run-is-not-task-success",
      ...cases.flatMap((result) => result.notProvenClaims),
    ]),
  });
}

async function runDefinedTaskCase(
  definition: TaskCaseDefinition,
  dispatch: (command: unknown) => Promise<HostCommandResponse>,
): Promise<TaskCaseResult> {
  const allowedTools = allowedToolsFor(definition);
  const taskLoop = await runTaskLoop({
    mode: "deterministic",
    modelSource: "deterministic-evaluation",
    notProvenClaims: ["deterministic-task-loop-run-is-not-task-success"],
    steps: [
      {
        key: "goal",
        stage: "goal",
        owner: "runtime/evaluation/task",
        run: () => stepOutput(definition, "ready", [
          definition.caseId,
          definition.taskKind,
          definition.taskPath,
        ]),
      },
      {
        key: "setupEvaluations",
        stage: "state",
        owner: "runtime/evaluation",
        run: async () => {
          const setupEvaluations: TaskHostEvaluationSummary[] = [];
          for (const setupCaseId of definition.setupEvaluationCaseIds ?? []) {
            setupEvaluations.push(projectHostEvaluationSummary(
              await runEvaluationCase({ caseId: setupCaseId, dispatch }),
            ));
          }
          return stepOutput(setupEvaluations, statusFromString(definition.baselineOutcome ?? definition.expectedOutcome), [
            `before:${definition.baselineOutcome ?? definition.expectedOutcome}`,
            `setup:${setupEvaluations.length}`,
          ]);
        },
      },
      {
        key: "contextSelection",
        stage: "context",
        owner: "context/selection",
        run: (outputs) => {
          const setupEvaluations = loopValue<readonly TaskHostEvaluationSummary[]>(outputs, "setupEvaluations");
          const contextSelection = selectContext({
            taskKind: definition.taskKind,
            taskPath: definition.taskPath,
            shortPrompt: definition.shortPrompt,
            workspaceFiles: definition.workspace.files,
            requiredPaths: definition.expectedOutput.requiredPaths,
            continuationAvailable: setupEvaluations.length > 0 || definition.taskKind !== "continuation",
            failureCategories: definition.failureCategories,
          });
          return stepOutput(contextSelection, statusFromString(contextSelection.state), [
            `selected:${contextSelection.selectedPaths.length}`,
            `refreshed:${contextSelection.refreshed}`,
          ]);
        },
      },
      {
        key: "executionPlan",
        stage: "plan",
        owner: "planning/execution",
        run: (outputs) => {
          const contextSelection = loopValue<ContextSelection>(outputs, "contextSelection");
          const executionPlan = buildExecutionPlan({
            taskKind: definition.taskKind,
            outputKind: definition.expectedOutput.kind,
            allowedTools,
            allowedWrites: definition.allowedWrites,
            successRubric: definition.successRubric,
            context: contextSelection,
          });
          return stepOutput(executionPlan, statusFromString(executionPlan.state), [
            `steps:${executionPlan.steps.length}`,
          ]);
        },
      },
      {
        key: "requestPacket",
        stage: "request",
        owner: "provider/request",
        run: (outputs) => {
          const contextSelection = loopValue<ContextSelection>(outputs, "contextSelection");
          const executionPlan = loopValue<ExecutionPlan>(outputs, "executionPlan");
          const requestPacket = buildTaskRequestPacket({
            shortPrompt: definition.shortPrompt,
            taskKind: definition.taskKind,
            context: contextSelection,
            plan: executionPlan,
          });
          return stepOutput(requestPacket, statusFromString(requestPacket.state), [
            `contextPaths:${requestPacket.contextPaths.length}`,
            `planSteps:${requestPacket.planSteps.length}`,
          ]);
        },
      },
      {
        key: "hostEvaluation",
        stage: "provider-turn",
        owner: "runtime/evaluation",
        run: async () => {
          const hostEvaluation = projectHostEvaluationSummary(await runEvaluationCase({
            caseId: definition.hostEvaluationCaseId,
            dispatch,
          }));
          return stepOutput(hostEvaluation, statusFromString(hostEvaluation.observedStatus), [
            hostEvaluation.scenarioId,
            hostEvaluation.observedEvidenceVerdict,
          ]);
        },
      },
      {
        key: "toolStrategy",
        stage: "action",
        owner: "tools/policy",
        run: (outputs) => {
          const contextSelection = loopValue<ContextSelection>(outputs, "contextSelection");
          const executionPlan = loopValue<ExecutionPlan>(outputs, "executionPlan");
          const requestPacket = loopValue<TaskRequestPacket>(outputs, "requestPacket");
          const toolStrategy = chooseToolStrategy({
            allowedTools,
            plan: executionPlan,
            request: requestPacket,
            proofGap: contextSelection.proofGap,
            changedFiles: definition.allowedWrites,
            taskIntent: definition.shortPrompt,
            artifactContract: definition.expectedOutput.kind === "artifact"
              ? {
                claims: definition.successRubric,
                evidenceIds: definition.expectedVerification.expectedStatus === "passed"
                  ? [definition.expectedVerification.verificationId]
                  : [],
              }
              : undefined,
            failureHistory: [
              ...failureHistoryFor(definition),
              ...verificationFailureHistoryFor(definition).map((failure) => ({
                action: "verify" as const,
                signature: failure.command,
                reason: failure.reason,
              })),
            ],
            budget: { remainingSteps: Math.max(0, definition.allowedTools.length + definition.allowedWrites.length) },
          });
          return stepOutput(toolStrategy, statusFromString(toolStrategy.state), [
            `actions:${toolStrategy.actions.length}`,
            `next:${toolStrategy.nextAction ?? "none"}`,
          ]);
        },
      },
      {
        key: "observedVerification",
        stage: "observation",
        owner: "runtime/evaluation/task",
        run: (outputs) => {
          const hostEvaluation = loopValue<TaskHostEvaluationSummary>(outputs, "hostEvaluation");
          const observedVerification = {
            status: observedVerificationStatus(definition, hostEvaluation),
            taskRelevant: true,
            evidenceVerdict: hostEvaluation.observedEvidenceVerdict,
            hostStatus: hostEvaluation.observedStatus,
          };
          return stepOutput(observedVerification, statusFromString(observedVerification.status), [
            observedVerification.evidenceVerdict,
          ]);
        },
      },
      {
        key: "verification",
        stage: "verification",
        owner: "verification/execution",
        run: (outputs) => {
          const hostEvaluation = loopValue<TaskHostEvaluationSummary>(outputs, "hostEvaluation");
          const toolStrategy = loopValue<ToolStrategy>(outputs, "toolStrategy");
          const contextSelection = loopValue<ContextSelection>(outputs, "contextSelection");
          const verificationSelection = selectVerification({
            taskKind: definition.taskKind,
            taskPath: definition.taskPath,
            expectedStatus: definition.expectedVerification.expectedStatus,
            expectedCheck: definition.expectedVerification.commandOrCheck,
            hostEvidenceVerdict: hostEvaluation.observedEvidenceVerdict,
            hostStatus: hostEvaluation.observedStatus,
            failureCategories: definition.failureCategories,
            changedFiles: definition.allowedWrites,
            taskIntent: definition.shortPrompt,
            proofGap: [
              ...contextSelection.proofGap,
              ...(definition.expectedEvidenceResultCondition === "complete-proof" ? ["completion proof required"] : []),
            ],
            failureHistory: verificationFailureHistoryFor(definition),
          });
          const artifactReceipt = createArtifactReceipt({
            taskKind: definition.taskKind,
            outputKind: definition.expectedOutput.kind,
            requiredPaths: definition.expectedOutput.requiredPaths,
            workspacePaths: definition.workspace.files.map((file) => file.path),
            verificationState: verificationSelection.state,
            failureCategories: definition.failureCategories,
            requiredContentMarkers: definition.successRubric,
            observedContentMarkers: definition.expectedVerification.expectedStatus === "passed"
              ? definition.successRubric
              : [],
            verificationEvidence: definition.expectedVerification.expectedStatus === "passed"
              ? [definition.expectedVerification.verificationId]
              : [],
            claimEvidence: definition.expectedVerification.expectedStatus === "passed"
              ? definition.successRubric.map((claim) => ({
                claim,
                evidenceId: `${definition.expectedVerification.verificationId}:${claim}`,
              }))
              : [],
          });
          const repairDecision = decideRepair({
            taskKind: definition.taskKind,
            verificationState: verificationSelection.state,
            artifactValidationState: artifactReceipt?.validationState,
            failureCategories: definition.failureCategories,
            hostStatus: hostEvaluation.observedStatus,
            repairSignature: definition.shortPrompt,
            failureHistory: failureHistoryFor(definition),
          });
          const repairAction = executeRepair({
            decision: repairDecision,
            actions: toolStrategy.state === "ready" ? toolStrategy.actions : [],
            changedTargetCount: definition.allowedWrites.length,
            validationEvidence: definition.repairValidationEvidence,
          });
          const artifactCorrection = correctArtifact({
            receipt: artifactReceipt,
            actions: toolStrategy.state === "ready" ? toolStrategy.actions : [],
          });
          const verificationExecution = executeVerification({
            selection: verificationSelection,
            strategy: toolStrategy,
            repairAction,
            artifactCorrection,
            contextReady: contextSelection.state === "ready",
            changedFiles: definition.allowedWrites,
          });
          return stepOutput({
            verificationSelection,
            artifactReceipt,
            repairDecision,
            repairAction,
            artifactCorrection,
            verificationExecution,
          }, statusFromString(verificationExecution.state), [
            `eligible:${verificationExecution.evidenceInputEligible}`,
            `artifact:${artifactReceipt?.validationState ?? "not-needed"}`,
          ]);
        },
      },
      {
        key: "repair",
        stage: "repair",
        owner: "repair/loop",
        run: (outputs) => {
          const verification = loopValue<LoopVerificationOutput>(outputs, "verification");
          return stepOutput(verification, verification.repairAction.attempted
            ? statusFromString(verification.repairAction.postValidation)
            : "not-run", [
            `attempted:${verification.repairAction.attempted}`,
            `originalFailurePreserved:${verification.repairAction.originalFailurePreserved}`,
          ]);
        },
      },
      {
        key: "taskProof",
        stage: "proof",
        owner: "evidence/task",
        run: (outputs) => {
          const contextSelection = loopValue<ContextSelection>(outputs, "contextSelection");
          const executionPlan = loopValue<ExecutionPlan>(outputs, "executionPlan");
          const requestPacket = loopValue<TaskRequestPacket>(outputs, "requestPacket");
          const toolStrategy = loopValue<ToolStrategy>(outputs, "toolStrategy");
          const hostEvaluation = loopValue<TaskHostEvaluationSummary>(outputs, "hostEvaluation");
          const verification = loopValue<LoopVerificationOutput>(outputs, "verification");
          const changedFileCoverage = verifyChangedFileCoverage({
            changedFiles: definition.allowedWrites,
            verifiedFiles: verification.verificationExecution.state === "passed"
              ? definition.allowedWrites
              : [],
            verificationState: verification.verificationExecution.state,
          });
          const taskProof = buildTaskProofInput({
            caseId: definition.caseId,
            taskKind: definition.taskKind,
            outputKind: definition.expectedOutput.kind,
            contextState: contextSelection.state,
            contextRefreshed: contextSelection.refreshed,
            selectedPathCount: contextSelection.selectedPaths.length,
            planState: executionPlan.state,
            requestState: requestPacket.state,
            toolStrategyState: toolStrategy.state,
            verificationState: verification.verificationExecution.state,
            verificationEvidenceInputEligible: verification.verificationExecution.evidenceInputEligible,
            verificationResultInputEligible: verification.verificationExecution.resultInputEligible,
            changedFileVerificationComplete: changedFileCoverage.complete,
            repairAttempted: verification.repairAction.attempted,
            repairPostValidation: verification.repairAction.postValidation,
            originalFailurePreserved: verification.repairAction.originalFailurePreserved,
            artifactValidationState: verification.artifactReceipt?.validationState,
            artifactSourceReceiptsAvailable: verification.artifactReceipt?.sourceReceipts.every((source) => source.available),
            artifactSourceReceiptsComplete: verification.artifactReceipt?.sourceReceipts.every((source) => source.available),
            artifactCorrectionAttempted: verification.artifactCorrection?.attempted,
            artifactCorrectionValidationState: verification.artifactCorrection?.validationState,
            hostStatus: hostEvaluation.observedStatus,
          });
          return stepOutput(taskProof, taskProof.status === "complete" ? "passed" : statusFromString(taskProof.status), [
            `missing:${taskProof.missingProof.length}`,
          ]);
        },
      },
      {
        key: "taskVerdict",
        stage: "verdict",
        owner: "result/task",
        run: (outputs) => {
          const taskProof = loopValue<TaskProofInput>(outputs, "taskProof");
          const taskVerdict = projectTaskVerdict({ proof: taskProof });
          return stepOutput(taskVerdict, taskVerdict.completeProof ? "passed" : "not-proven", [
            taskVerdict.verdictId,
          ]);
        },
      },
    ],
  });
  const setupEvaluations = loopValue<readonly TaskHostEvaluationSummary[]>(taskLoop.outputs, "setupEvaluations");
  const contextSelection = loopValue<ContextSelection>(taskLoop.outputs, "contextSelection");
  const executionPlan = loopValue<ExecutionPlan>(taskLoop.outputs, "executionPlan");
  const requestPacket = loopValue<TaskRequestPacket>(taskLoop.outputs, "requestPacket");
  const hostEvaluation = loopValue<TaskHostEvaluationSummary>(taskLoop.outputs, "hostEvaluation");
  const toolStrategy = loopValue<ToolStrategy>(taskLoop.outputs, "toolStrategy");
  const observedVerification = loopValue<TaskCaseResult["observedVerification"]>(taskLoop.outputs, "observedVerification");
  const verification = loopValue<LoopVerificationOutput>(taskLoop.outputs, "verification");
  const {
    verificationSelection,
    artifactReceipt,
    repairDecision,
    repairAction,
    artifactCorrection,
    verificationExecution,
  } = verification;
  const taskProof = loopValue<TaskProofInput>(taskLoop.outputs, "taskProof");
  const taskVerdict = loopValue<TaskVerdict>(taskLoop.outputs, "taskVerdict");
  const liveReadiness = liveReadinessFor(
    definition,
    contextSelection,
    requestPacket,
    toolStrategy,
    verificationExecution,
    artifactReceipt,
  );
  const outcome = classifyOutcome(
    definition,
    hostEvaluation,
    observedVerification.status,
    verificationSelection,
    artifactReceipt,
    repairDecision,
    contextSelection,
    verificationExecution,
    taskVerdict,
  );
  const redactionChecks = [
    ...hostEvaluation.redactionChecks,
    ...definition.redactionExpectations.map((label) => ({ label, passed: true })),
  ];
  const redactionStatus = redactionChecks.every((check) => check.passed) ? "passed" : "failed";
  const proofRecord = proofRecordFor({
    definition,
    taskProof,
    taskVerdict,
    redactionStatus,
    liveReadiness,
  });
  const beforeBlockers = definition.baselineFailureCategories ?? definition.failureCategories;
  const failureCategories = outcome === "complete"
    ? []
    : measuredFailureCategories(
      definition,
      verificationSelection,
      artifactReceipt,
      artifactCorrection,
      repairDecision,
      repairAction,
      contextSelection,
      verificationExecution,
    );

  const resultWithoutProgression = {
    caseId: definition.caseId,
    taskKind: definition.taskKind,
    taskPath: definition.taskPath,
    shortPrompt: definition.shortPrompt,
    beforeOutcome: definition.baselineOutcome ?? definition.expectedOutcome,
    outcome,
    expectedOutcome: definition.expectedOutcome,
    workspace: definition.workspace,
    allowedTools: definition.allowedTools,
    allowedWrites: definition.allowedWrites,
    successRubric: definition.successRubric,
    expectedVerification: definition.expectedVerification,
    contextSelection,
    executionPlan,
    requestPacket,
    toolStrategy,
    observedVerification,
    verificationSelection,
    expectedOutput: definition.expectedOutput,
    artifactReceipt,
    artifactCorrection,
    repairDecision,
    repairAction,
    verificationExecution,
    taskProof,
    taskVerdict,
    proofRecord,
    taskLoop,
    liveReadiness,
    hostEvaluation,
    setupEvaluations,
    failureCategories,
    beforeBlockers,
    changedBlockers: beforeBlockers.filter((category) => !failureCategories.includes(category)),
    remainingBlockers: failureCategories,
    blockers: blockersFor(definition, outcome, hostEvaluation, verificationSelection, artifactReceipt, repairDecision, failureCategories),
    redactionChecks,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "task-case-run-is-not-task-success",
      "host-evaluation-output-is-not-task-success",
      ...hostEvaluation.notProvenClaims,
      ...(outcome === "complete" ? [] : ["task-completion-not-proven"]),
      ...(outcome === "complete" ? [] : taskVerdict.notProvenClaims),
    ]),
  } satisfies Omit<TaskCaseResult, "progression">;

  return freeze({
    ...resultWithoutProgression,
    progression: projectCaseProgression(resultWithoutProgression),
  });
}

function failureHistoryFor(definition: TaskCaseDefinition): readonly {
  readonly action: "repair" | "verify" | "read" | "search" | "edit" | "artifact" | "continue";
  readonly signature: string;
  readonly reason: string;
}[] {
  if (!definition.failureCategories.includes("repair failed") || definition.repairValidationEvidence) {
    return [];
  }
  return [{
    action: "repair",
    signature: definition.shortPrompt,
    reason: definition.failureCategories.includes("context insufficient")
      ? "missing context for repair"
      : "repair failed",
  }];
}

function allowedToolsFor(definition: TaskCaseDefinition): readonly string[] {
  return freeze(unique([
    ...definition.allowedTools,
    ...(definition.expectedOutput.kind === "artifact" ? ["artifact"] : []),
  ]));
}

function verificationFailureHistoryFor(definition: TaskCaseDefinition): readonly {
  readonly command: string;
  readonly status: "failed" | "blocked";
  readonly changedFiles: readonly string[];
  readonly reason: string;
}[] {
  if (!definition.failureCategories.includes("verification failed")) {
    return [];
  }
  return [{
    command: definition.expectedVerification.commandOrCheck,
    status: "failed",
    changedFiles: definition.allowedWrites,
    reason: "task-relevant verification failed",
  }];
}

function proofRecordFor(input: {
  readonly definition: TaskCaseDefinition;
  readonly taskProof: TaskProofInput;
  readonly taskVerdict: TaskVerdict;
  readonly redactionStatus: "passed" | "failed";
  readonly liveReadiness: TaskLiveReadiness;
}): TaskCaseProofRecord {
  return freeze({
    taskKind: input.definition.taskKind,
    requiredProof: freeze([...input.taskProof.requiredProof]),
    presentProof: freeze([...input.taskProof.presentProof]),
    missingProof: freeze([...input.taskProof.missingProof]),
    validationResult: input.taskProof.status,
    evidenceInput: input.taskProof.proofId,
    resultVerdict: input.taskVerdict.verdictId,
    incompleteWhen: incompleteWhenFor(input.taskProof.requiredProof),
    redactionStatus: input.redactionStatus,
    liveReadinessStatus: input.liveReadiness.status,
    terminalSuccessClaim: false,
  });
}

function incompleteWhenFor(requiredProof: readonly string[]): readonly string[] {
  return freeze(requiredProof.map((item) => `missing ${item}`));
}

function liveReadinessFor(
  definition: TaskCaseDefinition,
  contextSelection: ContextSelection,
  requestPacket: TaskRequestPacket,
  toolStrategy: ToolStrategy,
  verificationExecution: VerificationExecution,
  artifactReceipt: ArtifactReceipt | undefined,
): TaskLiveReadiness {
  if (definition.expectedOutcome === "unsupported") {
    return liveReadiness({
      definition,
      status: "unsupported",
      safetyClass: "unsupported",
      gate: "missing",
      writePolicy: "unsupported",
      requestPacket,
      toolStrategy,
      validationPlan: "unsupported task path",
      blockers: ["unsupported task path"],
      requirements: [],
      hardBlocker: "unsupported task path",
      nextFix: "add a sanctioned owner and explicit gate before live execution",
    });
  }
  if (definition.taskKind === "live-triage") {
    return liveReadiness({
      definition,
      status: "ready",
      safetyClass: "safe-no-write",
      gate: "provider-readiness",
      writePolicy: "no-write",
      requestPacket,
      toolStrategy,
      validationPlan: "provider readiness preflight with redaction checks",
      blockers: [],
      requirements: liveGateRequirements("provider-readiness"),
      hardBlocker: "",
      nextFix: "run the provider readiness gate with explicit opt-in and isolated runtime home",
    });
  }
  if (definition.caseId === "pathless-workspace-question") {
    return liveReadiness({
      definition,
      status: "ready",
      safetyClass: "safe-no-write",
      gate: "read-only-provider",
      writePolicy: "no-write",
      requestPacket,
      toolStrategy,
      validationPlan: "read-only fixture result, no mutation check, and redaction check",
      blockers: [],
      requirements: liveGateRequirements("read-only-provider"),
      hardBlocker: "",
      nextFix: "run the read-only provider path through the existing explicit opt-in gate",
    });
  }
  if (definition.caseId === "resume-from-context") {
    return liveReadiness({
      definition,
      status: contextSelection.refreshed ? "ready" : "blocked",
      safetyClass: "safe-no-write",
      gate: "anchored-provider",
      writePolicy: "no-write",
      requestPacket,
      toolStrategy,
      validationPlan: "anchored no-apply result with continuation marker and redaction checks",
      blockers: contextSelection.refreshed ? [] : ["continuation stale"],
      requirements: liveGateRequirements("anchored-provider"),
      hardBlocker: contextSelection.refreshed ? "" : "continuation stale",
      nextFix: contextSelection.refreshed
        ? "run the anchored provider path through the existing explicit opt-in gate"
        : "refresh continuation context before live execution",
    });
  }
  if (definition.allowedWrites.length > 0) {
    if (definition.taskPath === "artifact" && artifactReceipt) {
      return liveReadiness({
        definition,
        status: "ready",
        safetyClass: "manual-review",
        gate: "artifact-dry-run",
        writePolicy: "manual-review-required",
        requestPacket,
        toolStrategy,
        validationPlan: "provider artifact proposal, no write, artifact validation, and manual review",
        blockers: [],
        requirements: liveGateRequirements("artifact-dry-run"),
        hardBlocker: "",
        nextFix: "run artifact dry-run through explicit opt-in, then require manual review before any write",
      });
    }
    return liveReadiness({
      definition,
      status: definition.taskPath === "artifact" ? "manual-review-required" : "unsafe",
      safetyClass: definition.taskPath === "artifact" ? "manual-review" : "unsafe",
      gate: "missing",
      writePolicy: definition.taskPath === "artifact" ? "manual-review-required" : "dry-run-only",
      requestPacket,
      toolStrategy,
      validationPlan: artifactReceipt
        ? "artifact validation must run inside a sanctioned artifact owner before live writing"
        : "write task requires dry-run or manual review before live execution",
      blockers: definition.taskPath === "artifact"
        ? ["manual review needed", "artifact validation unavailable"]
        : ["manual review needed"],
      requirements: ["manual review", "sanctioned dry-run or no-write gate"],
      hardBlocker: definition.taskPath === "artifact"
        ? "artifact validation gate missing for live write"
        : "write safety gate missing for live task execution",
      nextFix: definition.taskPath === "artifact"
        ? "add or select an existing artifact validation gate before live artifact writing"
        : "keep write-capable task in dry-run until an existing safe write gate is selected",
    });
  }
  const blockers: TaskLiveReadinessBlocker[] = [];
  if (
    verificationExecution.state !== "passed" &&
    definition.taskKind !== "continuation" &&
    definition.taskKind !== "workspace-understanding"
  ) {
    blockers.push("verification unavailable");
  }
  if (
    artifactReceipt &&
    artifactReceipt.validationState !== "validation-passed"
  ) {
    blockers.push("artifact validation unavailable");
  }
  if (definition.taskKind === "continuation" && !contextSelection.refreshed) {
    blockers.push("continuation stale");
  }
  return liveReadiness({
    definition,
    status: blockers.length === 0 ? "ready" : "blocked",
    safetyClass: "safe-no-write",
    gate: "read-only-provider",
    writePolicy: "no-write",
    requestPacket,
    toolStrategy,
    validationPlan: "read-only result with no mutation and redaction checks",
    blockers,
    requirements: liveGateRequirements("read-only-provider"),
    hardBlocker: blockers.join("; "),
    nextFix: blockers.length === 0
      ? "run the read-only provider path through the existing explicit opt-in gate"
      : "resolve live blockers before gate execution",
  });
}

function liveReadiness(input: {
  readonly definition: TaskCaseDefinition;
  readonly status: TaskLiveReadinessStatus;
  readonly safetyClass: TaskLiveSafetyClass;
  readonly gate: TaskLiveGate | "missing";
  readonly writePolicy: TaskLivePolicy;
  readonly requestPacket: TaskRequestPacket;
  readonly toolStrategy: ToolStrategy;
  readonly validationPlan: string;
  readonly blockers: readonly TaskLiveReadinessBlocker[];
  readonly requirements: readonly string[];
  readonly hardBlocker: string;
  readonly nextFix: string;
}): TaskLiveReadiness {
  return freeze({
    caseId: input.definition.caseId,
    status: input.status,
    safetyClass: input.safetyClass,
    gate: input.gate,
    providerReadiness: input.gate === "missing" ? "missing" : "required-at-gate",
    authReadiness: input.gate === "missing" ? "missing" : "required-at-gate",
    toolPolicy: freeze([...input.toolStrategy.actions]),
    writePolicy: input.writePolicy,
    requestPacketStatus: input.requestPacket.state,
    validationPlan: input.validationPlan,
    blockers: freeze(unique(input.blockers)),
    requirements: freeze(unique([
      ...input.requirements,
      "explicit opt-in",
      "isolated runtime home",
      "redacted output",
    ])),
    hardBlocker: input.hardBlocker,
    nextFix: input.nextFix,
    executed: false,
    evidenceResultStatus: "not-proven",
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
  });
}

function liveGateRequirements(gate: TaskLiveGate): readonly string[] {
  switch (gate) {
    case "read-only-provider":
      return ["provider config", "auth readiness", "read-only fixture", "no mutation check"];
    case "anchored-provider":
      return ["provider config", "auth readiness", "no apply", "anchored output validation"];
    case "provider-readiness":
      return ["provider config", "auth readiness", "provider readiness preflight"];
    case "artifact-dry-run":
      return ["provider config", "auth readiness", "no write", "artifact validation", "manual review before write"];
  }
}

export function projectTaskLiveExecution(input: {
  readonly result: TaskCaseResult;
  readonly observation?: TaskLiveGateObservation;
}): TaskLiveExecution {
  const readiness = input.result.liveReadiness;
  const observation = input.observation;
  if (!observation) {
    return freeze({
      caseId: input.result.caseId,
      gate: readiness.gate,
      status: liveNotRunStatus(readiness),
      executed: false,
      providerAttempted: false,
      providerOutcome: "not-run",
      noMutation: input.result.allowedWrites.length === 0,
      changedFiles: freeze([]),
      noApply: true,
      redactionStatus: "not-run",
      verificationStatus: "not-run",
      artifactValidationStatus: "not-run",
      proofStatus: "missing",
      blockers: freeze(liveNotRunBlockers(readiness)),
      proofItems: freeze([]),
      notProvenClaims: freeze([
        "live-task-not-executed",
        "terminal-success",
      ]),
      defaultOff: true,
      optInRequired: true,
      terminalSuccessClaim: false,
    });
  }

  const blockers = liveExecutionBlockers(input.result, observation);
  const executed = blockers.length === 0 && observation.explicitOptIn === true;
  const proofItems = liveExecutionProofItems(input.result, observation, executed);
  return freeze({
    caseId: input.result.caseId,
    gate: readiness.gate,
    status: liveExecutionStatus(input.result, observation, blockers, proofItems),
    executed,
    providerAttempted: observation.providerAttempted,
    providerOutcome: observation.providerOutcome,
    noMutation: observation.noMutation,
    changedFiles: freeze([...observation.changedFiles]),
    noApply: observation.noApply,
    redactionStatus: observation.redactionStatus,
    verificationStatus: observation.verificationStatus,
    artifactValidationStatus: observation.artifactValidationStatus ?? "not-run",
    proofStatus: proofItems.length > 0
      ? (input.result.taskVerdict.completeProof ? "complete" : "partial")
      : "missing",
    blockers: freeze(blockers),
    proofItems: freeze(proofItems),
    notProvenClaims: freeze(unique([
      "provider-call-is-not-task-success",
      "live-gate-pass-is-not-task-success",
      "host-output-is-not-task-success",
      "terminal-success",
      ...(input.result.taskVerdict.completeProof ? [] : input.result.taskVerdict.notProvenClaims),
    ])),
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
  });
}

function liveNotRunStatus(readiness: TaskLiveReadiness): TaskLiveExecutionStatus {
  if (readiness.status === "unsupported") return "unsupported";
  if (readiness.status === "unsafe") return "unsafe";
  if (readiness.status === "manual-review-required") return "manual-review-required";
  if (readiness.blockers.includes("missing provider config")) return "provider-readiness-missing";
  if (readiness.blockers.includes("missing auth readiness")) return "auth-readiness-missing";
  if (readiness.blockers.includes("verification unavailable")) return "verification-unavailable";
  if (readiness.blockers.includes("artifact validation unavailable")) return "artifact-validation-unavailable";
  if (readiness.blockers.includes("provider output insufficient")) return "provider-output-insufficient";
  if (readiness.blockers.includes("redaction blocked")) return "redaction-blocked";
  if (readiness.blockers.length > 0) return "blocked";
  return "not-run";
}

function liveNotRunBlockers(readiness: TaskLiveReadiness): readonly string[] {
  if (readiness.blockers.length > 0) {
    return readiness.blockers;
  }
  if (readiness.status === "ready") {
    return [`explicit opt-in gate not executed: ${readiness.gate}`];
  }
  return readiness.hardBlocker ? [readiness.hardBlocker] : ["live execution not run"];
}

function liveExecutionBlockers(
  result: TaskCaseResult,
  observation: TaskLiveGateObservation,
): readonly string[] {
  const blockers: string[] = [];
  if (observation.gate !== result.liveReadiness.gate) {
    blockers.push("gate mismatch");
  }
  if (result.liveReadiness.status === "unsupported") {
    blockers.push("unsupported task path");
  }
  if (result.liveReadiness.status === "unsafe") {
    blockers.push("write safety gate missing for live task execution");
  }
  if (observation.redactionStatus !== "passed") {
    blockers.push("redaction blocked");
  }
  if (!observation.noMutation || observation.changedFiles.length > 0) {
    blockers.push("no-mutation check failed");
  }
  if (!observation.noApply) {
    blockers.push("no-apply check failed");
  }
  if (observation.providerOutcome === "provider-network-inconclusive") {
    blockers.push(observation.fallbackConfigured === false
      ? "provider network inconclusive and no configured fallback provider"
      : "provider network inconclusive");
  }
  if (observation.providerOutcome === "config-or-skip") {
    blockers.push("provider config or opt-in gate missing");
  }
  if (observation.providerOutcome === "failed") {
    blockers.push("provider or product execution failed");
  }
  if (observation.providerOutcome === "skipped") {
    blockers.push("explicit opt-in gate skipped");
  }
  if (
    result.taskPath === "artifact" &&
    observation.artifactValidationStatus !== "passed"
  ) {
    blockers.push("artifact validation unavailable");
  }
  return unique(blockers);
}

function liveExecutionProofItems(
  result: TaskCaseResult,
  observation: TaskLiveGateObservation,
  executed: boolean,
): readonly string[] {
  if (!executed) return [];
  const items = [
    "explicit-opt-in-gate",
    "redaction-check",
    "no-mutation-check",
  ];
  if (observation.providerAttempted) {
    items.push("provider-attempt");
  }
  if (observation.noApply) {
    items.push("no-apply-check");
  }
  if (observation.verificationStatus === "passed" || observation.verificationStatus === "partial") {
    items.push("verification-check");
  }
  if (observation.artifactValidationStatus === "passed") {
    items.push("artifact-validation");
  }
  if (result.taskVerdict.completeProof) {
    items.push("task-proof");
  }
  return unique(items);
}

function liveExecutionStatus(
  result: TaskCaseResult,
  observation: TaskLiveGateObservation,
  blockers: readonly string[],
  proofItems: readonly string[],
): TaskLiveExecutionStatus {
  if (blockers.includes("unsupported task path")) return "unsupported";
  if (blockers.includes("write safety gate missing for live task execution")) return "unsafe";
  if (blockers.includes("redaction blocked")) return "redaction-blocked";
  if (blockers.includes("artifact validation unavailable")) return "artifact-validation-unavailable";
  if (blockers.includes("provider config or opt-in gate missing")) return "provider-readiness-missing";
  if (blockers.includes("explicit opt-in gate skipped")) return "skipped";
  if (blockers.length > 0 && observation.providerOutcome === "provider-network-inconclusive") return "blocked";
  if (blockers.length > 0) return "failed";
  if (result.taskVerdict.completeProof && proofItems.includes("task-proof")) {
    return result.taskPath === "artifact" && observation.artifactValidationStatus !== "passed"
      ? "useful-partial"
      : "complete";
  }
  return proofItems.length > 0 ? "useful-partial" : "provider-output-insufficient";
}

function measuredFailureCategories(
  definition: TaskCaseDefinition,
  verificationSelection: VerificationSelection,
  artifactReceipt: ArtifactReceipt | undefined,
  artifactCorrection: ArtifactCorrection | undefined,
  repairDecision: RepairDecision,
  repairAction: RepairAction,
  contextSelection: ContextSelection,
  verificationExecution: VerificationExecution,
): readonly TaskFailureCategory[] {
  const categories: TaskFailureCategory[] = [];
  if (contextSelection.state === "blocked") {
    categories.push("context insufficient");
  }
  if (verificationSelection.state === "not-selected") {
    categories.push("verification not selected");
  }
  if (verificationExecution.state === "failed") {
    categories.push("verification failed");
  }
  if (
    artifactCorrection?.validationState !== "validation-passed" &&
    (artifactReceipt?.validationState === "invalid" ||
    artifactReceipt?.validationState === "validation-failed" ||
    artifactReceipt?.validationState === "source-missing" ||
    artifactReceipt?.validationState === "unsafe-path")
  ) {
    categories.push("artifact invalid");
  }
  if (
    artifactCorrection?.validationState !== "validation-passed" &&
    repairAction.postValidation !== "passed" &&
    (
      repairDecision.state === "failed" ||
      repairDecision.state === "post-validation-failed" ||
      repairDecision.state === "retry-exhausted"
    )
  ) {
    categories.push("repair failed");
  }
  if (
    (verificationExecution.state === "partial" || verificationExecution.state === "passed") &&
    definition.expectedOutcome !== "skipped" &&
    definition.expectedOutcome !== "unsupported"
  ) {
    categories.push("completion proof missing");
  }
  for (const category of definition.failureCategories) {
    if (
      category !== "context insufficient" &&
      category !== "verification not selected" &&
      category !== "verification failed" &&
      category !== "artifact invalid" &&
      category !== "repair failed" &&
      category !== "completion proof missing" &&
      category !== "authority missing" &&
      category !== "continuation stale"
    ) {
      categories.push(category);
    }
  }
  return freeze(unique(categories));
}

function projectHostEvaluationSummary(result: EvaluationCaseResult): TaskHostEvaluationSummary {
  return freeze({
    scenarioId: result.scenarioId,
    status: result.status,
    observedStatus: result.observedStatus,
    observedEvidenceVerdict: result.observedEvidenceVerdict,
    eventCount: result.eventCount,
    eventCategories: result.eventCategories,
    blockerCodes: result.blockers.map((blocker) => blocker.code),
    blockers: result.blockers.map((blocker) => ({ code: blocker.code })),
    redactionChecks: result.redactionChecks,
    terminalSuccessClaim: false,
    notProvenClaims: result.notProvenClaims,
  });
}

function classifyOutcome(
  definition: TaskCaseDefinition,
  hostEvaluation: TaskHostEvaluationSummary,
  verificationStatus: TaskVerificationStatus,
  verificationSelection: VerificationSelection,
  artifactReceipt: ArtifactReceipt | undefined,
  repairDecision: RepairDecision,
  contextSelection: ContextSelection,
  verificationExecution: VerificationExecution,
  taskVerdict: TaskVerdict,
): TaskOutcome {
  if (hostEvaluation.status === "skipped" || definition.expectedOutcome === "skipped") {
    return "skipped";
  }
  if (hostEvaluation.status === "unsupported" || definition.expectedOutcome === "unsupported") {
    return "unsupported";
  }
  if (taskVerdict.completeProof) {
    return "complete";
  }
  if (hostEvaluation.status === "blocked" || verificationStatus === "blocked") {
    return contextSelection.state === "ready" && verificationExecution.state !== "blocked" ? "partial" : "blocked";
  }
  if (verificationExecution.state === "passed" || verificationExecution.state === "partial") {
    return taskVerdict.completeProof
      ? "complete"
      : "partial";
  }
  if (verificationStatus === "failed") {
    return "failed";
  }
  if (artifactReceipt?.validationState === "validation-failed" || artifactReceipt?.validationState === "invalid") {
    return "failed";
  }
  if (repairDecision.state === "failed" || repairDecision.state === "post-validation-failed") {
    return "failed";
  }
  if (verificationStatus === "partial") {
    return "partial";
  }
  if (
    taskVerdict.completeProof &&
    verificationStatus === "passed" &&
    verificationSelection.evidenceInputEligible &&
    (artifactReceipt === undefined || artifactReceipt.validationState === "validation-passed") &&
    (repairDecision.state === "not-needed" || repairDecision.state === "post-validation-passed")
  ) {
    return "complete";
  }
  return "not-proven";
}

function observedVerificationStatus(
  definition: TaskCaseDefinition,
  hostEvaluation: TaskHostEvaluationSummary,
): TaskVerificationStatus {
  if (definition.expectedVerification.expectedStatus !== "passed") {
    return definition.expectedVerification.expectedStatus;
  }
  return hostEvaluation.observedEvidenceVerdict === "complete" ? "passed" : "not-run";
}

function blockersFor(
  definition: TaskCaseDefinition,
  outcome: TaskOutcome,
  hostEvaluation: TaskHostEvaluationSummary,
  verificationSelection: VerificationSelection,
  artifactReceipt: ArtifactReceipt | undefined,
  repairDecision: RepairDecision,
  failureCategories: readonly TaskFailureCategory[],
): readonly string[] {
  if (outcome === "complete") {
    return [];
  }
  return freeze(unique([
    ...failureCategories.map((category) => `${category}: ${definition.caseId}`),
    ...verificationSelection.blockers.map((blocker) => `${blocker}: ${definition.caseId}`),
    ...(artifactReceipt?.blockers ?? []).map((blocker) => `${blocker}: ${definition.caseId}`),
    ...repairDecision.blockers.map((blocker) => `${blocker}: ${definition.caseId}`),
    ...hostEvaluation.blockers.map((blocker) => blocker.code),
  ]));
}

function outcomeCounts(cases: readonly TaskCaseResult[]): Readonly<Record<TaskOutcome, number>> {
  return freeze({
    complete: cases.filter((result) => result.outcome === "complete").length,
    partial: cases.filter((result) => result.outcome === "partial").length,
    failed: cases.filter((result) => result.outcome === "failed").length,
    blocked: cases.filter((result) => result.outcome === "blocked").length,
    skipped: cases.filter((result) => result.outcome === "skipped").length,
    unsupported: cases.filter((result) => result.outcome === "unsupported").length,
    "not-proven": cases.filter((result) => result.outcome === "not-proven").length,
  });
}

function summarizeTopBlockers(cases: readonly TaskCaseResult[]): readonly TaskBlockerSummary[] {
  const map = new Map<TaskFailureCategory, TaskCaseId[]>();
  for (const result of cases) {
    if (result.outcome === "complete") {
      continue;
    }
    for (const category of result.failureCategories) {
      map.set(category, [...(map.get(category) ?? []), result.caseId]);
    }
  }
  return freeze(
    Array.from(map.entries())
      .map(([category, caseIds]) => ({
        category,
        count: caseIds.length,
        caseIds: freeze(caseIds),
        summary: `${category} blocks ${caseIds.length} task case(s)`,
      }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))
      .slice(0, 3),
  );
}

function liveTriageFor(cases: readonly TaskCaseResult[]): TaskAssessmentResult["liveTriage"] {
  const live = cases.find((result) => result.taskKind === "live-triage");
  if (!live || live.liveReadiness.status === "ready") {
    return freeze({
      status: "ready",
      blockers: live?.liveReadiness.requirements ?? [],
      terminalSuccessClaim: false,
    });
  }
  return freeze({
    status: "skipped",
    blockers: live.liveReadiness.blockers.length > 0
      ? live.liveReadiness.blockers
      : ["live provider triage requires an explicit opt-in gate"],
    terminalSuccessClaim: false,
  });
}

function taskCaseDefinition(caseId: TaskCaseId): TaskCaseDefinition | undefined {
  return listTaskCases().find((definition) => definition.caseId === caseId);
}

function singleFileEdit(): TaskCaseDefinition {
  return baseTask({
    caseId: "single-file-edit",
    taskKind: "coding-edit",
    taskPath: "edit",
    shortPrompt: "Fix the formatter branch and prove the focused test.",
    workspace: fixture("single-file-edit", [
      ["src/format.ts", "primary edit target"],
      ["src/format.test.ts", "focused verification"],
    ]),
    allowedTools: ["read", "edit", "verify"],
    allowedWrites: ["src/format.ts"],
    successRubric: [
      "changes only the selected implementation file",
      "runs the focused verification after the change",
      "result evidence reports complete proof",
    ],
    expectedVerification: verification("focused-format-test", "focused test", "passed"),
    expectedOutput: output("diff", "single implementation diff", ["src/format.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    hostEvaluationCaseId: "mutation-recovery-success",
  });
}

function coordinatedEdit(): TaskCaseDefinition {
  return baseTask({
    caseId: "coordinated-edit",
    taskKind: "coding-edit",
    taskPath: "edit",
    shortPrompt: "Update the parser and its call site together.",
    workspace: fixture("coordinated-edit", [
      ["src/parser.ts", "first edit target"],
      ["src/caller.ts", "second edit target"],
      ["src/parser.test.ts", "whole-task verification"],
    ]),
    allowedTools: ["read", "edit", "verify"],
    allowedWrites: ["src/parser.ts", "src/caller.ts"],
    successRubric: [
      "updates both related files",
      "keeps target ordering deterministic",
      "runs whole-task verification",
    ],
    expectedVerification: verification("parser-suite", "whole-task test", "passed"),
    expectedOutput: output("diff", "multi-target implementation diff", ["src/parser.ts", "src/caller.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    hostEvaluationCaseId: "multi-target-mutation-success",
  });
}

function failedCheckRepair(): TaskCaseDefinition {
  return baseTask({
    caseId: "failed-check-repair",
    taskKind: "debug-repair",
    taskPath: "edit",
    shortPrompt: "Fix the failing assertion and rerun the check.",
    workspace: fixture("failed-check-repair", [
      ["src/check.ts", "buggy implementation"],
      ["src/check.test.ts", "failing verification"],
    ]),
    allowedTools: ["read", "edit", "verify", "repair"],
    allowedWrites: ["src/check.ts"],
    successRubric: [
      "diagnoses the failing verification",
      "applies a focused repair",
      "does not claim success while verification is still failing",
    ],
    expectedVerification: verification("check-test", "failing focused test", "failed"),
    expectedOutput: output("diff", "repair attempt with failed verification", ["src/check.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["verification failed", "repair failed"],
    repairValidationEvidence: {
      status: "passed",
      check: "post-repair focused check",
      originalFailurePreserved: true,
    },
    hostEvaluationCaseId: "apply-only-negative",
    failureCategories: ["verification failed", "repair failed"],
  });
}

function rollbackRecovery(): TaskCaseDefinition {
  return baseTask({
    caseId: "rollback-recovery",
    taskKind: "debug-repair",
    taskPath: "edit",
    shortPrompt: "Repair the two-file change or roll back the unsafe target.",
    workspace: fixture("rollback-recovery", [
      ["src/alpha.ts", "repair target"],
      ["src/beta.ts", "dependent target"],
      ["src/alpha.test.ts", "partial failure verification"],
    ]),
    allowedTools: ["read", "edit", "verify", "repair"],
    allowedWrites: ["src/alpha.ts", "src/beta.ts"],
    successRubric: [
      "preserves original failure facts",
      "uses final rollback validation before completion",
      "requires post-repair verification before success",
    ],
    expectedVerification: verification("rollback-repair-check", "post-repair rollback check", "failed"),
    expectedOutput: output("diff", "rollback repair evidence", ["src/alpha.ts", "src/beta.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["verification failed", "repair failed"],
    repairValidationEvidence: {
      status: "passed",
      check: "post-repair rollback check",
      originalFailurePreserved: true,
    },
    hostEvaluationCaseId: "parallel-tool-partial-failure",
    failureCategories: ["repair failed", "verification failed"],
  });
}

function retryDiagnosisRepair(): TaskCaseDefinition {
  return baseTask({
    caseId: "retry-diagnosis-repair",
    taskKind: "debug-repair",
    taskPath: "edit",
    shortPrompt: "Diagnose the retry failure and apply the bounded fix.",
    workspace: fixture("retry-diagnosis-repair", [
      ["src/retry.ts", "repair target"],
      ["src/retry.test.ts", "focused failure check"],
      ["src/backoff.ts", "related context"],
    ]),
    allowedTools: ["read", "edit", "verify", "repair"],
    allowedWrites: ["src/retry.ts"],
    successRubric: [
      "preserves the original failed retry check",
      "applies one bounded repair to the retry target",
      "requires post-repair verification before completion",
    ],
    expectedVerification: verification("retry-repair-check", "post-repair retry check", "failed"),
    expectedOutput: output("diff", "retry repair evidence", ["src/retry.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["verification failed", "repair failed"],
    repairValidationEvidence: {
      status: "passed",
      check: "post-repair retry check",
      originalFailurePreserved: true,
    },
    hostEvaluationCaseId: "apply-only-negative",
    failureCategories: ["verification failed", "repair failed"],
  });
}

function pathlessWorkspaceQuestion(): TaskCaseDefinition {
  return baseTask({
    caseId: "pathless-workspace-question",
    taskKind: "workspace-understanding",
    taskPath: "tool",
    shortPrompt: "Find why the runtime target selection is wrong.",
    workspace: fixture("pathless-workspace-question", [
      ["package.json", "script and package map"],
      ["src/runtime/selector.ts", "likely target without prompt path hint"],
      ["src/runtime/selector.test.ts", "likely verification"],
    ]),
    allowedTools: ["read", "search", "verify"],
    allowedWrites: [],
    successRubric: [
      "finds relevant workspace context without a file hint",
      "does not infer write authority",
      "reports missing provider or context blockers truthfully",
    ],
    expectedVerification: verification("target-selection-review", "context sufficiency check", "blocked"),
    expectedOutput: output("analysis", "ranked target and missing facts", ["src/runtime/selector.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "blocked",
    baselineFailureCategories: ["context insufficient", "authority missing"],
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient", "authority missing"],
  });
}

function testImpactQuestion(): TaskCaseDefinition {
  return baseTask({
    caseId: "test-impact-question",
    taskKind: "workspace-understanding",
    taskPath: "tool",
    shortPrompt: "Find the focused check for the flaky cache behavior.",
    workspace: fixture("test-impact-question", [
      ["package.json", "script map"],
      ["src/cache/store.ts", "likely target without prompt path hint"],
      ["src/cache/store.test.ts", "focused verification candidate"],
      ["src/http/client.ts", "nearby but non-target implementation"],
    ]),
    allowedTools: ["read", "search", "verify"],
    allowedWrites: [],
    successRubric: [
      "selects the likely implementation and focused test without a path hint",
      "records nearby context as selected evidence",
      "does not treat target discovery as mutation authority",
    ],
    expectedVerification: verification("cache-test-impact", "context sufficiency check", "blocked"),
    expectedOutput: output("analysis", "ranked cache target and focused check", ["src/cache/store.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "blocked",
    baselineFailureCategories: ["context insufficient", "authority missing"],
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient", "authority missing"],
  });
}

function ownerContextQuestion(): TaskCaseDefinition {
  return baseTask({
    caseId: "owner-context-question",
    taskKind: "workspace-understanding",
    taskPath: "tool",
    shortPrompt: "Which owner handles report-safe execution receipts?",
    workspace: fixture("owner-context-question", [
      ["src/runtime/execution/executionService.ts", "execution boundary owner"],
      ["src/runtime/execution/receipt.ts", "report-safe receipt owner"],
      ["src/tools/policy/effects.ts", "tool effect policy"],
    ]),
    allowedTools: ["read", "search", "verify"],
    allowedWrites: [],
    successRubric: [
      "resolves the owner domain from workspace evidence",
      "keeps execution receipts separate from task success",
      "reports the verification check needed before completion",
    ],
    expectedVerification: verification("execution-owner-review", "context sufficiency check", "blocked"),
    expectedOutput: output("analysis", "owner domain and receipt boundary", ["src/runtime/execution/receipt.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "blocked",
    baselineFailureCategories: ["context insufficient"],
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient"],
  });
}

function packageScriptImpactQuestion(): TaskCaseDefinition {
  return baseTask({
    caseId: "package-script-impact-question",
    taskKind: "workspace-understanding",
    taskPath: "tool",
    shortPrompt: "Find which focused script proves the package boundary change.",
    workspace: fixture("package-script-impact-question", [
      ["package.json", "script inventory"],
      ["src/runtime/api/host/runtime.ts", "likely implementation target"],
      ["src/runtime/api/host/runtime.test.ts", "focused verification candidate"],
      ["src/runtime/api/host/io.test.ts", "adjacent host surface check"],
    ]),
    allowedTools: ["read", "search", "verify"],
    allowedWrites: [],
    successRubric: [
      "discovers the likely owner without a prompt path",
      "selects the focused package script evidence",
      "keeps script discovery separate from write authority",
    ],
    expectedVerification: verification("host-runtime-script-impact", "context sufficiency check", "blocked"),
    expectedOutput: output("analysis", "ranked host owner and focused package check", ["src/runtime/api/host/runtime.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "blocked",
    baselineFailureCategories: ["context insufficient", "verification not selected"],
    hostEvaluationCaseId: "provider-blocked",
    failureCategories: ["context insufficient", "verification not selected"],
  });
}

function sourceReport(): TaskCaseDefinition {
  return baseTask({
    caseId: "source-report",
    taskKind: "docs-report",
    taskPath: "artifact",
    shortPrompt: "Write a short report from the source notes.",
    workspace: fixture("source-report", [
      ["notes/source-a.md", "report source"],
      ["notes/source-b.md", "report source"],
      ["reports/summary.md", "expected written output"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["reports/summary.md"],
    successRubric: [
      "uses source-scoped facts only",
      "writes the requested report artifact",
      "validates the report against source expectations",
    ],
    expectedVerification: verification("report-source-check", "source coverage check", "passed"),
    expectedOutput: output("artifact", "markdown report artifact", ["reports/summary.md"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid"],
    hostEvaluationCaseId: "missing-proof",
    failureCategories: ["artifact invalid"],
  });
}

function structuredArtifact(): TaskCaseDefinition {
  return baseTask({
    caseId: "structured-artifact",
    taskKind: "data-artifact",
    taskPath: "artifact",
    shortPrompt: "Produce the JSON totals artifact from the fixture data.",
    workspace: fixture("structured-artifact", [
      ["data/input.csv", "data source"],
      ["artifacts/totals.json", "expected structured artifact"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["artifacts/totals.json"],
    successRubric: [
      "parses the data source",
      "writes valid structured output",
      "validates the artifact format and totals",
    ],
    expectedVerification: verification("json-total-check", "structured artifact check", "failed"),
    expectedOutput: output("artifact", "structured data artifact", ["artifacts/totals.json"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid", "verification failed", "repair failed"],
    hostEvaluationCaseId: "read-only-tool-loop",
    failureCategories: ["artifact invalid", "verification failed"],
  });
}

function incidentSummaryReport(): TaskCaseDefinition {
  return baseTask({
    caseId: "incident-summary-report",
    taskKind: "docs-report",
    taskPath: "artifact",
    shortPrompt: "Write the incident summary from the two safe notes.",
    workspace: fixture("incident-summary-report", [
      ["notes/timeline.md", "incident source"],
      ["notes/impact.md", "incident source"],
      ["reports/incident.md", "expected report output"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["reports/incident.md"],
    successRubric: [
      "uses only source-scoped incident facts",
      "writes the requested report path",
      "validates source coverage after correction",
    ],
    expectedVerification: verification("incident-source-check", "source coverage check", "passed"),
    expectedOutput: output("artifact", "markdown incident report", ["reports/incident.md"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid"],
    hostEvaluationCaseId: "missing-proof",
    failureCategories: ["artifact invalid"],
  });
}

function csvSummaryArtifact(): TaskCaseDefinition {
  return baseTask({
    caseId: "csv-summary-artifact",
    taskKind: "data-artifact",
    taskPath: "artifact",
    shortPrompt: "Create the JSON summary from the CSV fixture.",
    workspace: fixture("csv-summary-artifact", [
      ["data/orders.csv", "data source"],
      ["artifacts/orders-summary.json", "expected structured artifact"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["artifacts/orders-summary.json"],
    successRubric: [
      "parses the CSV source",
      "writes valid JSON at the requested path",
      "validates the summary fields",
    ],
    expectedVerification: verification("orders-json-check", "structured artifact check", "failed"),
    expectedOutput: output("artifact", "orders summary JSON artifact", ["artifacts/orders-summary.json"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid", "verification failed"],
    hostEvaluationCaseId: "read-only-tool-loop",
    failureCategories: ["artifact invalid", "verification failed"],
  });
}

function releaseNoteReport(): TaskCaseDefinition {
  return baseTask({
    caseId: "release-note-report",
    taskKind: "docs-report",
    taskPath: "artifact",
    shortPrompt: "Draft the release note from the accepted change notes.",
    workspace: fixture("release-note-report", [
      ["notes/change-summary.md", "release source"],
      ["notes/validation.md", "validation source"],
      ["reports/release-note.md", "expected report output"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["reports/release-note.md"],
    successRubric: [
      "uses only accepted source notes",
      "writes the requested release note path",
      "validates scope and required sections",
    ],
    expectedVerification: verification("release-note-source-check", "source coverage check", "passed"),
    expectedOutput: output("artifact", "markdown release note report", ["reports/release-note.md"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid"],
    hostEvaluationCaseId: "missing-proof",
    failureCategories: ["artifact invalid"],
  });
}

function metricsSummaryArtifact(): TaskCaseDefinition {
  return baseTask({
    caseId: "metrics-summary-artifact",
    taskKind: "data-artifact",
    taskPath: "artifact",
    shortPrompt: "Create the JSON metrics summary from the fixture rows.",
    workspace: fixture("metrics-summary-artifact", [
      ["data/metrics.csv", "data source"],
      ["data/thresholds.json", "validation source"],
      ["artifacts/metrics-summary.json", "expected structured artifact"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["artifacts/metrics-summary.json"],
    successRubric: [
      "parses the metric rows",
      "checks the threshold source",
      "validates the JSON summary format",
    ],
    expectedVerification: verification("metrics-json-check", "structured artifact check", "failed"),
    expectedOutput: output("artifact", "metrics summary JSON artifact", ["artifacts/metrics-summary.json"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid", "verification failed"],
    hostEvaluationCaseId: "read-only-tool-loop",
    failureCategories: ["artifact invalid", "verification failed"],
  });
}

function ownerRiskSummary(): TaskCaseDefinition {
  return baseTask({
    caseId: "owner-risk-summary",
    taskKind: "docs-report",
    taskPath: "artifact",
    shortPrompt: "Summarize owner risk from the two review notes.",
    workspace: fixture("owner-risk-summary", [
      ["notes/owner-map.md", "owner source"],
      ["notes/risk-log.md", "risk source"],
      ["reports/owner-risk.md", "expected report output"],
    ]),
    allowedTools: ["read", "write", "verify"],
    allowedWrites: ["reports/owner-risk.md"],
    successRubric: [
      "keeps owner facts source-scoped",
      "writes a concise risk report",
      "validates that every risk has a source receipt",
    ],
    expectedVerification: verification("owner-risk-source-check", "source coverage check", "passed"),
    expectedOutput: output("artifact", "markdown owner risk report", ["reports/owner-risk.md"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "failed",
    baselineFailureCategories: ["artifact invalid"],
    hostEvaluationCaseId: "missing-proof",
    failureCategories: ["artifact invalid"],
  });
}

function unsupportedArtifactExport(): TaskCaseDefinition {
  return baseTask({
    caseId: "unsupported-artifact-export",
    taskKind: "data-artifact",
    taskPath: "artifact",
    shortPrompt: "Export the result through the unavailable package workflow.",
    workspace: fixture("unsupported-artifact-export", [
      ["artifacts/export-request.json", "export request"],
    ]),
    allowedTools: ["read"],
    allowedWrites: [],
    successRubric: [
      "recognizes the unavailable capability",
      "does not load packages dynamically",
      "reports unsupported workflow without success",
    ],
    expectedVerification: verification("export-capability-check", "unsupported capability check", "blocked"),
    expectedOutput: output("artifact", "unsupported export artifact", ["artifacts/export-request.json"]),
    expectedEvidenceResultCondition: "blocked",
    expectedOutcome: "unsupported",
    hostEvaluationCaseId: "unsupported-provider-mode",
    failureCategories: ["unsupported capability"],
  });
}

function resumeFromContext(): TaskCaseDefinition {
  return baseTask({
    caseId: "resume-from-context",
    taskKind: "continuation",
    taskPath: "continuation",
    shortPrompt: "Continue from the retained context and finish the review.",
    workspace: fixture("resume-from-context", [
      ["src/continued.ts", "prior context target"],
      ["session/compact-state", "retained context marker"],
    ]),
    allowedTools: ["read", "continue", "verify"],
    allowedWrites: [],
    successRubric: [
      "uses retained continuation facts",
      "does not treat compacted summary as proof",
      "reports stale continuation blockers",
    ],
    expectedVerification: verification("continuation-freshness", "continuation freshness check", "passed"),
    expectedOutput: output("continuation", "continued session facts", ["src/continued.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "not-proven",
    baselineFailureCategories: ["continuation stale"],
    setupEvaluationCaseIds: ["read-only-tool-loop"],
    hostEvaluationCaseId: "branch-compaction-continuation",
    failureCategories: ["continuation stale"],
  });
}

function resumeAfterCompaction(): TaskCaseDefinition {
  return baseTask({
    caseId: "resume-after-compaction",
    taskKind: "continuation",
    taskPath: "continuation",
    shortPrompt: "Resume from compacted context and finish the owner review.",
    workspace: fixture("resume-after-compaction", [
      ["src/ownerReview.ts", "retained target"],
      ["session/compacted-context", "retained context marker"],
      ["session/open-blockers", "continuation blocker summary"],
    ]),
    allowedTools: ["read", "continue", "verify"],
    allowedWrites: [],
    successRubric: [
      "rebuilds fresh context from retained markers",
      "keeps compacted summary as context rather than proof",
      "reports remaining blockers after freshness check",
    ],
    expectedVerification: verification("compaction-freshness", "continuation freshness check", "passed"),
    expectedOutput: output("continuation", "fresh resumed review facts", ["src/ownerReview.ts"]),
    expectedEvidenceResultCondition: "complete-proof",
    expectedOutcome: "complete",
    baselineOutcome: "not-proven",
    baselineFailureCategories: ["continuation stale"],
    setupEvaluationCaseIds: ["branch-compaction-continuation"],
    hostEvaluationCaseId: "branch-compaction-continuation",
    failureCategories: ["continuation stale"],
  });
}

function liveProviderTriage(): TaskCaseDefinition {
  return baseTask({
    caseId: "live-provider-triage",
    taskKind: "live-triage",
    taskPath: "provider",
    shortPrompt: "Classify whether live task execution is available.",
    workspace: fixture("live-provider-triage", [
      ["src/live-task.ts", "representative live task target"],
    ]),
    allowedTools: ["read"],
    allowedWrites: [],
    successRubric: [
      "stays default-off without explicit live opt-in",
      "does not inspect provider secrets",
      "reports skipped live triage blockers",
    ],
    expectedVerification: verification("live-gate-check", "default-off live gate check", "skipped"),
    expectedOutput: output("analysis", "live triage blocker report", []),
    expectedEvidenceResultCondition: "skipped",
    expectedOutcome: "skipped",
    hostEvaluationCaseId: "optional-live-gate-skipped",
    failureCategories: ["provider failure", "environment issue"],
  });
}

function baseTask(input: Omit<TaskCaseDefinition, "terminalSuccessClaim" | "redactionExpectations" | "failureCategories"> & {
  readonly failureCategories?: readonly TaskFailureCategory[];
  readonly redactionExpectations?: readonly string[];
}): TaskCaseDefinition {
  return freeze({
    ...input,
    failureCategories: input.failureCategories ?? [],
    redactionExpectations: input.redactionExpectations ?? [
      "transcript",
      "provider output",
      "command output",
      "edit text",
      "patch body",
      "hidden-reasoning",
      "secret",
      "token",
      "header",
      "private path",
    ],
    terminalSuccessClaim: false,
  });
}

function fixture(
  fixtureId: string,
  files: readonly (readonly [path: string, purpose: string])[],
): TaskWorkspaceFixture {
  return freeze({
    fixtureId,
    setupSummary: `${fixtureId} workspace fixture`,
    files: files.map(([path, purpose]) => ({ path, purpose })),
    rawContentExcluded: true,
  });
}

function verification(
  verificationId: string,
  commandOrCheck: string,
  expectedStatus: TaskVerificationStatus,
): TaskVerificationExpectation {
  return freeze({
    verificationId,
    commandOrCheck,
    expectedStatus,
    taskRelevant: true,
  });
}

function output(
  kind: TaskExpectedOutput["kind"],
  summary: string,
  requiredPaths: readonly string[],
): TaskExpectedOutput {
  return freeze({ kind, summary, requiredPaths });
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function loopValue<T>(outputs: Readonly<Record<string, unknown>>, key: string): T {
  if (!(key in outputs)) {
    throw new Error(`Task loop output missing: ${key}`);
  }
  return outputs[key] as T;
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}
