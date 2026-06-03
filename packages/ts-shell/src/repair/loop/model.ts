export type RepairFailureClass =
  | "verification"
  | "artifact"
  | "continuation"
  | "authority"
  | "unsupported"
  | "environment"
  | "unknown";

export type RepairState =
  | "not-needed"
  | "diagnosed"
  | "eligible"
  | "blocked"
  | "proposed"
  | "attempted"
  | "failed"
  | "succeeded-unverified"
  | "post-validation-failed"
  | "post-validation-passed"
  | "retry-exhausted"
  | "user-input-required";

export interface RepairDecisionInput {
  readonly taskKind: string;
  readonly verificationState: string;
  readonly artifactValidationState?: string;
  readonly failureCategories: readonly string[];
  readonly hostStatus: string;
}

export interface RepairDecision {
  readonly failureClass: RepairFailureClass;
  readonly diagnosticContextNeeded: readonly string[];
  readonly state: RepairState;
  readonly repairEligible: boolean;
  readonly blockers: readonly string[];
  readonly originalFailurePreserved: true;
  readonly retryAllowed: boolean;
  readonly terminalSuccessClaim: false;
}

export interface RepairActionInput {
  readonly decision: RepairDecision;
  readonly actions: readonly string[];
  readonly changedTargetCount: number;
  readonly validationEvidence?: {
    readonly status: "passed" | "partial" | "failed" | "not-run";
    readonly check: string;
    readonly originalFailurePreserved: boolean;
  };
}

export interface RepairAction {
  readonly attempted: boolean;
  readonly postValidation: "passed" | "partial" | "failed" | "not-run";
  readonly blockers: readonly string[];
  readonly originalFailurePreserved: true;
  readonly terminalSuccessClaim: false;
}

export function decideRepair(input: RepairDecisionInput): RepairDecision {
  const failureClass = failureClassFor(input);
  const state = repairStateFor(input, failureClass);
  const repairEligible = state === "eligible" || state === "proposed" || state === "attempted";

  return freeze({
    failureClass,
    diagnosticContextNeeded: diagnosticContextFor(failureClass),
    state,
    repairEligible,
    blockers: repairBlockersFor(input, state),
    originalFailurePreserved: true,
    retryAllowed: repairEligible && input.hostStatus !== "blocked",
    terminalSuccessClaim: false,
  });
}

export function executeRepair(input: RepairActionInput): RepairAction {
  const blockedState = input.decision.state === "blocked" ||
    input.decision.state === "user-input-required" ||
    input.decision.failureClass === "unsupported";
  if (!input.actions.includes("repair") || blockedState) {
    return freeze({
      attempted: false,
      postValidation: "not-run",
      blockers: input.decision.blockers.length > 0 ? input.decision.blockers : ["repair not eligible"],
      originalFailurePreserved: true,
      terminalSuccessClaim: false,
    });
  }
  if (input.validationEvidence) {
    return freeze({
      attempted: true,
      postValidation: input.validationEvidence.status,
      blockers: input.validationEvidence.status === "passed"
        ? []
        : [`post-repair validation ${input.validationEvidence.status}: ${input.validationEvidence.check}`],
      originalFailurePreserved: true,
      terminalSuccessClaim: false,
    });
  }
  if (input.decision.state === "failed" && input.changedTargetCount > 1) {
    return freeze({
      attempted: true,
      postValidation: "partial",
      blockers: ["repair verification incomplete"],
      originalFailurePreserved: true,
      terminalSuccessClaim: false,
    });
  }
  return freeze({
    attempted: true,
    postValidation: "passed",
    blockers: [],
    originalFailurePreserved: true,
    terminalSuccessClaim: false,
  });
}

function failureClassFor(input: RepairDecisionInput): RepairFailureClass {
  if (input.failureCategories.includes("artifact invalid")) {
    return "artifact";
  }
  if (input.failureCategories.includes("continuation stale")) {
    return "continuation";
  }
  if (input.failureCategories.includes("authority missing")) {
    return "authority";
  }
  if (input.failureCategories.includes("unsupported capability")) {
    return "unsupported";
  }
  if (input.failureCategories.includes("environment issue")) {
    return "environment";
  }
  if (
    input.failureCategories.includes("verification failed") ||
    input.failureCategories.includes("verification not selected") ||
    input.failureCategories.includes("repair failed")
  ) {
    return "verification";
  }
  return "unknown";
}

function repairStateFor(input: RepairDecisionInput, failureClass: RepairFailureClass): RepairState {
  if (input.hostStatus === "blocked") {
    return input.failureCategories.includes("missing user input") ? "user-input-required" : "blocked";
  }
  if (failureClass === "unsupported") {
    return "blocked";
  }
  if (input.failureCategories.includes("repair failed")) {
    return "failed";
  }
  if (input.artifactValidationState === "validation-failed") {
    return "post-validation-failed";
  }
  if (input.artifactValidationState === "validation-passed") {
    return "post-validation-passed";
  }
  if (input.verificationState === "selected-passed") {
    return "not-needed";
  }
  if (input.verificationState === "selected-failed") {
    return "eligible";
  }
  if (input.verificationState === "insufficient") {
    return "succeeded-unverified";
  }
  if (input.verificationState === "selected-not-run" || input.verificationState === "not-selected") {
    return "diagnosed";
  }
  return "diagnosed";
}

function diagnosticContextFor(failureClass: RepairFailureClass): readonly string[] {
  switch (failureClass) {
    case "verification":
      return ["selected check", "failure output summary", "changed target summary"];
    case "artifact":
      return ["artifact intent", "source receipts", "format expectation"];
    case "continuation":
      return ["retained context age", "fresh target facts"];
    case "authority":
      return ["write authority state"];
    case "unsupported":
      return ["unsupported capability reason"];
    case "environment":
      return ["environment failure class"];
    case "unknown":
      return ["task blocker summary"];
  }
}

function repairBlockersFor(input: RepairDecisionInput, state: RepairState): readonly string[] {
  if (state === "not-needed" || state === "post-validation-passed") {
    return [];
  }
  if (state === "eligible" || state === "proposed" || state === "attempted") {
    return [];
  }
  if (state === "failed") {
    return ["repair failed"];
  }
  if (state === "succeeded-unverified") {
    return ["repair succeeded but unverified"];
  }
  if (state === "post-validation-failed") {
    return ["post-repair validation failed"];
  }
  if (state === "retry-exhausted") {
    return ["retry exhausted"];
  }
  if (state === "user-input-required") {
    return ["user input required"];
  }
  if (state === "blocked") {
    return ["repair blocked"];
  }
  return input.failureCategories.length > 0 ? ["repair diagnosis incomplete"] : [];
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
