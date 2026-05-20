import {
  projectRuntimeCodingOutcome,
  projectBlockedRuntimeOutcome,
  type BlockedRuntimeOutcomeInput,
  type RuntimeCodingOutcomeInput,
  type RuntimeOutcomeProjection,
} from "./runtimeOutcomeProjection.js";
import {
  projectTurnResultHandoff,
} from "./turnKernel.js";

export type {
  BlockedRuntimeOutcomeInput,
  RuntimeCodingOutcomeInput,
  RuntimeOutcomeProjection,
};

export type TurnResultHandoffInput = Parameters<
  typeof projectTurnResultHandoff
>[0];
export type TurnResultHandoffProjection = ReturnType<
  typeof projectTurnResultHandoff
>;

export function projectWorkflowRuntimeOutcome(
  input: RuntimeCodingOutcomeInput,
): RuntimeOutcomeProjection {
  return projectRuntimeCodingOutcome(input);
}

export function projectWorkflowBlockedOutcome(
  input: BlockedRuntimeOutcomeInput,
): RuntimeOutcomeProjection {
  return projectBlockedRuntimeOutcome(input);
}

export function projectWorkflowTurnHandoff(
  input: TurnResultHandoffInput,
): TurnResultHandoffProjection {
  return projectTurnResultHandoff(input);
}
