import type { SessionMessage } from '../schema/sessionMessage.js';
import { isSessionContextMessage } from '../schema/sessionMessage.js';
import { buildLinearSessionThreadSnapshot, catchUpSessionThread, sessionThreadPath } from '../schema/sessionThread.js';
import type { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { readSessionMetadataRecord, readSessionRecordSnapshot } from '../store/sessionStore.js';
import { readSessionFileVersion } from '../store/version.js';
import { normalizePathIdentity } from '../continuation/roots.js';
import { switchDurableSessionActiveLeaf } from '../store/threadState.js';
import { appendBranchSummaryEvent } from '../transcript/sessionTranscript.js';

/** A report-safe warning after a leaf write; callers must reread its actual outcome. */
export class SessionNavigationWarning extends Error {
  constructor(message: string, readonly dropped: number) {
    super(message);
    this.name = 'SessionNavigationWarning';
  }
}

/** Preserve the numeric API while keeping the write and its optional note separate. */
export async function revertSession(
  store: Pick<SessionStoreAccess, 'sessionExists' | 'stateLayout'>,
  sessionId: string,
  entryId: string,
  summarize?: (abandoned: readonly SessionMessage[]) => Promise<string | undefined>,
  beforeWrite?: () => void,
): Promise<number> {
  beforeWrite?.();
  if (!store.sessionExists(sessionId)) return 0;
  const layout = store.stateLayout(sessionId);
  const version = readSessionFileVersion(layout);
  const { session, state } = readSessionRecordSnapshot({ sessionId, layout, cwd: process.cwd() });
  if (session.id !== sessionId || version !== readSessionFileVersion(layout)) {
    throw new Error('The stored session changed while preparing navigation.');
  }
  const current = catchUpSessionThread(state.thread ?? buildLinearSessionThreadSnapshot(session), session);
  const target = sessionThreadPath(current, entryId);
  if (!target.resolved || target.path.length === 0 || current.activeLeafId === entryId) return 0;

  const onBranch = new Set(target.path.map(entry => entry.id));
  const abandoned = session.turns.filter(turn => !isSessionContextMessage(turn)
    && (turn.id === undefined || !onBranch.has(turn.id)));
  let summary: string | undefined;
  let summaryFailed = false;
  if (summarize && abandoned.length) {
    try { summary = await summarize(abandoned); }
    catch { summaryFailed = true; }
  }

  switchDurableSessionActiveLeaf({
    session, layout, leafEntryId: entryId,
    expected: { thread: state.thread, projectRoot: state.projectRoot },
    beforeWrite: () => {
      beforeWrite?.();
      if (store.stateLayout(sessionId).sessionDir !== layout.sessionDir) {
        throw new Error('The session location changed while preparing navigation.');
      }
      const metadata = readSessionMetadataRecord(layout.metadataPath);
      if (metadata?.id !== sessionId || metadata.createdAt !== session.createdAt
        || normalizePathIdentity(metadata.projectRoot?.trim() || state.projectRoot || process.cwd()) !== normalizePathIdentity(session.projectRoot)) {
        throw new Error('The stored session identity or project changed while preparing navigation.');
      }
    },
  });
  try {
    appendBranchSummaryEvent(layout.transcriptPath, {
      ...(summary !== undefined ? { summary } : {}),
      droppedTurns: abandoned.length,
      toEntryId: entryId,
      abandonedEntryIds: abandoned.flatMap(turn => turn.id === undefined ? [] : [turn.id]),
      timestamp: new Date().toISOString(),
    });
  } catch {
    throw new SessionNavigationWarning('The branch note could not be saved completely.', abandoned.length);
  }
  if (summaryFailed) {
    throw new SessionNavigationWarning('The previous branch could not be summarized.', abandoned.length);
  }
  return abandoned.length;
}
