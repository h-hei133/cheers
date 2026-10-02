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
import { appendTranscriptEvent, readTranscriptEvents } from "./transcript/sessionTranscript.js";
import { sessionThreadPath } from "./schema/sessionThread.js";
import {
  readSessionThreadSnapshot,
  switchDurableSessionActiveLeaf,
} from "./store/threadState.js";
import type { SessionMessage } from "./schema/sessionMessage.js";
import { isSessionContextMessage } from "./schema/sessionMessage.js";
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
  buildRecoverySnapshotForSession,
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
   * Go back to an earlier point without erasing what came after it.
   *
   * The turns are not dropped. The thread is a tree, and going back moves which
   * leaf is active — the abandoned turns keep their entries and stay in the
   * transcript, so returning to that direction later finds it intact.
   *
   * The previous sentence is a correction. This used to truncate
   * `session.turns` and write the result to the session metadata, which does not
   * record turns at all: the cut never reached disk, and the turns came back on
   * the next load. Reworking the question looked like it had worked until the
   * session was reopened.
   *
   * When a summarizer is supplied, what the abandoned turns established travels
   * as a note attached at the point the user returned to, so the next answer
   * knows what was already tried.
   *
   * Returns how many turns were left behind.
   */
  async revertTo(
    sessionId: string,
    entryId: string,
    summarize?: (abandoned: readonly SessionMessage[]) => Promise<string | undefined>,
  ): Promise<number> {
    const session = this.getSession(sessionId);
    if (!session) return 0;

    const layout = this.host.store.stateLayout(sessionId);
    const current = readSessionThreadSnapshot({ session, layout });
    const target = sessionThreadPath(current, entryId);
    if (!target.resolved || target.path.length === 0) return 0;

    const onBranch = new Set(target.path.map((entry) => entry.id));
    const abandonedTurns = session.turns.filter(
      (turn) => !isSessionContextMessage(turn) && (turn.id === undefined || !onBranch.has(turn.id)),
    );
    const summary = summarize && abandonedTurns.length > 0
      ? await summarize(abandonedTurns).catch(() => undefined)
      : undefined;

    switchDurableSessionActiveLeaf({ session, layout, leafEntryId: entryId });
    // Recorded whether or not anything could summarize it. The move is the fact
    // worth keeping: without it, reopening the session showed a shorter
    // conversation with nothing saying anything had been left behind.
    //
    // The abandoned turns are named for the same reason the entry ids are: the
    // note has to be readable back on the branch it applies to and nowhere else,
    // and which turns went is the only thing that says which branch that is.
    appendBranchSummaryEvent(this.host.store.transcriptPath(sessionId), {
      ...(summary !== undefined ? { summary } : {}),
      droppedTurns: abandonedTurns.length,
      toEntryId: entryId,
      abandonedEntryIds: abandonedTurns.flatMap((turn) => (turn.id === undefined ? [] : [turn.id])),
      timestamp: new Date().toISOString(),
    });
    return abandonedTurns.length;
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

  /**
   * A new session carrying this one's conversation.
   *
   * A revert moves the same session's active leaf back; a fork leaves the
   * source untouched and copies its transcript into a session that grows on
   * its own — for when a conversation is worth continuing twice in two
   * directions. The copy is the source's events verbatim, timestamps
   * included, because the fork's own records begin where the source's ended.
   *
   * What it carries besides the conversation is the source's identity: the
   * title, so a reader recognises the fork as the same thread of work, and the
   * source id, because the copied events say nothing about where they came
   * from. Both are the source's, not invented for the copy.
   */
  fork(sessionId: string, projectRoot?: string): Session {
    if (!this.sessionExists(sessionId)) {
      throw new Error(`Cannot fork: session ${sessionId} does not exist`);
    }
    const source = this.host.store.load(sessionId);
    const events = readTranscriptEvents(this.host.store.transcriptPath(sessionId));
    const forked = createSession({
      callbacks: this.createSessionCreationCallbacks(),
      projectRoot: projectRoot ?? source.projectRoot,
      options: {
        ...(source.title ? { title: source.title } : {}),
        parentSession: source.id,
      },
    });
    const transcriptPath = this.host.store.transcriptPath(forked.id);
    for (const event of events) {
      appendTranscriptEvent(transcriptPath, event);
    }
    return forked;
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
      loadRecoverySnapshot: () => buildRecoverySnapshotForSession({
        sessionId: session.id,
        session,
        state: this.host.store.readStateSnapshotRequired(this.host.store.statePath(session.id)),
        transcriptEvents: this.getTranscriptEvents(session.id),
      }),
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
