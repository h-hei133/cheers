/**
 * SessionManager - directory-based session substrate
 *
 * Layout per session:
 * - metadata.json   -> identity + timestamps
 * - transcript.jsonl -> append-only events/messages
 * - state.json      -> mutable runtime state snapshot
 */

import type { CurrentSessionSelectionResolution } from "./store/currentSelection.js";
import { SESSION_APPROVAL_AUDIT_HISTORY_LIMIT } from "./approval/sessionApprovalMemory.js";
import { type TranscriptEvent } from "./sessionEventCodec.js";
import { appendBranchSummaryEvent } from "./transcript/sessionTranscript.js";
import type { SessionMessage } from "./schema/sessionMessage.js";
import type { Session } from "./schema/sessionRecord.js";
import type { SessionStateSnapshot } from "./schema/sessionStateSnapshot.js";
import { buildSessionStateSnapshot } from "./schema/sessionStateSnapshot.js";
import {
  projectSortedSessionReentrySummaries,
  selectRecoveryTrustBoundaryBlock,
  selectSuggestedRecoverySessionIdFromSessions,
} from "./recovery/sessionRecoverySelection.js";
import { projectRecentProjectContexts } from "./recovery/projectContextSummary.js";
import type { ProjectContextSummary } from "./recovery/projectContextSummary.js";
import { validateSessionId } from "./store/sessionFileLayout.js";
import {
  createSession,
  createSessionWithId,
} from "./store/sessionCreation.js";
import { SessionStoreAccess } from "./store/sessionStoreAccess.js";
import {
  projectSessionReentrySummary,
  type SessionReentrySummary,
} from "./presentation/sessionReentrySurface.js";
import type { RecoveryTrustBoundaryBlock } from "./recovery/recoveryTrustBoundary.js";
import type { SessionResumeEligibility } from "./recovery/sessionResumeEligibility.js";
import type {
  ApprovalAuditMemoryState,
  SessionContinuitySnapshot,
} from "./sessionContinuityTypes.js";
import { type WorkspaceRootMode } from "./store/projectBindingPolicy.js";
import { applySessionWorkspaceBinding } from "./store/sessionProjectBinding.js";
import { SessionReadSurface } from "./sessionReadSurface.js";
import { rebindSessionProjectRootContinuity } from "./continuation/sessionProjectRootRebind.js";
import {
  evaluateRecoveryTrustBoundaryForSession,
  projectRecoveryTrustBoundaryBlockForSession,
} from "./recovery/sessionRecoveryRuntime.js";
import type { RecoverySnapshot } from "./recovery/sessionRecoverySnapshot.js";
import {
  resumeSession,
  tryResumeSession,
  type SessionResumeOptions,
  type SessionResumeResult,
} from "./recovery/sessionResume.js";
import type { ReplayPlan } from "./replay/sessionReplayFacade.js";
export type { CurrentSessionSelectionResolution } from "./store/currentSelection.js";
export type {
  ApprovalAuditMemoryState,
  SessionContinuitySnapshot,
} from "./sessionContinuityTypes.js";
export type { TranscriptEvent } from "./sessionEventCodec.js";
export type { SessionMessage } from "./schema/sessionMessage.js";
export type { RecoverySnapshot } from "./recovery/sessionRecoverySnapshot.js";
export type {
  RecoveryTrustBoundaryBlock,
} from "./recovery/recoveryTrustBoundary.js";
export type {
  SessionResumeEligibility,
} from "./recovery/sessionResumeEligibility.js";
export type {
  ProjectContextSummary,
} from "./recovery/projectContextSummary.js";
export type {
  SessionReentrySummary,
} from "./presentation/sessionReentrySurface.js";
export type { ReplayPlan } from "./replay/sessionReplayFacade.js";

export type { WorkspaceRootMode } from "./store/projectBindingPolicy.js";
export type { Session } from "./schema/sessionRecord.js";

