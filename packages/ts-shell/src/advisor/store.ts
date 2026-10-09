import { sameValue } from '../config/values.js';
import type { Session } from '../session/schema/sessionRecord.js';
import { readBoundSessionState, publishBoundSessionState, type BoundSessionHost, type BoundSessionState } from '../session/store/bound.js';
import type { TranscriptEvent } from '../session/sessionEventCodec.js';
import { decodeAdvisor } from './codec.js';
import type { AdvisorState } from './model.js';
import type { SessionStateSnapshot } from '../session/schema/sessionStateSnapshot.js';

export interface AdvisorStore extends BoundSessionHost { getTranscriptEvents(sessionId: string): readonly TranscriptEvent[] }
export interface AdvisorEdit { readonly bound: BoundSessionState; readonly advisor: AdvisorState }
export function readAdvisor(store: BoundSessionHost, session: Session): AdvisorEdit {
  const bound = readBoundSessionState(store, session); const value = bound.state.advisor;
  const advisor = value === undefined ? { ...bound.scope, schemaVersion: 1 as const, epoch: 0, enabled: false,
    status: 'off' as const, eligible: 0, captured: 0, checkpoints: [], notes: [] } : decodeAdvisor(value);
  if (!advisor || advisor.sessionId !== bound.scope.sessionId || advisor.sessionCreatedAt !== bound.scope.sessionCreatedAt
    || !sameValue(advisor.workspace, bound.scope.workspace)) throw new Error('Advisor state binding is unavailable.');
  return { bound, advisor };
}
export function writeAdvisor(store: BoundSessionHost, session: Session, edit: AdvisorEdit, advisor: AdvisorState,
  guard?: (state: SessionStateSnapshot) => boolean): AdvisorEdit {
  if (!decodeAdvisor(advisor) || advisor.sessionId !== edit.bound.scope.sessionId || advisor.sessionCreatedAt !== edit.bound.scope.sessionCreatedAt
    || !sameValue(advisor.workspace, edit.bound.scope.workspace)) throw new Error('Advisor state is invalid.');
  const bound = publishBoundSessionState(store, session, edit.bound, (current, previous) => sameValue(current.advisor, previous.advisor) && (!guard || guard(current)),
    state => ({ ...state, advisor }));
  return { bound, advisor: decodeAdvisor(bound.state.advisor)! };
}
