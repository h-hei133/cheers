/**
 * Session read surface - the questions the manager answers about stored sessions.
 *
 * Reading a session is a different job from writing one. The write path records
 * what a run did; this side answers what a session *is*: where its files live,
 * which sessions are worth offering back, what a replay or a recovery view shows,
 * and what continuity a resumed prompt should carry.
 *
 * These live on a base class rather than on the manager so the read surface has a
 * home of its own. The manager inherits them, so the call surface is unchanged,
 * and the store arrives from the leaf class that owns it - this class declares
 * what it needs and never constructs it.
 *
 * The store is the only thing it asks for beyond what the write path already
 * declares: every read here either goes straight to the store or composes another
 * read of this same class, so there are no new callbacks to thread through and
 * nothing to reach back up for.
 */

import { createComponentLogger } from "../observability/structuredLogger.js";
import { forgetSessionTodos } from "../core/commands/todoCommandRuntime.js";
import { sessionHasReentrySurface } from "./presentation/sessionReentrySurface.js";
import { buildRecoverySnapshotForSession } from "./recovery/sessionRecoveryRuntime.js";
import {
  SessionLifecycleWrites,
  type SessionLifecycleWriteHost,
} from "./lifecycle/sessionLifecycleWrites.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtime/state.js";
import type { CurrentSessionSelectionResolution } from "./store/currentSelection.js";
import type { TranscriptEvent } from "./sessionEventCodec.js";
import type { Session } from "./schema/sessionRecord.js";
import type { SessionStateSnapshot } from "./schema/sessionStateSnapshot.js";
import type { SessionContinuitySnapshot } from "./sessionContinuityTypes.js";
import type { RuntimeSeedOptions } from "./replay/builder.js";
import type { RecoverySnapshot } from "./recovery/sessionRecoverySnapshot.js";
import type { ReplayPlan } from "./replay/sessionReplayFacade.js";
import { handleGetTranscriptEvents } from "./agent/persistence.js";
import { buildSessionContinuitySnapshot } from "./continuation/sessionContinuitySnapshot.js";
import { normalizeLegacyPermissionStateForSession } from "./continuation/legacyPermissionRebase.js";
import {
  buildSessionResumeContext,
  buildSessionResumeSnapshot,
} from "./continuation/sessionPromptContinuity.js";
import {
  buildReplayPlanForSession,
  buildRuntimeStateSeedForSession,
} from "./replay/sessionReplayRuntime.js";

const sessionLogger = createComponentLogger("SessionManager");

export abstract class SessionReadSurface extends SessionLifecycleWrites {
  protected constructor(host: SessionLifecycleWriteHost) {
    super(host);
  }

  getSessionFilePath(sessionId: string): string {
    return this.host.store.metadataPath(sessionId);
  }

  getSessionDirPath(sessionId: string): string {
    return this.host.store.sessionDir(sessionId);
  }

  /**
   * Hide a session from re-entry until it holds something to return to.
   *
   * A launch has to create a session so the run has an identity, but a session
   * nobody said anything in is not a place to go back to. Listing it would put a
   * row in `/resume` for every time the CLI was opened, and offering its id on the
   * way out would hand back a session that restores nothing. So an untouched
   * session exists for the run and is invisible to everything that offers a choice.
   *
   * A run interrupted with a prompt still pending, or one that ended in a
   * terminal state, is unfinished or diagnosable work and stays offered.
   */
  protected listRealSessions(): Session[] {
    return this.listSessions().filter((session) => sessionHasReentrySurface(session));
  }

