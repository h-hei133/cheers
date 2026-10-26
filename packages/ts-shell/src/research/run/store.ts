import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readBoundSessionState, publishBoundSessionState, type BoundSessionHost, type BoundSessionState } from '../../session/store/bound.js';
import type { SessionStateSnapshot } from '../../session/schema/sessionStateSnapshot.js';
import type { ResearchRun, ResearchState } from './model.js';
import { decodeResearchState } from './codec.js';
import { createRequestLedger, initializeRequestScope } from '../../core/agent/request/ledger.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import type { BoundSessionScope } from '../../session/store/contract.js';

export interface ResearchEdit { readonly bound: BoundSessionState; readonly state: ResearchState }
export function readResearch(host: BoundSessionHost, session: Session): ResearchEdit {
  const bound = readBoundSessionState(host, session);
  return { bound, state: researchStateFor(bound.scope, bound.state.research) };
}
/** Admit the same owner payload from an already bounded session snapshot. */
export function researchStateFor(scope: BoundSessionScope, value: unknown): ResearchState {
  const state = value === undefined ? { ...scope, schemaVersion: 1 as const, runs: [] } : decodeResearchState(value);
  if (!state || state.sessionId !== scope.sessionId || state.sessionCreatedAt !== scope.sessionCreatedAt
    || !sameValue(state.workspace, scope.workspace)) throw new Error('Research state binding is unavailable.');
  return state;
}
export function writeResearch(host: BoundSessionHost, session: Session, edit: ResearchEdit, state: ResearchState,
  guard?: (current: SessionStateSnapshot) => boolean, freshScopeId?: string): ResearchEdit {
  if (!decodeResearchState(state) || !sameValue(state.workspace, edit.bound.scope.workspace)
    || state.sessionId !== edit.bound.scope.sessionId || state.sessionCreatedAt !== edit.bound.scope.sessionCreatedAt) throw new Error('Research state is invalid.');
  const bound = publishBoundSessionState(host, session, edit.bound,
    (current, previous) => sameValue(current.research, previous.research) && (!guard || guard(current)), current => {
      if (!freshScopeId) return { ...current, research: state };
      const binding = { sessionId: session.id, sessionCreatedAt: session.createdAt, directoryIdentity: edit.bound.directoryIdentity };
      const ledger = current.requestLedger === undefined ? createRequestLedger(binding) : decodeRequestLedger(current.requestLedger);
      if (!ledger || ledger.sessionId !== binding.sessionId || ledger.sessionCreatedAt !== binding.sessionCreatedAt
        || ledger.directoryIdentity !== binding.directoryIdentity || ledger.scopes[freshScopeId]) throw new Error('Research request scope is unavailable.');
      return { ...current, research: state, requestLedger: initializeRequestScope(ledger,
        { id: freshScopeId, workspacePath: state.workspace.path, workspaceIdentity: state.workspace.identity }, false) };
    });
  return { bound, state: decodeResearchState(bound.state.research)! };
}
export function currentResearch(edit: ResearchEdit): ResearchRun | undefined {
  return edit.state.runs.find(run => run.id === edit.state.currentId);
}
export function replaceResearch(edit: ResearchEdit, run: ResearchRun): ResearchState {
  return { ...edit.state, currentId: run.id,
    runs: [...edit.state.runs.filter(old => old.id !== run.id), run].slice(-4) };
}
