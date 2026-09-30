import * as fs from "node:fs";
import { writeJsonFileAtomic } from "./sessionFileStore.js";
import type { Session } from "../schema/sessionRecord.js";
import {
  createEmptyCurrentSessionSelectionStore,
  parseCurrentSessionSelectionStore,
  selectCurrentSession,
  type CurrentSessionSelectionRecord,
  type CurrentSessionSelectionResolution,
  type CurrentSessionSelectionStore,
} from "./currentSelection.js";
import { normalizeProjectRootKey } from "./projectBindingPolicy.js";
import { projectCurrentSessionMetadata } from "../sessionMetadataProjection.js";

export interface SessionRegistryReadResult {
  readonly store: CurrentSessionSelectionStore;
  readonly readError: string | null;
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
): SessionRegistryReadResult {
  const merged = createEmptyCurrentSessionSelectionStore();
  let readError: string | null = null;

  for (const storePath of storePaths) {
    const result = readSessionRegistryStoreAt(storePath);
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

  return { store: merged, readError };
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
}): CurrentSessionSelectionStore {
  return {
    schemaVersion: 1,
    byProjectRoot: {
      ...input.current.byProjectRoot,
      [input.normalizedProjectRoot]: projectCurrentSessionMetadata({
        sessionId: input.sessionId,
        updatedAt: input.updatedAt,
      }),
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
    schemaVersion: 1,
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
}): CurrentSessionSelectionResolution {
  const normalizedProjectRoot = normalizeProjectRootKey(input.projectRoot);
  const registry = readMergedSessionRegistryStore(input.storeSearchPaths ?? [input.storePath]);
  const selection = registry.store.byProjectRoot[normalizedProjectRoot];
  if (!selection?.sessionId?.trim()) {
    return projectCurrentSessionRegistryResolution({
      projectRoot: input.projectRoot,
      normalizedProjectRoot,
      storeReadError: registry.readError,
      selection,
    }).resolution;
  }

  if (!input.sessionExists(selection.sessionId)) {
    const missingProjection = projectCurrentSessionRegistryResolution({
      projectRoot: input.projectRoot,
      normalizedProjectRoot,
      storeReadError: registry.readError,
      selection,
      sessionExists: false,
    });
    clearCurrentSessionSelection({
      storePath: input.storePath,
      normalizedProjectRoot,
    });
    return missingProjection.resolution;
  }

  try {
    const session = input.loadSession(selection.sessionId);
    const sessionProjectRoot = session.projectRoot || normalizedProjectRoot;
    const selectedProjection = projectCurrentSessionRegistryResolution({
      projectRoot: input.projectRoot,
      normalizedProjectRoot,
      storeReadError: registry.readError,
      selection,
      sessionExists: true,
      session,
      sessionProjectRoot,
      normalizedSessionProjectRoot: normalizeProjectRootKey(sessionProjectRoot),
    });
    if (!selectedProjection.resolution.ok) {
      clearCurrentSessionSelection({
        storePath: input.storePath,
        normalizedProjectRoot,
      });
    }
    return selectedProjection.resolution;
  } catch (error) {
    const failedProjection = projectCurrentSessionRegistryResolution({
      projectRoot: input.projectRoot,
      normalizedProjectRoot,
      storeReadError: registry.readError,
      selection,
      sessionExists: true,
      loadError: error,
    });
    clearCurrentSessionSelection({
      storePath: input.storePath,
      normalizedProjectRoot,
    });
    return failedProjection.resolution;
  }
}

export function setCurrentSessionSelection(input: {
  readonly storePath: string;
  /** Every store that may already exist, current first. Defaults to `storePath`. */
  readonly storeSearchPaths?: readonly string[];
  readonly projectRoot: string;
  readonly sessionId: string;
  readonly updatedAt: string;
}): void {
  const normalizedProjectRoot = normalizeProjectRootKey(input.projectRoot);
  const normalizedSessionId = input.sessionId.trim();
  if (!normalizedProjectRoot || !normalizedSessionId) {
    return;
  }

  const current = readMergedSessionRegistryStore(input.storeSearchPaths ?? [input.storePath]).store;
  writeSessionRegistryStore({
    storePath: input.storePath,
    store: projectCurrentSessionSelectionStore({
      current,
      normalizedProjectRoot,
      sessionId: normalizedSessionId,
      updatedAt: input.updatedAt,
    }),
  });
}

export function clearCurrentSessionSelection(input: {
  readonly storePath: string;
  readonly storeSearchPaths?: readonly string[];
  readonly normalizedProjectRoot: string;
}): void {
  if (!input.normalizedProjectRoot) {
    return;
  }
  const current = readMergedSessionRegistryStore(input.storeSearchPaths ?? [input.storePath]).store;
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
    normalizedProjectRoot: normalizeProjectRootKey(input.projectRoot),
  });
}
