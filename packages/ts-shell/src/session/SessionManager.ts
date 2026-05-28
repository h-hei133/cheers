/**
 * SessionManager - directory-based session substrate
 *
 * Layout per session:
 * - metadata.json   -> identity + timestamps
 * - transcript.jsonl -> append-only events/messages
 * - state.json      -> mutable runtime state snapshot
 */

import type { QueryEvent } from "../core/query/events.js";
import type {
  QueryRuntimeRecoveryBoundary,
  QueryRuntimeStateSeed,
} from "../core/query/runtimeState.js";
import {
  type DurableLifecycleIndex,
} from "../core/tools/toolResultLifecycle.js";
import type { ContinuationReason } from "../orchestration/types.js";
import type {
  CurrentSessionSelectionResolution,
} from "./currentSessionSelection.js";
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
import {
  clearCurrentSessionSelectionForProject,
  resolveCurrentSessionForProject as resolveCurrentSessionFromRegistry,
  setCurrentSessionSelection,
} from "./store/currentSessionRegistry.js";
import type { RuntimeSeedOptions } from "./sessionReplayBuilder.js";
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
  createSessionId,
  createSessionStoreLayout,
  ensureSessionStoreLayout,
  projectSessionFileLayout,
  validateSessionId,
  type SessionStoreLayout,
} from "./store/sessionFileLayout.js";
import {
  createSession,
  createSessionWithId,
} from "./store/sessionCreation.js";
import { writeJsonFileAtomic } from "./store/sessionFileStore.js";
import {
  deleteSessionRecord,
  loadSessionRecord,
  sessionExistsAtLayout,
  writeSessionMetadataRecord,
  writeSessionRecord,
} from "./store/sessionStore.js";
import {
  listSessionRecords,
  type SessionListWarningState,
} from "./store/sessionListStore.js";
import {
  readStateSnapshotRequired,
  readStateSnapshotSafely,
  withSessionStateLock,
  writeSessionState,
} from "./store/sessionStateStore.js";
import { projectSessionReentrySummary } from "./presentation/sessionReentrySurface.js";
import type { SessionReentrySummary } from "./presentation/sessionReentrySurface.js";
import type { RecoveryTrustBoundaryBlock } from "./recovery/recoveryTrustBoundary.js";
import { projectRecoveryTrustBoundaryBlock } from "./recovery/recoveryTrustBoundary.js";
import {
  evaluateSessionResumeEligibility,
  type SessionResumeEligibility,
} from "./recovery/sessionResumeEligibility.js";
import type {
  ApprovalAuditMemoryState,
  SessionContinuitySnapshot,
} from "./sessionContinuityTypes.js";
import {
  type WorkspaceRootMode,
} from "./projectBindingPolicy.js";
import {
  projectRebasedSessionRoot,
  projectSessionRootRebase,
} from "./continuation/sessionRootRebase.js";
import { applySessionWorkspaceBinding } from "./store/sessionProjectBinding.js";
import { buildSessionContinuitySnapshot } from "./continuation/sessionContinuitySnapshot.js";
import { normalizeLegacyPermissionStateForSession } from "./continuation/legacyPermissionRebase.js";
import { extractSeedInfluenceFromQueryResult } from "./continuation/sessionSeedInfluence.js";
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
  findCompensatedLifecycleEvent,
} from "./recovery/sessionLifecycleReadModel.js";
import { reconcileSessionPendingLifecycle } from "./recovery/sessionLifecycleReconciliation.js";
import {
  buildSessionRecoverySnapshot,
  type RecoverySnapshot,
} from "./recovery/sessionRecoverySnapshot.js";
import {
  resumeSession,
  tryResumeSession,
  type SessionResumeOptions,
  type SessionResumeResult,
} from "./recovery/sessionResume.js";
import {
  buildReplayPlan,
  normalizeSessionReplayTranscript,
  repairSessionReplayTranscript,
  type ReplayPlan,
  type TranscriptRepairContext,
} from "./replay/sessionReplayFacade.js";
import { buildSessionRuntimeStateSeed } from "./replay/sessionRuntimeSeed.js";
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

export type { CurrentSessionSelectionResolution } from "./currentSessionSelection.js";
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

export type { WorkspaceRootMode } from "./projectBindingPolicy.js";
export type { Session } from "./schema/sessionRecord.js";