export type ResumeResult = SessionResumeResult;

export interface ResumeOptions extends SessionResumeOptions {}

export class SessionManager extends SessionReadSurface {
  private static readonly AUTO_COMPACT_TURN_THRESHOLD = 12;
  private static readonly APPROVAL_AUDIT_HISTORY_LIMIT =
    SESSION_APPROVAL_AUDIT_HISTORY_LIMIT;

  constructor() {
    super({
      store: new SessionStoreAccess(),
      approvalAuditHistoryLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT,
      readTranscriptEvents: (sessionId) => this.getTranscriptEvents(sessionId),
      readRecoverySnapshot: (sessionId) => this.getRecoverySnapshot(sessionId),
      buildStateSnapshot: (session, current) =>
        buildSessionStateSnapshot(session, current),
    });
  }

  private createSessionCreationCallbacks() {
    return {
      sessionExists: (sessionId: string) => this.sessionExists(sessionId),
      validateSessionId,
      createSessionId: () => this.host.store.createSessionId(),
      writeSession: (session: Session) => this.host.store.writeSession(session),
      setCurrentSessionForProject: (projectRoot: string, sessionId: string) =>
        this.setCurrentSessionForProject(projectRoot, sessionId),
      now: () => new Date().toISOString(),
    };
  }

  private createSessionResumeCallbacks() {
    return {
      sessionDirExists: (sessionId: string) =>
        this.host.store.sessionExists(sessionId),
      sessionDir: (sessionId: string) => this.host.store.sessionDir(sessionId),
      loadSession: (sessionId: string) => this.host.store.load(sessionId),
      writeSessionMetadata: (session: Session) =>
        this.host.store.writeSessionMetadata(session),
      setCurrentSessionForProject: (projectRoot: string, sessionId: string) =>
        this.setCurrentSessionForProject(projectRoot, sessionId),
      evaluateRecoveryTrustBoundary: (session: Session) =>
        this.evaluateRecoveryTrustBoundary(session),
      cwd: () => process.cwd(),
      now: () => new Date().toISOString(),
    };
  }

  /**
   * Drop everything said after `turnIndex`, keeping the workspace untouched.
   *
   * This is the conversational half of going back: the model stops seeing the
   * turns that followed, so the next answer is built from the shorter history.
   * Files are deliberately left alone — reverting the work and reconsidering the
   * question are different decisions, and doing both from one gesture makes the
   * destructive one impossible to decline.
   *
   * When a summarizer is supplied, what the dropped turns established is kept as
   * a note at the point the user returned to. The turns are gone either way; the
   * difference is whether the next answer knows what was already tried.
   *
   * Returns how many turns were dropped.
   */
  async rewindTo(
    sessionId: string,
    turnIndex: number,
    summarize?: (dropped: readonly SessionMessage[]) => Promise<string | undefined>,
  ): Promise<number> {
    const session = this.getSession(sessionId);
    if (!session) return 0;
    const keep = Math.max(0, Math.min(turnIndex, session.turns.length));
    const dropped = session.turns.length - keep;
    if (dropped <= 0) return 0;
    const abandoned = session.turns.slice(keep);
    const summary = summarize ? await summarize(abandoned).catch(() => undefined) : undefined;
    session.turns = session.turns.slice(0, keep);
    session.updatedAt = new Date().toISOString();
    this.host.store.writeSessionMetadata(session);
    if (summary) {
      appendBranchSummaryEvent(this.host.store.transcriptPath(sessionId), {
        summary,
        droppedTurns: dropped,
        timestamp: session.updatedAt,
      });
    }
    return dropped;
  }

  createNewWithId(
    sessionId: string,
    projectRoot: string = process.cwd(),
    options?: {
      readonly rootMode?: WorkspaceRootMode;
      readonly requestedWorkspaceRoot?: string;
      readonly targetPathBase?: string;
      readonly gitRoot?: string | null;
    },
  ): Session {
    return createSessionWithId({
      callbacks: this.createSessionCreationCallbacks(),
      sessionId,
      projectRoot,
      options,
    });
  }

