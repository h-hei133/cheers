import { sameValue } from '../../../config/values.js';
import { decodeRequestLedger } from '../../../core/agent/request/codec.js';
import { createRequestLedger, initializeRequestScope } from '../../../core/agent/request/ledger.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { publishBoundSessionState, readBoundSessionState, type BoundSessionHost, type BoundSessionState } from '../../../session/store/bound.js';
import { decodeGoal } from '../codec.js';
import { transitionGoal } from '../state.js';
import { PlanError } from '../../plan/model.js';
import { guidanceFields, type GuidanceDraft } from './model.js';
import { decodeGuidance, guidanceVersion } from './state.js';

export interface GuidanceEdit { readonly bound: BoundSessionState; readonly draft?: GuidanceDraft }
export function readGuidance(host: BoundSessionHost, session: Session): GuidanceEdit {
  const bound = readBoundSessionState(host, session); const draft = decodeGuidance(bound.state.goalDraft);
  if (bound.state.goalDraft !== undefined && !draft) throw new PlanError('invalid');
  if (draft && (draft.sessionId !== bound.scope.sessionId || draft.sessionCreatedAt !== bound.scope.sessionCreatedAt
    || !sameValue(draft.workspace, bound.scope.workspace))) throw new PlanError('stale');
  return { bound, ...(draft ? { draft } : {}) };
}
export function writeGuidance(host: BoundSessionHost, session: Session, edit: GuidanceEdit, draft: GuidanceDraft): GuidanceEdit {
  if (!decodeGuidance(draft) || draft.sessionId !== edit.bound.scope.sessionId || draft.sessionCreatedAt !== edit.bound.scope.sessionCreatedAt
    || !sameValue(draft.workspace, edit.bound.scope.workspace)) throw new PlanError('invalid');
  const bound = publishBoundSessionState(host, session, edit.bound, (current, previous) => sameValue(current.goalDraft, previous.goalDraft),
    state => ({ ...state, goalDraft: draft }));
  return { bound, draft: decodeGuidance(bound.state.goalDraft)! };
}
/** One guarded state publication creates the paused user goal and records exact approval. */
export function approveGuidance(host: BoundSessionHost, session: Session, edit: GuidanceEdit, version: string): GuidanceEdit {
  const draft = validateGuidanceApproval(edit, version);
  const timestamp = new Date().toISOString();
  const bound = publishBoundSessionState(host, session, edit.bound,
    (current, previous) => sameValue(current.goalDraft, previous.goalDraft) && sameValue(current.goal, previous.goal), (state, scope) => {
      const current = decodeGoal(state.goal); if (state.goal !== undefined && !current) throw new PlanError('invalid');
      const objective = `${draft.answers.objective}\nExpected outcome: ${draft.answers.outcome}\nConstraints: ${draft.answers.constraints}`;
      const prepared = transitionGoal(current, scope, { type: 'prepare', objective }, timestamp)!;
      const budget = draft.answers.budget;
      const goal = budget === undefined ? prepared : transitionGoal(prepared, scope,
        { type: 'budget', ...(budget !== 'off' ? { cap: Number(budget) } : {}) }, timestamp)!;
      const binding = { sessionId: scope.sessionId, sessionCreatedAt: scope.sessionCreatedAt, directoryIdentity: edit.bound.directoryIdentity };
      const ledger = state.requestLedger === undefined ? createRequestLedger(binding) : decodeRequestLedger(state.requestLedger);
      if (!ledger || ledger.sessionId !== binding.sessionId || ledger.sessionCreatedAt !== binding.sessionCreatedAt
        || ledger.directoryIdentity !== binding.directoryIdentity) throw new PlanError('invalid');
      return { ...state, goal, requestLedger: initializeRequestScope(ledger, { id: goal.id,
        workspacePath: scope.workspace.path, workspaceIdentity: scope.workspace.identity }, false),
      goalDraft: { ...draft, phase: 'approved', updatedAt: timestamp, approval: { source: 'user', version, timestamp, goalId: goal.id } } };
    });
  return { bound, draft: decodeGuidance(bound.state.goalDraft)! };
}
export function validateGuidanceApproval(edit: GuidanceEdit, version: string): GuidanceDraft {
  const draft = edit.draft;
  if (!draft || draft.phase !== 'draft' || version !== guidanceVersion(draft)) throw new PlanError('stale');
  if (guidanceFields.some(field => !draft.answers[field])) throw new PlanError('unapproved');
  const current = decodeGoal(edit.bound.state.goal);
  if (edit.bound.state.goal !== undefined && !current || current && !['complete', 'dropped'].includes(current.phase)) throw new PlanError('busy');
  return draft;
}
