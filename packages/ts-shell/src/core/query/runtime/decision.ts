import type { ToolActionKind } from "../../../tools/policy/strategy.js";

export interface QueryRuntimeActionDecision {
  readonly nextAction: ToolActionKind;
  readonly actions: readonly ToolActionKind[];
  readonly proofGap: readonly string[];
  readonly changedFiles: readonly string[];
  readonly taskIntent: string;
  readonly pendingAction?: ToolActionKind;
  readonly artifactRequired: boolean;
  readonly reason: string;
  readonly terminalSuccessClaim: false;
}
