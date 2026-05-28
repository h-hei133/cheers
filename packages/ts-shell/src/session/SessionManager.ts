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
import type {
  CodingResultSummary,
  CodingWriteEffect,
  ContinuationReason,
  TerminalClassification,
  TerminalReason,
} from "../orchestration/types.js";
import { deriveActionableFailureContinuity } from "./actionableFailureContinuity.js";
import {
  projectApprovalAudit,
} from "./approvalAuditProjection.js";
import {
  decodeApprovalMemory,
  decodeApprovalMemoryHistory,
} from "./approvalMemoryCodec.js";
import type {
  CurrentSessionSelectionResolution,
} from "./currentSessionSelection.js";
import { buildMutationContinuityState } from "./mutationContinuityState.js";
import {
  projectApprovalMemoryPersistence,
} from "./sessionApprovalMemoryModule.js";
import { applySessionCompactRetention } from "./sessionCompactModule.js";
import {
  hasContinuationEvidence as snapshotHasContinuationEvidence,
  hasDeterministicTerminalEvidence as snapshotHasDeterministicTerminalEvidence,
  selectContinuationEvidenceForSnapshot,
} from "./sessionContinuationProjection.js";
import {
  createLifecycleTranscriptEvent,
  createMessageTranscriptEvent,
  type TranscriptEvent,
} from "./sessionEventCodec.js";
import {
  collectRecentCodingResults,
  compactContinuityText,
  extractGroundedDeliverableMode,
  extractLastAnswerDefect,
  extractLastReadDeliveredLines,
  extractLastReadFragment,
  extractLastReadWindow,
  extractSeedInfluenceFromStrings,
  extractStagedRepairProgress,
  extractSummaryBoolean,
  extractSummaryString,
  findLastCodingCompletionEvent,
  findLastLifecycleEvent,
  findLastQueryCompletionEvent,
  findLastTurnContent,
  normalizeOptionalBoolean,
  normalizeOptionalString,
  normalizeWriteEffect,
  parseSeedInfluence,
} from "./sessionContinuityModule.js";
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
  projectRecentProjectContexts,
  projectSortedSessionReentrySummaries,
  selectRecoveryTrustBoundaryBlock,
  selectSuggestedRecoverySessionIdFromSessions,
} from "./sessionRecoverySelection.js";
import {
  buildActionHandoffSummary,
  buildSeedInfluenceHandoffSummary,
  buildSessionResumeContext,
  buildSessionResumeSnapshot,
  buildSuccessHandoffDiagnostic,
} from "./sessionResumeContextBuilder.js";
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
import {
  projectRecoveryTrustBoundaryBlock,
  projectSessionReentrySummary,
} from "./sessionSummaryProjection.js";
import type {
  ApprovalAuditMemoryState,
  PermissionRequestMemoryState,
  RequestScopeMemoryState,
  SeedInfluenceDiagnostic,
  SessionContinuitySnapshot,
} from "./sessionContinuityTypes.js";
import {
  extractLastPermissionRequestFromEvidence,
  extractLastRequestScopeFromEvidence,
  parsePermissionRequestMemory,
  parseRequestScopeMemory,
  resolvePermissionRequestMemory,
  resolveRequestScopeMemory,
} from "./permissionRequestMemoryCodec.js";
import {
  normalizeProjectBinding,
  projectSessionBinding,
  type WorkspaceRootMode,
} from "./projectBindingPolicy.js";
import {
  normalizeLegacyPermissionWorkingMemory,
  projectRebasedSessionRoot,
  projectRootRebase,
} from "./projectRootRebaseProjection.js";
import {
  deriveStoppedSessionContinuitySurface,
} from "./stoppedSessionContinuity.js";
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
  ReplayPlan,
  TranscriptRepairContext,
} from "./replay/sessionReplayFacade.js";

export type { WorkspaceRootMode } from "./projectBindingPolicy.js";
export type { Session } from "./schema/sessionRecord.js";

export interface SessionReentrySummary {
  readonly id: string;
  readonly title?: string;
  readonly status: Session["status"];
  readonly projectRoot: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pendingPrompt?: string;
  readonly runPhase?: "idle" | "prompt-persisted" | "turn-active";
  readonly lastError?: string;
  readonly durableStatus?: "success" | "stopped" | "error";
  readonly terminalReason?: TerminalReason;
  readonly terminalClassification?: TerminalClassification;
  readonly lastUserMessage?: string;
  readonly lastAssistantMessage?: string;
  readonly recoverable: boolean;
  readonly resumeDisposition:
    | "fully-resumable"
    | "partially-resumable"
    | "not-resumable";
  readonly autoResumeReady: boolean;
  readonly resumeDetail: string;
  readonly stagedRepairStepCount?: number;
  readonly stagedRepairCompletedStep?: number;
  readonly stagedRepairBlockedStep?: number;
  readonly stagedRepairNextStep?: number;
  readonly blockedReason?: RecoveryTrustBoundaryBlock["reason"];
  readonly blockedDetail?: string;
}

