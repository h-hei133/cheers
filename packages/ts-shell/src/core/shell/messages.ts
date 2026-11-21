import type { SessionManager } from '../../session/SessionManager.js';
import { createTranscriptEntryId } from '../../session/sessionEventCodec.js';
import { snapshotCustomMessage } from '../agent/custom.js';
import type { QueryEvent } from '../query/runtime/events.js';
import { snapshotData } from '../values/data.js';

export function customMessageWriter(store: Pick<SessionManager, 'addTurn'>, busy: () => boolean,
  publish: (event: Extract<QueryEvent, { type: 'message.custom' }>) => void):
  (sessionId: string, input: unknown, allowCrossRealm?: boolean) => void {
  return (sessionId, input, allowCrossRealm) => {
    if (busy()) throw new Error('Wait for the active turn before appending custom history.');
    const saved = snapshotData(input, { bytes: 32 * 1024 * 1024, nodes: 100_000, depth: 32, allowCrossRealm });
    const message = snapshotCustomMessage({ ...(saved as object), role: 'custom', id: createTranscriptEntryId('custom') });
    store.addTurn(sessionId, message);
    if (message.display) publish({ type: 'message.custom', sessionId, message });
  };
}
