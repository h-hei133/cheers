import fs from 'node:fs';
import { descriptorPath, fileIdentity, pathIdentity } from '../../../core/workspace/files.js';
import { captureWorkspaceRoot } from '../../../core/workspace/roots.js';
import { sameValue } from '../../../config/values.js';
import { readBoundSessionState, type BoundSessionState } from '../../store/bound.js';
import { assertSessionStoreProfile, locateExistingSessionLayout, type SessionStoreLayout } from '../../store/sessionFileLayout.js';
import { readSessionRecordSnapshot, type SessionReadLimits } from '../../store/sessionStore.js';
import { readSessionFileVersion } from '../../store/version.js';
import { buildLinearSessionThreadSnapshot, catchUpSessionThread, sessionRootEntryId, sessionThreadPath, type SessionThreadSnapshot } from '../../schema/sessionThread.js';
import type { TranscriptEvent } from '../../sessionEventCodec.js';
import type { Session } from '../../schema/sessionRecord.js';
import { readTranscriptPrefixDigest } from '../../transcript/source.js';
import { BranchStoreError } from './contract.js';

export interface BranchStoreState {
  readonly bound: BoundSessionState;
  readonly transcriptIdentity: string;
  readonly sourcePathIdentity: string;
  readonly branchIdentity: string;
  readonly activeEntryIds: readonly string[];
  readonly activeLeafId: string;
  readonly thread: SessionThreadSnapshot;
  readonly session: Session;
  readonly events: readonly TranscriptEvent[];
  readonly version: string;
  readonly transcriptPrefix: { readonly bytes: number; readonly sha256: string };
}

/** Validate saved ancestry before compatibility catch-up may choose a new path. */
function assertThread(thread: SessionThreadSnapshot, sessionId: string): void {
  const rootId = sessionRootEntryId(sessionId);
  const roots = thread.entries.filter(entry => entry.kind === 'session-root');
  const branch = sessionThreadPath(thread);
  if (new Set(thread.entries.map(entry => entry.id)).size !== thread.entries.length
    || roots.length !== 1 || roots[0]!.id !== rootId || roots[0]!.parentId !== undefined
    || !branch.resolved || !branch.path.length || branch.path[0]!.id !== rootId) throw new BranchStoreError('unavailable');
}

function capturePrefix(target: string, identity: string, prefix?: BranchStoreState['transcriptPrefix']): BranchStoreState['transcriptPrefix'] {
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || fileIdentity(before) !== identity || descriptorPath(fd, target) !== target) throw new BranchStoreError('conflict');
    const bytes = prefix?.bytes ?? before.size;
    if (before.size < bytes) throw new BranchStoreError('conflict');
    const sha256 = readTranscriptPrefixDigest(fd, bytes);
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || prefix && sha256 !== prefix.sha256) throw new BranchStoreError('conflict');
    return Object.freeze({ bytes, sha256 });
  } finally { fs.closeSync(fd); }
}

/** Acquire one actual saved branch; failures never establish an empty ephemeral store. */
export function readBranchStoreState(store: SessionStoreLayout, sessionId: string, cwd?: string,
  prefix?: BranchStoreState['transcriptPrefix'], limits?: SessionReadLimits): BranchStoreState {
  try {
    assertSessionStoreProfile(store);
    const layout = locateExistingSessionLayout(store, sessionId);
    const sourcePathIdentity = pathIdentity(layout.transcriptPath);
    const version = readSessionFileVersion(layout);
    const transcriptIdentity = fileIdentity(fs.lstatSync(layout.transcriptPath));
    const snapshot = readSessionRecordSnapshot({ sessionId, layout, cwd: cwd ?? process.cwd(), limits });
    if (snapshot.warnings.length || snapshot.transcriptTruncated) throw new BranchStoreError('unavailable');
    const bound = readBoundSessionState({ getSessionDirPath: () => layout.sessionDir }, snapshot.session, limits);
    if (snapshot.state.thread !== undefined) assertThread(snapshot.state.thread, sessionId);
    const thread = catchUpSessionThread(snapshot.state.thread ?? buildLinearSessionThreadSnapshot(snapshot.session), snapshot.session, limits?.entries);
    assertThread(thread, sessionId);
    const branch = sessionThreadPath(thread);
    if (cwd !== undefined) {
      const workspace = captureWorkspaceRoot(cwd, cwd, 'read');
      if (!sameValue(bound.scope.workspace, { path: workspace.path, identity: workspace.identity })) throw new BranchStoreError('conflict');
    }
    const transcriptPrefix = capturePrefix(layout.transcriptPath, transcriptIdentity, prefix);
    if (readSessionFileVersion(layout) !== version || pathIdentity(layout.transcriptPath) !== sourcePathIdentity) throw new BranchStoreError('conflict');
    const activeEntryIds = Object.freeze(branch.path.map(entry => entry.id));
    return Object.freeze({ bound, transcriptIdentity, sourcePathIdentity, version, activeEntryIds, transcriptPrefix,
      activeLeafId: activeEntryIds.at(-1)!, events: snapshot.events, thread, session: snapshot.session,
      branchIdentity: JSON.stringify({ path: branch.path, leaf: thread.activeLeafId, branch: thread.activeBranchId,
        navigation: thread.navigationRevision }),
    });
  } catch (error) { throw error instanceof BranchStoreError ? error : new BranchStoreError('unavailable'); }
}

/** Permit unrelated state and append-only activity while refusing changed binding or ancestry. */
export function assertBranchStoreState(current: BranchStoreState, captured: BranchStoreState): void {
  if (current.bound.layout.sessionDir !== captured.bound.layout.sessionDir
    || current.bound.directoryIdentity !== captured.bound.directoryIdentity
    || !sameValue(current.bound.scope, captured.bound.scope)
    || current.transcriptIdentity !== captured.transcriptIdentity || current.sourcePathIdentity !== captured.sourcePathIdentity
    || current.branchIdentity !== captured.branchIdentity) throw new BranchStoreError('conflict');
}
