import type { Option } from '../../../../presentation/tui/chrome/options.js';
import type { SessionFileSize } from '../../../../session/store/files.js';
import type { SessionCatalogContinuation, SessionSummary } from '../../../../session/store/catalog/model.js';
import { sessionSizeLabel } from '../../../../session/presentation/size.js';
import { displayText } from './preview.js';
import { sessionListingStatus, type SessionListingPage } from './listing.js';

export interface SessionProjection {
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

/** Cached presentation may remain visible while its action identity is rechecked. */
export function pendingSessionPage(page: SessionProjection): SessionProjection {
  return { ...page, rows: page.rows.map(row => ({ ...row, disabled: true })),
    offered: new Set(), versions: new Map(), incomplete: true, continuation: undefined,
    status: 'Checking saved sessions; results are incomplete.' };
}


export function projectSessionPage(page: SessionListingPage, currentId: string, query?: string): SessionProjection {
  const rows = groupedOptions(page.snapshot.sessions, currentId, page.sizes);
  const total = page.total ?? page.snapshot.sessions.length;
  const status = sessionListingStatus(page);
  return {
    rows: page.snapshot.continuation ? [...rows, { id: 'action:more', label: 'Next session page',
      detail: query ? `${total} matches checked; browse the next indexed page` : 'Browse older sessions from this indexed attempt',
      note: 'more', ...(query ? { searchText: query } : {}) }] : rows,
    offered: new Set(page.snapshot.sessions.map(session => session.id)),
    versions: new Map(page.snapshot.sessions.map(session => [session.id, session.version])),
    summaries: new Map(page.snapshot.sessions.map(session => [session.id, session])),
    sizes: page.sizes,
    incomplete: page.stopped === true || page.snapshot.status !== 'complete',
    total: page.total,
    ...(status ? { status } : {}),
    ...(page.snapshot.currentUnavailable ? { currentUnavailable: page.snapshot.currentUnavailable } : {}),
    ...(page.snapshot.continuation ? { continuation: page.snapshot.continuation } : {}),
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
