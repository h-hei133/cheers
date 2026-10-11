import { createSessionStoreLayout, locateExistingSessionLayout, validateSessionId } from "../store/sessionFileLayout.js";
import { readStateSnapshotRequired, readStateSnapshotSafely } from "../store/sessionStateStore.js";
import { withFileLock, writeJsonFileAtomic } from "../store/sessionFileStore.js";
import { randomUUID } from 'node:crypto';
import { freezeDeep } from '../../core/values/freeze.js';
import { sameValue } from '../../config/values.js';
import { SessionModelWriteError, type ModelWriteState } from './outcome.js';

import { isThinkingPreference, type ThinkingPreference } from '../../core/models/effort.js';
import type { SessionModelPreset, SessionModelRole, SessionModelSelection } from "./contract.js";

export function decodeSessionModel(value: unknown): SessionModelSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (![candidate.connectionId, candidate.provider, candidate.model].every(item => typeof item === "string" && item.trim().length > 0)) return undefined;
  if (Object.hasOwn(candidate, 'thinkingEffort') && !isThinkingPreference(candidate.thinkingEffort)) return undefined;
  const serviceTier = candidate.serviceTier;
  if (serviceTier !== undefined && (typeof serviceTier !== 'string' || serviceTier.trim().length === 0 || serviceTier.length > 64)) return undefined;
  const presets = decodePresets(candidate.presets);
  if (candidate.presets !== undefined && !presets) return undefined;
  if (candidate.skillful !== undefined && typeof candidate.skillful !== 'boolean') return undefined;
  const contextWindow = candidate.contextWindow;
  if (contextWindow !== undefined && (!Number.isSafeInteger(contextWindow) || (contextWindow as number) < 1)) return undefined;
  return { ...(candidate.thinkingEffort !== undefined ? { thinkingEffort: candidate.thinkingEffort as ThinkingPreference } : {}), ...(serviceTier !== undefined ? { serviceTier: serviceTier.trim() } : {}), ...(presets ? { presets } : {}), ...(candidate.skillful !== undefined ? { skillful: candidate.skillful } : {}), ...(contextWindow !== undefined ? { contextWindow: contextWindow as number } : {}), connectionId: (candidate.connectionId as string).trim(), provider: (candidate.provider as string).trim(), model: (candidate.model as string).trim() };
}

function decodePresets(value: unknown): Readonly<Record<string, SessionModelPreset>> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (Object.keys(value).length > 32) return undefined;
  const result: Record<string, SessionModelPreset> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const roles = (raw as Record<string, unknown>).roles;
    if (!roles || typeof roles !== 'object' || Array.isArray(roles) || Object.keys(roles).length > 16) return undefined;
    const normalized: Record<string, SessionModelRole> = {};
    for (const [role, target] of Object.entries(roles)) {
      const item = target as Record<string, unknown>;
      if (!/^[a-zA-Z0-9._-]{1,64}$/.test(role) || ['__proto__', 'constructor', 'prototype'].includes(role) || !item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.connectionId !== 'string' || typeof item.provider !== 'string' || typeof item.model !== 'string'
        || !item.connectionId.trim() || !item.provider.trim() || !item.model.trim()
        || (item.thinkingEffort !== undefined && !isThinkingPreference(item.thinkingEffort))) return undefined;
      normalized[role] = { connectionId: item.connectionId.trim(), provider: item.provider.trim(), model: item.model.trim(), ...(item.thinkingEffort !== undefined ? { thinkingEffort: item.thinkingEffort as ThinkingPreference } : {}) };
    }
    if (Object.keys(normalized).length === 0) return undefined;
    result[name] = { roles: normalized };
  }
  return result;
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
class ModelReceipt {
  constructor(readonly before: SessionModelEdit, readonly after: SessionModelEdit, readonly changed: boolean) { freezeDeep(this); }
}
export type SessionModelReceipt = ModelReceipt;

export function writeSessionModel(sessionId: string, selection: SessionModelSelection, baseline: SessionModelEdit, beforeCommit?: () => boolean): SessionModelReceipt {
  const decoded = decodeSessionModel(selection);
  if (!decoded) throw new SessionModelWriteError('invalid', 'unchanged');
  return commitModel(sessionId, decoded, baseline, beforeCommit);
}

/** A no-op has no rollback authority. A restoration receives its own fresh revision. */
export function restoreSessionModel(receipt: SessionModelReceipt): 'restored' | 'unchanged' {
  if (!(receipt instanceof ModelReceipt)) throw new SessionModelWriteError('invalid', 'unchanged');
  if (!receipt.changed) return 'unchanged';
  commitModel(receipt.after.sessionId, receipt.before.selection, receipt.after);
  return 'restored';
}

function commitModel(sessionId: string, modelSelection: SessionModelSelection | undefined, baseline: SessionModelEdit, beforeCommit?: () => boolean): SessionModelReceipt {
  if (!(baseline instanceof ModelEdit) || baseline.sessionId !== sessionId) throw new SessionModelWriteError('invalid', 'unchanged');
  const layout = layoutFor(sessionId);
  if (layout.statePath !== baseline.statePath) throw new SessionModelWriteError('conflict', 'unchanged');
  let receipt = new ModelReceipt(baseline, baseline, false);
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
      const next = { ...current, modelRevision: randomUUID() };
      if (modelSelection === undefined) delete next.modelSelection;
      else next.modelSelection = modelSelection;
      if (!sameValue(requiredState(layout.statePath), current)) throw new SessionModelWriteError('conflict', 'unchanged');
      state = 'unknown'; code = 'write-failed';
      writeJsonFileAtomic(layout.statePath, next);
      code = 'verification-failed';
      if (!sameValue(requiredState(layout.statePath), next)) throw new SessionModelWriteError('verification-failed', 'unknown');
      receipt = new ModelReceipt(baseline, new ModelEdit(sessionId, layout.statePath, next.projectRoot, next.modelSelection, next.modelRevision), true);
      state = 'persisted'; code = 'lock-failed';
    }, { recovery: 'local-dead', onReleaseError: () => { cleanupFailed = true; } });
  } catch (error) {
    throw new SessionModelWriteError(error instanceof SessionModelWriteError ? error.code : code, state, cleanupFailed);
  }
  return receipt;
}
