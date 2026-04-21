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
  ContinuationEvidenceToken,
  ContinuationPolicyEvidence,
  ContinuationSafety,
  QueryRuntimeRecoveryBoundary,
  QueryRuntimeRepairSummary,
  QueryRuntimeStateSeed,
} from "../core/query/runtimeState.js";
import {
  buildContinuationPolicyEvidence,
  CONTINUATION_SAFETY_POLICY,
  resolveContinuationSafety,
} from "../core/query/runtimeState.js";
import {
  applyLifecycleEventToIndex,
  createEmptyLifecycleIndex,
  type DurableLifecycleIndex,
} from "../core/tools/toolResultLifecycle.js";
import type {
  AgentExecutionOutput,
  AgentRole,
  CodingTaskKind,
  ContinuationReason,
  TerminalClassification,
  TerminalReason,
} from "../orchestration/types.js";

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface Session {
  id: string;
  projectRoot: string;
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

export interface SessionContinuitySnapshot {
  readonly sessionId: string;
  readonly projectRoot: string;
  readonly continuationFamilyId?: string;
  readonly continuationEpoch?: number;
  readonly continuationFamilyAnchor?: string;
  readonly lastUserIntent?: string;
  readonly lastAssistantOutput?: string;
  readonly lastTerminalClassification?: TerminalClassification;
  readonly lastTerminalReason?: TerminalReason;
  readonly lastDurableStatus?: "success" | "stopped" | "error";
  readonly lastRecoveryDisposition?:
    | "fully-resumable"
    | "partially-resumable"
    | "not-resumable";
  readonly lastFailure?: string;
  readonly lastTaskKind?: CodingTaskKind;
  readonly lastGroundedDeliverableMode?: "read" | "summary" | "explain";
  readonly lastReadDeliveredLines?: number;
  readonly lastReadWindowStart?: number;
  readonly lastReadWindowEnd?: number;
  readonly lastReadWindowSize?: number;
  readonly lastReadFragmentStart?: number;
  readonly lastReadFragmentEnd?: number;
  readonly lastReadFragmentLineIndexes?: readonly number[];
  readonly lastReadFragmentRanges?: readonly string[];
  readonly lastReadFragmentSourceWindowStart?: number;
  readonly lastReadFragmentSourceWindowEnd?: number;
  readonly lastReadFragmentFingerprint?: string;
  readonly lastReadFragmentStructureSignature?: string;
  readonly lastReadFragmentNeighborhoodSignature?: string;
  readonly lastReadFilter?: "none" | "function-definitions";
  readonly lastStagedRepairStepCount?: number;
  readonly lastStagedRepairCompletedStep?: number;
  readonly lastStagedRepairBlockedStep?: number;
  readonly lastStagedRepairNextStep?: number;
  readonly lastAnswerDefect?: string;
  readonly recentChangedFiles: readonly string[];
  readonly recentTargetFiles: readonly string[];
  readonly recentFailedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly recentVerifiedFiles: readonly string[];
  readonly lastVerificationStatus?: string;
  readonly lastVerificationCommand?: string;
  readonly lastVerificationReason?: string;
  readonly lastRepairStatus?: string;
  readonly lastRepairNotes: readonly string[];
  readonly lastContinuationStatus?: string;
  readonly lastContinuationEvidence: readonly string[];
  readonly lastTaskSatisfactionVerdict?: string;
  readonly lastTaskSatisfactionReasons: readonly string[];
  readonly lastStructuredNextStep?: SessionStructuredNextStep;
  readonly lastStructuredNextStepPlan?: SessionStructuredNextStepPlan;
  readonly unresolvedItems: readonly string[];
  readonly freshnessHistoryCount?: number;
  readonly freshnessAgeTurnDistance?: number;
  readonly freshnessAgeNotConsumedTurns?: number;
  readonly workingMemoryCompacted?: boolean;
  readonly workingMemorySourceEventCount?: number;
  readonly workingMemorySourceTurnCount?: number;
  readonly workingMemorySummary?: readonly string[];
  readonly workingMemoryUpdatedAt?: string;
}

type SessionNextStepKind =
  | "run-command"
  | "edit-fix"
  | "read-continuation"
  | "explain-continuation"
  | "summary-continuation"
  | "task-continuation";

interface SessionStructuredNextStep {
  readonly kind: SessionNextStepKind;
  readonly executableNow: boolean;
  readonly confidence: "high" | "medium" | "low";
  readonly reason: string;
  readonly targetPath?: string;
  readonly command?: string;
  readonly replaceFrom?: string;
  readonly replaceTo?: string;
  readonly readLineCount?: number;
  readonly readFilter?: "none" | "function-definitions";
  readonly readFragmentStart?: number;
  readonly readFragmentEnd?: number;
  readonly readFragmentLineIndexes?: readonly number[];
  readonly readFragmentRanges?: readonly string[];
  readonly readFragmentSourceWindowStart?: number;
  readonly readFragmentSourceWindowEnd?: number;
  readonly readFragmentFingerprint?: string;
  readonly readFragmentStructureSignature?: string;
  readonly readFragmentNeighborhoodSignature?: string;
  readonly continuationPrompt?: string;
  readonly missingFields?: readonly string[];
}

export interface SessionMaterializedStepHint {
  readonly kind: SessionNextStepKind;
  readonly targetPath?: string;
  readonly command?: string;
  readonly replaceFrom?: string;
  readonly replaceTo?: string;
  readonly continuationPrompt?: string;
  readonly readLineCount?: number;
  readonly readFilter?: "none" | "function-definitions";
  readonly readFragmentStart?: number;
  readonly readFragmentEnd?: number;
  readonly readFragmentLineIndexes?: readonly number[];
  readonly readFragmentRanges?: readonly string[];
  readonly readFragmentSourceWindowStart?: number;
  readonly readFragmentSourceWindowEnd?: number;
  readonly readFragmentFingerprint?: string;
  readonly readFragmentStructureSignature?: string;
  readonly readFragmentNeighborhoodSignature?: string;
  readonly confidence: "high" | "medium" | "low";
}

interface SessionStructuredNextStepPlanStep extends SessionStructuredNextStep {
  readonly id: string;
  readonly title: string;
}

interface SessionStructuredNextStepPlan {
  readonly planId: string;
  readonly reason: string;
  readonly confidence: "high" | "medium" | "low";
  readonly executableNow: boolean;
  readonly currentStepIndex: number;
  readonly completedStepCount: number;
  readonly steps: readonly SessionStructuredNextStepPlanStep[];
}

interface SessionWorkingMemory {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly sourceEventCount: number;
  readonly sourceTurnCount: number;
  readonly compacted: boolean;
  readonly compactReason?: "event-budget" | "turn-budget" | "none";
  readonly continuity: SessionContinuitySnapshot;
  readonly summary: readonly string[];
}

interface PromptContextAssemblyOptions {
  readonly maxChars?: number;
  readonly recentTurnLimit?: number;
}

interface SessionMetadata {
  id: string;
  projectRoot: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionStateSnapshot {
  status: Session["status"];
  projectRoot?: string;
  pendingPrompt?: string;
  lastError?: string;
  durableStatus?: "success" | "stopped" | "error";
  runPhase?: "idle" | "prompt-persisted" | "turn-active";
  interruptedKind?: "prompt" | "turn";
  terminalReason?: TerminalReason;
  terminalClassification?: TerminalClassification;
  lastContinuationReason?: ContinuationReason;
  pendingLifecycle?: DurableLifecycleIndex;
  workingMemory?: SessionWorkingMemory;
}

interface TranscriptRepairContext {
  readonly sessionId: string;
  readonly state: SessionStateSnapshot;
  readonly pendingPrompt?: string;
  readonly updatedAt: string;
}

export type TranscriptEvent =
  | {
      type: "message";
      role: SessionMessage["role"];
      content: string;
      timestamp: string;
    }
  | {
      type: "lifecycle";
      event:
        | "run-started"
        | "run-interrupted"
        | "run-completed"
        | "run-error"
        | "run-terminated";
      timestamp: string;
      detail?: string;
    }
  | { type: "query-event"; event: QueryEvent; timestamp: string };

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

function toDurableStatus(
  terminalClassification: TerminalClassification | undefined,
  status: Session["status"],
): "success" | "stopped" | "error" | undefined {
  if (terminalClassification === "success" || status === "completed") {
    return "success";
  }

  if (terminalClassification === "stopped") {
    return "stopped";
  }

  if (terminalClassification === "error" || status === "error") {
    return "error";
  }

  return undefined;
}

export interface ReplayPlan {
  readonly normalizedTranscriptEvents: TranscriptEvent[];
  readonly replayMessages: SessionMessage[];
  readonly continuationPrompt?: string;
  readonly requiresAssistantSentinel: boolean;
  readonly repairSummary: QueryRuntimeRepairSummary;
}

interface RuntimeSeedOptions {
  readonly maxTurns?: number;
  readonly fallbackStartingRole?: AgentRole;
}

type TurnStartedQueryEvent = Extract<QueryEvent, { type: "turn.started" }>;
type TurnCompletedQueryEvent = Extract<QueryEvent, { type: "turn.completed" }>;

interface TurnPairingState {
  readonly pairedTurns: Array<{
    readonly started: TurnStartedQueryEvent;
    readonly output: AgentExecutionOutput;
  }>;
  readonly openTurn?: TurnStartedQueryEvent;
  readonly ignoredDuplicateTurnStarts: number;
  readonly ignoredUnpairedTurnCompletions: number;
  readonly ignoredRoleMismatchedTurnCompletions: number;
}

interface ReplayPreparation {
  readonly transcriptEvents: TranscriptEvent[];
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

interface MissingSessionRebindContext {
  readonly requestedMissingSessionId: string;
  readonly projectRoot: string;
  readonly candidateSessionIds: readonly string[];
  readonly createdAt: string;
}

export class SessionManager {
  private static readonly STATE_IO_MAX_ATTEMPTS = 6;
  private static readonly STATE_IO_RETRY_DELAY_MS = 12;
  private static readonly STATE_LOCK_TIMEOUT_MS = 1200;
  private static readonly STATE_LOCK_RETRY_DELAY_MS = 20;
  private static readonly WORKING_MEMORY_EVENT_COMPACT_THRESHOLD = 72;
  private static readonly WORKING_MEMORY_TURN_COMPACT_THRESHOLD = 24;
  private static readonly WORKING_MEMORY_SUMMARY_ITEM_LIMIT = 8;
  private static readonly WORKING_MEMORY_RECENT_FILE_LIMIT = 8;
  private static readonly WORKING_MEMORY_RECENT_FAILURE_LIMIT = 6;
  private static readonly WORKING_MEMORY_EVIDENCE_LIMIT = 10;
  private static readonly WORKING_MEMORY_REPAIR_NOTE_LIMIT = 6;
  private sessionsDir: string;
  private readonly warnedUnreadableSessionDirs = new Set<string>();
  private didWarnListSessionsFailure = false;

  constructor() {
    const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
    this.sessionsDir = path.join(homeDir, ".private-agents", "sessions");
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

  private getMissingSessionRebindPath(): string {
    const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
    return path.join(homeDir, ".private-agents", "missing-session-rebind.json");
  }

  private normalizeProjectRootForComparison(root: string): string {
    const resolved = path.resolve(root.trim());
    if (process.platform === "win32") {
      return resolved.toLowerCase();
    }
    return resolved;
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

  createNewWithId(sessionId: string, projectRoot: string = process.cwd()): Session {
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
    const session: Session = {
      id: normalizedId,
      projectRoot,
      title: undefined,
      createdAt: now,
      updatedAt: now,
      status: "active",
      turns: [],
    };
    this.writeSession(session);
    return session;
  }

  createNew(projectRoot: string = process.cwd()): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: this.generateSessionId(),
      projectRoot,
      title: undefined,
      createdAt: now,
      updatedAt: now,
      status: "active",
      turns: [],
    };

    this.writeSession(session);
    return session;
  }

  getSessionProjectRoot(sessionId: string): string {
    return this.load(sessionId).projectRoot;
  }

  recordMissingSessionRebindContext(input: {
    requestedMissingSessionId: string;
    projectRoot: string;
    candidateSessionIds: readonly string[];
  }): void {
    const payload: MissingSessionRebindContext = {
      requestedMissingSessionId: input.requestedMissingSessionId.trim(),
      projectRoot: input.projectRoot.trim(),
      candidateSessionIds: [...input.candidateSessionIds].map((id) => id.trim()),
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(
        this.getMissingSessionRebindPath(),
        JSON.stringify(payload, null, 2),
        "utf8",
      );
    } catch {
      // Observability helper only; ignore persistence failure.
    }
  }

  consumeMissingSessionRebindContext(input: {
    requestedSessionId: string;
    projectRoot: string;
    maxAgeMs?: number;
  }): { requestedMissingSessionId: string; resolvedSessionId: string } | undefined {
    const filePath = this.getMissingSessionRebindPath();
    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    const clearContext = (): void => {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        // Ignore best-effort cleanup.
      }
    };

    let parsed: MissingSessionRebindContext | undefined;
    try {
      parsed = this.readJsonFileWithRetry<MissingSessionRebindContext>(filePath, {
        required: false,
        parseErrorDetail: "Invalid missing-session rebind context",
      });
    } catch {
      clearContext();
      return undefined;
    }
    if (!parsed) {
      clearContext();
      return undefined;
    }

    const createdAt = Date.parse(parsed.createdAt);
    const now = Date.now();
    const maxAgeMs = input.maxAgeMs ?? 15 * 60 * 1000;
    if (
      !Number.isFinite(createdAt) ||
      createdAt <= 0 ||
      now - createdAt > maxAgeMs
    ) {
      clearContext();
      return undefined;
    }

    const sameProject =
      this.normalizeProjectRootForComparison(parsed.projectRoot) ===
      this.normalizeProjectRootForComparison(input.projectRoot);
    if (!sameProject) {
      return undefined;
    }

    const matched = parsed.candidateSessionIds.some(
      (candidate) => candidate.trim() === input.requestedSessionId.trim(),
    );
    if (!matched) {
      return undefined;
    }

    clearContext();
    return {
      requestedMissingSessionId: parsed.requestedMissingSessionId,
      resolvedSessionId: input.requestedSessionId.trim(),
    };
  }

  rebindSessionProjectRoot(sessionId: string, nextProjectRoot: string): Session {
    const normalizedRoot = nextProjectRoot.trim();
    if (!normalizedRoot) {
      throw new Error("Project root is required for session rebind");
    }
    const session = this.load(sessionId);
    const previousProjectRoot = session.projectRoot;
    const currentState = this.readStateSnapshotSafely(this.getStatePath(sessionId));
    const rebasedWorkingMemory = this.rebaseWorkingMemoryForProjectMigration(
      currentState?.workingMemory,
      previousProjectRoot,
      normalizedRoot,
    );
    session.projectRoot = normalizedRoot;
    session.updatedAt = new Date().toISOString();
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      ...(rebasedWorkingMemory ? { workingMemory: rebasedWorkingMemory } : {}),
    });
    return session;
  }

  private rebaseWorkingMemoryForProjectMigration(
    memory: SessionWorkingMemory | undefined,
    previousProjectRoot: string,
    nextProjectRoot: string,
  ): SessionWorkingMemory | undefined {
    if (!memory) {
      return undefined;
    }
    const oldRoot = path.resolve(previousProjectRoot);
    const newRoot = path.resolve(nextProjectRoot);
    const rebasePath = (candidate: string | undefined): string | undefined => {
      if (!candidate?.trim()) {
        return candidate;
      }
      const raw = candidate.trim();
      if (!path.isAbsolute(raw)) {
        return raw;
      }
      const normalizedRaw = path.resolve(raw);
      const oldWithSep = `${oldRoot}${path.sep}`;
      if (normalizedRaw === oldRoot) {
        return newRoot;
      }
      if (normalizedRaw.startsWith(oldWithSep)) {
        const relative = path.relative(oldRoot, normalizedRaw);
        return path.join(newRoot, relative);
      }
      return undefined;
    };
    const rebaseTextPaths = (text: string): string => {
      if (!text.includes(oldRoot)) {
        return text;
      }
      return text.split(oldRoot).join(newRoot);
    };

    const continuity = memory.continuity;
    const rebasedAnchor = rebasePath(continuity.continuationFamilyAnchor);
    const rebasedTargets = (continuity.recentTargetFiles ?? [])
      .map((item) => rebasePath(item) ?? item)
      .filter((item): item is string => Boolean(item?.trim()));
    const rebasedChanged = (continuity.recentChangedFiles ?? [])
      .map((item) => rebasePath(item) ?? item)
      .filter((item): item is string => Boolean(item?.trim()));
    const rebasedVerified = (continuity.recentVerifiedFiles ?? [])
      .map((item) => rebasePath(item) ?? item)
      .filter((item): item is string => Boolean(item?.trim()));
    const rebasedFailed = (continuity.recentFailedFiles ?? [])
      .map((entry) => {
        const nextPath = rebasePath(entry.path);
        if (!nextPath && path.isAbsolute(entry.path)) {
          return undefined;
        }
        return {
          path: nextPath ?? entry.path,
          reason: rebaseTextPaths(entry.reason),
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          path: string;
          reason: string;
        } => Boolean(entry?.path?.trim()),
      );
    const rebasedEvidence = (continuity.lastContinuationEvidence ?? [])
      .map((entry) => rebaseTextPaths(entry))
      .slice(0, SessionManager.WORKING_MEMORY_EVIDENCE_LIMIT);
    const rebasedUnresolved = (continuity.unresolvedItems ?? [])
      .map((entry) => rebaseTextPaths(entry))
      .slice(0, SessionManager.WORKING_MEMORY_EVIDENCE_LIMIT);
    const rebasedNextStep = continuity.lastStructuredNextStep
      ? {
          ...continuity.lastStructuredNextStep,
          ...(continuity.lastStructuredNextStep.targetPath
            ? {
                targetPath:
                  rebasePath(continuity.lastStructuredNextStep.targetPath) ??
                  continuity.lastStructuredNextStep.targetPath,
              }
            : {}),
          ...(continuity.lastStructuredNextStep.continuationPrompt
            ? {
                continuationPrompt: rebaseTextPaths(
                  continuity.lastStructuredNextStep.continuationPrompt,
                ),
              }
            : {}),
        }
      : undefined;
    const rebasedNextStepPlan = continuity.lastStructuredNextStepPlan
      ? {
          ...continuity.lastStructuredNextStepPlan,
          steps: continuity.lastStructuredNextStepPlan.steps.map((step) => ({
            ...step,
            ...(step.targetPath
              ? { targetPath: rebasePath(step.targetPath) ?? step.targetPath }
              : {}),
            ...(step.continuationPrompt
              ? {
                  continuationPrompt: rebaseTextPaths(step.continuationPrompt),
                }
              : {}),
          })),
        }
      : undefined;

    const nextContinuity: SessionContinuitySnapshot = {
      ...continuity,
      projectRoot: nextProjectRoot,
      continuationFamilyAnchor:
        rebasedAnchor ??
        (rebasedTargets[0]?.trim() ? rebasedTargets[0].trim() : undefined),
      recentTargetFiles: rebasedTargets,
      recentChangedFiles: rebasedChanged,
      recentVerifiedFiles: rebasedVerified,
      recentFailedFiles: rebasedFailed,
      lastContinuationEvidence: rebasedEvidence,
      ...(rebasedNextStep ? { lastStructuredNextStep: rebasedNextStep } : {}),
      ...(rebasedNextStepPlan
        ? { lastStructuredNextStepPlan: rebasedNextStepPlan }
        : {}),
      unresolvedItems: rebasedUnresolved,
    };

    return {
      ...memory,
      updatedAt: new Date().toISOString(),
      continuity: nextContinuity,
      summary: memory.summary.map((entry) => rebaseTextPaths(entry)),
    };
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
    const nextMessage: SessionMessage = { ...message, timestamp };
    session.turns.push(nextMessage);
    session.updatedAt = timestamp;
    this.appendTranscriptEvent(sessionId, {
      type: "message",
      role: nextMessage.role,
      content: nextMessage.content,
      timestamp,
    });
    this.writeSessionMetadata(session);
    this.writeSessionState(session);
    this.refreshWorkingMemory(sessionId);
  }

  markRunStarted(sessionId: string, prompt: string): void {
    const session = this.load(sessionId);
    session.status = "active";
    delete session.lastError;
    session.pendingPrompt = prompt;
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(sessionId, {
      type: "lifecycle",
      event: "run-started",
      timestamp: session.updatedAt,
      detail: prompt,
    });
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
    this.refreshWorkingMemory(sessionId);
  }

  persistUserPromptBarrier(sessionId: string, prompt: string): void {
    const session = this.load(sessionId);
    const timestamp = new Date().toISOString();
    const nextMessage: SessionMessage = {
      role: "user",
      content: prompt,
      timestamp,
    };

    session.status = "active";
    delete session.lastError;
    session.pendingPrompt = prompt;
    session.updatedAt = timestamp;
    session.turns.push(nextMessage);

    this.appendTranscriptEvent(sessionId, {
      type: "lifecycle",
      event: "run-started",
      timestamp,
      detail: prompt,
    });
    this.appendTranscriptEvent(sessionId, {
      type: "message",
      role: "user",
      content: prompt,
      timestamp,
    });

    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "prompt-persisted",
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
    this.refreshWorkingMemory(sessionId);
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
    this.refreshWorkingMemory(sessionId);
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
    this.refreshWorkingMemory(sessionId);
  }

  saveInterrupted(
    sessionId: string,
    interruptedKind: "prompt" | "turn" = "prompt",
  ): void {
    const session = this.load(sessionId);
    session.status = "interrupted";
    delete session.lastError;
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(sessionId, {
      type: "lifecycle",
      event: "run-interrupted",
      timestamp: session.updatedAt,
      detail: session.pendingPrompt,
    });
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      interruptedKind,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
    });
    this.refreshWorkingMemory(sessionId);
  }

  saveCompleted(sessionId: string, terminal?: TerminalPersistence): void {
    const session = this.load(sessionId);
    session.status = "completed";
    delete session.lastError;
    delete session.pendingPrompt;
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(sessionId, {
      type: "lifecycle",
      event: "run-completed",
      timestamp: session.updatedAt,
    });
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "idle",
      interruptedKind: undefined,
      terminalReason: terminal?.terminalReason ?? "completed",
      terminalClassification: terminal?.terminalClassification ?? "success",
      lastContinuationReason: terminal?.lastContinuationReason,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
    this.refreshWorkingMemory(sessionId);
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
    this.appendTranscriptEvent(sessionId, {
      type: "lifecycle",
      event: "run-error",
      timestamp: session.updatedAt,
      detail: error,
    });
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "idle",
      interruptedKind: undefined,
      terminalReason: terminal?.terminalReason,
      terminalClassification,
      lastContinuationReason: terminal?.lastContinuationReason,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
    this.refreshWorkingMemory(sessionId);
  }

  saveTerminated(sessionId: string): void {
    const session = this.load(sessionId);
    session.status = "terminated";
    delete session.lastError;
    delete session.pendingPrompt;
    session.updatedAt = new Date().toISOString();
    this.appendTranscriptEvent(sessionId, {
      type: "lifecycle",
      event: "run-terminated",
      timestamp: session.updatedAt,
    });
    this.writeSessionMetadata(session);
    this.writeSessionState(session, {
      runPhase: "idle",
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    });
    this.refreshWorkingMemory(sessionId);
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

    this.appendTranscriptEvent(sessionId, {
      type: "query-event",
      event,
      timestamp: new Date().toISOString(),
    });
    this.applyQueryEventToState(sessionId, event);
    this.refreshWorkingMemory(sessionId);
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
      .map((line) => JSON.parse(line) as TranscriptEvent);
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
    return events.filter((event) => {
      if (
        event.type === "message" &&
        event.role === "assistant" &&
        event.content.trim().length === 0
      ) {
        return false;
      }

      return true;
    });
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
  ): ReplayPreparation {
    const repaired = [...events];
    const baseTimestamp = new Date(context.updatedAt).getTime();
    let syntheticOffset = 0;
    let insertedPromptMessage = false;
    let insertedQueryStarted = false;
    let insertedRunInterrupted = false;

    const nextSyntheticTimestamp = (): string => {
      syntheticOffset += 1;
      return new Date(baseTimestamp + syntheticOffset).toISOString();
    };

    if (context.pendingPrompt) {
      const normalizedPrompt = context.pendingPrompt.trim();
      const hasPromptMessage = repaired.some(
        (event): event is Extract<TranscriptEvent, { type: "message" }> =>
          event.type === "message" &&
          event.role === "user" &&
          event.content.trim() === normalizedPrompt,
      );

      if (!hasPromptMessage && context.state.runPhase !== "idle") {
        const runStartedIndex = repaired.findIndex(
          (event): event is Extract<TranscriptEvent, { type: "lifecycle" }> =>
            event.type === "lifecycle" && event.event === "run-started",
        );
        const insertionIndex = runStartedIndex === -1 ? 0 : runStartedIndex + 1;
        repaired.splice(insertionIndex, 0, {
          type: "message",
          role: "user",
          content: context.pendingPrompt,
          timestamp: nextSyntheticTimestamp(),
        });
        insertedPromptMessage = true;
      }
    }

    const hasQueryStarted = repaired.some(
      (event): event is Extract<TranscriptEvent, { type: "query-event" }> =>
        event.type === "query-event" && event.event.type === "query.started",
    );
    const firstQueryEventIndex = repaired.findIndex(
      (event) => event.type === "query-event",
    );
    const hasQueryPhaseEvents = repaired.some(
      (event): event is Extract<TranscriptEvent, { type: "query-event" }> =>
        event.type === "query-event" && event.event.type !== "query.started",
    );

    if (
      context.state.runPhase === "turn-active" &&
      context.pendingPrompt &&
      hasQueryPhaseEvents &&
      !hasQueryStarted
    ) {
      repaired.splice(
        firstQueryEventIndex === -1 ? repaired.length : firstQueryEventIndex,
        0,
        {
          type: "query-event",
          event: {
            type: "query.started",
            sessionId: context.sessionId,
            prompt: context.pendingPrompt,
          },
          timestamp: nextSyntheticTimestamp(),
        },
      );
      insertedQueryStarted = true;
    }

    const interruptedTerminalQueries = repaired.filter(
      (event): boolean =>
        event.type === "query-event" &&
        (event.event.type === "query.completed" ||
          event.event.type === "query.failed"),
    ).length;

    const withoutInterruptedTerminalQueries =
      context.state.status === "interrupted"
        ? repaired.filter(
            (event): boolean =>
              event.type !== "query-event" ||
              (event.event.type !== "query.completed" &&
                event.event.type !== "query.failed"),
          )
        : repaired;

    const hasRunInterrupted = withoutInterruptedTerminalQueries.some(
      (event): event is Extract<TranscriptEvent, { type: "lifecycle" }> =>
        event.type === "lifecycle" && event.event === "run-interrupted",
    );

    if (context.state.status === "interrupted" && !hasRunInterrupted) {
      withoutInterruptedTerminalQueries.push({
        type: "lifecycle",
        event: "run-interrupted",
        timestamp: nextSyntheticTimestamp(),
        detail: context.pendingPrompt,
      });
      insertedRunInterrupted = true;
    }

    return {
      transcriptEvents: withoutInterruptedTerminalQueries,
      repairSummary: {
        insertedPromptMessage,
        insertedQueryStarted,
        strippedInterruptedTerminalEvents:
          context.state.status === "interrupted"
            ? interruptedTerminalQueries
            : 0,
        insertedRunInterrupted,
        ignoredDuplicateTurnStarts: 0,
        ignoredUnpairedTurnCompletions: 0,
        ignoredRoleMismatchedTurnCompletions: 0,
      },
    };
  }

  getReplayPlan(sessionId: string): ReplayPlan {
    const snapshot = this.getRecoverySnapshot(sessionId);
    const turnPairing = this.buildTurnPairingState(snapshot.transcriptEvents);
    const replayMessages = snapshot.transcriptEvents
      .filter(
        (event): event is Extract<TranscriptEvent, { type: "message" }> =>
          event.type === "message",
      )
      .map((event) => ({
        role: event.role,
        content: event.content,
        timestamp: event.timestamp,
      }));

    const lastReplayMessage = replayMessages[replayMessages.length - 1];
    const continuationPrompt =
      snapshot.interruptedKind === "turn"
        ? "Continue from where you left off."
        : snapshot.interruptedKind === "prompt"
          ? snapshot.pendingPrompt
          : undefined;

    return {
      normalizedTranscriptEvents: snapshot.transcriptEvents,
      replayMessages,
      continuationPrompt,
      requiresAssistantSentinel: lastReplayMessage?.role === "user",
      repairSummary: {
        ...snapshot.repairSummary,
        ignoredDuplicateTurnStarts: turnPairing.ignoredDuplicateTurnStarts,
        ignoredUnpairedTurnCompletions:
          turnPairing.ignoredUnpairedTurnCompletions,
        ignoredRoleMismatchedTurnCompletions:
          turnPairing.ignoredRoleMismatchedTurnCompletions,
      },
    };
  }

  buildRuntimeStateSeed(
    sessionId: string,
    options: RuntimeSeedOptions = {},
  ): QueryRuntimeStateSeed {
    const snapshot = this.getRecoverySnapshot(sessionId);
    const turnPairing = this.buildTurnPairingState(snapshot.transcriptEvents);
    const turnCompletedOutputs = turnPairing.pairedTurns.map(
      (turn) => turn.output,
    );

    const initialPrompt =
      snapshot.pendingPrompt ?? snapshot.lastUserMessage?.content ?? "";
    const startingRole =
      turnPairing.pairedTurns[0]?.started.role ??
      turnPairing.openTurn?.role ??
      turnCompletedOutputs[0]?.role ??
      options.fallbackStartingRole ??
      "planner";
    const lastCompletedOutput =
      turnCompletedOutputs[turnCompletedOutputs.length - 1];
    const lastPairedTurn =
      turnPairing.pairedTurns[turnPairing.pairedTurns.length - 1]?.started;
    const driftSummary = {
      ...snapshot.repairSummary,
      ignoredDuplicateTurnStarts: turnPairing.ignoredDuplicateTurnStarts,
      ignoredUnpairedTurnCompletions:
        turnPairing.ignoredUnpairedTurnCompletions,
      ignoredRoleMismatchedTurnCompletions:
        turnPairing.ignoredRoleMismatchedTurnCompletions,
    };
    const driftCount =
      driftSummary.ignoredDuplicateTurnStarts +
      driftSummary.ignoredUnpairedTurnCompletions +
      driftSummary.ignoredRoleMismatchedTurnCompletions;

    const computedBoundary: QueryRuntimeRecoveryBoundary = turnPairing.openTurn
      ? "mid-turn-reentry"
      : turnPairing.pairedTurns.length > 0
        ? "completed-turn-reentry"
        : "fresh-entry";
    const hasPendingLifecycle =
      Object.keys(snapshot.pendingLifecycle.pendingApprovals).length > 0 ||
      Object.keys(snapshot.pendingLifecycle.pendingTools).length > 0;
    const policyEvidenceTokens: ContinuationEvidenceToken[] = [];
    if (computedBoundary === "mid-turn-reentry") {
      policyEvidenceTokens.push("open-turn");
    }
    if (turnPairing.pairedTurns.length > 0) {
      policyEvidenceTokens.push("paired-turns");
    }
    if (hasPendingLifecycle) {
      policyEvidenceTokens.push("pending-lifecycle");
    }
    if (driftCount > 0) {
      policyEvidenceTokens.push("repair-drift");
    }
    const policyEvidence: ContinuationPolicyEvidence =
      buildContinuationPolicyEvidence(policyEvidenceTokens);
    const continuationSafety: ContinuationSafety = resolveContinuationSafety({
      evidence: policyEvidence,
    });
    const continuationPolicy = CONTINUATION_SAFETY_POLICY[continuationSafety];
    const recoveryBoundary: QueryRuntimeRecoveryBoundary =
      continuationPolicy.runtimeRecoveryBoundary;

    const currentRole = continuationPolicy.resetToStartingRole
      ? startingRole
      : recoveryBoundary === "mid-turn-reentry"
        ? turnPairing.openTurn!.role
        : (lastCompletedOutput?.handoffTo ?? startingRole);
    const turn = continuationPolicy.resetToStartingRole
      ? 1
      : recoveryBoundary === "mid-turn-reentry"
        ? turnPairing.openTurn!.turn
        : (lastPairedTurn?.turn ?? 0) + 1;

    return {
      config: {
        sessionId,
        initialPrompt,
        maxTurns: options.maxTurns ?? 12,
        startingRole,
      },
      currentRole,
      turn,
      lastContinuationReason: snapshot.lastContinuationReason,
      pendingLifecycle: snapshot.pendingLifecycle,
      recoveryBoundary,
      truthBoundary: {
        source: "durable-replay",
        normalizedEventCount: snapshot.transcriptEvents.length,
        pairedTurnCount: turnPairing.pairedTurns.length,
        policyEvidence,
        repairSummary: driftSummary,
        continuationSafety,
        openTurn:
          recoveryBoundary === "mid-turn-reentry" && turnPairing.openTurn
            ? {
                role: turnPairing.openTurn.role,
                turn: turnPairing.openTurn.turn,
              }
            : undefined,
      },
      derivedState: {
        transcript: continuationPolicy.allowDerivedContext
          ? turnCompletedOutputs
          : [],
      },
    };
  }

  private buildTurnPairingState(
    transcriptEvents: readonly TranscriptEvent[],
  ): TurnPairingState {
    const pairedTurns: Array<{
      started: TurnStartedQueryEvent;
      output: AgentExecutionOutput;
    }> = [];
    let openTurn: TurnStartedQueryEvent | undefined;
    let ignoredDuplicateTurnStarts = 0;
    let ignoredUnpairedTurnCompletions = 0;
    let ignoredRoleMismatchedTurnCompletions = 0;

    for (const event of transcriptEvents) {
      if (event.type !== "query-event") {
        continue;
      }

      if (event.event.type === "turn.started") {
        if (!openTurn) {
          openTurn = event.event;
        } else {
          if (
            openTurn.role !== event.event.role ||
            openTurn.turn !== event.event.turn
          ) {
            ignoredDuplicateTurnStarts += 1;
          }
        }
        continue;
      }

      if (event.event.type === "turn.completed") {
        if (openTurn && openTurn.role === event.event.output.role) {
          pairedTurns.push({ started: openTurn, output: event.event.output });
          openTurn = undefined;
        } else if (openTurn) {
          ignoredRoleMismatchedTurnCompletions += 1;
        } else {
          ignoredUnpairedTurnCompletions += 1;
        }
      }
    }

    return {
      pairedTurns,
      openTurn,
      ignoredDuplicateTurnStarts,
      ignoredUnpairedTurnCompletions,
      ignoredRoleMismatchedTurnCompletions,
    };
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
      score: this.scoreSessionReentrySummary(summary, preferredProjectRoot),
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

    return {
      id: session.id,
      title: session.title,
      status: session.status,
      projectRoot: session.projectRoot,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      pendingPrompt: recoverySnapshot.pendingPrompt,
      lastError: session.lastError,
      durableStatus: recoverySnapshot.durableStatus,
      terminalReason: recoverySnapshot.terminalReason,
      terminalClassification: recoverySnapshot.terminalClassification,
      lastUserMessage: recoverySnapshot.lastUserMessage?.content,
      lastAssistantMessage: recoverySnapshot.lastAssistantMessage?.content,
      recoverable: trustBoundary.recoverable,
      resumeDisposition: trustBoundary.disposition,
      autoResumeReady: trustBoundary.autoResumeReady,
      resumeDetail: trustBoundary.detail,
      ...(continuitySnapshot.lastStagedRepairStepCount !== undefined
        ? { stagedRepairStepCount: continuitySnapshot.lastStagedRepairStepCount }
        : {}),
      ...(continuitySnapshot.lastStagedRepairCompletedStep !== undefined
        ? {
            stagedRepairCompletedStep:
              continuitySnapshot.lastStagedRepairCompletedStep,
          }
        : {}),
      ...(continuitySnapshot.lastStagedRepairBlockedStep !== undefined
        ? { stagedRepairBlockedStep: continuitySnapshot.lastStagedRepairBlockedStep }
        : {}),
      ...(continuitySnapshot.lastStagedRepairNextStep !== undefined
        ? { stagedRepairNextStep: continuitySnapshot.lastStagedRepairNextStep }
        : {}),
      blockedReason: trustBoundary.block?.reason,
      blockedDetail: trustBoundary.block?.detail,
    };
  }

  getSessionResumeEligibility(sessionId: string): SessionResumeEligibility {
    const session = this.load(sessionId);
    return this.evaluateRecoveryTrustBoundary(session);
  }

  buildContinuitySnapshot(sessionId: string): SessionContinuitySnapshot {
    const session = this.load(sessionId);
    const recoverySnapshot = this.getRecoverySnapshot(sessionId);
    const recoveryTrustBoundary = this.evaluateRecoveryTrustBoundary(session);
    const transcriptEvents = this.getTranscriptEvents(sessionId);
    const lastRunErrorEvent = this.findLastLifecycleEvent(
      transcriptEvents,
      "run-error",
    );
    const lastQueryCompletion = this.findLastQueryCompletionEvent(transcriptEvents);
    const lastCodingCompletion =
      this.findLastCodingCompletionEvent(transcriptEvents);
    const lastNonChatCodingCompletion =
      this.findLastNonChatCodingCompletionEvent(transcriptEvents);
    const lastCodingResult = lastCodingCompletion?.event.result.codingResult;
    const recentCodingResults = this.collectRecentCodingResults(
      transcriptEvents,
      4,
    );
    const queryCompletions = transcriptEvents.filter(
      (
        event,
      ): event is Extract<TranscriptEvent, { type: "query-event" }> & {
        event: Extract<QueryEvent, { type: "query.completed" }>;
      } => event.type === "query-event" && event.event.type === "query.completed",
    );
    const lastNonChatCodingCompletionIndex =
      lastNonChatCodingCompletion !== undefined
        ? queryCompletions.findIndex(
            (event) => event === lastNonChatCodingCompletion,
          )
        : -1;
    const freshnessAgeTurnDistance =
      lastNonChatCodingCompletionIndex >= 0
        ? Math.max(queryCompletions.length - lastNonChatCodingCompletionIndex - 1, 0)
        : undefined;
    const latestReadEvidenceSource =
      recentCodingResults.find((result) =>
        this.hasReadStateEvidence(result.continuation.evidence),
      ) ?? lastCodingResult;
    const latestStagedEvidenceSource =
      recentCodingResults.find((result) =>
        this.hasStagedProgressEvidence(result.continuation.evidence),
      ) ?? lastCodingResult;
    const latestDeliverableSource =
      recentCodingResults.find((result) =>
        this.extractGroundedDeliverableMode(result.continuation.evidence) !==
        undefined,
      ) ?? lastCodingResult;
    const lastGroundedDeliverableMode = this.extractGroundedDeliverableMode(
      latestDeliverableSource?.continuation.evidence,
    );
    const lastReadDeliveredLines = this.extractLastReadDeliveredLines(
      latestReadEvidenceSource?.continuation.evidence,
    );
    const lastReadWindow = this.extractLastReadWindow(
      latestReadEvidenceSource?.continuation.evidence,
    );
    const lastReadFragment = this.extractLastReadFragment(
      latestReadEvidenceSource?.continuation.evidence,
    );
    const stagedRepairProgress = this.extractStagedRepairProgress(
      latestStagedEvidenceSource?.continuation.evidence,
    );
    const continuityEvidence = this.selectContinuationEvidenceForSnapshot(
      lastCodingResult?.continuation.evidence ?? [],
    );
    const continuationFamilyId =
      this.extractContinuationFamilyId(continuityEvidence) ??
      `session:${session.id}`;
    const continuationEpoch =
      this.extractContinuationEpoch(continuityEvidence) ?? 0;
    const lastAnswerDefect =
      this.extractLastAnswerDefect(lastCodingResult) ?? undefined;
    const continuityTerminalSource =
      lastQueryCompletion?.event.result.terminalClassification === "success" &&
      lastCodingCompletion?.event.result.terminalClassification &&
      lastCodingCompletion.event.result.terminalClassification !== "success"
        ? lastCodingCompletion
        : lastQueryCompletion;
    const rawLastUserIntent =
      recoverySnapshot.lastUserMessage?.content ??
      this.findLastTurnContent(session.turns, "user");
    const lastUserIntent = rawLastUserIntent
      ? this.stripContinuityContextBlock(rawLastUserIntent)
      : undefined;
    const recentTargetFilesFromHistory = recentCodingResults.flatMap((result) => [
      ...(result.changeSet.attemptedFiles ?? []),
      ...(result.changedFiles ?? []),
      ...(result.verifiedFiles ?? []),
      ...((result.failedFiles ?? []).map((entry) => entry.path)),
    ]);
    const recentTargetFiles = Array.from(
      new Set([
        ...recentTargetFilesFromHistory,
        ...this.extractPathLikeTargets(lastUserIntent),
      ]),
    ).slice(0, 12);
    const continuationFamilyAnchor =
      this.extractContinuationFamilyAnchor(continuityEvidence) ??
      recentTargetFiles[0];

    const recentFailedByPath = new Map<string, string>();
    for (const result of recentCodingResults) {
      for (const entry of result.failedFiles ?? []) {
        const pathCandidate = entry.path?.trim();
        if (!pathCandidate || recentFailedByPath.has(pathCandidate)) {
          continue;
        }
        recentFailedByPath.set(pathCandidate, entry.reason);
      }
    }
    const recentFailedFiles = Array.from(recentFailedByPath.entries())
      .map(([path, reason]) => ({ path, reason }))
      .slice(0, 8);

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
      recentFailedFiles.length +
      (lastCodingResult?.continuation.evidence.length ?? 0) +
      unresolvedItems.length;

    const baseSnapshot: SessionContinuitySnapshot = {
      sessionId: session.id,
      projectRoot: session.projectRoot,
      continuationFamilyId,
      continuationEpoch,
      ...(continuationFamilyAnchor
        ? { continuationFamilyAnchor }
        : {}),
      lastUserIntent,
      lastAssistantOutput:
        recoverySnapshot.lastAssistantMessage?.content ??
        this.findLastTurnContent(session.turns, "assistant"),
      lastTerminalClassification:
        continuityTerminalSource?.event.result.terminalClassification ??
        recoverySnapshot.terminalClassification ??
        this.deriveTerminalClassificationFromDurableStatus(
          recoverySnapshot.durableStatus,
        ),
      lastTerminalReason:
        continuityTerminalSource?.event.result.terminalReason ??
        recoverySnapshot.terminalReason ??
        this.deriveTerminalReasonFromDurableStatus(recoverySnapshot.durableStatus),
      lastDurableStatus: recoverySnapshot.durableStatus,
      lastRecoveryDisposition: recoveryTrustBoundary.disposition,
      lastFailure,
      lastTaskKind: lastCodingResult?.taskKind,
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
      ...(lastReadFragment.structureSignature
        ? {
            lastReadFragmentStructureSignature:
              lastReadFragment.structureSignature,
          }
        : {}),
      ...(lastReadFragment.neighborhoodSignature
        ? {
            lastReadFragmentNeighborhoodSignature:
              lastReadFragment.neighborhoodSignature,
          }
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
      recentChangedFiles: (lastCodingResult?.changedFiles ?? []).slice(0, 6),
      recentTargetFiles,
      recentFailedFiles,
      recentVerifiedFiles: (lastCodingResult?.verifiedFiles ?? []).slice(0, 6),
      lastVerificationStatus: lastCodingResult?.verification.status,
      lastVerificationCommand: lastCodingResult?.verification.command,
      lastVerificationReason: lastCodingResult?.verification.reason,
      lastRepairStatus: lastCodingResult?.repair.status,
      lastRepairNotes: (lastCodingResult?.repair.notes ?? []).slice(0, 6),
      lastContinuationStatus: lastCodingResult?.continuation.status,
      lastContinuationEvidence: continuityEvidence,
      lastTaskSatisfactionVerdict: lastCodingResult?.taskSatisfaction.verdict,
      lastTaskSatisfactionReasons: (
        lastCodingResult?.taskSatisfaction.reasons ?? []
      ).slice(0, 6),
      unresolvedItems,
      ...(freshnessHistoryCount > 0 ? { freshnessHistoryCount } : {}),
      ...(freshnessAgeTurnDistance !== undefined
        ? { freshnessAgeTurnDistance }
        : {}),
      ...(freshnessAgeTurnDistance !== undefined
        ? { freshnessAgeNotConsumedTurns: freshnessAgeTurnDistance }
        : {}),
    };
    const structuredNextStep = this.deriveStructuredNextStep(baseSnapshot);
    const derivedNextStepPlan =
      this.deriveStructuredNextStepPlan(baseSnapshot);
    const persistedNextStepPlan =
      this.readStateSnapshotSafely(this.getStatePath(sessionId)).workingMemory
        ?.continuity?.lastStructuredNextStepPlan;
    const structuredNextStepPlan = this.mergeStructuredNextStepPlan(
      persistedNextStepPlan,
      derivedNextStepPlan,
    );
    return {
      ...baseSnapshot,
      ...(structuredNextStep ? { lastStructuredNextStep: structuredNextStep } : {}),
      ...(structuredNextStepPlan
        ? { lastStructuredNextStepPlan: structuredNextStepPlan }
        : {}),
    };
  }

  private mergeStructuredNextStepPlan(
    persistedPlan: SessionStructuredNextStepPlan | undefined,
    derivedPlan: SessionStructuredNextStepPlan | undefined,
  ): SessionStructuredNextStepPlan | undefined {
    if (!persistedPlan) {
      return derivedPlan;
    }
    if (!derivedPlan) {
      return persistedPlan;
    }
    if (persistedPlan.planId !== derivedPlan.planId) {
      return derivedPlan;
    }
    const mergedCurrentIndex = Math.max(
      derivedPlan.currentStepIndex,
      persistedPlan.currentStepIndex,
    );
    const safeIndex = Math.max(
      0,
      Math.min(derivedPlan.steps.length, mergedCurrentIndex),
    );
    const completed = Math.max(
      derivedPlan.completedStepCount,
      persistedPlan.completedStepCount,
      safeIndex,
    );
    const activeStep = derivedPlan.steps[safeIndex];
    return {
      ...derivedPlan,
      currentStepIndex: safeIndex,
      completedStepCount: Math.min(derivedPlan.steps.length, completed),
      executableNow: Boolean(activeStep?.executableNow),
    };
  }

  buildPromptContinuityContext(
    sessionId: string,
    currentPrompt: string,
  ): string | undefined {
    if (!this.isContinuationPrompt(currentPrompt)) {
      return undefined;
    }

    const snapshot = this.ensureWorkingMemory(sessionId).continuity;
    const lines: string[] = ["Session continuity context:"];
    if (snapshot.workingMemoryCompacted) {
      lines.push("- working-memory: compacted");
      if (snapshot.workingMemorySummary?.length) {
        lines.push(
          `- working-memory-summary: ${snapshot.workingMemorySummary
            .map((item) => this.compactText(item, 120))
            .join(" | ")}`,
        );
      }
    }

    if (snapshot.lastTaskKind) {
      lines.push(`- last-task-kind: ${snapshot.lastTaskKind}`);
    }
    if (snapshot.lastStructuredNextStep) {
      lines.push(
        `- last-structured-next-step: ${this.describeStructuredNextStep(snapshot.lastStructuredNextStep)}`,
      );
    }
    if (snapshot.lastStructuredNextStepPlan) {
      lines.push(
        `- last-structured-next-step-plan: ${this.describeStructuredNextStepPlan(snapshot.lastStructuredNextStepPlan)}`,
      );
    }
    if (snapshot.lastGroundedDeliverableMode) {
      lines.push(
        `- last-grounded-deliverable-mode: ${snapshot.lastGroundedDeliverableMode}`,
      );
    }
    if (snapshot.lastReadDeliveredLines !== undefined) {
      lines.push(`- last-read-delivered-lines: ${snapshot.lastReadDeliveredLines}`);
    }
    if (snapshot.lastReadWindowStart !== undefined) {
      lines.push(`- last-read-window-start: ${snapshot.lastReadWindowStart}`);
    }
    if (snapshot.lastReadWindowEnd !== undefined) {
      lines.push(`- last-read-window-end: ${snapshot.lastReadWindowEnd}`);
    }
    if (snapshot.lastReadWindowSize !== undefined) {
      lines.push(`- last-read-window-size: ${snapshot.lastReadWindowSize}`);
    }
    if (snapshot.lastReadFragmentStart !== undefined) {
      lines.push(
        `- last-read-fragment-start: ${snapshot.lastReadFragmentStart}`,
      );
    }
    if (snapshot.lastReadFragmentEnd !== undefined) {
      lines.push(`- last-read-fragment-end: ${snapshot.lastReadFragmentEnd}`);
    }
    if ((snapshot.lastReadFragmentLineIndexes?.length ?? 0) > 0) {
      lines.push(
        `- last-read-fragment-line-indexes: ${snapshot.lastReadFragmentLineIndexes?.slice(0, 32).join(",")}`,
      );
    }
    if ((snapshot.lastReadFragmentRanges?.length ?? 0) > 0) {
      lines.push(
        `- last-read-fragment-ranges: ${snapshot.lastReadFragmentRanges?.slice(0, 64).join(";")}`,
      );
    }
    if (snapshot.lastReadFragmentSourceWindowStart !== undefined) {
      lines.push(
        `- last-read-fragment-source-window-start: ${snapshot.lastReadFragmentSourceWindowStart}`,
      );
    }
    if (snapshot.lastReadFragmentSourceWindowEnd !== undefined) {
      lines.push(
        `- last-read-fragment-source-window-end: ${snapshot.lastReadFragmentSourceWindowEnd}`,
      );
    }
    if (snapshot.lastReadFilter) {
      lines.push(`- last-read-filter: ${snapshot.lastReadFilter}`);
    }
    if (snapshot.lastReadFragmentFingerprint) {
      lines.push(
        `- last-read-fragment-fingerprint: ${snapshot.lastReadFragmentFingerprint}`,
      );
    }
    if (snapshot.lastReadFragmentStructureSignature) {
      lines.push(
        `- last-read-fragment-structure-signature: ${snapshot.lastReadFragmentStructureSignature}`,
      );
    }
    if (snapshot.lastReadFragmentNeighborhoodSignature) {
      lines.push(
        `- last-read-fragment-neighborhood-signature: ${snapshot.lastReadFragmentNeighborhoodSignature}`,
      );
    }
    if (snapshot.lastStagedRepairStepCount !== undefined) {
      lines.push(
        `- last-staged-repair-steps: ${snapshot.lastStagedRepairStepCount}`,
      );
    }
    if (snapshot.lastStagedRepairCompletedStep !== undefined) {
      lines.push(
        `- last-staged-repair-completed-step: ${snapshot.lastStagedRepairCompletedStep}`,
      );
    }
    if (snapshot.lastStagedRepairBlockedStep !== undefined) {
      lines.push(
        `- last-staged-repair-blocked-step: ${snapshot.lastStagedRepairBlockedStep}`,
      );
    }
    if (snapshot.lastStagedRepairNextStep !== undefined) {
      lines.push(`- last-staged-repair-next-step: ${snapshot.lastStagedRepairNextStep}`);
    }
    if (snapshot.lastAnswerDefect) {
      lines.push(`- last-answer-defect: ${this.compactText(snapshot.lastAnswerDefect, 120)}`);
    }
    if (snapshot.lastTerminalClassification || snapshot.lastTerminalReason) {
      lines.push(
        `- last-terminal: ${snapshot.lastTerminalClassification ?? "unknown"} (${snapshot.lastTerminalReason ?? "unknown"})`,
      );
    }
    if (snapshot.continuationFamilyId) {
      lines.push(`- continuation-family: ${snapshot.continuationFamilyId}`);
    }
    if (snapshot.continuationEpoch !== undefined) {
      lines.push(`- continuation-epoch: ${snapshot.continuationEpoch}`);
    }
    if (snapshot.continuationFamilyAnchor) {
      lines.push(
        `- continuation-family-anchor: ${snapshot.continuationFamilyAnchor}`,
      );
    }
    if (snapshot.freshnessAgeTurnDistance !== undefined) {
      lines.push(
        `- freshness-age-turn-distance: ${snapshot.freshnessAgeTurnDistance}`,
      );
    }
    if (snapshot.freshnessAgeNotConsumedTurns !== undefined) {
      lines.push(
        `- freshness-age-not-consumed-turns: ${snapshot.freshnessAgeNotConsumedTurns}`,
      );
    }
    if (snapshot.lastFailure) {
      lines.push(`- last-failure: ${this.compactText(snapshot.lastFailure)}`);
    }
    if (snapshot.recentChangedFiles.length > 0) {
      lines.push(`- recent-changed-files: ${snapshot.recentChangedFiles.join(", ")}`);
    }
    const candidateTargetFiles = Array.from(
      new Set([
        ...snapshot.recentTargetFiles,
        ...snapshot.recentChangedFiles,
        ...snapshot.recentVerifiedFiles,
        ...snapshot.recentFailedFiles.map((entry) => entry.path),
      ]),
    );
    if (candidateTargetFiles.length > 0) {
      lines.push(`- recent-target-files: ${candidateTargetFiles.join(", ")}`);
    }
    if (snapshot.recentVerifiedFiles.length > 0) {
      lines.push(`- recent-verified-files: ${snapshot.recentVerifiedFiles.join(", ")}`);
    }
    if (snapshot.recentFailedFiles.length > 0) {
      lines.push(
        `- recent-failed-files: ${snapshot.recentFailedFiles
          .map((entry) => `${entry.path} (${entry.reason})`)
          .join(", ")}`,
      );
    }
    if (snapshot.lastVerificationStatus) {
      lines.push(`- last-verification-status: ${snapshot.lastVerificationStatus}`);
      if (snapshot.lastVerificationCommand) {
        lines.push(`- last-verification-command: ${snapshot.lastVerificationCommand}`);
      }
      if (snapshot.lastVerificationReason) {
        lines.push(
          `- last-verification-reason: ${this.compactText(snapshot.lastVerificationReason)}`,
        );
      }
    }
    if (snapshot.lastRepairStatus) {
      lines.push(`- last-repair-status: ${snapshot.lastRepairStatus}`);
      if (snapshot.lastRepairNotes.length > 0) {
        lines.push(
          `- last-repair-notes: ${snapshot.lastRepairNotes
            .map((note) => this.compactText(note, 120))
            .join(" | ")}`,
        );
      }
    }
    if (snapshot.lastContinuationStatus) {
      lines.push(`- last-continuation-status: ${snapshot.lastContinuationStatus}`);
      if (snapshot.lastContinuationEvidence.length > 0) {
        lines.push(
          `- last-continuation-evidence: ${snapshot.lastContinuationEvidence
            .map((entry) => this.compactText(entry, 120))
            .join(" | ")}`,
        );
      }
    }
    if (snapshot.lastTaskSatisfactionVerdict) {
      lines.push(
        `- last-task-satisfaction: ${snapshot.lastTaskSatisfactionVerdict}`,
      );
      if (snapshot.lastTaskSatisfactionReasons.length > 0) {
        lines.push(
          `- last-task-satisfaction-reasons: ${snapshot.lastTaskSatisfactionReasons
            .map((reason) => this.compactText(reason, 120))
            .join(" | ")}`,
        );
      }
    }
    if (snapshot.unresolvedItems.length > 0) {
      lines.push(`- unresolved-items: ${snapshot.unresolvedItems.join(" | ")}`);
    }
    lines.push(
      "- instruction: use this continuity context to continue the same task; do not restart from scratch.",
    );

    return lines.join("\n");
  }

  buildBudgetedPromptWithContinuityContext(
    sessionId: string,
    currentPrompt: string,
    options: PromptContextAssemblyOptions = {},
  ): string {
    const prompt = currentPrompt.trim();
    if (!prompt) {
      return currentPrompt;
    }
    if (prompt.startsWith("/")) {
      return currentPrompt;
    }
    if (
      /\[FOLLOW-UP CONTINUITY CONTEXT\][\s\S]*?\[END CONTINUITY CONTEXT\]/i.test(
        currentPrompt,
      )
    ) {
      return currentPrompt;
    }

    const maxChars = Math.max(900, options.maxChars ?? 2200);
    const recentTurnLimit = Math.max(0, options.recentTurnLimit ?? 4);
    const memory = this.ensureWorkingMemory(sessionId);
    const snapshot = memory.continuity;

    if (!this.shouldAttachCompactAwareContext(prompt, snapshot)) {
      return currentPrompt;
    }

    const sections: string[] = [];
    sections.push("Session continuity context:");
    sections.push(
      `- context-policy: compact-aware (budget=${maxChars} chars; source-events=${memory.sourceEventCount}; source-turns=${memory.sourceTurnCount})`,
    );
    if (snapshot.workingMemoryCompacted) {
      sections.push("- working-memory: compacted");
    }
    if (snapshot.lastTaskKind) {
      sections.push(`- last-task-kind: ${snapshot.lastTaskKind}`);
    }
    if (snapshot.lastStructuredNextStep) {
      sections.push(
        `- last-structured-next-step: ${this.describeStructuredNextStep(snapshot.lastStructuredNextStep)}`,
      );
    }
    if (snapshot.lastStructuredNextStepPlan) {
      sections.push(
        `- last-structured-next-step-plan: ${this.describeStructuredNextStepPlan(snapshot.lastStructuredNextStepPlan)}`,
      );
    }
    if (snapshot.lastGroundedDeliverableMode) {
      sections.push(
        `- last-grounded-deliverable-mode: ${snapshot.lastGroundedDeliverableMode}`,
      );
    }
    if (snapshot.recentTargetFiles.length > 0) {
      sections.push(
        `- recent-target-files: ${snapshot.recentTargetFiles
          .slice(0, SessionManager.WORKING_MEMORY_RECENT_FILE_LIMIT)
          .join(", ")}`,
      );
    }
    if (snapshot.lastReadWindowStart !== undefined) {
      sections.push(`- last-read-window-start: ${snapshot.lastReadWindowStart}`);
    }
    if (snapshot.lastReadWindowEnd !== undefined) {
      sections.push(`- last-read-window-end: ${snapshot.lastReadWindowEnd}`);
    }
    if (snapshot.lastReadWindowSize !== undefined) {
      sections.push(`- last-read-window-size: ${snapshot.lastReadWindowSize}`);
    }
    if (snapshot.lastReadFilter) {
      sections.push(`- last-read-filter: ${snapshot.lastReadFilter}`);
    }
    if (snapshot.lastReadFragmentRanges?.length) {
      sections.push(
        `- last-read-fragment-ranges: ${snapshot.lastReadFragmentRanges
          .slice(0, 16)
          .join(";")}`,
      );
    }
    if (snapshot.lastStagedRepairStepCount !== undefined) {
      sections.push(
        `- last-staged-repair-steps: ${snapshot.lastStagedRepairStepCount}`,
      );
    }
    if (snapshot.lastStagedRepairCompletedStep !== undefined) {
      sections.push(
        `- last-staged-repair-completed-step: ${snapshot.lastStagedRepairCompletedStep}`,
      );
    }
    if (snapshot.lastStagedRepairNextStep !== undefined) {
      sections.push(`- last-staged-repair-next-step: ${snapshot.lastStagedRepairNextStep}`);
    }
    if (snapshot.lastFailure) {
      sections.push(`- last-failure: ${this.compactText(snapshot.lastFailure, 180)}`);
    }
    if (snapshot.unresolvedItems.length > 0) {
      sections.push(
        `- unresolved-items: ${snapshot.unresolvedItems
          .slice(0, 4)
          .map((item) => this.compactText(item, 120))
          .join(" | ")}`,
      );
    }

    if (memory.summary.length > 0) {
      sections.push(
        `- compact-summary: ${memory.summary
          .slice(0, SessionManager.WORKING_MEMORY_SUMMARY_ITEM_LIMIT)
          .map((item) => this.compactText(item, 140))
          .join(" | ")}`,
      );
    }

    if (snapshot.lastContinuationEvidence.length > 0) {
      sections.push(
        `- last-continuation-evidence: ${snapshot.lastContinuationEvidence
          .slice(0, SessionManager.WORKING_MEMORY_EVIDENCE_LIMIT)
          .map((entry) => this.compactText(entry, 120))
          .join(" | ")}`,
      );
    }

    if (recentTurnLimit > 0) {
      const session = this.load(sessionId);
      const recentTurns = session.turns
        .slice(-recentTurnLimit)
        .map((turn) => {
          const content =
            turn.role === "user"
              ? this.stripContinuityContextBlock(turn.content)
              : turn.content;
          return `[${turn.role}] ${this.compactText(content, 220)}`;
        });
      if (recentTurns.length > 0) {
        sections.push(`- recent-raw-turns: ${recentTurns.join(" || ")}`);
      }
    }

    sections.push(
      "- instruction: prioritize active task continuity using this structured context before older transcript noise.",
    );

    const budgeted = this.packContextLinesWithinBudget(sections, maxChars);
    const block = `[FOLLOW-UP CONTINUITY CONTEXT]\n${budgeted.join("\n")}\n[END CONTINUITY CONTEXT]`;
    return `${block}\n\n${currentPrompt}`;
  }

  resolveReflectiveStatusQuery(
    sessionId: string,
    prompt: string,
  ): string | undefined {
    return this.resolveReflectiveStatusHandoff(sessionId, prompt)?.answer;
  }

  resolveReflectiveStatusHandoff(
    sessionId: string,
    prompt: string,
  ): { answer: string; continuationPrompt?: string } | undefined {
    const normalized = prompt.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    const asksStopReason =
      /\b(why did it stop|why stop|what failed|where did we stop|why did it fail|last failure)\b/i.test(
        normalized,
      ) ||
      /(?:\u4e3a\u4ec0\u4e48\u505c|\u521a\u624d\u4e3a\u4ec0\u4e48\u505c|\u521a\u624d\u5931\u8d25\u662f\u4ec0\u4e48|\u5361\u5728\u54ea|\u4e0a\u4e00\u8f6e\u5361\u5728\u54ea)/u.test(
        prompt,
      );
    const asksProgress =
      /\b(progress|which step|what step|staged)\b/i.test(normalized) ||
      /(?:\u505a\u5230\u54ea\u4e00\u6b65|\u505a\u5230\u54ea\u91cc|\u5230\u7b2c\u51e0\u6b65|\u54ea\u4e00\u6b65)/u.test(
        prompt,
      );
    const asksNext =
      /\b(next step|what should we do next|how should we continue|what now)\b/i.test(
        normalized,
      ) ||
      /(?:\u73b0\u5728\u5e94\u8be5\u7ee7\u7eed\u4ec0\u4e48|\u63a5\u4e0b\u6765\u505a\u4ec0\u4e48|\u4e0b\u4e00\u6b65\u662f\u4ec0\u4e48)/u.test(
        prompt,
      );
    const asksReadState =
      /\b(where did we read|which lines|what part did you explain|which part did you explain|where was that part)\b/i.test(
        normalized,
      ) ||
      /(?:\u521a\u624d\u8bfb\u5230\u54ea\u91cc|\u521a\u624d\u89e3\u91ca\u7684\u662f\u54ea\u4e00\u6bb5|\u521a\u624d\u5c55\u793a\u7684\u662f\u54ea\u4e00\u6bb5|\u8fd9\u90e8\u5206\u662f\u54ea\u4e00\u6bb5)/u.test(
        prompt,
      );

    if (!asksStopReason && !asksProgress && !asksNext && !asksReadState) {
      return undefined;
    }

    const memory = this.ensureWorkingMemory(sessionId);
    const snapshot = memory.continuity;
    const lines: string[] = ["Session status (working memory):"];
    lines.push(
      `- terminal: ${snapshot.lastTerminalClassification ?? "unknown"} (${snapshot.lastTerminalReason ?? "unknown"})`,
    );
    if (snapshot.lastDurableStatus) {
      lines.push(`- durable-status: ${snapshot.lastDurableStatus}`);
    }
    if (snapshot.lastRecoveryDisposition) {
      lines.push(`- recovery-disposition: ${snapshot.lastRecoveryDisposition}`);
    }
    if (snapshot.workingMemoryCompacted) {
      lines.push(
        `- context: compacted memory (events=${snapshot.workingMemorySourceEventCount ?? memory.sourceEventCount}, turns=${snapshot.workingMemorySourceTurnCount ?? memory.sourceTurnCount})`,
      );
    }

    if (asksStopReason) {
      lines.push(
        `- stop/failure: ${snapshot.lastFailure ?? snapshot.unresolvedItems[0] ?? "No explicit stop/failure captured in working memory."}`,
      );
    }

    if (asksProgress) {
      if (snapshot.lastStagedRepairStepCount !== undefined) {
        lines.push(
          `- staged-progress: step ${snapshot.lastStagedRepairCompletedStep ?? 0}/${snapshot.lastStagedRepairStepCount}` +
            (snapshot.lastStagedRepairNextStep !== undefined
              ? `, next=${snapshot.lastStagedRepairNextStep}`
              : ""),
        );
      } else if (snapshot.lastStructuredNextStepPlan) {
        const displayStep = Math.min(
          snapshot.lastStructuredNextStepPlan.steps.length,
          snapshot.lastStructuredNextStepPlan.currentStepIndex + 1,
        );
        lines.push(
          `- staged-progress: step ${displayStep}/${snapshot.lastStructuredNextStepPlan.steps.length}`,
        );
      } else {
        lines.push("- staged-progress: no active staged-repair checkpoint.");
      }
    }

    if (asksReadState) {
      if (
        snapshot.lastReadWindowStart !== undefined &&
        snapshot.lastReadWindowEnd !== undefined
      ) {
        lines.push(
          `- last-read-window: ${snapshot.lastReadWindowStart}-${snapshot.lastReadWindowEnd}`,
        );
      } else if (snapshot.lastReadDeliveredLines !== undefined) {
        lines.push(
          `- last-read-window: delivered ${snapshot.lastReadDeliveredLines} line(s)`,
        );
      } else if (
        snapshot.lastGroundedDeliverableMode === "explain" &&
        snapshot.recentTargetFiles[0]
      ) {
        lines.push(
          `- last-read-window: explain-over-target (${snapshot.recentTargetFiles[0]})`,
        );
      } else {
        lines.push("- last-read-window: not available.");
      }
      if (snapshot.lastReadFragmentRanges?.length) {
        lines.push(
          `- last-fragment: ${snapshot.lastReadFragmentRanges.slice(0, 8).join(";")}`,
        );
      } else if (
        snapshot.lastReadFragmentStart !== undefined &&
        snapshot.lastReadFragmentEnd !== undefined
      ) {
        lines.push(
          `- last-fragment: ${snapshot.lastReadFragmentStart}-${snapshot.lastReadFragmentEnd}`,
        );
      } else if (snapshot.recentTargetFiles[0]) {
        lines.push(`- last-fragment-target: ${snapshot.recentTargetFiles[0]}`);
      }
    }

    if (asksNext) {
      lines.push(`- next-step: ${this.deriveReflectiveNextStep(snapshot)}`);
    }

    const answer = lines.join("\n");
    const continuationPrompt = this.extractReflectiveActionContinuation(
      prompt,
      snapshot,
    );
    return continuationPrompt
      ? { answer, continuationPrompt }
      : { answer };
  }

  resolveConversationalActionHandoff(
    sessionId: string,
    prompt: string,
  ): { answer: string; continuationPrompt?: string } | undefined {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return undefined;
    }
    const normalized = trimmed.toLowerCase();
    const asksPlanFirst =
      /\b(don't execute yet|do not execute yet|tell me (the )?plan|plan first|before executing|did you understand)\b/i.test(
        normalized,
      ) ||
      /(?:鍏堝埆鎵ц|涓嶈鍏堟墽琛寍鍏堝憡璇夋垜.*鎬庝箞鍋殀鍏堣.*璁″垝|浣犳槸涓嶆槸娌＄悊瑙杩欐槸涓嶆槸璇存槑涓婁笅鏂囨病鎺ヤ綇)/u.test(
        trimmed,
      );
    if (!asksPlanFirst) {
      return undefined;
    }

    const explicitRepoTask =
      /\b(read|inspect|open|show|summari[sz]e|explain|edit|write|modify|fix|patch|test|build|lint)\b/i.test(
        normalized,
      ) ||
      /(?:璇诲彇|鏌ョ湅|妫€鏌鎬荤粨|瑙ｉ噴|淇敼|缂栬緫|鍐檤淇|娴嬭瘯|鏋勫缓|缂栬瘧)/u.test(
        trimmed,
      ) ||
      /(?:[A-Za-z]:\\|\.{0,2}\/|\\|\/).+\.\w+/u.test(trimmed);
    if (explicitRepoTask) {
      return undefined;
    }

    const memory = this.ensureWorkingMemory(sessionId);
    const snapshot = memory.continuity;
    const lines: string[] = ["Execution plan (working memory):"];
    lines.push(
      `- active-task: ${snapshot.lastTaskKind ?? "unknown"}${snapshot.recentTargetFiles[0] ? ` on ${snapshot.recentTargetFiles[0]}` : ""}`,
    );
    lines.push(
      `- current-status: ${snapshot.lastTerminalClassification ?? "unknown"} (${snapshot.lastTerminalReason ?? "unknown"})`,
    );
    if (snapshot.lastFailure) {
      lines.push(`- blocker/failure: ${snapshot.lastFailure}`);
    }
    lines.push(`- recommended-next: ${this.deriveReflectiveNextStep(snapshot)}`);

    const continuationPrompt = this.extractReflectiveActionContinuation(
      prompt,
      snapshot,
    );
    return continuationPrompt
      ? { answer: lines.join("\n"), continuationPrompt }
      : { answer: lines.join("\n") };
  }

  materializeContinuationFromActionClause(
    sessionId: string,
    clause: string,
  ):
    | { prompt?: string; blockedReason?: string; stepHint?: SessionMaterializedStepHint }
    | undefined {
    if (!this.isGenericContinuationClause(clause)) {
      return undefined;
    }
    const snapshot = this.ensureWorkingMemory(sessionId).continuity;
    const plan =
      snapshot.lastStructuredNextStepPlan ??
      this.deriveStructuredNextStepPlan(snapshot);
    if (plan) {
      const activeStep = plan.steps[plan.currentStepIndex];
      if (!activeStep) {
        return {
          blockedReason:
            "Task not completed: staged next-step plan has no remaining executable step.",
        };
      }
      const prompt = this.materializeStructuredNextStep(activeStep);
      if (prompt) {
        this.persistStagedNextStepPlanProgress(
          sessionId,
          plan,
          plan.currentStepIndex,
        );
        return { prompt, stepHint: this.toMaterializedStepHint(activeStep) };
      }
      const missing =
        activeStep.missingFields && activeStep.missingFields.length > 0
          ? ` Missing: ${activeStep.missingFields.join(", ")}.`
          : "";
      return {
        blockedReason: `Task not completed: staged next-step step ${plan.currentStepIndex + 1}/${plan.steps.length} is not executable yet (${activeStep.reason}).${missing}`,
      };
    }
    const step =
      snapshot.lastStructuredNextStep ??
      this.deriveStructuredNextStep(snapshot);
    if (!step) {
      return {
        blockedReason:
          "Task not completed: no structured next-step recommendation is available in working memory.",
      };
    }
    const prompt = this.materializeStructuredNextStep(step);
    if (prompt) {
      return { prompt, stepHint: this.toMaterializedStepHint(step) };
    }
    const missing =
      step.missingFields && step.missingFields.length > 0
        ? ` Missing: ${step.missingFields.join(", ")}.`
        : "";
    return {
      blockedReason: `Task not completed: next-step recommendation is not executable yet (${step.reason}).${missing}`,
    };
  }

  private deriveReflectiveNextStep(snapshot: SessionContinuitySnapshot): string {
    const nextStepPlan =
      snapshot.lastStructuredNextStepPlan ??
      this.deriveStructuredNextStepPlan(snapshot);
    if (nextStepPlan) {
      const activeStep = nextStepPlan.steps[nextStepPlan.currentStepIndex];
      if (activeStep) {
        return `Step ${nextStepPlan.currentStepIndex + 1}/${nextStepPlan.steps.length}: ${this.describeStructuredNextStep(activeStep)}`;
      }
      return this.describeStructuredNextStepPlan(nextStepPlan);
    }
    const structuredNextStep =
      snapshot.lastStructuredNextStep ??
      this.deriveStructuredNextStep(snapshot);
    if (structuredNextStep) {
      return this.describeStructuredNextStep(structuredNextStep);
    }

    if (snapshot.lastVerificationStatus === "blocked") {
      return (
        `Resolve blocker (${snapshot.lastVerificationReason ?? "verification blocked"})` +
        (snapshot.lastVerificationCommand
          ? `, then rerun: ${snapshot.lastVerificationCommand}`
          : ".")
      );
    }
    if (snapshot.lastVerificationStatus === "failed") {
      return (
        `Fix failing target${snapshot.recentTargetFiles[0] ? ` (${snapshot.recentTargetFiles[0]})` : ""}` +
        (snapshot.lastVerificationCommand
          ? `, then rerun: ${snapshot.lastVerificationCommand}`
          : ".")
      );
    }
    if (
      snapshot.lastGroundedDeliverableMode === "read" &&
      snapshot.recentTargetFiles[0]
    ) {
      const startFrom =
        snapshot.lastReadWindowEnd !== undefined
          ? snapshot.lastReadWindowEnd + 1
          : undefined;
      return startFrom
        ? `Continue reading ${snapshot.recentTargetFiles[0]} from line ${startFrom}.`
        : `Continue reading ${snapshot.recentTargetFiles[0]} using the same mode.`;
    }
    if (snapshot.lastTaskKind && snapshot.lastTaskKind !== "chat") {
      return `Continue previous ${snapshot.lastTaskKind}` +
        (snapshot.recentTargetFiles[0]
          ? ` on ${snapshot.recentTargetFiles[0]}.`
          : " with an explicit target.");
    }
    return "Provide an explicit next task or target path to continue.";
  }

  private toMaterializedStepHint(
    step: SessionStructuredNextStep,
  ): SessionMaterializedStepHint {
    return {
      kind: step.kind,
      targetPath: step.targetPath,
      command: step.command,
      replaceFrom: step.replaceFrom,
      replaceTo: step.replaceTo,
      readLineCount: step.readLineCount,
      readFilter: step.readFilter,
      readFragmentStart: step.readFragmentStart,
      readFragmentEnd: step.readFragmentEnd,
      readFragmentLineIndexes: step.readFragmentLineIndexes,
      readFragmentRanges: step.readFragmentRanges,
      readFragmentSourceWindowStart: step.readFragmentSourceWindowStart,
      readFragmentSourceWindowEnd: step.readFragmentSourceWindowEnd,
      readFragmentFingerprint: step.readFragmentFingerprint,
      readFragmentStructureSignature: step.readFragmentStructureSignature,
      readFragmentNeighborhoodSignature: step.readFragmentNeighborhoodSignature,
      continuationPrompt: step.continuationPrompt,
      confidence: step.confidence,
    };
  }

  private extractReflectiveActionContinuation(
    prompt: string,
    snapshot: SessionContinuitySnapshot,
  ): string | undefined {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return undefined;
    }

    const clauses = trimmed
      .split(
        /[?？！。;；]\s*|(?:,|，)\s*(?=(?:then|and then|and|so|continue|go on|然后|接着|那就|直接|继续))/i,
      )
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (clauses.length <= 1) {
      return undefined;
    }
    const tail = clauses.slice(1).join(" ").trim();
    if (!tail) {
      return undefined;
    }

    const canonicalTail = tail
      .replace(/^(?:then|and then|and|so)\s+/i, "")
      .replace(/^(?:閭ｅ氨|閭鐒跺悗|鎺ョ潃)\s*/u, "")
      .trim();
    if (!canonicalTail) {
      return undefined;
    }

    const genericContinue =
      /^(?:continue|go on|keep going|proceed|do that|fix it|resume)\b/i.test(
        canonicalTail,
      ) ||
      /^(?:那就|然后|接着|再)?\s*(?:继续|继续修|继续做|继续处理|按这个继续|继续读取|继续解释|继续总结)(?:吧|一下)?$/u.test(
        canonicalTail,
      );

    if (genericContinue) {
      return this.deriveRecommendationBackedContinuationPrompt(snapshot);
    }

    const explicitAction =
      /\b(continue|fix|repair|rerun|run|read|explain|summarize|summarise|test|build)\b/i.test(
        canonicalTail,
      ) ||
      /(?:缁х画|淇畖淇|閲嶈窇|璺憒璇粅璇诲彇|瑙ｉ噴|鎬荤粨|鐪媆s*test|鍒玕s*build|鍏圽s*鐪媆s*test)/u.test(
        canonicalTail,
      );
    if (!explicitAction) {
      return undefined;
    }
    return canonicalTail;
  }

  private isGenericContinuationClause(clause: string): boolean {
    const trimmed = clause.trim();
    if (!trimmed) {
      return false;
    }
    return (
      /^(?:then\s+)?(?:continue|go on|keep going|resume|proceed|fix it|do that|then continue|then fix)\b/i.test(
        trimmed,
      ) ||
      /^(?:那就|然后|接着|再)?\s*(?:继续|继续修|继续做|继续处理|按这个继续|继续读取|继续解释|继续总结)(?:吧|一下)?$/u.test(
        trimmed,
      )
    );
  }

  private deriveRecommendationBackedContinuationPrompt(
    snapshot: SessionContinuitySnapshot,
  ): string | undefined {
    const stagedPlan =
      snapshot.lastStructuredNextStepPlan ??
      this.deriveStructuredNextStepPlan(snapshot);
    if (stagedPlan) {
      const activeStep = stagedPlan.steps[stagedPlan.currentStepIndex];
      const stagedPrompt = activeStep
        ? this.materializeStructuredNextStep(activeStep)
        : undefined;
      if (stagedPrompt) {
        return stagedPrompt;
      }
    }
    const step =
      snapshot.lastStructuredNextStep ??
      this.deriveStructuredNextStep(snapshot);
    const materialized = step ? this.materializeStructuredNextStep(step) : undefined;
    return materialized ?? this.deriveImplicitContinuationPrompt(snapshot);
  }

  private deriveStructuredNextStep(
    snapshot: SessionContinuitySnapshot,
  ): SessionStructuredNextStep | undefined {
    const target = snapshot.recentTargetFiles[0];
    const promptTarget = target ? this.formatTargetForPrompt(target) : undefined;
    if (snapshot.lastVerificationStatus === "blocked") {
      if (snapshot.lastVerificationCommand) {
        return {
          kind: "run-command",
          executableNow: true,
          confidence: "high",
          reason: snapshot.lastVerificationReason ?? "verification blocked",
          command: snapshot.lastVerificationCommand,
          continuationPrompt: `run ${snapshot.lastVerificationCommand}`,
        };
      }
      return {
        kind: "run-command",
        executableNow: false,
        confidence: "low",
        reason: snapshot.lastVerificationReason ?? "verification blocked",
        missingFields: ["command"],
      };
    }

    if (snapshot.lastVerificationStatus === "failed") {
      if (snapshot.lastVerificationCommand) {
        return {
          kind: "run-command",
          executableNow: true,
          confidence: "high",
          reason: snapshot.lastVerificationReason ?? "verification failed",
          command: snapshot.lastVerificationCommand,
          continuationPrompt: `run ${snapshot.lastVerificationCommand}`,
        };
      }
      const transform = this.extractLatestTransformDirective(snapshot, target);
      if (transform && target) {
        return {
          kind: "edit-fix",
          executableNow: true,
          confidence: "medium",
            reason: "continue mutation/fix on failed target",
            targetPath: target,
            replaceFrom: transform.from,
            replaceTo: transform.to,
            continuationPrompt: `continue fixing previous failure in ${promptTarget} by replacing ${this.quoteForDirective(transform.from)} with ${this.quoteForDirective(transform.to)}`,
          };
        }
      return {
        kind: "edit-fix",
        executableNow: false,
        confidence: "low",
        reason: "failed verification lacks executable fix transform",
        targetPath: target,
        missingFields: target ? ["replace-from", "replace-to"] : ["target", "replace-from", "replace-to"],
      };
    }

    if (snapshot.lastGroundedDeliverableMode === "read" && target) {
      const count = snapshot.lastReadWindowSize ?? snapshot.lastReadDeliveredLines ?? 2;
      const boundedCount = Math.max(1, Math.min(count, 20));
      return {
        kind: "read-continuation",
        executableNow: true,
        confidence: "high",
        reason: "continue grounded read window",
        targetPath: target,
        readLineCount: boundedCount,
        readFilter: snapshot.lastReadFilter ?? "none",
        continuationPrompt: `continue reading next ${boundedCount} lines of ${promptTarget}`,
      };
    }

    if (snapshot.lastGroundedDeliverableMode === "explain" && target) {
      return {
        kind: "explain-continuation",
        executableNow: true,
        confidence: "medium",
        reason: "continue grounded explain",
        targetPath: target,
        continuationPrompt: `continue explaining ${promptTarget}`,
      };
    }

    if (snapshot.lastGroundedDeliverableMode === "summary" && target) {
      return {
        kind: "summary-continuation",
        executableNow: true,
        confidence: "medium",
        reason: "continue grounded summary",
        targetPath: target,
        continuationPrompt: `continue summarizing ${promptTarget}`,
      };
    }

    if (
      (snapshot.lastTaskKind === "edit-file" ||
        snapshot.lastTaskKind === "write-file") &&
      snapshot.lastTerminalClassification !== "success" &&
      target
    ) {
      const transform = this.extractLatestTransformDirective(snapshot, target);
      if (transform) {
        return {
          kind: "edit-fix",
          executableNow: true,
          confidence: "medium",
          reason: "continue pending mutation task",
          targetPath: target,
          replaceFrom: transform.from,
          replaceTo: transform.to,
          continuationPrompt: `continue editing ${target} by replacing ${this.quoteForDirective(transform.from)} with ${this.quoteForDirective(transform.to)}`,
        };
      }
      return {
        kind: "edit-fix",
        executableNow: false,
        confidence: "low",
        reason: "mutation continuation lacks explicit transform",
        targetPath: target,
        missingFields: ["replace-from", "replace-to"],
      };
    }

    if (snapshot.lastTaskKind && snapshot.lastTaskKind !== "chat") {
      return {
        kind: "task-continuation",
        executableNow: Boolean(target),
        confidence: target ? "medium" : "low",
        reason: "continue previous task",
        targetPath: target,
        continuationPrompt: target
          ? `continue previous ${snapshot.lastTaskKind} on ${target}`
          : undefined,
        ...(target ? {} : { missingFields: ["target"] }),
      };
    }

    return undefined;
  }

  private deriveStructuredNextStepPlan(
    snapshot: SessionContinuitySnapshot,
  ): SessionStructuredNextStepPlan | undefined {
    const target = snapshot.recentTargetFiles[0];
    const promptTarget = target ? this.formatTargetForPrompt(target) : undefined;
    const steps: SessionStructuredNextStepPlanStep[] = [];
    let planReason = "";
    let planConfidence: "high" | "medium" | "low" = "medium";

    const transform = this.extractLatestTransformDirective(snapshot, target);
    if (
      snapshot.lastVerificationStatus === "failed" &&
      target &&
      transform &&
      snapshot.lastVerificationCommand
    ) {
      planReason = "verification failed; continue fix then rerun verification";
      planConfidence = "high";
      steps.push({
        id: "fix-target",
        title: "Apply fix transform",
        kind: "edit-fix",
        executableNow: true,
        confidence: "high",
        reason: "continue mutation/fix on failed target",
        targetPath: target,
        replaceFrom: transform.from,
        replaceTo: transform.to,
        continuationPrompt: `continue editing ${promptTarget} by replacing ${this.quoteForDirective(transform.from)} with ${this.quoteForDirective(transform.to)}`,
      });
      steps.push({
        id: "rerun-verify",
        title: "Rerun verification",
        kind: "run-command",
        executableNow: true,
        confidence: "high",
        reason: snapshot.lastVerificationReason ?? "rerun verification",
        command: snapshot.lastVerificationCommand,
        continuationPrompt: `run ${snapshot.lastVerificationCommand}`,
      });
    } else if (
      snapshot.lastVerificationStatus === "blocked" &&
      target &&
      transform &&
      snapshot.lastVerificationCommand
    ) {
      planReason = "verification blocked; resolve command step then continue fix";
      planConfidence = "medium";
      steps.push({
        id: "resolve-verify",
        title: "Run verification command",
        kind: "run-command",
        executableNow: true,
        confidence: "high",
        reason: snapshot.lastVerificationReason ?? "verification blocked",
        command: snapshot.lastVerificationCommand,
        continuationPrompt: `run ${snapshot.lastVerificationCommand}`,
      });
      steps.push({
        id: "continue-fix",
        title: "Continue target fix",
        kind: "edit-fix",
        executableNow: true,
        confidence: "medium",
        reason: "continue pending target fix",
        targetPath: target,
        replaceFrom: transform.from,
        replaceTo: transform.to,
        continuationPrompt: `continue fixing previous failure in ${promptTarget} by replacing ${this.quoteForDirective(transform.from)} with ${this.quoteForDirective(transform.to)}`,
      });
    } else if (snapshot.lastGroundedDeliverableMode === "read" && target) {
      const count =
        snapshot.lastReadWindowSize ?? snapshot.lastReadDeliveredLines ?? 2;
      const boundedCount = Math.max(1, Math.min(count, 20));
      planReason = "continue grounded read, then explain the same slice";
      planConfidence = "medium";
      steps.push({
        id: "continue-read",
        title: "Continue read window",
        kind: "read-continuation",
        executableNow: true,
        confidence: "high",
        reason: "continue grounded read window",
        targetPath: target,
        readLineCount: boundedCount,
        readFilter: snapshot.lastReadFilter ?? "none",
        ...(snapshot.lastReadFragmentStart !== undefined
          ? { readFragmentStart: snapshot.lastReadFragmentStart }
          : {}),
        ...(snapshot.lastReadFragmentEnd !== undefined
          ? { readFragmentEnd: snapshot.lastReadFragmentEnd }
          : {}),
        ...(snapshot.lastReadFragmentLineIndexes?.length
          ? { readFragmentLineIndexes: snapshot.lastReadFragmentLineIndexes }
          : {}),
        ...(snapshot.lastReadFragmentRanges?.length
          ? { readFragmentRanges: snapshot.lastReadFragmentRanges }
          : {}),
        ...(snapshot.lastReadFragmentSourceWindowStart !== undefined
          ? {
              readFragmentSourceWindowStart:
                snapshot.lastReadFragmentSourceWindowStart,
            }
          : {}),
        ...(snapshot.lastReadFragmentSourceWindowEnd !== undefined
          ? {
              readFragmentSourceWindowEnd:
                snapshot.lastReadFragmentSourceWindowEnd,
            }
          : {}),
        ...(snapshot.lastReadFragmentFingerprint
          ? { readFragmentFingerprint: snapshot.lastReadFragmentFingerprint }
          : {}),
        ...(snapshot.lastReadFragmentStructureSignature
          ? {
              readFragmentStructureSignature:
                snapshot.lastReadFragmentStructureSignature,
            }
          : {}),
        ...(snapshot.lastReadFragmentNeighborhoodSignature
          ? {
              readFragmentNeighborhoodSignature:
                snapshot.lastReadFragmentNeighborhoodSignature,
            }
          : {}),
        continuationPrompt: `continue reading next ${boundedCount} lines of ${promptTarget}`,
      });
      steps.push({
        id: "explain-read-slice",
        title: "Explain delivered read slice",
        kind: "explain-continuation",
        executableNow: true,
        confidence: "medium",
        reason: "explain the recently delivered fragment",
        targetPath: target,
        ...(snapshot.lastReadFragmentStart !== undefined
          ? { readFragmentStart: snapshot.lastReadFragmentStart }
          : {}),
        ...(snapshot.lastReadFragmentEnd !== undefined
          ? { readFragmentEnd: snapshot.lastReadFragmentEnd }
          : {}),
        ...(snapshot.lastReadFragmentLineIndexes?.length
          ? { readFragmentLineIndexes: snapshot.lastReadFragmentLineIndexes }
          : {}),
        ...(snapshot.lastReadFragmentRanges?.length
          ? { readFragmentRanges: snapshot.lastReadFragmentRanges }
          : {}),
        ...(snapshot.lastReadFragmentSourceWindowStart !== undefined
          ? {
              readFragmentSourceWindowStart:
                snapshot.lastReadFragmentSourceWindowStart,
            }
          : {}),
        ...(snapshot.lastReadFragmentSourceWindowEnd !== undefined
          ? {
              readFragmentSourceWindowEnd:
                snapshot.lastReadFragmentSourceWindowEnd,
            }
          : {}),
        ...(snapshot.lastReadFragmentFingerprint
          ? { readFragmentFingerprint: snapshot.lastReadFragmentFingerprint }
          : {}),
        ...(snapshot.lastReadFragmentStructureSignature
          ? {
              readFragmentStructureSignature:
                snapshot.lastReadFragmentStructureSignature,
            }
          : {}),
        ...(snapshot.lastReadFragmentNeighborhoodSignature
          ? {
              readFragmentNeighborhoodSignature:
                snapshot.lastReadFragmentNeighborhoodSignature,
            }
          : {}),
        continuationPrompt: "continue explaining this part",
      });
    }

    if (steps.length <= 1) {
      return undefined;
    }

    const maxIndex = steps.length - 1;
    const completedFromSnapshot =
      snapshot.lastStagedRepairCompletedStep !== undefined
        ? Math.max(0, snapshot.lastStagedRepairCompletedStep)
        : 0;
    const inferredCurrentIndex = Math.max(
      0,
      Math.min(maxIndex, completedFromSnapshot),
    );
    const activeStep = steps[inferredCurrentIndex];
    return {
      planId: `${steps.map((step) => step.id).join("->")}:${target ?? "no-target"}`,
      reason: planReason,
      confidence: planConfidence,
      executableNow: Boolean(activeStep?.executableNow),
      currentStepIndex: inferredCurrentIndex,
      completedStepCount: Math.min(inferredCurrentIndex, steps.length),
      steps,
    };
  }

  private materializeStructuredNextStep(
    step: SessionStructuredNextStep,
  ): string | undefined {
    if (!step.executableNow) {
      return undefined;
    }
    return step.continuationPrompt;
  }

  private describeStructuredNextStep(step: SessionStructuredNextStep): string {
    const suffix = step.targetPath ? ` (target: ${step.targetPath})` : "";
    if (step.executableNow && step.continuationPrompt) {
      return `${step.reason}${suffix}.`;
    }
    const missing =
      step.missingFields && step.missingFields.length > 0
        ? ` Missing: ${step.missingFields.join(", ")}.`
        : "";
    return `${step.reason}${suffix}.${missing}`.trim();
  }

  private describeStructuredNextStepPlan(
    plan: SessionStructuredNextStepPlan,
  ): string {
    const activeStep = plan.steps[plan.currentStepIndex];
    if (!activeStep) {
      if (plan.steps.length > 0 && plan.completedStepCount >= plan.steps.length) {
        return `${plan.reason}. All ${plan.steps.length} steps completed.`;
      }
      return `${plan.reason} (no remaining step).`;
    }
    return `${plan.reason}. Step ${plan.currentStepIndex + 1}/${plan.steps.length}: ${activeStep.title}.`;
  }

  private persistStagedNextStepPlanProgress(
    sessionId: string,
    plan: SessionStructuredNextStepPlan,
    consumedStepIndex: number,
  ): void {
    const nextCursor = Math.min(plan.steps.length, consumedStepIndex + 1);
    const now = new Date().toISOString();
    this.withSessionStateLock(sessionId, () => {
      const statePath = this.getStatePath(sessionId);
      const currentState = this.readStateSnapshotSafely(statePath);
      const fallbackMemory = this.buildWorkingMemorySnapshot(sessionId);
      const currentMemory = currentState.workingMemory ?? fallbackMemory;
      const currentContinuity = currentMemory.continuity;
      const continuityPlan =
        currentContinuity.lastStructuredNextStepPlan?.planId === plan.planId
          ? currentContinuity.lastStructuredNextStepPlan
          : plan;
      const rebasedPlan: SessionStructuredNextStepPlan = {
        ...continuityPlan,
        currentStepIndex: Math.max(
          continuityPlan.currentStepIndex,
          Math.min(continuityPlan.steps.length, nextCursor),
        ),
        completedStepCount: Math.max(
          continuityPlan.completedStepCount,
          Math.min(continuityPlan.steps.length, consumedStepIndex + 1),
        ),
      };
      const activeStep = rebasedPlan.steps[rebasedPlan.currentStepIndex];
      const normalizedPlan: SessionStructuredNextStepPlan = {
        ...rebasedPlan,
        executableNow: Boolean(activeStep?.executableNow),
      };
      const nextContinuity: SessionContinuitySnapshot = {
        ...currentContinuity,
        lastStructuredNextStepPlan: normalizedPlan,
        workingMemoryUpdatedAt: now,
      };
      const nextSummary = this.buildWorkingMemorySummary(
        nextContinuity,
        currentMemory.compactReason ?? "none",
      );
      const nextMemory: SessionWorkingMemory = {
        ...currentMemory,
        updatedAt: now,
        continuity: {
          ...nextContinuity,
          workingMemorySummary: nextSummary,
        },
        summary: nextSummary,
      };
      const session = this.load(sessionId);
      const nextState = this.buildSessionStateSnapshot(session, currentState, {
        workingMemory: nextMemory,
      });
      this.writeJsonFileAtomic(statePath, nextState);
    });
  }

  private deriveImplicitContinuationPrompt(
    snapshot: SessionContinuitySnapshot,
  ): string | undefined {
    const target = snapshot.recentTargetFiles[0];
    const promptTarget = target ? this.formatTargetForPrompt(target) : undefined;
    if (
      snapshot.lastGroundedDeliverableMode === "read" &&
      target
    ) {
      const count = snapshot.lastReadWindowSize ?? snapshot.lastReadDeliveredLines ?? 2;
      return `continue reading next ${Math.max(1, Math.min(count, 20))} lines of ${promptTarget}`;
    }
    if (snapshot.lastGroundedDeliverableMode === "explain" && target) {
      return `continue explaining ${promptTarget}`;
    }
    if (snapshot.lastGroundedDeliverableMode === "summary" && target) {
      return `continue summarizing ${promptTarget}`;
    }
    if (snapshot.lastVerificationStatus === "failed") {
      if (target) {
        return `continue fixing previous failure in ${promptTarget}`;
      }
      return "continue fixing the previous failure";
    }
    if (snapshot.lastVerificationStatus === "blocked") {
      if (snapshot.lastVerificationCommand) {
        return `resolve blocker then rerun ${snapshot.lastVerificationCommand}`;
      }
      return "resolve previous blocker and continue";
    }
    if (snapshot.lastTaskKind && snapshot.lastTaskKind !== "chat") {
      return target
        ? `continue previous ${snapshot.lastTaskKind} on ${promptTarget}`
        : `continue previous ${snapshot.lastTaskKind}`;
    }
    return undefined;
  }

  private formatTargetForPrompt(target: string): string {
    const trimmed = target.trim();
    if (!trimmed) {
      return trimmed;
    }
    if (/^(?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)/.test(trimmed)) {
      return trimmed;
    }
    return `./${trimmed}`;
  }

  private extractLatestTransformDirective(
    snapshot: SessionContinuitySnapshot,
    preferredTarget?: string,
  ): { from: string; to: string } | undefined {
    const preferred = this.normalizePathLikeForTransform(preferredTarget);
    const evidence = snapshot.lastContinuationEvidence ?? [];
    for (let index = evidence.length - 1; index >= 0; index -= 1) {
      const parsed = this.parseTransformEvidenceForContinuation(
        evidence[index] ?? "",
      );
      if (!parsed) {
        continue;
      }
      if (
        preferred &&
        this.normalizePathLikeForTransform(parsed.path) !== preferred
      ) {
        continue;
      }
      return { from: parsed.from, to: parsed.to };
    }
    return undefined;
  }

  private parseTransformEvidenceForContinuation(
    evidence: string,
  ): { path: string; from: string; to: string } | undefined {
    const match = evidence.match(/^transform:([^:]+):(.+)=>(.+)$/i);
    if (!match?.[1] || !match?.[2] || !match?.[3]) {
      return undefined;
    }
    return {
      path: match[1].trim(),
      from: match[2].trim(),
      to: match[3].trim(),
    };
  }

  private quoteForDirective(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  private normalizePathLikeForTransform(
    candidate: string | undefined,
  ): string {
    return (candidate ?? "").trim().replace(/\\/g, "/").toLowerCase();
  }

  private shouldAttachCompactAwareContext(
    prompt: string,
    snapshot: SessionContinuitySnapshot,
  ): boolean {
    if (this.isContinuationPrompt(prompt)) {
      return true;
    }
    if (snapshot.workingMemoryCompacted) {
      return true;
    }
    if (snapshot.unresolvedItems.length > 0) {
      return true;
    }
    if (snapshot.lastTaskKind && snapshot.lastTaskKind !== "chat") {
      return true;
    }
    return false;
  }

  private packContextLinesWithinBudget(
    lines: readonly string[],
    maxChars: number,
  ): string[] {
    const output: string[] = [];
    let remaining = maxChars;
    for (const line of lines) {
      if (remaining <= 0) {
        break;
      }
      if (line.length <= remaining) {
        output.push(line);
        remaining -= line.length + 1;
        continue;
      }
      if (remaining > 32) {
        output.push(`${line.slice(0, remaining - 3)}...`);
        remaining = 0;
      }
      break;
    }
    return output;
  }

  buildPromptContinuitySnapshot(
    sessionId: string,
    currentPrompt: string,
  ): SessionContinuitySnapshot | undefined {
    const snapshot = this.ensureWorkingMemory(sessionId).continuity;
    if (this.isContinuationPrompt(currentPrompt)) {
      return snapshot;
    }
    if (this.shouldAutoAttachPathlessContinuation(currentPrompt, snapshot)) {
      return snapshot;
    }
    if ((snapshot.freshnessHistoryCount ?? 0) > 0) {
      return this.createBoundaryOnlyContinuitySnapshot(snapshot);
    }
    return undefined;
  }

  private createBoundaryOnlyContinuitySnapshot(
    snapshot: SessionContinuitySnapshot,
  ): SessionContinuitySnapshot {
    return {
      sessionId: snapshot.sessionId,
      projectRoot: snapshot.projectRoot,
      continuationFamilyId: snapshot.continuationFamilyId,
      continuationEpoch: snapshot.continuationEpoch,
      ...(snapshot.continuationFamilyAnchor
        ? { continuationFamilyAnchor: snapshot.continuationFamilyAnchor }
        : {}),
      lastTaskKind: snapshot.lastTaskKind,
      lastGroundedDeliverableMode: snapshot.lastGroundedDeliverableMode,
      ...(snapshot.lastReadDeliveredLines !== undefined
        ? { lastReadDeliveredLines: snapshot.lastReadDeliveredLines }
        : {}),
      ...(snapshot.lastReadWindowStart !== undefined
        ? { lastReadWindowStart: snapshot.lastReadWindowStart }
        : {}),
      ...(snapshot.lastReadWindowEnd !== undefined
        ? { lastReadWindowEnd: snapshot.lastReadWindowEnd }
        : {}),
      ...(snapshot.lastReadWindowSize !== undefined
        ? { lastReadWindowSize: snapshot.lastReadWindowSize }
        : {}),
      ...(snapshot.lastReadFragmentStart !== undefined
        ? { lastReadFragmentStart: snapshot.lastReadFragmentStart }
        : {}),
      ...(snapshot.lastReadFragmentEnd !== undefined
        ? { lastReadFragmentEnd: snapshot.lastReadFragmentEnd }
        : {}),
      ...(snapshot.lastReadFragmentSourceWindowStart !== undefined
        ? {
            lastReadFragmentSourceWindowStart:
              snapshot.lastReadFragmentSourceWindowStart,
          }
        : {}),
      ...(snapshot.lastReadFragmentSourceWindowEnd !== undefined
        ? {
            lastReadFragmentSourceWindowEnd:
              snapshot.lastReadFragmentSourceWindowEnd,
          }
        : {}),
      ...(snapshot.lastReadFragmentLineIndexes?.length
        ? { lastReadFragmentLineIndexes: snapshot.lastReadFragmentLineIndexes }
        : {}),
      ...(snapshot.lastReadFragmentRanges?.length
        ? { lastReadFragmentRanges: snapshot.lastReadFragmentRanges }
        : {}),
      ...(snapshot.lastReadFilter
        ? { lastReadFilter: snapshot.lastReadFilter }
        : {}),
      ...(snapshot.lastDurableStatus
        ? { lastDurableStatus: snapshot.lastDurableStatus }
        : {}),
      ...(snapshot.lastRecoveryDisposition
        ? { lastRecoveryDisposition: snapshot.lastRecoveryDisposition }
        : {}),
      ...(snapshot.lastReadFragmentFingerprint
        ? { lastReadFragmentFingerprint: snapshot.lastReadFragmentFingerprint }
        : {}),
      ...(snapshot.lastReadFragmentStructureSignature
        ? {
            lastReadFragmentStructureSignature:
              snapshot.lastReadFragmentStructureSignature,
          }
        : {}),
      ...(snapshot.lastReadFragmentNeighborhoodSignature
        ? {
            lastReadFragmentNeighborhoodSignature:
              snapshot.lastReadFragmentNeighborhoodSignature,
          }
        : {}),
      ...(snapshot.lastStructuredNextStep
        ? { lastStructuredNextStep: snapshot.lastStructuredNextStep }
        : {}),
      ...(snapshot.lastStructuredNextStepPlan
        ? { lastStructuredNextStepPlan: snapshot.lastStructuredNextStepPlan }
        : {}),
      lastTerminalClassification: snapshot.lastTerminalClassification,
      lastTerminalReason: snapshot.lastTerminalReason,
      recentChangedFiles: [],
      recentTargetFiles: [],
      recentFailedFiles: [],
      recentVerifiedFiles: [],
      lastRepairNotes: [],
      lastContinuationEvidence: [],
      lastTaskSatisfactionReasons: [],
      unresolvedItems: [],
      ...(snapshot.freshnessHistoryCount
        ? { freshnessHistoryCount: snapshot.freshnessHistoryCount }
        : {}),
      ...(snapshot.freshnessAgeTurnDistance !== undefined
        ? { freshnessAgeTurnDistance: snapshot.freshnessAgeTurnDistance }
        : {}),
      ...(snapshot.freshnessAgeNotConsumedTurns !== undefined
        ? { freshnessAgeNotConsumedTurns: snapshot.freshnessAgeNotConsumedTurns }
        : {}),
    };
  }

  private shouldCompactWorkingMemory(input: {
    eventCount: number;
    turnCount: number;
  }): { compacted: boolean; reason: "event-budget" | "turn-budget" | "none" } {
    if (
      input.eventCount >= SessionManager.WORKING_MEMORY_EVENT_COMPACT_THRESHOLD
    ) {
      return { compacted: true, reason: "event-budget" };
    }
    if (
      input.turnCount >= SessionManager.WORKING_MEMORY_TURN_COMPACT_THRESHOLD
    ) {
      return { compacted: true, reason: "turn-budget" };
    }
    return { compacted: false, reason: "none" };
  }

  private compactContinuitySnapshot(
    snapshot: SessionContinuitySnapshot,
  ): SessionContinuitySnapshot {
    return {
      ...snapshot,
      recentChangedFiles: snapshot.recentChangedFiles.slice(
        0,
        SessionManager.WORKING_MEMORY_RECENT_FILE_LIMIT,
      ),
      recentTargetFiles: snapshot.recentTargetFiles.slice(
        0,
        SessionManager.WORKING_MEMORY_RECENT_FILE_LIMIT,
      ),
      recentVerifiedFiles: snapshot.recentVerifiedFiles.slice(
        0,
        SessionManager.WORKING_MEMORY_RECENT_FILE_LIMIT,
      ),
      recentFailedFiles: snapshot.recentFailedFiles.slice(
        0,
        SessionManager.WORKING_MEMORY_RECENT_FAILURE_LIMIT,
      ),
      lastRepairNotes: snapshot.lastRepairNotes.slice(
        0,
        SessionManager.WORKING_MEMORY_REPAIR_NOTE_LIMIT,
      ),
      lastContinuationEvidence: snapshot.lastContinuationEvidence.slice(
        0,
        SessionManager.WORKING_MEMORY_EVIDENCE_LIMIT,
      ),
      lastTaskSatisfactionReasons: snapshot.lastTaskSatisfactionReasons.slice(
        0,
        SessionManager.WORKING_MEMORY_EVIDENCE_LIMIT,
      ),
      unresolvedItems: snapshot.unresolvedItems.slice(
        0,
        SessionManager.WORKING_MEMORY_EVIDENCE_LIMIT,
      ),
      ...(snapshot.lastReadFragmentLineIndexes?.length
        ? {
            lastReadFragmentLineIndexes: snapshot.lastReadFragmentLineIndexes.slice(
              0,
              128,
            ),
          }
        : {}),
      ...(snapshot.lastReadFragmentRanges?.length
        ? { lastReadFragmentRanges: snapshot.lastReadFragmentRanges.slice(0, 128) }
        : {}),
    };
  }

  private buildWorkingMemorySummary(
    snapshot: SessionContinuitySnapshot,
    compactReason: "event-budget" | "turn-budget" | "none",
  ): string[] {
    const summary: string[] = [];
    if (compactReason !== "none") {
      summary.push(`compacted:${compactReason}`);
    }
    if (snapshot.lastTaskKind) {
      summary.push(`active-task:${snapshot.lastTaskKind}`);
    }
    if (snapshot.lastGroundedDeliverableMode) {
      summary.push(`deliverable:${snapshot.lastGroundedDeliverableMode}`);
    }
    if (snapshot.lastStructuredNextStep) {
      summary.push(
        `next-step:${snapshot.lastStructuredNextStep.kind}:${snapshot.lastStructuredNextStep.executableNow ? "ready" : "blocked"}`,
      );
    }
    if (snapshot.lastStructuredNextStepPlan) {
      const activeStep =
        snapshot.lastStructuredNextStepPlan.steps[
          snapshot.lastStructuredNextStepPlan.currentStepIndex
        ];
      summary.push(
        `next-step-plan:${snapshot.lastStructuredNextStepPlan.currentStepIndex + 1}/${snapshot.lastStructuredNextStepPlan.steps.length}:${activeStep?.kind ?? "unknown"}`,
      );
    }
    if (snapshot.recentTargetFiles.length > 0) {
      summary.push(`target:${snapshot.recentTargetFiles[0]}`);
    }
    if (
      snapshot.lastReadWindowStart !== undefined &&
      snapshot.lastReadWindowEnd !== undefined
    ) {
      summary.push(
        `read-window:${snapshot.lastReadWindowStart}-${snapshot.lastReadWindowEnd}`,
      );
    }
    if (snapshot.lastStagedRepairNextStep !== undefined) {
      summary.push(`staged-next-step:${snapshot.lastStagedRepairNextStep}`);
    }
    if (snapshot.lastFailure) {
      summary.push(`last-failure:${this.compactText(snapshot.lastFailure, 120)}`);
    }
    if (snapshot.unresolvedItems.length > 0) {
      summary.push(
        `unresolved:${snapshot.unresolvedItems
          .slice(0, 2)
          .map((item) => this.compactText(item, 80))
          .join(" | ")}`,
      );
    }
    return summary.slice(0, SessionManager.WORKING_MEMORY_SUMMARY_ITEM_LIMIT);
  }

  private buildWorkingMemorySnapshot(sessionId: string): SessionWorkingMemory {
    const session = this.load(sessionId);
    const transcriptEvents = this.getTranscriptEvents(sessionId);
    const continuity = this.buildContinuitySnapshot(sessionId);
    const compactPolicy = this.shouldCompactWorkingMemory({
      eventCount: transcriptEvents.length,
      turnCount: session.turns.length,
    });
    const compactedContinuity = compactPolicy.compacted
      ? this.compactContinuitySnapshot(continuity)
      : continuity;
    const summary = this.buildWorkingMemorySummary(
      compactedContinuity,
      compactPolicy.reason,
    );
    const updatedAt = new Date().toISOString();
    return {
      schemaVersion: 1,
      updatedAt,
      sourceEventCount: transcriptEvents.length,
      sourceTurnCount: session.turns.length,
      compacted: compactPolicy.compacted,
      compactReason: compactPolicy.reason,
      continuity: {
        ...compactedContinuity,
        workingMemoryCompacted: compactPolicy.compacted,
        workingMemorySourceEventCount: transcriptEvents.length,
        workingMemorySourceTurnCount: session.turns.length,
        workingMemorySummary: summary,
        workingMemoryUpdatedAt: updatedAt,
      },
      summary,
    };
  }

  private persistWorkingMemory(
    sessionId: string,
    memory: SessionWorkingMemory,
  ): void {
    const session = this.load(sessionId);
    this.withSessionStateLock(sessionId, () => {
      const statePath = this.getStatePath(sessionId);
      const current = this.readStateSnapshotSafely(statePath);
      const snapshot = this.buildSessionStateSnapshot(session, current, {
        workingMemory: memory,
      });
      this.writeJsonFileAtomic(statePath, snapshot);
    });
  }

  private refreshWorkingMemory(sessionId: string): void {
    try {
      const nextMemory = this.buildWorkingMemorySnapshot(sessionId);
      this.persistWorkingMemory(sessionId, nextMemory);
    } catch {
      // Working-memory refresh is best-effort and must not break primary flow.
    }
  }

  private ensureWorkingMemory(sessionId: string): SessionWorkingMemory {
    const statePath = this.getStatePath(sessionId);
    const currentState = this.readStateSnapshotRequired(statePath);
    const session = this.load(sessionId);
    const transcriptEvents = this.getTranscriptEvents(sessionId);
    const sourceEventCount = transcriptEvents.length;
    const sourceTurnCount = session.turns.length;
    const currentMemory = currentState.workingMemory;
    if (
      currentMemory &&
      currentMemory.sourceEventCount === sourceEventCount &&
      currentMemory.sourceTurnCount === sourceTurnCount
    ) {
      return currentMemory;
    }
    const rebuilt = this.buildWorkingMemorySnapshot(sessionId);
    this.persistWorkingMemory(sessionId, rebuilt);
    return rebuilt;
  }

  private shouldAutoAttachPathlessContinuation(
    prompt: string,
    snapshot: SessionContinuitySnapshot,
  ): boolean {
    const normalized = prompt.toLowerCase().trim();
    if (!normalized) {
      return false;
    }
    if (this.extractPathLikeTargets(prompt).length > 0) {
      return false;
    }
    if (snapshot.recentTargetFiles.length === 0) {
      return false;
    }

    const hasActionIntent =
      /\b(read|inspect|open|show|explain|summari[sz]e|edit|modify|fix|repair|replace|continue|verify|test|build|same)\b/i.test(
        normalized,
      ) ||
      /(?:\u7ee7\u7eed|\u63a5\u7740|\u4fee|\u6539|\u8bfb|\u770b|\u89e3\u91ca|\u603b\u7ed3|\u8865\u9f50|\u540c\u6837)/u.test(
        prompt,
      );
    if (!hasActionIntent) {
      return false;
    }

    return Boolean(
      (snapshot.lastTaskKind && snapshot.lastTaskKind !== "chat") ||
        snapshot.unresolvedItems.length > 0 ||
        snapshot.lastFailure,
    );
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

  private hasReadStateEvidence(evidence: readonly string[] | undefined): boolean {
    if (!evidence?.length) {
      return false;
    }
    const window = this.extractLastReadWindow(evidence);
    if (
      window.start !== undefined ||
      window.end !== undefined ||
      window.size !== undefined
    ) {
      return true;
    }
    const fragment = this.extractLastReadFragment(evidence);
    return (
      fragment.start !== undefined ||
      fragment.end !== undefined ||
      (fragment.ranges?.length ?? 0) > 0 ||
      (fragment.lineIndexes?.length ?? 0) > 0
    );
  }

  private hasStagedProgressEvidence(
    evidence: readonly string[] | undefined,
  ): boolean {
    if (!evidence?.length) {
      return false;
    }
    const staged = this.extractStagedRepairProgress(evidence);
    return (
      staged.stepCount !== undefined ||
      staged.completedStep !== undefined ||
      staged.blockedStep !== undefined ||
      staged.nextStep !== undefined
    );
  }

  private deriveTerminalClassificationFromDurableStatus(
    durableStatus: "success" | "stopped" | "error" | undefined,
  ): TerminalClassification | undefined {
    if (!durableStatus) {
      return undefined;
    }
    return durableStatus === "success"
      ? "success"
      : durableStatus === "stopped"
        ? "stopped"
        : "error";
  }

  private deriveTerminalReasonFromDurableStatus(
    durableStatus: "success" | "stopped" | "error" | undefined,
  ): TerminalReason | undefined {
    if (!durableStatus) {
      return undefined;
    }
    if (durableStatus === "success") {
      return "completed";
    }
    if (durableStatus === "stopped") {
      return "stopped_error";
    }
    return "stopped_error";
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
    structureSignature?: string;
    neighborhoodSignature?: string;
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
    let structureSignature: string | undefined;
    let neighborhoodSignature: string | undefined;
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
      if (structureSignature === undefined) {
        const match = item.match(
          /^read-fragment-structure-signature:([0-9a-f]{64})$/,
        );
        if (match?.[1]) {
          structureSignature = match[1];
        }
      }
      if (neighborhoodSignature === undefined) {
        const match = item.match(
          /^read-fragment-neighborhood-signature:([0-9a-f]{64})$/,
        );
        if (match?.[1]) {
          neighborhoodSignature = match[1];
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
      ...(structureSignature ? { structureSignature } : {}),
      ...(neighborhoodSignature ? { neighborhoodSignature } : {}),
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

  private scoreSessionReentrySummary(
    summary: SessionReentrySummary,
    preferredProjectRoot?: string,
  ): number {
    let score = 0;

    if (summary.resumeDisposition === "fully-resumable") {
      score += 200;
    } else if (summary.resumeDisposition === "partially-resumable") {
      score += 120;
    }

    if (
      preferredProjectRoot &&
      preferredProjectRoot === summary.projectRoot.trim()
    ) {
      score += 90;
    }

    if (summary.pendingPrompt?.trim()) {
      score += 30;
    }

    if (summary.terminalClassification === "success") {
      score -= 10;
    }

    const updatedAt = new Date(summary.updatedAt).getTime();
    if (Number.isFinite(updatedAt)) {
      score += Math.floor(updatedAt / 1000);
    }

    return score;
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

  private findLastNonChatCodingCompletionEvent(
    transcriptEvents: readonly TranscriptEvent[],
  ):
    | (Extract<TranscriptEvent, { type: "query-event" }> & {
        event: Extract<QueryEvent, { type: "query.completed" }>;
      })
    | undefined {
    for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
      const event = transcriptEvents[index];
      if (event?.type !== "query-event") {
        continue;
      }
      if (event.event.type !== "query.completed") {
        continue;
      }
      if (
        event.event.result.codingResult &&
        event.event.result.codingResult.taskKind !== "chat"
      ) {
        return event as Extract<TranscriptEvent, { type: "query-event" }> & {
          event: Extract<QueryEvent, { type: "query.completed" }>;
        };
      }
    }
    return undefined;
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

  private stripContinuityContextBlock(input: string): string {
    return input
      .replace(
        /\[FOLLOW-UP CONTINUITY CONTEXT\][\s\S]*?\[END CONTINUITY CONTEXT\]/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  private selectContinuationEvidenceForSnapshot(
    evidence: readonly string[],
  ): string[] {
    const resumeMarkerPattern =
      /^session-resume-(?:source|requested|resolved|rebind-from-missing):/i;
    const canonicalResumeMarkers = this.canonicalizeResumeProvenanceMarkers(
      evidence.filter((entry) => resumeMarkerPattern.test(entry)),
    );
    const evidenceWithoutResume = evidence.filter(
      (entry) => !resumeMarkerPattern.test(entry),
    );

    if (evidenceWithoutResume.length <= 8) {
      return [...canonicalResumeMarkers, ...evidenceWithoutResume];
    }

    const keep = evidenceWithoutResume.slice(0, 8);
    const criticalPrefixes = [
      "session-resume-source:",
      "session-resume-requested:",
      "session-resume-resolved:",
      "session-resume-rebind-from-missing:",
      "continuation-family:",
      "continuation-epoch:",
      "continuation-family-anchor:",
      "continuation-family-reset:",
      "continuation-epoch-bump:",
      "continuation-family-consumption:",
      "continuation-family-mismatch-pruned",
      "continuation-lineage-match:",
      "continuation-lineage-cut:",
      "continuation-lineage-mismatch-pruned",
      "continuation-lineage-active:",
      "continuation-lineage-slot:",
      "repair-remaining-files:",
      "repair-failed-files:",
      "repair-processed-files:",
      "repair-skipped-files:",
      "repair-outcome:",
      "reopen-candidates:",
      "why-not-auto-select:",
      "blocked-disambiguation",
      "reopen-target:",
      "reopen-reason:",
    ];

    for (const entry of evidence) {
      const lowered = entry.toLowerCase();
      if (
        criticalPrefixes.some((prefix) => lowered.startsWith(prefix)) &&
        !keep.includes(entry)
      ) {
        keep.push(entry);
      }
    }

    const prioritizedPrefixes = [
      "session-resume-source:",
      "session-resume-requested:",
      "session-resume-resolved:",
      "session-resume-rebind-from-missing:",
      "continuation-lineage-active:",
      "continuation-lineage-slot:",
      "continuation-family:",
      "continuation-epoch:",
      "continuation-family-anchor:",
    ];
    const prioritized = keep.filter((entry) =>
      prioritizedPrefixes.some((prefix) =>
        entry.toLowerCase().startsWith(prefix),
      ),
    );
    const remainder = keep.filter((entry) => !prioritized.includes(entry));
    return Array.from(
      new Set([...canonicalResumeMarkers, ...prioritized, ...remainder]),
    ).slice(0, 16);
  }

  private canonicalizeResumeProvenanceMarkers(
    markers: readonly string[],
  ): string[] {
    if (markers.length === 0) {
      return [];
    }

    const takeLast = (prefix: string): string | undefined => {
      for (let index = markers.length - 1; index >= 0; index -= 1) {
        const marker = markers[index];
        if (marker.toLowerCase().startsWith(prefix)) {
          return marker;
        }
      }
      return undefined;
    };

    const source = takeLast("session-resume-source:");
    const requested = takeLast("session-resume-requested:");
    const resolved = takeLast("session-resume-resolved:");
    const rebindFromMissing = takeLast("session-resume-rebind-from-missing:");
    return [source, requested, resolved, rebindFromMissing].filter(
      (entry): entry is string => Boolean(entry),
    );
  }

  private extractContinuationFamilyId(
    evidence: readonly string[],
  ): string | undefined {
    const marker = evidence.find((entry) =>
      entry.toLowerCase().startsWith("continuation-family:"),
    );
    if (!marker) {
      return undefined;
    }
    const value = marker.slice("continuation-family:".length).trim();
    return value.length > 0 ? value : undefined;
  }

  private extractContinuationEpoch(
    evidence: readonly string[],
  ): number | undefined {
    const marker = evidence.find((entry) =>
      entry.toLowerCase().startsWith("continuation-epoch:"),
    );
    if (!marker) {
      return undefined;
    }
    const value = Number.parseInt(
      marker.slice("continuation-epoch:".length).trim(),
      10,
    );
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  private extractContinuationFamilyAnchor(
    evidence: readonly string[],
  ): string | undefined {
    const marker = evidence.find((entry) =>
      entry.toLowerCase().startsWith("continuation-family-anchor:"),
    );
    if (!marker) {
      return undefined;
    }
    const value = marker
      .slice("continuation-family-anchor:".length)
      .trim();
    const normalized = this.normalizePathLikeTarget(value);
    return normalized && normalized.length > 0 ? normalized : undefined;
  }

  private extractPathLikeTargets(input?: string): string[] {
    if (!input?.trim()) {
      return [];
    }

    const absoluteOrRelativeMatches =
      input.match(
        /(?:\.{1,2}[\\/]|[A-Za-z]:[\\/])[\w\-./\\]+(?:\.[A-Za-z0-9]+)?/g,
      ) ?? [];
    const slashPathMatches =
      input.match(
        /(?:^|[\s"'`(])((?:[\w.-]+[\\/])+[\w.-]+(?:\.[A-Za-z0-9]{1,8})?)(?=$|[\s"'`),.;:!?])/g,
      ) ?? [];
    const fileNameWithExtensionMatches =
      input.match(
        /(?:^|[\s"'`(])([\w.-]+\.[A-Za-z0-9]{1,8})(?=$|[\s"'`),.;:!?])/g,
      ) ?? [];

    const rawMatches = [
      ...absoluteOrRelativeMatches,
      ...slashPathMatches.map((entry) => entry.trim()),
      ...fileNameWithExtensionMatches.map((entry) => entry.trim()),
    ];

    return Array.from(
      new Set(
        rawMatches
          .map((value) => this.normalizePathLikeTarget(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  private normalizePathLikeTarget(value: string): string | undefined {
    const trimmed = value
      .trim()
      .replace(/^[\s"'`(]+/, "")
      .replace(/[\s"'`),.;:!?]+$/, "")
      .replace(/\\/g, "/");
    if (!trimmed || trimmed.includes("://")) {
      return undefined;
    }
    if (!/[./\\]/.test(trimmed)) {
      return undefined;
    }
    return trimmed;
  }

  private isContinuationPrompt(prompt: string): boolean {
    const normalized = prompt.toLowerCase().trim();
    if (normalized.length === 0) {
      return false;
    }
    const normalizedCompact = normalized
      .replace(/[。！？?.\s]+$/gu, "")
      .replace(/\s+/g, " ");
    const hasTerseContinuationCue =
      /^(then|go on|so|continue|and then)\??$/i.test(normalizedCompact) ||
      /^(继续|然后|接着|接下来呢|继续呢)$/u.test(normalizedCompact);
    if (hasTerseContinuationCue) {
      return true;
    }

    const hasExplicitTarget = this.extractPathLikeTargets(prompt).length > 0;
    const hasStagedFollowUpConnector =
      /\b(first|then|and then)\b/i.test(normalized) ||
      /(?:鍏坾鐒跺悗|鍐峾骞惰В閲妡骞惰鏄巪骞惰ˉ)/u.test(prompt);
    const hasGroundedRepairSignal =
      /\b(summarize|summary|explain|read|conclusion|evidence|risk)\b/i.test(
        normalized,
      ) ||
      /(?:鎬荤粨|鎽樿|瑙ｉ噴|璇诲彇|缁撹|渚濇嵁|鍏抽敭椋庨櫓|杈撳叆杈撳嚭)/u.test(prompt);
    if (!hasExplicitTarget && hasStagedFollowUpConnector && hasGroundedRepairSignal) {
      return true;
    }

    const hasDeicticFollowUpCue =
      /\b(this file|that file|same file|this issue|that issue|same issue|this task|that task|same task|this one|that one)\b/i.test(
        normalized,
      ) ||
      /(?:\u8fd9\u4e2a\u6587\u4ef6|\u90a3\u4e2a\u6587\u4ef6|\u540c\u4e00\u4e2a\u6587\u4ef6|\u8fd9\u4e2a\u95ee\u9898|\u90a3\u4e2a\u95ee\u9898|\u540c\u4e00\u4e2a\u95ee\u9898|\u8fd9\u4e2a\u4efb\u52a1|\u90a3\u4e2a\u4efb\u52a1|\u540c\u4e00\u4e2a\u4efb\u52a1|\u7ee7\u7eed\u521a\u624d\u90a3\u4e2a\u6587\u4ef6)/u.test(
        prompt,
      );
    if (hasDeicticFollowUpCue) {
      return true;
    }

    const hasCorrectionCue =
      /\b(not this|not what i asked|not that edit|keep first line|only second line|redo previous answer|re-answer|reanswer|revise last answer|not method|just summarize|same target)\b/i.test(
        normalized,
      ) ||
      /(?:\u4e0d\u662f\u8fd9\u4e2a\u610f\u601d|\u6211\u8981\u7684\u662f|\u4e0d\u662f.*\u800c\u662f|\u4e0d\u662f\u8fd9\u4e48\u6539|\u4fdd\u7559.*\u4e0d\u52a8|\u53ea\u6539\u7b2c[\u4e00\u4e8c\u4e09\u56db\d]+\u884c|\u4e0d\u662f\u65b9\u6cd5|\u76f4\u63a5\u7ed9\u6458\u8981|\u91cd\u7b54\u4e0a\u4e00\u9898|\u91cd\u65b0\u603b\u7ed3|\u4f60\u8fd8\u662f\u6ca1\u6709\u5386\u53f2\u8bb0\u5f55)/u.test(
        prompt,
      );
    if (hasCorrectionCue) {
      return true;
    }

    if (
      /\b(continue|continuation|follow up|follow-up|previous|last run|last failure|same issue|keep going|resume|pick up|try again|finish the rest|use the previous failure|use the failed one|continue but not that|repair the other one|not that one|other related file)\b/i.test(
        normalized,
      ) ||
      /(?:\u7ee7\u7eed|\u63a5\u7740|\u521a\u624d|\u4e0a\u4e00\u8f6e|\u4e0a\u4e00\u6b21|\u4e0a\u4e2a\u95ee\u9898|\u7ee7\u7eed\u4fee|\u63a5\u7740\u4fee|\u5ef6\u7eed|\u4e0d\u8981\u518d\u8d70\u521a\u624d|\u518d\u8bd5\u4e00\u6b21|\u8865\u9f50\u5269\u4e0b|\u7528\u4e0a\u4e00\u6b21\u5931\u8d25)/u.test(
        prompt,
      )
    ) {
      return true;
    }

    const continuationSignals = [
      "continue",
      "continuation",
      "follow up",
      "follow-up",
      "same issue",
      "previous",
      "last run",
      "last failure",
      "keep going",
      "try again",
      "finish the rest",
      "use the previous failure",
      "use the failed one",
      "continue but not that",
      "repair the other one",
      "not that one",
      "other related file",
      "not that edit",
      "keep first line",
      "only second line",
      "\u63a5\u7740",
      "\u7ee7\u7eed",
      "\u521a\u624d",
      "\u4e0a\u4e00\u8f6e",
      "\u4e0a\u4e00\u6b21",
      "\u4e0a\u4e2a\u95ee\u9898",
      "\u6211\u8981\u7684\u662f",
      "\u4e0d\u662f\u8fd9\u4e2a\u610f\u601d",
      "\u4e0d\u662f\u8fd9\u4e48\u6539",
      "\u91cd\u7b54\u4e0a\u4e00\u9898",
      "\u7ee7\u7eed\u521a\u624d\u90a3\u4e2a\u6587\u4ef6",
      "\u7ee7\u7eed\u4fee\u521a\u624d\u90a3\u4e2a\u5931\u8d25",
      "\u4e0d\u8981\u518d\u8d70\u521a\u624d",
      "\u518d\u8bd5\u4e00\u6b21",
      "\u8865\u9f50\u5269\u4e0b",
      "\u7528\u4e0a\u4e00\u6b21\u5931\u8d25",
    ];

    return continuationSignals.some((signal) => normalized.includes(signal));
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

    const hasContinuationEvidence = this.hasContinuationEvidence(snapshot);
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

    if (!this.hasDeterministicTerminalEvidence(snapshot)) {
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

  private hasContinuationEvidence(snapshot: RecoverySnapshot): boolean {
    const hasPendingPrompt =
      typeof snapshot.pendingPrompt === "string" &&
      snapshot.pendingPrompt.trim().length > 0;
    const hasActiveRunPhase =
      snapshot.runPhase === "prompt-persisted" ||
      snapshot.runPhase === "turn-active";
    const hasPendingLifecycle =
      Object.keys(snapshot.pendingLifecycle.pendingApprovals).length > 0 ||
      Object.keys(snapshot.pendingLifecycle.pendingTools).length > 0;

    return hasPendingPrompt || hasActiveRunPhase || hasPendingLifecycle;
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

  private hasDeterministicTerminalEvidence(
    snapshot: RecoverySnapshot,
  ): boolean {
    if (snapshot.durableStatus) {
      return true;
    }

    if (snapshot.terminalClassification || snapshot.terminalReason) {
      return true;
    }

    return (
      snapshot.lastLifecycleEvent?.event === "run-completed" ||
      snapshot.lastLifecycleEvent?.event === "run-error" ||
      snapshot.lastLifecycleEvent?.event === "run-terminated"
    );
  }

  private createRecoveryTrustBoundaryBlock(
    session: Session,
    reason: RecoveryTrustBoundaryBlock["reason"],
    detail: string,
  ): RecoveryTrustBoundaryBlock {
    return {
      sessionId: session.id,
      reason,
      detail,
      recoveryHint: `Session ${session.id} is not recoverable. Start a fresh session or manually repair ${this.getSessionDir(session.id)}.`,
    };
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
    const metadata: SessionMetadata = {
      id: session.id,
      projectRoot: session.projectRoot,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
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
        | "workingMemory"
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
      `${JSON.stringify(event)}\n`,
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
      const snapshot = this.buildSessionStateSnapshot(session, current, {
        pendingLifecycle: applyLifecycleEventToIndex(
          current?.pendingLifecycle ?? createEmptyLifecycleIndex(),
          event,
        ),
      });
      this.writeJsonFileAtomic(statePath, snapshot);
    });
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
      const parsedEvents = transcriptLines.map((line) => {
        const event = JSON.parse(line) as TranscriptEvent;
        if (event.type === "message") {
          const message: SessionMessage = {
            role: event.role,
            content: event.content,
            timestamp: event.timestamp,
          };
          return message;
        }

        return null;
      });
      const turns: SessionMessage[] = parsedEvents.filter(
        (event): event is SessionMessage => event !== null,
      );

      return {
        id: metadata.id,
        projectRoot:
          metadata.projectRoot?.trim() ||
          state.projectRoot?.trim() ||
          process.cwd(),
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
        | "workingMemory"
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
      durableStatus: toDurableStatus(
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
      workingMemory:
        overrides &&
        Object.prototype.hasOwnProperty.call(overrides, "workingMemory")
          ? overrides.workingMemory
          : current?.workingMemory,
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
          fs.closeSync(fd);
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

