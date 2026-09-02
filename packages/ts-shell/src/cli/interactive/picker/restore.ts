import {
  listRecoveryAuthorityNamespaces,
  listRecoveryAuthorityRecords,
  type RecoveryAuthorityRecordIndexEntry,
} from "../../../orchestration/patchRecovery/recoveryAuthorityIndex.js";
import { defaultLedgerRoot } from "../../../core/commands/restoreCommandRuntime.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/**
 * Snapshot chooser for restoring an edit.
 *
 * The ledger holds one record per file an edit touched, and restoring the wrong
 * one silently reverts work — so the choice is made against the recorded paths
 * and times rather than against ids the user has to copy out of a wall of text.
 *
 * Choosing does not restore. The picker hands back the exact explicit-execute
 * command with the chosen records already in it, because a write to the working
 * tree stays something the user asks for in as many words.
 */

/** Records offered before the list is truncated. */
const MAX_RECORDS = 40;

interface LedgerRecord extends RecoveryAuthorityRecordIndexEntry {
  readonly ledgerRoot: string;
}

export function restorePicker(workspaceRoot: string): Picker {
  let offered: LedgerRecord[] = [];
  return {
    title: "Restore a snapshot",
    form: "panel",
    empty: "No edit snapshots recorded for this project yet.",
    multiple: true,
    async load(): Promise<readonly Option[]> {
      offered = await readLedger(workspaceRoot);
      return offered.map<Option>((record) => ({
        id: record.recordId,
        label: record.workspaceRelativePath,
        detail: `${record.operationKind} · was ${record.beforeState} · ${age(record.createdAt)}`,
        note: record.hasContentBlob ? "restorable" : "no content",
        disabled: !record.hasContentBlob,
      }));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const chosen = offered.filter((record) => ids.includes(record.recordId));
      if (chosen.length === 0) return { note: "Nothing selected, so nothing will be restored." };
      const authority = chosen[0]!.authorityId;
      const mixed = chosen.some((record) => record.authorityId !== authority);
      if (mixed) {
        return {
          note: "Those records come from different edits. Restore one edit at a time so the preview can tell you what it would overwrite.",
        };
      }
      const records = chosen.map((record) => record.recordId).join(",");
      return {
        draft: `/restore preview --ledger-root ${chosen[0]!.ledgerRoot} --authority ${authority} --records ${records}`,
      };
    },
  };
}

/** Every record in the project's ledger, newest first. */
async function readLedger(workspaceRoot: string): Promise<LedgerRecord[]> {
  const ledgerRoot = defaultLedgerRoot(workspaceRoot);
  const namespaces = await listRecoveryAuthorityNamespaces({ ledgerRoot });
  if (namespaces.status !== "listed") return [];
  const records: LedgerRecord[] = [];
  for (const authorityId of namespaces.authorityIds) {
    const listed = await listRecoveryAuthorityRecords({ ledgerRoot, authorityId });
    if (listed.status !== "listed") continue;
    for (const record of listed.records) records.push({ ...record, ledgerRoot });
  }
  records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return records.slice(0, MAX_RECORDS);
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
