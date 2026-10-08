import { randomUUID } from 'node:crypto';
import { freezeDeep } from '../../core/values/freeze.js';
import { isRecord } from '../../core/values/record.js';
import { goalMatchesScope } from './codec.js';
import { GoalWriteError, type GoalAction, type GoalScope, type SessionGoal } from './model.js';

/** State transitions never dispatch work or infer completion from a stopped run. */
export function transitionGoal(current: SessionGoal | undefined, scope: GoalScope, action: GoalAction,
  timestamp = new Date().toISOString()): SessionGoal | undefined {
  validateAction(action);
  if (action.type === 'set' || action.type === 'import') {
    if (current && current.phase !== 'complete' && current.phase !== 'dropped') throw new GoalWriteError('conflict');
    const objective = action.objective.trim();
    if (!objective || objective.length > 16_384 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(objective)) throw new GoalWriteError('invalid');
    return freezeDeep({ ...scope, schemaVersion: 1, id: randomUUID(), revision: 1, objective,
      phase: action.type === 'import' ? 'paused' : 'active', origin: action.type === 'import' ? 'legacy-project' : 'user',
      createdAt: timestamp, updatedAt: timestamp, runOwner: null,
      ...(action.type === 'import' ? { pauseReason: 'legacy-import' as const } : {}) });
  }
  if (!current) return undefined;
  if (!goalMatchesScope(current, scope) && action.type !== 'drop') throw new GoalWriteError('conflict');
  if (action.type === 'reentry') {
    if (current.phase !== 'active') return current;
    return move(current, 'paused', timestamp, { pauseReason: 'session-reentry' });
  }
  if (action.type === 'drop') return current.phase === 'dropped' ? current : move(current, 'dropped', timestamp);
  if (current.phase === 'complete' || current.phase === 'dropped') {
    if (action.type === 'complete' && current.phase === 'complete') return current;
    throw new GoalWriteError('conflict');
  }
  if (action.type === 'complete') return move(current, 'complete', timestamp,
    { completion: { source: 'user-declared', timestamp, declaration: '/goal complete' } });
  if (action.type === 'pause') return current.phase === 'paused' ? current : move(current, 'paused', timestamp, { pauseReason: 'user' });
  if (action.type === 'resume') return current.phase === 'active' ? current : move(current, 'active', timestamp);
  if (action.type === 'budget') {
    if (current.tokenBudget === action.cap) return current;
    if (current.revision >= Number.MAX_SAFE_INTEGER) throw new GoalWriteError('invalid');
    const { tokenBudget: _budget, ...base } = current;
    return freezeDeep({ ...base, revision: current.revision + 1, updatedAt: timestamp,
      ...(action.cap !== undefined ? { tokenBudget: action.cap } : {}) });
  }
  throw new GoalWriteError('invalid');
}

function validateAction(action: unknown): void {
  if (!isRecord(action)) throw new GoalWriteError('invalid');
  if (action.type === 'complete-automatically') throw new GoalWriteError('unavailable');
  if (typeof action.type !== 'string' || !['set', 'import', 'pause', 'resume', 'drop', 'complete', 'reentry', 'budget'].includes(action.type)) throw new GoalWriteError('invalid');
  const keys = action.type === 'set' || action.type === 'import' ? ['type', 'objective'] : action.type === 'complete' ? ['type', 'source'] : action.type === 'budget' ? ['type', 'cap'] : ['type'];
  if (Object.keys(action).some(key => !keys.includes(key))
    || ((action.type === 'set' || action.type === 'import') && typeof action.objective !== 'string')
    || (action.type === 'complete' && action.source !== 'user-declared')
    || (action.type === 'budget' && action.cap !== undefined && (typeof action.cap !== 'number' || !Number.isSafeInteger(action.cap) || action.cap < 0))) throw new GoalWriteError('invalid');
}

function move(current: SessionGoal, phase: SessionGoal['phase'], timestamp: string,
  details: Pick<SessionGoal, 'pauseReason' | 'completion'> = {}): SessionGoal {
  if (current.revision >= Number.MAX_SAFE_INTEGER) throw new GoalWriteError('invalid');
  const { pauseReason: _pause, completion: _completion, ...base } = current;
  return freezeDeep({ ...base, revision: current.revision + 1, phase, updatedAt: timestamp, ...details });
}