export type ResumeResult = SessionResumeResult;

export interface ResumeOptions extends SessionResumeOptions {}

export class SessionManager {
  private static readonly AUTO_COMPACT_TURN_THRESHOLD = 12;
  private static readonly APPROVAL_AUDIT_HISTORY_LIMIT =
    SESSION_APPROVAL_AUDIT_HISTORY_LIMIT;
  private readonly storeLayout: SessionStoreLayout;
  private sessionsDir: string;
  private readonly currentSessionStorePath: string;
  private readonly listWarningState: SessionListWarningState = {
    warnedUnreadableSessionDirs: new Set<string>(),
    didWarnListSessionsFailure: false,
  };

  constructor() {
    this.storeLayout = createSessionStoreLayout();
    this.sessionsDir = this.storeLayout.sessionsDir;
    this.currentSessionStorePath = this.storeLayout.currentSessionStorePath;
    this.ensureSessionsDir();
  }

  private ensureSessionsDir(): void {
    ensureSessionStoreLayout(this.storeLayout);
  }

  private generateSessionId(): string {
    return createSessionId();
  }

  private getSessionDir(sessionId: string): string {
    return projectSessionFileLayout({
      sessionsDir: this.sessionsDir,
      sessionId,
    }).sessionDir;
  }

  private getMetadataPath(sessionId: string): string {
    return projectSessionFileLayout({
      sessionsDir: this.sessionsDir,
      sessionId,
    }).metadataPath;
  }

  private getTranscriptPath(sessionId: string): string {
    return projectSessionFileLayout({
      sessionsDir: this.sessionsDir,
      sessionId,
    }).transcriptPath;
  }

  private getStatePath(sessionId: string): string {
    return projectSessionFileLayout({
      sessionsDir: this.sessionsDir,
      sessionId,
    }).statePath;
  }

  private createSessionCreationCallbacks() {
    return {
      sessionExists: (sessionId: string) => this.sessionExists(sessionId),
      validateSessionId,
      createSessionId: () => this.generateSessionId(),
      writeSession: (session: Session) => this.writeSession(session),
      setCurrentSessionForProject: (projectRoot: string, sessionId: string) =>
        this.setCurrentSessionForProject(projectRoot, sessionId),
      now: () => new Date().toISOString(),
    };
  }

  private createSessionResumeCallbacks() {
    return {
      sessionDirExists: (sessionId: string) =>
        sessionExistsAtLayout(
          projectSessionFileLayout({
            sessionsDir: this.sessionsDir,
            sessionId,
          }),
        ),
      sessionDir: (sessionId: string) => this.getSessionDir(sessionId),
      loadSession: (sessionId: string) => this.load(sessionId),
      writeSessionMetadata: (session: Session) =>
        this.writeSessionMetadata(session),
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
      loadSession: (sessionId: string) => this.load(sessionId),
      appendTranscriptEvent: (sessionId: string, event: TranscriptEvent) =>
        this.appendTranscriptEvent(sessionId, event),
      writeSessionMetadata: (session: Session) =>
        this.writeSessionMetadata(session),
      writeSessionState: (
        session: Session,
        overrides?: SessionStateSnapshotOverrides,
      ) => this.writeSessionState(session, overrides),
      now: () => new Date().toISOString(),
    };
  }

  getSessionFilePath(sessionId: string): string {
    return this.getMetadataPath(sessionId);
  }

  getSessionDirPath(sessionId: string): string {
    return this.getSessionDir(sessionId);
  }

  sessionExists(sessionId: string): boolean {
    if (!sessionId?.trim()) {
      return false;
    }
    return sessionExistsAtLayout(
      projectSessionFileLayout({
        sessionsDir: this.sessionsDir,
        sessionId: sessionId.trim(),
      }),
    );
  }

  getCurrentSessionForProject(projectRoot: string): Session | null {
    const resolution = this.resolveCurrentSessionForProject(projectRoot);
    return resolution.ok ? resolution.session : null;
  }

  resolveCurrentSessionForProject(
    projectRoot: string,
  ): CurrentSessionSelectionResolution {
    return resolveCurrentSessionFromRegistry({
      storePath: this.currentSessionStorePath,
      projectRoot,
      sessionExists: (sessionId) => this.sessionExists(sessionId),
      loadSession: (sessionId) => this.load(sessionId),
    });
  }

