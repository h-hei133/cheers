import type { SessionCatalogReadBudget } from './files.js';
import type { SessionCatalogBoundary, SessionCatalogContinuation } from './model.js';

export interface CatalogAttempt {
  readonly key: string;
  readonly boundary: SessionCatalogBoundary;
  readonly browseId?: string;
  readonly total: number;
  readonly entries: readonly SessionCatalogBoundary[];
  readonly unreadable: number;
  readonly limited: number;
  readonly indexTruncated: boolean;
  readonly readBudget: SessionCatalogReadBudget;
  claimed: boolean;
}

function attemptKey(value: SessionCatalogContinuation): string {
  return JSON.stringify([value.sessionId, value.projectRoot, value.allProjects, value.needle, value.limit, value.browseId ?? null]);
}

/** One cursor authority serves both ordinary listings and shared browse views. */
export class CatalogContinuations {
  private readonly attempts = new Map<string, CatalogAttempt>();

  claim(after: SessionCatalogContinuation): CatalogAttempt {
    const attempt = this.attempts.get(after.attemptId);
    if (!attempt || attempt.key !== attemptKey(after)
      || attempt.boundary.id !== after.boundary.id || attempt.boundary.version !== after.boundary.version
      || attempt.boundary.pinned !== after.boundary.pinned || attempt.boundary.updatedAt !== after.boundary.updatedAt) {
      throw new Error('Session page expired. Reopen the session picker.');
    }
    if (attempt.claimed) throw new Error('Session page is already being read. Reopen the session picker.');
    attempt.claimed = true;
    this.attempts.delete(after.attemptId);
    this.attempts.set(after.attemptId, attempt);
    return attempt;
  }

  remember(continuation: SessionCatalogContinuation, entries: readonly SessionCatalogBoundary[], total: number,
    unreadable: number, limited: number, indexTruncated: boolean, readBudget: SessionCatalogReadBudget): void {
    this.attempts.set(continuation.attemptId, { key: attemptKey(continuation), boundary: { ...continuation.boundary }, browseId: continuation.browseId,
      entries, total, unreadable, limited, indexTruncated, readBudget, claimed: false });
    while (this.attempts.size > 8) this.attempts.delete(this.attempts.keys().next().value!);
  }

  retire(browseId: string): void {
    for (const [id, attempt] of this.attempts) if (attempt.browseId === browseId) this.attempts.delete(id);
  }
}
