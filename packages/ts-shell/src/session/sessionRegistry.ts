import * as fs from "node:fs";
import * as path from "node:path";
import type { Session } from "./SessionManager.js";
import {
  createEmptyCurrentSessionSelectionStore,
  parseCurrentSessionSelectionStore,
  selectCurrentSession,
  type CurrentSessionSelectionRecord,
  type CurrentSessionSelectionResolution,
  type CurrentSessionSelectionStore,
} from "./currentSessionSelection.js";
import { projectCurrentSessionMetadata } from "./sessionMetadataProjection.js";

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
