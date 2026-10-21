import {
  listRecoveryAuthorityNamespaces,
  listRecoveryAuthorityRecords,
  type RecoveryAuthorityRecordIndexEntry,
} from "../../../edit/recovery/recoveryAuthorityIndex.js";
import { snapshotRoot } from "../../../edit/recovery/root.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { quoteCompletion } from '../completion.js';

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

export function restorePicker(workspaceRoot: string): Picker {
  let offered: LedgerRecord[] = [];
  let unavailable = 0;
  return {
    title: "Restore a snapshot",
    holdInput: true,
    form: "panel",
    empty: "No edit snapshots recorded for this project yet.",
    loadError: 'Edit snapshots could not be read. Check the project ledger before retrying.',
    status(visible) {
      return `${visible.length} of ${offered.length} snapshots${unavailable ? `; ${unavailable} unavailable records or edits` : ''}. Selection creates a preview draft.`;
    },
    multiple: true,
    async load(signal): Promise<readonly Option[]> {
      const listing = await readLedger(workspaceRoot, signal);
      offered = listing.records;
      unavailable = listing.unavailable;
      return offered.map<Option>((record) => ({
        id: identity(record),
        label: record.workspaceRelativePath,
        detail: `${record.operationKind} · was ${record.beforeState} · ${age(record.createdAt)}`,
        searchText: `${record.authorityId} ${record.recordId}`,
        note: canPreview(record) ? "restorable" : "no content",
        disabled: !canPreview(record),
      }));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
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
      const current = await listRecoveryAuthorityRecords({
        ledgerRoot: chosen[0]!.ledgerRoot, authorityId: authority,
        recordIds: chosen.map(record => record.recordId),
      });
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
  };
}

/** Every record in the project's ledger, newest first. */
async function readLedger(workspaceRoot: string, signal?: AbortSignal): Promise<{ records: LedgerRecord[]; unavailable: number }> {
  signal?.throwIfAborted();
  const ledgerRoot = snapshotRoot(workspaceRoot);
  const namespaces = await listRecoveryAuthorityNamespaces({ ledgerRoot });
  signal?.throwIfAborted();
  if (namespaces.status !== "listed") {
    if (namespaces.blockedReason === 'namespace-not-found') return { records: [], unavailable: 0 };
    throw new Error('Edit snapshots could not be read.');
  }
  const records: LedgerRecord[] = [];
  let unavailable = 0;
  for (const authorityId of namespaces.authorityIds) {
    const listed = await listRecoveryAuthorityRecords({ ledgerRoot, authorityId, signal });
    if (listed.status !== "listed") { unavailable++; continue; }
    unavailable += listed.missingRecords.length;
    for (const record of listed.records) records.push({ ...record, ledgerRoot });
  }
  signal?.throwIfAborted();
  if (!records.length && unavailable) throw new Error('No snapshot records could be read.');
  records.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || identity(left).localeCompare(identity(right)));
  return { records, unavailable };
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
