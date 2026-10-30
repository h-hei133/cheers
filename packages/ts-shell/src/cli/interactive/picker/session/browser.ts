import type { Option } from '../../../../presentation/tui/chrome/options.js';
import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';
import { normalizePathIdentity } from '../../../../session/continuation/roots.js';
import { CATALOG_LIMITS, type SessionSummary } from '../../../../session/store/catalog/model.js';
import type { SessionPickerOptions } from './contract.js';
import { SessionListing, type SessionListingBrowse, type SessionListingPage } from './listing.js';
import { pendingSessionPage, projectSessionPage, type SessionProjection } from './projection.js';
import { sessionDefaultSelection, sessionEmpty, sessionStatus } from './presentation.js';

/** Picker-local page authority and generations, never a second catalog index. */
export class SessionBrowser {
  expected: SessionSelectionContext;
  readonly listing: SessionListing;
  readonly limit: number;
  readonly allProjects: boolean;
  continuation: SessionPickerOptions['continuation'];
  lastQuery?: string;
  refreshOffered = false;
  lifetime = 0;
  private base?: SessionProjection;
  private searched?: SessionProjection;
  private activeSource: 'base' | 'search' = 'base';
  private searchPending = false;
  private searchComplete = false;
  private continuedBase: boolean;
  private loadGeneration = 0;
  private searchGeneration = 0;
  private opened = false;
  private publish?: (rows: readonly Option[]) => void;
  private subscriptionGeneration = 0;

  constructor(readonly options: SessionPickerOptions, browse?: SessionListingBrowse) {
    this.expected = { ...options.context() };
    this.listing = new SessionListing(options.sessionManager, browse);
    this.limit = Math.min(options.initialLimit ?? CATALOG_LIMITS.pageSize, CATALOG_LIMITS.pageSize);
    this.allProjects = options.allProjects === true;
    this.continuation = options.continuation;
    this.continuedBase = this.continuation?.needle === '';
    this.lastQuery = options.initialQuery?.trim() || undefined;
  }

  open(): void {
    if (this.opened) this.close();
    this.opened = true;
    this.lastQuery = this.options.initialQuery?.trim() || undefined;
    this.searched = undefined;
    this.activeSource = 'base';
    this.searchPending = false;
    this.searchComplete = false;
  }

  active(): SessionProjection | undefined { return this.activeSource === 'search' ? this.searched ?? this.base : this.base; }

  private accept(page: SessionListingPage, source: 'base' | 'search'): readonly Option[] {
    this.refreshOffered = false;
    const projection = projectSessionPage(page, this.expected.sessionId, source === 'search' ? this.lastQuery : undefined);
    if (source === 'search') { this.searched = projection; this.activeSource = 'search'; }
    else { this.base = projection; if (!this.lastQuery) this.activeSource = 'base'; }
    return projection.rows;
  }

  changeSearch(query: string): void {
    this.searchGeneration++;
    this.listing.cancelSearch();
    if (this.continuation?.needle !== query.trim().toLowerCase()) this.continuation = undefined;
    this.lastQuery = query.trim() || undefined;
    this.searched = undefined;
    this.searchPending = true;
    this.searchComplete = false;
  }

  clearSearch(): readonly Option[] | undefined {
    this.searchGeneration++;
    this.listing.cancelSearch();
    this.continuation = undefined;
    this.lastQuery = undefined;
    this.searched = undefined;
    this.activeSource = 'base';
    this.searchPending = false;
    this.searchComplete = false;
    if (this.continuedBase) {
      this.continuedBase = false;
      this.loadGeneration++;
      this.listing.cancelQueries();
      this.base = undefined;
      this.refreshOffered = true;
      return [{ id: 'action:refresh', label: 'Reload newest session page', detail: 'The previous page boundary was cleared.' }];
    }
    if (this.base) this.base = pendingSessionPage(this.base);
    void this.recheckClear();
    return this.base?.rows;
  }