  setCurrentSessionForProject(projectRoot: string, sessionId: string): void {
    setCurrentSessionSelection({
      storePath: this.currentSessionStorePath,
      projectRoot,
      sessionId,
      updatedAt: new Date().toISOString(),
    });
  }

  clearCurrentSessionForProject(projectRoot: string): void {
    clearCurrentSessionSelectionForProject({
      storePath: this.currentSessionStorePath,
      projectRoot,
    });
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
    const session = this.load(sessionId);
    appendSessionTurn({
      session,
      message,
      timestamp: new Date().toISOString(),
      append: (event) => this.appendTranscriptEvent(sessionId, event),
      writeMetadata: (nextSession) => this.writeSessionMetadata(nextSession),
      writeState: (nextSession) => this.writeSessionState(nextSession),
    });
  }

  recordApprovalAuditDecision(
    sessionId: string,
    decision: Omit<ApprovalAuditMemoryState, "recordedAt"> & {
      readonly recordedAt?: string;
    },
  ): void {
    const session = this.load(sessionId);
    const statePath = this.getStatePath(session.id);
    recordSessionApprovalAuditDecision({
      session,
      decision,
      recordedAt: decision.recordedAt ?? new Date().toISOString(),
      historyLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT,
      withStateLock: (targetSessionId, update) =>
        this.withSessionStateLock(targetSessionId, update),
      readCurrentSnapshot: () => this.readStateSnapshotSafely(statePath),
      buildSnapshot: (current) => this.buildSessionStateSnapshot(session, current),
      writeSnapshot: (snapshot) => this.writeJsonFileAtomic(statePath, snapshot),
    });
  }

  markRunStarted(sessionId: string, prompt: string): void {
    markSessionRunStarted(this.createSessionLifecycleCallbacks(), sessionId, prompt);
  }

  persistUserPromptBarrier(sessionId: string, prompt: string): void {
    const session = this.load(sessionId);
    const timestamp = new Date().toISOString();
    persistSessionUserPromptBarrier({
      session,
      prompt,
      timestamp,
      appendTranscriptEvent: (event) =>
        this.appendTranscriptEvent(sessionId, event),
      writeSessionMetadata: (nextSession) =>
        this.writeSessionMetadata(nextSession),
      writeSessionState: (nextSession, overrides) =>
        this.writeSessionState(nextSession, overrides),
    });
  }

  markTurnActive(sessionId: string): void {
    markSessionTurnActive(this.createSessionLifecycleCallbacks(), sessionId);
  }

  markRecoveryReentry(
    sessionId: string,
    boundary: QueryRuntimeRecoveryBoundary,
  ): void {
    markSessionRecoveryReentry(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      boundary,
    );
  }

  saveInterrupted(
    sessionId: string,
    interruptedKind: "prompt" | "turn" = "prompt",
  ): void {
    saveSessionInterrupted(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      interruptedKind,
    );
  }

  saveCompleted(sessionId: string, terminal?: TerminalPersistence): void {
    saveSessionCompleted(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      terminal,
    );
  }

  renameSession(sessionId: string, title: string): Session {
    const session = this.load(sessionId);
    const normalized = title.trim();
    session.title = normalized.length > 0 ? normalized : undefined;
    session.updatedAt = new Date().toISOString();
    this.writeSessionMetadata(session);
    return session;
  }

  deleteSession(sessionId: string): void {
    deleteSessionRecord({
      sessionId,
      layout: projectSessionFileLayout({
        sessionsDir: this.sessionsDir,
        sessionId,
      }),
    });
  }

  saveError(
    sessionId: string,
    error: string,
    terminal?: TerminalPersistence,
  ): void {
    saveSessionError(
      this.createSessionLifecycleCallbacks(),
      sessionId,
      error,
      terminal,
    );
  }

  saveTerminated(sessionId: string): void {
    saveSessionTerminated(this.createSessionLifecycleCallbacks(), sessionId);
  }

