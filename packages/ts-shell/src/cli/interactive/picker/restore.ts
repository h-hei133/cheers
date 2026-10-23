import {
  listRecoveryAuthorityRecords,
  type RecoveryAuthorityRecordIndexEntry,
} from "../../../edit/recovery/recoveryAuthorityIndex.js";
import { readRecoveryCatalogPage, type RecoveryCatalogPage, type RecoveryCatalogCursor } from '../../../edit/recovery/catalog.js';
import { snapshotRoot } from "../../../edit/recovery/root.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { quoteCompletion } from '../completion.js';
import { restoreSelection, type RestorePickerAccess } from './restore/state.js';

/**
 * Snapshot chooser for restoring an edit.
 *
 * The ledger holds one record per file an edit touched, and restoring the wrong
 * one silently reverts work — so the choice is made against the recorded paths
 * and times rather than against ids the user has to copy out of a wall of text.
 *
 * Choosing returns a preview draft bound to the selected project and records.
 * The existing restore command owns inspection and explicit execution approval.
 */

interface LedgerRecord extends RecoveryAuthorityRecordIndexEntry {
  readonly ledgerRoot: string;
}

const MORE_ID = ':more';

export function restorePicker(workspaceRoot: string, continuation?: { after: RecoveryCatalogCursor; query?: string }, access: RestorePickerAccess = {}): Picker {
  return snapshotPicker(workspaceRoot, continuation, restoreSelection(access, workspaceRoot));
}

