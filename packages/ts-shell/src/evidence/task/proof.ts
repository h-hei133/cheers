export type TaskProofStatus = "complete" | "partial" | "blocked" | "failed" | "not-proven";

export type TaskProofItem =
  | "context-ready"
  | "plan-ready"
  | "request-ready"
  | "tool-strategy-ready"
  | "task-relevant-verification"
  | "verification-passed"
  | "changed-file-verification-complete"
  | "repair-action"
  | "repair-post-validation"
  | "original-failure-preserved"
  | "artifact-source-receipts"
  | "artifact-validation"
  | "continuation-freshness"
  | "workspace-target-resolution"
  | "staged-action-consistency"
  | "result-input";

export interface TaskProofInput {
  readonly proofId: string;
  readonly caseId: string;
  readonly taskKind: string;
  readonly outputKind: string;
  readonly requiredProof: readonly TaskProofItem[];
  readonly presentProof: readonly TaskProofItem[];
  readonly missingProof: readonly TaskProofItem[];
  readonly status: TaskProofStatus;
  readonly evidenceOwner: "evidence";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface TaskProofInputFacts {
  readonly caseId: string;
  readonly taskKind: string;
  readonly outputKind: string;
  readonly contextState: string;
  readonly contextRefreshed: boolean;
  readonly selectedPathCount: number;
  readonly planState: string;
  readonly requestState: string;
  readonly toolStrategyState: string;
  readonly verificationState: string;
  readonly verificationEvidenceInputEligible: boolean;
  readonly verificationResultInputEligible: boolean;
  readonly changedFileVerificationComplete?: boolean;
  readonly repairAttempted: boolean;
  readonly repairPostValidation: string;
  readonly originalFailurePreserved: boolean;
  readonly artifactValidationState?: string;
  readonly artifactSourceReceiptsAvailable?: boolean;
  readonly artifactSourceReceiptsComplete?: boolean;
  readonly artifactCorrectionAttempted?: boolean;
  readonly artifactCorrectionValidationState?: string;
  readonly stagedActionConsistent?: boolean;
  readonly hostStatus: string;
}

export function buildTaskProofInput(facts: TaskProofInputFacts): TaskProofInput {
  const requiredProof = requiredProofFor(facts);
  const presentProof = presentProofFor(facts);
  const missingProof = requiredProof.filter((item) => !presentProof.includes(item));
  const status = statusFor(facts, missingProof);

  return freeze({
    proofId: `${facts.caseId}:task-proof`,
    caseId: facts.caseId,
    taskKind: facts.taskKind,
    outputKind: facts.outputKind,
    requiredProof,
    presentProof,
    missingProof,
    status,
    evidenceOwner: "evidence",
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "task-proof-input-is-not-terminal-result",
      "host-output-is-not-task-success",
      "verification-attempt-is-not-task-success",
      "repair-attempt-is-not-task-success",
      "artifact-correction-is-not-task-success",
      ...(status === "complete" ? [] : ["task-completion-proof-missing"]),
    ]),
  });
}

function requiredProofFor(facts: TaskProofInputFacts): readonly TaskProofItem[] {
  const common: TaskProofItem[] = [
    "context-ready",
    "plan-ready",
    "request-ready",
    "tool-strategy-ready",
    "task-relevant-verification",
    "verification-passed",
    "result-input",
  ];
  const stagedActionProof: TaskProofItem[] = facts.stagedActionConsistent === false
    ? ["staged-action-consistency"]
    : [];
  if (facts.taskKind === "debug-repair") {
    return freeze([
      ...common,
      ...stagedActionProof,
      "changed-file-verification-complete",
      "repair-action",
      "repair-post-validation",
      "original-failure-preserved",
    ]);
  }
  if (facts.outputKind === "diff") {
    return freeze([
      ...common,
      ...stagedActionProof,
      "changed-file-verification-complete",
    ]);
  }
  if (facts.outputKind === "artifact") {
    return freeze([
      ...common,
      ...stagedActionProof,
      "changed-file-verification-complete",
      "artifact-source-receipts",
      "artifact-validation",
    ]);
  }
  if (facts.taskKind === "continuation") {
    return freeze([
      "context-ready",
      "plan-ready",
      "request-ready",
      "tool-strategy-ready",
      ...stagedActionProof,
      "continuation-freshness",
      "result-input",
    ]);
  }
  if (facts.taskKind === "workspace-understanding") {
    return freeze([
      "context-ready",
      "plan-ready",
      "request-ready",
      "tool-strategy-ready",
      ...stagedActionProof,
      "task-relevant-verification",
      "workspace-target-resolution",
      "result-input",
    ]);
  }
  if (facts.taskKind === "write-file") {
    return freeze([
      "context-ready",
      "plan-ready",
      "request-ready",
      "tool-strategy-ready",
      "result-input",
    ]);
  }
  return freeze(common);
}

