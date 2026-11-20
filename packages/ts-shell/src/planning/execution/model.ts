import { buildExecutionPlan as build } from '@cheers/planning';
import type { ContextSelection } from '../../context/selection/model.js';

export type ExecutionPlanState = 'ready' | 'partial' | 'blocked';

export interface ExecutionPlanInput {
  readonly taskKind: string;
  readonly outputKind: string;
  readonly allowedTools: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly successRubric: readonly string[];
  readonly context: ContextSelection;
  readonly observedGaps?: readonly string[];
}

export interface ExecutionPlan {
  readonly state: ExecutionPlanState;
  readonly steps: readonly string[];
  readonly actionContracts: readonly ActionContract[];
  readonly requiredTools: readonly string[];
  readonly writeRequired: boolean;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ActionContract {
  readonly action: string;
  readonly preconditions: readonly string[];
  readonly expectedObservations: readonly string[];
  readonly proofContribution: string;
  readonly fallbackAction: string;
  readonly budgetImpact: 'low' | 'medium' | 'high';
}

export function buildExecutionPlan(input: ExecutionPlanInput): ExecutionPlan {
  return build(input);
}
