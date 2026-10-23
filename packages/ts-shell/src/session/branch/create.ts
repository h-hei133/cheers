import { appendTranscriptEvent, readTranscriptEvents } from '../transcript/sessionTranscript.js';
import { sessionRootEntryId, buildLinearSessionThreadSnapshot, sessionThreadPath } from '../schema/sessionThread.js';
import { createSession, createSessionWithId } from '../store/sessionCreation.js';
import { readSessionFileVersion } from '../store/version.js';
import type { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { sameValue } from '../../config/values.js';
import { forkThread, forkTranscriptEvents } from './fork.js';

export interface SessionForkOptions {
  readonly activate?: boolean;
  readonly sessionId?: string;
  readonly entryId?: string;
  readonly expectedVersion?: string;
}

export class SessionForkError extends Error {
  constructor(readonly sessionId: string) {
    super(`Fork ${sessionId} was created but completion is unverified. Inspect its saved history before continuing; it was not activated or retried.`);
    this.name = 'SessionForkError';
  }
}

/** Copy a stable source, confirm its branch, and only then activate the new identity. */
export function forkSession(input: {
  readonly store: SessionStoreAccess;
  readonly callbacks: Parameters<typeof createSession>[0]['callbacks'];
  readonly sourceId: string;
  readonly projectRoot?: string;
  readonly options?: SessionForkOptions;
}) {
  const { store, callbacks, sourceId, projectRoot, options } = input;
  if (!store.sessionExists(sourceId)) throw new Error(`Cannot fork: session ${sourceId} does not exist`);
  const layout = store.stateLayout(sourceId);
  const version = readSessionFileVersion(layout);
  if (options?.expectedVersion !== undefined && options.expectedVersion !== version) {
    throw new Error('Cannot fork: source history changed after selection. Reopen its tree.');
  }
  const source = store.load(sourceId);
  const thread = store.readStateSnapshotRequired(store.statePath(sourceId)).thread ?? buildLinearSessionThreadSnapshot(source);
  const events = readTranscriptEvents(store.transcriptPath(sourceId));
  if (readSessionFileVersion(layout) !== version) throw new Error('Cannot fork: source history changed. Reopen its tree.');
  if (!sessionThreadPath(thread).resolved) throw new Error('Cannot fork: session ancestry is unavailable.');
  let forkLeaf = thread.activeLeafId;
  if (options?.entryId !== undefined) {
    const entry = thread.entries.find(item => item.id === options.entryId && item.kind === 'turn-message' && item.role === 'user');
    if (!entry || !sessionThreadPath(thread, entry.id).resolved
      || !events.some(event => event.type === 'message' && event.id === entry.id && event.role === 'user')) {
      throw new Error('Cannot fork: select a saved user-message entry with complete ancestry.');
    }
    if (!entry.parentId || !sessionThreadPath(thread, entry.parentId).resolved) throw new Error('Cannot fork: selected user-message ancestry is unavailable.');
    // The selected question is an editable draft, so the active path ends before it.
    forkLeaf = entry.parentId;
  }
  const creation = { callbacks: { ...callbacks, setCurrentSessionForProject: () => {} }, projectRoot: projectRoot ?? source.projectRoot,
    options: { ...(!projectRoot || projectRoot === source.projectRoot ? { workspaceRoots: source.workspaceRoots } : {}),
      ...(source.title ? { title: source.title } : {}), parentSession: source.id } };
  const forked = options?.sessionId === undefined ? createSession(creation) : createSessionWithId({ ...creation, sessionId: options.sessionId });
  try {
    const transcriptPath = store.transcriptPath(forked.id);
    for (const event of forkTranscriptEvents(events, source.id, forked.id)) {
      store.withSessionStateLock(forked.id, () => {
        appendTranscriptEvent(transcriptPath, event.type === 'command-output' && event.sourceEntryId === sessionRootEntryId(source.id)
          ? { ...event, sourceEntryId: sessionRootEntryId(forked.id) } : event, undefined, { requireExisting: true });
      }, { requireExisting: true });
    }
    const copied = forkThread({ ...thread, activeLeafId: forkLeaf }, source.id, forked.id);
    store.writeSessionState(forked, { thread: copied });
    const saved = store.load(forked.id);
    const state = store.readStateSnapshotRequired(store.statePath(forked.id));
    if (!sameValue(state.thread, copied) || !sessionThreadPath(copied).resolved || saved.parentSession !== source.id) throw new Error('Fork readback failed.');
    if (options?.activate !== false) callbacks.setCurrentSessionForProject(saved.projectRoot, saved.id);
    return saved;
  } catch { throw new SessionForkError(forked.id); }
}
