import { textDigest } from '../planning/plan/codec.js';
import { decodeGoal } from '../planning/goal/codec.js';
import type { SessionStateSnapshot } from '../session/schema/sessionStateSnapshot.js';

export function advisorGoal(state: SessionStateSnapshot): string {
  const goal = decodeGoal(state.goal);
  if (state.goal !== undefined && !goal) throw new Error('Advisor goal binding is unavailable.');
  return textDigest(JSON.stringify(goal ? { id: goal.id, objective: goal.objective, phase: goal.phase,
    controlRevision: goal.controlRevision, tokenBudget: goal.tokenBudget, workspace: goal.workspace } : null));
}
export function advisorPaused(state: SessionStateSnapshot): boolean { const goal = decodeGoal(state.goal); return Boolean(goal && goal.phase !== 'active'); }
