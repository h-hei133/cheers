import type { Picker } from '../../overlay.js';
import type { RoleResult } from '../../../../core/commands/model/role.js';
import type { ThinkingPreference } from '../../../../core/models/effort.js';
import type { SessionModelRole } from '../../../../session/model/contract.js';

/** Edit the captured role, with no route through the default model's thinking command. */
export function modelRoleThinkingPicker(current: SessionModelRole, efforts: readonly ThinkingPreference[],
  assign: (effort: ThinkingPreference) => RoleResult, back: (notice?: string) => Picker,
  admission?: () => string | undefined): Picker {
  let offered = false, retired = false;
  const active = current.thinkingEffort ?? null;
  const choices = efforts.includes(active) ? efforts : [...efforts, active];
  return {
    title: 'Role thinking effort', form: 'panel', filterable: false, empty: 'No reasoning settings are available.',
    initialSelection: current.thinkingEffort ?? 'auto', back,
    previewEnd: () => { offered = false; retired = true; },
    detail: () => [`${current.provider}/${current.model} · ${current.connectionId}`],
    footer: 'Enter saves for this role · Esc returns',
    async load() {
      if (retired) return [];
      offered = true;
      return choices.map(effort => ({ id: effort ?? 'auto', label: effort ?? 'auto (provider decides)',
        ...(effort === active ? { note: efforts.includes(effort) ? 'active' : 'active · unavailable' } : {}),
        ...(!efforts.includes(effort) ? { disabled: true, focusable: true } : {}) }));
    },
    async apply(ids) {
      if (!offered || retired || ids.length !== 1) return undefined;
      const effort = efforts.find(value => (value ?? 'auto') === ids[0]);
      if (effort === undefined) return undefined;
      const refusal = admission?.();
      if (refusal) return { note: refusal };
      if (!offered || retired) return undefined;
      offered = false; retired = true;
      const result = assign(effort);
      return { note: result.output, next: back(result.output) };
    },
  };
}
