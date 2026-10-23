import type { Picker, PickerOutcome } from '../overlay.js';
import type { UndoPreview } from '../../../edit/recovery/operation/preview.js';
import { executeUndo, prepareUndo, type UndoHost } from '../../../edit/recovery/undo/service.js';
import { undoPreviewReport, undoResultReport } from '../../../edit/recovery/undo/report.js';
import { bindUndoHost, type UndoPickerHost } from './undo/state.js';
import { undoHistoryPicker } from './undo/history.js';

export function undoPicker(originalHost: UndoHost, admission?: () => string | undefined): Picker {
  const host = bindUndoHost(originalHost, admission);
  let preview: UndoPreview | undefined;
  let closed = false;
  let loaded = false;
  const release = (): void => { closed = true; preview = undefined; };
  let note = 'Loading the current session’s latest file operation.';
  return {
    isCurrent: host.isCurrent,
    title: 'Undo files', form: 'modal', exclusive: true, holdInput: true, initialSelection: 'cancel', filterable: false,
    empty: 'No recorded file operation.', loadError: 'The current file operation could not be verified.', status: () => note,
    async load(signal) {
      signal?.throwIfAborted();
      if (closed) throw new Error('Undo picker is closed.');
      try {
        host.context();
        if (host.busy?.()) { preview = undefined; note = 'Wait for the current run to finish.'; }
        else {
          const selected = await prepareUndo(host.context(), signal);
          signal?.throwIfAborted();
          if (closed) throw new Error('Undo picker is closed.');
          host.context(); preview = selected.preview; note = selected.note;
        }
      } catch (error) { release(); throw error; }
      loaded = true;
      return [{ id: 'cancel', label: 'Close' }, ...(preview ? [{ id: 'review', label: 'Review latest file operation',
        detail: `${preview.receipt.operationId} · ${preview.files.length} files · write ${preview.receipt.status} · undo ${preview.receipt.undo}` }] : []),
      { id: 'history', label: 'View saved results', detail: 'Current session and workspace only; no files are changed' }];
    },
    async apply(ids): Promise<PickerOutcome | undefined> {
      if (closed || !loaded || ids.length !== 1) return undefined;
      if (ids[0] !== 'cancel' && ids[0] !== 'history' && (ids[0] !== 'review' || !preview)) return undefined;
      const selected = preview;
      release();
      if (ids[0] === 'cancel') return undefined;
      host.context();
      if (ids[0] === 'history') return { next: undoHistoryPicker(host) };
      return { report: undoPreviewReport(selected!), next: confirmationPicker(host, selected!) };
    },
    previewEnd: release,
  };
}

function confirmationPicker(host: UndoPickerHost, preview: UndoPreview): Picker {
  let offered: UndoPreview | undefined = preview;
  let loaded = false;
  const release = (): void => { offered = undefined; };
  return {
    isCurrent: host.isCurrent,
    title: 'Confirm file undo', form: 'modal', exclusive: true, holdInput: true, initialSelection: 'cancel', filterable: false,
    empty: '', footer: 'Only Restore writes files. The approval is bound to this exact preview.',
    async load(signal) {
      signal?.throwIfAborted();
      if (!offered) throw new Error('Undo confirmation is closed.');
      host.context(); loaded = true;
      return [{ id: 'cancel', label: 'Cancel' }, { id: 'review', label: 'Review the complete preview again' },
        { id: 'restore', label: 'Restore this operation', detail: `${offered.files.length} files · ${offered.receipt.operationId}`,
          disabled: !offered.canRestore, note: offered.canRestore ? 'explicit confirmation' : 'blocked; inspect saved results' }];
    },
    async apply(ids) {
      if (!offered || !loaded || ids.length !== 1 || !['cancel', 'review', 'restore'].includes(ids[0]!)) return undefined;
      const selected = offered;
      release();
      if (ids[0] === 'cancel') return undefined;
      if (ids[0] === 'review') { host.context(); return { report: undoPreviewReport(selected), next: confirmationPicker(host, selected) }; }
      const { result, warning } = await executeUndo(host, selected, true);
      return { report: undoResultReport(result, selected.receipt, warning) };
    },
    previewEnd: release,
  };
}
