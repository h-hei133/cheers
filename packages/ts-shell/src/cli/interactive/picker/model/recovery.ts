import type { CatalogProvider } from '../../../../core/models/catalog.js';
import { effortCapability } from '../../../../core/models/capability.js';
import { THINKING_LEVELS, type ThinkingPreference } from '../../../../core/models/effort.js';
import type { SessionModelTarget } from '../../../../session/model/contract.js';
import type { Picker } from '../../overlay.js';

interface EffortSelection {
  readonly target: SessionModelTarget;
  readonly current: ThinkingPreference;
  readonly catalog: readonly CatalogProvider[];
  readonly baseUrl?: string;
  readonly lines: readonly string[];
  readonly admission: () => string | undefined;
  readonly save: (effort: ThinkingPreference, stillOwned?: () => boolean) => Promise<string>;
  readonly back: (notice?: string) => Picker;
  readonly canReturn?: () => boolean;
  readonly done: (notice: string) => Picker;
}

/** Choose a prospective model's effort before committing both through its original transaction. */
export function modelEffortPicker(selection: EffortSelection): Picker {
  let offered = false, retired = false;
  const ownsAction = (stillOwned?: () => boolean): boolean => {
    if (!offered || retired) return false;
    if (stillOwned && !stillOwned()) { offered = false; retired = true; }
    return offered && !retired;
  };
  const choices = [null, ...THINKING_LEVELS].map(effort => ({ effort,
    capability: effortCapability(selection.catalog, selection.target.provider, selection.target.model, effort, selection.baseUrl) }));
  return {
    title: `Use ${selection.target.model}`, form: 'panel', filterable: false, empty: '', exclusive: true, holdInput: true,
    acceptsOwnership: true,
    initialSelection: selection.current ?? 'auto', back: selection.back,
    detail: () => selection.lines,
    footer: 'Enter uses this model and effort for the current session · Esc returns',
    previewEnd: () => { offered = false; retired = true; },
    async load() {
      if (retired) return [];
      offered = true;
      return choices.map(({ effort, capability }) => ({ id: effort ?? 'auto', label: effort ?? 'auto (provider decides)',
        note: `${capability}${effort === selection.current ? ' · current preference' : ''}`,
        ...(capability === 'unsupported' ? { disabled: true, ...(effort === selection.current ? { focusable: true } : {}) } : {}) }));
    },
    async apply(ids, stillOwned) {
      if (ids.length !== 1 || !ownsAction(stillOwned)) return undefined;
      const selected = choices.find(choice => (choice.effort ?? 'auto') === ids[0] && choice.capability !== 'unsupported');
      if (!selected) return undefined;
      const refusal = selection.admission();
      if (!ownsAction(stillOwned)) return undefined;
      if (refusal) {
        let returning = false;
        try { returning = selection.canReturn?.() === true; } catch { /* Preserve the refusal without reopening an unverified browser. */ }
        if (!ownsAction(stillOwned)) return undefined;
        offered = false; retired = true;
        return { note: refusal, ...(returning ? { next: selection.back(refusal) } : {}) };
      }
      offered = false; retired = true;
      const note = await selection.save(selected.effort, stillOwned);
      // The transaction's result remains true even if its accepted host has since closed.
      return { note, ...(!stillOwned || stillOwned() ? { next: selection.done(note) } : {}) };
    },
  };
}
