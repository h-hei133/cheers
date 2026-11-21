import * as fs from "node:fs";
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { withFileLock, writeJsonFileAtomic, writeTextFileAtomic } from "./sessionFileStore.js";
import type { Session } from "../schema/sessionRecord.js";
import {
  createEmptyCurrentSessionSelectionStore,
  parseCurrentSessionSelectionStore,
  selectCurrentSession,
  type CurrentSessionSelectionRecord,
  type CurrentSessionSelectionResolution,
  type CurrentSessionSelectionStore,
} from "./currentSelection.js";
import { normalizePathIdentity } from '../continuation/roots.js';
import { projectCurrentSessionMetadata } from "../sessionMetadataProjection.js";
import { captureActivationGuard, assertActivationGuard, sameSessionActivation, type SessionActivationOptions } from './activation.js';
import { hashContent, pathIdentity } from '../../core/workspace/files.js';
import { syncStoreDirectory } from './directory.js';
import { encodePromptIntent, PromptPublicationError, type ActivationIntent } from './prompt/intent.js';

export interface SessionRegistryReadResult {
  readonly store: CurrentSessionSelectionStore;
  readonly readError: string | null;
}

interface MergedSessionRegistryReadResult extends SessionRegistryReadResult {
  readonly primaryReadError: string | null;
}

export function readSessionRegistryStore(
  storePath: string,
): SessionRegistryReadResult {
  return readSessionRegistryStoreAt(storePath);
}

/**
 * The registry store, merged from every path that holds one, current first.
 *
 * A project's selection recorded before the directory was renamed still names a
 * real session, so an older store is read rather than ignored. A project present
 * in more than one is decided by the newest one: the paths are searched in order
 * and the first entry for a project root wins, which is the same rule the user
 * data directory itself uses. Writes are unaffected and go to one path.
 */
export function readMergedSessionRegistryStore(
  storePaths: readonly string[],
): MergedSessionRegistryReadResult {
  const merged = createEmptyCurrentSessionSelectionStore();
  let readError: string | null = null;

  let resumeStoreId: CurrentSessionSelectionStore['resumeStoreId'];
  let resumeReceipts: CurrentSessionSelectionStore['resumeReceipts'];
  for (const [index, storePath] of storePaths.entries()) {
    const result = readSessionRegistryStoreAt(storePath);
    if (index === 0) {
      if (result.readError) return { ...result, primaryReadError: result.readError };
      resumeStoreId = result.store.resumeStoreId;
      resumeReceipts = result.store.resumeReceipts;
    }
    if (result.readError && !readError) {
      readError = result.readError;
    }
    for (const [projectRoot, selection] of Object.entries(result.store.byProjectRoot)) {
      if (merged.byProjectRoot[projectRoot]) {
        continue;
      }
      merged.byProjectRoot[projectRoot] = selection;
    }
  }

  return {
    store: resumeStoreId === undefined ? merged : { ...merged, resumeStoreId, ...(resumeReceipts && { resumeReceipts }) },
    readError,
    primaryReadError: null,
  };
}

/** Read one project's activation without loading a session or repairing its selection. */
export function readCurrentSessionSelection(input: {
  readonly storePaths: readonly string[];
  readonly projectRoot: string;
}): CurrentSessionSelectionRecord | undefined {
  const root = normalizePathIdentity(input.projectRoot);
  if (!root) throw new Error('Current session activation is unavailable.');
  for (const storePath of input.storePaths) {
    const registry = readSessionRegistryStoreAt(storePath);
    // A corrupt newer source could contain the project's authoritative record;
    // never fall through it. Once a valid record is found, older sources are
    // shadowed for this project and cannot invalidate that activation.
    if (registry.readError) throw new Error('Current session activation is unavailable.');
    const selected = Object.prototype.hasOwnProperty.call(registry.store.byProjectRoot, root)
      ? registry.store.byProjectRoot[root] : registry.store.byProjectRoot[root.toLowerCase()];
    if (selected === undefined) continue;
    if (!selected || typeof selected.sessionId !== 'string' || !selected.sessionId.trim()
      || typeof selected.updatedAt !== 'string'
      || (selected.activationId !== undefined && (typeof selected.activationId !== 'string' || !selected.activationId.trim()))) {
      throw new Error('Current session activation is unavailable.');
    }
    return Object.freeze({ sessionId: selected.sessionId, updatedAt: selected.updatedAt,
      ...(selected.activationId === undefined ? {} : { activationId: selected.activationId }) });
  }
  return undefined;
}