  createNew(
    projectRoot: string = process.cwd(),
    options?: {
      readonly rootMode?: WorkspaceRootMode;
      readonly requestedWorkspaceRoot?: string;
      readonly targetPathBase?: string;
      readonly gitRoot?: string | null;
    },
  ): Session {
    return createSession({
      callbacks: this.createSessionCreationCallbacks(),
      projectRoot,
      options,
    });
  }

  resume(sessionId: string, projectRoot?: string): Session {
    return resumeSession(
      this.createSessionResumeCallbacks(),
      sessionId,
      projectRoot,
    );
  }

  tryResume(
    sessionId: string,
    projectRoot?: string,
    options?: ResumeOptions,
  ): ResumeResult {
    return tryResumeSession(
      this.createSessionResumeCallbacks(),
      sessionId,
      projectRoot,
      options,
    );
  }

  renameSession(sessionId: string, title: string): Session {
    const session = this.host.store.load(sessionId);
    const normalized = title.trim();
    session.title = normalized.length > 0 ? normalized : undefined;
    session.updatedAt = new Date().toISOString();
    this.host.store.writeSessionMetadata(session);
    return session;
  }

  listRecentProjectContexts(limit: number = 8): ProjectContextSummary[] {
    return projectRecentProjectContexts({
      summaries: this.listSessions().map((session) =>
        this.describeSessionReentry(session.id),
      ),
      limit,
    });
  }

  /**
   * Sessions to offer, newest and most relevant first.
   *
   * `includeUntouched` exists for resolution rather than offering: hiding a session
   * nobody spoke in keeps the chooser clean, but refusing to *find* one the user
   * named by title or id would be refusing an explicit request.
   */
  listReentrySummaries(input?: {
    readonly limit?: number;
    readonly preferredProjectRoot?: string;
    readonly includeUntouched?: boolean;
  }): SessionReentrySummary[] {
    const sessions = input?.includeUntouched === true ? this.listSessions() : this.listRealSessions();
    return projectSortedSessionReentrySummaries({
      summaries: sessions.map((session) => this.describeSessionReentry(session.id)),
      preferredProjectRoot: input?.preferredProjectRoot,
      limit: input?.limit,
    });
  }

  /**
   * The session a bare `/resume` or `/continue` should land on.
   *
   * Recovery eligibility is the wrong filter here: a session that finished
   * cleanly is exactly what someone means by "the one I was in", and refusing it
   * because nothing went wrong is why re-entry felt broken. An interrupted
   * session still wins, because picking up unfinished work is more urgent than
   * reopening finished work.
   */
  getReentryCandidate(input?: {
    readonly preferredProjectRoot?: string;
  }): Session | null {
    const recoverable = this.getSuggestedRecoverySession(input);
    if (recoverable) return recoverable;
    const summaries = this.listReentrySummaries({
      preferredProjectRoot: input?.preferredProjectRoot,
      limit: 20,
    });
    const withContent = summaries.find((summary) => summary.hasConversation === true);
    return withContent ? this.host.store.load(withContent.id) : null;
  }

  getSuggestedRecoverySession(input?: {
    readonly preferredProjectRoot?: string;
  }): Session | null {
    const sessionId = selectSuggestedRecoverySessionIdFromSessions({
      sessions: this.listSessions(),
      preferredProjectRoot: input?.preferredProjectRoot,
      evaluate: (session) => this.evaluateRecoveryTrustBoundary(session),
      projectPreferredSummaries: (preferredProjectRoot) =>
        this.listReentrySummaries({ preferredProjectRoot }),
    });
    return sessionId ? this.host.store.load(sessionId) : null;
  }