export interface ProjectContextSummary {
  readonly projectRoot: string;
  readonly lastUpdatedAt: string;
  readonly lastSessionId: string;
  readonly sessionCount: number;
  readonly recoverableCount: number;
  readonly lastSessionTitle?: string;
}

export type ResumeResult =
  | { ok: true; session: Session }
  | { ok: false; error: string; recoveryHint: string };

export interface ResumeOptions {
  readonly mode?: "runtime-recovery" | "continuity-only";
}

export interface RecoveryTrustBoundaryBlock {
  readonly sessionId: string;
  readonly reason:
    | "session-corrupt"
    | "terminal-evidence-indeterminate"
    | "continuation-evidence-missing";
  readonly detail: string;
  readonly recoveryHint: string;
}

export interface SessionResumeEligibility {
  readonly recoverable: boolean;
  readonly disposition:
    | "fully-resumable"
    | "partially-resumable"
    | "not-resumable";
  readonly autoResumeReady: boolean;
  readonly detail: string;
  readonly block?: RecoveryTrustBoundaryBlock;
}

export class SessionManager {
  private static readonly AUTO_COMPACT_TURN_THRESHOLD = 12;
  private static readonly APPROVAL_AUDIT_HISTORY_LIMIT = 16;
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
    const recordedAt = decision.recordedAt ?? new Date().toISOString();
    this.withSessionStateLock(session.id, () => {
      const statePath = this.getStatePath(session.id);
      const current = this.readStateSnapshotSafely(statePath);
      const approvalMemory = projectApprovalMemoryPersistence({
        currentWorkingMemory: current?.workingMemory,
        sessionProjectRoot: session.projectRoot,
        decision,
        recordedAt,
        historyLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT,
      });
      const snapshot = this.buildSessionStateSnapshot(session, current);
      this.writeJsonFileAtomic(statePath, {
        ...snapshot,
        workingMemory: approvalMemory.workingMemory,
      } satisfies SessionStateSnapshot);
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
        const sample = newlyUnreadableSessionDirs.slice(0, 3);
        const remainder = newlyUnreadableSessionDirs.length - sample.length;
        const suffix = remainder > 0 ? ` (+${remainder} more)` : "";
        const label =
          newlyUnreadableSessionDirs.length === 1 ? "directory" : "directories";
        console.warn(
          `Skipped ${newlyUnreadableSessionDirs.length} unreadable session ${label}: ${sample.join(", ")}${suffix}`,
        );
      }

      return sessions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } catch (error) {
      if (!this.didWarnListSessionsFailure) {
        this.didWarnListSessionsFailure = true;
        console.warn(
          `Failed to list sessions in ${this.sessionsDir}: ${error instanceof Error ? error.message : String(error)}`,
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

      const rebaseProjection = projectRootRebase({
        value: current.workingMemory,
        previousRoot,
        nextRoot: normalizedRoot,
      });

      this.writeJsonFileAtomic(statePath, {
        ...current,
        projectRoot: normalizedRoot,
        ...(rebaseProjection.workingMemory !== undefined
          ? {
              workingMemory: rebaseProjection.workingMemory,
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
    const decision = normalizeProjectBinding(binding);
    if (decision.projectRoot) {
      session.projectRoot = decision.projectRoot;
    }
    if (decision.rootMode) {
      session.rootMode = decision.rootMode;
    }
    if (decision.requestedWorkspaceRoot) {
      session.requestedWorkspaceRoot = decision.requestedWorkspaceRoot;
    }
    if (decision.targetPathBase) {
      session.targetPathBase = decision.targetPathBase;
    }
    if (Object.prototype.hasOwnProperty.call(decision, "gitRoot")) {
      session.gitRoot = decision.gitRoot ?? null;
    }
    session.updatedAt = new Date().toISOString();
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
    const recoverySnapshot = this.getRecoverySnapshot(sessionId);
    const transcriptEvents = this.getTranscriptEvents(sessionId);
    const lastRunErrorEvent = findLastLifecycleEvent(
      transcriptEvents,
      "run-error",
    );
    const lastQueryCompletion = findLastQueryCompletionEvent(transcriptEvents);
    const lastCodingCompletion =
      findLastCodingCompletionEvent(transcriptEvents);
    const lastCodingResult = lastCodingCompletion?.event.result.codingResult;
    const recentCodingResults = collectRecentCodingResults(
      transcriptEvents,
      4,
    );
    const lastGroundedDeliverableMode =
      extractGroundedDeliverableMode(lastCodingResult?.continuation.evidence);
    const lastReadDeliveredLines = extractLastReadDeliveredLines(
      lastCodingResult?.continuation.evidence,
    );
    const lastReadWindow = extractLastReadWindow(
      lastCodingResult?.continuation.evidence,
    );
    const lastReadFragment = extractLastReadFragment(
      lastCodingResult?.continuation.evidence,
    );
    const stagedRepairProgress = extractStagedRepairProgress(
      lastCodingResult?.continuation.evidence,
    );
    const lastRequestScope = extractLastRequestScopeFromEvidence(
      lastCodingResult?.continuation.evidence,
    );
    const lastRequestScopeFromMemory = parseRequestScopeMemory(
      stateSnapshot?.workingMemory,
    );
    const lastPermissionRequest = extractLastPermissionRequestFromEvidence(
      lastCodingResult?.continuation.evidence,
    );
    const lastPermissionRequestFromMemory =
      parsePermissionRequestMemory(stateSnapshot?.workingMemory);
    const resolvedLastPermissionRequest = resolvePermissionRequestMemory({
      evidence: lastPermissionRequest,
      memory: lastPermissionRequestFromMemory,
      sessionProjectRoot: session.projectRoot,
    });
    const resolvedLastRequestScope = resolveRequestScopeMemory({
      evidence: lastRequestScope,
      memory: lastRequestScopeFromMemory,
      sessionProjectRoot: session.projectRoot,
    });
    const lastApprovalAudit = decodeApprovalMemory(
      stateSnapshot?.workingMemory,
    );
    const lastApprovalHistory = decodeApprovalMemoryHistory(
      stateSnapshot?.workingMemory,
      { historyLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT },
    );
    const approvalProvenanceItems =
      lastCodingResult?.provenance?.approvalDecisions ?? [];
    const lastApprovalProvenance =
      approvalProvenanceItems[approvalProvenanceItems.length - 1];
    const toolExecutionProvenanceItems =
      lastCodingResult?.provenance?.toolExecutions ?? [];
    const lastToolExecutionProvenance =
      toolExecutionProvenanceItems[toolExecutionProvenanceItems.length - 1];
    const lastAnswerDefect =
      extractLastAnswerDefect(lastCodingResult) ?? undefined;
    const lastStoppedSessionContinuity =
      deriveStoppedSessionContinuitySurface(lastCodingResult);
    const lastWriteContinuity =
      lastStoppedSessionContinuity?.writeContinuity ??
      this.extractWriteContinuityFromMemory(stateSnapshot?.workingMemory);
    const lastActionHandoffSummary =
      buildActionHandoffSummary(lastCodingResult?.lastActionResultSeed) ??
      this.extractActionHandoffSummaryFromMemory(stateSnapshot?.workingMemory);
    const lastSeedInfluence =
      this.extractSeedInfluenceFromQueryResult(lastQueryCompletion?.event.result) ??
      this.extractSeedInfluenceFromMemory(stateSnapshot?.workingMemory);
    const lastSeedInfluenceHandoffSummary =
      buildSeedInfluenceHandoffSummary(
        lastCodingResult?.lastActionResultSeed,
        lastSeedInfluence,
      ) ??
      this.extractSeedInfluenceHandoffSummaryFromMemory(
        stateSnapshot?.workingMemory,
      );
    const lastFailureHandoffDiagnostic =
      lastStoppedSessionContinuity?.failureHandoffDiagnostic ??
      this.extractFailureHandoffDiagnosticFromMemory(
        stateSnapshot?.workingMemory,
      );
    const lastActionableFailure =
      lastStoppedSessionContinuity?.actionableFailure ??
      deriveActionableFailureContinuity(lastCodingResult);
    const lastSuccessHandoffDiagnostic =
      buildSuccessHandoffDiagnostic(lastCodingResult) ??
      this.extractSuccessHandoffDiagnosticFromMemory(
        stateSnapshot?.workingMemory,
      );
    const continuityTerminalSource =
      lastQueryCompletion?.event.result.terminalClassification === "success" &&
      lastCodingCompletion?.event.result.terminalClassification &&
      lastCodingCompletion.event.result.terminalClassification !== "success"
        ? lastCodingCompletion
        : lastQueryCompletion;
    const lastUserIntent =
      recoverySnapshot.lastUserMessage?.content ??
      findLastTurnContent(session.turns, "user");
    const mutationContinuity = buildMutationContinuityState({
      lastCodingResult,
      recentCodingResults,
      lastUserIntent,
    });

    const unresolvedItems: string[] = [];
    const lastFailure =
      session.lastError?.trim() ||
      lastRunErrorEvent?.detail?.trim() ||
      continuityTerminalSource?.event.result.stopReason?.trim();
    if (lastFailure) {
      unresolvedItems.push(`last-error:${lastFailure}`);
    }
    if (
      continuityTerminalSource?.event.result.terminalClassification &&
      continuityTerminalSource.event.result.terminalClassification !== "success"
    ) {
      unresolvedItems.push(
        `terminal:${continuityTerminalSource.event.result.terminalClassification} (${continuityTerminalSource.event.result.terminalReason})`,
      );
      if (continuityTerminalSource.event.result.stopReason?.trim()) {
        unresolvedItems.push(
          `stop-reason:${compactContinuityText(continuityTerminalSource.event.result.stopReason, 180)}`,
        );
      }
    } else if (lastRunErrorEvent?.detail?.trim()) {
      unresolvedItems.push(
        `previous-run-error:${compactContinuityText(lastRunErrorEvent.detail, 180)}`,
      );
    }
    if ((lastCodingResult?.failedFiles.length ?? 0) > 0) {
      unresolvedItems.push(
        `failed-files:${lastCodingResult?.failedFiles
          .slice(0, 4)
          .map((entry) => `${entry.path} (${entry.reason})`)
          .join(", ")}`,
      );
    }
    if (
      lastCodingResult?.taskSatisfaction.verdict &&
      lastCodingResult.taskSatisfaction.verdict !== "satisfied"
    ) {
      unresolvedItems.push(
        `task-satisfaction:${lastCodingResult.taskSatisfaction.verdict}`,
      );
    }
    if (
      lastCodingResult?.verification.status &&
      lastCodingResult.verification.status !== "passed"
    ) {
      unresolvedItems.push(`verify:${lastCodingResult.verification.status}`);
    }
    if (
      lastCodingResult?.repair.status &&
      lastCodingResult.repair.status === "failed"
    ) {
      unresolvedItems.push("repair:failed");
    }
    if (
      lastCodingResult?.continuation.status &&
      lastCodingResult.continuation.status ===
        "failed-after-bounded-continuation"
    ) {
      unresolvedItems.push("continuation:failed-after-bounded-continuation");
    }
    const freshnessHistoryCount =
      recentCodingResults.length +
      mutationContinuity.recentFailedFiles.length +
      (lastCodingResult?.continuation.evidence.length ?? 0) +
      unresolvedItems.length;

    return {
      sessionId: session.id,
      projectRoot: session.projectRoot,
      lastUserIntent,
      lastAssistantOutput:
        recoverySnapshot.lastAssistantMessage?.content ??
        findLastTurnContent(session.turns, "assistant"),
      lastTerminalClassification:
        continuityTerminalSource?.event.result.terminalClassification ??
        recoverySnapshot.terminalClassification,
      lastTerminalReason:
        continuityTerminalSource?.event.result.terminalReason ??
        recoverySnapshot.terminalReason,
      lastFailure,
      lastTaskKind: lastCodingResult?.taskKind,
      ...(lastCodingResult?.lastActionResultSeed
        ? { lastActionResultSeed: lastCodingResult.lastActionResultSeed }
        : {}),
      ...(lastWriteContinuity?.writerStarted !== undefined
        ? { lastWriterStarted: lastWriteContinuity.writerStarted }
        : {}),
      ...(lastWriteContinuity?.writeEffect
        ? { lastWriteEffect: lastWriteContinuity.writeEffect }
        : {}),
      ...(lastWriteContinuity?.requiresUserInspection !== undefined
        ? {
            lastWriteRequiresUserInspection:
              lastWriteContinuity.requiresUserInspection,
          }
        : {}),
      ...(lastWriteContinuity?.target
        ? { lastWriteEffectTarget: lastWriteContinuity.target }
        : {}),
      ...(lastActionHandoffSummary ? { lastActionHandoffSummary } : {}),
      ...(lastSeedInfluence ? { lastSeedInfluence } : {}),
      ...(lastSeedInfluenceHandoffSummary
        ? { lastSeedInfluenceHandoffSummary }
        : {}),
      ...(lastFailureHandoffDiagnostic
        ? { lastFailureHandoffDiagnostic }
        : {}),
      ...(lastSuccessHandoffDiagnostic
        ? { lastSuccessHandoffDiagnostic }
        : {}),
      lastGroundedDeliverableMode,
      ...(lastReadDeliveredLines !== undefined
        ? { lastReadDeliveredLines }
        : {}),
      ...(lastReadWindow.start !== undefined
        ? { lastReadWindowStart: lastReadWindow.start }
        : {}),
      ...(lastReadWindow.end !== undefined
        ? { lastReadWindowEnd: lastReadWindow.end }
        : {}),
      ...(lastReadWindow.size !== undefined
        ? { lastReadWindowSize: lastReadWindow.size }
        : {}),
      ...(lastReadFragment.start !== undefined
        ? { lastReadFragmentStart: lastReadFragment.start }
        : {}),
      ...(lastReadFragment.end !== undefined
        ? { lastReadFragmentEnd: lastReadFragment.end }
        : {}),
      ...(lastReadFragment.lineIndexes?.length
        ? { lastReadFragmentLineIndexes: lastReadFragment.lineIndexes }
        : {}),
      ...(lastReadFragment.ranges?.length
        ? { lastReadFragmentRanges: lastReadFragment.ranges }
        : {}),
      ...(lastReadFragment.sourceWindowStart !== undefined
        ? { lastReadFragmentSourceWindowStart: lastReadFragment.sourceWindowStart }
        : {}),
      ...(lastReadFragment.sourceWindowEnd !== undefined
        ? { lastReadFragmentSourceWindowEnd: lastReadFragment.sourceWindowEnd }
        : {}),
      ...(lastReadFragment.fingerprint
        ? { lastReadFragmentFingerprint: lastReadFragment.fingerprint }
        : {}),
      ...(lastReadFragment.filter
        ? { lastReadFilter: lastReadFragment.filter }
        : {}),
      ...(stagedRepairProgress.stepCount !== undefined
        ? { lastStagedRepairStepCount: stagedRepairProgress.stepCount }
        : {}),
      ...(stagedRepairProgress.completedStep !== undefined
        ? { lastStagedRepairCompletedStep: stagedRepairProgress.completedStep }
        : {}),
      ...(stagedRepairProgress.blockedStep !== undefined
        ? { lastStagedRepairBlockedStep: stagedRepairProgress.blockedStep }
        : {}),
      ...(stagedRepairProgress.nextStep !== undefined
        ? { lastStagedRepairNextStep: stagedRepairProgress.nextStep }
        : {}),
      ...(lastAnswerDefect ? { lastAnswerDefect } : {}),
      recentChangedFiles: mutationContinuity.recentChangedFiles,
      recentTargetFiles: mutationContinuity.recentTargetFiles,
      recentFailedFiles: mutationContinuity.recentFailedFiles,
      recentVerifiedFiles: mutationContinuity.recentVerifiedFiles,
      lastVerificationStatus: lastCodingResult?.verification.status,
      lastVerificationCommand: lastCodingResult?.verification.command,
      lastVerificationReason: lastCodingResult?.verification.reason,
      lastVerificationBlockerKind:
        lastActionableFailure?.blockerKind ??
        lastCodingResult?.verification.blockerKind,
      lastVerificationNextAction:
        lastActionableFailure?.nextAction ??
        lastCodingResult?.verification.nextAction,
      ...(lastCodingResult?.verification.status === "blocked"
      && lastCodingResult.verification.blockerKind === "approval-denied"
      && Boolean(lastCodingResult.verification.command?.trim())
        ? { lastVerificationResumeEligible: true }
        : {}),
      ...projectApprovalAudit(lastApprovalAudit),
      ...(lastApprovalHistory.length > 0
        ? { lastApprovalHistory }
        : {}),
      ...(lastApprovalProvenance
        ? {
            lastApprovalProvenanceKind: lastApprovalProvenance.kind,
            lastApprovalProvenanceSource: lastApprovalProvenance.source,
            lastApprovalProvenanceToolName: lastApprovalProvenance.toolName,
            lastApprovalProvenanceTaskId: lastApprovalProvenance.taskId,
          }
        : {}),
      ...(lastToolExecutionProvenance
        ? {
            lastToolExecutionProvenanceKind: lastToolExecutionProvenance.kind,
            lastToolExecutionProvenanceSource:
              lastToolExecutionProvenance.source,
            lastToolExecutionProvenanceToolName:
              lastToolExecutionProvenance.toolName,
            lastToolExecutionProvenanceTaskId:
              lastToolExecutionProvenance.taskId,
            ...(lastToolExecutionProvenance.failureBoundary
              ? {
                  lastToolExecutionFailureBoundary:
                    lastToolExecutionProvenance.failureBoundary,
                }
              : {}),
          }
        : {}),
      ...(resolvedLastPermissionRequest.toolName
        ? { lastPermissionRequestToolName: resolvedLastPermissionRequest.toolName }
        : {}),
      ...(resolvedLastPermissionRequest.operation
        ? { lastPermissionRequestOperation: resolvedLastPermissionRequest.operation }
        : {}),
      ...(resolvedLastPermissionRequest.target
        ? { lastPermissionRequestTarget: resolvedLastPermissionRequest.target }
        : {}),
      ...(resolvedLastPermissionRequest.process
        ? { lastPermissionRequestProcess: resolvedLastPermissionRequest.process }
        : {}),
      ...(resolvedLastPermissionRequest.scopeKey
        ? { lastPermissionRequestScopeKey: resolvedLastPermissionRequest.scopeKey }
        : {}),
      ...(resolvedLastPermissionRequest.scopeLabel
        ? { lastPermissionRequestScopeLabel: resolvedLastPermissionRequest.scopeLabel }
        : {}),
      ...(resolvedLastPermissionRequest.cacheKey
        ? { lastPermissionRequestCacheKey: resolvedLastPermissionRequest.cacheKey }
        : {}),
      ...(resolvedLastPermissionRequest.projectRoot
        ? {
            lastPermissionRequestProjectRoot:
              resolvedLastPermissionRequest.projectRoot,
          }
        : {}),
      ...(resolvedLastPermissionRequest.source
        ? { lastPermissionRequestSource: resolvedLastPermissionRequest.source }
        : {}),
      ...(resolvedLastPermissionRequest.lineage
        ? { lastPermissionRequestLineage: resolvedLastPermissionRequest.lineage }
        : {}),
      ...(resolvedLastRequestScope.cacheKey
        ? { lastRequestScopeCacheKey: resolvedLastRequestScope.cacheKey }
        : {}),
      ...(resolvedLastRequestScope.scopeLabel
        ? { lastRequestScopeLabel: resolvedLastRequestScope.scopeLabel }
        : {}),
      ...(resolvedLastRequestScope.projectRoot
        ? { lastRequestScopeProjectRoot: resolvedLastRequestScope.projectRoot }
        : {}),
      ...(resolvedLastRequestScope.source
        ? { lastRequestScopeSource: resolvedLastRequestScope.source }
        : {}),
      lastRepairStatus: lastCodingResult?.repair.status,
      lastRepairNotes: (lastCodingResult?.repair.notes ?? []).slice(0, 6),
      lastContinuationStatus: lastCodingResult?.continuation.status,
      lastContinuationEvidence: selectContinuationEvidenceForSnapshot(
        lastCodingResult?.continuation.evidence ?? [],
      ),
      lastTaskSatisfactionVerdict: lastCodingResult?.taskSatisfaction.verdict,
      lastTaskSatisfactionReasons: (
        lastCodingResult?.taskSatisfaction.reasons ?? []
      ).slice(0, 6),
      unresolvedItems,
      ...(freshnessHistoryCount > 0 ? { freshnessHistoryCount } : {}),
    };
  }

  private normalizeLegacyPermissionStateForSession(
    session: Session,
    snapshot: SessionStateSnapshot | undefined,
  ): SessionStateSnapshot | undefined {
    if (!snapshot?.workingMemory) {
      return snapshot;
    }
    const normalizedWorkingMemory = normalizeLegacyPermissionWorkingMemory({
      workingMemory: snapshot.workingMemory,
      sessionProjectRoot: session.projectRoot,
    });
    if (normalizedWorkingMemory === snapshot.workingMemory) {
      return snapshot;
    }

    let normalizedSnapshot: SessionStateSnapshot = {
      ...snapshot,
      projectRoot: session.projectRoot,
      workingMemory: normalizedWorkingMemory,
    };

    this.withSessionStateLock(session.id, () => {
      const statePath = this.getStatePath(session.id);
      const latest = this.readStateSnapshotSafely(statePath);
      if (!latest?.workingMemory) {
        this.writeJsonFileAtomic(statePath, normalizedSnapshot);
        return;
      }
      const rebasedLatestWorkingMemory = normalizeLegacyPermissionWorkingMemory({
        workingMemory: latest.workingMemory,
        sessionProjectRoot: session.projectRoot,
      });
      if (rebasedLatestWorkingMemory === latest.workingMemory) {
        normalizedSnapshot = {
          ...latest,
          projectRoot: session.projectRoot,
        };
        return;
      }
      normalizedSnapshot = {
        ...latest,
        projectRoot: session.projectRoot,
        workingMemory: rebasedLatestWorkingMemory,
      };
      this.writeJsonFileAtomic(statePath, normalizedSnapshot);
    });

    return normalizedSnapshot;
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

  private extractActionHandoffSummaryFromMemory(
    workingMemory: unknown,
  ): string | undefined {
    if (!workingMemory || typeof workingMemory !== "object") {
      return undefined;
    }
    const root = workingMemory as Record<string, unknown>;
    if (
      root.continuity &&
      typeof root.continuity === "object" &&
      !Array.isArray(root.continuity)
    ) {
      const continuity = root.continuity as Record<string, unknown>;
      const candidate = normalizeOptionalString(
        continuity.lastActionHandoffSummary,
      );
      if (candidate) {
        return candidate;
      }
    }
    const summaryEntries = Array.isArray(root.summary)
      ? root.summary.filter((entry): entry is string => typeof entry === "string")
      : [];
    for (const entry of summaryEntries) {
      const normalized = entry.trim().startsWith("- ")
        ? entry.trim().slice(2).trim()
        : entry.trim();
      const prefix = "last-action-handoff-summary:";
      if (normalized.toLowerCase().startsWith(prefix)) {
        const value = normalized.slice(prefix.length).trim();
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  }

  private extractWriteContinuityFromMemory(
    workingMemory: unknown,
  ):
    | {
        readonly writerStarted?: boolean;
        readonly writeEffect?: CodingWriteEffect;
        readonly requiresUserInspection?: boolean;
        readonly target?: string;
      }
    | undefined {
    if (!workingMemory || typeof workingMemory !== "object") {
      return undefined;
    }
    const root = workingMemory as Record<string, unknown>;
    const continuity =
      root.continuity &&
      typeof root.continuity === "object" &&
      !Array.isArray(root.continuity)
        ? (root.continuity as Record<string, unknown>)
        : undefined;
    const summaryEntries = Array.isArray(root.summary)
      ? root.summary.filter((entry): entry is string => typeof entry === "string")
      : [];
    const writerStarted =
      normalizeOptionalBoolean(continuity?.lastWriterStarted) ??
      extractSummaryBoolean(summaryEntries, "last-writer-started");
    const requiresUserInspection =
      normalizeOptionalBoolean(
        continuity?.lastWriteRequiresUserInspection,
      ) ??
      extractSummaryBoolean(
        summaryEntries,
        "last-write-requires-user-inspection",
      );
    const writeEffect = normalizeWriteEffect(
      continuity?.lastWriteEffect,
    ) ?? normalizeWriteEffect(
      extractSummaryString(summaryEntries, "last-write-effect"),
    );
    const target =
      normalizeOptionalString(continuity?.lastWriteEffectTarget) ??
      extractSummaryString(summaryEntries, "last-write-effect-target");
    if (
      writerStarted === undefined &&
      requiresUserInspection === undefined &&
      writeEffect === undefined &&
      !target
    ) {
      return undefined;
    }
    return {
      ...(writerStarted !== undefined ? { writerStarted } : {}),
      ...(requiresUserInspection !== undefined
        ? { requiresUserInspection }
        : {}),
      ...(writeEffect ? { writeEffect } : {}),
      ...(target ? { target } : {}),
    };
  }

  private extractSeedInfluenceHandoffSummaryFromMemory(
    workingMemory: unknown,
  ): string | undefined {
    if (!workingMemory || typeof workingMemory !== "object") {
      return undefined;
    }
    const root = workingMemory as Record<string, unknown>;
    if (
      root.continuity &&
      typeof root.continuity === "object" &&
      !Array.isArray(root.continuity)
    ) {
      const continuity = root.continuity as Record<string, unknown>;
      const candidate = normalizeOptionalString(
        continuity.lastSeedInfluenceHandoffSummary,
      );
      if (candidate) {
        return candidate;
      }
    }
    const summaryEntries = Array.isArray(root.summary)
      ? root.summary.filter((entry): entry is string => typeof entry === "string")
      : [];
    for (const entry of summaryEntries) {
      const normalized = entry.trim().startsWith("- ")
        ? entry.trim().slice(2).trim()
        : entry.trim();
      const prefix = "last-seed-influence-handoff-summary:";
      if (normalized.toLowerCase().startsWith(prefix)) {
        const value = normalized.slice(prefix.length).trim();
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  }

  private extractFailureHandoffDiagnosticFromMemory(
    workingMemory: unknown,
  ): string | undefined {
    if (!workingMemory || typeof workingMemory !== "object") {
      return undefined;
    }
    const root = workingMemory as Record<string, unknown>;
    if (
      root.continuity &&
      typeof root.continuity === "object" &&
      !Array.isArray(root.continuity)
    ) {
      const continuity = root.continuity as Record<string, unknown>;
      const candidate = normalizeOptionalString(
        continuity.lastFailureHandoffDiagnostic,
      );
      if (candidate) {
        return candidate;
      }
    }
    const summaryEntries = Array.isArray(root.summary)
      ? root.summary.filter((entry): entry is string => typeof entry === "string")
      : [];
    for (const entry of summaryEntries) {
      const normalized = entry.trim().startsWith("- ")
        ? entry.trim().slice(2).trim()
        : entry.trim();
      const prefix = "last-failure-handoff-diagnostic:";
      if (normalized.toLowerCase().startsWith(prefix)) {
        const value = normalized.slice(prefix.length).trim();
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  }

  private extractSuccessHandoffDiagnosticFromMemory(
    workingMemory: unknown,
  ): string | undefined {
    if (!workingMemory || typeof workingMemory !== "object") {
      return undefined;
    }
    const root = workingMemory as Record<string, unknown>;
    if (
      root.continuity &&
      typeof root.continuity === "object" &&
      !Array.isArray(root.continuity)
    ) {
      const continuity = root.continuity as Record<string, unknown>;
      const candidate = normalizeOptionalString(
        continuity.lastSuccessHandoffDiagnostic,
      );
      if (candidate) {
        return candidate;
      }
    }
    const summaryEntries = Array.isArray(root.summary)
      ? root.summary.filter((entry): entry is string => typeof entry === "string")
      : [];
    for (const entry of summaryEntries) {
      const normalized = entry.trim().startsWith("- ")
        ? entry.trim().slice(2).trim()
        : entry.trim();
      const prefix = "last-success-handoff-diagnostic:";
      if (normalized.toLowerCase().startsWith(prefix)) {
        const value = normalized.slice(prefix.length).trim();
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  }

  private evaluateRecoveryTrustBoundary(
    session: Session,
  ): SessionResumeEligibility {
    if (session.status !== "interrupted" && session.status !== "error") {
      return {
        recoverable: false,
        disposition: "not-resumable",
        autoResumeReady: false,
        detail: "Session is not in interrupted/error state",
        block: this.createRecoveryTrustBoundaryBlock(
          session,
          "continuation-evidence-missing",
          "session is not interrupted or error",
        ),
      };
    }

    let snapshot: RecoverySnapshot;
    try {
      snapshot = this.getRecoverySnapshot(session.id);
    } catch (error) {
      return {
        recoverable: false,
        disposition: "not-resumable",
        autoResumeReady: false,
        detail: "Session data is unreadable",
        block: this.createRecoveryTrustBoundaryBlock(
          session,
          "session-corrupt",
          `session data is unreadable (${error instanceof Error ? error.message : String(error)})`,
        ),
      };
    }

    const hasContinuationEvidence = snapshotHasContinuationEvidence(snapshot);
    const hasResumeContextEvidence = this.hasResumeContextEvidence(snapshot);
    const hasInterruptedLifecycleEvidence =
      snapshot.lastLifecycleEvent?.event === "run-interrupted";
    const hasPendingPrompt =
      typeof snapshot.pendingPrompt === "string" &&
      snapshot.pendingPrompt.trim().length > 0;
    const hasPendingLifecycle =
      Object.keys(snapshot.pendingLifecycle.pendingApprovals).length > 0 ||
      Object.keys(snapshot.pendingLifecycle.pendingTools).length > 0;
    const hasTurnRecoverySignal =
      snapshot.interruptedKind === "turn" ||
      snapshot.runPhase === "turn-active" ||
      hasPendingLifecycle ||
      hasInterruptedLifecycleEvidence;
    const hasPromptRecoverySignal =
      snapshot.interruptedKind === "prompt" ||
      snapshot.runPhase === "prompt-persisted";

    if (session.status === "interrupted") {
      if (hasPendingPrompt && (hasTurnRecoverySignal || hasPromptRecoverySignal)) {
        return {
          recoverable: true,
          disposition: "fully-resumable",
          autoResumeReady: true,
          detail: "Pending prompt and interruption evidence are available",
        };
      }

      if (hasTurnRecoverySignal || hasContinuationEvidence || hasResumeContextEvidence) {
        return {
          recoverable: true,
          disposition: "partially-resumable",
          autoResumeReady: false,
          detail:
            "Context can be resumed, but no pending prompt exists for automatic continuation",
        };
      }

      return {
        recoverable: false,
        disposition: "not-resumable",
        autoResumeReady: false,
        detail: "Interrupted state has no continuation evidence",
        block: this.createRecoveryTrustBoundaryBlock(
          session,
          "continuation-evidence-missing",
          "interrupted state has no continuation evidence",
        ),
      };
    }

    if (snapshot.durableStatus === "stopped") {
      return {
        recoverable: false,
        disposition: "not-resumable",
        autoResumeReady: false,
        detail: "Durable status is stopped",
        block: this.createRecoveryTrustBoundaryBlock(
          session,
          "continuation-evidence-missing",
          "durable status is stopped and cannot continue",
        ),
      };
    }

    if (!snapshotHasDeterministicTerminalEvidence(snapshot)) {
      return {
        recoverable: false,
        disposition: "not-resumable",
        autoResumeReady: false,
        detail: "Terminal evidence is indeterminate",
        block: this.createRecoveryTrustBoundaryBlock(
          session,
          "terminal-evidence-indeterminate",
          "terminal evidence is indeterminate",
        ),
      };
    }

    if (!hasContinuationEvidence) {
      return {
        recoverable: false,
        disposition: "not-resumable",
        autoResumeReady: false,
        detail: "Error state has no continuation evidence",
        block: this.createRecoveryTrustBoundaryBlock(
          session,
          "continuation-evidence-missing",
          "error state has no continuation evidence",
        ),
      };
    }

    return {
      recoverable: true,
      disposition: "partially-resumable",
      autoResumeReady: false,
      detail:
        "Error-session context is resumable for follow-up, but not auto-resumable",
    };
  }

  private hasResumeContextEvidence(snapshot: RecoverySnapshot): boolean {
    const hasLastMessages =
      Boolean(snapshot.lastUserMessage?.content?.trim()) ||
      Boolean(snapshot.lastAssistantMessage?.content?.trim());
    const hasCompletedTurn =
      findLastQueryCompletionEvent(snapshot.transcriptEvents) !== undefined;
    const hasRepairEvidence =
      snapshot.repairSummary.insertedPromptMessage ||
      snapshot.repairSummary.insertedQueryStarted ||
      snapshot.repairSummary.insertedRunInterrupted ||
      snapshot.repairSummary.ignoredDuplicateTurnStarts > 0 ||
      snapshot.repairSummary.ignoredUnpairedTurnCompletions > 0 ||
      snapshot.repairSummary.ignoredRoleMismatchedTurnCompletions > 0;
    return hasLastMessages || hasCompletedTurn || hasRepairEvidence;
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
      seedInfluence: this.extractSeedInfluenceFromQueryResult(
        event.type === "query.completed" ? event.result : undefined,
      ),
    });
  }

  private extractSeedInfluenceFromQueryResult(
    result: Extract<QueryEvent, { type: "query.completed" }>["result"] | undefined,
  ): SeedInfluenceDiagnostic | undefined {
    if (!result) {
      return undefined;
    }
    return extractSeedInfluenceFromStrings([
      ...(result.sharedContext.notes ?? []),
      ...(result.codingResult?.evidence ?? []),
      ...(result.codingResult?.continuation.evidence ?? []),
      ...(result.codingResult?.repair.notes ?? []),
    ]);
  }

  private extractSeedInfluenceFromMemory(
    workingMemory: unknown,
  ): SeedInfluenceDiagnostic | undefined {
    if (!workingMemory || typeof workingMemory !== "object") {
      return undefined;
    }
    const root = workingMemory as Record<string, unknown>;
    if (
      root.continuity &&
      typeof root.continuity === "object" &&
      !Array.isArray(root.continuity)
    ) {
      const continuity = root.continuity as Record<string, unknown>;
      const fromContinuity = parseSeedInfluence(
        normalizeOptionalString(continuity.lastSeedInfluence),
      );
      if (fromContinuity) {
        return fromContinuity;
      }
    }
    const summaryEntries = Array.isArray(root.summary)
      ? root.summary.filter((entry): entry is string => typeof entry === "string")
      : [];
    return extractSeedInfluenceFromStrings(summaryEntries);
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
