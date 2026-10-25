import type { Picker } from '../../overlay.js';

/** Inspection has no activation path; configuration is an explicit command draft. */
export function modelDetailsPicker(label: string, lines: readonly string[], back: () => Picker, draft?: string): Picker {
  let offered = false;
  return {
    title: label, form: 'panel', empty: '', filterable: false,
    back,
    detail: () => lines,
    footer: 'Enter reviews the next step · Esc returns',
    async load() {
      offered = true;
      return [{ id: 'back', label: 'Back to models' },
        ...(draft ? [{ id: 'configure', label: 'Configure connection', detail: 'Prepare a login command for this exact model.' }] : [])];
    },
    async apply(ids) {
      if (!offered || ids.length !== 1) return undefined;
      return ids[0] === 'back' ? { next: back() } : ids[0] === 'configure' && draft ? { draft } : undefined;
    },
  };
}
