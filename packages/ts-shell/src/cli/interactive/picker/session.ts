import type { SessionManager } from "../../../session/SessionManager.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { sessionSelectionBlock, type SessionSelectionContext } from '../../../session/navigation/selection.js';
import type { SessionFileSize } from '../../../session/store/files.js';
import { CATALOG_LIMITS, type SessionCatalogContinuation, type SessionSummary } from '../../../session/store/catalog/model.js';
import { sessionSizeLabel } from '../../../session/presentation/size.js';
import { SessionListing, sessionListingStatus, type SessionListingPage } from './session/listing.js';
import { displayText, sessionPreview } from './session/preview.js';
import { normalizePathIdentity } from '../../../session/continuation/roots.js';

/**
 * Session chooser for resuming.
 *
 * Each entry needs several rows — which session, how old, what it was about, how
 * it ended — so this is the one picker that earns the whole screen.
 */

export interface SessionPickerOptions {
  /** Enter resumes a session or toggles its existing pinned metadata. */
  readonly action?: 'resume' | 'pin';
  readonly sessionManager: SessionManager;
  readonly context: () => SessionSelectionContext;
  readonly admission?: () => string | undefined;
  /** Resume the chosen session; the host owns how that is executed. */
  readonly resume: (sessionId: string, version?: string) => Promise<string | undefined>;
  /** Delete a session permanently, with confirmation handled by the host. */
  readonly delete?: (sessionId: string, version?: string) => Promise<string | undefined>;
  /** Rename a session. */
  readonly rename?: (sessionId: string, title: string, version?: string) => Promise<string | undefined>;
  /** Toggle a session's pinned state. */
  readonly pin?: (sessionId: string, version?: string) => Promise<string | undefined>;
  /** Page size, bounded by the catalogue's forty-row presentation budget. */
  readonly initialLimit?: number;
  readonly continuation?: SessionCatalogContinuation;
  /** Search every authorized project; actions still enforce the current scope. */
  readonly allProjects?: boolean;
  /** Resume the picker with a previously entered catalogue query. */
  readonly initialQuery?: string;
}

interface SessionProjection {
  readonly rows: readonly Option[];
  readonly offered: ReadonlySet<string>;
  readonly versions: ReadonlyMap<string, string>;
  readonly summaries: ReadonlyMap<string, SessionSummary>;
  readonly sizes: ReadonlyMap<string, SessionFileSize>;
  readonly incomplete: boolean;
  readonly total?: number;
  readonly status?: string;
  readonly currentUnavailable?: string;
  readonly continuation?: SessionCatalogContinuation;
}

