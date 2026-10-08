import type { StoredGoal } from '../../core/state/projectState.js';
import { goalIsDetached, type SessionGoalEdit } from './store.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { requestLedgerFacts } from '../../core/agent/request/projection.js';

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
    goal.tokenBudget === undefined ? 'Budget: unset (no cumulative goal token cap).' : `Budget: ${goal.tokenBudget} tokens (strict admission; unsupported bounds block sending).`,
    ...usageLines(edit),
    'Automatic continuation: unavailable. Active objectives accompany manually submitted turns.',
  ] : ['No goal set for this session. Use /goal set <objective>.'];
  if (legacy) lines.push('A legacy project objective is available. /goal import copies its description into this session as paused.');
  return lines.join('\n');
}

function usageLines(edit: SessionGoalEdit): string[] {
  const ledger = decodeRequestLedger(edit.requestLedger);
  const scope = edit.goal && ledger?.scopes[edit.goal.id];
  if (!scope) return ['Goal usage: history unknown; no trustworthy cumulative baseline is available.'];
  const facts = requestLedgerFacts(scope);
  return [`Goal usage: ${facts.knownTokens} settled tokens; ${facts.partialKnownTokens} partial known tokens; ${facts.retainedTokens} retained tokens.`,
    `Requests: ${facts.reservedAttempts} reserved; ${facts.unknownAttempts} unresolved; ${facts.unboundedAttempts} without a proven bound.`,
    ...(facts.historyUnknown ? ['History: unknown; strict admission is blocked.'] : []),
    ...(facts.breach ? ['Budget breach: provider metering was inconsistent or exceeded its proven bound; requests for this goal are blocked.'] : [])];
}
