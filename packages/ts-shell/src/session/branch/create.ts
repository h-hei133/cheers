import { randomUUID } from 'node:crypto';
import { sessionRootEntryId, buildLinearSessionThreadSnapshot, sessionThreadPath } from '../schema/sessionThread.js';
import { createSession, createSessionWithId } from '../store/sessionCreation.js';
import { readSessionFileVersion } from '../store/version.js';
import type { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { sameValue } from '../../config/values.js';
import { forkThread, forkTranscriptEvents } from './fork.js';
import { decodeSessionModel } from '../model/state.js';
import { buildSessionStateSnapshot } from '../schema/sessionStateSnapshot.js';
import type { Session } from '../schema/sessionRecord.js';
import { SessionCreationUnverifiedError } from '../store/create.js';

export interface SessionForkOptions {
  readonly activate?: boolean;
  readonly sessionId?: string;
  readonly entryId?: string;
  readonly expectedVersion?: string;
}

export class SessionForkError extends Error {
  constructor(readonly sessionId: string) {
    super(`Completion of fork ${sessionId} is unverified. Inspect its saved history and current selection before continuing.`);
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
  const { session: source, state: sourceState, events } = store.readSnapshot(sourceId);
  const selection = decodeSessionModel(sourceState.modelSelection);
  if (sourceState.modelSelection !== undefined && !selection) throw new Error('Cannot fork: source model selection is unavailable.');
  const thread = sourceState.thread ?? buildLinearSessionThreadSnapshot(source);
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
  const destination = projectRoot ?? source.projectRoot;
  const guard = options?.activate === false ? undefined : {
    source: { projectRoot: source.projectRoot, expected: store.readCurrentSessionSelection(source.projectRoot) },
    destination: store.readCurrentSessionSelection(destination),
  };
  const id = callbacks.validateSessionId(options?.sessionId ?? callbacks.createSessionId());
  const copied = forkThread({ ...thread, activeLeafId: forkLeaf }, source.id, id);
  if (!sessionThreadPath(copied).resolved) throw new Error('Fork ancestry is unavailable.');
  const sourceRoot = sessionRootEntryId(source.id), forkRoot = sessionRootEntryId(id);
  const copiedEvents = forkTranscriptEvents(events, source.id, id).map(event =>
    event.type === 'command-output' && event.sourceEntryId === sourceRoot ? { ...event, sourceEntryId: forkRoot } : event);
  const forked = createSessionWithId({ callbacks: {
    ...callbacks, setCurrentSessionForProject: () => {},
    writeSession: (session: Session) => {
      const state = buildSessionStateSnapshot(session, undefined, { thread: copied });
      try {
        store.writeSession(session, {
          events: copiedEvents,
          state: selection ? { ...state, modelSelection: selection, modelRevision: randomUUID() } : state,
          beforePublish: () => {
            if (store.sessionDir(sourceId) !== layout.sessionDir || readSessionFileVersion(layout) !== version) {
              throw new Error('Cannot fork: source history changed. Reopen its tree.');
            }
          },
        });
      } catch (error) {
        if (error instanceof SessionCreationUnverifiedError) throw new SessionForkError(session.id);
        throw error;
      }
    },
  }, sessionId: id, projectRoot: destination,
    options: { ...(!projectRoot || projectRoot === source.projectRoot ? { workspaceRoots: source.workspaceRoots } : {}),
      ...(source.title ? { title: source.title } : {}), parentSession: source.id } });
  try {
    const { session: saved, state } = store.readSnapshot(forked.id, { readOnly: true });
    if (!sameValue(state.thread, copied) || !sameValue(state.modelSelection, selection)
      || saved.parentSession !== source.id) throw new Error('Fork readback failed.');
    if (guard) callbacks.setCurrentSessionForProject(saved.projectRoot, saved.id, { guard });
    return saved;
  } catch { throw new SessionForkError(forked.id); }
}
