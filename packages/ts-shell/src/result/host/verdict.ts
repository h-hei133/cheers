import { freezeDeep } from "../../core/values/freeze.js";
import type { HostEvidenceProof } from "../../evidence/host/proof.js";
import type { MultiTargetMutationTerminalProjection } from "../projection/mutation/verdict.js";
import type { RepairVerdictTerminalProjection } from "../projection/repair/verdict.js";

type HostResultProjection =
  | RepairVerdictTerminalProjection
  | MultiTargetMutationTerminalProjection;

export interface HostTruthProjection {
  readonly truthId: string;
  readonly evidenceStatus: HostEvidenceProof["status"];
  readonly resultStatus: HostResultProjection["status"] | "not_proven";
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly completeProof: boolean;
  readonly successOwner: "evidence-result-verdict";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectHostTruth(input: {
  readonly evidence: HostEvidenceProof;
  readonly result?: HostResultProjection;
}): HostTruthProjection {
  const completeProof = Boolean(
    input.evidence.status === "complete" &&
      (input.result?.status === "verified_with_repair" ||
        input.result?.status === "complete") &&
      input.result.terminalClassification === "success",
  );
  return freezeDeep({
    truthId: `${input.evidence.proofId}:host-truth`,
    evidenceStatus: input.evidence.status,
    resultStatus: input.result?.status ?? "not_proven",
    terminalClassification: completeProof ? "success" : "stopped",
    completeProof,
    successOwner: "evidence-result-verdict",
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "host-accepted-is-not-success",
      "status-snapshot-is-not-success",
      "event-emitted-is-not-success",
      "evaluation-case-executed-is-not-success",
      ...input.evidence.notProvenClaims,
      ...(input.result?.notProvenClaims ?? []),
      ...(completeProof ? [] : ["missing-complete-evidence-result-verdict"]),
    ]),
  });
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}
