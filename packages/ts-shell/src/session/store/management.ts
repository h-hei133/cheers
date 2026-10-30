import { normalizePathIdentity } from '../continuation/roots.js';
import type { SessionMetadata } from '../schema/sessionMetadataCodec.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';
import type { SessionFileLayout } from './sessionFileLayout.js';
import { readSessionMetadataRecord } from './sessionStore.js';
import { readStateSnapshotRequired } from './sessionStateStore.js';
import { readSessionFileVersion } from './version.js';

/** A management target carries identity and metadata, never conversation content. */
export type SessionManagementTarget = Pick<SessionMetadata, 'id' | 'createdAt' | 'projectRoot' | 'title' | 'pinned'>;

export interface SessionManagementSnapshot {
  readonly session: SessionManagementTarget;
  readonly metadata: SessionMetadata;
  readonly state: SessionStateSnapshot;
  readonly version: string;
}

/** Keep all three source identities while reading only the management payload. */
export function readSessionManagementSnapshot(layout: SessionFileLayout, id: string): SessionManagementSnapshot {
  const version = readSessionFileVersion(layout);
  const metadata = readSessionMetadataRecord(layout.metadataPath);
  const state = readStateSnapshotRequired(layout.statePath);
  if (!metadata || metadata.id !== id || typeof metadata.createdAt !== 'string' || !Number.isFinite(Date.parse(metadata.createdAt))
    || typeof metadata.updatedAt !== 'string' || !Number.isFinite(Date.parse(metadata.updatedAt))
    || (metadata.title !== undefined && typeof metadata.title !== 'string')
    || (metadata.projectRoot !== undefined && typeof metadata.projectRoot !== 'string')
    || !state || typeof state !== 'object' || Array.isArray(state)
    || !['active', 'interrupted', 'completed', 'error', 'terminated'].includes(state.status)
    || (state.projectRoot !== undefined && typeof state.projectRoot !== 'string')) {
    throw new Error('The saved session management state is invalid.');
  }
  const metadataRoot = typeof metadata.projectRoot === 'string' ? normalizePathIdentity(metadata.projectRoot) : undefined;
  const stateRoot = typeof state.projectRoot === 'string' ? normalizePathIdentity(state.projectRoot) : undefined;
  const projectRoot = metadataRoot ?? stateRoot;
  if (!projectRoot || metadataRoot && stateRoot && metadataRoot !== stateRoot) {
    throw new Error('The saved session project identity is unavailable or inconsistent.');
  }
  if (readSessionFileVersion(layout) !== version) throw new Error('The saved session changed while reading management state.');
  return { metadata, state, version, session: { id, createdAt: metadata.createdAt, projectRoot,
    ...(metadata.title === undefined ? {} : { title: metadata.title }), ...(metadata.pinned === true ? { pinned: true } : {}) } };
}
