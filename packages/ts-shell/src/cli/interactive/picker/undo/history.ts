import type { Picker } from '../../overlay.js';
import { readUndoHistoryPageAsync } from '../../../../edit/recovery/undo/service.js';
import type { UndoHistoryPage } from '../../../../edit/recovery/undo/history.js';
import { undoNotice, undoStatusReport } from '../../../../edit/recovery/undo/report.js';
import type { UndoPickerHost } from './state.js';

export function undoHistoryPicker(host: UndoPickerHost, cursor?: string): Picker {
  let page: UndoHistoryPage | undefined;
  let closed = false;
  let generation = 0;
  const moreId = 'more:results';
  const release = (): void => { closed = true; generation++; page = undefined; };
  return { isCurrent: host.isCurrent, title: 'Saved file operation results', form: 'modal', exclusive: true, holdInput: true,
    filterable: false,
    empty: 'No recorded operations belong to this session and workspace.', loadError: 'Saved operation results could not be verified. Reopen /undo.',
    status: () => !page ? 'Loading saved operation results.' : `Operations ${page.total === 0 ? '0' : `${page.offset + 1}-${page.offset + page.receipts.length}`} of ${page.total}${page.nextCursor ? '; more available' : '; end of saved results'}`,
    async load(signal) {
      signal?.throwIfAborted();
      if (closed) throw new Error('Undo picker is closed.');
      const epoch = ++generation;
      page = undefined;
      try {
        const next = await readUndoHistoryPageAsync(host.context(), cursor, signal);
        signal?.throwIfAborted();
        if (closed || epoch !== generation) throw new Error('Undo picker is closed or its load was replaced.');
        host.context();
        if (!next) throw new Error('Saved operation results changed.');
        page = next;
        return [...page.receipts.map(receipt => ({ id: receipt.operationId, label: receipt.operationId,
          detail: `${receipt.files.length} files · write ${receipt.status} · undo ${receipt.undo}` })),
        ...(page.nextCursor ? [{ id: moreId, label: 'More saved results', detail: 'Continue to older operations' }] : [])];
      } catch (error) { if (epoch === generation) release(); throw error; }
    },
    async apply(ids) {
      if (closed || ids.length !== 1 || !page) return undefined;
      const selected = page.receipts.find(receipt => receipt.operationId === ids[0]);
      if (!selected && (ids[0] !== moreId || !page.nextCursor)) return undefined;
      const offered = page;
      release();
      try {
        const current = await readUndoHistoryPageAsync(host.context(), cursor);
        host.context();
        if (!current || current.revision !== offered.revision) return { report: undoNotice('Saved operation results changed. Reopen /undo.', 'stale') };
        if (ids[0] === moreId) return { next: undoHistoryPicker(host, offered.nextCursor) };
        return { report: undoStatusReport([selected!]) };
      } catch { return { report: undoNotice('Saved operation results could not be verified.') }; }
    },
    previewEnd: release,
  };
}
