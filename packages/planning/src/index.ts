import * as execution from './execution/model.js';
import * as packet from './execution/packet.js';
import * as codec from './plan/codec.js';
import * as model from './plan/model.js';
import * as state from './plan/state.js';

export type { PlanCriterion, PlanDraft, PlanPorts, PlanScope } from './plan/model.js';
export type { ExecutionPlan, ExecutionPlanInput, ExecutionPlanState, ActionContract } from './execution/model.js';
export type { TaskRequestPacket, TaskRequestPacketInput, RequestPacketState } from './execution/packet.js';

const planning = { ...execution, ...packet, ...codec, ...model, ...state } satisfies typeof import('../api.d.ts');
export const { buildExecutionPlan, buildTaskRequestPacket, decodePlan, planVersion, textDigest,
  validPlanCriterion, PlanError, createPlan, editPlan, reviewPlan } = planning;
