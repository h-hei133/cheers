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
  readonly taskIntent?: string;
  readonly changedFiles?: readonly string[];
  readonly expectedStatus: "passed" | "partial" | "failed" | "blocked" | "skipped" | "not-run";
  readonly expectedCheck: string;
  readonly hostEvidenceVerdict: string;
  readonly hostStatus: string;
  readonly failureCategories: readonly string[];
  readonly proofGap?: readonly string[];
  readonly failureHistory?: readonly {
    readonly command: string;
    readonly status: "failed" | "blocked";
    readonly changedFiles: readonly string[];
    readonly reason: string;
  }[];
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
  readonly rerunReason?: string;
  readonly selectedInputs: {
    readonly taskIntent: string;
    readonly changedFiles: readonly string[];
    readonly failureHistoryUsed: boolean;
    readonly proofGap?: readonly string[];
  };
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
    rerunReason: rerunReasonFor(input, state),
    selectedInputs: freeze({
      taskIntent: sanitizeIntent(input.taskIntent ?? input.expectedCheck),
      changedFiles: freeze(uniquePaths(input.changedFiles ?? [])),
      failureHistoryUsed: failureHistoryUsed(input),
      proofGap: freeze(safeList(input.proofGap ?? [])),
    }),
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
  if (input.failureCategories.includes("verification failed")) {
    return "selected-failed";
  }
  if (failureHistoryUsed(input) && input.expectedStatus !== "passed") {
    return "selected-failed";
  }
  if ((input.changedFiles?.length ?? 0) > 0 && proofGapNeedsVerification(input)) {
    return input.expectedStatus === "passed" && input.hostEvidenceVerdict === "complete"
      ? "selected-passed"
      : "selected-not-run";
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

function proofGapNeedsVerification(input: VerificationSelectionInput): boolean {
  return (input.proofGap ?? []).some((gap) =>
    gap.toLowerCase().includes("proof") ||
    gap.toLowerCase().includes("verification") ||
    gap.toLowerCase().includes("changed")
  );
}

function rerunReasonFor(input: VerificationSelectionInput, state: VerificationRunState): string {
  if (state === "selected-passed") {
    return "none";
  }
  if ((input.changedFiles?.length ?? 0) > 0 && proofGapNeedsVerification(input)) {
    return "changed files need task-relevant verification";
  }
  if (failureHistoryUsed(input)) {
    return "failure history overlaps changed files";
  }
  if (state === "selected-not-run") {
    return "selected check has not run";
  }
  return "not-applicable";
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
    return [
      "verification failed",
      ...failureHistoryBlockers(input),
    ];
  }
  if (state === "selected-not-run") {
    return ["verification selected but not run"];
  }
  if (state === "insufficient") {
    return ["insufficient verification"];
  }
  return input.failureCategories.filter((category) => category.startsWith("verification"));
}

function failureHistoryUsed(input: VerificationSelectionInput): boolean {
  const changedFiles = uniquePaths(input.changedFiles ?? []);
  return (input.failureHistory ?? []).some((failure) =>
    failure.status === "failed" &&
    uniquePaths(failure.changedFiles).some((path) => changedFiles.includes(path))
  );
}

function failureHistoryBlockers(input: VerificationSelectionInput): readonly string[] {
  const changedFiles = uniquePaths(input.changedFiles ?? []);
  return (input.failureHistory ?? [])
    .filter((failure) =>
      failure.status === "failed" &&
      uniquePaths(failure.changedFiles).some((path) => changedFiles.includes(path))
    )
    .map((failure) => `previous failed verification: ${sanitizeIntent(failure.reason)}`);
}

function uniquePaths(paths: readonly string[]): readonly string[] {
  return freeze([...new Set(paths.map((path) => path.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim()).filter(Boolean))]);
}

function safeList(values: readonly string[]): readonly string[] {
  return values.map((value) => sanitizeIntent(value)).filter(Boolean);
}

function sanitizeIntent(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
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
