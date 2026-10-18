/**
 * Session lifecycle writes - the state transitions a run records as it goes.
 *
 * A session moves through marks and saves: a run starts, a prompt lands, a turn
 * goes active, an interruption or a terminal outcome is written down. Each one
 * appends a transcript event and rewrites the session state, in that order.
 *
 * These live on a base class rather than on the manager so the write path has a
 * home of its own. The manager inherits them, so the call surface is unchanged,
 * and the state-reading helpers they need arrive as callbacks - the base does
 * not reach back into the manager for anything else.
 */

import { createComponentLogger } from "../../observability/structuredLogger.js";
import { forgetSessionTodos } from "../../core/commands/todoCommandRuntime.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { QueryRuntimeRecoveryBoundary } from "../../core/query/runtime/state.js";
import type { DurableLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type { ApprovalAuditMemoryState } from "../sessionContinuityTypes.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type {
  SessionStateSnapshot,
  SessionStateSnapshotOverrides,
  TerminalPersistence,
} from "../schema/sessionStateSnapshot.js";
import type { SessionStoreAccess } from "../store/sessionStoreAccess.js";
import { recordSessionApprovalAuditDecision } from "../approval/sessionApprovalMemory.js";
import {
  handleAddTurn,
  handleMarkRecoveryReentry,
  handleMarkRunStarted,
  handleMarkTurnActive,
  handlePersistUserPromptBarrier,
  handleSaveCompleted,
  handleSaveError,
  handleSaveInterrupted,
  handleSaveTerminated,
} from "../agent/lifecycle.js";
import {
  handleAppendQueryEvent,
  handleAppendTranscriptEvent,
  handleApplyQueryEventToState,
} from "../agent/persistence.js";
import { reconcilePendingLifecycleForSession } from "../recovery/sessionRecoveryRuntime.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";
import { sessionHasConversation } from "../presentation/sessionReentrySurface.js";
import { captureReportWriter } from '../reports/persistence.js';
import type { ReportWriter } from '../reports/model.js';
import { SessionCompactionWrites } from '../compaction/writes.js';

const sessionLogger = createComponentLogger("SessionManager");

/**
 * What the write path needs from the rest of the session manager.
 *
 * Stated as callbacks rather than reached for directly: the write path owns how
 * state transitions are recorded, and reads back only what a transition needs to
 * decide what to record. Callers supply them; the base does not know what else
 * the manager can do.
 */
export interface SessionLifecycleWriteHost {
  readonly store: SessionStoreAccess;
  readonly approvalAuditHistoryLimit: number;
  /** The transcript events a session has appended so far. */
  readTranscriptEvents(sessionId: string): TranscriptEvent[];
  /** The recovery view a session currently presents. */
  readRecoverySnapshot(sessionId: string): RecoverySnapshot;
  /** Attach overrides to a state snapshot before it is written. */
  buildStateSnapshot(
    session: Session,
    current: SessionStateSnapshot | undefined,
  ): SessionStateSnapshot;
}

export abstract class SessionLifecycleWrites extends SessionCompactionWrites {
  protected constructor(protected readonly host: SessionLifecycleWriteHost) { super(host.store); }

  private createSessionLifecycleCallbacks() {
    return {
      loadSession: (sessionId: string) => this.host.store.load(sessionId),
      appendTranscriptEvent: (sessionId: string, event: TranscriptEvent) =>
        this.appendTranscriptEvent(sessionId, event),
      writeSessionMetadata: (session: Session) =>
        this.host.store.writeSessionMetadata(session),
      writeSessionState: (
        session: Session,
        overrides?: SessionStateSnapshotOverrides,
      ) => this.host.store.writeSessionState(session, overrides),
      now: () => new Date().toISOString(),
    };
  }

  private appendTranscriptEvent(
    sessionId: string,
    event: TranscriptEvent,
  ): void {
    handleAppendTranscriptEvent(this.host.store, sessionId, event);
  }

  private applyQueryEventToState(sessionId: string, event: QueryEvent): void {
    handleApplyQueryEventToState(this.host.store, sessionId, event);
  }

  addTurn(sessionId: string, message: SessionMessage): void {
    handleAddTurn(this.createSessionLifecycleCallbacks(), sessionId, message);
  }

  captureReportWriter(sessionId: string): ReportWriter {
    return captureReportWriter(this.host.store, sessionId);
  }

