import type { SessionManager } from "../../../session/SessionManager.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { sessionSelectionBlock, type SessionSelectionContext } from '../../../session/navigation/selection.js';
import type { SessionFileSize } from '../../../session/store/files.js';
import type { SessionSummary } from '../../../session/store/catalog/model.js';
import { sessionSizeLabel } from '../../../session/presentation/size.js';
import { SessionListing, sessionListingStatus, type SessionListingPage } from './session/listing.js';
import { displayText, sessionPreview } from './session/preview.js';

/**
 * Session chooser for resuming.
 *
 * Each entry needs several rows — which session, how old, what it was about, how
 * it ended — so this is the one picker that earns the whole screen.
 */

export interface SessionPickerOptions {
  readonly sessionManager: SessionManager;
  readonly context: () => SessionSelectionContext;
  /** Resume the chosen session; the host owns how that is executed. */
  readonly resume: (sessionId: string) => Promise<string | undefined>;
  /** Delete a session permanently, with confirmation handled by the host. */
  readonly delete?: (sessionId: string, version?: string) => Promise<string | undefined>;
  /** Rename a session. */
  readonly rename?: (sessionId: string, title: string, version?: string) => Promise<string | undefined>;
  /** Toggle a session's pinned state. */
  readonly pin?: (sessionId: string, version?: string) => Promise<string | undefined>;
  /** How many recent sessions the first page holds; the list can ask for more. */
  readonly initialLimit?: number;
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
  readonly status?: string;
  readonly currentUnavailable?: string;
}

export function sessionPicker(options: SessionPickerOptions): Picker {
  let expected = { ...options.context() };
  let baseProjection: SessionProjection | undefined;
  let searchProjection: SessionProjection | undefined;
  let activeSource: 'base' | 'search' = 'base';
  let searchPending = false;
  let searchComplete = false;
  const listing = new SessionListing(options.sessionManager);
  let limit = options.initialLimit ?? 40;
  let lastQuery = options.initialQuery?.trim() || undefined;
  const accept = (page: SessionListingPage, source: 'base' | 'search'): readonly Option[] => {
    const total = page.total ?? page.snapshot.sessions.length;
    const rows = groupedOptions(page.snapshot.sessions, expected.sessionId, page.sizes);
    const query = source === 'search' ? lastQuery : undefined;
    const projectedRows = total > limit && limit < 10_000
      ? [...rows, {
        id: 'more',
        label: 'Load more sessions',
        detail: query ? `Showing ${page.snapshot.sessions.length} of ${total} matches` : `Showing the newest ${limit}; older sessions are still on disk`,
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
      ...(sessionListingStatus(page) ? { status: sessionListingStatus(page) } : {}),
      ...(page.snapshot.currentUnavailable ? { currentUnavailable: page.snapshot.currentUnavailable } : {}),
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
    if (!activeProjection()?.offered.has(id)) return 'This session was not offered. Reopen the session picker.';
    return sessionSelectionBlock({ expected, current: options.context(), target: options.sessionManager.getSession(id), targetId: id, action });
  };
  const allProjects = options.allProjects === true;
  return {
    title: "Resume session",
    form: "panel",
    fullScreen: true,
    chips: {
      items: [{ id: "project", label: "This project" }, { id: "all", label: "All projects" }],
      active: allProjects ? "all" : "project",
      select: id => sessionPicker({ ...options, allProjects: id === "all" }),
    },
    get empty() {
      const projection = activeProjection();
      if (lastQuery) return searchPending || !searchComplete
        ? 'Search results are incomplete; no match is confirmed absent.'
        : allProjects ? 'No sessions in authorized projects match this search.' : 'No sessions in this project match this search.';
      return projection?.incomplete !== false ? 'No selectable sessions in the loaded results.'
        : allProjects ? 'No recoverable sessions in authorized projects.' : 'No recoverable sessions for this project.';
    },
    loadError: 'Saved sessions could not be loaded.',
    searchError: 'Session search could not be completed. The loaded results are incomplete.',
    footer: 'Session files: logical size; excludes attachments.',
    get initialSelection() { return expected.sessionId; },
    get initialFilter() { return options.initialQuery?.trim() || undefined; },
    onSearchChange(query) {
      lastQuery = query.trim() || undefined;
      searchProjection = undefined;
      searchPending = true;
      searchComplete = false;
    },
    onSearchClear() {
      lastQuery = undefined;
      searchProjection = undefined;
      activeSource = 'base';
      searchPending = false;
      searchComplete = false;
      return baseProjection?.rows;
    },
    detail: id => {
      const projection = activeProjection();
      const summary = id ? projection?.summaries.get(id) : undefined;
      return summary ? sessionPreview(summary, projection?.sizes.get(summary.id), expected.sessionId) : [];
    },
    status: (visible, query = '') => {
      const projection = activeProjection();
      const noMatch = query.trim() && searchComplete && !searchPending && projection?.incomplete === false && visible.length === 0
        ? allProjects ? 'No sessions in authorized projects match this search.' : 'No sessions in this project match this search.'
        : undefined;
      return [projection?.currentUnavailable ?? (visible.some(option => option.id === expected.sessionId)
        ? undefined : 'Current session is hidden by the filter.'), noMatch, projection?.status].filter(Boolean).join(' ') || undefined;
    },
    async load(signal): Promise<readonly Option[]> {
      signal?.throwIfAborted();
      const context = { ...options.context(), ...(allProjects ? { allProjects: true } : {}) };
      const page = await listing.load(context, signal, limit);
      signal?.throwIfAborted();
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
      try {
        const page = await listing.search(context, query, signal, limit);
        signal?.throwIfAborted();
        expected = context;
        searchPending = false;
        searchComplete = page.snapshot.status === 'complete';
        return accept(page, 'search');
      } catch (error) {
        searchPending = false;
        searchComplete = false;
        throw error;
      }
    },
    subscribe: publish => listing.subscribe(page => {
      const rows = accept(page, 'base');
      if (!lastQuery) publish(rows);
    }),
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const sessionId = ids[0];
      if (!sessionId) return undefined;
      if (sessionId === 'more') return {
        next: sessionPicker({
          ...options,
          initialLimit: Math.min(10_000, limit + 40),
          ...(lastQuery ? { initialQuery: lastQuery } : {}),
        }),
      };
      const block = blocked(sessionId, 'resume');
      if (block) return { note: block };
      const note = await options.resume(sessionId);
      return note ? { note } : undefined;
    },
    onDelete: options.delete
      ? async (sessionId: string) => blocked(sessionId, 'delete') ?? options.delete!(sessionId, activeProjection()?.versions.get(sessionId))
      : undefined,
    onRename: options.rename
      ? async (sessionId: string, title: string) => blocked(sessionId, 'rename') ?? options.rename!(sessionId, title, activeProjection()?.versions.get(sessionId))
      : undefined,
    onPin: options.pin
      ? async (sessionId: string) => blocked(sessionId, 'pin') ?? options.pin!(sessionId, activeProjection()?.versions.get(sessionId))
      : undefined,
  };
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
