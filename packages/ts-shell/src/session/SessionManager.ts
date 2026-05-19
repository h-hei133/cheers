/**
 * SessionManager - directory-based session substrate
 *
 * Layout per session:
 * - metadata.json   -> identity + timestamps
 * - transcript.jsonl -> append-only events/messages
 * - state.json      -> mutable runtime state snapshot
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { QueryEvent } from "../core/query/events.js";
import type {
  QueryRuntimeRecoveryBoundary,
  QueryRuntimeRepairSummary,
  QueryRuntimeStateSeed,
} from "../core/query/runtimeState.js";
import {
  applyLifecycleEventToIndex,
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
  projectApprovalAuditContinuity,
  projectApprovalSummaryFallback,
} from "./approvalAuditProjection.js";
import {
  decodeApprovalMemory,
  decodeApprovalMemoryHistory,
} from "./approvalMemoryCodec.js";
import { applyCompactRetentionPlan } from "./compactRetentionPlanner.js";
import {
  createEmptyCurrentSessionSelectionStore,
  parseCurrentSessionSelectionStore,
  selectCurrentSession,
  type CurrentSessionSelectionResolution,
  type CurrentSessionSelectionStore,
} from "./currentSessionSelection.js";
import { projectDurableStatus } from "./durableStatusProjection.js";
import { buildMutationContinuityState } from "./mutationContinuityState.js";
import {
  projectCompactRetentionPlanInput,
} from "./sessionCompactProjection.js";
import {
  hasContinuationEvidence as snapshotHasContinuationEvidence,
  hasDeterministicTerminalEvidence as snapshotHasDeterministicTerminalEvidence,
  selectContinuationEvidenceForSnapshot,
} from "./sessionContinuationProjection.js";
import {
  createLifecycleTranscriptEvent,
  createMessageTranscriptEvent,
  createQueryTranscriptEvent,
  decodeTranscriptLine,
  encodeTranscriptEvent,
  transcriptEventToSessionMessage,
  type TranscriptEvent,
} from "./sessionEventCodec.js";
import {
  projectCurrentSessionMetadata,
  projectSessionMetadata,
} from "./sessionMetadataProjection.js";
import {
  buildResumeReplayInput,
  buildSessionReplayPlan,
  normalizeReplayTranscriptEvents,
  prepareReplayTranscript,
  type RuntimeSeedOptions,
} from "./sessionReplayBuilder.js";
import {
  buildActionHandoffSummary,
  buildSeedInfluenceHandoffSummary,
  buildSessionResumeContext,
  buildSessionResumeSnapshot,
  buildSuccessHandoffDiagnostic,
} from "./sessionResumeContextBuilder.js";
import {
  projectRecoveryTrustBoundaryBlock,
  projectSessionReentrySummary,
  scoreSessionReentrySummary,
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
  normalizeProjectRootKey,
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

export type { CurrentSessionSelectionResolution } from "./currentSessionSelection.js";
export type {
  ApprovalAuditMemoryState,
  SessionContinuitySnapshot,
} from "./sessionContinuityTypes.js";
export type { TranscriptEvent } from "./sessionEventCodec.js";

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export type { WorkspaceRootMode } from "./projectBindingPolicy.js";

export interface Session {
  id: string;
  projectRoot: string;
  rootMode?: WorkspaceRootMode;
  requestedWorkspaceRoot?: string;
  targetPathBase?: string;
  gitRoot?: string | null;
  title?: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "interrupted" | "completed" | "error" | "terminated";
  turns: SessionMessage[];
  pendingPrompt?: string;
  lastError?: string;
}

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

interface SessionMetadata {
  id: string;
  projectRoot: string;
  rootMode?: WorkspaceRootMode;
  requestedWorkspaceRoot?: string;
  targetPathBase?: string;
  gitRoot?: string | null;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionStateSnapshot {
  status: Session["status"];
  projectRoot?: string;
  pendingPrompt?: string;
  lastError?: string;
  workingMemory?: unknown;
  durableStatus?: "success" | "stopped" | "error";
  runPhase?: "idle" | "prompt-persisted" | "turn-active";
  interruptedKind?: "prompt" | "turn";
  terminalReason?: TerminalReason;
  terminalClassification?: TerminalClassification;
  lastContinuationReason?: ContinuationReason;
  pendingLifecycle?: DurableLifecycleIndex;
}

interface TranscriptRepairContext {
  readonly sessionId: string;
  readonly state: SessionStateSnapshot;
  readonly pendingPrompt?: string;
  readonly updatedAt: string;
}

export interface RecoverySnapshot {
  readonly pendingPrompt?: string;
  readonly runPhase?: "idle" | "prompt-persisted" | "turn-active";
  readonly interruptedKind?: "prompt" | "turn";
  readonly durableStatus?: "success" | "stopped" | "error";
  readonly terminalReason?: TerminalReason;
  readonly terminalClassification?: TerminalClassification;
  readonly lastContinuationReason?: ContinuationReason;
  readonly pendingLifecycle: DurableLifecycleIndex;
  readonly repairSummary: QueryRuntimeRepairSummary;
  readonly lastUserMessage?: SessionMessage;
  readonly lastAssistantMessage?: SessionMessage;
  readonly lastLifecycleEvent?: Extract<TranscriptEvent, { type: "lifecycle" }>;
  readonly transcriptEvents: TranscriptEvent[];
}

interface TerminalPersistence {
  readonly terminalReason?: TerminalReason;
  readonly terminalClassification?: TerminalClassification;
  readonly lastContinuationReason?: ContinuationReason;
}

export interface ReplayPlan {
  readonly normalizedTranscriptEvents: TranscriptEvent[];
  readonly replayMessages: SessionMessage[];
  readonly continuationPrompt?: string;
  readonly requiresAssistantSentinel: boolean;
  readonly repairSummary: QueryRuntimeRepairSummary;
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
  private static readonly STATE_IO_MAX_ATTEMPTS = 6;
  private static readonly STATE_IO_RETRY_DELAY_MS = 12;
  private static readonly STATE_LOCK_TIMEOUT_MS = 1200;
  private static readonly STATE_LOCK_RETRY_DELAY_MS = 20;
  private static readonly AUTO_COMPACT_TURN_THRESHOLD = 12;
  private static readonly APPROVAL_AUDIT_HISTORY_LIMIT = 16;
  private sessionsDir: string;
  private readonly currentSessionStorePath: string;
  private lastCurrentSessionStoreReadError: string | null = null;
  private readonly warnedUnreadableSessionDirs = new Set<string>();
  private didWarnListSessionsFailure = false;

  constructor() {
    const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
    this.sessionsDir = path.join(homeDir, ".private-agents", "sessions");
    this.currentSessionStorePath = path.join(
      homeDir,
      ".private-agents",
      "current-session.json",
    );
    this.ensureSessionsDir();
  }

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private generateSessionId(): string {
    return `sess_${crypto.randomBytes(8).toString("hex")}_${Date.now()}`;
  }

  private getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  private getMetadataPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), "metadata.json");
  }

  private getTranscriptPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), "transcript.jsonl");
  }

  private getStatePath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), "state.json");
  }

  private getStateLockPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), "state.lock");
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
    return fs.existsSync(this.getSessionDir(sessionId.trim()));
  }

  getCurrentSessionForProject(projectRoot: string): Session | null {
    const resolution = this.resolveCurrentSessionForProject(projectRoot);
    return resolution.ok ? resolution.session : null;
  }

  resolveCurrentSessionForProject(
    projectRoot: string,
  ): CurrentSessionSelectionResolution {
    const normalizedProjectRoot = this.normalizeProjectRootKey(projectRoot);
    const store = this.readCurrentSessionStore();
    const storeReadError = this.lastCurrentSessionStoreReadError;
    const selection = store.byProjectRoot[normalizedProjectRoot];
    if (!selection?.sessionId?.trim()) {
      const unselectedProjection = selectCurrentSession({
        projectRoot,
        normalizedProjectRoot,
        storeReadError,
        selection,
      });
      return unselectedProjection.resolution;
    }
    if (!this.sessionExists(selection.sessionId)) {
      const missingProjection = selectCurrentSession({
        projectRoot,
        normalizedProjectRoot,
        storeReadError,
        selection,
        sessionExists: false,
      });
      this.removeCurrentSessionSelection(normalizedProjectRoot);
      return missingProjection.resolution;
    }

    try {
      const session = this.load(selection.sessionId);
      const sessionProjectRoot = session.projectRoot || normalizedProjectRoot;
      const selectedProjection = selectCurrentSession({
        projectRoot,
        normalizedProjectRoot,
        storeReadError,
        selection,
        sessionExists: true,
        session,
        sessionProjectRoot,
        normalizedSessionProjectRoot: this.normalizeProjectRootKey(sessionProjectRoot),
      });
      if (!selectedProjection.resolution.ok) {
        this.removeCurrentSessionSelection(normalizedProjectRoot);
        return selectedProjection.resolution;
      }
      return selectedProjection.resolution;
    } catch (error) {
      const failedProjection = selectCurrentSession({
        projectRoot,
        normalizedProjectRoot,
        storeReadError,
        selection,
        sessionExists: true,
        loadError: error,
      });
      this.removeCurrentSessionSelection(normalizedProjectRoot);
      return failedProjection.resolution;
    }
  }

  setCurrentSessionForProject(projectRoot: string, sessionId: string): void {
    const normalizedProjectRoot = this.normalizeProjectRootKey(projectRoot);
    const normalizedSessionId = sessionId.trim();
    if (!normalizedProjectRoot || !normalizedSessionId) {
      return;
    }

    const current = this.readCurrentSessionStore();
    const next: CurrentSessionSelectionStore = {
      schemaVersion: 1,
      byProjectRoot: {
        ...current.byProjectRoot,
        [normalizedProjectRoot]: projectCurrentSessionMetadata({
          sessionId: normalizedSessionId,
          updatedAt: new Date().toISOString(),
        }),
      },
    };
    this.writeCurrentSessionStore(next);
  }

  clearCurrentSessionForProject(projectRoot: string): void {
    const normalizedProjectRoot = this.normalizeProjectRootKey(projectRoot);
    if (!normalizedProjectRoot) {
      return;
    }
    this.removeCurrentSessionSelection(normalizedProjectRoot);
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
    const normalizedId = sessionId.trim();
    if (!normalizedId) {
      throw new Error("Session id is required");
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(normalizedId)) {
      throw new Error(
        `Invalid session id "${sessionId}". Allowed characters: letters, numbers, dot, underscore, dash.`,
      );
    }
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
    const timestamp = new Date().toISOString();
    const nextMessage: SessionMessage & { timestamp: string } = {
      ...message,
      timestamp,
    };
    session.turns.push(nextMessage);
    session.updatedAt = timestamp;
    this.appendTranscriptEvent(
      sessionId,
      createMessageTranscriptEvent(nextMessage),
    );
    this.writeSessionMetadata(session);
    this.writeSessionState(session);
  }

  recordApprovalAuditDecision(
    sessionId: string,
    decision: Omit<ApprovalAuditMemoryState, "recordedAt"> & {
      readonly recordedAt?: string;
    },
  ): void {
    const session = this.load(sessionId);
    const recordedAt = decision.recordedAt ?? new Date().toISOString();
    const normalizedProjectRoot = path.resolve(
      decision.projectRoot?.trim() || session.projectRoot,
    );
    this.withSessionStateLock(session.id, () => {
      const statePath = this.getStatePath(session.id);
      const current = this.readStateSnapshotSafely(statePath);
      const currentWorkingMemory =
        current?.workingMemory &&
        typeof current.workingMemory === "object" &&
        !Array.isArray(current.workingMemory)
          ? { ...(current.workingMemory as Record<string, unknown>) }
          : {};
      const nextApprovalAudit: ApprovalAuditMemoryState = {
        decision: decision.decision,
        decisionSource: decision.decisionSource,
        persistent: decision.persistent,
        cacheEffect: decision.cacheEffect,
        projectRoot: normalizedProjectRoot,
        cacheKey: decision.cacheKey,
        scopeLabel: decision.scopeLabel,
        ...(decision.lineage ? { lineage: decision.lineage } : {}),
        ...(decision.stopReason ? { stopReason: decision.stopReason } : {}),
        ...(decision.channel ? { channel: decision.channel } : {}),
        ...(decision.inputKey ? { inputKey: decision.inputKey } : {}),
        recordedAt,
      };
      const approvalAuditHistory = decodeApprovalMemoryHistory(
        currentWorkingMemory,
        { historyLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT },
      );
      const nextApprovalAuditHistory = [
        ...approvalAuditHistory,
        nextApprovalAudit,
      ].slice(-SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT);
      const currentContinuity =
        currentWorkingMemory.continuity &&
        typeof currentWorkingMemory.continuity === "object" &&
        !Array.isArray(currentWorkingMemory.continuity)
          ? { ...(currentWorkingMemory.continuity as Record<string, unknown>) }
          : {};
      const nextContinuity: Record<string, unknown> = {
        ...currentContinuity,
        ...projectApprovalAuditContinuity({
          approvalAudit: nextApprovalAudit,
          approvalAuditHistory: nextApprovalAuditHistory,
        }),
      };
      const currentSummaryEntries = Array.isArray(currentWorkingMemory.summary)
        ? currentWorkingMemory.summary.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      const nextSummary = projectApprovalSummaryFallback({
        currentSummaryEntries,
        approvalAudit: nextApprovalAudit,
      });
      const snapshot = this.buildSessionStateSnapshot(session, current);
      this.writeJsonFileAtomic(statePath, {
        ...snapshot,
        workingMemory: {
          ...currentWorkingMemory,
          approvalAudit: nextApprovalAudit,
          approvalAuditHistory: nextApprovalAuditHistory,
          continuity: nextContinuity,
          summary: nextSummary,
        },
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
    const sessionDir = this.getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session ${sessionId} not found`);
    }
    fs.rmSync(sessionDir, { recursive: true, force: true });
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
    for (const pendingApproval of Object.values(
      snapshot.pendingLifecycle.pendingApprovals,
    )) {
      const compensatedApproval = this.findCompensatedLifecycleEvent(
        sessionId,
        {
          type: "approval.resolved",
          toolName: pendingApproval.toolName,
          taskId: pendingApproval.taskId,
        },
      );

      if (compensatedApproval) {
        this.applyQueryEventToState(sessionId, compensatedApproval);
        continue;
      }

      this.appendQueryEvent(sessionId, {
        type: "approval.resolved",
        toolName: pendingApproval.toolName,
        taskId: pendingApproval.taskId,
        outcome: "denied",
        compensated: true,
      });
    }
    for (const pendingTool of Object.values(
      snapshot.pendingLifecycle.pendingTools,
    )) {
      const compensatedTool = this.findCompensatedLifecycleEvent(sessionId, {
        type: "tool.result",
        toolName: pendingTool.toolName,
        taskId: pendingTool.taskId,
      });

      if (compensatedTool) {
        this.applyQueryEventToState(sessionId, compensatedTool);
        continue;
      }

      this.appendQueryEvent(sessionId, {
        type: "tool.result",
        toolName: pendingTool.toolName,
        taskId: pendingTool.taskId,
        success: false,
        compensated: true,
      });
    }

    return this.getRecoverySnapshot(sessionId).pendingLifecycle;
  }

  appendQueryEvent(sessionId: string, event: QueryEvent): void {
    if (this.isDuplicateDurableResolutionEvent(sessionId, event)) {
      return;
    }

    this.appendTranscriptEvent(
      sessionId,
      createQueryTranscriptEvent({
        event,
        timestamp: new Date().toISOString(),
      }),
    );
    this.applyQueryEventToState(sessionId, event);
  }

  private isDuplicateDurableResolutionEvent(
    sessionId: string,
    event: QueryEvent,
  ): boolean {
    if (event.type !== "approval.resolved" && event.type !== "tool.result") {
      return false;
    }

    return this.getTranscriptEvents(sessionId).some((existing) => {
      if (existing.type !== "query-event") {
        return false;
      }

      return JSON.stringify(existing.event) === JSON.stringify(event);
    });
  }

  getTranscriptEvents(sessionId: string): TranscriptEvent[] {
    const transcriptPath = this.getTranscriptPath(sessionId);
    if (!fs.existsSync(transcriptPath)) {
      return [];
    }

    return fs
      .readFileSync(transcriptPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map(decodeTranscriptLine);
  }

  getRecoverySnapshot(sessionId: string): RecoverySnapshot {
    const session = this.load(sessionId);
    const state = this.readStateSnapshotRequired(this.getStatePath(sessionId));
    const replayPreparation = this.prepareReplayTranscript(
      this.normalizeTranscriptEvents(this.getTranscriptEvents(sessionId)),
      {
        sessionId,
        state,
        pendingPrompt: session.pendingPrompt,
        updatedAt: session.updatedAt,
      },
    );
    const transcriptEvents = replayPreparation.transcriptEvents;
    const messageEvents = transcriptEvents.filter(
      (event): event is Extract<TranscriptEvent, { type: "message" }> =>
        event.type === "message",
    );
    const lifecycleEvents = transcriptEvents.filter(
      (event): event is Extract<TranscriptEvent, { type: "lifecycle" }> =>
        event.type === "lifecycle",
    );
    const readModelLifecycle =
      this.deriveLifecycleIndexFromTranscript(transcriptEvents);

    const lastUserMessage = [...messageEvents]
      .reverse()
      .find((event) => event.role === "user");
    const lastAssistantMessage = [...messageEvents]
      .reverse()
      .find((event) => event.role === "assistant");

    return {
      pendingPrompt: session.pendingPrompt,
      runPhase: state.runPhase,
      interruptedKind: state.interruptedKind,
      durableStatus: state.durableStatus,
      terminalReason: state.terminalReason,
      terminalClassification: state.terminalClassification,
      lastContinuationReason: state.lastContinuationReason,
      pendingLifecycle: readModelLifecycle,
      repairSummary: replayPreparation.repairSummary,
      lastUserMessage,
      lastAssistantMessage,
      lastLifecycleEvent: lifecycleEvents[lifecycleEvents.length - 1],
      transcriptEvents,
    };
  }

  private deriveLifecycleIndexFromTranscript(
    events: TranscriptEvent[],
  ): DurableLifecycleIndex {
    return events.reduce<DurableLifecycleIndex>((index, event) => {
      if (event.type !== "query-event") {
        return index;
      }

      return applyLifecycleEventToIndex(index, event.event);
    }, createEmptyLifecycleIndex());
  }

  normalizeTranscriptEvents(events: TranscriptEvent[]): TranscriptEvent[] {
    return normalizeReplayTranscriptEvents(events);
  }

  repairTranscriptEvents(
    events: TranscriptEvent[],
    context: TranscriptRepairContext,
  ): TranscriptEvent[] {
    return this.prepareReplayTranscript(events, context).transcriptEvents;
  }

  private prepareReplayTranscript(
    events: TranscriptEvent[],
    context: TranscriptRepairContext,
  ) {
    return prepareReplayTranscript(events, context);
  }

  getReplayPlan(sessionId: string): ReplayPlan {
    return buildSessionReplayPlan(this.getRecoverySnapshot(sessionId));
  }

  buildRuntimeStateSeed(
    sessionId: string,
    options: RuntimeSeedOptions = {},
  ): QueryRuntimeStateSeed {
    return buildResumeReplayInput({
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
    const aggregate = new Map<string, ProjectContextSummary>();
    const sessions = this.listSessions();
    for (const session of sessions) {
      const summary = this.describeSessionReentry(session.id);
      const reentryRecoverable =
        (summary.status === "interrupted" || summary.status === "error") &&
        summary.recoverable;
      const current = aggregate.get(summary.projectRoot);
      if (!current) {
        aggregate.set(summary.projectRoot, {
          projectRoot: summary.projectRoot,
          lastUpdatedAt: summary.updatedAt,
          lastSessionId: summary.id,
          sessionCount: 1,
          recoverableCount: reentryRecoverable ? 1 : 0,
          lastSessionTitle: summary.title,
        });
        continue;
      }

      const shouldReplaceLast =
        new Date(summary.updatedAt).getTime() >
        new Date(current.lastUpdatedAt).getTime();
      aggregate.set(summary.projectRoot, {
        projectRoot: current.projectRoot,
        lastUpdatedAt: shouldReplaceLast ? summary.updatedAt : current.lastUpdatedAt,
        lastSessionId: shouldReplaceLast ? summary.id : current.lastSessionId,
        sessionCount: current.sessionCount + 1,
        recoverableCount: current.recoverableCount + (reentryRecoverable ? 1 : 0),
        lastSessionTitle:
          shouldReplaceLast && summary.title ? summary.title : current.lastSessionTitle,
      });
    }

    const ordered = Array.from(aggregate.values()).sort(
      (left, right) =>
        new Date(right.lastUpdatedAt).getTime() -
        new Date(left.lastUpdatedAt).getTime(),
    );
    return ordered.slice(0, limit);
  }

  listReentrySummaries(input?: {
    readonly limit?: number;
    readonly preferredProjectRoot?: string;
  }): SessionReentrySummary[] {
    const preferredProjectRoot = input?.preferredProjectRoot?.trim();
    const summaries = this.listSessions().map((session) =>
      this.describeSessionReentry(session.id),
    );

    const scored = summaries.map((summary) => ({
      summary,
      score: scoreSessionReentrySummary({ summary, preferredProjectRoot }),
    }));
    scored.sort((left, right) => right.score - left.score);
    const sorted = scored.map((item) => item.summary);

    if (!input?.limit || input.limit <= 0) {
      return sorted;
    }

    return sorted.slice(0, input.limit);
  }

  getSuggestedRecoverySession(input?: {
    readonly preferredProjectRoot?: string;
  }): Session | null {
    const preferredProjectRoot = input?.preferredProjectRoot?.trim();
    if (!preferredProjectRoot) {
      return (
        this.listSessions().find((session) => {
          if (session.status !== "interrupted" && session.status !== "error") {
            return false;
          }

          return this.evaluateRecoveryTrustBoundary(session).recoverable;
        }) ?? null
      );
    }

    const preferredRecoverable = this.listReentrySummaries({
      preferredProjectRoot,
    }).find(
      (summary) =>
        summary.recoverable &&
        summary.projectRoot.trim() === preferredProjectRoot,
    );

    if (preferredRecoverable) {
      return this.load(preferredRecoverable.id);
    }
    return null;
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

  private normalizeProjectRootKey(projectRoot: string): string {
    return normalizeProjectRootKey(projectRoot);
  }

  private readCurrentSessionStore(): CurrentSessionSelectionStore {
    if (!fs.existsSync(this.currentSessionStorePath)) {
      this.lastCurrentSessionStoreReadError = null;
      return createEmptyCurrentSessionSelectionStore();
    }

    try {
      const parsed = JSON.parse(
        fs.readFileSync(this.currentSessionStorePath, "utf8"),
      ) as Partial<CurrentSessionSelectionStore>;
      const result = parseCurrentSessionSelectionStore(
        parsed,
        this.currentSessionStorePath,
      );
      this.lastCurrentSessionStoreReadError = result.readError;
      return result.store;
    } catch (error) {
      this.lastCurrentSessionStoreReadError =
        error instanceof Error ? error.message : String(error);
      return createEmptyCurrentSessionSelectionStore();
    }
  }

  private writeCurrentSessionStore(store: CurrentSessionSelectionStore): void {
    const storeDir = path.dirname(this.currentSessionStorePath);
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
    fs.writeFileSync(
      this.currentSessionStorePath,
      JSON.stringify(store, null, 2),
      "utf8",
    );
  }

  private removeCurrentSessionSelection(normalizedProjectRoot: string): void {
    const current = this.readCurrentSessionStore();
    if (!current.byProjectRoot[normalizedProjectRoot]) {
      return;
    }

    const nextByProjectRoot = { ...current.byProjectRoot };
    delete nextByProjectRoot[normalizedProjectRoot];
    this.writeCurrentSessionStore({
      schemaVersion: 1,
      byProjectRoot: nextByProjectRoot,
    });
  }

  getRecoveryTrustBoundaryBlock(input?: {
    readonly preferredProjectRoot?: string;
  }): RecoveryTrustBoundaryBlock | null {
    const preferredProjectRoot = input?.preferredProjectRoot?.trim();
    const sessions = this.listSessions();
    const orderedSessions = preferredProjectRoot
      ? [
          ...sessions.filter(
            (session) =>
              session.projectRoot.trim() === preferredProjectRoot,
          ),
          ...sessions.filter(
            (session) =>
              session.projectRoot.trim() !== preferredProjectRoot,
          ),
        ]
      : sessions;

    for (const session of orderedSessions) {
      if (session.status !== "interrupted" && session.status !== "error") {
        continue;
      }

      const trustBoundary = this.evaluateRecoveryTrustBoundary(session);
      if (!trustBoundary.recoverable && trustBoundary.block) {
        return trustBoundary.block;
      }
    }

    return null;
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
    const lastRunErrorEvent = this.findLastLifecycleEvent(
      transcriptEvents,
      "run-error",
    );
    const lastQueryCompletion = this.findLastQueryCompletionEvent(transcriptEvents);
    const lastCodingCompletion =
      this.findLastCodingCompletionEvent(transcriptEvents);
    const lastCodingResult = lastCodingCompletion?.event.result.codingResult;
    const recentCodingResults = this.collectRecentCodingResults(
      transcriptEvents,
      4,
    );
    const lastGroundedDeliverableMode =
      this.extractGroundedDeliverableMode(lastCodingResult?.continuation.evidence);
    const lastReadDeliveredLines = this.extractLastReadDeliveredLines(
      lastCodingResult?.continuation.evidence,
    );
    const lastReadWindow = this.extractLastReadWindow(
      lastCodingResult?.continuation.evidence,
    );
    const lastReadFragment = this.extractLastReadFragment(
      lastCodingResult?.continuation.evidence,
    );
    const stagedRepairProgress = this.extractStagedRepairProgress(
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
      this.extractLastAnswerDefect(lastCodingResult) ?? undefined;
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
      this.findLastTurnContent(session.turns, "user");
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
          `stop-reason:${this.compactText(continuityTerminalSource.event.result.stopReason, 180)}`,
        );
      }
    } else if (lastRunErrorEvent?.detail?.trim()) {
      unresolvedItems.push(
        `previous-run-error:${this.compactText(lastRunErrorEvent.detail, 180)}`,
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
        this.findLastTurnContent(session.turns, "assistant"),
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

  private extractGroundedDeliverableMode(
    evidence: readonly string[] | undefined,
  ): "read" | "summary" | "explain" | undefined {
    if (!evidence?.length) {
      return undefined;
    }
    for (let index = evidence.length - 1; index >= 0; index -= 1) {
      const item = evidence[index]?.trim().toLowerCase();
      if (!item) {
        continue;
      }
      const match = item.match(/^deliverable-mode:(read|summary|explain)$/);
      if (match?.[1]) {
        return match[1] as "read" | "summary" | "explain";
      }
    }
    return undefined;
  }

  private extractLastReadDeliveredLines(
    evidence: readonly string[] | undefined,
  ): number | undefined {
    if (!evidence?.length) {
      return undefined;
    }
    for (let index = evidence.length - 1; index >= 0; index -= 1) {
      const item = evidence[index]?.trim().toLowerCase();
      if (!item) {
        continue;
      }
      const match = item.match(/^read-delivered-lines:(\d+)$/);
      if (!match?.[1]) {
        continue;
      }
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return undefined;
  }

  private extractLastReadWindow(
    evidence: readonly string[] | undefined,
  ): { start?: number; end?: number; size?: number } {
    if (!evidence?.length) {
      return {};
    }
    let start: number | undefined;
    let end: number | undefined;
    let size: number | undefined;
    for (let index = evidence.length - 1; index >= 0; index -= 1) {
      const item = evidence[index]?.trim().toLowerCase();
      if (!item) {
        continue;
      }
      if (start === undefined) {
        const match = item.match(/^read-window-start:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            start = parsed;
          }
        }
      }
      if (end === undefined) {
        const match = item.match(/^read-window-end:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            end = parsed;
          }
        }
      }
      if (size === undefined) {
        const match = item.match(/^read-window-size:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            size = parsed;
          }
        }
      }
      if (start !== undefined && end !== undefined && size !== undefined) {
        break;
      }
    }
    return { start, end, size };
  }

  private extractLastReadFragment(
    evidence: readonly string[] | undefined,
  ): {
    start?: number;
    end?: number;
    lineIndexes?: number[];
    ranges?: string[];
    sourceWindowStart?: number;
    sourceWindowEnd?: number;
    fingerprint?: string;
    filter?: "none" | "function-definitions";
  } {
    if (!evidence?.length) {
      return {};
    }
    let start: number | undefined;
    let end: number | undefined;
    let lineIndexes: number[] | undefined;
    let ranges: string[] | undefined;
    let sourceWindowStart: number | undefined;
    let sourceWindowEnd: number | undefined;
    let fingerprint: string | undefined;
    let filter: "none" | "function-definitions" | undefined;
    for (let index = evidence.length - 1; index >= 0; index -= 1) {
      const item = evidence[index]?.trim().toLowerCase();
      if (!item) {
        continue;
      }
      if (start === undefined) {
        const match = item.match(/^read-fragment-start:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            start = parsed;
          }
        }
      }
      if (end === undefined) {
        const match = item.match(/^read-fragment-end:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            end = parsed;
          }
        }
      }
      if (lineIndexes === undefined) {
        const match = item.match(/^read-fragment-line-indexes:([0-9,\s]+)$/);
        if (match?.[1]) {
          const parsed = match[1]
            .split(",")
            .map((value) => Number.parseInt(value.trim(), 10))
            .filter((value) => Number.isFinite(value) && value >= 0)
            .map((value) => Math.floor(value));
          if (parsed.length > 0) {
            lineIndexes = Array.from(new Set(parsed)).sort((a, b) => a - b);
          }
        }
      }
      if (ranges === undefined) {
        const match = item.match(/^read-fragment-ranges:([0-9;,\s-]+)$/);
        if (match?.[1]) {
          const parsed = match[1]
            .split(";")
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
          if (parsed.length > 0) {
            ranges = parsed;
          }
        }
      }
      if (sourceWindowStart === undefined) {
        const match = item.match(/^read-fragment-source-window-start:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            sourceWindowStart = parsed;
          }
        }
      }
      if (sourceWindowEnd === undefined) {
        const match = item.match(/^read-fragment-source-window-end:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            sourceWindowEnd = parsed;
          }
        }
      }
      if (filter === undefined) {
        const match = item.match(/^repair-read-filter:(none|function-definitions)$/);
        if (match?.[1] === "none" || match?.[1] === "function-definitions") {
          filter = match[1];
        }
      }
      if (fingerprint === undefined) {
        const match = item.match(/^read-fragment-fingerprint:([0-9a-f]{64})$/);
        if (match?.[1]) {
          fingerprint = match[1];
        }
      }
      if (
        start !== undefined &&
        end !== undefined &&
        lineIndexes !== undefined &&
        filter !== undefined
      ) {
        break;
      }
    }
    return {
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
      ...(lineIndexes?.length ? { lineIndexes } : {}),
      ...(ranges?.length ? { ranges } : {}),
      ...(sourceWindowStart !== undefined ? { sourceWindowStart } : {}),
      ...(sourceWindowEnd !== undefined ? { sourceWindowEnd } : {}),
      ...(fingerprint ? { fingerprint } : {}),
      ...(filter ? { filter } : {}),
    };
  }

  private extractStagedRepairProgress(
    evidence: readonly string[] | undefined,
  ): {
    stepCount?: number;
    completedStep?: number;
    blockedStep?: number;
    nextStep?: number;
  } {
    if (!evidence?.length) {
      return {};
    }
    let stepCount: number | undefined;
    let completedStep: number | undefined;
    let blockedStep: number | undefined;
    let nextStep: number | undefined;

    for (let index = evidence.length - 1; index >= 0; index -= 1) {
      const item = evidence[index]?.trim().toLowerCase();
      if (!item) {
        continue;
      }
      if (stepCount === undefined) {
        const match = item.match(/^staged-repair-(?:step-total|steps):(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            stepCount = parsed;
          }
        }
      }
      if (completedStep === undefined) {
        const match = item.match(
          /^staged-repair-(?:completed-step|step-cursor):(\d+)$/,
        );
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            completedStep = parsed;
          }
        }
      }
      if (blockedStep === undefined) {
        const match = item.match(/^staged-repair-blocked-step:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            blockedStep = parsed;
          }
        }
      }
      if (nextStep === undefined) {
        const match = item.match(/^staged-repair-next-step:(\d+)$/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            nextStep = parsed;
          }
        }
      }
      if (
        stepCount !== undefined &&
        completedStep !== undefined &&
        blockedStep !== undefined &&
        nextStep !== undefined
      ) {
        break;
      }
    }

    return { stepCount, completedStep, blockedStep, nextStep };
  }

  private extractLastAnswerDefect(
    codingResult:
      | {
          readonly taskSatisfaction?: {
            readonly verdict?: string;
            readonly reasons?: readonly string[];
          };
        }
      | undefined,
  ): string | undefined {
    const reasons = codingResult?.taskSatisfaction?.reasons ?? [];
    if (reasons.length === 0) {
      return undefined;
    }
    const first = reasons[0]?.trim();
    if (!first) {
      return undefined;
    }
    if (codingResult?.taskSatisfaction?.verdict === "satisfied") {
      return undefined;
    }
    return first;
  }

  private findLastQueryCompletionEvent(
    transcriptEvents: readonly TranscriptEvent[],
  ):
    | Extract<TranscriptEvent, { type: "query-event" }> & {
        event: Extract<QueryEvent, { type: "query.completed" }>;
      }
    | undefined {
    for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
      const event = transcriptEvents[index];
      if (event?.type !== "query-event") {
        continue;
      }
      if (event.event.type === "query.completed") {
        return event as Extract<TranscriptEvent, { type: "query-event" }> & {
          event: Extract<QueryEvent, { type: "query.completed" }>;
        };
      }
    }
    return undefined;
  }

  private findLastLifecycleEvent(
    transcriptEvents: readonly TranscriptEvent[],
    lifecycleEvent: Extract<TranscriptEvent, { type: "lifecycle" }>["event"],
  ): Extract<TranscriptEvent, { type: "lifecycle" }> | undefined {
    for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
      const event = transcriptEvents[index];
      if (event?.type !== "lifecycle") {
        continue;
      }
      if (event.event === lifecycleEvent) {
        return event;
      }
    }
    return undefined;
  }

  private findLastCodingCompletionEvent(
    transcriptEvents: readonly TranscriptEvent[],
  ):
    | (Extract<TranscriptEvent, { type: "query-event" }> & {
        event: Extract<QueryEvent, { type: "query.completed" }>;
      })
    | undefined {
    let fallback:
      | (Extract<TranscriptEvent, { type: "query-event" }> & {
          event: Extract<QueryEvent, { type: "query.completed" }>;
        })
      | undefined;
    for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
      const event = transcriptEvents[index];
      if (event?.type !== "query-event") {
        continue;
      }
      if (event.event.type !== "query.completed") {
        continue;
      }
      if (event.event.result.codingResult) {
        const typedEvent = event as Extract<TranscriptEvent, { type: "query-event" }> & {
          event: Extract<QueryEvent, { type: "query.completed" }>;
        };
        if (typedEvent.event.result.codingResult.taskKind !== "chat") {
          return typedEvent;
        }
        if (!fallback) {
          fallback = typedEvent;
        }
      }
    }
    return fallback;
  }

  private collectRecentCodingResults(
    transcriptEvents: readonly TranscriptEvent[],
    limit: number,
  ): Array<
    NonNullable<Extract<QueryEvent, { type: "query.completed" }>["result"]["codingResult"]>
  > {
    const collected: Array<
      NonNullable<Extract<QueryEvent, { type: "query.completed" }>["result"]["codingResult"]>
    > = [];
    for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
      if (collected.length >= limit) {
        break;
      }
      const event = transcriptEvents[index];
      if (event?.type !== "query-event" || event.event.type !== "query.completed") {
        continue;
      }
      const codingResult = event.event.result.codingResult;
      if (!codingResult || codingResult.taskKind === "chat") {
        continue;
      }
      collected.push(codingResult);
    }
    return collected;
  }

  private findLastTurnContent(
    turns: readonly SessionMessage[],
    role: SessionMessage["role"],
  ): string | undefined {
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (turn.role === role && turn.content.trim().length > 0) {
        return turn.content;
      }
    }
    return undefined;
  }

  private compactText(input: string, max: number = 220): string {
    const normalized = input.replace(/\s+/g, " ").trim();
    if (normalized.length <= max) {
      return normalized;
    }
    return `${normalized.slice(0, max)}...`;
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeOptionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "yes" || normalized === "true") {
      return true;
    }
    if (normalized === "no" || normalized === "false") {
      return false;
    }
    return undefined;
  }

  private normalizeWriteEffect(value: unknown): CodingWriteEffect | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "none" ||
      normalized === "unknown" ||
      normalized === "unverified" ||
      normalized === "verified"
    ) {
      return normalized;
    }
    return undefined;
  }

  private extractSummaryString(
    summaryEntries: readonly string[],
    key: string,
  ): string | undefined {
    const prefix = `${key.toLowerCase()}:`;
    for (const entry of summaryEntries) {
      const normalized = entry.trim().startsWith("- ")
        ? entry.trim().slice(2).trim()
        : entry.trim();
      if (normalized.toLowerCase().startsWith(prefix)) {
        const value = normalized.slice(prefix.length).trim();
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  }

  private extractSummaryBoolean(
    summaryEntries: readonly string[],
    key: string,
  ): boolean | undefined {
    return this.normalizeOptionalBoolean(
      this.extractSummaryString(summaryEntries, key),
    );
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
      this.findLastQueryCompletionEvent(snapshot.transcriptEvents) !== undefined;
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
    const sessionDir = this.getSessionDir(session.id);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    if (!fs.existsSync(this.getTranscriptPath(session.id))) {
      fs.writeFileSync(this.getTranscriptPath(session.id), "", "utf8");
    }

    this.writeSessionMetadata(session);
    this.writeSessionState(session);
  }

  private writeSessionMetadata(session: Session): void {
    const metadata: SessionMetadata = projectSessionMetadata(session);
    fs.writeFileSync(
      this.getMetadataPath(session.id),
      JSON.stringify(metadata, null, 2),
      "utf8",
    );
  }

  private writeSessionState(
    session: Session,
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
  ): void {
    this.withSessionStateLock(session.id, () => {
      const statePath = this.getStatePath(session.id);
      const current = this.readStateSnapshotSafely(statePath);
      const snapshot = this.buildSessionStateSnapshot(session, current, overrides);
      this.writeJsonFileAtomic(statePath, snapshot);
    });
  }

  private appendTranscriptEvent(
    sessionId: string,
    event: TranscriptEvent,
  ): void {
    fs.appendFileSync(
      this.getTranscriptPath(sessionId),
      `${encodeTranscriptEvent(event)}\n`,
      "utf8",
    );
  }

  private findCompensatedLifecycleEvent(
    sessionId: string,
    input:
      | { type: "approval.resolved"; taskId: string; toolName: string }
      | { type: "tool.result"; taskId: string; toolName: string },
  ):
    | Extract<QueryEvent, { type: "approval.resolved" | "tool.result" }>
    | undefined {
    return this.getTranscriptEvents(sessionId).find(
      (
        event,
      ): event is Extract<TranscriptEvent, { type: "query-event" }> & {
        event: Extract<
          QueryEvent,
          { type: "approval.resolved" | "tool.result" }
        >;
      } => {
        if (event.type !== "query-event") {
          return false;
        }

        if (event.event.type !== input.type) {
          return false;
        }

        if (
          event.event.taskId !== input.taskId ||
          event.event.toolName !== input.toolName
        ) {
          return false;
        }

        return true;
      },
    )?.event;
  }

  private applyQueryEventToState(sessionId: string, event: QueryEvent): void {
    const session = this.load(sessionId);
    this.withSessionStateLock(sessionId, () => {
      const statePath = this.getStatePath(sessionId);
      const current = this.readStateSnapshotSafely(statePath);
      const nextWorkingMemory = this.applyAutoCompactRetention(
        current?.workingMemory,
        event,
      );
      const snapshot = this.buildSessionStateSnapshot(session, current, {
        pendingLifecycle: applyLifecycleEventToIndex(
          current?.pendingLifecycle ?? createEmptyLifecycleIndex(),
          event,
        ),
      });
      if (nextWorkingMemory !== undefined) {
        snapshot.workingMemory = nextWorkingMemory;
      }
      this.writeJsonFileAtomic(statePath, snapshot);
    });
  }

  private applyAutoCompactRetention(
    workingMemory: unknown,
    event: QueryEvent,
  ): unknown {
    const now = new Date().toISOString();
    const queryCompleted =
      event.type === "query.completed" ? event : undefined;
    const approvalAudit = decodeApprovalMemory(workingMemory);
    const approvalAuditHistory = decodeApprovalMemoryHistory(workingMemory, {
      historyLimit: SessionManager.APPROVAL_AUDIT_HISTORY_LIMIT,
    });
    const actionHandoffSummary = buildActionHandoffSummary(
      queryCompleted?.result.codingResult?.lastActionResultSeed,
    );
    const stoppedSessionContinuity = deriveStoppedSessionContinuitySurface(
      queryCompleted?.result.codingResult,
    );
    const seedInfluence = this.extractSeedInfluenceFromQueryResult(
      queryCompleted?.result,
    );
    const seedInfluenceHandoffSummary = buildSeedInfluenceHandoffSummary(
      queryCompleted?.result.codingResult?.lastActionResultSeed,
      seedInfluence,
    );
    const successHandoffDiagnostic = buildSuccessHandoffDiagnostic(
      queryCompleted?.result.codingResult,
    );
    return applyCompactRetentionPlan(
      projectCompactRetentionPlanInput({
        workingMemory,
        event,
        turnThreshold: SessionManager.AUTO_COMPACT_TURN_THRESHOLD,
        now,
        ...(approvalAudit ? { approvalAudit } : {}),
        approvalAuditHistory,
        ...(actionHandoffSummary ? { actionHandoffSummary } : {}),
        ...(stoppedSessionContinuity?.writeContinuity
          ? { writeContinuity: stoppedSessionContinuity.writeContinuity }
          : {}),
        ...(seedInfluence ? { seedInfluence } : {}),
        ...(seedInfluenceHandoffSummary ? { seedInfluenceHandoffSummary } : {}),
        ...(stoppedSessionContinuity?.failureHandoffDiagnostic
          ? {
              failureHandoffDiagnostic:
                stoppedSessionContinuity.failureHandoffDiagnostic,
            }
          : {}),
        ...(successHandoffDiagnostic ? { successHandoffDiagnostic } : {}),
      }),
    );
  }

  private extractSeedInfluenceFromQueryResult(
    result: Extract<QueryEvent, { type: "query.completed" }>["result"] | undefined,
  ): SeedInfluenceDiagnostic | undefined {
    if (!result) {
      return undefined;
    }
    return this.extractSeedInfluenceFromStrings([
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
      const fromContinuity = this.parseSeedInfluence(
        this.normalizeOptionalString(continuity.lastSeedInfluence),
      );
      if (fromContinuity) {
        return fromContinuity;
      }
    }
    const summaryEntries = Array.isArray(root.summary)
      ? root.summary.filter((entry): entry is string => typeof entry === "string")
      : [];
    return this.extractSeedInfluenceFromStrings(summaryEntries);
  }

  private extractSeedInfluenceFromStrings(
    entries: readonly string[],
  ): SeedInfluenceDiagnostic | undefined {
    for (const entry of entries) {
      const influence = this.parseSeedInfluence(entry);
      if (influence) {
        return influence;
      }
    }
    return undefined;
  }

  private parseSeedInfluence(
    raw: string | undefined,
  ): SeedInfluenceDiagnostic | undefined {
    if (!raw) {
      return undefined;
    }
    const direct = raw.trim().toLowerCase();
    if (
      direct === "target-carryover" ||
      direct === "verify-signal" ||
      direct === "ignored-explicit-target"
    ) {
      return direct;
    }
    const match = direct.match(
      /\bseedInfluence=(target-carryover|verify-signal|ignored-explicit-target)\b/i,
    );
    return match?.[1] as SeedInfluenceDiagnostic | undefined;
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
      const candidate = this.normalizeOptionalString(
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
      this.normalizeOptionalBoolean(continuity?.lastWriterStarted) ??
      this.extractSummaryBoolean(summaryEntries, "last-writer-started");
    const requiresUserInspection =
      this.normalizeOptionalBoolean(
        continuity?.lastWriteRequiresUserInspection,
      ) ??
      this.extractSummaryBoolean(
        summaryEntries,
        "last-write-requires-user-inspection",
      );
    const writeEffect = this.normalizeWriteEffect(
      continuity?.lastWriteEffect,
    ) ?? this.normalizeWriteEffect(
      this.extractSummaryString(summaryEntries, "last-write-effect"),
    );
    const target =
      this.normalizeOptionalString(continuity?.lastWriteEffectTarget) ??
      this.extractSummaryString(summaryEntries, "last-write-effect-target");
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
      const candidate = this.normalizeOptionalString(
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
      const candidate = this.normalizeOptionalString(
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
      const candidate = this.normalizeOptionalString(
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

  private load(sessionId: string): Session {
    const sessionDir = this.getSessionDir(sessionId);
    const metadataPath = this.getMetadataPath(sessionId);
    const statePath = this.getStatePath(sessionId);
    const transcriptPath = this.getTranscriptPath(sessionId);

    if (
      !fs.existsSync(sessionDir) ||
      !fs.existsSync(metadataPath) ||
      !fs.existsSync(transcriptPath)
    ) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      const metadata = this.readJsonFileWithRetry<SessionMetadata>(metadataPath, {
        required: true,
        parseErrorDetail: `Failed to load session ${sessionId}`,
      });
      const state = this.readStateSnapshotRequired(statePath);
      const transcriptLines = fs
        .readFileSync(transcriptPath, "utf8")
        .split("\n")
        .filter(Boolean);
      const parsedEvents = transcriptLines.map((line) =>
        transcriptEventToSessionMessage(decodeTranscriptLine(line)) ?? null,
      );
      const turns: SessionMessage[] = parsedEvents.filter(
        (event): event is SessionMessage => event !== null,
      );

      return {
        id: metadata.id,
        projectRoot:
          metadata.projectRoot?.trim() ||
          state.projectRoot?.trim() ||
          process.cwd(),
        ...(metadata.rootMode ? { rootMode: metadata.rootMode } : {}),
        ...(metadata.requestedWorkspaceRoot?.trim()
          ? { requestedWorkspaceRoot: metadata.requestedWorkspaceRoot.trim() }
          : {}),
        ...(metadata.targetPathBase?.trim()
          ? { targetPathBase: metadata.targetPathBase.trim() }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(metadata, "gitRoot")
          ? { gitRoot: metadata.gitRoot?.trim() || null }
          : {}),
        title: metadata.title,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        status: state.status,
        pendingPrompt: state.pendingPrompt,
        lastError: state.lastError,
        turns,
      };
    } catch (error) {
      throw new Error(
        `Failed to load session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private readStateSnapshotSafely(
    statePath: string,
  ): SessionStateSnapshot | undefined {
    return this.readJsonFileWithRetry<SessionStateSnapshot>(statePath, {
      required: false,
      parseErrorDetail: "Invalid state snapshot",
    });
  }

  private readStateSnapshotRequired(statePath: string): SessionStateSnapshot {
    const state = this.readJsonFileWithRetry<SessionStateSnapshot>(statePath, {
      required: true,
      parseErrorDetail: `Failed to load session state from ${statePath}`,
    });
    if (!state) {
      throw new Error(`Session state missing at ${statePath}`);
    }
    return state;
  }

  private readJsonFileWithRetry<T>(
    filePath: string,
    options: { required: boolean; parseErrorDetail: string },
  ): T | undefined {
    const maxAttempts = SessionManager.STATE_IO_MAX_ATTEMPTS;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (!fs.existsSync(filePath)) {
          if (options.required && attempt === maxAttempts) {
            throw new Error(`File missing at ${filePath}`);
          }
          if (!options.required) {
            return undefined;
          }
          this.sleepBlocking(SessionManager.STATE_IO_RETRY_DELAY_MS);
          continue;
        }
        const raw = fs.readFileSync(filePath, "utf8").trim();
        if (raw.length === 0) {
          if (options.required && attempt === maxAttempts) {
            throw new Error(`File empty at ${filePath}`);
          }
          if (!options.required) {
            return undefined;
          }
          this.sleepBlocking(SessionManager.STATE_IO_RETRY_DELAY_MS);
          continue;
        }
        return JSON.parse(raw) as T;
      } catch (error) {
        if (!this.isTransientIoError(error) || attempt === maxAttempts) {
          if (error instanceof Error && /Unexpected token|JSON/.test(error.message)) {
            if (!options.required) {
              return undefined;
            }
            throw new Error(`${options.parseErrorDetail}: ${error.message}`);
          }
          throw error;
        }
        this.sleepBlocking(SessionManager.STATE_IO_RETRY_DELAY_MS);
      }
    }
    return undefined;
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
    return {
      status: session.status,
      projectRoot: session.projectRoot,
      pendingPrompt: session.pendingPrompt,
      lastError: session.lastError,
      runPhase:
        overrides && Object.prototype.hasOwnProperty.call(overrides, "runPhase")
          ? overrides.runPhase
          : (current?.runPhase ?? "idle"),
      interruptedKind:
        overrides &&
        Object.prototype.hasOwnProperty.call(overrides, "interruptedKind")
          ? overrides.interruptedKind
          : current?.interruptedKind,
      terminalReason:
        overrides &&
        Object.prototype.hasOwnProperty.call(overrides, "terminalReason")
          ? overrides.terminalReason
          : current?.terminalReason,
      terminalClassification:
        overrides &&
        Object.prototype.hasOwnProperty.call(
          overrides,
          "terminalClassification",
        )
          ? overrides.terminalClassification
          : current?.terminalClassification,
      durableStatus: projectDurableStatus(
        overrides &&
          Object.prototype.hasOwnProperty.call(
            overrides,
            "terminalClassification",
          )
          ? overrides.terminalClassification
          : current?.terminalClassification,
        session.status,
      ),
      lastContinuationReason:
        overrides &&
        Object.prototype.hasOwnProperty.call(
          overrides,
          "lastContinuationReason",
        )
          ? overrides.lastContinuationReason
          : current?.lastContinuationReason,
      pendingLifecycle:
        overrides &&
        Object.prototype.hasOwnProperty.call(overrides, "pendingLifecycle")
          ? overrides.pendingLifecycle
          : (current?.pendingLifecycle ?? createEmptyLifecycleIndex()),
      workingMemory: current?.workingMemory,
    };
  }

  private withSessionStateLock<T>(sessionId: string, action: () => T): T {
    const lockPath = this.getStateLockPath(sessionId);
    return this.withFileLock(lockPath, action);
  }

  private withFileLock<T>(lockPath: string, action: () => T): T {
    const directory = path.dirname(lockPath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    const startedAt = Date.now();
    while (true) {
      let fd: number | undefined;
      try {
        fd = fs.openSync(lockPath, "wx");
        try {
          return action();
        } finally {
          if (fd !== undefined) {
            fs.closeSync(fd);
            fd = undefined;
          }
          try {
            fs.rmSync(lockPath, { force: true });
          } catch {
            // ignore lock cleanup race
          }
        }
      } catch (error) {
        if (!this.isTransientLockError(error)) {
          throw error;
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed >= SessionManager.STATE_LOCK_TIMEOUT_MS) {
          throw new Error(`Session state lock timeout at ${lockPath}`);
        }
        this.sleepBlocking(SessionManager.STATE_LOCK_RETRY_DELAY_MS);
      } finally {
        if (fd !== undefined) {
          try {
            fs.closeSync(fd);
          } catch {
            // already closed
          }
        }
      }
    }
  }

  private sleepBlocking(milliseconds: number): void {
    if (milliseconds <= 0) {
      return;
    }
    const slot = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(slot, 0, 0, milliseconds);
  }

  private isTransientLockError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EEXIST" || code === "EPERM" || code === "EBUSY";
  }

  private isTransientIoError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const code = (error as NodeJS.ErrnoException).code;
    return (
      code === "ENOENT" ||
      code === "EPERM" ||
      code === "EBUSY" ||
      code === "EMFILE" ||
      code === "ENFILE"
    );
  }

  private writeJsonFileAtomic(filePath: string, payload: unknown): void {
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    const serialized = JSON.stringify(payload, null, 2);
    const tempFd = fs.openSync(tempPath, "w");
    try {
      fs.writeFileSync(tempFd, serialized, "utf8");
      fs.fsyncSync(tempFd);
    } finally {
      fs.closeSync(tempFd);
    }

    try {
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      if (!this.isTransientIoError(error)) {
        throw error;
      }
      fs.writeFileSync(filePath, serialized, "utf8");
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
    }
  }
}
