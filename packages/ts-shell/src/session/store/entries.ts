import { buildLinearSessionThreadSnapshot, catchUpSessionThread } from '../schema/sessionThread.js';
import { readTranscriptEvents } from '../transcript/sessionTranscript.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from './sessionFileLayout.js';
import { readSessionRecordSnapshot } from './sessionStore.js';

/** The transcript and its caught-up thread come from the same saved revision. */
export function readSessionEntrySnapshot(sessionId: string, cwd: string) {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
  const { session, state, events } = readSessionRecordSnapshot({ sessionId, layout, cwd });
  const thread = catchUpSessionThread(state.thread ?? buildLinearSessionThreadSnapshot(session), session);
  return { session, events, thread };
}

/** The transcript can still be inspected when the rest of the session is unavailable. */
export function readSessionEntryTranscript(sessionId: string) {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
  return readTranscriptEvents(layout.transcriptPath);
}