  /** The stored record, or undefined when it is gone or unreadable. */
  getSession(sessionId: string): Session | undefined {
    try {
      return this.host.store.load(sessionId);
    } catch (error) {
      sessionLogger.warn("Failed to load session", { sessionId, error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }

  sessionExists(sessionId: string): boolean {
    return this.host.store.sessionExists(sessionId);
  }

  getCurrentSessionForProject(projectRoot: string): Session | null {
    return this.host.store.getCurrentSessionForProject(projectRoot);
  }

  resolveCurrentSessionForProject(
    projectRoot: string,
  ): CurrentSessionSelectionResolution {
    return this.host.store.resolveCurrentSessionForProject(projectRoot);
  }

  setCurrentSessionForProject(projectRoot: string, sessionId: string): void {
    this.host.store.setCurrentSessionForProject(projectRoot, sessionId);
  }

  clearCurrentSessionForProject(projectRoot: string): void {
    this.host.store.clearCurrentSessionForProject(projectRoot);
  }

  listSessions(): Session[] {
    return this.host.store.listSessions();
  }

  /**
   * Sessions worth returning to, newest first.
   *
   * A session nobody said anything in is not one of them — offering it would put a
   * row in the chooser for every time the CLI was opened.
   */
  listRecentSessions(limit: number = 5): Session[] {
    return this.listRealSessions().slice(0, limit);
  }

  deleteSession(sessionId: string): void {
    this.host.store.deleteSession(sessionId);
    // Release the checklist after storage deletion succeeds. Empty-session
    // discard has its own lifecycle entry point and performs the same cleanup.
    forgetSessionTodos(sessionId);
  }

  getTranscriptEvents(sessionId: string): TranscriptEvent[] {
    return handleGetTranscriptEvents(this.host.store, sessionId);
  }

  getRecoverySnapshot(sessionId: string): RecoverySnapshot {
    return buildRecoverySnapshotForSession({
      sessionId,
      session: this.host.store.load(sessionId),
      state: this.host.store.readStateSnapshotRequired(this.host.store.statePath(sessionId)),
      transcriptEvents: this.getTranscriptEvents(sessionId),
    });
  }

  getReplayPlan(sessionId: string): ReplayPlan {
    return buildReplayPlanForSession(this.getRecoverySnapshot(sessionId));
  }

  buildRuntimeStateSeed(
    sessionId: string,
    options: RuntimeSeedOptions = {},
  ): QueryRuntimeStateSeed {
    return buildRuntimeStateSeedForSession({
      sessionId,
      snapshot: this.getRecoverySnapshot(sessionId),
      options,
    });
  }

  buildContinuitySnapshot(sessionId: string): SessionContinuitySnapshot {
    const session = this.host.store.load(sessionId);
    const statePath = this.host.store.statePath(sessionId);
    const stateSnapshot = this.normalizeLegacyPermissionStateForSession(
      session,
      this.host.store.readStateSnapshotRequired(statePath),
    );
    if (!stateSnapshot) {
      throw new Error(`Session state unavailable after continuity normalization at ${statePath}`);
    }
    const transcriptEvents = this.getTranscriptEvents(sessionId);
    return buildSessionContinuitySnapshot({
      session,
      stateSnapshot,
      recoverySnapshot: buildRecoverySnapshotForSession({
        sessionId,
        session,
        state: stateSnapshot,
        transcriptEvents,
      }),
      transcriptEvents,
      approvalHistoryLimit: this.host.approvalAuditHistoryLimit,
    });
  }

  private normalizeLegacyPermissionStateForSession(
    session: Session,
    snapshot: SessionStateSnapshot | undefined,
  ): SessionStateSnapshot | undefined {
    const statePath = this.host.store.statePath(session.id);
    return normalizeLegacyPermissionStateForSession({
      session,
      snapshot,
      withStateLock: (targetSessionId, update) =>
        this.host.store.withSessionStateLock(targetSessionId, update),
      readLatestSnapshot: () => this.host.store.readStateSnapshotSafely(statePath),
      writeSnapshot: (nextSnapshot) =>
        this.host.store.writeJsonFileAtomic(statePath, nextSnapshot),
    });
  }

  buildPromptContinuityContext(
    sessionId: string,
    currentPrompt: string,
  ): string | undefined {
    const snapshot = this.buildContinuitySnapshot(sessionId);
    return buildSessionResumeContext({ currentPrompt, snapshot });
  }

  buildPromptContinuitySnapshot(
    sessionId: string,
    currentPrompt: string,
  ): SessionContinuitySnapshot | undefined {
    const snapshot = this.buildContinuitySnapshot(sessionId);
    return buildSessionResumeSnapshot({ currentPrompt, snapshot });
  }
}