export function sessionPicker(options: SessionPickerOptions): Picker {
  let expected = { ...options.context() };
  let baseProjection: SessionProjection | undefined;
  let searchProjection: SessionProjection | undefined;
  let activeSource: 'base' | 'search' = 'base';
  let searchPending = false;
  let searchComplete = false;
  const listing = new SessionListing(options.sessionManager);
  const limit = Math.min(options.initialLimit ?? CATALOG_LIMITS.pageSize, CATALOG_LIMITS.pageSize);
  let continuation = options.continuation;
  let continuedBase = continuation?.needle === '';
  let loadGeneration = 0;
  let searchGeneration = 0;
  let refreshOffered = false;
  let lastQuery = options.initialQuery?.trim() || undefined;
  const accept = (page: SessionListingPage, source: 'base' | 'search'): readonly Option[] => {
    refreshOffered = false;
    const total = page.total ?? page.snapshot.sessions.length;
    const rows = groupedOptions(page.snapshot.sessions, expected.sessionId, page.sizes);
    const query = source === 'search' ? lastQuery : undefined;
    const projectedRows = page.snapshot.continuation
      ? [...rows, {
        id: 'action:more',
        label: 'Next session page',
        detail: query ? `${total} matches checked; browse the next page` : 'Browse older sessions with a new live scan',
        note: 'more',
        ...(query ? { searchText: query } : {}),
      }]
      : rows;
    const projection: SessionProjection = {
      rows: projectedRows,
      offered: new Set(page.snapshot.sessions.map(session => session.id)),
      versions: new Map(page.snapshot.sessions.map(session => [session.id, session.version])),
      summaries: new Map(page.snapshot.sessions.map(session => [session.id, session])),
      sizes: page.sizes,
      incomplete: page.stopped === true || page.snapshot.status !== 'complete',
      total: page.total,
      ...(sessionListingStatus(page) ? { status: sessionListingStatus(page) } : {}),
      ...(page.snapshot.currentUnavailable ? { currentUnavailable: page.snapshot.currentUnavailable } : {}),
      ...(page.snapshot.continuation ? { continuation: page.snapshot.continuation } : {}),
    };
    if (source === 'search') {
      searchProjection = projection;
      activeSource = 'search';
    } else {
      baseProjection = projection;
      if (!lastQuery) activeSource = 'base';
    }
    return projectedRows;
  };
  const activeProjection = (): SessionProjection | undefined =>
    activeSource === 'search' ? searchProjection ?? baseProjection : baseProjection;
  const blocked = (id: string, action: 'resume' | 'rename' | 'delete' | 'pin'): string | undefined => {
    try {
      const issue = options.admission?.();
      if (issue) return issue;
    } catch { return 'Session selection is unavailable. Reopen the session picker.'; }
    if (!activeProjection()?.offered.has(id)) return 'This session was not offered. Reopen the session picker.';
    return sessionSelectionBlock({ expected, current: options.context(), target: options.sessionManager.getSession(id), targetId: id, action });
  };
  const allProjects = options.allProjects === true;
  return {
    title: options.action === 'pin' ? 'Pin saved session' : 'Resume session',
    form: "panel",
    fullScreen: true,
    chips: {
      items: [{ id: "project", label: "This project" }, { id: "all", label: "All projects" }],
      active: allProjects ? "all" : "project",
      select: id => sessionPicker({ ...options, continuation: undefined, allProjects: id === "all" }),
    },
    get empty() {
      const projection = activeProjection();
      if (lastQuery) return searchPending || !searchComplete
        ? 'Search results are incomplete; no match is confirmed absent.'
        : projection?.total ? 'No more matching sessions after this page boundary. Reopen to refresh earlier results.'
        : allProjects ? 'No sessions in authorized projects match this search.' : 'No sessions in this project match this search.';
      if (continuation && projection?.incomplete === false) return 'No more sessions after this page boundary. Reopen to refresh earlier results.';
      return projection?.incomplete !== false ? 'No selectable sessions in the loaded results.'
        : allProjects ? 'No recoverable sessions in authorized projects.' : 'No recoverable sessions for this project.';
    },
    loadError: 'Saved sessions could not be loaded.',
    searchError: 'Session search could not be completed. The loaded results are incomplete.',
    footer: [options.action === 'pin' ? 'Enter: toggle pin.' : undefined,
      'Session files: logical size; excludes attachments.',
      'Pages rescan saved sessions; reopen to include changes to earlier pages.'].filter(Boolean).join(' '),
    get initialSelection() { return expected.sessionId; },
    get initialFilter() { return options.initialQuery?.trim() || undefined; },
    onSearchChange(query) {
      searchGeneration++;
      if (continuation?.needle !== query.trim().toLowerCase()) continuation = undefined;
      lastQuery = query.trim() || undefined;
      searchProjection = undefined;
      searchPending = true;
      searchComplete = false;
    },
    onSearchClear() {
      searchGeneration++;
      continuation = undefined;
      lastQuery = undefined;
      searchProjection = undefined;
      activeSource = 'base';
      searchPending = false;
      searchComplete = false;
      if (continuedBase) {
        continuedBase = false;
        loadGeneration++;
        listing.close();
        baseProjection = undefined;
        refreshOffered = true;
        return [{ id: 'action:refresh', label: 'Reload newest session page', detail: 'The previous page boundary was cleared.' }];
      }
      return baseProjection?.rows;
    },
    detail: id => {
      const projection = activeProjection();
      const summary = id ? projection?.summaries.get(id) : undefined;
      return summary ? sessionPreview(summary, projection?.sizes.get(summary.id), expected.sessionId) : [];
    },
    status: (visible, query = '') => {
      const projection = activeProjection();
      const noMatch = query.trim() && searchComplete && !searchPending && projection?.incomplete === false
        && projection.total === 0 && visible.length === 0
        ? allProjects ? 'No sessions in authorized projects match this search.' : 'No sessions in this project match this search.'
        : undefined;
      return [projection?.currentUnavailable ?? (visible.some(option => option.id === expected.sessionId)
        ? undefined : 'Current session is hidden by the filter.'), noMatch, projection?.status].filter(Boolean).join(' ') || undefined;
    },
    async load(signal): Promise<readonly Option[]> {
      signal?.throwIfAborted();
      const context = { ...options.context(), ...(allProjects ? { allProjects: true } : {}) };
      const generation = ++loadGeneration;
      const page = await listing.load(context, signal, limit, continuation?.needle === '' ? continuation : undefined);
      signal?.throwIfAborted();
      if (generation !== loadGeneration || !sameContext(context, options.context())) throw new Error('Session listing expired. Reopen the session picker.');
      expected = context;
      return accept(page, 'base');
    },
    async search(query, signal): Promise<readonly Option[]> {
      signal?.throwIfAborted();
      lastQuery = query.trim() || undefined;
      searchProjection = undefined;
      searchPending = true;
      searchComplete = false;
      const context = { ...options.context(), ...(allProjects ? { allProjects: true } : {}) };
      const generation = ++searchGeneration;
      try {
        const page = await listing.search(context, query, signal, limit,
          continuation?.needle === query.trim().toLowerCase() ? continuation : undefined);
        signal?.throwIfAborted();
        if (generation !== searchGeneration || !sameContext(context, options.context())) throw new Error('Session search expired. Reopen the session picker.');
        expected = context;
        searchPending = false;
        searchComplete = page.snapshot.status === 'complete';
        return accept(page, 'search');
      } catch (error) {
        if (generation === searchGeneration) { searchPending = false; searchComplete = false; }
        throw error;
      }
    },
    subscribe: publish => {
      const generation = loadGeneration;
      return listing.subscribe(page => {
        if (generation !== loadGeneration || !sameContext(expected, options.context())) return;
        const rows = accept(page, 'base');
        if (!lastQuery) publish(rows);
      });
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (ids.length !== 1) return undefined;
      const sessionId = ids[0];
      if (!sessionId) return undefined;
      if (sessionId === 'action:refresh') {
        if (!refreshOffered) return { note: 'This refresh action was not offered. Reopen the session picker.' };
        refreshOffered = false;
        return { next: sessionPicker({ ...options, continuation: undefined, initialQuery: undefined }) };
      }
      if (sessionId === 'action:more') {
        const projection = activeProjection();
        const next = projection?.continuation;
        if (!next || searchPending || !projection.rows.some(row => row.id === 'action:more')) return { note: 'This page was not offered. Reopen the session picker.' };
        const current = options.context();
        let unavailable = false;
        try { unavailable = !!options.admission?.(); } catch { unavailable = true; }
        if (unavailable || current.busy || !sameContext(expected, current)) {
          return { note: 'Session page expired. Reopen the session picker.' };
        }
        listing.close();
        baseProjection = undefined;
        searchProjection = undefined;
        return { next: sessionPicker({ ...options, initialLimit: limit, continuation: next,
          ...(lastQuery ? { initialQuery: lastQuery } : {}) }) };
      }
      const action = options.action ?? 'resume';
      const block = blocked(sessionId, action);
      if (block) return { note: block };
      const version = activeProjection()?.versions.get(sessionId);
      listing.close();
      baseProjection = undefined;
      searchProjection = undefined;
      if (action === 'pin') {
        if (!options.pin) return { note: 'Session pinning is unavailable.' };
        const note = await options.pin(sessionId, version);
        return note ? { note } : { next: sessionPicker({ ...options, continuation: undefined, initialQuery: lastQuery }) };
      }
      const note = await options.resume(sessionId, version);
      return note ? { note } : undefined;
    },
    onDelete: options.delete
      ? async (sessionId: string) => blocked(sessionId, 'delete') ?? options.delete!(sessionId, activeProjection()?.versions.get(sessionId))
      : undefined,
    onRename: options.rename
      ? async (sessionId: string, title: string) => blocked(sessionId, 'rename') ?? options.rename!(sessionId, title, activeProjection()?.versions.get(sessionId))
      : undefined,
    onPin: options.pin
      ? async (sessionId: string) => {
        const note = blocked(sessionId, 'pin') ?? await options.pin!(sessionId, activeProjection()?.versions.get(sessionId));
        if (!note) { continuation = undefined; continuedBase = false; baseProjection = undefined; searchProjection = undefined; }
        return note;
      }
      : undefined,
    previewEnd() {
      loadGeneration++;
      searchGeneration++;
      continuation = undefined;
      continuedBase = false;
      refreshOffered = false;
      listing.close();
      baseProjection = undefined;
      searchProjection = undefined;
    },
  };
}