function readSessionRegistryStoreAt(storePath: string): SessionRegistryReadResult {
  if (!fs.existsSync(storePath)) {
    return {
      store: createEmptyCurrentSessionSelectionStore(),
      readError: null,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8")) as Partial<
      CurrentSessionSelectionStore
    >;
    return parseCurrentSessionSelectionStore(parsed, storePath);
  } catch (error) {
    return {
      store: createEmptyCurrentSessionSelectionStore(),
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function writeSessionRegistryStore(input: {
  readonly storePath: string;
  readonly store: CurrentSessionSelectionStore;
}): void {
  writeJsonFileAtomic(input.storePath, input.store);
}

export function projectCurrentSessionSelectionStore(input: {
  readonly current: CurrentSessionSelectionStore;
  readonly normalizedProjectRoot: string;
  readonly sessionId: string;
  readonly updatedAt: string;
  readonly activationId?: string;
}): CurrentSessionSelectionStore {
  return {
    ...input.current,
    byProjectRoot: {
      ...input.current.byProjectRoot,
      [input.normalizedProjectRoot]: {
        ...projectCurrentSessionMetadata({
          sessionId: input.sessionId,
          updatedAt: input.updatedAt,
        }),
        ...(input.activationId === undefined ? {} : { activationId: input.activationId }),
      },
    },
  };
}

export function removeCurrentSessionSelectionFromStore(input: {
  readonly current: CurrentSessionSelectionStore;
  readonly normalizedProjectRoot: string;
}): CurrentSessionSelectionStore | undefined {
  if (!input.current.byProjectRoot[input.normalizedProjectRoot]) {
    return undefined;
  }
  const nextByProjectRoot = { ...input.current.byProjectRoot };
  delete nextByProjectRoot[input.normalizedProjectRoot];
  return {
    ...input.current,
    byProjectRoot: nextByProjectRoot,
  };
}

export function projectCurrentSessionRegistryResolution(input: {
  readonly projectRoot: string;
  readonly normalizedProjectRoot: string;
  readonly storeReadError: string | null;
  readonly selection?: CurrentSessionSelectionRecord;
  readonly sessionExists?: boolean;
  readonly session?: Session;
  readonly sessionProjectRoot?: string;
  readonly normalizedSessionProjectRoot?: string;
  readonly loadError?: unknown;
}): {
  readonly resolution: CurrentSessionSelectionResolution;
  readonly clearSelection: boolean;
} {
  return selectCurrentSession(input);
}

export function resolveCurrentSessionForProject(input: {
  readonly storePath: string;
  /** Every store that may already exist, current first. Defaults to `storePath`. */
  readonly storeSearchPaths?: readonly string[];
  readonly projectRoot: string;
  readonly sessionExists: (sessionId: string) => boolean;
  readonly loadSession: (sessionId: string) => Session;
  /** Fault verification observes the selection without repairing it. */
  readonly readOnly?: boolean;
}): CurrentSessionSelectionResolution {
  const normalizedProjectRoot = normalizePathIdentity(input.projectRoot) ?? '';
  const paths = input.storeSearchPaths ?? [input.storePath];
  const registry = readMergedSessionRegistryStore(paths);
  // Older stores folded case on every platform. A legacy entry is only usable
  // after its actual session binding passes the host's path identity check.
  const selection = registry.store.byProjectRoot[normalizedProjectRoot] ?? registry.store.byProjectRoot[normalizedProjectRoot.toLowerCase()];
  if (!selection?.sessionId?.trim()) {
    return projectCurrentSessionRegistryResolution({
      projectRoot: input.projectRoot,
      normalizedProjectRoot,
      storeReadError: registry.readError,
      selection,
    }).resolution;
  }

  const finish = (projection: ReturnType<typeof selectCurrentSession>): CurrentSessionSelectionResolution => {
    const current = readMergedSessionRegistryStore(paths);
    const latest = current.store.byProjectRoot[normalizedProjectRoot]
      ?? current.store.byProjectRoot[normalizedProjectRoot.toLowerCase()];
    const unchanged = current.readError === registry.readError && sameSessionActivation(latest, selection);
    if (!unchanged || (projection.clearSelection && !input.readOnly && !registry.readError && !clearCurrentSessionSelection({
      storePath: input.storePath, storeSearchPaths: paths, normalizedProjectRoot, expected: selection,
    }))) {
      return { ok: false, reason: 'activation-changed', detail: 'The current session activation changed while loading.' };
    }
    return { ...projection.resolution, activation: selection };
  };

  if (!input.sessionExists(selection.sessionId)) {
    return finish(projectCurrentSessionRegistryResolution({
      projectRoot: input.projectRoot,
      normalizedProjectRoot,
      storeReadError: registry.readError,
      selection,
      sessionExists: false,
    }));
  }

  let projection: ReturnType<typeof selectCurrentSession>;
  try {
    const session = input.loadSession(selection.sessionId);
    const sessionProjectRoot = session.projectRoot || normalizedProjectRoot;
    projection = projectCurrentSessionRegistryResolution({
      projectRoot: input.projectRoot,
      normalizedProjectRoot,
      storeReadError: registry.readError,
      selection,
      sessionExists: true,
      session,
      sessionProjectRoot,
      normalizedSessionProjectRoot: normalizePathIdentity(sessionProjectRoot),
    });
  } catch (error) {
    projection = projectCurrentSessionRegistryResolution({
      projectRoot: input.projectRoot,
      normalizedProjectRoot,
      storeReadError: registry.readError,
      selection,
      sessionExists: true,
      loadError: error,
    });
  }
  return finish(projection);
}

export function setCurrentSessionSelection(input: {
  readonly storePath: string;
  /** Every store that may already exist, current first. Defaults to `storePath`. */
  readonly storeSearchPaths?: readonly string[];
  readonly projectRoot: string;
  readonly sessionId: string;
  readonly updatedAt: string;
} & SessionActivationOptions): void {
  input = { ...input };
  const normalizedProjectRoot = normalizePathIdentity(input.projectRoot) ?? '';
  const normalizedSessionId = input.sessionId.trim();
  if (!normalizedProjectRoot || !normalizedSessionId) {
    if (input.guard) throw new Error('Current session activation target is unavailable.');
    return;
  }
  const guard = captureActivationGuard(input.guard);
  const candidate = Object.freeze({ sessionId: normalizedSessionId, updatedAt: input.updatedAt, activationId: randomUUID() });
  input.captureSelection?.(candidate);

  // Whole-registry writers must reread after acquisition so an unrelated
  // project's stale snapshot cannot resurrect a superseded activation.
  withFileLock(`${input.storePath}.lock`, () => {
    const read = () => readMergedSessionRegistryStore(input.storeSearchPaths ?? [input.storePath]);
    assertActivationGuard(guard, read, normalizedProjectRoot);
    const registry = read();
    if (registry.primaryReadError || ((input.publishMetadata || input.prepareMetadata) && registry.readError)) {
      throw new Error('Current session activation is unavailable.');
    }
    const current = registry.store;
    const store = projectCurrentSessionSelectionStore({
      current,
      normalizedProjectRoot,
      sessionId: normalizedSessionId,
      updatedAt: input.updatedAt,
      activationId: candidate.activationId,
    });
    if (input.prepareMetadata) {
      const parent = dirname(input.storePath), identity = pathIdentity(parent);
      const registryId = current.resumeStoreId ?? randomUUID();
      if (!current.resumeStoreId || Object.hasOwn(current.resumeReceipts ?? {}, candidate.sessionId)) {
        // This session's writer holds its lock and has already ruled out a live intent.
        const initialized = { ...withoutResumeReceipt(current, candidate.sessionId), resumeStoreId: registryId };
        writeSessionRegistryStore({ storePath: input.storePath, store: initialized });
        syncStoreDirectory(parent, identity);
      }
      const prepared = input.prepareMetadata({ activationId: candidate.activationId, registryId });
      const committed = { ...store, resumeStoreId: registryId,
        resumeReceipts: { ...store.resumeReceipts, [candidate.sessionId]: prepared.receipt } };
      writeTextFileAtomic(input.storePath, JSON.stringify(committed, null, 2), undefined, {
        createParent: false,
        beforeRename: () => {
          const check = () => assertActivationGuard(guard, read, normalizedProjectRoot);
          if (prepared.checkWorkspaceAdmission) prepared.checkWorkspaceAdmission(check);
          else check();
          if (pathIdentity(parent) !== identity) throw new Error('Current session registry directory changed.');
          const primary = readSessionRegistryStoreAt(input.storePath);
          if (primary.readError || primary.store.resumeStoreId !== registryId) throw new PromptPublicationError('unknown', 'record');
          prepared.assertCurrent();
        },
      });
      syncStoreDirectory(parent, identity);
      prepared.finish();
      writeSessionRegistryStore({ storePath: input.storePath, store: withoutResumeReceipt(committed, candidate.sessionId) });
      syncStoreDirectory(parent, identity);
    } else if (guard || input.publishMetadata) {
      const parent = dirname(input.storePath), identity = pathIdentity(parent);
      let publishMetadata = input.publishMetadata;
      writeTextFileAtomic(input.storePath, JSON.stringify(store, null, 2), undefined, {
        beforeRename: () => {
          if (pathIdentity(parent) !== identity) throw new Error('Current session registry directory changed.');
          assertActivationGuard(guard, read, normalizedProjectRoot);
          publishMetadata?.();
          publishMetadata = undefined;
        },
      });
      syncStoreDirectory(parent, identity);
    } else writeSessionRegistryStore({ storePath: input.storePath, store });
  }, { recovery: 'local-dead', onReleaseError: input.onReleaseError });
}

/** The exact receipt and the selection become durable in the same atomic registry replacement. */
export function isResumeCommitted(store: CurrentSessionSelectionStore, intent: ActivationIntent): boolean {
  if (store.resumeStoreId !== intent.registryId) throw new PromptPublicationError('unknown', 'record');
  const receipt = Object.hasOwn(store.resumeReceipts ?? {}, intent.sessionId) ? store.resumeReceipts![intent.sessionId] : undefined;
  if (receipt === hashContent(encodePromptIntent(intent))) return true;
  if (receipt !== undefined || Object.values(store.byProjectRoot).some(selection => selection?.activationId === intent.activationId)) {
    throw new PromptPublicationError('unknown', 'record');
  }
  return false;
}

export function settleResumeReceipt(storePath: string, intent: ActivationIntent, settle: (committed: boolean) => void): void {
  withFileLock(`${storePath}.lock`, () => {
    const current = readSessionRegistryStoreAt(storePath);
    if (current.readError) throw new PromptPublicationError('unknown', 'record');
    const committed = isResumeCommitted(current.store, intent);
    const directory = dirname(storePath), identity = pathIdentity(directory);
    syncStoreDirectory(directory, identity);
    settle(committed);
    if (committed) {
      writeSessionRegistryStore({ storePath, store: withoutResumeReceipt(current.store, intent.sessionId) });
      syncStoreDirectory(directory, identity);
    }
  }, { recovery: 'local-dead' });
}

function withoutResumeReceipt(store: CurrentSessionSelectionStore, sessionId: string): CurrentSessionSelectionStore {
  const { resumeReceipts, ...rest } = store;
  const pending = { ...resumeReceipts };
  delete pending[sessionId];
  return Object.keys(pending).length ? { ...rest, resumeReceipts: pending } : rest;
}

export function clearCurrentSessionSelection(input: {
  readonly storePath: string;
  readonly storeSearchPaths?: readonly string[];
  readonly normalizedProjectRoot: string;
  /** Automatic cleanup compares the invalid activation it actually inspected. */
  readonly expected?: CurrentSessionSelectionRecord;
}): boolean {
  if (!input.normalizedProjectRoot) {
    return false;
  }
  return withFileLock(`${input.storePath}.lock`, () => {
    const registry = readMergedSessionRegistryStore(input.storeSearchPaths ?? [input.storePath]);
    if (registry.primaryReadError) {
      if (input.expected) return false;
      throw new Error('Current session activation is unavailable.');
    }
    const current = registry.store;
    const selected = current.byProjectRoot[input.normalizedProjectRoot]
      ?? current.byProjectRoot[input.normalizedProjectRoot.toLowerCase()];
    if (input.expected && (registry.readError || !sameSessionActivation(selected, input.expected))) return false;
    const next = removeCurrentSessionSelectionFromStore({
      current,
      normalizedProjectRoot: input.normalizedProjectRoot,
    });
    if (next) {
      writeSessionRegistryStore({
        storePath: input.storePath,
        store: next,
      });
    }
    return true;
  }, { recovery: 'local-dead' });
}

export function clearCurrentSessionSelectionForProject(input: {
  readonly storePath: string;
  /** Every store that may already exist, current first. Defaults to `storePath`. */
  readonly storeSearchPaths?: readonly string[];
  readonly projectRoot: string;
}): void {
  clearCurrentSessionSelection({
    storePath: input.storePath,
    storeSearchPaths: input.storeSearchPaths,
    normalizedProjectRoot: normalizePathIdentity(input.projectRoot) ?? '',
  });
}
