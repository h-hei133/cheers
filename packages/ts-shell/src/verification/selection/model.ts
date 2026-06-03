export type VerificationPurpose =
  | "code-edit"
  | "debug-repair"
  | "artifact"
  | "structured-output"
  | "report"
  | "continuation"
  | "blocked"
  | "unsupported";

export type VerificationRunState =
  | "not-selected"
  | "selected"
  | "selected-blocked"
  | "selected-not-run"
  | "selected-failed"
  | "selected-passed"
  | "insufficient";

export interface VerificationSelectionInput {
  readonly taskKind: string;
  readonly taskPath: string;
  readonly expectedStatus: "passed" | "partial" | "failed" | "blocked" | "skipped" | "not-run";
  readonly expectedCheck: string;
  readonly hostEvidenceVerdict: string;
  readonly hostStatus: string;
  readonly failureCategories: readonly string[];
}

export interface VerificationSelection {
  readonly purpose: VerificationPurpose;
  readonly state: VerificationRunState;
  readonly selected: boolean;
  readonly whySelected: string;
  readonly proves: readonly string[];
  readonly doesNotProve: readonly string[];
  readonly blockers: readonly string[];
  readonly fallback: string;
  readonly evidenceInputEligible: boolean;
  readonly resultInputEligible: boolean;
  readonly terminalSuccessClaim: false;
}

export function selectVerification(input: VerificationSelectionInput): VerificationSelection {
  const purpose = verificationPurposeFor(input);
  const state = verificationStateFor(input);
  const selected = state !== "not-selected";
  const blockers = verificationBlockersFor(input, state);
  const passed = state === "selected-passed";

  return freeze({
    purpose,
    state,
    selected,
    whySelected: selected
      ? `${purpose} check selected for ${input.expectedCheck}`
      : "no task-relevant verification selected",
    proves: passed
      ? proofFor(purpose)
      : [],
    doesNotProve: [
      "provider output",
      "artifact creation",
      "write apply",
      "repair attempt",
      "terminal success",
      ...(passed ? [] : ["task completion"]),
    ],
    blockers,
    fallback: fallbackFor(purpose, state),
    evidenceInputEligible: passed,
    resultInputEligible: passed,
    terminalSuccessClaim: false,
  });
}

function verificationPurposeFor(input: VerificationSelectionInput): VerificationPurpose {
  if (input.expectedStatus === "skipped") {
    return "unsupported";
  }
  if (input.expectedStatus === "blocked" || input.hostStatus === "blocked") {
    return "blocked";
  }
  if (input.taskKind === "debug-repair") {
    return "debug-repair";
  }
  if (input.taskKind === "coding-edit") {
    return "code-edit";
  }
  if (input.taskKind === "docs-report") {
    return "report";
  }
  if (input.taskKind === "data-artifact") {
    return "structured-output";
  }
  if (input.taskKind === "continuation") {
    return "continuation";
  }
  if (input.taskPath === "artifact") {
    return "artifact";
  }
  return "blocked";
}

function verificationStateFor(input: VerificationSelectionInput): VerificationRunState {
  if (input.failureCategories.includes("verification not selected")) {
    return "not-selected";
  }
  if (input.expectedStatus === "blocked" || input.hostStatus === "blocked") {
    return "selected-blocked";
  }
  if (input.expectedStatus === "failed") {
    return "selected-failed";
  }
  if (input.expectedStatus === "partial") {
    return "insufficient";
  }
  if (input.expectedStatus === "not-run") {
    return "selected-not-run";
  }
  if (input.expectedStatus === "skipped") {
    return "selected-blocked";
  }
  return input.hostEvidenceVerdict === "complete" ? "selected-passed" : "selected-not-run";
}

function verificationBlockersFor(
  input: VerificationSelectionInput,
  state: VerificationRunState,
): readonly string[] {
  if (state === "selected-passed") {
    return [];
  }
  if (state === "not-selected") {
    return ["verification not selected"];
  }
  if (state === "selected-blocked") {
    return ["verification blocked"];
  }
  if (state === "selected-failed") {
    return ["verification failed"];
  }
  if (state === "selected-not-run") {
    return ["verification selected but not run"];
  }
  if (state === "insufficient") {
    return ["insufficient verification"];
  }
  return input.failureCategories.filter((category) => category.startsWith("verification"));
}

function proofFor(purpose: VerificationPurpose): readonly string[] {
  switch (purpose) {
    case "code-edit":
      return ["changed code satisfies the selected check"];
    case "debug-repair":
      return ["post-repair check passed"];
    case "artifact":
    case "report":
    case "structured-output":
      return ["artifact validation passed"];
    case "continuation":
      return ["continuation facts are fresh enough for the requested work"];
    case "blocked":
    case "unsupported":
      return [];
  }
}

function fallbackFor(purpose: VerificationPurpose, state: VerificationRunState): string {
  if (state === "selected-passed") {
    return "none";
  }
  if (state === "not-selected") {
    return `select ${purpose} verification before judging task completion`;
  }
  if (state === "selected-blocked") {
    return "surface blocker or request user input";
  }
  if (state === "selected-failed") {
    return "diagnose failure before bounded repair";
  }
  if (state === "selected-not-run") {
    return "run the selected check or keep task not proven";
  }
  return "choose a stronger task-relevant check";
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
