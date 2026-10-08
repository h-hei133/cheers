import type { SessionGoal } from '../model.js';

export function schedulingLines(goal: SessionGoal): string[] {
  const state = goal.scheduling;
  if (!state) return ['Automatic continuation: starts only after an explicit /goal set or /goal resume.'];
  return [`Scheduling: ${state.phase}; round ${state.round}.`,
    ...(state.reason ? [`Scheduling reason: ${state.reason}.`] : []),
    ...(goal.runOwner ? [`Scheduling owner: ${goal.runOwner.token} (${goal.runOwner.hostname}, PID ${goal.runOwner.pid}).`] : []),
    ...(state.drain ? [`Execution drain: ${state.drain === 'settled' ? 'settled' : state.drain === 'pending' ? 'pending; cancellation requested' : 'unconfirmed; the pending round is retained'}.`] : []),
    ...(state.pendingRound ? ['Round outcome: unresolved. Restart does not replay this work.'] : []),
    ...(state.lastOutcome ? [`Last round: ${state.lastOutcome}; this is not goal acceptance.`] : [])];
}
