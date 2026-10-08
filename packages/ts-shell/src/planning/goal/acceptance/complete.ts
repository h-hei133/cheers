import { sameValue } from '../../../config/values.js';
import { decodeRequestLedger } from '../../../core/agent/request/codec.js';
import { projectHistoricalWriteInspection } from '../../../session/continuation/inspection.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import type { TranscriptEvent } from '../../../session/sessionEventCodec.js';
import { publishBoundSessionState, readBoundSessionState, type BoundSessionHost } from '../../../session/store/bound.js';
import { decodePlan, planVersion } from '../../plan/codec.js';
import { decodeGoal } from '../codec.js';
import { goalDefinition } from './definition.js';
import { decodeAcceptance } from './codec.js';
import { scopedOperations } from './targets.js';
import { acceptanceEvidence } from './evaluate.js';
import { requireIdleState } from '../run/safety.js';

interface CompletionHost extends BoundSessionHost { getTranscriptEvents(sessionId: string): TranscriptEvent[] }
/** Called after terminal/round settlement. All final rereads run under the existing session lock. */
export function completeAcceptedGoal(host: CompletionHost, session: Session, access: (absolute: string) => void): boolean {
  const bound = readBoundSessionState(host, session); let complete = false;
  publishBoundSessionState(host, session, bound, (current, previous) => sameValue(current.goal, previous.goal)
    && sameValue(current.plan, previous.plan) && sameValue(current.goalAcceptance, previous.goalAcceptance), (state, scope) => {
    const goal = decodeGoal(state.goal); const acceptance = decodeAcceptance(state.goalAcceptance); const plan = decodePlan(state.plan);
    if (!goal || !['active', 'paused'].includes(goal.phase) || !acceptance || !plan || plan.phase !== 'executing'
      || acceptance.goalId !== goal.id || acceptance.definitionDigest !== goalDefinition(goal) || acceptance.planVersion !== planVersion(plan)
      || !sameValue(acceptance.criteria, plan.criteria) || !plan.approval || Object.keys(acceptance.pending).length || goal.scheduling?.pendingRound) return state;
    requireIdleState(state);
    if (state.status !== 'completed' || state.terminalReason !== 'completed' || state.terminalClassification !== 'success') return state;
    const ledger = decodeRequestLedger(state.requestLedger); const requests = ledger?.scopes[goal.id];
    if (!ledger || ledger.sessionId !== scope.sessionId || ledger.sessionCreatedAt !== scope.sessionCreatedAt
      || ledger.directoryIdentity !== bound.directoryIdentity || !requests || requests.historyUnknown || requests.breach
      || Object.keys(requests.pending).length || !sameValue(requests.scope, { id: goal.id, workspacePath: scope.workspace.path, workspaceIdentity: scope.workspace.identity })) return state;
    const harness = state.harness;
    if (harness && [harness.pendingWrite, harness.pendingVerification, harness.pendingRepair, harness.pendingArtifact].some(items => !Array.isArray(items) || items.length)) return state;
    const events = host.getTranscriptEvents(scope.sessionId);
    if (projectHistoricalWriteInspection(events).length || events.filter(event => event.type === 'lifecycle').at(-1)?.event !== 'run-completed') return state;
    const evidence = acceptanceEvidence(acceptance, scope, events, scopedOperations(scope), access);
    if (!evidence || !evidence.length || goal.revision >= Number.MAX_SAFE_INTEGER) return state;
    const timestamp = new Date().toISOString(); complete = true;
    const { pauseReason: _pause, ...base } = goal;
    return { ...state, goal: { ...base, phase: 'complete', revision: goal.revision + 1, updatedAt: timestamp, runOwner: null,
      ...(goal.scheduling ? { scheduling: { ...goal.scheduling, phase: 'paused', drain: 'settled', pendingRound: false, updatedAt: timestamp } } : {}),
      completion: { source: 'verified-acceptance', timestamp, planVersion: acceptance.planVersion,
        definitionDigest: acceptance.definitionDigest, criteria: acceptance.criteria, evidence } } };
  });
  return complete;
}