function sameContext(expected: SessionSelectionContext, current: SessionSelectionContext): boolean {
  return expected.sessionId === current.sessionId && normalizePathIdentity(expected.projectRoot) === normalizePathIdentity(current.projectRoot);
}

const DAY = 86_400_000;

/** Which time bucket a session belongs to, in the order the chooser shows them. */
function sessionBucket(at: number, now: number): string {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  if (at >= today) return 'Today';
  if (at >= today - DAY) return 'Yesterday';
  if (at >= today - 7 * DAY) return 'Previous 7 days';
  if (at >= today - 30 * DAY) return 'Previous 30 days';
  return 'Older';
}

/**
 * Sessions with non-selectable group rows.
 *
 * Pinned sessions come first as their own group because the ordering already
 * puts them there; the rest are bucketed by the day they were last used. Group
 * rows are disabled, so the cursor and the pointer skip them.
 */
export function groupedOptions(sessions: readonly SessionSummary[], currentId: string, sizes: ReadonlyMap<string, SessionFileSize>): readonly Option[] {
  const rows: Option[] = [];
  const now = Date.now();
  let bucket: string | undefined;
  let pinned: boolean | undefined;
  for (const session of sessions) {
    const isPinned = session.pinned === true;
    if (pinned === undefined || pinned !== isPinned) {
      pinned = isPinned;
      bucket = undefined;
      rows.push({ id: `group:pinned:${isPinned}`, label: isPinned ? 'Pinned' : 'Sessions', detail: 'group', disabled: true });
    }
    const stamp = session.updatedAt ?? session.createdAt;
    const at = typeof stamp === 'string' ? Date.parse(stamp) : stamp;
    const name = at === undefined || Number.isNaN(at) ? 'Older' : sessionBucket(at, now);
    // Pinned rows already have their own header; a time header under it would
    // say nothing a reader needs.
    if (!isPinned && name !== bucket) {
      bucket = name;
      rows.push({ id: `group:${isPinned}:${name}`, label: name, detail: 'group', disabled: true });
    }
    rows.push(sessionOption(session, currentId, sizes.get(session.id)));
  }
  return rows;
}

