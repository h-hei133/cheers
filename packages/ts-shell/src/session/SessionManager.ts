/**
 * SessionManager - directory-based session substrate
 *
 * Layout per session:
 * - metadata.json   -> identity + timestamps
 * - transcript.jsonl -> append-only events/messages
 * - state.json      -> mutable runtime state snapshot
 */

import * as fs from "node:fs";
import type { QueryEvent } from "../core/query/events.js";
import type {
  QueryRuntimeRecoveryBoundary,
  QueryRuntimeStateSeed,
} from "../core/query/runtimeState.js";
import {
  createEmptyLifecycleIndex,
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
import {
  createLifecycleTranscriptEvent,
  createMessageTranscriptEvent,
  type TranscriptEvent,
} from "./sessionEventCodec.js";
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
import { writeJsonFileAtomic } from "./store/sessionFileStore.js";
import {
  deleteSessionRecord,
  loadSessionRecord,
  sessionExistsAtLayout,
  writeSessionMetadataRecord,
  writeSessionRecord,
} from "./store/sessionStore.js";
import {
  readStateSnapshotRequired,
  readStateSnapshotSafely,
  withSessionStateLock,
  writeSessionState,
} from "./store/sessionStateStore.js";
import { projectSessionReentrySummary } from "./presentation/sessionReentrySurface.js";
import type { SessionReentrySummary } from "./presentation/sessionReentrySurface.js";
import {
  formatListSessionsFailureWarning,
  formatUnreadableSessionDirectoryWarning,
} from "./presentation/sessionWarningSurface.js";
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
  projectSessionBinding,
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
  buildReplayPlan,
  normalizeSessionReplayTranscript,
  repairSessionReplayTranscript,
  type ReplayPlan,
  type TranscriptRepairContext,
} from "./replay/sessionReplayFacade.js";
import { buildSessionRuntimeStateSeed } from "./replay/sessionRuntimeSeed.js";

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

export type ResumeResult =
  | { ok: true; session: Session }
  | { ok: false; error: string; recoveryHint: string };

export interface ResumeOptions {
  readonly mode?: "runtime-recovery" | "continuity-only";
}

export class SessionManager {
  private static readonly AUTO_COMPACT_TURN_THRESHOLD = 12;
  private static readonly APPROVAL_AUDIT_HISTORY_LIMIT =
    SESSION_APPROVAL_AUDIT_HISTORY_LIMIT;
  private readonly storeLayout: SessionStoreLayout;
  private sessionsDir: string;
  private readonly currentSessionStorePath: string;
  private readonly warnedUnreadableSessionDirs = new Set<string>();
  private didWarnListSessionsFailure = false;

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

  private getStateLockPath(sessionId: string): string {
    return projectSessionFileLayout({
      sessionsDir: this.sessionsDir,
      sessionId,
    }).stateLockPath;
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
    const normalizedId = validateSessionId(sessionId);
    if (this.sessionExists(normalizedId)) {
      throw new Error(`Session ${normalizedId} already exists`);
    }
    const now = new Date().toISOString();
    const binding = projectSessionBinding({ projectRoot, options });
    const session: Session = {
      id: normalizedId,
      ...binding,
      title: undefined,
      createdAt: now,
      updatedAt: now,
      status: "active",
      turns: [],
    };
    this.writeSession(session);
    this.setCurrentSessionForProject(projectRoot, session.id);
    return session;
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
    const now = new Date().toISOString();
    const binding = projectSessionBinding({ projectRoot, options });
    const session: Session = {
      id: this.generateSessionId(),
      ...binding,
      title: undefined,
      createdAt: now,
      updatedAt: now,
      status: "active",
      turns: [],
    };

    this.writeSession(session);
    this.setCurrentSessionForProject(projectRoot, session.id);
    return session;
  }

