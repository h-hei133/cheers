import type { Picker } from '../../overlay.js';
import type { RoleResult } from '../../../../core/commands/model/role.js';
import type { ThinkingPreference } from '../../../../core/models/effort.js';
import type { SessionModelRole } from '../../../../session/model/contract.js';

/** Edit the captured role, with no route through the default model's thinking command. */
export function modelRoleThinkingPicker(current: SessionModelRole, efforts: readonly ThinkingPreference[],
  assign: (effort: ThinkingPreference) => RoleResult, back: (notice?: string) => Picker): Picker {
  let offered = false;
  return {
    title: 'Role thinking effort', form: 'panel', filterable: false, empty: 'No reasoning settings are available.',
    initialSelection: current.thinkingEffort ?? 'auto', back,
    detail: () => [`${current.provider}/${current.model} · ${current.connectionId}`],
    footer: 'Enter saves for this role · Esc returns',
    async load() {
      offered = true;
      return efforts.map(effort => ({ id: effort ?? 'auto', label: effort ?? 'auto (provider decides)',
        ...((current.thinkingEffort ?? null) === effort ? { note: 'active' } : {}) }));
    },
    async apply(ids) {
      if (!offered || ids.length !== 1) return undefined;
      const effort = efforts.find(value => (value ?? 'auto') === ids[0]);
      if (effort === undefined) return undefined;
      const result = assign(effort);
      return { note: result.output, ...(result.saved ? { next: back(result.output) } : {}) };
    },
  };
}