  reconcilePendingLifecycle(sessionId: string): DurableLifecycleIndex {
    const snapshot = this.getRecoverySnapshot(sessionId);
    return reconcileSessionPendingLifecycle({
      snapshot,
      findCompensatedLifecycleEvent: (input) =>
        this.findCompensatedLifecycleEvent(sessionId, input),
      applyQueryEventToState: (event) =>
        this.applyQueryEventToState(sessionId, event),
      appendQueryEvent: (event) => this.appendQueryEvent(sessionId, event),
      readPendingLifecycle: () =>
        this.getRecoverySnapshot(sessionId).pendingLifecycle,
    });
  }

  appendQueryEvent(sessionId: string, event: QueryEvent): void {
    appendSessionQueryEvent({
      event,
      timestamp: new Date().toISOString(),
      transcriptEvents: this.getTranscriptEvents(sessionId),
      appendTranscriptEvent: (transcriptEvent) =>
        this.appendTranscriptEvent(sessionId, transcriptEvent),
      applyQueryEventToState: (queryEvent) =>
        this.applyQueryEventToState(sessionId, queryEvent),
    });
  }

  getTranscriptEvents(sessionId: string): TranscriptEvent[] {
    return readTranscriptEvents(this.getTranscriptPath(sessionId));
  }

  getRecoverySnapshot(sessionId: string): RecoverySnapshot {
    return buildSessionRecoverySnapshot({
      sessionId,
      session: this.load(sessionId),
      state: this.readStateSnapshotRequired(this.getStatePath(sessionId)),
      transcriptEvents: this.getTranscriptEvents(sessionId),
    });
  }

  normalizeTranscriptEvents(events: TranscriptEvent[]): TranscriptEvent[] {
    return normalizeSessionReplayTranscript(events);
  }

  repairTranscriptEvents(
    events: TranscriptEvent[],
    context: TranscriptRepairContext,
  ): TranscriptEvent[] {
    return repairSessionReplayTranscript(events, context);
  }

  getReplayPlan(sessionId: string): ReplayPlan {
    return buildReplayPlan(this.getRecoverySnapshot(sessionId));
  }

  buildRuntimeStateSeed(
    sessionId: string,
    options: RuntimeSeedOptions = {},
  ): QueryRuntimeStateSeed {
    return buildSessionRuntimeStateSeed({
      sessionId,
      snapshot: this.getRecoverySnapshot(sessionId),
      options,
    });
  }

  listSessions(): Session[] {
    return listSessionRecords({
      sessionsDir: this.sessionsDir,
      loadSession: (sessionId) => this.load(sessionId),
      warningState: this.listWarningState,
      warn: (message) => console.warn(message),
    });
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
    return sessionId ? this.load(sessionId) : null;
  }

  rebindSessionProjectRoot(sessionId: string, nextProjectRoot: string): Session {
    const session = this.load(sessionId);
    const previousRoot = session.projectRoot;
    const normalizedRoot = projectRebasedSessionRoot(nextProjectRoot);
    session.projectRoot = normalizedRoot;
    session.updatedAt = new Date().toISOString();
    this.writeSessionMetadata(session);
    this.withSessionStateLock(session.id, () => {
      const statePath = this.getStatePath(session.id);
      const current = this.readStateSnapshotSafely(statePath);
      if (!current) {
        this.writeJsonFileAtomic(
          statePath,
          this.buildSessionStateSnapshot(session, undefined),
        );
        return;
      }

      const currentRebaseProjection = projectSessionRootRebase({
        workingMemory: current.workingMemory,
        previousRoot,
        nextProjectRoot,
      });

      this.writeJsonFileAtomic(statePath, {
        ...current,
        projectRoot: currentRebaseProjection.projectRoot,
        ...(currentRebaseProjection.workingMemory !== undefined
          ? {
              workingMemory: currentRebaseProjection.workingMemory,
            }
          : {}),
      } satisfies SessionStateSnapshot);
    });
    this.setCurrentSessionForProject(normalizedRoot, session.id);
    return session;
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
    const session = this.load(sessionId);
    applySessionWorkspaceBinding({
      session,
      binding,
      updatedAt: new Date().toISOString(),
    });
    this.writeSessionMetadata(session);
    this.writeSessionState(session);
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
    const session = this.load(sessionId);
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
    const session = this.load(sessionId);
    return this.evaluateRecoveryTrustBoundary(session);
  }

