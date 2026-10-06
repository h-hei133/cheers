import { createSessionStoreLayout, locateExistingSessionLayout, validateSessionId } from "../store/sessionFileLayout.js";
import { readStateSnapshotRequired, readStateSnapshotSafely } from "../store/sessionStateStore.js";
import { withFileLock, writeJsonFileAtomic } from "../store/sessionFileStore.js";
import { randomUUID } from 'node:crypto';
import { freezeDeep } from '../../core/values/freeze.js';
import { sameValue } from '../../config/values.js';
import { SessionModelWriteError, type ModelWriteState } from './outcome.js';

import type { SessionModelSelection } from "./contract.js";

export function decodeSessionModel(value: unknown): SessionModelSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (![candidate.connectionId, candidate.provider, candidate.model].every(item => typeof item === "string" && item.trim().length > 0)) return undefined;
  return { connectionId: (candidate.connectionId as string).trim(), provider: (candidate.provider as string).trim(), model: (candidate.model as string).trim() };
}

function layoutFor(sessionId: string) {
  const id = validateSessionId(sessionId);
  if (id === "." || id === "..") throw new Error("Invalid session id.");
  return locateExistingSessionLayout(createSessionStoreLayout(), id);
}

export function readSessionModel(sessionId?: string): SessionModelSelection | undefined {
  if (!sessionId) return undefined;
  return decodeSessionModel(readStateSnapshotSafely(layoutFor(sessionId).statePath)?.modelSelection);
}

class ModelEdit {
  constructor(readonly sessionId: string, readonly statePath: string, readonly projectRoot: string | undefined,
    readonly selection: SessionModelSelection | undefined, readonly revision: string | undefined) { freezeDeep(this); }
}
export type SessionModelEdit = ModelEdit;

function requiredState(statePath: string) {
  const state = readStateSnapshotRequired(statePath);
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || !['active', 'interrupted', 'completed', 'error', 'terminated'].includes(state.status)
    || (state.projectRoot !== undefined && typeof state.projectRoot !== 'string')
    || (state.modelRevision !== undefined && typeof state.modelRevision !== 'string')
    || (state.modelSelection !== undefined && !decodeSessionModel(state.modelSelection))) {
    throw new SessionModelWriteError('invalid', 'unchanged');
  }
  return state;
}

/** Capture before asynchronous selection work, including its workspace binding. */
export function readSessionModelEdit(sessionId: string): SessionModelEdit {
  try {
    const layout = layoutFor(sessionId);
    const state = requiredState(layout.statePath);
    return new ModelEdit(sessionId, layout.statePath, state.projectRoot, state.modelSelection, state.modelRevision);
  } catch (error) {
    if (error instanceof SessionModelWriteError) throw error;
    throw new SessionModelWriteError('read-failed', 'unchanged');
  }
}

/** Merge only the selection under the existing lock, then verify the whole snapshot. */
export function writeSessionModel(sessionId: string, selection: SessionModelSelection, baseline: SessionModelEdit, beforeCommit?: () => boolean): void {
  const modelSelection = decodeSessionModel(selection);
  if (!modelSelection || !(baseline instanceof ModelEdit) || baseline.sessionId !== sessionId) throw new SessionModelWriteError('invalid', 'unchanged');
  const layout = layoutFor(sessionId);
  if (layout.statePath !== baseline.statePath) throw new SessionModelWriteError('conflict', 'unchanged');
  let state: ModelWriteState = 'unchanged';
  let code: 'read-failed' | 'lock-failed' | 'write-failed' | 'verification-failed' = 'lock-failed';
  let cleanupFailed = false;
  try {
    withFileLock(layout.stateLockPath, () => {
      code = 'read-failed';
      const current = requiredState(layout.statePath);
      if (current.projectRoot !== baseline.projectRoot || current.modelRevision !== baseline.revision
        || !sameValue(current.modelSelection, baseline.selection)) throw new SessionModelWriteError('conflict', 'unchanged');
      if (beforeCommit && !beforeCommit()) throw new SessionModelWriteError('conflict', 'unchanged');
      if (sameValue(current.modelSelection, modelSelection)) { code = 'lock-failed'; return; }
      const next = { ...current, modelSelection, modelRevision: randomUUID() };
      if (!sameValue(requiredState(layout.statePath), current)) throw new SessionModelWriteError('conflict', 'unchanged');
      state = 'unknown'; code = 'write-failed';
      writeJsonFileAtomic(layout.statePath, next);
      code = 'verification-failed';
      if (!sameValue(requiredState(layout.statePath), next)) throw new SessionModelWriteError('verification-failed', 'unknown');
      state = 'persisted'; code = 'lock-failed';
    }, { recovery: 'local-dead', onReleaseError: () => { cleanupFailed = true; } });
  } catch (error) {
    throw new SessionModelWriteError(error instanceof SessionModelWriteError ? error.code : code, state, cleanupFailed);
  }
}
