/**
 * SessionManager - directory-based session substrate
 *
 * Layout per session:
 * - metadata.json   -> identity + timestamps
 * - transcript.jsonl -> append-only events/messages
 * - state.json      -> mutable runtime state snapshot
 */

import { createComponentLogger } from "../observability/structuredLogger.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type {
  QueryRuntimeRecoveryBoundary,
  QueryRuntimeStateSeed,
} from "../core/query/runtime/state.js";
import {
  type DurableLifecycleIndex,
} from "../core/tools/toolResultLifecycle.js";
import type { ContinuationReason } from "../orchestration/types.js";
import type {
  CurrentSessionSelectionResolution,
} from "./store/currentSelection.js";
import {
  SESSION_APPROVAL_AUDIT_HISTORY_LIMIT,
  recordSessionApprovalAuditDecision,
} from "./approval/sessionApprovalMemory.js";
import { applySessionCompactRetention } from "./sessionCompactModule.js";
import { type TranscriptEvent } from "./sessionEventCodec.js";
import type { SessionMessage } from "./schema/sessionMessage.js";
import type { Session } from "./schema/sessionRecord.js";
import type {
  SessionStateSnapshot,
  SessionStateSnapshotOverrides,
  TerminalPersistence,
} from "./schema/sessionStateSnapshot.js";
import {
  buildSessionStateSnapshot,
} from "./schema/sessionStateSnapshot.js";
import type { RuntimeSeedOptions } from "./replay/builder.js";
import {
  projectSortedSessionReentrySummaries,
  selectRecoveryTrustBoundaryBlock,
  selectSuggestedRecoverySessionIdFromSessions,
} from "./recovery/sessionRecoverySelection.js";
import { projectRecentProjectContexts } from "./recovery/projectContextSummary.js";
import type { ProjectContextSummary } from "./recovery/projectContextSummary.js";
import {
  buildSessionResumeContext,
  buildSessionResumeSnapshot,
} from "./continuation/sessionPromptContinuity.js";
import {
  validateSessionId,
} from "./store/sessionFileLayout.js";
import {
  createSession,
  createSessionWithId,
} from "./store/sessionCreation.js";
import { SessionStoreAccess } from "./store/sessionStoreAccess.js";
import { projectSessionReentrySummary, type SessionReentrySummary } from "./presentation/sessionReentrySurface.js";
import {
  sessionHasConversation,
  sessionHasReentrySurface,
} from "./presentation/sessionReentrySurface.js";
import type { RecoveryTrustBoundaryBlock } from "./recovery/recoveryTrustBoundary.js";
import type {
  SessionResumeEligibility,
} from "./recovery/sessionResumeEligibility.js";
import type {
  ApprovalAuditMemoryState,
  SessionContinuitySnapshot,
} from "./sessionContinuityTypes.js";
import {
  type WorkspaceRootMode,
} from "./store/projectBindingPolicy.js";
import { applySessionWorkspaceBinding } from "./store/sessionProjectBinding.js";
import { buildSessionContinuitySnapshot } from "./continuation/sessionContinuitySnapshot.js";
import { normalizeLegacyPermissionStateForSession } from "./continuation/legacyPermissionRebase.js";
import { extractSeedInfluenceFromQueryResult } from "./continuation/sessionSeedInfluence.js";
import { rebindSessionProjectRootContinuity } from "./continuation/sessionProjectRootRebind.js";
import {
  appendCompactionEvent,
  appendSessionTurn,
  appendTranscriptEvent,
  projectTranscriptMessages,
  readTranscriptEvents,
} from "./transcript/sessionTranscript.js";
import {
  appendSessionQueryEvent,
  applySessionQueryEventToState,
} from "./transcript/sessionQueryEventPersistence.js";
import {
  buildRecoverySnapshotForSession,
  evaluateRecoveryTrustBoundaryForSession,
  projectRecoveryTrustBoundaryBlockForSession,
  reconcilePendingLifecycleForSession,
} from "./recovery/sessionRecoveryRuntime.js";
import type { RecoverySnapshot } from "./recovery/sessionRecoverySnapshot.js";
import {
  resumeSession,
  tryResumeSession,
  type SessionResumeOptions,
  type SessionResumeResult,
} from "./recovery/sessionResume.js";
import {
  type ReplayPlan,
  type TranscriptRepairContext,
} from "./replay/sessionReplayFacade.js";
import {
  buildReplayPlanForSession,
  buildRuntimeStateSeedForSession,
  normalizeReplayTranscript,
  repairReplayTranscript,
} from "./replay/sessionReplayRuntime.js";
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
} from "./agent/lifecycle.js";
import {
  handleAppendQueryEvent,
  handleAppendTranscriptEvent,
  handleApplyQueryEventToState,
  handleGetTranscriptEvents,
} from "./agent/persistence.js";
import { applyAutoCompactRetention } from "./agent/compaction.js";
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
export type {
  ReplayPlan,
  TranscriptRepairContext,
} from "./replay/sessionReplayFacade.js";

