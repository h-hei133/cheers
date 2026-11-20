import { buildTaskRequestPacket as build } from '@cheers/planning';
import type { ContextSelection } from '../../context/selection/model.js';
import type { ExecutionPlan } from './model.js';

export type RequestPacketState = 'ready' | 'blocked';

export interface TaskRequestPacketInput {
  readonly shortPrompt: string;
  readonly taskKind: string;
  readonly context: ContextSelection;
  readonly plan: ExecutionPlan;
}

export interface TaskRequestPacket {
  readonly state: RequestPacketState;
  readonly goalSummary: string;
  readonly contextPaths: readonly string[];
  readonly contextPacketSummary: string;
  readonly verificationCandidates: readonly string[];
  readonly omittedContextCount: number;
  readonly planSteps: readonly string[];
  readonly outputContract: string;
  readonly blockers: readonly string[];
  readonly redactionRules: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function buildTaskRequestPacket(input: TaskRequestPacketInput): TaskRequestPacket {
  return build(input);
}
