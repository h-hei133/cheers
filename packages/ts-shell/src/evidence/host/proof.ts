import { freezeDeep } from "../../core/values/freeze.js";
import type { RepairVerdictProofInput } from "../projection/repair/verdict.js";
import type { MultiTargetMutationProofInput } from "../projection/mutation/proof.js";

export interface HostEvidenceProof {
  readonly proofId: string;
  readonly status: "complete" | "incomplete" | "blocked" | "failed" | "not-proven";
  readonly missingProof: readonly string[];
  readonly evidenceOwner: "evidence";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectHostEvidenceProof(input: {
  readonly proofInput?: RepairVerdictProofInput | MultiTargetMutationProofInput;
  readonly missingProof?: readonly string[];
}): HostEvidenceProof {
  const proofInput = input.proofInput;
  const missingProof = proofInput?.missingProofItems ?? input.missingProof ?? ["evidence-result-verdict"];
  return freezeDeep({
    proofId: proofInput?.proofInputId ?? "host-evidence:not-proven",
    status: statusFor(proofInput?.proofStatus, missingProof),
    missingProof,
    evidenceOwner: "evidence",
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "host-proof-is-not-terminal-result",
      ...(proofInput?.notProvenClaims ?? []),
    ]),
  });
}

function statusFor(
  status: RepairVerdictProofInput["proofStatus"] | MultiTargetMutationProofInput["proofStatus"] | undefined,
  missingProof: readonly string[],
): HostEvidenceProof["status"] {
  if (status === "complete" && missingProof.length === 0) return "complete";
  if (status === "blocked") return "blocked";
  if (status === "failed") return "failed";
  if (status === "incomplete" || status === "partial") return "incomplete";
  return "not-proven";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}
