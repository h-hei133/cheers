import type { Picker, PickerOutcome } from '../../overlay.js';

/** Inspection offers explicit credential entry or a command draft before activation. */
export function modelDetailsPicker(label: string, lines: readonly string[], back: () => Picker, draft?: string, signIn?: () => Picker, key?: () => Picker,
  connection?: () => PickerOutcome | undefined): Picker {
  let offered = false;
  return {
    title: label, form: 'panel', empty: '', filterable: false,
    back,
    detail: () => lines,
    footer: 'Enter reviews the next step · Esc returns',
    async load() {
      offered = true;
      return [{ id: 'back', label: 'Back to models' },
        ...(connection ? [{ id: 'connection', label: 'Connection details' }] : []),
        ...(signIn ? [{ id: 'account', label: 'Account sign-in' }] : []),
        ...(key || draft ? [{ id: 'configure', label: 'Configure connection', ...(key ? {} : { detail: 'Prepare a login command for this exact model.' }) }] : [])];
    },
    async apply(ids) {
      if (!offered || ids.length !== 1) return undefined;
      return ids[0] === 'back' ? { next: back() } : ids[0] === 'account' && signIn ? { next: signIn() }
        : ids[0] === 'connection' && connection ? connection()
        : ids[0] === 'configure' && key ? { next: key() } : ids[0] === 'configure' && draft ? { draft } : undefined;
    },
  };
}
