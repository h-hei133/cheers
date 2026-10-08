import type { Picker, PickerOutcome } from '../../overlay.js';
import type { PickerHost } from '../registry.js';
import type { ShellActionResult } from '../../../../core/commands/types.js';
import { prepareSessionManagement, applySessionManagement, invalidSessionTitle, type SessionManagementPreview } from '../../../../session/lifecycle/management.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';

/** Direct commands use the same overlay and lifecycle owner as the session list. */
export function sessionManagementPicker(host: Pick<PickerHost, 'sessionManager' | 'sessionContext'>, action: ShellActionResult): Picker {
  let preview: SessionManagementPreview | undefined;
  let note: string | undefined;
  const operation = action.sessionOperation!;
  const apply = async (title?: string): Promise<PickerOutcome> => {
    if (!preview) return { note: note ?? 'The saved session is unavailable. No action was started.' };
    return { note: applySessionManagement(host.sessionManager, host.sessionContext, preview, title).note };
  };
  return {
    title: operation === 'delete' ? 'Delete saved session' : 'Rename saved session', form: 'modal', exclusive: true, holdInput: true,
    empty: 'No session action is available.', loadError: 'The saved session could not be checked.', filterable: false,
    initialSelection: 'cancel',
    status: () => note,
    async load(signal) {
      if (action.sessionTitle !== undefined && invalidSessionTitle(action.sessionTitle)) {
        preview = undefined; note = invalidSessionTitle(action.sessionTitle);
        return [{ id: 'cancel', label: 'Close' }];
      }
      const result = await prepareSessionManagement(host.sessionManager, host.sessionContext, operation, action.sessionId, signal);
      signal?.throwIfAborted();
      preview = result.preview; note = result.note;
      if (!preview) return [{ id: 'cancel', label: 'Close' }];
      return [{ id: 'cancel', label: 'Cancel', detail: 'Keep the saved session unchanged' },
        { id: 'apply', label: operation === 'delete' ? 'Permanently delete this session' : 'Edit session title',
          detail: `${preview.session.id} · ${stripAnsi(preview.session.title || '(untitled)').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')}${action.sessionTitle ? ` → ${action.sessionTitle}` : ''}` }];
    },
    async apply(ids) {
      if (!ids.includes('apply') || !preview) return undefined;
      if (operation === 'delete' || action.sessionTitle !== undefined) return apply(action.sessionTitle);
      return { next: { title: `Rename ${preview.session.id}`, form: 'modal', empty: '', exclusive: true, holdInput: true,
        input: { label: 'Session title', initial: preview.session.title ?? '', validate: invalidSessionTitle, apply },
        load: async () => [], apply: async () => undefined } };
    },
  };
}
