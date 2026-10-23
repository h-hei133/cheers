import { undoScope, type UndoHost } from '../../../../edit/recovery/undo/service.js';

export interface UndoPickerHost extends UndoHost { isCurrent(): boolean }

/** Every page and confirmation stays with the admission and scope that opened it. */
export function bindUndoHost(host: UndoHost, surfaceAdmission?: () => string | undefined): UndoPickerHost {
  let scope: string | undefined;
  let admission: (() => string | undefined) | undefined;
  try {
    if (surfaceAdmission?.()) throw new Error('Undo surface is unavailable.');
    const context = host.context();
    admission = context.admission;
    scope = JSON.stringify(undoScope(context));
  } catch { /* The load path reports unavailable; a later valid scope cannot adopt this opening. */ }
  const context = () => {
      if (!scope || surfaceAdmission?.() || admission?.()) throw new Error('Undo opening is unavailable.');
      const context = host.context();
      if (JSON.stringify(undoScope(context)) !== scope) throw new Error('Undo context changed.');
      return context;
  };
  return {
    isCurrent() {
      try { return scope !== undefined && JSON.stringify(undoScope({ ...host.context(), admission: undefined })) === scope; }
      catch { return false; }
    },
    context() {
      const current = context();
      return { ...current, admission: () => {
        try { context(); return undefined; }
        catch { return 'Undo context changed. Reopen /undo.'; }
      } };
    },
    busy: () => host.busy?.() ?? false,
    publish: (result, receipt) => host.publish?.(result, receipt),
  };
}
