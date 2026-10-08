import { textDigest } from '../../plan/codec.js';
import type { SessionGoal } from '../model.js';
/** Budget, run ownership and phase may change without changing the approved objective. */
export function goalDefinition(goal: SessionGoal): string {
  return textDigest(JSON.stringify({ id: goal.id, objective: goal.objective, sessionId: goal.sessionId,
    sessionCreatedAt: goal.sessionCreatedAt, workspace: goal.workspace, origin: goal.origin }));
}