function presentProofFor(facts: TaskProofInputFacts): readonly TaskProofItem[] {
  const present: TaskProofItem[] = [];
  if (facts.contextState === "ready" && facts.selectedPathCount > 0) {
    present.push("context-ready");
  }
  if (facts.planState === "ready") {
    present.push("plan-ready");
  }
  if (facts.requestState === "ready") {
    present.push("request-ready");
  }
  if (facts.toolStrategyState === "ready") {
    present.push("tool-strategy-ready");
  }
  if (facts.verificationState === "passed" || facts.taskKind === "continuation") {
    present.push("task-relevant-verification");
  }
  if (facts.taskKind === "workspace-understanding" && facts.toolStrategyState === "ready") {
    present.push("task-relevant-verification");
  }
  if (facts.verificationState === "passed") {
    present.push("verification-passed");
  }
  if (facts.changedFileVerificationComplete) {
    present.push("changed-file-verification-complete");
  }
  if (facts.repairAttempted) {
    present.push("repair-action");
  }
  if (facts.repairPostValidation === "passed") {
    present.push("repair-post-validation");
  }
  if (facts.originalFailurePreserved) {
    present.push("original-failure-preserved");
  }
  if (facts.artifactSourceReceiptsComplete ?? facts.artifactSourceReceiptsAvailable) {
    present.push("artifact-source-receipts");
  }
  if (
    facts.artifactCorrectionAttempted &&
    facts.artifactCorrectionValidationState === "validation-passed"
  ) {
    present.push("artifact-validation");
  } else if (facts.artifactValidationState === "validation-passed") {
    present.push("artifact-validation");
  }
  if (
    facts.taskKind === "continuation" &&
    facts.contextRefreshed &&
    facts.contextState === "ready" &&
    facts.selectedPathCount > 0
  ) {
    present.push("continuation-freshness");
  }
  if (
    facts.taskKind === "workspace-understanding" &&
    facts.contextState === "ready" &&
    facts.selectedPathCount > 0
  ) {
    present.push("workspace-target-resolution");
  }
  if (facts.stagedActionConsistent) {
    present.push("staged-action-consistency");
  }
  if (
    facts.verificationResultInputEligible ||
    (
      facts.taskKind === "continuation" &&
      facts.contextRefreshed &&
      facts.contextState === "ready"
    ) ||
    (
      facts.taskKind === "workspace-understanding" &&
      facts.contextState === "ready" &&
      facts.toolStrategyState === "ready"
    )
  ) {
    present.push("result-input");
  }
  return freeze(unique(present));
}

function statusFor(
  facts: TaskProofInputFacts,
  missingProof: readonly TaskProofItem[],
): TaskProofStatus {
  if (facts.hostStatus === "skipped") return "not-proven";
  if (facts.hostStatus === "unsupported") return "blocked";
  if (facts.hostStatus === "failed" && facts.verificationState === "failed") return "failed";
  if (missingProof.length === 0) return "complete";
  if (facts.contextState === "blocked" || facts.toolStrategyState === "blocked") return "blocked";
  return "partial";
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return freeze(Array.from(new Set(values)));
}

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
  }
  return value;
}