export type { WorkspaceRootMode } from "./store/projectBindingPolicy.js";
export type { Session } from "./schema/sessionRecord.js";

export type ResumeResult = SessionResumeResult;

export interface ResumeOptions extends SessionResumeOptions {}

const sessionLogger = createComponentLogger("SessionManager");

export class SessionManager {
  private static readonly AUTO_COMPACT_TURN_THRESHOLD = 12;
  private static readonly APPROVAL_AUDIT_HISTORY_LIMIT =
    SESSION_APPROVAL_AUDIT_HISTORY_LIMIT;
  private readonly store: SessionStoreAccess;

  constructor() {
    this.store = new SessionStoreAccess();
  }

  private createSessionCreationCallbacks() {
    return {
      sessionExists: (sessionId: string) => this.sessionExists(sessionId),
      validateSessionId,
      createSessionId: () => this.store.createSessionId(),
      writeSession: (session: Session) => this.store.writeSession(session),
      setCurrentSessionForProject: (projectRoot: string, sessionId: string) =>
        this.setCurrentSessionForProject(projectRoot, sessionId),
      now: () => new Date().toISOString(),
    };
  }

  private createSessionResumeCallbacks() {
    return {
      sessionDirExists: (sessionId: string) =>
        this.store.sessionExists(sessionId),
      sessionDir: (sessionId: string) => this.store.sessionDir(sessionId),
      loadSession: (sessionId: string) => this.store.load(sessionId),
      writeSessionMetadata: (session: Session) =>
        this.store.writeSessionMetadata(session),
      setCurrentSessionForProject: (projectRoot: string, sessionId: string) =>
        this.setCurrentSessionForProject(projectRoot, sessionId),
      evaluateRecoveryTrustBoundary: (session: Session) =>
        this.evaluateRecoveryTrustBoundary(session),
      cwd: () => process.cwd(),
      now: () => new Date().toISOString(),
    };
  }

  private createSessionLifecycleCallbacks() {
    return {
      loadSession: (sessionId: string) => this.store.load(sessionId),
      appendTranscriptEvent: (sessionId: string, event: TranscriptEvent) =>
        this.appendTranscriptEvent(sessionId, event),
      writeSessionMetadata: (session: Session) =>
        this.store.writeSessionMetadata(session),
      writeSessionState: (
        session: Session,
        overrides?: SessionStateSnapshotOverrides,
      ) => this.store.writeSessionState(session, overrides),
      now: () => new Date().toISOString(),
    };
  }

  getSessionFilePath(sessionId: string): string {
    return this.store.metadataPath(sessionId);
  }