function snapshotPicker(workspaceRoot: string, continuation: { after: RecoveryCatalogCursor; query?: string } | undefined,
  selection: ReturnType<typeof restoreSelection>): Picker {
  let offered: LedgerRecord[] = [];
  let page: RecoveryCatalogPage | undefined;
  let base: RecoveryCatalogPage | undefined;
  let query: string | undefined;
  let generation = 0;
  let pending = false;
  let searchQuery = '';
  let closed = false;
  const controller = new AbortController();
  const release = (): void => {
    closed = true; controller.abort(); generation++; offered = []; page = undefined; base = undefined;
    query = undefined; pending = false; searchQuery = '';
  };
  let ledgerRoot: string | undefined;
  const readPage = async (filter?: string, after?: RecoveryCatalogCursor, signal?: AbortSignal): Promise<RecoveryCatalogPage> => {
    if (closed) throw new Error('Snapshot picker is closed.');
    selection.check(); signal?.throwIfAborted();
    ledgerRoot ??= snapshotRoot(workspaceRoot);
    const read = new AbortController();
    const signals = [signal, controller.signal, selection.signal].filter((value): value is AbortSignal => value !== undefined);
    const abort = (): void => read.abort(signals.find(value => value.aborted)?.reason);
    for (const source of signals) source.addEventListener('abort', abort, { once: true });
    try {
      const listing = await readRecoveryCatalogPage({ ledgerRoot, query: filter, after, signal: read.signal, readAccess: selection });
      if (closed) throw new Error('Snapshot picker is closed.');
      selection.check(); signal?.throwIfAborted();
      return listing;
    } finally { for (const source of signals) source.removeEventListener('abort', abort); }
  };
  const accept = (value: RecoveryCatalogPage, filter?: string): readonly Option[] => {
    const root = ledgerRoot;
    if (!root) throw new Error('Snapshot catalogue is unavailable. Reopen /restore.');
    page = value;
    query = filter;
    offered = value.records.map(record => ({ ...record, ledgerRoot: root }));
    return catalogueRows(value, filter);
  };
  return {
    isCurrent: selection.isCurrent,
    title: "Restore a snapshot",
    holdInput: true,
    form: "panel",
    empty: 'No edit snapshots to show.',
    initialFilter: continuation?.query,
    loadError: 'Edit snapshots could not be read or changed between pages. Reopen /restore before retrying.',
    searchError: 'Snapshot search could not be completed. Reopen /restore before retrying.',
    status(visible) {
      const empty = page?.matches === 0 && !pending
        ? searchQuery ? 'No edit snapshots match this search. ' : 'No edit snapshots recorded for this project yet. '
        : '';
      return `${visible.filter(row => row.id !== MORE_ID).length} shown of ${page?.matches ?? 0} snapshots${page?.next ? '; more pages available' : ''}${page?.unavailable ? `; ${page.unavailable} unavailable records or edits` : ''}. ${empty}Selection creates a preview draft.`;
    },
    multiple: true,
    async load(signal): Promise<readonly Option[]> {
      const listing = await readPage(undefined, continuation?.query ? undefined : continuation?.after, signal);
      if (closed) throw new Error('Snapshot picker is closed.');
      selection.check(); signal?.throwIfAborted();
      base = listing;
      return pending || query ? catalogueRows(listing) : accept(listing);
    },
    onSearchChange(filter) { if (closed) return; generation++; pending = true; searchQuery = filter; },
    onSearchClear() {
      if (closed) return undefined;
      generation++; pending = false; searchQuery = '';
      return base ? accept(base) : undefined;
    },
    async search(filter, signal) {
      if (closed) throw new Error('Snapshot picker is closed.');
      const token = ++generation;
      pending = true; searchQuery = filter;
      const listing = await readPage(filter, continuation?.query === filter ? continuation.after : undefined, signal);
      if (token !== generation) throw new Error('Snapshot search changed.');
      selection.check(); signal?.throwIfAborted();
      pending = false;
      return accept(listing, filter);
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (closed) return undefined;
      try { selection.check(); }
      catch { release(); return { note: 'The snapshot opening is unavailable or its owner changed. Reopen /restore.' }; }
      if (pending) return { note: 'Snapshot search is incomplete; wait or reopen /restore before choosing a record.' };
      if (ids.includes(MORE_ID)) {
        if (ids.length !== 1) return { note: 'Choose snapshots or another page separately; nothing was restored.' };
        if (!page?.next) return undefined;
        const next = snapshotPicker(workspaceRoot, { after: page.next, query }, selection);
        release(); return { next };
      }
      const selected = new Set(ids);
      const chosen = offered.filter((record) => selected.has(identity(record)));
      if (chosen.length === 0) return { note: "Nothing selected, so nothing will be restored." };
      if (chosen.length !== selected.size || chosen.some(record => !canPreview(record))) {
        return { note: 'The snapshot selection is unavailable; reopen /restore before previewing.' };
      }
      const authority = chosen[0]!.authorityId;
      const mixed = chosen.some((record) => record.authorityId !== authority);
      if (mixed) {
        return {
          note: "Those records come from different edits. Restore one edit at a time so the preview can tell you what it would overwrite.",
        };
      }
      release();
      const current = await listRecoveryAuthorityRecords({
        ledgerRoot: chosen[0]!.ledgerRoot, authorityId: authority,
        recordIds: chosen.map(record => record.recordId),
        readAccess: selection,
      });
      selection.check();
      const currentById = new Map(current.records.map(record => [record.recordId, record]));
      if (current.status !== 'listed' || current.missingRecords.length || chosen.some(record => {
        const latest = currentById.get(record.recordId);
        return !latest || JSON.stringify({ ...latest, ledgerRoot: record.ledgerRoot }) !== JSON.stringify(record);
      })) {
        return { note: 'Selected snapshots changed or became unreadable; reopen /restore before previewing.' };
      }
      const records = chosen.map((record) => record.recordId).join(",");
      return {
        draft: `/restore preview --ledger-root ${quoteCompletion(chosen[0]!.ledgerRoot, '')} --workspace-root ${quoteCompletion(workspaceRoot, '')} --authority-id=${authority} --record=${records}`,
      };
    },
    previewEnd: release,
  };
}

function catalogueRows(page: RecoveryCatalogPage, filter?: string): readonly Option[] {
  const rows = page.records.map<Option>((record) => ({
    id: identity(record), label: record.workspaceRelativePath,
    detail: `${record.operationKind} · was ${record.beforeState} · ${age(record.createdAt)}`,
    searchText: `${record.authorityId} ${record.recordId}`,
    note: canPreview(record) ? 'restorable' : 'no content', disabled: !canPreview(record),
  }));
  if (page.next) rows.push({ id: MORE_ID, label: 'More snapshots', detail: 'Continue to the next page', searchText: filter });
  return rows;
}

function identity(record: RecoveryAuthorityRecordIndexEntry): string {
  return `${record.authorityId}:${record.recordId}`;
}

function canPreview(record: RecoveryAuthorityRecordIndexEntry): boolean {
  return record.beforeState === 'absent' || record.hasContentBlob;
}

/** How long ago a record was captured, in the coarsest unit that still says it. */
function age(createdAt: string): string {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return createdAt;
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 36 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
