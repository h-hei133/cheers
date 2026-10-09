import { createRequestPolicy } from '../../core/agent/request/policy.js';
import { ModelAdmissionError, type RequestPolicy } from '../../core/agent/request/model.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { sessionRequestStore } from '../../session/store/requests.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { BoundSessionHost } from '../../session/store/bound.js';
import { decodeGoal } from '../../planning/goal/codec.js';
import { decodeResearchState } from './codec.js';
import { currentResearch, readResearch } from './store.js';
import { digestOf } from '../evidence/producer.js';
import type { ResearchRun } from './model.js';

export function assertResearchAdmission(run: ResearchRun, current: ResearchRun | undefined, session: Session): void {
  if (!current || current.id !== run.id || current.epoch !== run.epoch || current.sessionId !== session.id
    || current.sessionCreatedAt !== session.createdAt || current.workspace.path !== run.workspace.path
    || current.workspace.identity !== run.workspace.identity || !['ready', 'running', 'completed', 'partial'].includes(current.status)
    || Date.now() >= Date.parse(current.deadlineAt)) throw new ModelAdmissionError('inactive');
}

/** Capture the original scope; settlement never depends on a later selected session. */
export function researchRequestPolicy(host: BoundSessionHost, session: Session, run: ResearchRun,
  currentSession: () => Session, inherited?: RequestPolicy): RequestPolicy {
  const assert = () => {
    const edit = readResearch(host, session); assertResearchAdmission(run, currentResearch(edit), currentSession());
    if (run.goal) {
      const goal = decodeGoal(edit.bound.state.goal);
      if (!goal || goal.id !== run.goal.id || goal.controlRevision !== run.goal.controlRevision || ['complete', 'dropped'].includes(goal.phase)) throw new ModelAdmissionError('inactive');
    }
  };
  let policy: RequestPolicy;
  if (run.goal) {
    if (!inherited?.withAdmission || !inherited.withCompletionReserve) return { reserve: () => { throw new ModelAdmissionError('unavailable'); } };
    policy = inherited.withAdmission(assert);
  } else {
    const scope = { id: run.ledgerScopeId, workspacePath: run.workspace.path, workspaceIdentity: run.workspace.identity };
    policy = createRequestPolicy(sessionRequestStore(host, session, scope, view => {
      const state = decodeResearchState(view.state.research);
      const current = state?.runs.find(value => value.id === state.currentId);
      assertResearchAdmission(run, current, currentSession());
      if (view.projectRoot !== scope.workspacePath) throw new ModelAdmissionError('inactive');
      return {};
    }), scope.id).withAdmission!(assert);
  }
  return policy.withCompletionReserve!(() => {
    const current = currentResearch(readResearch(host, session));
    // Workload room, not a token limit or a promise of report quality.
    return current && ['investigate', 'gaps'].includes(current.stage)
      ? 4096 * ((current.request.depth === 'quick' ? 3 : 6) + 2) : 0;
  });
}

export function researchLedger(host: BoundSessionHost, session: Session, run: ResearchRun) {
  const scope = decodeRequestLedger(readResearch(host, session).bound.state.requestLedger)?.scopes[run.ledgerScopeId];
  if (!scope) throw new ModelAdmissionError('unavailable');
  const unknown = Object.values(scope.pending).filter(attempt => attempt.dispatched);
  return { scopeId: run.ledgerScopeId, inputTokens: scope.inputTokens, outputTokens: scope.outputTokens,
    pending: Object.keys(scope.pending).length, unknown: unknown.length, historyUnknown: scope.historyUnknown,
    breach: scope.breach !== undefined,
    unknownDigest: digestOf(JSON.stringify({ historyUnknown: scope.historyUnknown,
      attempts: unknown.map(attempt => [attempt.sequence, attempt.requestId, attempt.bodyDigest, attempt.usage]) })) };
}