  getSessionDirPath(sessionId: string): string {
    return this.store.sessionDir(sessionId);
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
  private listRealSessions(): Session[] {
    return this.listSessions().filter((session) => sessionHasReentrySurface(session));
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
   * Returns how many turns were dropped.
   */
  rewindTo(sessionId: string, turnIndex: number): number {
    const session = this.getSession(sessionId);
    if (!session) return 0;
    const keep = Math.max(0, Math.min(turnIndex, session.turns.length));
    const dropped = session.turns.length - keep;
    if (dropped <= 0) return 0;
    session.turns = session.turns.slice(0, keep);
    session.updatedAt = new Date().toISOString();
    this.store.writeSessionMetadata(session);
    return dropped;
  }
  /** The stored record, or undefined when it is gone or unreadable. */
  getSession(sessionId: string): Session | undefined {
    try {
      return this.store.load(sessionId);
    } catch (error) {
      sessionLogger.warn("Failed to load session", { sessionId, error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }

  sessionExists(sessionId: string): boolean {
    return this.store.sessionExists(sessionId);
  }

  getCurrentSessionForProject(projectRoot: string): Session | null {
    return this.store.getCurrentSessionForProject(projectRoot);
  }

  resolveCurrentSessionForProject(
    projectRoot: string,
  ): CurrentSessionSelectionResolution {
    return this.store.resolveCurrentSessionForProject(projectRoot);
  }

  setCurrentSessionForProject(projectRoot: string, sessionId: string): void {
    this.store.setCurrentSessionForProject(projectRoot, sessionId);
  }

  clearCurrentSessionForProject(projectRoot: string): void {
    this.store.clearCurrentSessionForProject(projectRoot);
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

  addTurn(sessionId: string, message: SessionMessage): void {
    handleAddTurn(this.createSessionLifecycleCallbacks(), sessionId, message);
  }

  recordApprovalAuditDecision(
    sessionId: string,
    decision: Omit<ApprovalAuditMemoryState, "recordedAt"> & {
      readonly recordedAt?: string;
    },
  ): void {
    const session = this.store.load(sessionId);
    const statePath = this.store.statePath(session.id);
    recordSessionApprovalAuditDecision({
      session,
      decision,
      recordedAt: decision.recordedAt ?? new Date().toISOString(),
      historyLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT,
      withStateLock: (targetSessionId, update) =>
        this.store.withSessionStateLock(targetSessionId, update),
      readCurrentSnapshot: () => this.store.readStateSnapshotSafely(statePath),
      buildSnapshot: (current) => this.buildSessionStateSnapshot(session, current),
      writeSnapshot: (snapshot) => this.store.writeJsonFileAtomic(statePath, snapshot),
    });
  }

  markRunStarted(sessionId: string, prompt: string): void {
    handleMarkRunStarted(this.createSessionLifecycleCallbacks(), sessionId, prompt);
  }

  persistUserPromptBarrier(sessionId: string, prompt: string): void {
    handlePersistUserPromptBarrier(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      prompt,
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


  renameSession(sessionId: string, title: string): Session {
    const session = this.store.load(sessionId);
    const normalized = title.trim();
    session.title = normalized.length > 0 ? normalized : undefined;
    session.updatedAt = new Date().toISOString();
    this.store.writeSessionMetadata(session);
    return session;
  }

  deleteSession(sessionId: string): void {
    this.store.deleteSession(sessionId);
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
      session = this.store.load(sessionId);
    } catch (error) {
      sessionLogger.warn("Failed to load session for discard check", { sessionId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
    if (sessionHasConversation(session)) return false;
    const projectRoot = session.projectRoot;
    this.store.deleteSession(sessionId);
    // The pointer must not outlive the record it points at.
    const current = projectRoot ? this.store.getCurrentSessionForProject(projectRoot) : null;
    if (current?.id === sessionId) this.store.clearCurrentSessionForProject(projectRoot);
    return true;
  }


  reconcilePendingLifecycle(sessionId: string): DurableLifecycleIndex {
    const snapshot = this.getRecoverySnapshot(sessionId);
    return reconcilePendingLifecycleForSession({
      snapshot,
      transcriptEvents: this.getTranscriptEvents(sessionId),
      applyQueryEventToState: (event) =>
        this.applyQueryEventToState(sessionId, event),
      appendQueryEvent: (event) => this.appendQueryEvent(sessionId, event),
      readPendingLifecycle: () =>
        this.getRecoverySnapshot(sessionId).pendingLifecycle,
    });
  }

  appendQueryEvent(sessionId: string, event: QueryEvent): void {
    handleAppendQueryEvent(this.store, sessionId, event);
  }

  getTranscriptEvents(sessionId: string): TranscriptEvent[] {
    return handleGetTranscriptEvents(this.store, sessionId);
  }
  appendCompactionEntry(
    sessionId: string,
    input: {
      readonly summary: string;
      readonly firstKeptEntryId?: string;
      readonly keptMessages?: number;
      readonly tokensBefore?: number;
    },
  ): void {
    const transcriptPath = this.store.transcriptPath(sessionId);
    appendCompactionEvent(transcriptPath, {
      ...input,
      timestamp: new Date().toISOString(),
    });
  }

  loadSessionMessages(sessionId: string): SessionMessage[] {
    const events = this.getTranscriptEvents(sessionId);
    return projectTranscriptMessages(events);
  }
  getRecoverySnapshot(sessionId: string): RecoverySnapshot {
    return buildRecoverySnapshotForSession({
      sessionId,
      session: this.store.load(sessionId),
      state: this.store.readStateSnapshotRequired(this.store.statePath(sessionId)),
      transcriptEvents: this.getTranscriptEvents(sessionId),
    });
  }

  normalizeTranscriptEvents(events: TranscriptEvent[]): TranscriptEvent[] {
    return normalizeReplayTranscript(events);
  }

  repairTranscriptEvents(
    events: TranscriptEvent[],
    context: TranscriptRepairContext,
  ): TranscriptEvent[] {
    return repairReplayTranscript(events, context);
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

  listSessions(): Session[] {
    return this.store.listSessions();
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
    return withContent ? this.store.load(withContent.id) : null;
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
    return sessionId ? this.store.load(sessionId) : null;
  }

  rebindSessionProjectRoot(sessionId: string, nextProjectRoot: string): Session {
    const session = this.store.load(sessionId);
    const statePath = this.store.statePath(session.id);
    const rebound = rebindSessionProjectRootContinuity({
      session,
      nextProjectRoot,
      updatedAt: new Date().toISOString(),
      writeSessionMetadata: (nextSession) =>
        this.store.writeSessionMetadata(nextSession),
      withStateLock: (targetSessionId, update) =>
        this.store.withSessionStateLock(targetSessionId, update),
      readStateSnapshot: () => this.store.readStateSnapshotSafely(statePath),
      buildStateSnapshot: (nextSession, current) =>
        this.buildSessionStateSnapshot(nextSession, current),
      writeStateSnapshot: (snapshot) =>
        this.store.writeJsonFileAtomic(statePath, snapshot),
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
    const session = this.store.load(sessionId);
    applySessionWorkspaceBinding({
      session,
      binding,
      updatedAt: new Date().toISOString(),
    });
    this.store.writeSessionMetadata(session);
    this.store.writeSessionState(session);
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
    const session = this.store.load(sessionId);
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
    const session = this.store.load(sessionId);
    return this.evaluateRecoveryTrustBoundary(session);
  }

  buildContinuitySnapshot(sessionId: string): SessionContinuitySnapshot {
    const session = this.store.load(sessionId);
    const statePath = this.store.statePath(sessionId);
    const stateSnapshot = this.normalizeLegacyPermissionStateForSession(
      session,
      this.store.readStateSnapshotSafely(statePath),
    );
    return buildSessionContinuitySnapshot({
      session,
      stateSnapshot,
      recoverySnapshot: this.getRecoverySnapshot(sessionId),
      transcriptEvents: this.getTranscriptEvents(sessionId),
      approvalHistoryLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT,
    });
  }

  private normalizeLegacyPermissionStateForSession(
    session: Session,
    snapshot: SessionStateSnapshot | undefined,
  ): SessionStateSnapshot | undefined {
    const statePath = this.store.statePath(session.id);
    return normalizeLegacyPermissionStateForSession({
      session,
      snapshot,
      withStateLock: (targetSessionId, update) =>
        this.store.withSessionStateLock(targetSessionId, update),
      readLatestSnapshot: () => this.store.readStateSnapshotSafely(statePath),
      writeSnapshot: (nextSnapshot) =>
        this.store.writeJsonFileAtomic(statePath, nextSnapshot),
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
      sessionDir: this.store.sessionDir(session.id),
      reason,
      detail,
    });
  }

  private appendTranscriptEvent(
    sessionId: string,
    event: TranscriptEvent,
  ): void {
    handleAppendTranscriptEvent(this.store, sessionId, event);
  }

  private applyQueryEventToState(sessionId: string, event: QueryEvent): void {
    handleApplyQueryEventToState(this.store, sessionId, event);
  }

  private applyAutoCompactRetention(
    workingMemory: unknown,
    event: QueryEvent,
  ): unknown {
    return applyAutoCompactRetention(workingMemory, event);
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
