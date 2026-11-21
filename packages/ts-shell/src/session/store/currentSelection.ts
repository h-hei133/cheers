import type { Session } from "../schema/sessionRecord.js";
import { PromptPublicationError } from './prompt/intent.js';
import { SessionSnapshotConflict } from './snapshot.js';
import { isRecord } from '../../core/values/record.js';

export interface CurrentSessionSelectionRecord {
  readonly sessionId: string;
  readonly updatedAt: string;
  /** Each explicit activation has a new identity, including same-session resume. */
  readonly activationId?: string;
}

export interface CurrentSessionSelectionStore {
  readonly schemaVersion: 1;
  readonly byProjectRoot: Record<string, CurrentSessionSelectionRecord>;
  /** Older writers drop this identity along with the receipts they cannot preserve. */
  readonly resumeStoreId?: string;
  readonly resumeReceipts?: Readonly<Record<string, string>>;
}

export type CurrentSessionSelectionReason =
  | "none"
  | "store-invalid"
  | "missing-session"
  | "load-failed"
  | "activation-changed"
  | "session-changed"
  | "prompt-publication-unknown"
  | "project-root-mismatch";

export type CurrentSessionSelectionResolution = (
  | { readonly ok: true; readonly session: Session }
  | {
      readonly ok: false;
      readonly reason: CurrentSessionSelectionReason;
      readonly sessionId?: string;
      readonly detail: string;
    }
) & { readonly activation?: CurrentSessionSelectionRecord };

export interface CurrentSessionStoreParseResult {
  readonly store: CurrentSessionSelectionStore;
  readonly readError: string | null;
}

export interface CurrentSessionSelectionProjection {
  readonly resolution: CurrentSessionSelectionResolution;
  readonly clearSelection: boolean;
}

export interface CurrentSessionSelectionInput {
  readonly projectRoot: string;
  readonly normalizedProjectRoot: string;
  readonly storeReadError: string | null;
  readonly selection?: CurrentSessionSelectionRecord;
  readonly sessionExists?: boolean;
  readonly session?: Session;
  readonly sessionProjectRoot?: string;
  readonly normalizedSessionProjectRoot?: string;
  readonly loadError?: unknown;
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
    typeof parsed.byProjectRoot !== "object" ||
    Array.isArray(parsed.byProjectRoot) ||
    (parsed.resumeStoreId !== undefined && (typeof parsed.resumeStoreId !== 'string' || !/^[a-f0-9-]{36}$/.test(parsed.resumeStoreId))) ||
    (parsed.resumeReceipts !== undefined && (!parsed.resumeStoreId || !isRecord(parsed.resumeReceipts)
      || Object.values(parsed.resumeReceipts).some(receipt => typeof receipt !== 'string' || !/^[a-f0-9]{64}$/.test(receipt))))
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
      ...(parsed.resumeStoreId === undefined ? {} : { resumeStoreId: parsed.resumeStoreId }),
      ...(parsed.resumeReceipts === undefined ? {} : { resumeReceipts: parsed.resumeReceipts }),
    },
    readError: null,
  };
}

export function selectCurrentSession(
  input: CurrentSessionSelectionInput,
): CurrentSessionSelectionProjection {
  const sessionId = input.selection?.sessionId;
  if (!sessionId?.trim()) {
    return {
      resolution: resolveUnselectedCurrentSession(
        input.projectRoot,
        input.storeReadError,
      ),
      clearSelection: false,
    };
  }

  if (input.sessionExists === false) {
    return {
      resolution: resolveMissingCurrentSession(input.projectRoot, sessionId),
      clearSelection: true,
    };
  }

  if (Object.prototype.hasOwnProperty.call(input, "loadError")) {
    if (input.loadError instanceof SessionSnapshotConflict) {
      return {
        resolution: { ok: false, reason: 'session-changed', sessionId, detail: input.loadError.message },
        clearSelection: false,
      };
    }
    if (input.loadError instanceof PromptPublicationError) {
      return {
        resolution: { ok: false, reason: 'prompt-publication-unknown', sessionId, detail: input.loadError.message },
        clearSelection: false,
      };
    }
    return {
      resolution: resolveCurrentSessionLoadFailed(
        input.projectRoot,
        sessionId,
        input.loadError,
      ),
      clearSelection: true,
    };
  }

  if (input.session) {
    const sessionProjectRoot =
      input.sessionProjectRoot || input.session.projectRoot || input.normalizedProjectRoot;
    if (input.normalizedSessionProjectRoot !== input.normalizedProjectRoot) {
      return {
        resolution: resolveProjectRootMismatch(
          input.projectRoot,
          sessionId,
          sessionProjectRoot,
        ),
        clearSelection: true,
      };
    }
    return {
      resolution: { ok: true, session: input.session },
      clearSelection: false,
    };
  }

  return {
    resolution: resolveUnselectedCurrentSession(
      input.projectRoot,
      input.storeReadError,
    ),
    clearSelection: false,
  };
}

export const projectCurrentSessionSelection = selectCurrentSession;

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