  private async recheckClear(): Promise<void> {
    const generation = this.searchGeneration;
    try {
      const rows = await this.load(undefined, generation);
      if (generation !== this.searchGeneration || this.lastQuery) return;
      this.publish?.(rows);
      this.listing.subscribe(page => {
        if (generation !== this.searchGeneration || this.lastQuery || !sameSessionContext(this.expected, this.options.context())) return;
        this.publish?.(this.accept(page, 'base'));
      });
    } catch {
      if (generation !== this.searchGeneration || this.lastQuery || !this.base) return;
      this.base = { ...this.base, incomplete: true, status: 'Session listing stopped before completion. Reopen to retry.' };
      this.publish?.(this.base.rows);
    }
  }

  async load(signal?: AbortSignal, searchGeneration?: number): Promise<readonly Option[]> {
    signal?.throwIfAborted();
    const context = { ...this.options.context(), allProjects: this.allProjects };
    const generation = ++this.loadGeneration;
    const page = await this.listing.load(context, signal, this.limit, this.continuation?.needle === '' ? this.continuation : undefined);
    signal?.throwIfAborted();
    if (generation !== this.loadGeneration || searchGeneration !== undefined && searchGeneration !== this.searchGeneration
      || !sameSessionContext(context, this.options.context())) throw new Error('Session listing expired. Reopen the session picker.');
    this.expected = context;
    return this.accept(page, 'base');
  }

  async search(query: string, signal?: AbortSignal): Promise<readonly Option[]> {
    signal?.throwIfAborted();
    this.lastQuery = query.trim() || undefined;
    this.searched = undefined;
    this.searchPending = true;
    this.searchComplete = false;
    const context = { ...this.options.context(), allProjects: this.allProjects };
    const generation = ++this.searchGeneration;
    try {
      const page = await this.listing.search(context, query, signal, this.limit,
        this.continuation?.needle === query.trim().toLowerCase() ? this.continuation : undefined);
      signal?.throwIfAborted();
      if (generation !== this.searchGeneration || !sameSessionContext(context, this.options.context())) throw new Error('Session search expired. Reopen the session picker.');
      this.expected = context;
      this.searchPending = false;
      this.searchComplete = page.snapshot.status === 'complete';
      return this.accept(page, 'search');
    } catch (error) {
      if (generation === this.searchGeneration) { this.searchPending = false; this.searchComplete = false; }
      throw error;
    }
  }

  subscribe(publish: (rows: readonly Option[]) => void): () => void {
    this.publish = publish;
    const subscription = ++this.subscriptionGeneration;
    const generation = this.loadGeneration;
    const release = this.listing.subscribe(page => {
      if (generation !== this.loadGeneration || !sameSessionContext(this.expected, this.options.context())) return;
      const rows = this.accept(page, 'base');
      if (!this.lastQuery) publish(rows);
    });
    return () => {
      release();
      if (subscription === this.subscriptionGeneration) {
        this.loadGeneration++;
        this.searchGeneration++;
        this.publish = undefined;
        this.listing.cancelQueries();
      }
    };
  }

  clearPage(): void {
    this.loadGeneration++;
    this.searchGeneration++;
    this.base = undefined;
    this.searched = undefined;
    this.publish = undefined;
  }

  /** Mutation reload starts a new page query on the existing source and live filter. */
  forget(expected: SessionSummary): void {
    this.listing.forget(expected);
    this.clearPage();
    this.continuation = undefined;
    this.continuedBase = false;
    this.refreshOffered = false;
    this.searchPending = Boolean(this.lastQuery);
    this.searchComplete = false;
  }

  close(): void {
    this.lifetime++;
    this.clearPage();
    this.continuation = undefined;
    this.continuedBase = false;
    this.refreshOffered = false;
    this.publish = undefined;
    this.listing.close();
  }

  defaultSelection(rows: readonly Option[]): string | undefined { return sessionDefaultSelection(this.active(), rows); }

  get empty(): string { return sessionEmpty(this.active(), this.lastQuery, this.searchPending, this.searchComplete, this.continuation, this.allProjects); }

  status(visible: readonly Option[], query = ''): string | undefined {
    return sessionStatus(this.active(), visible, query, this.expected.sessionId, this.searchPending, this.searchComplete, this.allProjects);
  }

  get pagePending(): boolean { return this.searchPending; }
}

export function sameSessionContext(expected: SessionSelectionContext, current: SessionSelectionContext): boolean {
  return expected.sessionId === current.sessionId && normalizePathIdentity(expected.projectRoot) === normalizePathIdentity(current.projectRoot);
}
