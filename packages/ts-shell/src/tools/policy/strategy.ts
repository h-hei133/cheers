import type { ExecutionPlan } from "../../planning/execution/model.js";
import type { TaskRequestPacket } from "../../provider/request/packet.js";

export type ToolStrategyState = "ready" | "blocked";
export type ToolActionKind =
  | "read"
  | "search"
  | "edit"
  | "verify"
  | "repair"
  | "artifact"
  | "continue"
  | "stop-not-proven";

export interface ToolStrategyInput {
  readonly allowedTools: readonly string[];
  readonly plan: ExecutionPlan;
  readonly request: TaskRequestPacket;
  readonly proofGap?: readonly string[];
  readonly changedFiles?: readonly string[];
  readonly observedContextPaths?: readonly string[];
  readonly completedActions?: readonly ToolActionKind[];
  readonly taskIntent?: string;
  readonly pendingAction?: ToolActionKind;
  readonly continuationFacts?: readonly string[];
  readonly artifactContract?: {
    readonly claims: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly missingClaims?: readonly string[];
  };
  readonly failureHistory?: readonly {
    readonly action: ToolActionKind;
    readonly signature: string;
    readonly reason: string;
  }[];
  readonly observationFailures?: readonly {
    readonly action: ToolActionKind;
    readonly signature: string;
    readonly reason: string;
  }[];
  readonly repairAttempts?: readonly {
    readonly action: ToolActionKind;
    readonly signature: string;
    readonly reason: string;
  }[];
  readonly budget?: {
    readonly remainingSteps: number;
  };
}

