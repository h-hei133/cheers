import type { SessionManager } from '../../session/SessionManager.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readBoundSessionState, publishBoundSessionState } from '../../session/store/bound.js';
import { sameValue } from '../../config/values.js';
import { decodeContextEntries, type ContextEntry } from './entry.js';

/** Store the attachment owner's payload without overwriting newer session state. */
export function updateContextAttachments(manager: Pick<SessionManager, 'getSession' | 'getSessionDirPath'>,
  session: Session, entries: readonly ContextEntry[], admission: () => string | undefined): Session {
  const next = decodeContextEntries(entries);
  const baseline = readBoundSessionState(manager, session);
  if (!sameValue(baseline.state.contextAttachments ?? [], session.contextAttachments ?? [])) throw new Error('Saved context attachments changed.');
  publishBoundSessionState(manager, session, baseline, (current, previous) => sameValue(current.contextAttachments, previous.contextAttachments), current => {
    const refused = admission(); if (refused) throw new Error(refused);
    return { ...current, contextAttachments: next };
  });
  const saved = manager.getSession(session.id);
  if (!saved) throw new Error('Context attachment publication is unverified.');
  return saved;
}
