import type { Picker, PickerOutcome } from '../../overlay.js';
import type { PickerHost } from '../registry.js';
import type { ShellActionResult } from '../../../../core/commands/types.js';
import { prepareSessionManagement, applySessionManagement, invalidSessionTitle, type SessionManagementPreview } from '../../../../session/lifecycle/management.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';

/** Direct commands use the same overlay and lifecycle owner as the session list. */
export function sessionManagementPicker(host: Pick<PickerHost, 'sessionManager' | 'sessionContext'> & Partial<Pick<PickerHost, 'commandContext'>>, action: ShellActionResult): Picker {
  let preview: SessionManagementPreview | undefined;
  let note: string | undefined;
  let generation = 0;
  let transferred = false;
  const operation = action.sessionOperation!;
  return {
    title: operation === 'delete' ? 'Delete saved session' : 'Rename saved session', form: 'modal', exclusive: true, holdInput: true,
    empty: 'No session action is available.', loadError: 'The saved session could not be checked.', filterable: false,
    initialSelection: 'cancel',
    status: () => note,
    async load(signal) {
      const opened = ++generation;
      transferred = false;
      preview = undefined;
      const admission = (): string | undefined => opened !== generation
        ? 'The session action was cancelled. Reopen the saved session action.' : host.commandContext?.admission?.();
      if (action.sessionTitle !== undefined && invalidSessionTitle(action.sessionTitle)) {
        preview = undefined; note = invalidSessionTitle(action.sessionTitle);
        return [{ id: 'cancel', label: 'Close' }];
      }
      const result = await prepareSessionManagement(host.sessionManager, host.sessionContext, operation, action.sessionId, signal, admission);
      signal?.throwIfAborted();
      if (opened !== generation) throw new Error('Session action cancelled.');
      preview = result.preview; note = result.note;
      if (!preview) return [{ id: 'cancel', label: 'Close' }];
      return [{ id: 'cancel', label: 'Cancel', detail: 'Keep the saved session unchanged' },
        { id: 'apply', label: operation === 'delete' ? 'Permanently delete this session' : 'Edit session title',
          detail: `${preview.session.id} · ${stripAnsi(preview.session.title || '(untitled)').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')}${action.sessionTitle ? ` → ${action.sessionTitle}` : ''}` }];
    },
    async apply(ids) {
      if (ids.length !== 1 || ids[0] !== 'apply') { preview = undefined; generation++; return undefined; }
      const offered = preview;
      preview = undefined;
      if (!offered) return { note: 'The saved session action was not offered. Reopen the action.' };
      if (operation === 'delete' || action.sessionTitle !== undefined) {
        return { note: applySessionManagement(host.sessionManager, host.sessionContext, offered, action.sessionTitle).note };
      }
      let pending: SessionManagementPreview | undefined = offered;
      transferred = true;
      return { next: { title: `Rename ${offered.session.id}`, form: 'modal', empty: '', exclusive: true, holdInput: true,
        input: { label: 'Session title', initial: offered.session.title ?? '', validate: invalidSessionTitle,
          apply: async title => {
            const selected = pending;
            pending = undefined;
            if (!selected) return { note: 'The session title editor expired. Reopen the action.' };
            return { note: applySessionManagement(host.sessionManager, host.sessionContext, selected, title).note };
          } },
        previewEnd() { pending = undefined; generation++; },
        load: async () => [], apply: async () => undefined } };
    },
    previewEnd() { preview = undefined; if (!transferred) generation++; },
  };
}
