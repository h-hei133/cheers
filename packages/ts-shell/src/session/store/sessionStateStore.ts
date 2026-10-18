import type {
  SessionStateSnapshot,
  SessionStateSnapshotOverrides,
} from "../schema/sessionStateSnapshot.js";
import {
  buildSessionStateSnapshot,
} from "../schema/sessionStateSnapshot.js";
import type { Session } from "../schema/sessionRecord.js";
import {
  readJsonFileWithRetry,
  withFileLock,
  writeJsonFileAtomic,
} from "./sessionFileStore.js";
import type { SessionFileLayout } from "./sessionFileLayout.js";
import { persistSessionUsage } from "../../observability/usageTelemetry.js";
import { resolve } from 'node:path';

const heldStateLocks = new Set<string>();

export function readStateSnapshotSafely(
  statePath: string,
): SessionStateSnapshot | undefined {
  return readJsonFileWithRetry<SessionStateSnapshot>(statePath, {
    required: false,
    parseErrorDetail: "Invalid state snapshot",
  });
}

export function readStateSnapshotRequired(statePath: string): SessionStateSnapshot {
  const state = readJsonFileWithRetry<SessionStateSnapshot>(statePath, {
    required: true,
    parseErrorDetail: `Failed to load session state from ${statePath}`,
  });
  if (!state) {
    throw new Error(`Session state missing at ${statePath}`);
  }
  return state;
}

export function withSessionStateLock<T>(
  layout: Pick<SessionFileLayout, "stateLockPath">,
  action: () => T,
  options?: { readonly requireExisting?: boolean },
): T {
  const key = resolve(layout.stateLockPath);
  return withFileLock(layout.stateLockPath, () => {
    heldStateLocks.add(key);
    try { return action(); }
    finally { heldStateLocks.delete(key); }
  }, { createParent: !options?.requireExisting });
}

/** Metadata delegates to an existing synchronous state owner; other state lock calls remain nonreentrant. */
export function withSessionMetadataLock<T>(layout: Pick<SessionFileLayout, 'stateLockPath'>, action: () => T): T {
  return heldStateLocks.has(resolve(layout.stateLockPath)) ? action() : withSessionStateLock(layout, action);
}

export function writeSessionState(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, "statePath" | "stateLockPath">;
  readonly overrides?: SessionStateSnapshotOverrides;
}): void {
  withSessionStateLock(input.layout, () => {
    const current = readStateSnapshotSafely(input.layout.statePath);
    const snapshot = buildSessionStateSnapshot(
      input.session,
      current,
      input.overrides,
    );
    persistSessionUsage(input.session.id, current?.usage, (usage) => {
      writeJsonFileAtomic(input.layout.statePath, { ...snapshot, usage });
    });
  });
}
