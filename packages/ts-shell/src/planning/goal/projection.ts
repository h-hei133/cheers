import type { StoredGoal } from '../../core/state/projectState.js';
import { goalIsDetached, type SessionGoalEdit } from './store.js';

export function goalObjective(edit: SessionGoalEdit): string | undefined {
  return !goalIsDetached(edit) && edit.goal?.phase === 'active' ? edit.goal.objective : undefined;
}

export function showGoal(edit: SessionGoalEdit, legacy?: StoredGoal | null): string {
  const goal = edit.goal;
  const lines = goal ? [
    `Goal: ${goal.objective}`, `ID: ${goal.id}`, `Revision: ${goal.revision}`, `Status: ${goal.phase}`,
    `Workspace: ${goal.workspace.path}`,
    ...(goalIsDetached(edit) ? ['Binding: detached from the current session/workspace. It cannot steer turns or resume. Use /goal drop before setting a new goal.'] : []),
    ...(goal.pauseReason ? [`Pause reason: ${goal.pauseReason}`] : []),
    ...(goal.completion ? [`Completion: user-declared at ${goal.completion.timestamp}; acceptance was not verified.`] : []),
    'Budget: unset (no cumulative goal token cap).',
    'Automatic continuation: unavailable. Active objectives accompany manually submitted turns.',
  ] : ['No goal set for this session. Use /goal set <objective>.'];
  if (legacy) lines.push('A legacy project objective is available. /goal import copies its description into this session as paused.');
  return lines.join('\n');
}
