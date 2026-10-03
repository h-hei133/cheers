import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { projectSessionMetadata } from "../schema/sessionMetadataCodec.js";
import { isRecord } from "../../core/values/record.js";
import { normalizePathIdentity } from "./roots.js";
import { projectSessionRootRebase } from "./sessionRootRebase.js";

type RebindOutcome = "unchanged" | "restored" | "partial" | "committed";
type RebindStage = "prepare" | "state" | "metadata" | "lock-release" | "selection";

export class SessionRootRebindError extends Error {
  constructor(readonly outcome: RebindOutcome, readonly stage: RebindStage, cause: unknown) {
    const detail = {
      unchanged: "session records were not changed",
      restored: "the previous state was restored and metadata is unchanged",
      partial: "record updates are partial or unverified; inspect the session before retrying",
      committed: "session records were saved, but the operation reported a follow-up failure",
    }[outcome];
    super("Session root migration failed at " + stage + ": " + detail + ". " +
      (cause instanceof Error ? cause.message : String(cause)), { cause });
    this.name = "SessionRootRebindError";
  }
}

interface RebindInput {
  readonly session: Session;
  readonly nextProjectRoot: string;
  readonly updatedAt: string;
  readonly readSession: () => Session;
  readonly readMetadata: () => unknown;
  readonly writeSessionMetadata: (session: Session) => void;
  readonly withStateLock: (sessionId: string, update: () => void) => void;
  readonly readStateSnapshot: () => SessionStateSnapshot | undefined;
  readonly writeStateSnapshot: (snapshot: SessionStateSnapshot) => void;
}

/** Coordinate existing atomic record writers; this is not a cross-file crash transaction. */
export function rebindSessionProjectRootContinuity(input: RebindInput): Session {
  let rebound: Session | undefined;
  try {
    input.withStateLock(input.session.id, () => {
      const current = readCurrentState(input);
      const previousMetadata = input.readMetadata();
      if (!isRecord(previousMetadata)) throw new Error("Session metadata is missing or invalid");
      const latest = input.readSession();
      validateSource(input, latest, current);
      const projection = projectSessionRootRebase({
        workingMemory: current.workingMemory,
        previousRoot: latest.projectRoot,
        nextProjectRoot: input.nextProjectRoot,
      });
      const nextState: SessionStateSnapshot = {
        ...current,
        projectRoot: projection.projectRoot,
        ...(projection.workingMemory !== undefined ? { workingMemory: projection.workingMemory } : {}),
      };
      const nextSession: Session = {
        ...latest,
        projectRoot: projection.projectRoot,
        updatedAt: input.updatedAt,
        status: current.status,
        pendingPrompt: current.pendingPrompt,
        lastError: current.lastError,
      };
      try {
        input.writeStateSnapshot(nextState);
      } catch (error) {
        throw writeFailure(input, previousMetadata, current, nextSession, nextState, "state", error);
      }
      try {
        input.writeSessionMetadata(nextSession);
      } catch (error) {
        throw writeFailure(input, previousMetadata, current, nextSession, nextState, "metadata", error);
      }
      rebound = nextSession;
    });
  } catch (error) {
    if (error instanceof SessionRootRebindError) throw error;
    // Lock release can throw after both record writes. Never compensate outside
    // the lock, or describe those committed records as an unchanged session.
    throw new SessionRootRebindError(rebound ? "committed" : "unchanged", rebound ? "lock-release" : "prepare", error);
  }
  if (!rebound) throw new SessionRootRebindError("unchanged", "prepare", new Error("State lock did not run the migration"));
  return rebound;
}

function readCurrentState(input: RebindInput): SessionStateSnapshot {
  const state: unknown = input.readStateSnapshot();
  if (!isRecord(state) || typeof state.status !== "string" ||
    !["active", "interrupted", "completed", "error", "terminated"].includes(state.status) ||
    (state.projectRoot !== undefined && (typeof state.projectRoot !== "string" || !normalizePathIdentity(state.projectRoot)))) {
    throw new Error("Session state is missing or invalid");
  }
  return state as unknown as SessionStateSnapshot;
}

function validateSource(input: RebindInput, latest: Session, current: SessionStateSnapshot): void {
  if (!input.nextProjectRoot.trim()) throw new Error("Destination project root is empty");
  const expectedRoot = normalizePathIdentity(input.session.projectRoot);
  const latestRoot = normalizePathIdentity(latest.projectRoot);
  if (latest.id !== input.session.id || !expectedRoot || expectedRoot !== latestRoot) {
    throw new Error("Session identity or project root changed before migration");
  }
  if (current.projectRoot !== undefined && normalizePathIdentity(current.projectRoot) !== latestRoot) {
    throw new Error("Session metadata and state project roots disagree");
  }
}

function writeFailure(
  input: RebindInput,
  previousMetadata: unknown,
  previousState: SessionStateSnapshot,
  nextSession: Session,
  nextState: SessionStateSnapshot,
  stage: "state" | "metadata",
  error: unknown,
): SessionRootRebindError {
  let outcome: RebindOutcome = "partial";
  let cause = error;
  try {
    // A writer may replace its file before reporting failure. Read both records
    // before deciding whether compensation would undo an already saved binding.
    if (stage === "metadata" &&
      sameValue(input.readMetadata(), projectSessionMetadata(nextSession)) &&
      sameValue(input.readStateSnapshot(), nextState)) {
      outcome = "committed";
    } else {
      outcome = restoreState(input, previousMetadata, previousState, nextState);
      if (stage === "metadata" && outcome === "unchanged") outcome = "restored";
    }
  } catch (recoveryError) {
    cause = new AggregateError([error, recoveryError], [error, recoveryError]
      .map(value => value instanceof Error ? value.message : String(value)).join("; "));
  }
  return new SessionRootRebindError(outcome, stage, cause);
}

function restoreState(
  input: RebindInput,
  previousMetadata: unknown,
  previousState: SessionStateSnapshot,
  nextState: SessionStateSnapshot,
): "unchanged" | "restored" | "partial" {
  if (!sameValue(input.readMetadata(), previousMetadata)) return "partial";
  const current = input.readStateSnapshot();
  if (sameValue(current, previousState)) return "unchanged";
  // Do not overwrite a foreign or unreadable state during recovery.
  if (!sameValue(current, nextState)) return "partial";
  input.writeStateSnapshot(previousState);
  return sameValue(input.readStateSnapshot(), previousState) && sameValue(input.readMetadata(), previousMetadata)
    ? "restored"
    : "partial";
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
