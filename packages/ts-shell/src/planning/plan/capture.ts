import { sameValue } from '../../config/values.js';
import { isRecord } from '../../core/values/record.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { BoundSessionHost } from '../../session/store/bound.js';
import { decodeGoal } from '../goal/codec.js';
import { goalDefinition } from '../goal/acceptance/definition.js';
import { readPlan, writePlan } from './store.js';
import { createPlan } from './state.js';
import { planVersion } from './codec.js';
import { PlanError } from './model.js';

/** Capture only the final answer of this exact persisted prompt after durable terminal settlement. */
export function capturePlan(host: BoundSessionHost, session: Session, entryId: string, finalOutput: string): boolean {
  const origin = session.turns.find(turn => turn.id === entryId); const request = origin?.metadata?.planRequest;
  if (!isRecord(request) || origin?.role !== 'user' || origin.metadata?.source !== 'plan-draft') return false;
  const edit = readPlan(host, session);
  if (edit.bound.state.status !== 'completed' || edit.bound.state.runPhase !== 'idle' || edit.bound.state.terminalClassification !== 'success'
    || !sameValue(request.scope, edit.bound.scope) || request.previousVersion !== (edit.plan ? planVersion(edit.plan) : null)) throw new PlanError('stale');
  const goal = decodeGoal(edit.bound.state.goal);
  const binding = goal && !['complete', 'dropped'].includes(goal.phase) ? { id: goal.id, definitionDigest: goalDefinition(goal) } : undefined;
  if (!sameValue(request.goal, binding)) throw new PlanError('stale');
  writePlan(host, session, edit, createPlan(edit.bound.scope, finalOutput, binding, entryId)); return true;
}
