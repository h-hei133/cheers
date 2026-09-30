import type { ArtifactReceipt } from "../../../artifacts/workflow/model.js";
import type { TaskProofInput } from "../../../evidence/task/proof.js";
import type { TaskVerdict } from "../../../result/task/verdict.js";
import type { QueryRuntimeActionDecision } from "./decision.js";

export interface QueryRuntimeProofProjection {
  readonly proof: TaskProofInput;
  readonly verdict: TaskVerdict;
  readonly artifactReceipt?: ArtifactReceipt;
  readonly action: QueryRuntimeActionDecision["nextAction"];
  readonly observationState: {
    readonly contextPathCount: number;
    readonly changedFileCount: number;
    readonly verificationTargetCount: number;
    readonly failedVerificationCount: number;
    readonly repairAttemptCount: number;
    readonly artifactEvidenceCount: number;
    readonly commandCoverageCount: number;
    readonly toolFeedbackCount: number;
    readonly continuationFactCount: number;
    readonly pendingAction?: QueryRuntimeActionDecision["nextAction"];
  };
  readonly proofGap: readonly string[];
  readonly changedFiles: readonly string[];
  readonly terminalSuccessClaim: false;
}
