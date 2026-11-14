import fs from 'node:fs';
import { descriptorPath, fileIdentity, pathIdentity } from '../../workspace/files.js';
import { captureWorkspaceRoot } from '../../workspace/roots.js';
import { sameValue } from '../../../config/values.js';
import { readBoundSessionState, type BoundSessionState } from '../../../session/store/bound.js';
import { assertSessionStoreProfile, locateExistingSessionLayout, type SessionStoreLayout } from '../../../session/store/sessionFileLayout.js';
import { readSessionRecordSnapshot } from '../../../session/store/sessionStore.js';
import { readSessionFileVersion } from '../../../session/store/version.js';
import { buildLinearSessionThreadSnapshot, catchUpSessionThread, sessionRootEntryId, sessionThreadPath, type SessionThreadSnapshot } from '../../../session/schema/sessionThread.js';
import type { TranscriptEvent } from '../../../session/sessionEventCodec.js';
import { readTranscriptPrefixDigest } from '../../../session/transcript/source.js';

export type CodemodeStoreStatus = 'unchanged' | 'unknown' | 'persisted';
export type CodemodeStoreReason = 'unavailable' | 'conflict' | 'write-failed' | 'verification-failed' | 'lock-failed' | 'invalid' | 'budget';
export class CodemodeStoreError extends Error {
  constructor(readonly reason: CodemodeStoreReason, readonly status: CodemodeStoreStatus = 'unchanged') {
    super(`Codemode storage ${reason}; persistence ${status}.`); this.name = 'CodemodeStoreError';
  }
}

export interface CodemodeState {
  readonly bound: BoundSessionState;
  readonly transcriptIdentity: string;
  readonly sourcePathIdentity: string;
  readonly branchIdentity: string;
  readonly activeEntryIds: readonly string[];
  readonly activeLeafId: string;
  readonly events: readonly TranscriptEvent[];
  readonly version: string;
  readonly transcriptPrefix: { readonly bytes: number; readonly sha256: string };
}

/** Validate the saved ancestry before compatibility catch-up may choose a new path. */
function assertThread(thread: SessionThreadSnapshot, sessionId: string): void {
  const rootId = sessionRootEntryId(sessionId);
  const roots = thread.entries.filter(entry => entry.kind === 'session-root');
  const branch = sessionThreadPath(thread);
  if (new Set(thread.entries.map(entry => entry.id)).size !== thread.entries.length
    || roots.length !== 1 || roots[0]!.id !== rootId || roots[0]!.parentId !== undefined
    || !branch.resolved || !branch.path.length || branch.path[0]!.id !== rootId) throw new CodemodeStoreError('unavailable');
}

function capturePrefix(target: string, identity: string, prefix?: CodemodeState['transcriptPrefix']): CodemodeState['transcriptPrefix'] {
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || fileIdentity(before) !== identity || descriptorPath(fd, target) !== target) throw new CodemodeStoreError('conflict');
    const bytes = prefix?.bytes ?? before.size;
    if (before.size < bytes) throw new CodemodeStoreError('conflict');
    const sha256 = readTranscriptPrefixDigest(fd, bytes);
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || prefix && sha256 !== prefix.sha256) throw new CodemodeStoreError('conflict');
    return Object.freeze({ bytes, sha256 });
  } finally { fs.closeSync(fd); }
}

/** Acquire one actual saved branch; failures never establish an empty ephemeral store. */
export function readCodemodeState(store: SessionStoreLayout, sessionId: string, cwd?: string,
  prefix?: CodemodeState['transcriptPrefix']): CodemodeState {
  try {
    assertSessionStoreProfile(store);
    const layout = locateExistingSessionLayout(store, sessionId);
    const sourcePathIdentity = pathIdentity(layout.transcriptPath);
    const version = readSessionFileVersion(layout);
    const transcriptIdentity = fileIdentity(fs.lstatSync(layout.transcriptPath));
    const snapshot = readSessionRecordSnapshot({ sessionId, layout, cwd: cwd ?? process.cwd() });
    if (snapshot.warnings.length || snapshot.transcriptTruncated) throw new CodemodeStoreError('unavailable');
    const bound = readBoundSessionState({ getSessionDirPath: () => layout.sessionDir }, snapshot.session);
    if (snapshot.state.thread !== undefined) assertThread(snapshot.state.thread, sessionId);
    const thread = catchUpSessionThread(snapshot.state.thread ?? buildLinearSessionThreadSnapshot(snapshot.session), snapshot.session);
    assertThread(thread, sessionId);
    const branch = sessionThreadPath(thread);
    if (cwd !== undefined) {
      const workspace = captureWorkspaceRoot(cwd, cwd, 'read');
      if (!sameValue(bound.scope.workspace, { path: workspace.path, identity: workspace.identity })) throw new CodemodeStoreError('conflict');
    }
    const transcriptPrefix = capturePrefix(layout.transcriptPath, transcriptIdentity, prefix);
    if (readSessionFileVersion(layout) !== version || pathIdentity(layout.transcriptPath) !== sourcePathIdentity) throw new CodemodeStoreError('conflict');
    const activeEntryIds = Object.freeze(branch.path.map(entry => entry.id));
    return Object.freeze({ bound, transcriptIdentity, sourcePathIdentity, version, activeEntryIds, transcriptPrefix,
      activeLeafId: activeEntryIds.at(-1)!, events: snapshot.events,
      branchIdentity: JSON.stringify({ path: branch.path, leaf: thread.activeLeafId, branch: thread.activeBranchId,
        navigation: thread.navigationRevision }),
    });
  } catch (error) { throw error instanceof CodemodeStoreError ? error : new CodemodeStoreError('unavailable'); }
}

/** Permit unrelated state and append-only activity while refusing a changed binding or ancestry. */
export function assertCodemodeState(current: CodemodeState, captured: CodemodeState): void {
  if (current.bound.layout.sessionDir !== captured.bound.layout.sessionDir
    || current.bound.directoryIdentity !== captured.bound.directoryIdentity
    || !sameValue(current.bound.scope, captured.bound.scope)
    || current.transcriptIdentity !== captured.transcriptIdentity || current.sourcePathIdentity !== captured.sourcePathIdentity
    || current.branchIdentity !== captured.branchIdentity) throw new CodemodeStoreError('conflict');
}
