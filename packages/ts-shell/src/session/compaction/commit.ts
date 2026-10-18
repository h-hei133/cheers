import fs from 'node:fs';
import { freezeDeep } from '../../core/values/freeze.js';
import type { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { appendTranscriptEvent } from '../transcript/sessionTranscript.js';
import { createTranscriptEntryId, encodeTranscriptEvent, type TranscriptEvent } from '../sessionEventCodec.js';
import { selectModelContext } from '../context/selection.js';
import { digest, directoryIdentity } from './state.js';
import type { CompactionCommit, CompactionCommitInput, CompactionSource } from './contract.js';
import { compactionPublicationDigest } from './publication.js';
import { buildLinearSessionThreadSnapshot, catchUpSessionThread, sessionThreadPath } from '../schema/sessionThread.js';

function fileIdentity(file: string): string {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error('Compaction source storage is unavailable.');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

function capture(store: SessionStoreAccess, sessionId: string): CompactionSource {
  const layout = store.stateLayout(sessionId);
  const session = store.load(sessionId);
  const state = store.readStateSnapshotRequired(layout.statePath);
  const storage = directoryIdentity(layout.sessionDir);
  const history = selectModelContext(session);
  const branch = sessionThreadPath(catchUpSessionThread(state.thread ?? buildLinearSessionThreadSnapshot(session), session));
  if (!branch.resolved || !branch.path.length) throw new Error('Compaction source branch is unavailable.');
  const sourceActivePath = branch.path.map(entry => entry.id);
  const replayIdentity = digest([session.id, session.createdAt, storage, state.projectRoot, state.workspaceRoots,
    sourceActivePath, state.modelSelection, state.modelRevision, state.contextSelection, state.contextAttachments, history]);
  const identity = digest([session.id, session.createdAt, storage, fileIdentity(layout.metadataPath),
    fs.readFileSync(layout.metadataPath, 'utf8'), fileIdentity(layout.transcriptPath), fs.readFileSync(layout.transcriptPath, 'utf8'),
    state.projectRoot, state.workspaceRoots, state.thread, state.modelSelection, state.modelRevision,
    state.contextSelection, state.contextAttachments, state.pendingPrompt, state.pendingPromptEntryId, history, sourceActivePath]);
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
    return store.withSessionStateLock(input.source.sessionId, () => {
      const refused = input.signal?.aborted ? 'Compaction was cancelled.' : input.admission?.();
      if (refused) return { status: 'refused', reason: refused };
      const current = capture(store, input.source.sessionId);
      if (current.identity !== input.source.identity) return { status: 'refused', reason: 'The session source changed while its summary was generated.' };
      const transcript = store.transcriptPath(input.source.sessionId);
      const before = fs.readFileSync(transcript, 'utf8');
      const identity = fileIdentity(transcript);
      const event: TranscriptEvent = { type: 'compaction', id: createTranscriptEntryId('comp'),
        publication: 'prepared',
        sourceActivePath: current.sourceActivePath,
        summary: input.summary, keptMessages: input.keptMessages, tokensBefore: input.tokensBefore,
        timestamp: new Date().toISOString() };
      // Recheck after preparation, immediately before the append effect.
      input.signal?.throwIfAborted();
      const blocked = input.admission?.();
      if (blocked) return { status: 'refused', reason: blocked };
      // Admission may invoke a native owner synchronously. Check its resulting source before the effect.
      if (capture(store, input.source.sessionId).identity !== input.source.identity) {
        return { status: 'refused', reason: 'The session source changed while its summary was generated.' };
      }
      if (input.signal?.aborted) return { status: 'refused', reason: 'Compaction was cancelled.' };
      attempted = true;
      appendTranscriptEvent(transcript, event, undefined, { requireExisting: true });
      const fd = fs.openSync(transcript, 'r');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const separator = before.length && !before.endsWith('\n') ? '\n' : '';
      if (fileIdentity(transcript) !== identity || fs.readFileSync(transcript, 'utf8') !== `${before}${separator}${encodeTranscriptEvent(event)}\n`
        || directoryIdentity(input.source.directory!) !== input.source.directoryIdentity) {
        return { status: 'unverified', reason: 'Compaction append could not be verified.' };
      }
      const publication: TranscriptEvent = { type: 'compaction-commit', id: createTranscriptEntryId('compcommit'),
        compactionId: event.id!, digest: compactionPublicationDigest(event), timestamp: new Date().toISOString() };
      appendTranscriptEvent(transcript, publication, undefined, { requireExisting: true });
      const proofFd = fs.openSync(transcript, 'r');
      try { fs.fsyncSync(proofFd); } finally { fs.closeSync(proofFd); }
      if (fileIdentity(transcript) !== identity || fs.readFileSync(transcript, 'utf8') !==
        `${before}${separator}${encodeTranscriptEvent(event)}\n${encodeTranscriptEvent(publication)}\n`
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