  resume(sessionId: string, projectRoot?: string): Session {
    const sessionDir = this.getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      const session = this.load(sessionId);
      if (!session.projectRoot?.trim() && projectRoot?.trim()) {
        session.projectRoot = projectRoot.trim();
      }
      session.status = "active";
      session.updatedAt = new Date().toISOString();
      this.writeSessionMetadata(session);
      this.setCurrentSessionForProject(
        session.projectRoot || projectRoot || process.cwd(),
        session.id,
      );
      return session;
    } catch (error) {
      throw new Error(
        `Failed to resume session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  tryResume(
    sessionId: string,
    projectRoot?: string,
    options?: ResumeOptions,
  ): ResumeResult {
    try {
      const session = this.load(sessionId);
      const mode = options?.mode ?? "runtime-recovery";
      if (mode === "runtime-recovery") {
        const trustBoundary = this.evaluateRecoveryTrustBoundary(session);
        if (!trustBoundary.recoverable && trustBoundary.block) {
          return {
            ok: false,
            error: `Session ${sessionId} is not recoverable: ${trustBoundary.block.detail}`,
            recoveryHint: trustBoundary.block.recoveryHint,
          };
        }
      }

      return { ok: true, session: this.resume(sessionId, projectRoot) };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: errorMessage.includes("Failed to resume session")
          ? errorMessage
          : `Failed to resume session ${sessionId}: ${errorMessage}`,
        recoveryHint: `Session ${sessionId} could not be restored. Start a fresh session or inspect ${this.getSessionDir(sessionId)}.`,
      };
    }
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
    const session = this.load(sessionId);
    session.status = "active";
    delete session.lastError;
    session.pendingPrompt = prompt;
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(
      sessionId,
      createLifecycleTranscriptEvent({
        event: "run-started",
        timestamp: session.updatedAt,
        detail: prompt,
      }),
    );
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
  }

  persistUserPromptBarrier(sessionId: string, prompt: string): void {
    const session = this.load(sessionId);
    const timestamp = new Date().toISOString();
    const nextMessage: SessionMessage & { timestamp: string } = {
      role: "user",
      content: prompt,
      timestamp,
    };

    session.status = "active";
    delete session.lastError;
    session.pendingPrompt = prompt;
    session.updatedAt = timestamp;
    session.turns.push(nextMessage);

    this.appendTranscriptEvent(
      sessionId,
      createLifecycleTranscriptEvent({
        event: "run-started",
        timestamp,
        detail: prompt,
      }),
    );
    this.appendTranscriptEvent(
      sessionId,
      createMessageTranscriptEvent(nextMessage),
    );

    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "prompt-persisted",
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
  }

  markTurnActive(sessionId: string): void {
    const session = this.load(sessionId);
    delete session.lastError;
    session.updatedAt = new Date().toISOString();
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "turn-active",
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
  }

  markRecoveryReentry(
    sessionId: string,
    boundary: QueryRuntimeRecoveryBoundary,
  ): void {
    const session = this.load(sessionId);
    session.status = "active";
    delete session.lastError;
    session.updatedAt = new Date().toISOString();
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase:
        boundary === "mid-turn-reentry" ? "turn-active" : "prompt-persisted",
      interruptedKind: boundary === "mid-turn-reentry" ? "turn" : "prompt",
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
    });
  }

  saveInterrupted(
    sessionId: string,
    interruptedKind: "prompt" | "turn" = "prompt",
  ): void {
    const session = this.load(sessionId);
    session.status = "interrupted";
    delete session.lastError;
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(
      sessionId,
      createLifecycleTranscriptEvent({
        event: "run-interrupted",
        timestamp: session.updatedAt,
        detail: session.pendingPrompt,
      }),
    );
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      interruptedKind,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
    });
  }

  saveCompleted(sessionId: string, terminal?: TerminalPersistence): void {
    const session = this.load(sessionId);
    session.status = "completed";
    delete session.lastError;
    delete session.pendingPrompt;
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(
      sessionId,
      createLifecycleTranscriptEvent({
        event: "run-completed",
        timestamp: session.updatedAt,
      }),
    );
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "idle",
      interruptedKind: undefined,
      terminalReason: terminal?.terminalReason ?? "completed",
      terminalClassification: terminal?.terminalClassification ?? "success",
      lastContinuationReason: terminal?.lastContinuationReason,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
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
    const session = this.load(sessionId);
    const terminalClassification = terminal?.terminalClassification ?? "error";
    session.status = "error";
    delete session.pendingPrompt;
    if (terminalClassification === "stopped") {
      delete session.lastError;
    } else {
      session.lastError = error;
    }
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(
      sessionId,
      createLifecycleTranscriptEvent({
        event: "run-error",
        timestamp: session.updatedAt,
        detail: error,
      }),
    );
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "idle",
      interruptedKind: undefined,
      terminalReason: terminal?.terminalReason,
      terminalClassification,
      lastContinuationReason: terminal?.lastContinuationReason,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
  }

  saveTerminated(sessionId: string): void {
    const session = this.load(sessionId);
    session.status = "terminated";
    delete session.lastError;
    delete session.pendingPrompt;
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(
      sessionId,
      createLifecycleTranscriptEvent({
        event: "run-terminated",
        timestamp: session.updatedAt,
      }),
    );
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "idle",
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
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
    try {
      const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
      const sessions: Session[] = [];
      const newlyUnreadableSessionDirs: string[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        try {
          sessions.push(this.load(entry.name));
        } catch (error) {
          if (!this.warnedUnreadableSessionDirs.has(entry.name)) {
            this.warnedUnreadableSessionDirs.add(entry.name);
            newlyUnreadableSessionDirs.push(entry.name);
          }
        }
      }

      if (newlyUnreadableSessionDirs.length > 0) {
        const warning = formatUnreadableSessionDirectoryWarning({
          sessionDirs: newlyUnreadableSessionDirs,
        });
        if (warning) {
          console.warn(warning);
        }
      }

      return sessions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } catch (error) {
      if (!this.didWarnListSessionsFailure) {
        this.didWarnListSessionsFailure = true;
        console.warn(
          formatListSessionsFailureWarning({
            sessionsDir: this.sessionsDir,
            error,
          }),
        );
      }
      return [];
    }
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
