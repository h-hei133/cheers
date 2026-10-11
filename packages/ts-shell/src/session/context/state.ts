import type { SessionManager } from '../SessionManager.js';
import type { Session } from '../schema/sessionRecord.js';
import { sameValue } from '../../config/values.js';
import { publishBoundSessionState, readBoundSessionState } from '../store/bound.js';
import { decodeContextSelection, contextMessageHash } from './selection.js';

/** Change derived input only while the original transcript and selection still match. */
export function updateContextSelection(manager: Pick<SessionManager, 'getSession' | 'getSessionDirPath'>,
  session: Session, selection: unknown, admission: () => string | undefined = () => undefined): Session {
  const next = selection === undefined ? undefined : decodeContextSelection(selection);
  const baseline = readBoundSessionState(manager, session);
  if (!sameValue(baseline.state.contextSelection, session.contextSelection)) throw new Error('The saved context selection changed. Reopen the preview.');
  const messages = new Map(session.turns.map(message => [message.id, message]));
  for (const entry of next?.entries ?? []) {
    const message = messages.get(entry.id);
    if (!message || contextMessageHash(message) !== entry.hash) throw new Error('A selected message changed. Reopen the preview.');
  }
  publishBoundSessionState(manager, session, baseline, (current, previous) => sameValue(current.contextSelection, previous.contextSelection)
    && sameValue(current.thread, previous.thread), current => {
    const refused = admission(); if (refused) throw new Error(refused);
    const latest = manager.getSession(session.id);
    if (!latest || !sameValue(latest.turns, session.turns)) throw new Error('Conversation changed after the context preview.');
    return { ...current, contextSelection: next };
  });
  const saved = manager.getSession(session.id);
  if (!saved) throw new Error('Context selection publication is unverified.');
  return saved;
}