  rebindSessionProjectRoot(sessionId: string, nextProjectRoot: string): Session {
    const session = this.host.store.load(sessionId);
    const statePath = this.host.store.statePath(session.id);
    const rebound = rebindSessionProjectRootContinuity({
      session,
      nextProjectRoot,
      updatedAt: new Date().toISOString(),
      writeSessionMetadata: (nextSession) =>
        this.host.store.writeSessionMetadata(nextSession),
      withStateLock: (targetSessionId, update) =>
        this.host.store.withSessionStateLock(targetSessionId, update),
      readStateSnapshot: () => this.host.store.readStateSnapshotSafely(statePath),
      buildStateSnapshot: (nextSession, current) =>
        this.buildSessionStateSnapshot(nextSession, current),
      writeStateSnapshot: (snapshot) =>
        this.host.store.writeJsonFileAtomic(statePath, snapshot),
    });
    this.setCurrentSessionForProject(rebound.projectRoot, rebound.id);
    return rebound;
  }

  updateSessionWorkspaceBinding(
    sessionId: string,
    binding: {
      readonly projectRoot?: string;
      readonly rootMode?: WorkspaceRootMode;
      readonly requestedWorkspaceRoot?: string;
      readonly targetPathBase?: string;
      readonly gitRoot?: string | null;
    },
  ): Session {
    const session = this.host.store.load(sessionId);
    applySessionWorkspaceBinding({
      session,
      binding,
      updatedAt: new Date().toISOString(),
    });
    this.host.store.writeSessionMetadata(session);
    this.host.store.writeSessionState(session);
    this.setCurrentSessionForProject(session.projectRoot, session.id);
    return session;
  }

  getRecoveryTrustBoundaryBlock(input?: {
    readonly preferredProjectRoot?: string;
  }): RecoveryTrustBoundaryBlock | null {
    return selectRecoveryTrustBoundaryBlock({
      sessions: this.listSessions(),
      preferredProjectRoot: input?.preferredProjectRoot,
      evaluate: (session) => this.evaluateRecoveryTrustBoundary(session),
    });
  }

  describeSessionReentry(sessionId: string): SessionReentrySummary {
    const session = this.host.store.load(sessionId);
    const trustBoundary = this.evaluateRecoveryTrustBoundary(session);
    const recoverySnapshot = this.getRecoverySnapshot(sessionId);
    const continuitySnapshot = this.buildContinuitySnapshot(sessionId);

    return projectSessionReentrySummary({
      session,
      trustBoundary,
      recoverySnapshot,
      continuitySnapshot,
    });
  }

  getSessionResumeEligibility(sessionId: string): SessionResumeEligibility {
    const session = this.host.store.load(sessionId);
    return this.evaluateRecoveryTrustBoundary(session);
  }

  private evaluateRecoveryTrustBoundary(
    session: Session,
  ): SessionResumeEligibility {
    return evaluateRecoveryTrustBoundaryForSession({
      session,
      loadRecoverySnapshot: (sessionId) => this.getRecoverySnapshot(sessionId),
      createBlock: (targetSession, reason, detail) =>
        this.createRecoveryTrustBoundaryBlock(targetSession, reason, detail),
    });
  }

  private createRecoveryTrustBoundaryBlock(
    session: Session,
    reason: RecoveryTrustBoundaryBlock["reason"],
    detail: string,
  ): RecoveryTrustBoundaryBlock {
    return projectRecoveryTrustBoundaryBlockForSession({
      sessionId: session.id,
      sessionDir: this.host.store.sessionDir(session.id),
      reason,
      detail,
    });
  }

  private buildSessionStateSnapshot(
    session: Session,
    current: SessionStateSnapshot | undefined,
    overrides?: Partial<
      Pick<
        SessionStateSnapshot,
        | "runPhase"
        | "interruptedKind"
        | "terminalReason"
        | "terminalClassification"
        | "lastContinuationReason"
        | "pendingLifecycle"
      >
    >,
  ): SessionStateSnapshot {
    return buildSessionStateSnapshot(session, current, overrides);
  }
}