export interface ToolStrategy {
  readonly state: ToolStrategyState;
  readonly actions: readonly ToolActionKind[];
  readonly actionPlans?: readonly ToolActionPlan[];
  readonly nextAction?: ToolActionKind;
  readonly proofGap?: readonly string[];
  readonly changedFiles?: readonly string[];
  readonly taskIntent?: string;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ToolActionPlan {
  readonly action: ToolActionKind;
  readonly preconditions: readonly string[];
  readonly expectedObservations: readonly string[];
  readonly proofContribution: string;
  readonly fallbackAction: ToolActionKind;
  readonly budgetImpact: "low" | "medium" | "high";
}

export function chooseToolStrategy(input: ToolStrategyInput): ToolStrategy {
  const missingTools = input.plan.requiredTools.filter((tool) => !input.allowedTools.includes(tool));
  const blockers = [
    ...input.request.blockers,
    ...missingTools.map((tool) => `tool unavailable: ${tool}`),
  ];
  const actionPlans = actionPlansFor(input);
  const actions = uniqueActions(actionPlans.map((plan) => plan.action));
  const proofGap = safeList(input.proofGap ?? []);

  return freeze({
    state: blockers.length > 0 ? "blocked" : "ready",
    actions,
    actionPlans,
    nextAction: chooseNextAction({ ...input, blockers, actionPlans, proofGap }),
    proofGap,
    changedFiles: safeList(input.changedFiles ?? []),
    taskIntent: sanitize(input.taskIntent ?? input.request.goalSummary),
    pendingAction: input.pendingAction,
    continuationFacts: safeList(input.continuationFacts ?? []),
    blockers,
    terminalSuccessClaim: false,
  });
}

function actionPlansFor(input: ToolStrategyInput): readonly ToolActionPlan[] {
  if (input.plan.actionContracts.length > 0) {
    return freeze(input.plan.actionContracts.map((contract) => freeze({
      action: actionFor(contract.action),
      preconditions: freeze([...contract.preconditions]),
      expectedObservations: freeze([...contract.expectedObservations]),
      proofContribution: contract.proofContribution,
      fallbackAction: actionFor(contract.fallbackAction),
      budgetImpact: contract.budgetImpact,
    })));
  }
  return freeze(input.plan.steps.map((step) => freeze({
    action: actionFor(step),
    preconditions: freeze(["plan ready"]),
    expectedObservations: freeze(["task-relevant observation"]),
    proofContribution: "advances task proof",
    fallbackAction: "stop-not-proven" as const,
    budgetImpact: "medium" as const,
  })));
}

function chooseNextAction(input: ToolStrategyInput & {
  readonly blockers: readonly string[];
  readonly actionPlans: readonly ToolActionPlan[];
  readonly proofGap: readonly string[];
}): ToolActionKind {
  if (input.budget && input.budget.remainingSteps <= 0) {
    return "stop-not-proven";
  }
  if (input.blockers.some((blocker) => blocker.includes("missing required context")) ||
    input.proofGap.some((gap) => gap.includes("context evidence incomplete")) ||
    failedReasonNeedsContext(input)) {
    return input.allowedTools.includes("search") ? "search" : "read";
  }
  if (input.proofGap.some((gap) => gap.includes("verification failed")) &&
    input.actionPlans.some((plan) => plan.action === "repair") &&
    !observedRepairAttempt(input)) {
    return "repair";
  }
  if (input.pendingAction && pendingActionAllowed(input, input.pendingAction)) {
    return input.pendingAction;
  }
  if ((input.observedContextPaths ?? []).length === 0 &&
    !(input.changedFiles && input.changedFiles.length > 0) &&
    (input.actionPlans.some((plan) => plan.action === "edit") ||
      (input.proofGap.length > 0 && input.actionPlans.some((plan) => plan.action === "repair")))) {
    return input.allowedTools.includes("search") ? "search" : "read";
  }
  if (input.artifactContract && missingArtifactEvidence(input.artifactContract)) {
    if ((input.completedActions ?? []).includes("artifact")) {
      return input.allowedTools.includes("read") ? "read" : "search";
    }
    return "artifact";
  }
  if (repeatedFailure(input, "repair") || observedRepairAttempt(input)) {
    return input.allowedTools.includes("search") ? "search" : "read";
  }
  if (input.proofGap.some((gap) => gap.includes("repair")) || failedReasonIncludes(input, "verification")) {
    return input.actionPlans.some((plan) => plan.action === "repair") ? "repair" : "verify";
  }
  if (input.changedFiles && input.changedFiles.length > 0 &&
    input.proofGap.some((gap) => gap.includes("verification") || gap.includes("proof"))) {
    return "verify";
  }
  if (failedAction(input, "edit")) {
    return input.allowedTools.includes("search") ? "search" : "read";
  }
  if (failedAction(input, "read") || failedAction(input, "search")) {
    return input.allowedTools.includes("search") ? "search" : "read";
  }
  if ((input.observedContextPaths ?? []).length > 0 &&
    (input.completedActions ?? []).includes("read") &&
    input.actionPlans.some((plan) => plan.action === "edit")) {
    return "edit";
  }
  if ((input.observedContextPaths ?? []).length > 0 &&
    input.actionPlans.some((plan) => plan.action === "read")) {
    return "read";
  }
  if (input.proofGap.some((gap) => gap.includes("continuation") || gap.includes("pending"))) {
    return "continue";
  }
  if (input.continuationFacts && input.continuationFacts.length > 0) {
    return "continue";
  }
  if (input.actionPlans.some((plan) => plan.action === "repair")) {
    return "repair";
  }
  if (input.actionPlans.some((plan) => plan.action === "edit")) {
    return "edit";
  }
  return input.actionPlans[0]?.action ?? "stop-not-proven";
}

function actionFor(value: string): ToolActionKind {
  const step = value.toLowerCase();
  if (step === "read" || step === "search" || step === "edit" || step === "verify" ||
    step === "repair" || step === "artifact" || step === "continue" || step === "stop-not-proven") {
    return step;
  }
  if (step.includes("verify") || step.includes("verification") || step.includes("check") || step.includes("validation")) {
    return "verify";
  }
  if (step.includes("repair")) {
    return "repair";
  }
  if (step.includes("artifact") || step.includes("sources")) {
    return "artifact";
  }
  if (step.includes("continuation")) {
    return "continue";
  }
  if (step.includes("edit") || step.includes("act") || step.includes("correct")) {
    return "edit";
  }
  if (step.includes("rank") || step.includes("select")) {
    return "search";
  }
  return "read";
}

function missingArtifactEvidence(contract: {
  readonly claims: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly missingClaims?: readonly string[];
}): boolean {
  return (contract.missingClaims?.length ?? 0) > 0 ||
    (contract.claims.length > 0 && contract.evidenceIds.length < contract.claims.length);
}

function failedAction(input: ToolStrategyInput, action: ToolActionKind): boolean {
  return [
    ...(input.failureHistory ?? []),
    ...(input.observationFailures ?? []),
    ...(input.repairAttempts ?? []),
  ].some((failure) => failure.action === action);
}

function pendingActionAllowed(input: ToolStrategyInput & {
  readonly actionPlans: readonly ToolActionPlan[];
  readonly proofGap: readonly string[];
}, action: ToolActionKind): boolean {
  if (!input.allowedTools.includes(action)) return false;
  if (input.changedFiles && input.changedFiles.length > 0 &&
    input.proofGap.some((gap) => gap.includes("verification") || gap.includes("proof")) &&
    action !== "verify" &&
    action !== "continue") {
    return false;
  }
  return input.actionPlans.some((plan) => plan.action === action) || action === "continue";
}

function repeatedFailure(input: ToolStrategyInput, action: ToolActionKind): boolean {
  const intent = sanitize(input.taskIntent ?? input.request.goalSummary);
  const failures = [
    ...(input.failureHistory ?? []),
    ...(input.observationFailures ?? []),
    ...(input.repairAttempts ?? []),
  ];
  return failures.filter((failure) =>
    failure.action === action && sanitize(failure.signature || failure.reason || intent) === intent
  ).length > 0;
}

function failedReasonIncludes(input: ToolStrategyInput, value: string): boolean {
  return [
    ...(input.failureHistory ?? []),
    ...(input.observationFailures ?? []),
    ...(input.repairAttempts ?? []),
  ].some((failure) => failure.reason.toLowerCase().includes(value));
}

function failedReasonNeedsContext(input: ToolStrategyInput): boolean {
  return [
    ...(input.failureHistory ?? []),
    ...(input.observationFailures ?? []),
    ...(input.repairAttempts ?? []),
  ].some((failure) => {
    const reason = failure.reason.toLowerCase();
    return reason.includes("missing context") ||
      (reason.includes("missing") && reason.includes("context"));
  });
}

function observedRepairAttempt(input: ToolStrategyInput): boolean {
  return [
    ...(input.failureHistory ?? []),
    ...(input.observationFailures ?? []),
    ...(input.repairAttempts ?? []),
  ].some((failure) => failure.action === "repair");
}

function uniqueActions(actions: readonly ToolActionKind[]): readonly ToolActionKind[] {
  return freeze([...new Set(actions)]);
}

function safeList(values: readonly string[]): readonly string[] {
  return freeze(values.map((value) => sanitize(value)).filter(Boolean));
}

function sanitize(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