/** Recent sessions as options, newest first. */
function sessionOption(session: SessionSummary, currentId: string, size: SessionFileSize | undefined): Option {
  return {
    id: session.id,
    label: displayText(session.title?.trim() || 'New session'),
    detail: [describe(session, size), session.quality === 'limited' ? 'preview limited' : undefined].filter(Boolean).join(' · '),
    note: [session.id === currentId ? 'current' : undefined, session.pinned ? 'pinned' : undefined, age(session)].filter(Boolean).join(' · '),
    searchText: [
      session.id,
      session.projectRoot,
      session.status ?? '',
      session.reentry,
      session.quality,
      session.preview?.prompt ?? '',
      session.preview?.answer ?? '',
    ].join(' '),
  };
}

interface SessionLike {
  readonly id: string;
  readonly title?: string;
  readonly status?: string;
  readonly turns?: readonly unknown[];
  readonly updatedAt?: number | string;
  readonly createdAt?: number | string;
}

/** Subject and outcome, the two facts that identify a session to a human. */
function describe(session: SessionLike, size: SessionFileSize | undefined): string {
  const parts: string[] = [];
  if (session.status) parts.push(session.status);
  parts.push(sessionSizeLabel(size));
  parts.push(session.id.slice(0, 8));
  return parts.join(" · ") || "no recorded activity";
}

/** Relative age, which is what a user actually recognises a session by. */
function age(session: SessionLike): string | undefined {
  const stamp = session.updatedAt ?? session.createdAt;
  const at = typeof stamp === "string" ? Date.parse(stamp) : stamp;
  if (at === undefined || Number.isNaN(at)) return undefined;
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
