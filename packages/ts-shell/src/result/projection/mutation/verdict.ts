import { freezeDeep } from "../../../core/values/freeze.js";
import type { MultiTargetMutationProofInput } from "../../../evidence/projection/mutation/proof.js";

export type MultiTargetMutationTerminalStatus =
  | "complete"
  | "blocked"
  | "failed"
  | "partial"
  | "not_proven";

export interface MultiTargetMutationTerminalProjection {
  readonly projectionId: string;
  readonly proofInputId: string;
  readonly status: MultiTargetMutationTerminalStatus;
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly reason: string;
  readonly missingProofItems: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectMultiTargetMutationVerdict(input: {
  readonly proofInput: MultiTargetMutationProofInput;
  readonly notProvenClaims?: readonly string[];
}): MultiTargetMutationTerminalProjection {
  const status = input.proofInput.proofStatus;
  return freezeDeep({
    projectionId: `${input.proofInput.proofInputId}:terminal`,
    proofInputId: input.proofInput.proofInputId,
    status,
    terminalClassification: status === "complete"
      ? "success"
      : status === "failed"
        ? "error"
        : "stopped",
    reason: status === "complete"
      ? "evidence/result proof complete"
      : input.proofInput.missingProofItems.length > 0
        ? `missing proof: ${input.proofInput.missingProofItems.join(",")}`
        : "mutation verdict not proven",
    missingProofItems: input.proofInput.missingProofItems,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "result-verdict-is-the-only-complete-path",
      ...(status === "complete"
        ? ["result-owned-verdict-complete"]
        : ["missing-result-owned-complete-proof"]),
      ...input.proofInput.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ]),
  });
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).sort());
}
