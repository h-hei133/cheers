import type { HostEvidenceProof } from "../../evidence/host/proof.js";
import type { RepairVerdictTerminalProjection } from "../projection/repair/verdict.js";

export interface HostTruthProjection {
  readonly truthId: string;
  readonly evidenceStatus: HostEvidenceProof["status"];
  readonly resultStatus: RepairVerdictTerminalProjection["status"] | "not_proven";
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly completeProof: boolean;
  readonly successOwner: "evidence-result-verdict";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectHostTruth(input: {
  readonly evidence: HostEvidenceProof;
  readonly result?: RepairVerdictTerminalProjection;
}): HostTruthProjection {
  const completeProof = Boolean(
    input.evidence.status === "complete" &&
      input.result?.status === "verified_with_repair" &&
      input.result.terminalClassification === "success",
  );
  return freeze({
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

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
