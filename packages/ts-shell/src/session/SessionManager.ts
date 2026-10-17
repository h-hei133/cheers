/**
 * SessionManager - directory-based session substrate
 *
 * Layout per session:
 * - metadata.json   -> identity + timestamps
 * - transcript.jsonl -> append-only events/messages
 * - state.json      -> mutable runtime state snapshot
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CurrentSessionSelectionResolution } from "./store/currentSelection.js";
import { SESSION_APPROVAL_AUDIT_HISTORY_LIMIT } from "./approval/sessionApprovalMemory.js";
import { type TranscriptEvent } from "./sessionEventCodec.js";
import { forkSession, type SessionForkOptions } from './branch/create.js';
import { revertSession } from './navigation/revert.js';
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
import { readSessionMetadataRecord } from "./store/sessionStore.js";
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
import { type WorkspaceRootMode, type ProjectBindingOptions } from "./store/projectBindingPolicy.js";
import { applySessionWorkspaceBinding } from "./store/sessionProjectBinding.js";
import { SessionReadSurface } from "./sessionReadSurface.js";
import { rebindSessionProjectRootContinuity, SessionRootRebindError, type SessionRootRebindOptions } from "./continuation/sessionProjectRootRebind.js";
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
  ): Promise<number> {
    return revertSession(this.host.store, sessionId, entryId, summarize, beforeWrite);
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
    const index = this.loadReentryIndex();
    let changed = false;
    const summaries = sessions.map((session) => {
      const stamp = this.reentryStamp(session.id);
      const cached = stamp === undefined ? undefined : index.get(session.id);
      if (cached && cached.stamp === stamp) return cached.summary;
      const summary = this.describeSessionReentry(session.id);
      if (stamp !== undefined) { index.set(session.id, { stamp, summary }); changed = true; }
      return summary;
    });
    const keep = new Set(sessions.map(session => session.id));
    const stale = [...index.keys()].some(id => !keep.has(id));
    if (changed || stale) this.flushReentryIndex(index, keep);
    return projectSortedSessionReentrySummaries({
      summaries,
      preferredProjectRoot: input?.preferredProjectRoot,
      limit: input?.limit,
    });
  }

  /**
   * Summary cache for re-entry listing.
   *
   * Reading every session's metadata, state and transcript is the expensive part
   * of a listing; a persisted index keyed by the three files' size and mtime
   * avoids it when nothing changed. A missing, corrupt or stale index only costs
   * a recomputation, never a wrong summary.
   */
  private reentryIndexCache?: Map<string, { readonly stamp: string; readonly summary: SessionReentrySummary }>;
  private reentryStamp(sessionId: string): string | undefined {
    try {
      return [this.host.store.metadataPath(sessionId), this.host.store.statePath(sessionId), this.host.store.transcriptPath(sessionId)]
        .map(file => { const stat = fs.statSync(file); return `${stat.mtimeMs}:${stat.size}`; }).join('|');
    } catch { return undefined; }
  }
  private reentryIndexFile(): string { return path.join(this.host.store.sessionsDir, '.reentry-index.json'); }
  private loadReentryIndex(): Map<string, { readonly stamp: string; readonly summary: SessionReentrySummary }> {
    if (this.reentryIndexCache) return this.reentryIndexCache;
    const index = new Map<string, { readonly stamp: string; readonly summary: SessionReentrySummary }>();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.reentryIndexFile(), 'utf8')) as { version?: unknown;
        entries?: Record<string, { stamp?: unknown; summary?: unknown }> };
      if (parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        for (const [id, entry] of Object.entries(parsed.entries)) {
          if (typeof entry?.stamp === 'string' && entry.summary && typeof entry.summary === 'object')
            index.set(id, { stamp: entry.stamp, summary: entry.summary as SessionReentrySummary });
        }
      }
    } catch { /* A missing or damaged index is a cache miss. */ }
    this.reentryIndexCache = index;
    return index;
  }
  private flushReentryIndex(index: Map<string, { readonly stamp: string; readonly summary: SessionReentrySummary }>,
    keep: ReadonlySet<string>): void {
    const file = this.reentryIndexFile();
    try {
      // A deleted session must not leave its summary behind forever.
      for (const id of [...index.keys()]) if (!keep.has(id)) index.delete(id);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, entries: Object.fromEntries(index) }), 'utf8');
      fs.renameSync(temporary, file);
    } catch { /* The listing already succeeded; a cache that cannot persist is not an error. */ }
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
    const withContent = summaries.find((summary) => summary.hasConversation === true || summary.hasReportHistory === true);
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
