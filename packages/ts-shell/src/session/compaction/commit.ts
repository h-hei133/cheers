import fs from 'node:fs';
import { freezeDeep } from '../../core/values/freeze.js';
import { fileIdentity } from '../../core/workspace/files.js';
import type { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { captureTranscriptAppend, reconcileTranscriptAppend } from '../transcript/append.js';
import { appendTranscriptEvent } from '../transcript/sessionTranscript.js';
import { createTranscriptEntryId, encodeTranscriptEvent, type TranscriptEvent } from '../sessionEventCodec.js';
import { selectModelContext } from '../context/selection.js';
import { digest, directoryIdentity } from './state.js';
import type { CompactionCommit, CompactionCommitInput, CompactionSource } from './contract.js';
import { compactionPublicationDigest } from './publication.js';
import { buildLinearSessionThreadSnapshot, catchUpSessionThread, sessionThreadPath } from '../schema/sessionThread.js';

function transcriptIdentity(file: string): string {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error('Compaction source storage is unavailable.');
  return fileIdentity(stat);
}

function capture(store: SessionStoreAccess, sessionId: string): CompactionSource {
  const layout = store.stateLayout(sessionId);
  const { session, state } = store.readSnapshot(sessionId);
  const storage = directoryIdentity(layout.sessionDir);
  const history = selectModelContext(session);
  const branch = sessionThreadPath(catchUpSessionThread(state.thread ?? buildLinearSessionThreadSnapshot(session), session));
  if (!branch.resolved || !branch.path.length) throw new Error('Compaction source branch is unavailable.');
  const sourceActivePath = branch.path.map(entry => entry.id);
  const replayIdentity = digest([session.id, session.createdAt, storage, state.projectRoot, state.workspaceRoots,
    sourceActivePath, state.modelSelection, state.modelRevision, state.contextSelection, state.contextAttachments, history]);
  const activation = store.readCurrentSessionSelection(session.projectRoot);
  // Query and lifecycle events are durable observations of a run. They append to
  // the transcript while a summary is in flight, but they do not change the
  // model history or the branch being summarized. Keep the source fence tied to
  // logical session state and file ownership so those observations do not make a
  // valid publication look stale, while message/branch changes still invalidate it.
  const logicalState = {
    projectRoot: state.projectRoot,
    workspaceRoots: state.workspaceRoots,
    // Use the resolved path plus navigation identity so equivalent lazy thread
    // materialization is ignored while a branch round-trip still invalidates
    // this source through its monotonic navigation revision.
    thread: {
      activeLeafId: sourceActivePath.at(-1),
      activeBranchId: state.thread?.activeBranchId,
      navigationRevision: state.thread?.navigationRevision,
    },
    modelSelection: state.modelSelection,
    modelRevision: state.modelRevision,
    contextSelection: state.contextSelection,
    contextAttachments: state.contextAttachments,
    pendingPrompt: state.pendingPrompt,
    pendingPromptEntryId: state.pendingPromptEntryId,
  };
  // Native resume republishes the project's activation even when history and
  // timestamps are unchanged. Lifecycle/title writes only publish metadata and
  // state, so their atomic renames must not retire this source. Activation is a
  // publication fence; replay still uses the logical identity above so an
  // unknown summary request cannot be sent again after resume.
  const identity = digest([session.id, session.createdAt, storage, [activation?.sessionId, activation?.activationId],
    transcriptIdentity(layout.transcriptPath), logicalState, history, sourceActivePath]);
  return freezeDeep({ sessionId, identity, replayIdentity, directory: layout.sessionDir, directoryIdentity: storage,
    history: structuredClone(history), sourceActivePath,
    ...(state.pendingPromptEntryId ? { promptEntryId: state.pendingPromptEntryId } : {}) });
}

export function captureSessionCompaction(store: SessionStoreAccess, sessionId: string): CompactionSource {
  return store.withSessionStateLock(sessionId, () => capture(store, sessionId), { requireExisting: true });
}

/** A synchronous check and append under the native session lock is the publication authority. */
export function commitSessionCompaction(store: SessionStoreAccess, input: CompactionCommitInput): CompactionCommit {
  let attempted = false;
  try {
    const refused = input.signal?.aborted ? 'Compaction was cancelled.' : input.admission?.();
    if (refused) return { status: 'refused', reason: refused };

    const current = capture(store, input.source.sessionId);
    if (current.identity !== input.source.identity) {
      return { status: 'refused', reason: 'The session source changed while its summary was generated.' };
    }
    const transcript = store.transcriptPath(input.source.sessionId);
    const before = captureTranscriptAppend(transcript);
    const event: TranscriptEvent = { type: 'compaction', id: createTranscriptEntryId('comp'),
      publication: 'prepared',
      sourceActivePath: current.sourceActivePath,
      summary: input.summary, keptMessages: input.keptMessages, tokensBefore: input.tokensBefore,
      timestamp: new Date().toISOString() };
    const blocked = input.signal?.aborted ? 'Compaction was cancelled.' : input.admission?.();
    if (blocked) return { status: 'refused', reason: blocked };

    // Admission can invoke native session owners synchronously. Keep it outside
    // the non-reentrant state lock, then revalidate the source while locked.
    return store.withSessionStateLock(input.source.sessionId, () => {
      input.signal?.throwIfAborted();
      if (capture(store, input.source.sessionId).identity !== input.source.identity) {
        return { status: 'refused', reason: 'The session source changed while its summary was generated.' };
      }
      if (input.signal?.aborted) return { status: 'refused', reason: 'Compaction was cancelled.' };
      const append = { requireExisting: true, expectedIdentity: before.identity, durable: true };
      const prepared = `${encodeTranscriptEvent(event)}\n`;
      attempted = true;
      appendTranscriptEvent(transcript, event, undefined, append);
      if (!reconcileTranscriptAppend(transcript, before, prepared, false)
        || directoryIdentity(input.source.directory!) !== input.source.directoryIdentity) {
        return { status: 'unverified', reason: 'Compaction append could not be verified.' };
      }
      const publication: TranscriptEvent = { type: 'compaction-commit', id: createTranscriptEntryId('compcommit'),
        compactionId: event.id!, digest: compactionPublicationDigest(event), timestamp: new Date().toISOString() };
      appendTranscriptEvent(transcript, publication, undefined, append);
      if (!reconcileTranscriptAppend(transcript, before, `${prepared}${encodeTranscriptEvent(publication)}\n`, false)
        || directoryIdentity(input.source.directory!) !== input.source.directoryIdentity) {
        return { status: 'unverified', reason: 'Compaction publication could not be verified.' };
      }
      return { status: 'committed' };
    }, { requireExisting: true });
  } catch {
    return { status: attempted ? 'unverified' : 'refused',
      reason: attempted ? 'Compaction append or lock release could not be verified.' : 'Compaction source is no longer available.' };
  }
}
