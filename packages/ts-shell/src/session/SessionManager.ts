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
import { forkSession, type SessionForkOptions } from './branch/create.js';
import { revertSession } from './navigation/revert.js';
import type { SessionMessage } from "./schema/sessionMessage.js";
import type { Session } from "./schema/sessionRecord.js";
import type { SessionStateSnapshot } from "./schema/sessionStateSnapshot.js";
import { buildSessionStateSnapshot } from "./schema/sessionStateSnapshot.js";
import { validateSessionId } from "./store/sessionFileLayout.js";
import {
  createSession,
  createSessionWithId,
} from "./store/sessionCreation.js";
import { SessionStoreAccess } from "./store/sessionStoreAccess.js";
import { readSessionMetadataRecord } from "./store/sessionStore.js";
import type {
  ApprovalAuditMemoryState,
  SessionContinuitySnapshot,
} from "./sessionContinuityTypes.js";
import { type WorkspaceRootMode, type ProjectBindingOptions } from "./store/projectBindingPolicy.js";
import { applySessionWorkspaceBinding } from "./store/sessionProjectBinding.js";
import { SessionReentrySurface } from "./recovery/reentry.js";
import { rebindSessionProjectRootContinuity, SessionRootRebindError, type SessionRootRebindOptions } from "./continuation/sessionProjectRootRebind.js";
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

export class SessionManager extends SessionReentrySurface {
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

  private createSessionCreationCallbacks(activate = true) {
    return {
      sessionExists: (sessionId: string) => this.sessionExists(sessionId),
      validateSessionId,
      createSessionId: () => this.host.store.createSessionId(),
      writeSession: (session: Session) => this.host.store.writeSession(session),
      setCurrentSessionForProject: (projectRoot: string, sessionId: string) =>
        activate ? this.setCurrentSessionForProject(projectRoot, sessionId) : undefined,
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
      getCurrentSessionForProject: (projectRoot: string) => this.host.store.getCurrentSessionForProject(projectRoot, { readOnly: true }),
      evaluateRecoveryTrustBoundary: (session: Session) =>
        this.evaluateRecoveryTrustBoundary(session),
      cwd: () => process.cwd(),
      now: () => new Date().toISOString(),
    };
  }

  /** Move the active leaf, preserving other branches; return the retained message count. */
  async revertTo(
    sessionId: string,
    entryId: string,
    summarize?: (abandoned: readonly SessionMessage[]) => Promise<string | undefined>,
    beforeWrite?: () => void,
    expectedVersion?: string,
  ): Promise<number> {
    return revertSession(this.host.store, sessionId, entryId, summarize, beforeWrite, expectedVersion);
  }

  createNewWithId(
    sessionId: string,
    projectRoot: string = process.cwd(),
    options?: ProjectBindingOptions,
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
    options?: ProjectBindingOptions,
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
  fork(sessionId: string, projectRoot?: string, options?: SessionForkOptions): Session {
    return forkSession({ store: this.host.store, callbacks: this.createSessionCreationCallbacks(), sourceId: sessionId, projectRoot, options });
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

  rebindSessionProjectRoot(sessionId: string, nextProjectRoot: string,
    options?: SessionRootRebindOptions,
  ): Session {
    const session = this.host.store.load(sessionId);
    const statePath = this.host.store.statePath(session.id);
    const rebound = rebindSessionProjectRootContinuity({
      ...options,
      session,
      nextProjectRoot,
      updatedAt: new Date().toISOString(),
      readSession: () => this.host.store.load(session.id),
      readMetadata: readSessionMetadataRecord.bind(undefined, this.host.store.metadataPath(session.id)),
      writeSessionMetadata: (nextSession) =>
        this.host.store.writeSessionMetadata(nextSession),
      withStateLock: (targetSessionId, update) =>
        this.host.store.withSessionStateLock(targetSessionId, update),
      readStateSnapshot: () => this.host.store.readStateSnapshotRequired(statePath),
      writeStateSnapshot: (snapshot) =>
        this.host.store.writeJsonFileAtomic(statePath, snapshot),
    });
    try {
      this.setCurrentSessionForProject(rebound.projectRoot, rebound.id);
    } catch (error) {
      throw new SessionRootRebindError("committed", "selection", error);
    }
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
