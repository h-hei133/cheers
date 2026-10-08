import { lstatSync } from 'node:fs';
import path from 'node:path';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { freezeDeep } from '../../core/values/freeze.js';
import { sameValue } from '../../config/values.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';
import { projectSessionFileLayout, validateSessionId, type SessionFileLayout } from './sessionFileLayout.js';
import { readSessionFileVersion } from './version.js';
import { readSessionMetadataRecord } from './sessionStore.js';
import { readStateSnapshotRequired } from './sessionStateStore.js';
import { withFileLock, writeJsonFileAtomic } from './sessionFileStore.js';

export interface BoundSessionHost { readonly getSessionDirPath: (sessionId: string) => string }
export interface BoundSessionScope {
  readonly sessionId: string;
  readonly sessionCreatedAt: string;
  readonly workspace: { readonly path: string; readonly identity: string };
}
export class SessionPublicationError extends Error {
  constructor(readonly code: 'invalid' | 'conflict' | 'unavailable' | 'write-failed' | 'verification-failed' | 'lock-failed',
    readonly state: 'unchanged' | 'unknown' | 'persisted' = 'unchanged') {
    super(`Session publication ${code}; persistence ${state}.`); this.name = 'SessionPublicationError';
  }
}
class BoundState {
  constructor(readonly layout: SessionFileLayout, readonly directoryIdentity: string, readonly scope: BoundSessionScope,
    readonly state: SessionStateSnapshot) { freezeDeep(this); }
}
export type BoundSessionState = BoundState;

export function readBoundSessionState(host: BoundSessionHost, session: Session): BoundSessionState {
  try {
    const layout = layoutFor(host, session.id); const version = readSessionFileVersion(layout);
    const current = readCurrent(layout, session);
    if (readSessionFileVersion(layout) !== version) throw new SessionPublicationError('conflict');
    return new BoundState(layout, directoryIdentity(layout), current.scope, current.state);
  } catch (error) { throw error instanceof SessionPublicationError ? error : new SessionPublicationError('unavailable'); }
}

/** Publish one owner's payload under the existing session lock; retain newer unrelated state. */
export function publishBoundSessionState(host: BoundSessionHost, session: Session, baseline: BoundSessionState,
  matches: (current: SessionStateSnapshot, previous: SessionStateSnapshot) => boolean,
  update: (current: SessionStateSnapshot, scope: BoundSessionScope) => SessionStateSnapshot): BoundSessionState {
  if (!(baseline instanceof BoundState)) throw new SessionPublicationError('invalid');
  let outcome: SessionPublicationError['state'] = 'unchanged';
  const stage: { failure: SessionPublicationError['code'] | 'update' } = { failure: 'lock-failed' }; let confirmed = baseline;
  try {
    const layout = layoutFor(host, session.id);
    if (layout.sessionDir !== baseline.layout.sessionDir) throw new SessionPublicationError('conflict');
    withFileLock(layout.stateLockPath, () => {
      stage.failure = 'unavailable'; const current = readCurrent(layout, session);
      if (directoryIdentity(layout) !== baseline.directoryIdentity || !sameValue(current.scope, baseline.scope)
        || !matches(current.state, baseline.state)) throw new SessionPublicationError('conflict');
      stage.failure = 'update'; const next = JSON.parse(JSON.stringify(update(current.state, current.scope))) as SessionStateSnapshot;
      if (sameValue(next, current.state)) { confirmed = new BoundState(layout, baseline.directoryIdentity, current.scope, current.state); return; }
      stage.failure = 'unavailable'; const beforeWrite = readSessionFileVersion(layout); const latest = readCurrent(layout, session);
      if (readSessionFileVersion(layout) !== beforeWrite || !sameValue(latest.state, current.state)
        || !sameValue(latest.scope, current.scope) || directoryIdentity(layout) !== baseline.directoryIdentity
        || layoutFor(host, session.id).sessionDir !== layout.sessionDir) throw new SessionPublicationError('conflict');
      outcome = 'unknown'; stage.failure = 'write-failed'; writeJsonFileAtomic(layout.statePath, next);
      stage.failure = 'verification-failed'; const persisted = readCurrent(layout, session);
      if (!sameValue(persisted.state, next) || !sameValue(persisted.scope, current.scope)
        || directoryIdentity(layout) !== baseline.directoryIdentity) throw new SessionPublicationError('verification-failed', 'unknown');
      confirmed = new BoundState(layout, baseline.directoryIdentity, persisted.scope, persisted.state);
      outcome = 'persisted'; stage.failure = 'lock-failed';
    }, { createParent: false, recovery: 'local-dead' });
    return confirmed;
  } catch (error) {
    if (outcome === 'unchanged' && stage.failure === 'update') throw error;
    throw new SessionPublicationError(error instanceof SessionPublicationError ? error.code : stage.failure === 'update' ? 'invalid' : stage.failure, outcome);
  }
}

function layoutFor(host: BoundSessionHost, sessionId: string): SessionFileLayout {
  if (validateSessionId(sessionId) !== sessionId || sessionId === '.' || sessionId === '..') throw new SessionPublicationError('invalid');
  const directory = host.getSessionDirPath(sessionId);
  const layout = projectSessionFileLayout({ sessionsDir: path.dirname(directory), sessionId });
  if (layout.sessionDir !== directory) throw new SessionPublicationError('invalid'); return layout;
}
function readCurrent(layout: SessionFileLayout, expected: Session) {
  const metadata = readSessionMetadataRecord(layout.metadataPath); const state = readStateSnapshotRequired(layout.statePath);
  if (!metadata || metadata.id !== expected.id || metadata.createdAt !== expected.createdAt || !state || typeof state !== 'object'
    || Array.isArray(state) || !['active', 'interrupted', 'completed', 'error', 'terminated'].includes(state.status)
    || typeof metadata.projectRoot !== 'string' || typeof state.projectRoot !== 'string') throw new SessionPublicationError('unavailable');
  const workspace = captureWorkspaceRoot(metadata.projectRoot, metadata.projectRoot, 'read');
  const supplied = captureWorkspaceRoot(expected.projectRoot, expected.projectRoot, 'read');
  const saved = captureWorkspaceRoot(state.projectRoot, state.projectRoot, 'read');
  if (workspace.path !== supplied.path || workspace.identity !== supplied.identity || workspace.path !== saved.path
    || workspace.identity !== saved.identity) throw new SessionPublicationError('conflict');
  const scope: BoundSessionScope = { sessionId: metadata.id, sessionCreatedAt: metadata.createdAt,
    workspace: { path: workspace.path, identity: workspace.identity } };
  return { scope, state };
}
function directoryIdentity(layout: SessionFileLayout): string {
  const stat = lstatSync(layout.sessionDir, { bigint: true });
  if (!stat.isDirectory()) throw new SessionPublicationError('unavailable'); return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}