  recordApprovalAuditDecision(
    sessionId: string,
    decision: Omit<ApprovalAuditMemoryState, "recordedAt"> & {
      readonly recordedAt?: string;
    },
  ): void {
    const session = this.host.store.load(sessionId);
    const statePath = this.host.store.statePath(session.id);
    recordSessionApprovalAuditDecision({
      session,
      decision,
      recordedAt: decision.recordedAt ?? new Date().toISOString(),
      historyLimit: this.host.approvalAuditHistoryLimit,
      withStateLock: (targetSessionId, update) =>
        this.host.store.withSessionStateLock(targetSessionId, update),
      readCurrentSnapshot: () => this.host.store.readStateSnapshotSafely(statePath),
      buildSnapshot: (current) =>
        this.host.buildStateSnapshot(session, current),
      writeSnapshot: (snapshot) => this.host.store.writeJsonFileAtomic(statePath, snapshot),
    });
  }

  markRunStarted(sessionId: string, prompt: string): void {
    handleMarkRunStarted(this.createSessionLifecycleCallbacks(), sessionId, prompt);
  }

  persistUserPromptBarrier(sessionId: string, prompt: string, metadata?: Record<string, unknown>): void {
    handlePersistUserPromptBarrier(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      prompt,
      metadata,
    );
  }

  markTurnActive(sessionId: string): void {
    handleMarkTurnActive(this.createSessionLifecycleCallbacks(), sessionId);
  }

  markRecoveryReentry(
    sessionId: string,
    boundary: QueryRuntimeRecoveryBoundary,
  ): void {
    handleMarkRecoveryReentry(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      boundary,
    );
  }

  saveInterrupted(
    sessionId: string,
    interruptedKind: "prompt" | "turn" = "prompt",
  ): void {
    handleSaveInterrupted(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      interruptedKind,
    );
  }

  saveCompleted(sessionId: string, terminal?: TerminalPersistence): void {
    handleSaveCompleted(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      terminal,
    );
  }

  saveError(
    sessionId: string,
    error: string,
    terminal?: TerminalPersistence,
  ): void {
    handleSaveError(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      error,
      terminal,
    );
  }

  /**
   * Close a session out.
   *
   * A session that never held a conversation is deleted rather than terminated: a
   * run that only listed commands has nothing to come back to, and leaving those
   * behind fills the re-entry list with empty rows and hands the user a resume id
   * that restores nothing.
   */
  saveTerminated(sessionId: string): void {
    handleSaveTerminated(this.createSessionLifecycleCallbacks(), sessionId);
    if (this.discardIfEmpty(sessionId)) return;
  }

  /**
   * Delete `sessionId` when nothing was ever said in it. Returns whether it went.
   */
  discardIfEmpty(sessionId: string): boolean {
    let session: Session;
    try {
      session = this.host.store.load(sessionId);
    } catch (error) {
      sessionLogger.warn("Failed to load session for discard check", { sessionId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
    if (sessionHasConversation(session) || session.hasReportHistory) return false;
    // Explicit durable user state can precede the first model turn.
    const state = this.host.store.readStateSnapshotSafely(this.host.store.statePath(sessionId));
    if (state && [state.modelSelection, state.goal, state.plan, state.goalDraft, state.goalAcceptance, state.advisor, state.research, state.gitWorkflow, state.jobs, state.evaluations, state.live, state.recordings].some(value => value !== undefined)) return false;
    const projectRoot = session.projectRoot;
    this.host.store.deleteSession(sessionId);
    forgetSessionTodos(sessionId);
    // The pointer must not outlive the record it points at.
    const current = projectRoot ? this.host.store.getCurrentSessionForProject(projectRoot) : null;
    if (current?.id === sessionId) this.host.store.clearCurrentSessionForProject(projectRoot);
    return true;
  }

  reconcilePendingLifecycle(sessionId: string): DurableLifecycleIndex {
    const snapshot = this.host.readRecoverySnapshot(sessionId);
    return reconcilePendingLifecycleForSession({
      snapshot,
      transcriptEvents: snapshot.transcriptEvents,
      applyQueryEventToState: (event) =>
        this.applyQueryEventToState(sessionId, event),
      appendQueryEvent: (event) => this.appendQueryEvent(sessionId, event),
      readPendingLifecycle: () =>
        this.host.readRecoverySnapshot(sessionId).pendingLifecycle,
    });
  }

  appendQueryEvent(sessionId: string, event: QueryEvent, source?: { readonly entryId?: string }): void {
    handleAppendQueryEvent(this.host.store, sessionId, event, source);
  }

}
