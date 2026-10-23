import { normalizePathIdentity } from '../../continuation/roots.js';
import { compareSessionChoices, sessionChoices, sessionSelectable, type SessionSelectionContext } from '../../navigation/selection.js';
import { CATALOG_LIMITS, type SessionCatalogContinuation, type SessionCatalogQuery, type SessionSummary } from './model.js';

/** Filter before retaining a page, including when a match is older than the recent catalogue. */
export class SessionCatalogPage {
  private recent: SessionSummary[] = [];
  private current?: SessionSummary;
  private total = 0;
  readonly needle: string;

  constructor(private readonly context: SessionSelectionContext, private readonly limit: number,
    readonly query: SessionCatalogQuery) {
    this.needle = query.needle.trim().toLowerCase();
    if (limit > CATALOG_LIMITS.pageSize) throw new RangeError('Invalid session query page size.');
    const after = query.after;
    if (after && (after.sessionId !== context.sessionId || after.projectRoot !== normalizePathIdentity(context.projectRoot)
      || after.allProjects !== (context.allProjects === true) || after.needle !== this.needle || after.limit !== limit)) {
      throw new Error('Session page no longer matches this search or project. Reopen the session picker.');
    }
  }

  accept(summary: SessionSummary): void {
    if (summary.id === this.context.sessionId) this.current = summary;
    if (!sessionSelectable(summary, this.context) || !sessionMatches(summary, this.needle)) return;
    this.total++;
    if (this.query.after && compareSessionChoices(summary, this.query.after.boundary) <= 0) return;
    const last = this.recent.at(-1);
    if (this.recent.length === this.limit + 1 && last && compareSessionChoices(summary, last) >= 0) return;
    let low = 0;
    let high = this.recent.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareSessionChoices(summary, this.recent[middle]!) > 0) low = middle + 1;
      else high = middle;
    }
    this.recent.splice(low, 0, summary);
    if (this.recent.length > this.limit + 1) this.recent.pop();
  }

  snapshot(final: boolean): { sessions: readonly SessionSummary[]; currentUnavailable?: string;
    total: number; hasMore: boolean; continuation?: SessionCatalogContinuation } {
    const sessions = this.recent.slice(0, this.limit);
    const last = sessions.at(-1);
    const hasMore = this.recent.length > this.limit;
    const current = this.current;
    if (current && sessionSelectable(current, this.context) && sessionMatches(current, this.needle)
      && !sessions.some(summary => summary.id === current.id)) sessions.push(current);
    const currentUnavailable = sessionChoices(current ? [current] : [], this.context, 1).currentUnavailable;
    return {
      sessions, total: this.total, hasMore,
      ...(currentUnavailable ? { currentUnavailable } : {}),
      ...(final && hasMore && last ? { continuation: {
        sessionId: this.context.sessionId, projectRoot: normalizePathIdentity(this.context.projectRoot) ?? '',
        allProjects: this.context.allProjects === true, needle: this.needle, limit: this.limit,
        boundary: { id: last.id, version: last.version, pinned: last.pinned, updatedAt: last.updatedAt },
      } } : {}),
    };
  }

  assertBoundary(summary: SessionSummary | undefined): void {
    const boundary = this.query.after?.boundary;
    if (boundary && (!summary || summary.id !== boundary.id || summary.version !== boundary.version
      || compareSessionChoices(summary, boundary) !== 0 || !sessionSelectable(summary, this.context)
      || !sessionMatches(summary, this.needle))) {
      throw new Error('Session page changed while browsing. Reopen the session picker to refresh.');
    }
  }
}

export function sessionMatches(session: SessionSummary, needle: string): boolean {
  return !needle || [session.id, session.title ?? '', session.projectRoot, session.status ?? '', session.reentry,
    session.quality, session.preview?.prompt ?? '', session.preview?.answer ?? '']
    .some(value => value.toLowerCase().includes(needle));
}
