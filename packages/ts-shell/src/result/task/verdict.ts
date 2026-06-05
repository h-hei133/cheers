import type { TaskProofInput } from "../../evidence/task/proof.js";

export type TaskVerdictStatus = "complete" | "partial" | "blocked" | "failed" | "not-proven";

export interface TaskVerdict {
  readonly verdictId: string;
  readonly sourceProofId: string;
  readonly caseId: string;
  readonly status: TaskVerdictStatus;
  readonly terminalClassification: "success" | "stopped";
  readonly completeProof: boolean;
  readonly missingProof: readonly string[];
  readonly successOwner: "evidence-result-verdict";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectTaskVerdict(input: {
  readonly proof: TaskProofInput;
  readonly notProvenClaims?: readonly string[];
}): TaskVerdict {
  const completeProof = input.proof.status === "complete" && input.proof.missingProof.length === 0;

  return freeze({
    verdictId: `${input.proof.proofId}:task-verdict`,
    sourceProofId: input.proof.proofId,
    caseId: input.proof.caseId,
    status: input.proof.status,
    terminalClassification: completeProof ? "success" : "stopped",
    completeProof,
    missingProof: [...input.proof.missingProof],
    successOwner: "evidence-result-verdict",
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "task-verdict-is-result-owned",
      "task-proof-input-alone-is-not-success",
      "host-output-is-not-task-success",
      ...(input.proof.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
      ...input.proof.missingProof.map((item) => `missing-proof:${item}`),
      ...(completeProof ? [] : ["missing-task-complete-proof"]),
    ]),
  });
}

function unique(values: readonly string[]): readonly string[] {
  return freeze(Array.from(new Set(values)).sort());
}

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
  }
  return value;
}
