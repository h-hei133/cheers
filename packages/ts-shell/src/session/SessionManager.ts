/**
 * SessionManager - directory-based session substrate
 *
 * Layout per session:
 * - metadata.json   -> identity + timestamps
 * - transcript.jsonl -> append-only events/messages
 * - state.json      -> mutable runtime state snapshot
 */

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
import { projectSessionReentrySummary } from "./presentation/sessionReentrySurface.js";
import type { SessionReentrySummary } from "./presentation/sessionReentrySurface.js";
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
  appendSessionTurn,
  appendTranscriptEvent,
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
  markSessionRecoveryReentry,
  markSessionRunStarted,
  markSessionTurnActive,
  saveSessionInterrupted,
  saveSessionTerminated,
} from "./lifecycle/sessionLifecycleStore.js";
import { persistSessionUserPromptBarrier } from "./lifecycle/sessionPromptBarrier.js";
import {
  saveSessionCompleted,
  saveSessionError,
} from "./lifecycle/sessionTerminalStore.js";
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

  saveTerminated(sessionId: string): void {
    handleSaveTerminated(this.createSessionLifecycleCallbacks(), sessionId);
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

  listRecentSessions(limit: number = 5): Session[] {
    return this.listSessions().slice(0, limit);
  }

  listRecentProjectContexts(limit: number = 8): ProjectContextSummary[] {
    return projectRecentProjectContexts({
      summaries: this.listSessions().map((session) =>
        this.describeSessionReentry(session.id),
      ),
      limit,
    });
  }

  listReentrySummaries(input?: {
    readonly limit?: number;
    readonly preferredProjectRoot?: string;
  }): SessionReentrySummary[] {
    return projectSortedSessionReentrySummaries({
      summaries: this.listSessions().map((session) =>
        this.describeSessionReentry(session.id),
      ),
      preferredProjectRoot: input?.preferredProjectRoot,
      limit: input?.limit,
    });
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
    const stateSnapshot = this.normalizeLegacyPermissionStateForSession(
      session,
      this.store.readStateSnapshotSafely(this.store.statePath(sessionId)),
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
