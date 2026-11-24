import { neutraliseForDisplay } from '../../../core/text/safety.js';
import type { ThemePreferences } from '../../../presentation/theme/preview.js';
import type { Picker } from '../overlay.js';
import { settingPreview } from './preview.js';

/** Choose the current session's palette using the same preview lease as Settings. */
export function themePicker(themes: ThemePreferences, admission?: () => string | undefined): Picker {
  const selected = themes.selected();
  const revision = themes.revision();
  const preview = settingPreview({ themes }, 'theme')!;
  let offered: readonly string[] = [];
  let retired = false;
  let previewUnavailable = false;
  return {
    get title() { return previewUnavailable ? 'Theme — Preview unavailable' : 'Theme'; },
    form: 'panel',
    empty: 'No themes available.',
    initialSelection: selected,
    acceptsOwnership: true,
    async load() {
      if (retired) return [];
      offered = themes.names();
      return offered.map(name => ({ id: name, label: neutraliseForDisplay(name), ...(name === selected ? { note: 'in use' } : {}) }));
    },
    previewChange(ids) {
      const [name] = ids;
      if (retired) return;
      try { previewUnavailable = !preview.show(name ?? selected); }
      catch { previewUnavailable = true; }
    },
    previewEnd() { retired = true; preview.end(); },
    async apply(ids, stillOwned = () => true) {
      if (retired) return undefined;
      retired = true;
      preview.end();
      const [name] = ids;
      if (!stillOwned() || ids.length !== 1 || name === undefined || !offered.includes(name)) return undefined;
      const refusal = admission?.();
      if (refusal) return { note: refusal };
      try {
        if (themes.selectForSession(name, revision)) return { note: `Theme set to ${neutraliseForDisplay(name)} for this session.` };
        return { note: 'Theme changed. Reopen /theme to choose again.' };
      } catch {
        return { note: 'The theme change could not be confirmed.' };
      }
    },
  };
}
