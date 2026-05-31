import type { RuntimeOutcomeProjection } from "./runtimeOutcomeProjection.js";
import {
  projectRuntimeMutationOutcome,
} from "./runtimeOutcomeProjection.js";
import type { ShellResultAssemblyInput } from "../result/projection/shell/assembly.js";
import type { CodingResultProvenanceSummary } from "./types.js";
import {
  projectRunCommandDispatchOutcome,
} from "./flowDispatch.js";
import type { TurnReceiptAggregationInput } from "./turnReceiptAggregation.js";
import {
  aggregateTurnReceipts,
  type TurnReceiptAggregation,
} from "./turnReceiptAggregation.js";
import {
  projectTurnCapabilityPlan,
  type TurnCapabilityPlan,
  type TurnCapabilityPlanInput,
} from "./turnCapabilityPlan.js";

export interface TurnKernelProjection {
  readonly capabilityPlan: TurnCapabilityPlan;
  readonly receiptAggregation: TurnReceiptAggregation;
}

export function projectTurnKernel(input: {
  readonly capabilityPlan: TurnCapabilityPlanInput;
  readonly receipts?: Omit<TurnReceiptAggregationInput, "plan">;
}): TurnKernelProjection {
  const capabilityPlan = projectTurnCapabilityPlan(input.capabilityPlan);
  return {
    capabilityPlan,
    receiptAggregation: aggregateTurnReceipts({
      plan: capabilityPlan,
      ...(input.receipts ?? {}),
    }),
  };
}

export function projectTurnResultHandoff(input: {
  readonly capabilityPlan: TurnCapabilityPlanInput;
  readonly receipts?: Omit<TurnReceiptAggregationInput, "plan">;
  readonly command?: {
    readonly command: string;
    readonly changedFiles: string[];
    readonly failedFiles: Array<{ path: string; reason: string }>;
    readonly patches: ShellResultAssemblyInput["patches"];
    readonly verifiedFiles: string[];
    readonly unverifiedFiles: ShellResultAssemblyInput["unverifiedFiles"];
    readonly verification: ShellResultAssemblyInput["verification"];
    readonly repairNotes: string[];
    readonly evidence: string[];
    readonly provenance?: CodingResultProvenanceSummary;
  };
  readonly mutation?: ShellResultAssemblyInput;
}): RuntimeOutcomeProjection & { readonly turn: TurnKernelProjection } {
  const turn = projectTurnKernel({
    capabilityPlan: input.capabilityPlan,
    receipts: input.receipts,
  });
  if (input.command) {
    return {
      turn,
      ...projectRunCommandDispatchOutcome(input.command),
    };
  }
  if (!input.mutation) {
    throw new Error("turn result handoff requires command or mutation input");
  }
  return {
    turn,
    ...projectRuntimeMutationOutcome(input.mutation),
  };
}
