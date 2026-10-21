import type { Picker, PickerOutcome } from '../overlay.js';
import type { UndoPreview } from '../../../edit/recovery/operation/preview.js';
import { executeUndo, prepareUndo, readUndoHistoryPage, type UndoHost } from '../../../edit/recovery/undo/service.js';
import type { UndoHistoryPage } from '../../../edit/recovery/undo/history.js';
import { undoNotice, undoPreviewReport, undoResultReport, undoStatusReport } from '../../../edit/recovery/undo/report.js';

export function undoPicker(host: UndoHost): Picker {
  let preview: UndoPreview | undefined;
  let note = 'Loading the current session’s latest file operation.';
  return {
    title: 'Undo files', form: 'modal', exclusive: true, holdInput: true, initialSelection: 'cancel', filterable: false,
    empty: 'No recorded file operation.', loadError: 'The current file operation could not be verified.', status: () => note,
    async load(signal) {
      if (host.busy?.()) { preview = undefined; note = 'Wait for the current run to finish.'; }
      else { const selected = await prepareUndo(host.context(), signal); preview = selected.preview; note = selected.note; }
      return [{ id: 'cancel', label: 'Close' }, ...(preview ? [{ id: 'review', label: 'Review latest file operation',
        detail: `${preview.receipt.operationId} · ${preview.files.length} files · write ${preview.receipt.status} · undo ${preview.receipt.undo}` }] : []),
      { id: 'history', label: 'View saved results', detail: 'Current session and workspace only; no files are changed' }];
    },
    async apply(ids): Promise<PickerOutcome | undefined> {
      if (ids[0] === 'history') return { next: historyPicker(host) };
      if (ids[0] !== 'review' || !preview) return undefined;
      return { report: undoPreviewReport(preview), next: confirmationPicker(host, preview) };
    },
  };
}

function confirmationPicker(host: UndoHost, preview: UndoPreview): Picker {
  return {
    title: 'Confirm file undo', form: 'modal', exclusive: true, holdInput: true, initialSelection: 'cancel', filterable: false,
    empty: '', footer: 'Only Restore writes files. The approval is bound to this exact preview.',
    load: async () => [{ id: 'cancel', label: 'Cancel' }, { id: 'review', label: 'Review the complete preview again' },
      { id: 'restore', label: 'Restore this operation', detail: `${preview.files.length} files · ${preview.receipt.operationId}`,
        disabled: !preview.canRestore, note: preview.canRestore ? 'explicit confirmation' : 'blocked; inspect saved results' }],
    async apply(ids) {
      if (ids[0] === 'review') return { report: undoPreviewReport(preview), next: confirmationPicker(host, preview) };
      if (ids[0] !== 'restore') return undefined;
      const { result, warning } = await executeUndo(host, preview, true);
      return { report: undoResultReport(result, preview.receipt, warning) };
    },
  };
}

function historyPicker(host: UndoHost, cursor?: string): Picker {
  let page: UndoHistoryPage | undefined;
  // The receipt identity grammar excludes colons.
  const moreId = 'more:results';
  return { title: 'Saved file operation results', form: 'modal', exclusive: true, holdInput: true,
    filterable: false,
    empty: 'No recorded operations belong to this session and workspace.', loadError: 'Saved operation results could not be verified. Reopen /undo.',
    status: () => !page ? 'Loading saved operation results.' : `Operations ${page.total === 0 ? '0' : `${page.offset + 1}-${page.offset + page.receipts.length}`} of ${page.total}${page.nextCursor ? '; more available' : '; end of saved results'}`,
    async load(signal) {
      signal?.throwIfAborted(); page = readUndoHistoryPage(host.context(), cursor); signal?.throwIfAborted();
      if (!page) throw new Error('Saved operation results changed.');
      return [...page.receipts.map(receipt => ({ id: receipt.operationId, label: receipt.operationId,
        detail: `${receipt.files.length} files · write ${receipt.status} · undo ${receipt.undo}` })),
      ...(page.nextCursor ? [{ id: moreId, label: 'More saved results', detail: 'Continue to older operations' }] : [])];
    },
    async apply(ids) {
      if (ids.length !== 1 || !page) return undefined;
      try {
        const current = readUndoHistoryPage(host.context(), cursor);
        if (!current || current.revision !== page.revision) return { report: undoNotice('Saved operation results changed. Reopen /undo.', 'stale') };
        if (ids[0] === moreId) return page.nextCursor ? { next: historyPicker(host, page.nextCursor) } : undefined;
        const selected = page.receipts.filter(receipt => receipt.operationId === ids[0]);
        return selected.length ? { report: undoStatusReport(selected) } : undefined;
      } catch { return { report: undoNotice('Saved operation results could not be verified.') }; }
    },
  };
}
