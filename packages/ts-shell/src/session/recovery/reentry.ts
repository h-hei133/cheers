import fs from 'node:fs';
import path from 'node:path';
import { SessionReadSurface } from '../sessionReadSurface.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionSummary } from '../store/catalog/model.js';
import { projectRecentProjectContexts, type ProjectContextSummary } from './projectContextSummary.js';
import {
  projectSortedSessionReentrySummaries,
  selectRecoveryTrustBoundaryBlock,
  selectSuggestedRecoverySessionIdFromSessions,
} from './sessionRecoverySelection.js';
import { projectSessionReentrySummary, type SessionReentrySummary } from '../presentation/sessionReentrySurface.js';
import type { RecoveryTrustBoundaryBlock } from './recoveryTrustBoundary.js';
import type { SessionResumeEligibility } from './sessionResumeEligibility.js';
import {
  buildRecoverySnapshotForSession,
  evaluateRecoveryTrustBoundaryForSession,
  projectRecoveryTrustBoundaryBlockForSession,
} from './sessionRecoveryRuntime.js';
import { selectAsyncReentryHint, type AsyncReentryHint } from './asyncReentryHint.js';
import { decodeReentrySummary } from './reentry/codec.js';

/** Stored-session discovery and recovery questions share one read surface. */
export abstract class SessionReentrySurface extends SessionReadSurface {
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
          const summary = decodeReentrySummary(entry?.summary, id);
          if (typeof entry?.stamp === 'string' && summary)
            index.set(id, { stamp: entry.stamp, summary });
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

  /**
   * Bounded, cancellable re-entry discovery for startup hints.
   *
   * The catalog yields its current identity before directory discovery and
   * then publishes pages. This method never treats an incomplete scan as an
   * authoritative absence; callers use the result only as a suggestion.
   */
  async getReentryCandidateAsync(input: {
    readonly preferredProjectRoot: string;
    readonly currentSessionId?: string;
    readonly signal?: AbortSignal;
  }): Promise<Session | null> {
    return (await this.getRecoveryHintAsync(input))?.candidate ?? null;
  }

  /**
   * Discover the post-first-frame recovery suggestion and its blocked result.
   *
   * The catalog owns directory traversal and diagnostics. Selection is a
   * separate projection so a blocked session can never be mistaken for a
   * usable candidate merely because it appeared first in a page.
   */
  async getRecoveryHintAsync(input: {
    readonly preferredProjectRoot: string;
    readonly currentSessionId?: string;
    readonly signal?: AbortSignal;
  }): Promise<AsyncReentryHint | null> {
    const signal = input.signal;
    signal?.throwIfAborted();
    const context = {
      sessionId: input.currentSessionId ?? "",
      projectRoot: input.preferredProjectRoot,
      busy: false,
      allProjects: true,
    };
    const summaries = new Map<string, SessionSummary>();
    for await (const page of this.catalog.list(
      context,
      signal,
      10_000,
      undefined,
      (diagnostic) => this.host.store.reportCatalogUnreadable(diagnostic),
    )) {
      signal?.throwIfAborted();
      for (const summary of page.sessions) {
        if (summary.id === input.currentSessionId) continue;
        summaries.set(summary.id, summary);
      }
    }
    signal?.throwIfAborted();
    return selectAsyncReentryHint({
      summaries: [...summaries.values()],
      preferredProjectRoot: input.preferredProjectRoot,
      signal,
      loadSession: (sessionId) => this.getSession(sessionId),
      describe: (sessionId) => this.describeSessionReentry(sessionId),
      evaluate: (session) => this.evaluateRecoveryTrustBoundary(session),
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
    return sessionId ? this.host.store.load(sessionId) : null;
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

  protected evaluateRecoveryTrustBoundary(
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

}
