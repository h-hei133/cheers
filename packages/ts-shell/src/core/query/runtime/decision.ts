import type { RuntimeSourceFact } from "../../../context/acquisition/code/source.js";
import type { RepairHypothesisState } from "../../../repair/flow/hypothesis.js";
import type { ToolActionKind } from "../../../tools/policy/strategy.js";

export interface QueryRuntimeRepairPlan {
  readonly hypothesis: RepairHypothesisState;
  readonly sourceFacts: readonly RuntimeSourceFact[];
  readonly blockedRepeat: boolean;
}
export interface QueryRuntimeActionDecision {
  readonly nextAction: ToolActionKind;
  readonly actions: readonly ToolActionKind[];
  readonly proofGap: readonly string[];
  readonly changedFiles: readonly string[];
  readonly selectedPaths: readonly string[];
  readonly ownerPaths: readonly string[];
  readonly verificationTargets: readonly string[];
  readonly taskIntent: string;
  readonly taskKind: string;
  readonly outputKind: string;
  readonly contextState: string;
  readonly planState: string;
  readonly requestState: string;
  readonly toolStrategyState: string;
  readonly pendingAction?: ToolActionKind;
  readonly repairPlan?: QueryRuntimeRepairPlan;
  readonly artifactRequired: boolean;
  readonly reason: string;
  readonly terminalSuccessClaim: false;
}
