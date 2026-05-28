import * as fs from "node:fs";
import * as path from "node:path";
import type { Session } from "../schema/sessionRecord.js";
import {
  createEmptyCurrentSessionSelectionStore,
  parseCurrentSessionSelectionStore,
  selectCurrentSession,
  type CurrentSessionSelectionRecord,
  type CurrentSessionSelectionResolution,
  type CurrentSessionSelectionStore,
} from "../currentSessionSelection.js";
import { normalizeProjectRootKey } from "../projectBindingPolicy.js";
import { projectCurrentSessionMetadata } from "../sessionMetadataProjection.js";

export interface SessionRegistryReadResult {
  readonly store: CurrentSessionSelectionStore;
  readonly readError: string | null;
}

export function readSessionRegistryStore(
  storePath: string,
): SessionRegistryReadResult {
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
  const storeDir = path.dirname(input.storePath);
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }
  fs.writeFileSync(
    input.storePath,
    JSON.stringify(input.store, null, 2),
    "utf8",
  );
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
  readonly projectRoot: string;
  readonly sessionExists: (sessionId: string) => boolean;
  readonly loadSession: (sessionId: string) => Session;
}): CurrentSessionSelectionResolution {
  const normalizedProjectRoot = normalizeProjectRootKey(input.projectRoot);
  const registry = readSessionRegistryStore(input.storePath);
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
  readonly projectRoot: string;
  readonly sessionId: string;
  readonly updatedAt: string;
}): void {
  const normalizedProjectRoot = normalizeProjectRootKey(input.projectRoot);
  const normalizedSessionId = input.sessionId.trim();
  if (!normalizedProjectRoot || !normalizedSessionId) {
    return;
  }

  const current = readSessionRegistryStore(input.storePath).store;
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
  readonly normalizedProjectRoot: string;
}): void {
  if (!input.normalizedProjectRoot) {
    return;
  }
  const current = readSessionRegistryStore(input.storePath).store;
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
  readonly projectRoot: string;
}): void {
  clearCurrentSessionSelection({
    storePath: input.storePath,
    normalizedProjectRoot: normalizeProjectRootKey(input.projectRoot),
  });
}