  buildContinuitySnapshot(sessionId: string): SessionContinuitySnapshot {
    const session = this.load(sessionId);
    const stateSnapshot = this.normalizeLegacyPermissionStateForSession(
      session,
      this.readStateSnapshotSafely(this.getStatePath(sessionId)),
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
    const statePath = this.getStatePath(session.id);
    return normalizeLegacyPermissionStateForSession({
      session,
      snapshot,
      withStateLock: (targetSessionId, update) =>
        this.withSessionStateLock(targetSessionId, update),
      readLatestSnapshot: () => this.readStateSnapshotSafely(statePath),
      writeSnapshot: (nextSnapshot) =>
        this.writeJsonFileAtomic(statePath, nextSnapshot),
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
    return evaluateSessionResumeEligibility({
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
    return projectRecoveryTrustBoundaryBlock({
      sessionId: session.id,
      sessionDir: this.getSessionDir(session.id),
      reason,
      detail,
    });
  }

  private writeSession(session: Session): void {
    writeSessionRecord({
      session,
      layout: projectSessionFileLayout({
        sessionsDir: this.sessionsDir,
        sessionId: session.id,
      }),
    });
  }

  private writeSessionMetadata(session: Session): void {
    writeSessionMetadataRecord({
      session,
      layout: projectSessionFileLayout({
        sessionsDir: this.sessionsDir,
        sessionId: session.id,
      }),
    });
  }

  private writeSessionState(
    session: Session,
    overrides?: SessionStateSnapshotOverrides,
  ): void {
    writeSessionState({
      session,
      layout: projectSessionFileLayout({
        sessionsDir: this.sessionsDir,
        sessionId: session.id,
      }),
      overrides,
    });
  }

  private appendTranscriptEvent(
    sessionId: string,
    event: TranscriptEvent,
  ): void {
    appendTranscriptEvent(this.getTranscriptPath(sessionId), event);
  }

  private findCompensatedLifecycleEvent(
    sessionId: string,
    input:
      | { type: "approval.resolved"; taskId: string; toolName: string }
      | { type: "tool.result"; taskId: string; toolName: string },
  ):
    | Extract<QueryEvent, { type: "approval.resolved" | "tool.result" }>
    | undefined {
    return findCompensatedLifecycleEvent(this.getTranscriptEvents(sessionId), input);
  }

  private applyQueryEventToState(sessionId: string, event: QueryEvent): void {
    const session = this.load(sessionId);
    applySessionQueryEventToState({
      session,
      event,
      withSessionStateLock: (write) => this.withSessionStateLock(sessionId, write),
      readCurrentState: () =>
        this.readStateSnapshotSafely(this.getStatePath(sessionId)),
      buildSessionStateSnapshot: (nextSession, current, overrides) =>
        this.buildSessionStateSnapshot(nextSession, current, overrides),
      applyAutoCompactRetention: (workingMemory, queryEvent) =>
        this.applyAutoCompactRetention(workingMemory, queryEvent),
      writeSnapshot: (snapshot) =>
        this.writeJsonFileAtomic(this.getStatePath(sessionId), snapshot),
    });
  }

  private applyAutoCompactRetention(
    workingMemory: unknown,
    event: QueryEvent,
  ): unknown {
    return applySessionCompactRetention({
      workingMemory,
      event,
      turnThreshold: SessionManager.AUTO_COMPACT_TURN_THRESHOLD,
      historyLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT,
      now: new Date().toISOString(),
      seedInfluence: extractSeedInfluenceFromQueryResult(
        event.type === "query.completed" ? event.result : undefined,
      ),
    });
  }
  private load(sessionId: string): Session {
    return loadSessionRecord({
      sessionId,
      layout: projectSessionFileLayout({
        sessionsDir: this.sessionsDir,
        sessionId,
      }),
      cwd: process.cwd(),
    });
  }

  private readStateSnapshotSafely(
    statePath: string,
  ): SessionStateSnapshot | undefined {
    return readStateSnapshotSafely(statePath);
  }

  private readStateSnapshotRequired(statePath: string): SessionStateSnapshot {
    return readStateSnapshotRequired(statePath);
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

  private withSessionStateLock<T>(sessionId: string, action: () => T): T {
    return withSessionStateLock(
      projectSessionFileLayout({
        sessionsDir: this.sessionsDir,
        sessionId,
      }),
      action,
    );
  }

  private writeJsonFileAtomic(filePath: string, payload: unknown): void {
    writeJsonFileAtomic(filePath, payload);
  }
}
