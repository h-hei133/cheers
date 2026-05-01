import type { Session } from "./SessionManager.js";

export interface CurrentSessionSelectionRecord {
  readonly sessionId: string;
  readonly updatedAt: string;
}

export interface CurrentSessionSelectionStore {
  readonly schemaVersion: 1;
  readonly byProjectRoot: Record<string, CurrentSessionSelectionRecord>;
}

export type CurrentSessionSelectionResolution =
  | { readonly ok: true; readonly session: Session }
  | {
      readonly ok: false;
      readonly reason:
        | "none"
        | "store-invalid"
        | "missing-session"
        | "load-failed"
        | "project-root-mismatch";
      readonly sessionId?: string;
      readonly detail: string;
    };

export interface CurrentSessionStoreParseResult {
  readonly store: CurrentSessionSelectionStore;
  readonly readError: string | null;
}

export function createEmptyCurrentSessionSelectionStore(): CurrentSessionSelectionStore {
  return {
    schemaVersion: 1,
    byProjectRoot: {},
  };
}

export function parseCurrentSessionSelectionStore(
  parsed: Partial<CurrentSessionSelectionStore>,
  storePath: string,
): CurrentSessionStoreParseResult {
  if (
    parsed.schemaVersion !== 1 ||
    !parsed.byProjectRoot ||
    typeof parsed.byProjectRoot !== "object"
  ) {
    return {
      store: createEmptyCurrentSessionSelectionStore(),
      readError: `Invalid current session selection store at ${storePath}`,
    };
  }

  return {
    store: {
      schemaVersion: 1,
      byProjectRoot: parsed.byProjectRoot,
    },
    readError: null,
  };
}

export function resolveUnselectedCurrentSession(
  projectRoot: string,
  storeReadError: string | null,
): CurrentSessionSelectionResolution {
  if (storeReadError) {
    return {
      ok: false,
      reason: "store-invalid",
      detail: `Current session selection store could not be read for ${projectRoot}: ${storeReadError}.`,
    };
  }
  return {
    ok: false,
    reason: "none",
    detail: `No current session is selected for ${projectRoot}.`,
  };
}

export function resolveMissingCurrentSession(
  projectRoot: string,
  sessionId: string,
): CurrentSessionSelectionResolution {
  return {
    ok: false,
    reason: "missing-session",
    sessionId,
    detail: `Current session ${sessionId} no longer exists for ${projectRoot}.`,
  };
}

export function resolveProjectRootMismatch(
  projectRoot: string,
  sessionId: string,
  sessionProjectRoot: string,
): CurrentSessionSelectionResolution {
  return {
    ok: false,
    reason: "project-root-mismatch",
    sessionId,
    detail: `Current session ${sessionId} is bound to ${sessionProjectRoot}, not ${projectRoot}.`,
  };
}

export function resolveCurrentSessionLoadFailed(
  projectRoot: string,
  sessionId: string,
  error: unknown,
): CurrentSessionSelectionResolution {
  return {
    ok: false,
    reason: "load-failed",
    sessionId,
    detail: `Current session ${sessionId} could not be loaded for ${projectRoot}: ${error instanceof Error ? error.message : String(error)}.`,
  };
}
