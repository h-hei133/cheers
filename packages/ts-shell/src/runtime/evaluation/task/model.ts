import type { HostCommandResponse } from "../../api/host/contract.js";
import type {
  TaskOutcome,
  TaskLiveReadinessStatus,
  TaskLiveReadinessBlocker,
  TaskLiveGate,
  TaskLiveExecutionStatus,
  TaskLiveGateOutcome,
  TaskLiveSafetyClass,
  TaskLivePolicy,
  TaskKind,
  TaskPath,
  TaskFailureCategory,
  BuiltinTaskCaseId,
  TaskCaseId,
  TaskVerificationStatus,
  TaskWorkspaceFixture,
  TaskVerificationExpectation,
  TaskExpectedOutput,
  TaskCaseDefinition,
  TaskCaseResult,
  TaskHostEvaluationSummary,
  TaskCaseProofRecord,
  TaskLiveReadiness,
  TaskLiveGateObservation,
  TaskLiveExecution,
  TaskBlockerSummary,
  TaskAssessmentResult,
} from "./types.js";
import {
  claimEvidenceForDefinition,
  listTaskCases,
  taskCaseDefinition,
} from "./cases/index.js";

// The catalogue lives in ./cases/ as data; re-export so callers keep one entry
// point for task cases.
export { listTaskCases, taskCaseDefinition };

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
import { liveReadinessFor } from "./liveReadiness.js";
import {
  blockersFor,
  classifyOutcome,
  liveTriageFor,
  measuredFailureCategories,
  observedVerificationStatus,
  outcomeCounts,
  projectHostEvaluationSummary,
  projectTaskLiveExecution,
  summarizeTopBlockers,
} from "./liveProjection.js";

export { projectTaskLiveExecution };

export type {
  TaskOutcome,
  TaskLiveReadinessStatus,
  TaskLiveReadinessBlocker,
  TaskLiveGate,
  TaskLiveExecutionStatus,
  TaskLiveGateOutcome,
  TaskLiveSafetyClass,
  TaskLivePolicy,
  TaskKind,
  TaskPath,
  TaskFailureCategory,
  BuiltinTaskCaseId,
  TaskCaseId,
  TaskVerificationStatus,
  TaskWorkspaceFixture,
  TaskVerificationExpectation,
  TaskExpectedOutput,
  TaskCaseDefinition,
  TaskCaseResult,
  TaskHostEvaluationSummary,
  TaskCaseProofRecord,
  TaskLiveReadiness,
  TaskLiveGateObservation,
  TaskLiveExecution,
  TaskBlockerSummary,
  TaskAssessmentResult,
} from "./types.js";

interface LoopVerificationOutput {
  readonly verificationSelection: VerificationSelection;
  readonly artifactReceipt?: ArtifactReceipt;
  readonly repairDecision: RepairDecision;
  readonly repairAction: RepairAction;
  readonly artifactCorrection?: ArtifactCorrection;
  readonly verificationExecution: VerificationExecution;
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
              ? claimEvidenceForDefinition(definition)
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

function loopValue<T>(outputs: Readonly<Record<string, unknown>>, key: string): T {
  if (!(key in outputs)) {
    throw new Error(`Task loop output missing: ${key}`);
  }
  return outputs[key] as T;
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values));
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}
